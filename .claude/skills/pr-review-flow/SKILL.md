---
name: pr-review-flow
description: このリポジトリのPR運用手順。PRを作成する / Draftで出す / gh pr ready でReady化する / レビューボット(Claude, Codex, CodeRabbit, GitHub Copilot)の指摘を分類して対応する / Copilotのプレミアムリクエストやquota上限・レート制限に対処する / PRをマージする、といった作業のときに読む。「PR作って」「レビュー通して」「ready にして」「copilot レビュー」「マージして」で発火。
---

# PRレビューフロー

## 原則

Draft先行の目的は、**Copilotのプレミアムリクエスト消費を「Ready化時の1回」に限定すること**
(ただしquota失敗時・実装変更時は、後述の「Ready後の運用」の条件でマージ直前に手動再リクエストを最大1回まで許容する)。
Claude/Codex/CodeRabbitはDraft中に何度反復してもプレミアムリクエストを消費しない。
PR #18〜#32の実績分析(Claude/Copilotの指摘重複率、Copilotのクレジット消費が
実測で1レビューあたりプレミアムリクエスト13回相当。公式の固定値ではなく実績値)に基づく判断。

## PRを出す前に

**未確認の設計判断が成果物に焼き付いていないかを確認する。**成果物間で記述が矛盾していた、
またはどちらとも取れる判断をこのタスクで行ったなら、`docs/decision-policy.md` の
判定に照らす。確認が要る側だったのにPO確認を経ていないなら、**PRを出す前に確認する。**

**ここは最後の砦であって、確認すべき本来のタイミングではない。**正しい確認点は
実装に着手する前で、対象もコードに限らない(マイグレーション、RLS、生成型、テスト、
ドキュメント)。判断に依存する作業は確認が済むまで止める — 詳細は
`docs/decision-policy.md`。この節に引っかかった時点で、既に一手遅れている。

レビューボットもCIも「決めた方針どおりに書けているか」しか見ないため、方針が製品の意図と
逆でも全部緑になる。**機械的なチェックでは検出できない唯一の穴。**理由と実例は
`docs/decision-policy.md`「なぜこれが必要か」(理屈をここに書き写さない。片方だけ古くなる)。

## Draftフェーズ

PRはまず`gh pr create --draft`でDraft作成する。

