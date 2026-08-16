# PRレビューフローの根拠と、問題発生時の対処

`.claude/skills/pr-review-flow/SKILL.md` の手順がなぜそうなっているかと、quota・
レート制限・`claude-review.yml`変更時のスキップなど、問題に遭遇したときだけ使う対処。
通常のPR作業ではこの文書を読まなくてよい。

規則そのものは `.claude/skills/pr-review-flow/SKILL.md` にある。ここには書き写さない。

## Draft先行の根拠

PR #18〜#32の実績分析(Claude/Copilotの指摘重複率、Copilotのクレジット消費が
実測で1レビューあたりプレミアムリクエスト13回相当。公式の固定値ではなく実績値)に基づく判断。

## 束ねPRの根拠

`.claude/skills/pr-review-flow/SKILL.md`「束ねPR」と`docs/task-management.md`「Issueを束ねて
1本のPRにする」の運用がなぜそうなっているかの実測根拠。**運用を確立した最初の前例は**
PR [#173](https://github.com/reitojike/stage-tracker/pull/173)(Issue #129/#108/#148、
3件を束ねた)。以降の実例(#207/#217/#225)は`docs/task-management.md`「Issueを束ねて
1本のPRにする」を参照(ここには書き写さない)。

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

**束ねる本数を3件までとした理由。**当時#173は3件を束ねた唯一の実例で、4件以上を束ねた実測が
無かった。PR差分規模は素の差分で+35/-12・4ファイル変更(計47行)であり、3 Issue分を束ねても
300行目安・135行中央値のいずれにも収まっていた。振り返りコメントでは「対象3件はいずれも
正しい側が他の記述から一意に決まる追従漏れで、判断はほぼ発生せず」と明記されており、
判断合計3個以内の目安からも外れていない。実績が1件しか無かったため、上限は保守的に実例の
本数(3件)に置いた。**その後#207/#217/#225が加わり実例(PR)は4本になったが、いずれも束ねた件数は3件以下
のままで、上限を見直す条件(1本のPRに4件以上のIssueを束ねた実測)は満たしていない**
(issue #228。現状の判断は`docs/task-management.md`「Issueを束ねて1本のPRにする」が正本)。

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

**実レビュー(job実行)は`opened`/`reopened`と、明示的な`review:full`ラベル付け直しに限る(#244)。**
(`labeled`イベント自体は`review:full`以外のラベルでも起動するが、job条件でskipされる。
`#95`の穴の再導入防止のため、skip時は`claude-review`とは別名のcheckとして報告する)
以前は`synchronize`(push)のたびに自動発火していたが、起動回数の実測(2026-08-13時点で
161起動、`governance-docs`を含むPR上位6本に集中)から起動コストが最大の要因と判明したため
止めた。規則そのものは`.claude/skills/pr-review-flow/SKILL.md`「Draftフェーズ」
「Ready後の運用」が正本(ここには書き写さない)。

**claude-reviewは差分の外を読まない(#242)。**`--allowedTools`は`gh pr diff`/`gh pr view`/
`gh pr comment`と`Read(.claude-pr/**)`(復元対象パスの退避先限定)だけで、`Read`/`Grep`/
`Glob`/`Bash(git ...)`を持たない。したがってclaude-reviewの指摘0件は「差分の外を確認した」
ことを意味しない。`AGENTS.md`の`## Code Review Rules`がP0/P1と定める観点のうち、差分の外を
読まないと判定できないもの(`common/`への複製、型の二重定義、成果物間の矛盾、正本の
複数配置、automation-configの関連文書整合)は、CodeRabbit・Codex Cloud・Draft前
セルフレビューが担う。これは役割分担であって欠陥ではない(#186決定4)。実測の指摘あり率
41.0%が4面最低なのは、この構造の帰結として説明できる。**汎用`Read`/`Grep`/`Glob`は
付与しない方針**(#242。`claude-review.yml`が`pull-requests: write`/`issues: write`/
`id-token: write`とOAuthトークンを持つワークフローであるため、権限拡大には別途の
根拠が要ると判断した)。

**review:full運用のコスト確認。**`check-claude-review.mjs`の診断行(`total_cost_usd`等)は
`GITHUB_STEP_SUMMARY`だけでなく`::notice::`にも出す(#244)。Check Runs Annotations API
(`gh api repos/{owner}/{repo}/check-runs/{check_run_id}/annotations`)から個別runのコストを
機械参照できる。複数runをまたいだ自動集計は未対応(2026-08-14時点。必要になれば別途起票)。

`{check_run_id}`は対象SHAに対する`claude-review`のcheck runを`check-runs` API(`SKILL.md`
「マージ直前」の照合コマンドと同じ形)で特定する。`review:full`を同一SHAに複数回付け直した
場合は`started_at`が最も新しいrunを選ぶ(CodeRabbitの指摘・2026-08-14)。該当runが1件も
無い場合は診断値を取得できなかったものとして扱う(取得失敗を成功扱いにしない)。

```bash
# HEAD_OIDは`SKILL.md`「マージ直前」で記録したものと同じ値(このスニペット単体では未定義)
HEAD_OID=$(gh pr view {number} --json headRefOid --jq .headRefOid)
CHECK_RUN_ID=$(gh api "repos/{owner}/{repo}/commits/$HEAD_OID/check-runs" --paginate --slurp |
  jq -r --arg sha "$HEAD_OID" '
    [.[].check_runs[] | select(.name == "claude-review" and .head_sha == $sha)]
    | sort_by(.started_at) | last | .id // empty')
test -n "$CHECK_RUN_ID"
gh api "repos/{owner}/{repo}/check-runs/$CHECK_RUN_ID/annotations" --paginate
```

**拒否の内訳(どのツール呼び出しが拒否されたか)はaction出力から機械的に取得できない
(#262。観測性の欠陥として記録するにとどめ、取得のために`--allowedTools`やactionの
バージョンは変更しない)。**`permission_denials_count`は集計値のみで、`show_full_output`
既定`false`のジョブログに現れるのは`system/init`と`result`の2イベントだけである
(`docs/research/review-tools/claude-code-action.md`軸9、B等級で確認済み)。`execution_file`
(Claude Agent SDKが返す`SDKMessage`配列をそのままJSON化したもの)自体に個別の拒否内訳を
持つフィールドが存在するかは、同台帳の軸10で「公式に未文書化」と記録されている
(`sanitizeSdkOutput`が集計する元の値が生JSONにも残っている可能性はソースの参照関係から
推論できるが、確定した事実ではない、D等級)。実測(#262、PR #260): 同一head SHAへの
`review:full`再発火3回で`permission_denials_count`が7→10→19と単調に増加し、3回目は
`--max-turns`上限まで焼き切って$7.31を無駄にした。この実測を踏まえ、同一head SHAへの
反復失敗そのものを検知するcircuit breakerを導入した(下記)。

#### 同一head SHAへの反復失敗を検知するcircuit breaker(#262)

claude action(有料。大差分では`--max-turns`上限まで焼き切りうる)を起動する前に、
「直近の同一head SHAでclaude-reviewが既に2回
(`.github/scripts/check-claude-review.mjs`の`MAX_TOLERATED_CLAUDE_REVIEW_FAILURES`)
失敗しているか」を`circuit-breaker`という名のstepで確認する。該当すれば
claude actionを起動せず、`claude-review`checkを赤にする(claude actionを起動しない分、
コストは焼かない)。**`--max-turns`の値そのもの(60が適切か)は#254(フェーズ2)の対象。**
このcircuit breakerは値を変えず、「直っていないのに同じ失敗を繰り返し焼く」ことだけを止める。

- **失敗の数え方。**対象head SHAの`claude-review`という名のcheck runのうち
  `conclusion === "failure"`のものだけを数える。`cancelled`(concurrencyによる世代交代)は
  「直っていない」を意味しないため対象に含めない
- **`commits/{sha}/check-runs`の取得に`filter=all`を指定している(既定は`latest`)。**
  `filter=latest`が畳むのは**同一workflow runの再試行(`run_attempt`)であって、
  review:full再ラベルが作る別々のworkflow runではない**(PO実測・2026-08-16。
  別run3件はいずれも`filter=latest`でも各2件観測され、同一run内の再試行1件のみ
  `filter=latest`で1件・`filter=all`で2件になった)。**`filter=all`が必要な理由は、
  型(b)の対処である「再実行」が`run_attempt`を増やす経路として運用に正規に
  組み込まれているため。**試行ごとに個別に課金されるので、この経路を`latest`で
  畳むと「1回焼いた」としか数えられずコスト超過防止という目的に反する
  (`check-claude-review.mjs`の`checkRunsQuery`直上のコメントに詳細)。**閾値2の
  意味は、失敗が別runにまたがるか同一runの再試行かによらず「このhead SHAで
  課金を伴う失敗を2回重ねたら3回目を見送る」であり、`filter=all`化で
  ずれてはいない**(PO確認・2026-08-16)
- **このstep自体の失敗はjob全体を赤くしない。**判定の正本は常に「Claude Review 投稿確認」
  step(`CIRCUIT_BREAKER_SKIP`env経由でskip状態を受け取り、trueならAPI呼び出しをせず
  即座に失敗する)に一本化する。**加えて`continue-on-error: true`を付けている。**
  このstepが参照するscriptは常にbase SHA(main)から取得されるため、この機能を追加した
  PR自身のCIでは、mainがまだ`CHECK_MODE`を解釈しない旧版scriptを実行して
  `CLAUDE_OUTCOME`未設定でthrowする(Issue #262本文が明記する「このPRは自分自身では
  検証できない」という既知の制約と同じ形)。`continue-on-error`が無いと、それだけで
  job全体が赤くなり後続stepが暗黙の`success()`判定でskipされる
- **circuit-breaker step自体が失敗(throw)すると`writeOutput`が呼ばれず、出力`skip`は
  未設定(空文字)のまま後段へ渡る。**空文字は投稿確認step側の`CIRCUIT_BREAKER_SKIP_ERROR`
  検証で拒否されるが、claude actionの`if`条件(`!= 'true'`)は空文字を満たすため
  claude actionは起動して課金される一方、投稿確認stepは必ず赤くなるという非対称が
  生まれる(CodeRabbit指摘・2026-08-16)。**最終stepのenvで
  `${{ steps.circuit-breaker.outputs.skip || 'false' }}`とし、未設定をfail-open側
  (false)へ寄せて解消した**(GitHub API取得失敗時のfail-open方針と揃える)
- **`continue-on-error: true`のこの理由(base SHA固定scriptとの契約不一致)は、
  このPRがマージされてmainに`CHECK_MODE`契約が乗った時点で消える。**マージ後の
  通常のPRではcircuit-breaker stepはbase SHA側も新しい契約を理解するため、
  この理由で失敗することは無くなる。**`continue-on-error`をその時点で撤去するかどうかは
  本Issueでは決めない**(直後の「GitHub API取得自体の失敗はfail-openにする」判断を
  恒久的に望むなら、`continue-on-error`を残す判断もありうる。**撤去せず残す場合は、
  このstepのコメントの理由を「一時的な契約不一致の回避」から「API不調時のfail-openを
  安定させるための恒久措置」に書き換えること**(PO確認・2026-08-16)
- **既知の欠落: circuit breaker自体が壊れて常に不発(skip=false)になった場合を検知する
  手段が現状無い。**`continue-on-error: true`とGitHub API取得失敗時のfail-open設計を
  組み合わせているため、「反復失敗が実際に起きていない」状態と「circuit breakerが
  壊れていて何も検知できていない」状態が外から区別できない。本Issueが直そうとしている
  症状(「実行された」と「何も出さなかった」が区別できない)と同じ形の穴が、
  circuit breaker自身にも残っている。塞ぐのは本Issueのスコープ外とし、#254/#257側の
  材料として記録するにとどめる(PO確認・2026-08-16)
- **GitHub API取得自体の失敗はfail-openにする(投稿確認stepの他ゲートとは非対称)。**
  fail-closedにすると、GitHub APIの一時的な不調が初回起動のPRまで巻き込んで
  claude-reviewを止めてしまう副作用の方が大きいと判断した(#262)
- **`permissions:`に`checks: read`を追加している。**`commits/{sha}/check-runs`の読み取りに
  GitHub REST APIが要求する権限で、`--allowedTools`(claude actionへ渡すモデルのツール権限)
  とは別の軸(ワークフロー自身の`GITHUB_TOKEN`に対する読み取り専用権限)。無いと
  `getCheckRuns`が403で失敗し、上記のfail-open設計によりcircuit breakerが常にトリガー
  されなくなる(checkは赤くならないため気づきにくい退行。#262セルフレビューで発覚)
- **CLAUDE_CODE_OAUTH_TOKEN未設定時はcircuit breakerより先に判定する。**
  tokenが無ければどのみちclaude actionは動かないため、「token不足」のメッセージを
  「circuit breaker発動」のメッセージで覆い隠さない(#262セルフレビューで発覚)。
  当初は`check-claude-review.mjs`側の判定順序だけを直したが、**workflow側の
  step自体の実行順序が「circuit-breaker → token確認」のままだと、token不足時にも
  無駄なGitHub API呼び出しが発生する。**「Check for CLAUDE_CODE_OAUTH_TOKEN」stepを
  circuit-breaker stepより前に移動し、circuit-breaker stepの`if`にも
  `steps.check.outputs.enabled == 'true'`を追加した(CodeRabbit指摘・2026-08-16)
- **claude-started stepのif条件をclaude actionと揃えている。**揃えないと、
  circuit breakerがskipした回(claude actionは実際には起動していない)にも
  `ACTION_STARTED_AT`へ開始時刻が記録され、「実行状態の記録」stepの診断ログが
  誤った開始時刻を示す(CodeRabbit指摘・2026-08-16)

#### `docs/**`の大差分PRでのbypass既定化(フェーズ2まで。#262)

**フェーズ2(#254)が着地するまで、`docs/**`の大差分PR(目安: PR #260の1,740行や
issue #256の想定1,591行のように、複数ファイルを横断する仕様台帳級の差分)では、
`claude-review`のbypassを既定経路とする。**根拠はPR #260のbypass理由と同じ
(`AGENTS.md`の`automation-config`が P0 とする「required checkが永久にpendingになり得る」に
該当し、`--allowedTools`に汎用`Read`/`Grep`/`Glob`が無い構造上、この種の大差分では
claude-reviewが構造的にグリーンになり得ない。上記circuit breakerはコストを止めるための
ものであり、この構造そのものは変えない)。**GitHubのRulesetはrequired checkを1本だけ
選択的に迂回する機能を持たない。**bypassは常にオーナー権限による全体迂回であり、
運用として`claude-review`以外が赤くないことをマージ直前に確認したうえで使う
(実務上「`claude-review`1本だけをbypassする」と表現しているのはこの運用上の意味であり、
GitHub機能としての選択的迂回ではない。Copilot指摘・2026-08-16)。bypassする場合も
CodeRabbit・Codex Cloud・Draft前セルフレビューは通常どおりすべて通す。

**終了条件は#254の成果がこのリポジトリの設定に反映された時点。**それまでは、
上記profileに該当する大差分PRで`claude-review`が「実行完了・投稿0件」または
circuit breaker発動で赤くなった場合、再実行せずbypassしてよい
(`docs/pr-review-flow-details.md`「赤・無投稿に遭遇したときの見分け方」で型を
確認したうえで判断する)。

`claude-review.yml`自体を変更するPRでは、GitHub Actions側のワークフロー保護機構
(PRがワークフローファイル自体を書き換えて昇格した権限で任意のコードを実行するのを防ぐもの)
により、`anthropics/claude-code-action`が実際にはレビューを実行せず正常終了する
(exit code 0、`gh pr checks`では`pass`と表示される)。ログに
`Skipping action due to workflow validation`が出ていれば該当する
(`gh run view <run-id> --log`で確認)。quota失敗時と同様、`pass`表示だけでは
「レビュー済みで指摘なし」と区別がつかない見落としパターン。該当する場合の対処は
`.claude/skills/pr-review-flow/SKILL.md`「Claude」の項が正本(セルフレビュー + CodeRabbit
必須、CodeRabbitを取得できない場合はReady化しない。ここには書き写さない)。

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
| `claude-review.yml`自体を変更するPR(上記のworkflow検証スキップ) | 通常は緑(注記のみ)。**ただし復元対象パスを変更しているのに`--allowedTools`に読み取り手段が無い場合は赤**(型(c)のゲート。下記) | レビュー内容そのものは機械では埋められない。赤にすると`claude-review.yml`を触るPRが恒久的にマージ不能になるため無条件緑が原則だが、読み取り手段の欠落はレビューの実行結果に関係なく静的に判定できるため例外的に赤くする |
| 同一head SHAでclaude-reviewが2回以上失敗している(連続でなくてもよい。circuit breaker。#262) | **赤**(claude actionを起動せず見送る) | 直っていないのに同じ失敗を繰り返し`--max-turns`まで焼くのを防ぐ(実測: PR #260で3回目が$7.31を無駄にした。詳細は上記「同一head SHAへの反復失敗を検知するcircuit breaker」) |
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
| 「Claude actionが失敗したため投稿件数判定は対象外です。元stepの失敗を維持します。」 | action自体の実行時失敗(元stepの赤をそのまま維持) | `gh run view <run-id> --log`で`"is_error": true`を確認する。再現性のない失敗であることが多く、失敗ジョブの再実行で完走することがある(PR #139・run 31348464844で実測。再実行後3m45sで完走し指摘0件を投稿した。原因の特定は#150)。**ただし原因が特定できている場合は再実行しない**(#262。症状の分類であって原因の分類ではないため、症状レベルの対処が特定済みの原因を上書きしてはならない。実例: PR #260の3回目は本行に該当したが、拒否件数が7→10→19と単調増加していたため「同じ場所」への再実行と判断でき、再実行せず本Issueの修正に進んだ) |
| 「Claude actionはworkflow validation skipでした。投稿件数判定は機械では行えません。」 | 意図的スキップ(`claude-review.yml`自体を変更するPR) | 上記のworkflow検証スキップの対処に従う |
| 「このPRは復元対象パスを変更していますが、.claude-pr/ を読む手段(Read(.claude-pr/**)等)が --allowedTools に含まれていません。レビューは復元後(origin/main)のツリーを見たまま完了した可能性があります。」 | ゲートによる赤(型(c)。下記) | `--allowedTools`の配線を確認する。投稿の有無によらず赤くなる |
| 「直近の同一head SHAでclaude-reviewの投稿確認が既に2回失敗しているため、起動を見送りました(コスト超過防止。#262)。…」 | circuit breakerによる赤(claude actionは起動していない) | 再実行では直らないパターン(同一head SHAでは同じ判定を繰り返す)。原因を切り分けたうえで、`docs/**`の大差分PRなら上記「大差分PRでのbypass既定化」に従う。新しいpush(head SHAの変更)があれば失敗回数はリセットされる |

#### 型(c): 復元後のツリーを見たまま、通常どおり投稿された

復元対象パス(`.claude`, `.mcp.json`, `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`,
`CLAUDE.local.md`, `.husky`)の変更は、投稿0件(型(a))だけでなく、**レビューが完走して
通常どおり指摘0件を投稿する**形でも症状が出うる(issue #229、PR #225 run 31664414158で実測)。
この場合checkは緑になり、型(a)・型(b)のいずれの見分け方にも当たらない。

| 型 | 発見当時のcheck | **現在のcheck** | 投稿 | Issue |
| --- | --- | --- | --- | --- |
| (a) 復元により投稿0件 | pass | **赤**(#95のゲートにより。上記メッセージ表1行目) | 0件 | #91(クローズ済み) |
| (b) `is_error:true`で投稿0件 | fail | **fail**(変わらず) | 0件 | #150(オープン) |
| (c) 復元後のツリーを見たまま通常どおり投稿 | pass | **症状そのものは変わらず検知不能(緑のまま)。ただし`--allowedTools`の読み取り手段が欠落している場合は、その配線ミスを#229の新設ゲートが別途検知して赤にする(下記)** | あり | #229 |

**「発見当時のcheck」と「現在のcheck」が違う行があるのは、発見後に機械検知のゲートを追加したため。**
(a)は#95の修正で赤に変わった。**(c)は違う ——** 症状(レビューが復元後のツリーを見たまま投稿すること)
そのものは今も検知できず緑のままで、#229が新設したのはその原因になりうる設定不備
(読み取り手段の欠落)を検知するゲートである。詳細は直後の段落。

**修正(#229)。**`build-review-prompt.mjs`が変更ファイル一覧から復元対象パスの変更を検出し、
該当時のみpromptに「`.claude-pr/`(復元前のPR版が同じ相対パスで退避されている)を読むこと」
「復元によるカレントディレクトリとの差分を作業ツリーの汚れとして指摘しないこと」を注入する。
`--allowedTools`には`Read(.claude-pr/**)`(パス限定)を追加する。**さらに`check-claude-review.mjs`が、
復元対象パスを変更しているのに`--allowedTools`に読み取り手段が無い状態を機械検知して赤にする**
(投稿の有無によらない。レビュー内容が正しいかは判定しない、読み取り手段の有無だけを見る)。
**`claude-review.yml`自体を同じPRで変更している場合(validation-skipped)も、この検知は働く**
(レビューが実際に走ったかに関係なく判定できる静的な設定チェックのため)。

**この検知が守っているのは「`--allowedTools`の配線が退行していないか」であって、
「レビューが実際に復元後のツリーを見て書かれたか」ではない。**後者は意味理解を要する判定であり
機械では検知できない(`docs/lint-policy.md`「レビュー指摘から静的解析を強化する」の基準で
「該当しない」側)。実際にレビューが復元前の内容(`.claude-pr/`)を読んだかどうかは、promptの
注意書き(上記「修正」)による助言に留まる。読み取り手段が揃っていても、レビューがそれを無視した
残余は本節冒頭の「残存リスク」と同型で、機械的には塞げない。

**投稿0件の原因を切り分ける。**上記「赤・無投稿に遭遇したときの見分け方」のメッセージ表1行目
(ゲートによる赤・投稿0件)の場合、次にPRが
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
(#220)。ここには書き写さない。**以下は、発火タイミングの実測記録。**旧来あったDraft必須表の
判別基準(Codexが「利用上限」かどうかを手動`@codex review`の結果で判定する仕組み)は、
次の段落のとおり#244で廃止した。

**自動発火するのは`ready_for_review`のときだけ(#244で訂正)。**Draft作成時の`opened`、
Draft中の`synchronize`のいずれでも自動発火しない。以前の記載(`opened`で発火する、#186決定4)
は誤りだった。この訂正により、旧来あった「Codexが利用上限かどうか」の判別基準
(手動`@codex review`の結果で判定し、Draft必須レビューのCodex/CodeRabbitのORをどちらで
満たすか決める仕組み)は不要になった —— Draft段階でCodex Cloudが登場する余地が無いため、
Draft必須の非claude-review枠はCodeRabbit単独になった(`.claude/skills/pr-review-flow/SKILL.md`
「Draft PR中の必須レビュー」)。**Draft中に手動`＠codex review`を打つ運用も廃止した**
(結局`ready_for_review`で確実に自動発火するため、Draft中に先取りする意味がない)。

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
ORへ吸収され、別概念としては解消済み。そのORも#244でCodeRabbit単独必須へ一本化されている
(現行の正本は`.claude/skills/pr-review-flow/SKILL.md`「Draft PR中の必須レビュー」)。**
当時の判定手順の記録として残す。

**全角表記をPR本文・PRコメント・Issueコメントにも広げた経緯(#235)。**2026-08-13のPR #233で、「今回はCodexへの
メンションをしない」と説明する目的で半角の`@codex review`をPR本文に書いた結果、Codex Cloudが
意図せず起動した(本文編集で除去し、機能上の実害は無かったが、共有クォータは1回消費した)。
Codex CloudはGitHub Code Reviewの枠を共有しているため(#125)、この種の誤発火1回が
実装用の枠を削る。規定本体は
`.claude/skills/pr-review-flow/SKILL.md`「Draftフェーズ」のCodexの項が正本(ここには書き写さない)。

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
history(`/statuses/{sha}`)は3件(`Review rate limited` → `Review in progress` → `Review queued`
の順、**新しい順**)を返した。ページングや「最新順に並べ替えてから末尾を取る」処理は、
combined statusを使う限り不要。

**`gh api repos/{owner}/{repo}/commits/<SHA>/check-runs`には出ない**(check-runではなく
commit statusのため)。`gh pr view --json statusCheckRollup`には含まれるが、
`.name`/`.conclusion`は`null`になり、`.context`/`.state`を見る必要がある
(この取り違えでレート制限を見落とした実例がある。PR #225)。

上記のいずれにも一致しない失敗の扱いは`.claude/skills/pr-review-flow/SKILL.md`
「Draftフェーズ」が正本(ここには書き写さない)。

**面3(レビュー本文)を全文読むべき理由がもう一つある。**上記のレート制限の`success`罠とは別に、
GitHubはdiffの範囲外の行にインラインコメントを付けられないため、CodeRabbitはそのような
指摘をレビュー本文内に「⚠️ Outside diff range comments」という見出しで折りたたんで投稿する。
`pulls/{n}/comments`(インラインコメント一覧、面4)にはこの折りたたみの中身は出ない。

**実測(PR #237、issue #228)。**round3のレビューで面4のインラインコメントだけを確認して
いたため、「⚠️ Outside diff range comments」節に折りたたまれたMajor 3件を含む4件を
取りこぼしかけた([該当レビュー](https://github.com/reitojike/stage-tracker/pull/237#pullrequestreview-4927695966))。
ユーザーの指摘で気づいた(issue #228の2026-08-13振り返りコメント参照)。

確認手順(面3の取得コマンド、全文読む運用)は`.claude/skills/pr-review-flow/SKILL.md`
「指摘の扱いとマージ」が正本(ここには書き写さない)。

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

### 外部設定の意図する値

**これらはリポジトリ外の設定であり、変更してもdiffに出ず、ずれても機械的には検知されない。**
発火が想定と違ったときは、まずこの表と実際の設定を突き合わせる(#244)。

| 面 | 設定項目 | 意図する値 | 設定場所 | 最終確認日 | 確認手段 | 根拠Issue |
| --- | --- | --- | --- | --- | --- | --- |
| Codex Cloud | レビューのトリガー | PRが`ready_for_review`になったとき | Codex Cloud設定画面(Automatic reviews) | 2026-08-13 | 設定画面で目視 | #186 |
| Codex Cloud | 徹底的なコードレビュー | OFF | Codex Cloud設定画面 | 2026-08-13 | 設定画面で目視 | #186 |
| Copilot | `review_draft_pull_requests` | `false`(Draft中は走らない) | `copilot_code_review` Ruleset(id: 20465536) | 2026-08-14 | `gh api repos/{owner}/{repo}/rulesets/{id}`(手順は上記) | #220 |
| Copilot | `review_on_push` | `false`(Ready後のpushでは走らない) | `copilot_code_review` Ruleset(id: 20465536) | 2026-08-14 | `gh api repos/{owner}/{repo}/rulesets/{id}`(手順は上記) | #220 |
