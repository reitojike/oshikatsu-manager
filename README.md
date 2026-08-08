# 推し活スケジュール・予算管理アプリ

宝塚・歌舞伎・アイドルライブなど複数ジャンルの「推し活」について、公演情報・チケット申込・参加予定・予算/支出をまとめて管理するWebアプリ。

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
| [`docs/model-routing.md`](docs/model-routing.md) | Claude/Codex間の作業分担とフェイルオーバー |
| [`CLAUDE.md`](CLAUDE.md) | AIエージェント向けの規約 |

## タスク管理

[GitHub Projects](https://github.com/users/jack0jp/projects/1)で進捗を管理する。
各タスクはIssue化し、`phase:N`(`docs/roadmap.md` のフェーズ)と、既定は
`agent:sol` / `agent:terra` / `agent:luna`(Codexが一次担当。詳細は
`docs/model-routing.md`)、Claude側で判断する場合のみ
`agent:opus` / `agent:sonnet` / `agent:haiku` のラベルを付ける。

## ブランチ運用

mainブランチは保護されており、直接pushできない。ブランチを作成しPR経由でマージする。
PR作成時にClaude/Codexによる自動レビューが走る(有効化の手順は`docs/roadmap.md`
「保留: 外部アカウント待ち」を参照)。

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
コードレビューは別モデルによる自動レビューをCIで回す。詳細は `CLAUDE.md` と `docs/` を参照。
