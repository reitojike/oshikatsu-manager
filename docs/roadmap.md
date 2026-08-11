# 開発計画 (v0.5)

`docs/prd.md` v0.5 のMVPスコープを、実装可能な順序に並べたもの。

## タスク管理

各フェーズのチェックリストはGitHub Issuesとして起票し、Project「イベント管理アプリ 開発」
(`Status` / `Phase` / `Model` フィールド)で進捗を管理する。ラベルは `phase:N` と、
`agent:*` を**いずれか1つ**。既定は `agent:sol` / `agent:terra` / `agent:luna` のいずれか
(Codexが一次担当。プロバイダの振り分けは `docs/model-routing.md`「既定はCodex優先」を参照)。
Claude側で判断する場合のみ `agent:opus` / `agent:sonnet` / `agent:haiku` のいずれかに置き換える。
モデルの使い分けとエスカレーション基準は `AGENTS.md`「タスク管理とモデルの使い分け」を参照。
**Issue 1件の粒度(含める判断の数)とPR差分サイズの目安は、
同節「Issueの粒度と、Issue内でのモデル階層の分担」にある。
その裏付けは `docs/task-management.md`。フェーズのチェックリストをIssueへ落とすときに読む。**

## この順序にした理由

このリポジトリは「人間がdiffを読まない」前提で運用する。したがって**機能を作る順序ではなく、
機械が止められる状態を作る順序**で並べている。原則は3つ。

1. **ゲートを先に置く。**lintとテストの土台がない状態で書いたコードは、後から厳しいルールを
   入れるときに「既存の指摘をゼロにする」作業を生む(`docs/lint-policy.md` の drain→ratchet)。
   新規開発の今なら最初からerrorで入れられる。この機会は一度しかない。
2. **静かに失敗するものを先に固める。**権限とRLSは、漏れても例外が飛ばない。
   UIができてから後付けすると「動いているから」で検証が薄くなる。
3. **判断ロジックをUIより先に確定させる。**Web UIとMCPサーバーは同じ操作の2経路を持つ。
   `common/` を先に作っておけば、後発の経路は「呼ぶだけ」になり、複製が起きる余地が消える。

---

## フェーズ一覧

| # | フェーズ | 主な成果物 | 完了の判定 |
| --- | --- | --- | --- |
| 0 | 足場 | ビルド、lint、テスト、CI | わざと壊すとCIが赤くなる |
| 1 | DBとRLS | マイグレーション、RLSポリシー、生成型 | 権限マトリクスの×が全部弾かれる |
| 2 | `common/` | pure関数6種 + Zodスキーマ | Supabaseなしで全ルールがテスト済み |
| 3 | Web UI(読み) | 一覧、カレンダー、集計表示 | 1+2が実際に繋がる |
| 4 | Web UI(書き) | 登録・編集・削除・招待 | 成功基準のWeb側5項目 |
| 5 | MCPサーバー | stdioサーバー + ツール | PCのClaudeから操作できる |
| 6 | 公開 | PWA manifest、Vercel、keep-alive | 本番で動く |

---

## フェーズ0 — 足場

**目的: この後に書く全てのコードが通る門を先に立てる。**

