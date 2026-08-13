# PRレビューフローの根拠と、問題発生時の対処

`.claude/skills/pr-review-flow/SKILL.md` の手順がなぜそうなっているかと、quota・
レート制限・`claude-review.yml`変更時のスキップなど、問題に遭遇したときだけ使う対処。
通常のPR作業ではこの文書を読まなくてよい。

規則そのものは `.claude/skills/pr-review-flow/SKILL.md` にある。ここには書き写さない。

## Draft先行の根拠

PR #18〜#32の実績分析(Claude/Copilotの指摘重複率、Copilotのクレジット消費が
実測で1レビューあたりプレミアムリクエスト13回相当。公式の固定値ではなく実績値)に基づく判断。

## 束ねPRの根拠

`.claude/skills/pr-review-flow/SKILL.md`「束ねPR」と`docs/task-management.md`「軽微なdocs修正
Issueを束ねる」の運用がなぜそうなっているかの実測根拠。唯一の前例は
PR [#173](https://github.com/reitojike/stage-tracker/pull/173)(Issue #129/#108/#148、
3件を束ねた)。

**Closes書式と自動close。**本文に「## 対応するIssue」見出しを立て、`Closes #129: <一行説明>` /
`Closes #108: <一行説明>` / `Closes #148: <一行説明>` を列挙する形式を採った。マージ
(2026-08-11T15:49:23Z、merge commit `bac7b95`)で3件とも`state: closed` / `state_reason:
completed`になったことをAPIで確認済み。Issueのtimelineでも`referenced`(マージコミットSHA)
→`closed`の順でイベントが記録されており、複数の`Closes`を1本のPR本文に並べれば全件に
自動closeが効くことを実測で確認した。

**close漏れ確認手順を追加した理由。**#173の実運用では「本文に`Closes #N`を並べる」以外の
追加確認は行っておらず、GitHubのキーワード解決に委ねきりだった(結果的に3件とも成功したが、
手順としては未検証のまま運用していた)。束ねPR運用として明文化するにあたり、マージ直後に
対象Issue全件のstateを機械確認する一手順を追加した(「これは機械が止められるか」
(`AGENTS.md`)に沿う)。

