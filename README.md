# イベント参加のスケジュール・予算管理アプリ

宝塚・歌舞伎・アイドルライブなど複数ジャンルのイベント参加について、公演情報・チケット申込・参加予定・予算/支出をまとめて管理するWebアプリ。

## 技術スタック

- Next.js / TypeScript
- Supabase (PostgreSQL + Auth / Google SSO / RLS)
- Vercel (Hobby)
- MCPサーバー (stdio。PCのClaudeから利用)
- Vitest / ESLint / GitHub Actions

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| [`docs/prd.md`](docs/prd.md) | 仕様、スコープ、決定事項 |
| [`docs/roadmap.md`](docs/roadmap.md) | 開発計画、フェーズ分割 |
| [`docs/data-model.md`](docs/data-model.md) | データモデル設計 |
| [`docs/permissions.md`](docs/permissions.md) | 権限マトリクスとRLSの検証要件 |
| [`docs/lint-policy.md`](docs/lint-policy.md) | lint/型の運用方針、例外の作法 |
| [`docs/testing.md`](docs/testing.md) | テストの書き方 |
| [`docs/model-routing.md`](docs/model-routing.md) | Claude/Codex間の作業分担(振り分けの規則) |
| [`docs/model-routing-details.md`](docs/model-routing-details.md) | Claude/Codex間の作業分担の根拠と、上限到達時のフェイルオーバー手順 |
| [`docs/pr-review-flow-details.md`](docs/pr-review-flow-details.md) | PRレビューフローの根拠と、問題発生時の対処 |
| [`AGENTS.md`](AGENTS.md) | AIエージェント向けの規約(Claude Codeは`CLAUDE.md`が`AGENTS.md`をimportして読む) |

## タスク管理

[GitHub Projects](https://github.com/users/jack0jp/projects/1)で進捗を管理する。
各タスクはIssue化し、`phase:N`(`docs/roadmap.md` のフェーズ)と、
`agent:*` ラベルを**いずれか1つ**付ける。既定は
`agent:sol` / `agent:terra` / `agent:luna` のいずれか(Codexが一次担当。詳細は
`docs/model-routing.md`)、Claude側で判断する場合のみ
`agent:opus` / `agent:sonnet` / `agent:haiku` のいずれかに置き換える。

## ブランチ運用

mainブランチは保護されており、直接pushできない。ブランチを作成しPR経由でマージする。
PR作成時にClaudeによる自動レビューが走る。CodexはCodex CloudのPR自動レビュー
(Automatic reviews)で入る。GitHub Actions版(`codex-review.yml`)は`OPENAI_API_KEY`を
設定しない方針のため常にスキップされる(詳細は`docs/roadmap.md`「保留: 外部アカウント待ち」を参照)。

## セットアップ

Supabase CLIは `.github/workflows/supabase.yml` の `SUPABASE_CLI_VERSION` と同じバージョンを使うこと。
バージョンがずれると、マイグレーション由来ではなく「CLI差」でローカルとCIの挙動が食い違い、
どちらの結果も信用できなくなる(`docs/roadmap.md` フェーズ1の注意点)。

```bash
yarn install
cp .env.example .env.local   # Supabaseの接続情報を設定
npx supabase@2.111.0 start   # ローカルDB(Dockerが必要。バージョンは.github/workflows/supabase.ymlのSUPABASE_CLI_VERSIONと同じ値にすること)
yarn dev
```

## 開発方針

このリポジトリは**人間がdiffを読まない前提**で運用する。品質は静的解析とテストで担保し、
コードレビューは別モデルによる自動レビューをCIで回す。詳細は `AGENTS.md` と `docs/` を参照。