- [x] mainブランチの保護(Ruleset。PR必須・force push禁止・削除禁止。リポジトリ管理者はバイパス可)
- [ ] Next.js + TypeScript + yarn の初期化
- [ ] ディレクトリ骨格を空で作る (`common/` `app/` `mcp/` `lib/` `test/{unit,component,db}` `supabase/`)
- [ ] tsconfig を `strict` で設定
- [ ] ESLint設定 — `docs/lint-policy.md` の内容をそのまま。**最初から全てerror**
- [ ] Vitest設定 — environment を3つに分ける(`unit`=node / `component`=jsdom / `db`=node)
- [ ] `package.json` にスクリプト登録 (`dev` `lint` `typecheck` `test` `test:db` `gen:types`)
- [ ] GitHub Actions
  - [ ] lint / typecheck
  - [ ] unit test
  - [ ] db test(フェーズ1でSupabaseが入るまでは空で通る)
  - [ ] supabase型検証(`yarn gen:types` して差分があれば失敗)
  - [x] 自動コードレビュー: Claude(`claude-review.yml`)本稼働。実際にPRへ総評+インライン
        コメントを投稿することを確認済み
  - [x] 自動コードレビュー: CodexはCodex CloudのPR自動レビュー(ワークフローファイル・
        APIキーとも不要)を有効化し、実PRでの投稿を確認済み(下記「保留: 外部アカウント待ち」
        参照)。GitHub Actions版(`codex-review.yml`)はIssue #82で削除済み
  - [x] 自動コードレビュー: GitHub Copilotの自動レビュー。Ruleset(`copilot_code_review`)で
        有効化済み。PR作成時・push毎に自動でレビューコメントを投稿することを確認済み
  - [ ] keep-alive(日次。向き先は本番ができるフェーズ6で設定)
- [ ] 各workflowの先頭に「これが何を守っているか」のコメントを書く

**完了条件(壊して確認する):**

- `any` を1つ書く → lintジョブが赤くなる
- アサーションのないテストを1つ書く → `sonarjs/assertions-in-tests` で赤くなる
- 型エラーを1つ入れる → typecheckが赤くなる

赤くなるのを見てから戻す。ここで確認しないと、以降のフェーズは
「ゲートがあるつもり」で進むことになる。

**注意点**

- 型情報を要するルール(`projectService`)はTSプログラムを丸ごと構築するためCIで遅い。
  遅さの原因は構築側なので、ルールを4つに絞っていることを前提に時間を測っておく。
- Supabase CLIのバージョンはローカルとCIで固定する。ずれると生成型の差分検証が
  「マイグレーションを忘れた」ではなく「CLIが違う」で落ちて、誰も信じなくなる。

### 保留: 外部アカウント待ち

コードの問題ではなく、あなたのアカウント側の準備状況に関わるタスクの記録。準備待ちのものだけでなく、
既に完了した実績や、アカウント側の事情で見送り(確定)にした判断も含む。MVPスコープ外ではないので
フェーズ2バックログには入れない。