**振り返りの記録先。**#173では振り返りをPR本体にのみ投稿し
([該当コメント](https://github.com/reitojike/stage-tracker/pull/173#issuecomment-5255565894))、
3つのIssue側には振り返りの複製・個別コメントを残さなかった(着手前の合意コメントのみが
各Issue側の記録)。束ねPR運用ではこれをそのまま既定にせず、`pr-review-flow` skill「マージ後の
振り返り」の原則(Issueが紐づく場合はIssueへ記録する)と整合させ、PR側を正本としつつ各Issueへ
参照1行のコメントを残す形に変更した。

**束ねる本数を3件までとした理由。**#173は3件を束ねた唯一の実例で、4件以上を束ねた実測が
無い。PR差分規模は素の差分で+35/-12・4ファイル変更(計47行)であり、3 Issue分を束ねても
300行目安・135行中央値のいずれにも収まっていた。振り返りコメントでは「対象3件はいずれも
正しい側が他の記述から一意に決まる追従漏れで、判断はほぼ発生せず」と明記されており、
判断合計3個以内の目安からも外れていない。実績が1件しか無いため、上限は保守的に実例の
本数(3件)に置いた。

## Draft前セルフレビューの強制範囲

**Rulesetのrequired status checkに配線済み**(2026-08-12確認。Ruleset「main branch protection」の
required status checksに`PR Template Check`のjob `check`が含まれる)。`pr-template-check.yml`
(`check-pr-template.mjs`)が記入漏れを検知し、赤になればマージをブロックする
(オーナーのbypassを除く)。配線前のPRでは赤がマージを止めていなかった時期があるので、
過去のマージ実績から「赤でも実害がない」と類推しないこと。

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
| `claude-review.yml`自体を変更するPR(上記のworkflow検証スキップ) | 緑(注記のみ) | 機械では埋められない。赤にすると`claude-review.yml`を触るPRが恒久的にマージ不能になる |
| キャンセル(`concurrency`による世代交代を含む) | 緑(注記のみ) | 本来のキャンセルに人工的な失敗を重ねない。新しいheadの後続runが責任を持つ |

**`review:full`ラベルを付けると、そのPRで全分類の観点を当てた再レビューが走る**
(観点の抽出は`AGENTS.md`の`## Code Review Rules`から行い、既定は変更ファイルに該当する分類だけ)。
**無関係なラベルを付けたときは進行中のレビューを止めない**(別のcheck名で報告され、
`claude-review`の結果を上書きしない)。

**Rulesetのrequired status checkに配線済み**(2026-08-12確認。Ruleset「main branch protection」の
required status checksに`claude-review`が含まれる)。上記の赤はマージをブロックする
(オーナーのbypassを除く)。配線前のPRでは赤がマージを止めていなかった時期があるので、
過去のマージ実績から「赤でも実害がない」と類推しないこと。

#### 赤・無投稿に遭遇したときの見分け方(型の切り分け)

`check-claude-review.mjs`は赤の理由をStep Summary(`::notice`にも同文が出る)に明示する。
人が(または`/code-review`のセルフレビューで代替する側が)実際に遭遇したときは、
まずこのメッセージ文言で型を切り分ける。

| メッセージ | 型 | 対応 |
| --- | --- | --- |
| 「Claude actionは実行されましたが、対象head以降のclaude[bot]投稿が0件です」 | ゲートによる赤(投稿0件) | 下記「投稿0件の原因を切り分ける」へ |
| 「Claude actionは実行され、対象head以降にclaude[bot]の投稿がありますが、head SHAマーカーに一致する投稿が0件です。promptのマーカー指示が守られていない可能性があります」 | ゲートによる赤(マーカー不一致) | promptのマーカー指示が守られていない可能性。再実行して改善しなければissueへ記録する |
| 「Claude actionが失敗したため投稿件数判定は対象外です。元stepの失敗を維持します。」 | action自体の実行時失敗(元stepの赤をそのまま維持) | `gh run view <run-id> --log`で`"is_error": true`を確認する。再現性のない失敗であることが多く、失敗ジョブの再実行で完走することがある(PR #139・run 31348464844で実測。再実行後3m45sで完走し指摘0件を投稿した。原因の特定は#150) |
| 「Claude actionはworkflow validation skipでした。投稿件数判定は機械では行えません。」 | 意図的スキップ(`claude-review.yml`自体を変更するPR) | 上記のworkflow検証スキップの対処に従う |

**投稿0件の原因を切り分ける。**上表1行目(ゲートによる赤・投稿0件)の場合、次にPRが
機微なパスを変更していないか確認する。対象は`.claude`, `.mcp.json`, `.claude.json`,
`.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md`, `.husky`。
`anthropics/claude-code-action`はこれらのパスを、レビュー実行前に`origin/main`の内容へ
強制的に復元する(PRがレビューエージェント自身のツール実行環境を乗っ取るのを防ぐ
セキュリティ機構)。該当する場合、レビュー対象の変更点そのものが復元によって消えており、
これが投稿0件の原因である可能性が高い(issue #91、PR #89で実例確認。`gh run view <run-id> --log`
の`Restoring .claude, .mcp.json, ... from origin/main`と`permission_denials_count`が
0より大きいことが手がかりになる)。ただしこれらは原因の手がかりに過ぎないため、機微パス起因と
断定する前に、対象run開始以降の`claude[bot]`について、issue comment・inline review comment・
review bodyの3面すべてで投稿が無いことを確認する(一部だけ投稿されている場合は別の原因を疑う)。
該当する場合は、上記のworkflow検証スキップと同様に`/code-review`スキルで自分でレビューする。

**`claude-review`はテストを実行していない。**レビュー環境には`node_modules`が無く、
ネットワークアクセスも制限されているため、`yarn lint` / `yarn typecheck` / `yarn test`を
実行して確認することができない(PR #142のレビュー本文で明記、観測日2026-08-10)。
指摘の有無はコードを静的に読んだ結果であり、テストの合否は`unit-test` / `typecheck` /
`lint`の各CI checkだけが根拠になる。逆に、テストが緑であることも「claude-reviewが
実レビューした」ことの根拠にはならない(上の型の切り分けが扱う話)。

### Codex Cloud

**Draft中・Ready以降で必須とするレビューの組み合わせは
`.claude/skills/pr-review-flow/SKILL.md`「Draftフェーズ」「Ready化」のパターン表が正本
(#220)。ここには書き写さない。**以下は、その表で使う判別基準と、発火タイミングの実測記録。

**判別基準(Codexが「利用上限」かどうか)。**この基準は`.claude/skills/pr-review-flow/SKILL.md`
「Draftフェーズ」のDraft必須レビュー表だけが使う。Ready化以降の表はCodex・CodeRabbitの
可用性を問わないため対象外。次の両方を満たすこと。

- ローカルCodex(`mcp__codex__codex`)が上限到達の文言(`docs/model-routing-details.md`
  「上限到達時に読む手順」の判別表の「上限到達」行、`You've hit your usage limit`と
  `try again at <時刻>`の両方)で失敗している
- 手動`@codex review`が`You have reached your Codex usage limits for code reviews`
  (実測文言)で失敗している

**Draft PRへのpushではCodex Cloudの自動投稿が発火しない**(`.claude/skills/pr-review-flow/SKILL.md`
「Draftフェーズ」のCodexの項、PR #113で確認済み)。この事実を判別にどう扱うかは
`.claude/skills/pr-review-flow/SKILL.md`「Draftフェーズ」が正本(ここには書き写さない)。

**両方が同一の利用上限に起因していることを確認できた場合に限る。**Cloud側(手動`@codex review`)
だけが失敗してローカルは未試行、またはCloud側の失敗が別の理由(一時的な通信エラー等、
`docs/model-routing-details.md`「失敗の分類」の「不明」相当)である可能性を除外できない
場合は、上限到達とは扱わない。

**発火タイミングの実測。**Ready後にCodexの投稿を探す場合の参考情報(#220以降、マージ前に
能動的に待つ義務は無いが、投稿があれば解釈が必要になる)。

- PR #113(2026-08-09): Ready化後の新規pushでは、手動メンション無しで自動投稿された
  (push後約3分)。Ready化そのもの(pushを伴わない`gh pr ready`単体)では8分以上経っても
  自動投稿が無かった
- PR #169・#170・#173・#174(2026-08-11)、PR #161: **Ready化そのもの**(新規pushを一切
  挟まない`gh pr ready`単体)でも約3分後に自動投稿されることを5件連続で確認した。#113との
  食い違いの原因は特定できていない(推測で埋めない)。より新しく件数の多いこちらを現在の
  挙動として優先することはIssue #165でPO確認済み
- **同一HEADに対してCodexの結果が複数投稿されることがある(PR #173実測、`gh pr ready`実行
  15:43:46Zに対し、同一コミットへ15:38:54Zと15:46:51Zの2件。#180で見落としが実際に発生した)。**
  採否ルールは`.claude/skills/pr-review-flow/SKILL.md`「指摘の扱いとマージ」が正本
  (ここには書き写さない)
- **Codexの投稿は`Reviewed commit`を含む定型文で、issueコメント・レビュー本文の両方に
  出現しうる。**`commit_id`フィールドでしかSHAが得られないケースは観測していない。短縮SHAは
  `gh api repos/{owner}/{repo}/commits/<短縮SHA>`でフルSHAに解決してから比較対象のHEADと
  突き合わせる(前方一致だけでは複数コミットに一致しうる。解決に失敗した場合
  ——存在しない短縮SHAはHTTP 422等——は「一致」と判定しない、fail-closed)
- **指摘0件のときも、単独の👍リアクションではなくテキストコメントで`Reviewed commit`を
  伴って投稿される(PR #168〜#171、Draft中5巡すべてで実測)。**GitHubのリアクションは
  コミットSHAに紐づかないため、👍単独は「投稿を得た」と判定しない

**実例(#204、PR #207、2026-08-12)。**ローカルCodexが
`You've hit your usage limit... try again at Aug 18th, 2026 9:20 AM`で失敗し、Draft前
セルフレビューは`/code-review`に切替(skill既定の手順どおり)。Draft作成直後の
`@codex review`とReady化契機の自動投稿の両方でCodex Cloudが
`You have reached your Codex usage limits for code reviews`を返した。当時は「Codex上限時は
claude-review + CodeRabbitの結果で代替してよい」という規定でマージ前の義務を満たした
(本PR自身がこの代替の第1号適用)。**この規定は#220でDraft必須の(Codexまたは CodeRabbit)の
ORへ吸収され、別概念としては解消済み。**当時の判定手順の記録として残す。

### CodeRabbit

FreeプランはGitHub連携のPRレビューが**1回/時/開発者**に制限されている
(PR #35で実際にレート制限を確認済み。詳細は`docs/roadmap.md`「CodeRabbitの導入」参照)。
Draftで短時間に何度もpushしても2回目以降はスキップされうる。

**レート制限通知の実測(経路別)。**発生経路によって、どの面に何が出るかが異なるため、
`.claude/skills/pr-review-flow/SKILL.md`「Draftフェーズ」の判別で「レート制限」と確認できるのは
次のいずれかに一致する場合に限る。

1. **PR作成時の自動レビュー**: issueコメントとして「Review limit reached」の見出しと
   「Next review available in: N minutes」を含む定型文が投稿される(PR #225、
   2026-08-13T01:25実測)
2. **push時の自動レビュー**: **issueコメントは投稿されない。commit statusにのみ現れる**
   (`context: CodeRabbit`、`state: success`、`description: Review rate limited`。
   PR #225コミット`22ca8bb`、2026-08-13T02:53実測)。**`state`は`success`になるため、
   `gh pr checks`もGitHub UIも成功として表示する。**レビューが1行も行われていないことは
   `description`の文言でしか判別できない
3. **手動`@coderabbitai review`コマンド**: issueコメントの返信として「Review rate limited」
   (PR #35、2026-08-07実測。`docs/roadmap.md`「CodeRabbitの導入」参照)

**push時のcommit statusの取得コマンド。**

```bash
gh api repos/{owner}/{repo}/commits/<SHA>/status \
  --jq '.statuses[] | select(.context == "CodeRabbit") | "\(.context)\t\(.state)\t\(.description)"'
```

**このエンドポイント(combined status)はcontextごとに最新の1件だけを返す。**
複数のstatusを履歴として返す別エンドポイント(`GET /repos/{owner}/{repo}/statuses/{sha}`)と
混同しないこと。実測(コミット`22ca8bb`、2026-08-13): combined statusは`CodeRabbit`が1件、
history(`/statuses/{sha}`)は3件(`Review queued` → `Review in progress` → `Review rate limited`
の順、**新しい順**)を返した。ページングや「最新順に並べ替えてから末尾を取る」処理は、
combined statusを使う限り不要。

**`gh api repos/{owner}/{repo}/commits/<SHA>/check-runs`には出ない**(check-runではなく
commit statusのため)。`gh pr view --json statusCheckRollup`には含まれるが、
`.name`/`.conclusion`は`null`になり、`.context`/`.state`を見る必要がある
(この取り違えでレート制限を見落とした実例がある。PR #225)。

上記のいずれにも一致しない失敗の扱いは`.claude/skills/pr-review-flow/SKILL.md`
「Draftフェーズ」が正本(ここには書き写さない)。

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
#    1のgh apiの出力をいったん変数に受け、代入コマンド自体の成否を`||`で明示的に確認する。
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
