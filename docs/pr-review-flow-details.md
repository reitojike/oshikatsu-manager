# PRレビューフローの根拠と、問題発生時の対処

`.claude/skills/pr-review-flow/SKILL.md` の手順がなぜそうなっているかと、quota・
レート制限・レビューボットが投稿しない場合など、問題に遭遇したときだけ使う対処。
通常のPR作業ではこの文書を読まなくてよい。

規則そのものは `.claude/skills/pr-review-flow/SKILL.md` にある。ここには書き写さない。

## Draft先行の根拠

PR #18〜#32の実績分析(Claude/Copilotの指摘重複率、Copilotのクレジット消費が
実測で1レビューあたりプレミアムリクエスト13回相当。公式の固定値ではなく実績値)に基づく判断。

## Draft前セルフレビューの強制範囲

**現時点では、この必須化は運用ルールとしてのみ存在し、CIのrequired status checkでは
強制されていない。**`pr-template-check.yml`は記入漏れを検知するが、Rulesetの
required checkにはまだ配線されていない(人間の手動対応待ち)。つまり現状は、CIが赤く
ならなくてもマージできてしまう。

## セルフレビューのlevelを具体値で記す理由

**具体値をskillに書くのは、levelの名称選択肢
(`low`/`medium`/`high`/`xhigh`/`max`/`ultra`)自体が`/code-review`skill側の固定語彙であり、
`docs/model-routing.md`「モデル名を文書に固定しない」が警戒する対象(変わりうるモデル名)とは
別物だから。**論理プロファイル名で抽象化する案(issue #81で一時検討)は、名前と具体値を
紐づけるローカル設定がこのリポジトリにまだ無いため、このPRでは採らない。

## レビューボット別の対処

### Claude Review

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

### Codex Cloud

Codex Cloudが投稿しない場合など、固有の対処はこの節に追加する。

### CodeRabbit

FreeプランはGitHub連携のPRレビューが**1回/時/開発者**に制限されている
(PR #35で実際にレート制限を確認済み。詳細は`docs/roadmap.md`「CodeRabbitの導入」参照)。
Draftで短時間に何度もpushしても2回目以降はスキップされうる。

### GitHub Copilot

Copilotの最終レビューは「プレミアムリクエストのquota上限に達したため実行できなかった」
という形で失敗することがある(PR #35で発生)。この場合レビューコメントは投稿されるが
中身のないもので、コードは実際にはレビューされていない。quotaを追加してからskillの
「Ready後の運用」にあるコマンドで再リクエストする。

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
