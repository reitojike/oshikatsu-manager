-- docs/permissions.md の権限マトリクスと docs/data-model.md「RLSポリシー方針」に基づく
-- RLSポリシー。全ポリシーは authenticated ロールのみを対象とする(このアプリはGoogle SSO
-- ログイン前提で、匿名ユーザー向けの公開閲覧機能は無い)。
--
-- 「profiles.is_adminを参照する条件は一切書かない」(docs/permissions.md)とは、is_adminの値を
-- 使って他の操作の許可/拒否を分岐させないという意味。is_adminという列自体を本人の書き換えから
-- 保護するguard_is_admin_immutable()はこれに抵触しない(権限判定ではなく列の保護)。
--
-- Supabase Data APIはauto_expose_new_tables=false(既定)のため、RLSポリシーとは別に
-- 各テーブルへのGRANTが無いとauthenticatedロールからAPI経由で一切操作できない。
-- 本ファイル末尾で全テーブルにGRANTする。

-- 1. profiles (docs/data-model.md「RLSポリシー方針」)
-- SELECTの「全ユーザー(公開カラムは限定)」はRLS(行単位)だけでは表現できないため、
-- テーブル本体は本人のみに限定し、他ユーザーへの公開はpublic_profilesビュー(id/display_nameのみ)
-- 経由に限定する。
alter table public.profiles enable row level security;

create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- is_adminはUPDATE同様、INSERT時も本人がtrueにできないようにする
-- (guard_is_admin_immutableと一貫性を持たせる)。
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and is_admin = false);

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- is_adminは本人のUPDATEでも書き換えられないようにする。参照して分岐を作ってはいないが
-- (docs/permissions.mdの禁止範囲)、書き換え自体を放置すると、拡大期で管理者判定を
-- 実装した瞬間に「今のうちに自分でis_admin=trueにしておいたユーザー」がそのまま
-- 管理者権限を得てしまう。service_role(将来の管理者操作用)はauth.role()で除外する。
create function public.guard_is_admin_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.role() <> 'service_role' then
    raise exception 'is_admin cannot be changed by the profile owner';
  end if;
  return new;
end;
$$;

create trigger guard_is_admin_immutable_trigger
  before update on public.profiles
  for each row execute function public.guard_is_admin_immutable();

-- 他ユーザーに公開してよい列(id, display_name)のみを持つビュー。
-- 所有者(postgres)としてprofilesを参照するため、上記の自分のみSELECT可のRLSに関わらず
-- 全行を返す(profilesテーブル自体への直接アクセスは自分の行のみに制限したまま)。
create view public.profiles_public
  with (security_invoker = false)
  as
  select id, display_name
  from public.profiles;

grant select on public.profiles_public to authenticated;

-- 2. events (docs/data-model.md「RLSポリシー方針」、削除ガードはdocs/data-model.md 2章)
alter table public.events enable row level security;

-- 未削除の全イベントに加えて、削除後もオーナー自身と、その支出(expenses)を持つ
-- ユーザーは引き続き参照できるようにする(docs/data-model.md 5章「eventsは論理削除なので、
-- 支出から辿ってイベント名などは常に参照できる」)。
create policy "events_select_not_deleted_or_referenced" on public.events
  for select to authenticated
  using (
    deleted_at is null
    or owner_id = auth.uid()
    or exists (
      select 1
      from public.expenses e
      where e.event_id = events.id
        and e.user_id = auth.uid()
    )
  );

create policy "events_insert_as_owner" on public.events
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "events_update_owner_only" on public.events
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- イベント削除(論理削除)のガード。オーナー本人以外の参加者が1人でもいる場合、
-- deleted_at をNULLから設定する更新を拒否する。MVPでは例外を設けない(管理者もバイパス不可)。
-- security definerが無いと、内部のEXISTS検査が呼び出し元(削除しようとしているオーナー)の
-- RLS越しに実行され、private参加者の行が見えず「参加者なし」と誤判定してガードが
-- すり抜けてしまう(handle_new_user()と同じ理由でsecurity definerが必要)。
create function public.guard_event_deletion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1
      from public.event_participants ep
      where ep.event_id = new.id
        and ep.user_id <> new.owner_id
    ) then
      raise exception 'event % has participants other than the owner and cannot be deleted', new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_event_deletion_trigger
  before update on public.events
  for each row execute function public.guard_event_deletion();

-- 3. event_participants (docs/data-model.md「RLSポリシー方針」、招待の仕様は3章)
alter table public.event_participants enable row level security;

create policy "event_participants_select_own_or_public" on public.event_participants
  for select to authenticated
  using (user_id = auth.uid() or visibility = 'public');

-- 自分で登録する経路(invited_byなし) と、参加登録済みユーザーによる招待経路
-- (invited_by=自分。招待できるのは参加登録している任意のユーザー)の2通りのみ許可する。
-- 招待経路で作成する他人の行は、招待者が公開設定を勝手に指定できないよう
-- visibility='private'(既定値どおり)、participation_state='joined'
-- (docs/data-model.md 3章「MVPでの挙動」)に固定する。
create policy "event_participants_insert_self_or_invite" on public.event_participants
  for insert to authenticated
  with check (
    (user_id = auth.uid() and invited_by is null)
    or (
      invited_by = auth.uid()
      and visibility = 'private'
      and participation_state = 'joined'
      and exists (
        select 1
        from public.event_participants ep
        where ep.event_id = event_participants.event_id
          and ep.user_id = auth.uid()
      )
    )
  );

create policy "event_participants_update_self" on public.event_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "event_participants_delete_self" on public.event_participants
  for delete to authenticated
  using (user_id = auth.uid());

-- 4. ticket_entries (docs/data-model.md「RLSポリシー方針」。個人スコープ)
alter table public.ticket_entries enable row level security;

create policy "ticket_entries_select_own" on public.ticket_entries
  for select to authenticated
  using (user_id = auth.uid());

create policy "ticket_entries_insert_own" on public.ticket_entries
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "ticket_entries_update_own" on public.ticket_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ticket_entries_delete_own" on public.ticket_entries
  for delete to authenticated
  using (user_id = auth.uid());

-- 5. expenses (docs/data-model.md「RLSポリシー方針」。個人スコープ)
alter table public.expenses enable row level security;

create policy "expenses_select_own" on public.expenses
  for select to authenticated
  using (user_id = auth.uid());

create policy "expenses_insert_own" on public.expenses
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "expenses_update_own" on public.expenses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "expenses_delete_own" on public.expenses
  for delete to authenticated
  using (user_id = auth.uid());

-- 6. budgets (docs/data-model.md「RLSポリシー方針」。個人スコープ)
alter table public.budgets enable row level security;

create policy "budgets_select_own" on public.budgets
  for select to authenticated
  using (user_id = auth.uid());

create policy "budgets_insert_own" on public.budgets
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "budgets_update_own" on public.budgets
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "budgets_delete_own" on public.budgets
  for delete to authenticated
  using (user_id = auth.uid());

-- Data API (PostgREST) 経由のアクセスには、RLSポリシーとは別にテーブル自体へのGRANTが必要
-- (supabase/config.tomlのauto_expose_new_tablesが既定でfalseのため)。
-- 実際の可否はRLSポリシーが絞る。
grant select, insert, update, delete
  on public.profiles, public.events, public.event_participants,
     public.ticket_entries, public.expenses, public.budgets
  to authenticated;