| タスク | 状態 |
| --- | --- |
| **Claudeレビューをrequired status checkへ配線** | **未完了(POの手作業)。** issue #95 で無投稿検知を実装したが、Rulesetの「Require status checks to pass」に `Claude Review / claude-review` と `PR Template Check / check` を追加するまで、**赤はマージを止めない。「実装した = 効いている」と見なさない。**「Require branches to be up to date before merging」はOFFのまま、`codex-review` は追加しない(workflowごと削除済み)。赤くなる条件は`docs/pr-review-flow-details.md`「Claude Review」を参照 |
| Claudeレビューの本稼働化 | **完了。** `CLAUDE_CODE_OAUTH_TOKEN` シークレット追加 + GitHub App([github.com/apps/claude](https://github.com/apps/claude))インストール済み。PRへの総評+インラインコメント投稿を実PRで確認済み |
| Copilot自動レビューの有効化 | **完了。** Copilot Proに加入し、Rulesetに `copilot_code_review` ルールを追加。実PRでのコメント投稿を確認済み |
| Codexレビュー(GitHub Actions版)の本稼働化 | **見送り(確定)。** `codex-review.yml` はIssue #82で削除済み。**理由: ChatGPT Plus/Codexの利用枠とGitHub Actions側のAPI利用は別系統である。**`openai/codex-action` の実行にはOpenAI PlatformのAPIキー(`OPENAI_API_KEY`)と従量課金が必要で、サブスクリプションでのログインを受け付けない(認証系のinputは `openai-api-key` のみ)。このリポジトリではAPIキーを設定せず、従量課金を採らないとPOが判断した(2026-08-09)。**「まだ決めていない」ではなく「採らないと決めた」である。**なおCodexの視点は、Draft PR作成前のローカルセルフレビュー(#81で全PR必須化)と、下記のCodex Cloud自動レビューで入れる。`codex-review.yml` はPRへコメントを投稿する機能自体を持たない(`github-token` 相当のinputが無い)ため、将来復活させる場合はこの欠陥を先に直す必要がある。 |
| Codex CloudのPR自動レビュー | **完了。** Codex settings の Code review → Automatic reviews を有効化(2026-08-10 JST、PO操作。issue #101)。**ワークフローファイルもAPIキーも不要**で、ChatGPT Plusの枠内で動く(GitHub経由のレビューは一般利用枠とは指標上別バケットで計上されるが、Plusの同じ5時間ローリングウィンドウの枠を共有する。「別枠だから消費を気にしなくてよい」わけではない。参照: [Codex code review in GitHub](https://learn.chatgpt.com/docs/third-party/github)、[Codex Pricing](https://learn.chatgpt.com/docs/pricing))。**GitHub上ではP0/P1の指摘のみが投稿される**仕様。レビュー観点とP0/P1定義の正本は`AGENTS.md`の`## Code Review Rules`節にある。**Draft PRへのpushでは自動発火しない**ことをPR #113で確認した(複数回のpushで確認)。手動で`@codex review`とコメントすると即座に投稿されることも確認済み。**Ready化後に新しいコミットをpushすると、手動メンション無しで自動投稿されることも確認した**(詳細は`pr-review-flow` skill「Ready化」参照)。**Ready化そのもの(pushを伴わない`gh pr ready`単体)でも自動投稿されることを、2026-08-11のPR #169・#170・#173・#174で確認した(同skill参照)。**2026-08-10 JST(コミット日時はUTC基準で2026-08-09)、PR #113 |
| CodeRabbitの導入 | **完了。** PR #18〜#32の実績分析でClaude/Copilotの指摘重複率と、Copilotのクレジット消費(実測で1レビューあたりプレミアムリクエスト13回相当。公式の固定値ではなく実績値)を踏まえ、無料の3人目のレビュアーとして追加。GitHub Appをインストール済み。`.coderabbit.yaml`で`drafts: true`を設定し、Draft PRでも反復レビューされることをPR #35で確認済み(Copilotがdraft中は走らずReady化後に走るという挙動は、PR #35で実地確認済み。Draft中の7回のpushではCopilotのレビューは一度も付かず、`gh pr ready`実行後に`copilot-pull-request-reviewer`が動いた。ただし1回目はプレミアムリクエストのquota上限で失敗し、quota追加後に再リクエストして2回成功した。「1回だけ」という想定に反し、quota切れ時は失敗レビューがノーカウントで残る点は注意)。Freeプランのレート制限はGitHub連携のPRレビューが**1回/時/開発者**(IDE/CLIは3回/時)で、当初調べていた「200ファイル/時・4レビュー/時」は誤り(CodeRabbit自身のレビューコメントで訂正された。参照: [docs.coderabbit.ai/management/plans](https://docs.coderabbit.ai/management/plans))。短時間の連続pushでは2回目以降のレビューがスキップされうる前提で運用する。**注記:** PR #35のレビュー実行結果は毎回`Plan: Pro Plus`と表示されていたが、7コミット目のpush以降はレビューが自動発火せず、`@coderabbitai review`を手動実行すると「Review rate limited」と返ってきた(2026-08-07T00:55 UTC時点)。「レビューがpauseされている」旨の案内ではなかったため、`auto_pause_after_reviewed_commits: 0`は意図通り機能しており、止まった原因はレート制限だと判断できる。GitHub App導入直後のPro Plusトライアル期間が既に終了した可能性が高い。以降はFreeプランのレート制限(1回/時/開発者)を前提に運用する |

> シークレットは `gh secret set <NAME>` などリポジトリの設定画面から**あなた自身が追加すること**。
> Claudeにトークン・APIキーの値を渡さない。

---

## フェーズ1 — DBとRLS

**目的: 権限を、機能より先に固める。**

- [ ] `supabase init`、ローカル起動の手順をREADMEに
- [ ] マイグレーション(`docs/data-model.md` の6テーブル)
      `profiles` / `events` / `event_participants` / `ticket_entries` / `expenses` / `budgets`
- [ ] `auth.users` → `profiles` の自動作成トリガー
- [ ] インデックス(data-model.md に記載のもの)
- [ ] RLSポリシー(data-model.md「RLSポリシー方針」の表)
- [ ] Google SSO (Supabase Auth) の設定
- [ ] `yarn gen:types` → `supabase/types.ts` をコミット
- [ ] `test/db/` でRLS検証

**RLS検証の必須要件**(`docs/permissions.md` より、再掲ではなく実施項目として)

- [ ] service_roleキーを `test/db/` のどこでも使わない
- [ ] 権限マトリクスを「行=操作 × 列=ロール」の表としてテストに写す。空欄=テスト漏れ
- [ ] 最小検証セット8項目を実装
- [ ] **各テストについて、対応するRLSポリシーを一時的に落として赤くなるのを確認してから戻す**

**完了条件:** マトリクスの×が全てDBレベルで弾かれる。
service_roleキーがテストコードに出現しない(grepで確認できる)。

**決定済み: `profiles.is_admin` の扱い**

- **カラムは `profiles` に用意する。**後からのカラム追加はマイグレーションが必要で面倒なため、
  定義だけ先に置く
- **これを参照する権限判定は、RLSにもアプリ層にも一切書かない。**
  したがって `docs/permissions.md` の権限マトリクスに管理者の列は作らず、
  フェーズ1の時点でマトリクスは完全な状態になる
- 削除ガード(参加者がいたら削除不可)に例外はない。管理者でもバイパスできない
- 強制削除と管理者画面は「フェーズ2バックログ」へ

---

## フェーズ2 — `common/` のpure関数

**目的: アプリの判断を、I/Oから切り離して全部確定させる。**

Supabaseもブラウザも要らないので、フェーズ1と並行して進められる。

| ファイル | 内容 | 出どころ |
| --- | --- | --- |
| `common/permissions.ts` | user_id・オーナーID・参加登録有無から操作可否。参加登録可否(`canJoinEvent`)と招待可否(`canInviteToEvent`)のみ、issue #34 / #54 の決定に伴いフェーズ1で先行実装済み | permissions.md の権限マトリクス |
| `common/deletion.ts` | 実績の有無 × 削除の種類 → 支出データの扱い | prd 4.6 の表(4通り) |
| `common/budget.ts` | 期間/ジャンルの絞り込み、合算、差分、消化率 | prd 4.4 |
| `common/visibility.ts` | あるユーザーから見える参加情報の絞り込み | prd 4.5 |
| `common/status.ts` | 参加ステータスの遷移可否 | prd 4.3 の6状態 |
| `common/calendar.ts` | 対象月 → 表示セル配列(date-fns、自前実装) | prd 4.3 / 8.3 |
| `common/schemas/` | Zodスキーマ。**Web UIとMCPの両方がここから導出する** | lint-policy.md |

**書き方の制約**

- 現在時刻とユーザーIDは**引数で受け取る**。関数内で `new Date()` を呼ばない
- DBの行の型は `supabase/types.ts` の生成型から、外部入力は `z.infer` から導出する。手書きしない
- `as` を使わない。必要なら型ガード `const isX = (v: unknown): v is X => ...` を書く

**テスト(`test/unit/`)**
`docs/testing.md` の10パターンを機械的に当てる。特に効くところ:

- `permissions.ts` — **否定側が本体。**フェーズ1のRLSテストと同じマトリクスを二重に検証する
- `deletion.ts` — 4通り全部。1つも欠かさない
- `budget.ts` — 月境界、年境界、ジャンルNULL(全ジャンル合算枠)、予算0でのゼロ除算、実績のみ/予算のみ
- `calendar.ts` — 月初の曜日オフセット、前後月のはみ出し、うるう年(2028/2/29)、週の開始曜日、
  JST↔UTC変換で日付がずれる境界
- `visibility.ts` — **既定値が非公開であることを固定する。**反転しても何もエラーにならない
- `status.ts` — 6状態の遷移表。不正な遷移が弾かれること

**完了条件:** `yarn test` がSupabase起動なしで通る。
権限マトリクスがフェーズ1(RLS)とフェーズ2(pure関数)の両方でテストされている。

---

## フェーズ3 — Web UI(読み取り)

**目的: フェーズ1と2が実際に繋がることを、最短で確認する。**

- [ ] `lib/` にSupabaseクライアント(サーバー/クライアント)。**ここにルールを書かない**
      **Next.js専用API(`next/headers` の `cookies()` など)に触れるファイルはパスで分離する**
      (例: `lib/web/`)。`mcp/` が `lib/` 経由でNext.jsを引きずり込むのをlintで止められる
      ようにするため。分離したら `docs/lint-policy.md`「層の境界」に禁止パターンを1行足す
- [ ] Googleログイン / ログアウト
- [ ] イベント一覧 — 全ユーザー共有カタログ、`deleted_at IS NULL`
- [ ] 自分のスケジュール — 一覧表示(ステータス別・日付順)
- [ ] カレンダービュー — `common/calendar.ts` の返す配列を描画するだけ。**描画は薄く保つ**
- [ ] 予算・支出ダッシュボード — `common/budget.ts` の集計を表示するだけ
- [ ] 他ユーザーの参加情報の表示(`visibility = 'public'` のみ)

**注意点**

- **`app/` に判断ロジックを書かない。`common/` を経由させる。**これはコンポーネントごとの
  目視確認ではなく、**ESLintで機械化済み**(issue #43。フェーズ0で先行導入した)。
  `app/` と `mcp/` では `.filter()` `.reduce()` などの配列操作を `no-restricted-syntax` で
  禁止しており、`lib/` から受け取った結果をその場で絞り込む・集計するとlintが落ちる。
  合わせて `common/` から `lib/` `app/` `mcp/` とフレームワークへのimportも禁止している。
  **`lib/` 内での集計だけは誤検知を避けるため対象外。**ルールの全体像と残っているギャップは
  `docs/lint-policy.md`「層の境界」を読む

---

## フェーズ4 — Web UI(書き込み)

- [ ] イベント登録・編集
- [ ] イベントの論理削除 + ガード(オーナー以外の参加者が1人でもいたら削除不可)
- [ ] 参加登録 / 取りやめ(**公開設定の既定値=非公開**)
- [ ] 参加ステータスの変更
- [ ] 公開/非公開の切り替え
- [ ] 招待(メールアドレス指定。既存アカウントのみ。承認フローなし、即時 `joined`)
- [ ] チケット申込の登録・編集(1イベントに複数経路)
- [ ] 支出(予算/実績)の登録・編集
- [ ] 予算枠(月次/年次 × ジャンル)の登録
- [ ] 削除時の支出分岐を `common/deletion.ts` に配線

**完了条件(`docs/prd.md` 6章の成功基準):**

- 3ジャンルのイベントを登録・一覧できる
- 1イベントに複数の申込経路を登録し、締切・当落発表日を把握できる
- 参加ステータスで「行くつもりのもの」が一目でわかる
- 月次の予算消化率が確認できる
- 他ユーザーを招待すると、そのユーザーのスケジュールに表示される

---

## フェーズ5 — MCPサーバー(stdio)

**目的: 同じ操作の2経路目を、判断を複製せずに生やす。**

- [ ] `mcp/` にstdioサーバー。Supabase接続情報は環境変数で受け取る
- [ ] ツール定義の入力スキーマに `common/schemas/` のZodスキーマを**そのまま**使う
      (MCP用に書き直した時点で、片方だけ条件が緩くなる余地ができる)
- [ ] ツール
  - [ ] イベントの登録・更新・検索
  - [ ] 参加登録・ステータス変更
  - [ ] チケット申込の登録・確認
  - [ ] 支出の登録・予算消化状況の確認
- [ ] Claude Desktop / Claude Code への登録手順をREADMEに
- [ ] **Web UIとMCPで同じ操作をして同じ結果になることをテストで固定する**
      (`docs/testing.md` 優先度6。片方だけルールが古くなるのを検出する)

**やらないこと:** MCP独自の認証機構。アクセス制御はOSのプロセス権限に委ねる(prd 4.7)。
リモート化(OAuth 2.1 + PKCE)はフェーズ2の独立した課題。

**完了条件:** PCのClaude(Desktop / Code)から、登録・確認の最低限の操作ができる。

---

## フェーズ6 — 公開

- [ ] PWA manifest。**インストール可能までとし、オフライン書き込みは実装しない**(prd 5章)
- [ ] 本番Supabaseプロジェクトの作成、マイグレーション適用
- [ ] Vercel(Hobby)へのデプロイ、環境変数の設定
- [ ] keep-alive workflow を本番プロジェクトに向ける(日次)
- [ ] README整備(セットアップ、MCPの繋ぎ方)

**留意:** 無料枠はバックアップ保持が0日。フェーズ2で家族・友人に展開する前に、
支出データのエクスポート手段を用意するか、有料プランを検討する。

---

## 全体を通しての監視点

| 論点 | いつ効くか | 対処 |
| --- | --- | --- |
| `app/` に判断ロジックが漏れる | フェーズ3〜4 | **ESLintで検出済み**(issue #43)。`docs/lint-policy.md`「層の境界」 |
| MCPとWeb UIの挙動差 | フェーズ5 | 同一操作の比較テスト。`common/` 経由の確認 |
| 生成型の差分検証がCLIバージョンで落ちる | フェーズ0〜1 | バージョンを固定する |
| `is_admin` カラムが「あるのに効かない」状態で放置される | フェーズ1〜2 | 下記バックログに残す。フェーズ1では意図的に未実装 |
| 自動レビューの指摘が多すぎて読まれなくなる | フェーズ0 | ローカルで質を見てからCIに載せる(prd 8.5) |

---

## フェーズ2バックログ

MVPのスコープ外。**利用者を家族・友人に広げるタイミングで着手する。**
(`docs/prd.md` 4.8「将来検討」に対応する、実施単位のリスト)

### 優先: 管理者画面と強制削除

**なぜ必要か:** MVPでは「オーナー以外の参加者が1人でもいるイベントは削除できない」ため、
誤登録・重複登録が消せずに残り続ける。開発者本人だけなら運用でカバーできるが、
利用者が増えると共有カタログにゴミが溜まり、誰も直せなくなる。

**着手条件:** 開発者本人以外が2人以上イベントを登録するようになったら。

**実装時にやること(すべて同じPRで)**

1. `docs/permissions.md` の権限マトリクスに「システム管理者」の列を追加する
2. RLSポリシーに `profiles.is_admin = true` の分岐を追加する
3. `common/permissions.ts` に同じ分岐を追加する
4. `test/db/` と `test/unit/` の両方にマトリクスの列を追加する
   (2と3のどちらか片方だけ実装された状態を検出するため)
5. 強制削除の実行前に、影響範囲(消えるユーザーのスケジュール件数)を表示する
6. 重複イベントの名寄せ

> `profiles.is_admin` カラムはMVPのマイグレーションで作成済み。
> **カラムはあるが、それを見る権限判定はどこにも存在しない**状態から始まる。
> 「カラムがあるから効いているはず」と誤認しないこと。

### その他

`docs/prd.md` 4.8 より。着手条件が立った順に上のフォーマットへ展開する。

| 項目 | 着手の目安 |
| --- | --- |
| リモートMCPサーバー化(OAuth 2.1 + PKCE) | Web/モバイルのClaudeから使いたくなったら |
| 招待の承認フロー | 開発者本人の管理外のユーザーを招待するようになったら |
| 通知・リマインド機能 | 申込締切を実際に取りこぼしたら |
| E2Eテスト(Playwright等)の導入 | 招待フローが他人に使われ始めたら |
| 情報源の自動収集(クローリング) | 手動登録のパターンが見えてきたら |
| 参加情報の限定公開(`visibility = 'limited'`) | 「この人にだけ見せたい」が実際に出たら |
| 支出の割り勘・精算管理 | 複数人で費用を出し合うようになったら |
| PWAのオフライン対応 | オフラインでの書き込みが実際に必要になったら |
| 支出データのエクスポート | 無料枠のバックアップ0日が問題になる前(フェーズ2展開前) |

## 更新履歴

| 版 | 内容 |
| --- | --- |
| v0.1 | 初版。prd.md v0.4 のMVPスコープを7フェーズに分解 |
| v0.2 | `is_admin` の扱いを決定(カラムのみMVP、権限判定は未実装)。「フェーズ2バックログ」を新設し、管理者画面と強制削除の着手条件・実装手順を記載 |
| v0.3 | GitHub Issues/Projectsによるタスク管理を追加。フェーズ0のチェックリストをIssue化し、Project「推し活管理アプリ 開発」に登録 |
| v0.4 | mainブランチをRulesetで保護(PR必須・force push禁止・削除禁止・管理者バイパス可)。Claude/Codexの自動レビューworkflow骨格を導入(シークレット未設定時は自動スキップ)。「保留: 外部アカウント待ち」を新設し、Copilot自動レビューの有効化とシークレット設定の作業を記載 |
| v0.5 | Claude自動レビューを本稼働化(id-token権限とコメント投稿手段の指示が不足していた不具合を修正し、実PRで動作確認)。Copilot自動レビューをRulesetで有効化し動作確認。Codexレビューは意図的に保留(APIキーを取得しない方針) |
| v0.6 | Codexレビューの本稼働化の状態を「保留」から「見送り(確定)」に変更。ChatGPT Plusの契約にAPIキーは含まれず、OpenAI Platformの従量課金である点を理由として明記(v0.5の「取得しない方針」の撤回ではなく、理由の追記と確定) |
| v0.7 | Codex Cloud のPR自動レビュー(Automatic reviews)を有効化(issue #101)。GitHub Actions版`codex-review.yml`とは別経路で、ワークフローファイル・APIキーとも不要。「保留: 外部アカウント待ち」の行をGitHub Actions版とCodex Cloud版に分割。実PRで、Draft PRへのpushでは自動発火しないこと・`@codex review`の手動リクエストで投稿されること・Ready化後のpushでは手動メンション無しで自動投稿されること(発火条件は「Draftではない状態でのpush」と見られる)を確認 |
| v0.8 | Claudeレビューを機械的なゲートに格上げ(issue #95)。レビュー観点の正本を`AGENTS.md`の`## Code Review Rules`に一本化し、base SHA固定で読み出す。トークン未設定・実行したのに投稿0件・総評のマーカー不一致でcheckが赤くなる(赤になる条件の一覧は`docs/pr-review-flow-details.md`「Claude Review」)。`review:full`ラベルで全分類の再レビューを起動できる。**Rulesetのrequired status checkへの配線はPOの手作業として残っており、それまで赤はマージを止めない。**あわせてCodexレビュー(GitHub Actions版)の状態を「見送り(確定)+ ファイルの扱いは未確定」から「削除済み」に変更(issue #82)。v0.6で「採らないと決めた」ことの帰結であって、判断の変更ではない |