- **Claude**(`claude-review.yml`): `CLAUDE_CODE_OAUTH_TOKEN`設定時にdraftのpushごとに走る。未設定時はスキップ。`claude-review.yml`自体を変更するPRでは別の理由でスキップされる(下記「`claude-review.yml`変更時のスキップの見分け方」参照)
- **Codex**(`codex-review.yml`): `OPENAI_API_KEY` を設定しない方針のため、**常にスキップされる**(恒久的な決定。理由は`docs/roadmap.md`「保留: 外部アカウント待ち」参照)。Codexの視点はDraft作成前のローカルセルフレビューで入れる(#81)
- **CodeRabbit**(`.coderabbit.yaml`): `drafts: true`でdraft中もレビュー対象。ただしFreeプランはGitHub連携のPRレビューが**1回/時/開発者**に制限されている(PR #35で実際にレート制限を確認済み。詳細は`docs/roadmap.md`「CodeRabbitの導入」参照)。Draftで短時間に何度もpushしても2回目以降はスキップされうる。反復の主力はClaude/Codexで、CodeRabbitは取れたときに追加の視点が入る、という位置づけで期待値を持つこと
- **GitHub Copilot**(`copilot_code_review` Ruleset): `review_draft_pull_requests: false`のためdraft中は走らない

Draftで指摘がなくなるまで反復する。

**指摘を直すときは、指摘された箇所だけを直してpushしない。**指摘の根拠を一般化し、
このPRの差分の中に同じ根拠が当てはまる他のファイル・箇所がないかを確認してから、
まとめて直して1回でpushする。同一根拠の指摘がファイルごとに1件ずつ返ってくる状態
(PR #32・#60で発生。例: PR #32では「setup用insertの結果を検証していない」が
4つのテストファイルに個別指摘され、PR #60では許可リストの抜け漏れが軸ごとに
複数ラウンドに分けて指摘された)は、横展開を怠ったサインである。

## Ready化

指摘が尽きたら`gh pr ready`でReady for reviewに変える。このタイミングでCopilotの最終レビューが1回走る(`review_draft_pull_requests: false`、Ready化がトリガー)。

## Ready後の運用

Ready化後の追加修正は、ローカルで全部直してからまとめて1回でpushする。
`copilot_code_review` Rulesetの`review_on_push`は`false`に設定済み(2026-08-07適用)なので、
Ready後のpushではCopilotの自動レビューは走らない(CIとClaudeレビュー、CodeRabbitは
上記のとおり通常どおり走るので、機械的なバックストップは失われない)。
`gh api`でのRuleset書き込みはClaude Codeのauto mode分類器にブロックされるため、
この設定を変更する場合は人間が手動で行う。適用状況の確認は一覧系エンドポイント
(`gh api repos/{owner}/{repo}/rulesets`)では`rules`が返らず誤判定するため、
各Rulesetの`id`を控えたうえで詳細エンドポイントを使う。`id`はブランチ単位のルール一覧
エンドポイントから取得できる(各ルールに`ruleset_id`が付き、`type`で`copilot_code_review`を
特定できる)。

```bash
# 1. mainに効いているRulesetのidを特定する
gh api repos/{owner}/{repo}/rules/branches/main \
  --jq '.[] | select(.type == "copilot_code_review") | .ruleset_id'

# 2. そのidで詳細を取得し、実際に適用されている値を確認する
gh api repos/{owner}/{repo}/rulesets/{id} \
  --jq '{enforcement, target, conditions, copilot_rules: [.rules[] | select(.type == "copilot_code_review") | .parameters]}'
```

Copilotの再レビューが必要なのは次の2つの場合だけで、マージ直前に手動で1回だけ行う。

1. 最初のCopilotレビューがquota上限で失敗し、中身のないコメントしか返っていない
2. Ready後にコードの実装を変更した(ドキュメント・コメント・テスト名のみの修正は対象外)

再リクエストは以下のコマンドで行う。1PRにつき手動再リクエストは1回まで。
2回目が必要だと感じたらDraftに戻し(`gh pr ready --undo`)、Claude/Codex/CodeRabbitで反復し直す。

```bash
gh api repos/{owner}/{repo}/pulls/{number}/requested_reviewers -X POST \
  -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
```

## quota失敗時の見分け方

Copilotの最終レビューは「プレミアムリクエストのquota上限に達したため実行できなかった」
という形で失敗することがある(PR #35で発生)。この場合レビューコメントは投稿されるが
中身のないもので、コードは実際にはレビューされていない。quotaを追加してから上記コマンドで
再リクエストする。

## `claude-review.yml`変更時のスキップの見分け方

`claude-review.yml`自体を変更するPRでは、GitHub Actions側のワークフロー保護機構
(PRがワークフローファイル自体を書き換えて昇格した権限で任意のコードを実行するのを防ぐもの)
により、`anthropics/claude-code-action`が実際にはレビューを実行せず正常終了する
(exit code 0、`gh pr checks`では`pass`と表示される)。ログに
`Skipping action due to workflow validation`が出ていれば該当する
(`gh run view <run-id> --log`で確認)。quota失敗時と同様、`pass`表示だけでは
「レビュー済みで指摘なし」と区別がつかない見落としパターン。該当する場合は
`/code-review`スキルで自分でレビューするか、マージ後にClaude Reviewが正常に効くようになる
ことを認識した上で進める。

**`/code-review`を起動する前に、ローカル`main`が`origin/main`に追随しているかを点検する**
(コマンドと理由は`docs/worktree-policy.md`)。ずれているとマージ済みの他PRの差分まで
このPRの変更として合算され、レビュー結果が丸ごと無駄になる(issue #84)。

## 指摘の扱いとマージ

- 人間の承認レビューは必須にしていない(現状は開発者本人のみのため。GitHubはPR作成者自身の
  承認をカウントしない)。マージの実行自体が「人間の確認」に当たる(`docs/prd.md` 8.5)
- ボットの指摘は機械的に全適用しない。「本物の修正 / 妥当なnitpick / 誤検知」に分類し、
  何を直して何を意図的に見送ったかをPRにコメントする
- 分類のついでに「この指摘は静的解析で拾えたはずか」も自問する。該当する場合の判定基準と
  アクションは`docs/lint-policy.md`「レビュー指摘から静的解析を強化する」を参照
- PRを作成したらCIとレビューボットの結果を待ち、指摘を分類してから自分でマージする。
  mainに直接pushしない

## マージ後の振り返り

PRがマージされたら、その作業を短く振り返り、PRまたは紐づくIssueにコメントとして記録する
(Issueが紐づく場合はIssueへ、なければPRへ)。Issueが紐づいている場合はクローズも
確認するが、クローズ確認のために記録自体を止めない。未クローズならその旨を書き添えて
記録し、クローズは次にそのIssue/PRに触れる機会に確認する(能動的に確認しに行くタスクは作らない)。

- **うまくいった点**: 今回有効だった進め方(委譲・分業・検証方法など)
- **次回改善したい点**: 同じ問題が再発しないようにするための具体的な変更点
  (プロンプトの書き方、確認の順序、待ち方など)
- **より安いモデル層で実行できたか**: 方針決定が終わった後の機械的な反復・検証
  (レビューボットとの往復、壊して確認、CI待ち)を、下位モデル(Opus→Sonnet、
  Sonnet→Haiku)に渡せたか。渡せたはずなら、`CLAUDE.md`「Issue内でモデル階層を分担する」の
  どの基準に当てはまったはずかを書く。渡さなかったのが正しい場合(下限を満たさない等)も理由を1行書く

**「より安いモデル層で実行できたか」を明示的に問うのは、振り返りを作業した本人(同じモデル)が行うためである。**
「自分がこの作業をすべきだったか」というコスト面の視点は、問いに書いておかないと自然には出てこない
(`docs/lint-policy.md`「この指摘は静的解析で拾えたはずか」と同型の自問。
issue #43の振り返りでは挙がらず、外部からの指摘で発覚した)。

長い分析は不要。数行程度でよい。

### 改善点への対応方針

「次回改善したい点」は書きっぱなしにしない。**項目ごとに対応方針を1つ決め、
振り返りコメントに書く。**「より安いモデル層で実行できたか」が「渡せたはずだった」だった場合も
同様に対象とする(渡せなかった理由を1行書くだけでは、issue #43のときと同じ抜け漏れが繰り返される)。

- **memory**: このリポジトリ固有の方針ではなく、エージェント自身の作業プロセス
  (調査の仕方、ツールの使い方、待ち方など)に関する教訓で、他のプロジェクトでも
  再利用できる場合。ここでの「memory」はClaude Codeのメモリシステムを指し、
  **このリポジトリ内のファイルではない。**追加するたびに肥大化していないか
  (エントリが読み込み時に切り捨てられる閾値に近づいていないか)を確認し、
  近ければ新規追加より先に既存エントリの統合・削除を検討する
- **Issueを立てて対応する**: このskillや`CLAUDE.md`の更新、実装・設定変更など、
  **リポジトリに変更を加えるもの全般。**規模の大小は問わない(軽微な文言修正でも
  直接PRにはしない)。振り返りコメントへのリンクをIssue本文に書き、通常のIssue運用
  (`phase:N` ラベル、`agent:*` は**いずれか1つ**。既定は `agent:sol` / `agent:terra` / `agent:luna`
  のいずれか、Claude側で判断する場合のみ `agent:opus` / `agent:sonnet` / `agent:haiku` の
  いずれかに置き換える。詳細は `docs/model-routing.md` を参照。Projectへの登録)に従う
- **対応不要**: 一度きりの偶発的事情で、再発する見込みが薄い場合。理由を一言
  添えて記録するのみでよい
