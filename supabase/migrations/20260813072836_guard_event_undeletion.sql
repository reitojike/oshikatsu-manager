-- 削除済みイベントを復活させる更新を禁止する。
-- deleted_at を NULL から設定する削除ガード(guard_event_deletion)とは責務を分ける。
-- 対象行の旧値・新値だけで判定するため、security definer は不要である。
create function public.guard_event_undeletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'event % cannot be undeleted', new.id;
  end if;
  return new;
end;
$$;

create trigger guard_event_undeletion_trigger
  before update on public.events
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.guard_event_undeletion();
