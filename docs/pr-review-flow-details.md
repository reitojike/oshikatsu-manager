# PRレビューフローの根拠と、問題発生時の対処

`.claude/skills/pr-review-flow/SKILL.md` の手順がなぜそうなっているかと、quota・
レート制限・`claude-review.yml`変更時のスキップなど、問題に遭遇したときだけ使う対処。
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

#### checkが赤くなる条件(issue #95で機械的なゲートに格上げ)

**「workflowが成功した」を「実レビューが完了した」と読み替えない**という運用ルールを、
読み替えられない形にしたもの。判定の正本はissue #95の決定3とPO確認のコメントで、
実装は`.github/scripts/check-claude-review.mjs`にある(理屈をここに書き写さない)。

| 状態 | check | 理由 |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` 未設定 | **赤** | 設定ミスを可視化する。**fork PRもsecretが渡らないため常に赤**で、マージにはオーナーのbypassを使う(PO決定) |
| 実行されたのに`claude[bot]`の投稿が0件 | **赤** | `--max-turns`打ち切りなどで「run成功・投稿0」が作られるため |
| 投稿はあるが総評のhead SHAマーカーが不一致 | **赤**(別メッセージ) | 総評コメントは`commit_id`を持たず本文マーカーだけが根拠。原因が「走っていない」のか「マーカーを落とした」のかを区別する |
| `claude-review.yml`自体を変更するPR(上記のworkflow検証スキップ) | 緑(注記のみ) | 機械では埋められない。赤にすると`.github/workflows/`を触るすべてのPRが恒久的にマージ不能になる |
| キャンセル(`concurrency`による世代交代を含む) | 緑(注記のみ) | 本来のキャンセルに人工的な失敗を重ねない。新しいheadの後続runが責任を持つ |

**`review:full`ラベルを付けると、そのPRで全分類の観点を当てた再レビューが走る**
(観点の抽出は`AGENTS.md`の`## Code Review Rules`から行い、既定は変更ファイルに該当する分類だけ)。
**無関係なラベルを付けたときは進行中のレビューを止めない**(別のcheck名で報告され、
`claude-review`の結果を上書きしない)。

**Rulesetのrequired status checkに配線されるまで、上記の赤はマージを止めない。**
「実装した = 効いている」と見なさないこと。

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
各Rulesetの`id`を控えたうえで詳細エンドポイントを使う。**`main`には複数のRulesetが同時に
効きうる**(Repository / Organization / Enterprise由来。`ruleset_source_type`で区別できる)ため、
`id`を1件に決め打ちしない。`{id}`は`gh api`のURLテンプレート展開の対象ではないので、
シェル変数に入れてから渡す。

```bash
# 1. mainに効いているcopilot_code_reviewのRulesetを列挙する(id・由来とも複数ありうる)
gh api repos/{owner}/{repo}/rules/branches/main \
  --jq '[.[] | select(.type == "copilot_code_review") | {ruleset_id, ruleset_source_type}] | unique'

# 2. 列挙された全idについて詳細を取得し、実際に適用されている値を確認する(1件でもループで回す)
#    pipefailは効かせない(プロセス置換 `< <(...)` の中で失敗しても伝播しないため)。
#    代わりに、1のgh apiの出力をいったん変数に受け、代入コマンド自体の成否を`||`で確認する。
#    0件のときにwhile/for本体が一度も実行されずexit 0で終わり、「1件も検証していない」ことに
#    気づけなくなるのを防ぐため、件数(空文字かどうか)も明示的に確認する
RULESETS_RAW=$(gh api repos/{owner}/{repo}/rules/branches/main \
  --jq '[.[] | select(.type == "copilot_code_review") | {ruleset_id, ruleset_source_type}] | unique | .[] | "\(.ruleset_id) \(.ruleset_source_type)"') \
  || { echo "gh api (rules/branches/main) の取得に失敗"; exit 1; }

if [ -z "$RULESETS_RAW" ]; then
  echo "copilot_code_reviewのRulesetが0件でした。1件も検証していません" >&2
  exit 1
fi

while IFS= read -r LINE; do
  read -r RULESET_ID SOURCE_TYPE <<< "$LINE"
  echo "== id=$RULESET_ID source_type=$SOURCE_TYPE =="
  gh api repos/{owner}/{repo}/rulesets/$RULESET_ID \
    --jq '{enforcement, target, conditions, source_type, copilot_rules: [.rules[] | select(.type == "copilot_code_review") | .parameters]}' \
    || { echo "id=$RULESET_ID の取得に失敗"; exit 1; }
done <<< "$RULESETS_RAW"
```

**2の`source_type`は1のフィルタと必ず突き合わせる。**このリポジトリでの実測は
Repository由来のRuleset 1件のみ(上記ループの出力が`source_type: "Repository"`を
返すことを確認済み)。Organization / Enterprise由来のRulesetはこのリポジトリに存在しないため、
同じエンドポイントで詳細が引けるかは未検証。

**2がエラーを返しても、それだけでは「由来別に別エンドポイントが要る」と判断しない。**
認証・権限エラー(`gh`の再ログインが必要、トークンにスコープが無い)、存在しない`id`
(1の出力を取り違えた)、一時的な通信エラーをまず除外する。それらのどれにも当たらず、
かつ`source_type`がRepository以外のときに限って、`source_type`に応じた別のエンドポイントを
GitHub REST APIのドキュメントで調べる(このリポジトリでは未遭遇のため、具体的なパスは
ここに書かない)。遭遇したらこの節に実測結果を追記する。
