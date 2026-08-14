---
name: pr-review-flow
description: このリポジトリのPR運用手順。PRを作成する / Draftで出す / gh pr ready でReady化する / レビューボット(Claude, Codex, CodeRabbit, GitHub Copilot)の指摘を分類して対応する / Copilotのプレミアムリクエストやquota上限・レート制限に対処する / PRをマージする、といった作業のときに読む。「PR作って」「レビュー通して」「ready にして」「copilot レビュー」「マージして」で発火。
---

# PRレビューフロー

## 原則

Draft先行の目的は、**Copilotのプレミアムリクエスト消費を「Ready化時の1回」に限定すること**
(ただしquota失敗時・実装変更時は、後述の「Ready後の運用」の条件でマージ直前に手動再リクエストを最大1回まで許容する)。
Claude/Codex/CodeRabbitはDraft中に何度反復してもプレミアムリクエストを消費しない。

この手順の根拠と、quota・レート制限・`claude-review.yml`変更時のスキップなど、問題に遭遇した
ときだけ使う対処は `docs/pr-review-flow-details.md` にある。通常のPR作業ではこのskillだけを読む。

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

## Draft前セルフレビュー

**全PR必須。例外を設けない。**`gh pr create --draft`より前に行う(issue #81)。
「推奨」は守られたか誰にも観測できないため必須にする。軽微な変更にも例外を設けないのは、
「これは軽微か」という判定コストが免除で浮くコストを上回るため。

CIのrequired checkとしての強制状況を確認する必要がある場合だけ、
`docs/pr-review-flow-details.md`「Draft前セルフレビューの強制範囲」を参照。

1. **前提確認。**`pwd`で今どのworktreeにいるかを確認し、ローカル`main`が`origin/main`に
   追随しているかを点検する(`docs/worktree-policy.md`「diffベースのツールを使う前の点検」)。
   ずれている場合は比較基準に`origin/main`を明示する。
2. **既定の手段はローカルCodex(`mcp__codex__codex`)への新規のセルフレビュー依頼1回。**
   **実装に使ったセッションを継続しない。**実装時に置いた前提をそのまま引き継ぐと、
   前提そのものの誤りを見落とすため(issue #102)。Codexでは`mcp__codex__codex-reply`で
   継続しないことがこの一例に当たる。
3. **`/code-review`を使うのは、`common/`・権限/RLS・`supabase/migrations/**`のいずれかに
   触れるPR(既存の3分類経路)、または上記2のCodexが下記「1回」の完了条件(項番4)を
   満たせず切り替えた場合(上限到達を含む)のみ。**それ以外は既定のCodexで足りる。
   **`/code-review`は実装に使った対話セッション内でそのまま呼んでよい。**実装時に置いた
   前提を引き継ぐため、上記2・issue #102が求める独立性(実装に使ったセッションを継続しない)
   を完全には満たせない縮退措置である。Claude Codeのサブエージェントはさらにサブエージェントを
   起動できないため、別のサブエージェント内では`/code-review`が要求する並列展開を行う手段が
   無く(issue #154で実測済み)、新規セッションはエージェントが自律的には開けないため、
   現時点でこれ以上の独立性を確保する手段が無い。levelは`medium`を既定とし、
   3分類経路に該当するPR、または「Draftフェーズ」節が定める
   claude-reviewのworkflow検証スキップに該当するPR(`claude-review.yml`自体を変更するPR)
   のみ`high`に上げる。**上限到達を理由に切り替えたこと自体はlevelを上げる条件ではない**
   (他のいずれにも該当しない上限到達PRのlevelは既定どおりmedium)。`ultra`は使わない。
   levelを具体値で記す理由を確認する必要がある場合だけ、`docs/pr-review-flow-details.md`
   「セルフレビューのlevelを具体値で記す理由」を参照。
4. **このPRが追加した主張の重複をgrepで確認する(governance-docs分類に当たるPRのみ)。**
   差分で新しく書いた主張のキーワードでリポジトリを検索し、同じ根拠を複数のファイルに
   書いていないかを見る。正本以外にヒットしたら、そちらは結論1行 + 正本への参照に畳む
   (索引・短い要約・正本への参照は重複ではない。判定は`AGENTS.md`の`## Code Review Rules`節)。

**Codexへ渡す最低限のコンテキスト:**

- レビュー対象リビジョン(base branchと対象HEADのSHA、`git diff <base>...<HEAD>`の内容)
- PR種別(issue #95の3分類。当てる観点がこれで決まる。新規セッションのCodexはGitHub Issue
  スレッドを読めないため、渡す側が対象パスから該当する分類名を伝える):

  | 種別 | 対象パス |
  | --- | --- |
  | `code` | `**/*.{ts,tsx,mjs}`、`supabase/migrations/**` |
  | `governance-docs` | `docs/**`、`AGENTS.md`、`CLAUDE.md`、`.claude/skills/**`、`.github/pull_request_template.md` |
  | `automation-config` | `.github/workflows/**`、`.github/actions/**`、`.github/scripts/**`、`package.json`/lockfile、`supabase/config.toml`、`.coderabbit.yaml`、Vercel/ESLint/TS/Vitest設定、および他分類に一致しないファイル |

  複数の分類にまたがるPRは該当する観点をすべて当てる。各分類の観点とP0/P1定義の正本は
  `AGENTS.md`の`## Code Review Rules`節を参照する。
- GitHub上のコンテキスト(PRコメント・CI結果・レビュー履歴)がまだ存在しないことの明示
  (Codexが「見えないだけ」なのか「無い」のかを区別できないため)

**レビュー観点:** 上記のPR種別に応じた観点に加え、#79で確立した横展開規律
(同一根拠の指摘が差分内の他ファイル・箇所にも当てはまらないか)を必ず当てる。

**「1回」は回数ではなく、次をすべて満たしたときにだけ完了として数える。**

1. レビュー対象リビジョン(SHA)が記録されている
2. 指摘件数が明示されている(0件なら「0件」と明示する。無言を0件と読み替えない)
3. 各指摘に処置が付いている(本物の修正 / 妥当なnitpickとして修正 / 誤検知として見送り)
4. 呼び出し失敗・コンテキスト超過・空回答・**Codexの利用上限到達**は「レビュー済み」に
   数えない。上限到達かどうかの判別は`docs/model-routing-details.md`「上限到達時に読む手順」
   の判別表に従う(理屈と判別表をここに書き写さない)。上記3の対象PR
   (`common/`・権限/RLS・`supabase/migrations/**`、または上限到達したPR全般)では
   `/code-review`に切り替え、それ以外の
   PRでは新規のローカルCodexを再実行する。**切り替え先(`/code-review`)でも同じ失敗が
   起きた場合は、この4の条件をそのまま適用して再実行する。ただし切り替え先で起きた失敗が
   Claude側の利用上限到達だった場合は再実行せず、`docs/model-routing.md`「上限到達時の
   フェイルオーバー」の既定(Blockedにして待つ)に従う。**同じ問題が3回続く場合は
   `AGENTS.md`のエスカレーション基準(Sonnet→Opus)に従う

**記録は`.github/pull_request_template.md`の「Draft前セルフレビュー」セクションに書く。**
実施主体・レビュー対象リビジョン・結果・指摘と処置を記入する(「静的解析で拾えたはずか」の
自問は下記「マージ後の振り返り」でまとめて行うため、ここでは記入しない)。
**Codexの生出力はPR本文に貼らない。**分類済みの要約と処置だけを本文に転記し、生出力は
折りたたみ詳細かDraft作成直後のPRコメントに置く。

セルフレビューはDraft後のボットレビュー(下記)を置き換えない。減らすのはラリーの母数だけで、
独立した視点は必ず1つ以上残す(claude-reviewが担う。issue #95)。

## Draftフェーズ

PRはまず`gh pr create --draft`でDraft作成する。

- **Claude**(`claude-review.yml`): `opened`/`reopened`で自動的に走る。**push(`synchronize`)では発火しない**(Draft・Ready問わず。#244。起動コストが最大の要因だったため)。Draft・Ready中に再チェックしたい場合は`review:full`ラベルを付け外しして明示的に依頼する(下記「明示的なレビュー依頼」)。観点は`AGENTS.md`の`## Code Review Rules`から変更ファイルの分類に応じて抽出される(`review:full`ラベルを付けると全分類を当てる)。**差分の外は読まない**(`--allowedTools`が`gh pr diff`/`gh pr view`/`gh pr comment`と`Read(.claude-pr/**)`(復元対象パスの退避先限定)のみで、汎用`Read`/`Grep`/`Glob`を持たないため。`common/`への複製、型の二重定義、成果物間の矛盾など差分の外を読まないと判定できない観点はCodeRabbit・Codex Cloud・Draft前セルフレビューが担う。**指摘0件は「差分の外を確認した」を意味しない**。#242)。**「workflowが成功した」を「実レビューが完了した」と読み替えないための機械的なゲートが入っている**(issue #95) —— `CLAUDE_CODE_OAUTH_TOKEN`未設定・実行されたのに投稿0件・総評のマーカー不一致はいずれも**checkが赤**になる。**`claude-review.yml`自体を変更するPRだけは注記のみで緑になる**ため、その回は下記「Draft PR中の必須レビュー」のパターン表にかかわらず**セルフレビュー + CodeRabbitを必須とする**(Draft中はCopilotが走らないため対象外)。**CodeRabbitを取得できない場合はReady化しない**(claude-review自体が欠けている回なので、通常のDraft必須(CodeRabbit単独必須)より厳しくし、セルフレビューも合わせて要求する)。どれで満たしたかをPR本文に書く。**赤になる条件の一覧と、Rulesetへの配線状況は`docs/pr-review-flow-details.md`「Claude Review」を参照**
- **Codex**(Codex CloudのPR自動レビュー): Codex settingsで Automatic reviews を有効化済み(2026-08-10 JST、issue #101)。ワークフローファイルもAPIキーも不要で、ChatGPT Plusの枠内で動く。**GitHub上ではP0/P1の指摘のみ**が投稿されるので、指摘が0件でも「全観点を通過した」とは読まないこと。レビュー観点とP0/P1定義の正本は`AGENTS.md`の`## Code Review Rules`節にある。**自動発火するのは`ready_for_review`のときだけ**(Draft作成時の`opened`、Draft中のpushのいずれでも発火しない。#244で判明。以前の記載は誤りだった)。**Draft中に手動で`＠codex review`を打つ運用はしない**(結局`ready_for_review`で確実に自動発火するため、Draft中に先取りする意味がない。誤発火を避けるためこの文書では全角で`＠codex review`と表記する。実際に打つときは半角`@`に置き換える)。GitHub Actions版の`codex-review.yml`は削除済み(見送りの根拠は`docs/roadmap.md`「保留: 外部アカウント待ち」を参照)
- **CodeRabbit**(`.coderabbit.yaml`): `drafts: true`でdraft中もレビュー対象。pushのたびに自動発火する(claude-reviewと違い明示要求は不要)。**Codex Cloudが`ready_for_review`でしか自動発火しないため、Draft必須のうちclaude-review以外の一角はCodeRabbitが単独で担う**(下記「Draft PR中の必須レビュー」)。レート制限は`docs/pr-review-flow-details.md`「CodeRabbit」を参照
- **GitHub Copilot**(`copilot_code_review` Ruleset): `review_draft_pull_requests: false`のためdraft中は走らない

**Draft PR中の必須レビュー(issue #220)。**`claude-review`は`opened`(Draft作成時)・`reopened`、
または明示的な`review:full`ラベル付け直し(下記「明示的なレビュー依頼」)のいずれかで満たす
(pushごとの自動発火はしない。#244)。ただし上記「Claude」の項が定める`claude-review.yml`
自体を変更するPRの例外はここでも維持される(**Draft中に使える代替はセルフレビューと
CodeRabbitのみ**——Copilotはdraft中は走らないため対象外)。それに加えて、**CodeRabbit**を
必須とする。Copilotはdraft中は走らず、Codex Cloudも`ready_for_review`でしか自動発火しない
ため(上記「Draftフェーズ」のCodexの項)、Draft段階でclaude-review以外に視点を確保する
手段はCodeRabbitのみになる。**#244でDraft中の手動`＠codex review`運用も廃止したため、
以前あった「CodexまたはCodeRabbit」のORはCodeRabbit単独必須に一本化された。**

**CodeRabbitがレート制限中の場合は復帰を待つ**(数十分)。「レート制限中」と判定するのは
`docs/pr-review-flow-details.md`「CodeRabbit」が挙げる明確なレート制限メッセージ
(`Review limit reached`等)で失敗した場合に限る。認証エラー・通信エラー・空応答など、
レート制限と確認できない失敗は「使える」側として扱い、通常どおり取得を試みる
(再試行して改善しなければ`AGENTS.md`のエスカレーション基準に従う)。

**チェックが緑(success)であることを、CodeRabbitのレビューを受けた根拠にしない。**
push時のレート制限はissueコメントを投稿せずcommit statusにのみ記録され、その`state`は
`success`になる(レビュー0行でも成功表示される)。判定は必ずコメント本文・`description`の
文言で行う(実測は`docs/pr-review-flow-details.md`「CodeRabbit」)。

**明示的なレビュー依頼(`review:full`ラベル)。**claude-reviewを狙って再実行させる手段は
このラベルの付け外ししかない。**GitHubは同じラベルが既に付いている状態では`labeled`
イベントを再発火しない**ため、再依頼のたびに一度外してから付け直す
(`gh pr edit {number} --remove-label review:full` → `gh pr edit {number} --add-label review:full`)。
ラベル名のとおり、これは常に**全分類の観点**を当てるフルレビューになる(該当ファイルが
無い分類は素通りするだけなので実害は小さい)。Draft・Ready両方の反復で使う共通の
再依頼手段である(Ready中の反復は下記「Ready後の運用」を参照)。

**governance-docsのみに分類されるPRに限り、Draftでの反復はP0と、実行者の行動が変わる
P1が0になるまで続ける。**他の分類(code・automation-config)のPRでは、従来どおり
指摘が尽きるまで反復する。**docsとcode・automation-configにまたがる複数分類のPRは、
governance-docs側の扱いを適用しない(「複数の分類にまたがるPRは該当する観点をすべて
当てる」(上記「Draft前セルフレビュー」)と同じく、より厳しい側が優先する)。**
軽微(言い回し・表記・レンダリングだけの差)をP1から切り分ける基準の正本は
`AGENTS.md`の`## Code Review Rules`節(`governance-docs`)にある
(理屈をここに書き写さない。片方だけ古くなる)。

**governance-docsのみのPRでは、巡数の固定上限は設けない。打ち切ってよいのは、
直前のpushが少なくとも1巡のレビューを受け、そのラウンドの新規指摘に「本物の修正」が
0件になったときだけ**(「軽微」「誤検知」(下記「指摘の扱いとマージ」の分類)だけが
残っている状態を含む)。行動が変わる修正・コード変更を含むpushでも、
そのレビューがクリーンに返ってくれば同様に打ち切れる
(push自体の内容が軽微修正のみである必要はない。行動が変わるpushだからといって、
クリーンな結果を得るためだけにもう1巡待つ必要はない)。

**裏の義務: 行動が変わる修正・コード変更を含むpushには、必ず1巡レビューを受ける。**
レビューを飛ばして「直したから終わり」でReady化しない。
**打ち切ると決めたラウンドに残っている軽微は直さない。**「見送り(軽微)」として
マージ時の分類コメントに記録する(下記「指摘の扱いとマージ」)。直せばそのpushにまた1巡必要になり、
打ち切り条件が消えるのと同じになる。

**指摘を直すときは、指摘された箇所だけを直してpushしない。**指摘の根拠を一般化し、
このPRの差分の中に同じ根拠が当てはまる他のファイル・箇所がないかを確認してから、
まとめて直して1回でpushする。同一根拠の指摘がファイルごとに1件ずつ返ってくる状態
(PR #32・#60で発生。例: PR #32では「setup用insertの結果を検証していない」が
4つのテストファイルに個別指摘され、PR #60では許可リストの抜け漏れが軸ごとに
複数ラウンドに分けて指摘された)は、横展開を怠ったサインである。

## Ready化

上記の反復終了条件(governance-docsは打ち切り条件、それ以外は指摘が尽きること)を満たしたら
`gh pr ready`でReady for reviewに変える。このタイミングでCopilotの最終レビューが1回走る(`review_draft_pull_requests: false`、Ready化がトリガー)。

**Ready化以降の必須レビュー。**`claude-review` + **Copilot** を必須とする(#220。
`claude-review`側の`claude-review.yml`自体を変更するPRの例外は上記「Draft PR中の必須
レビュー」のとおり維持される)。**`claude-review`は`ready_for_review`でも自動発火しない
ため(#244)、Ready化後にマージするまでの間に`review:full`ラベルで最低1回は明示的に
依頼すること**(具体的な回し方は下記「Ready後の運用」)。

| Copilot | 行動 |
| --- | --- |
| レビューを得られた(`Copilot wasn't able to review any files in this pull request.`のように、対象コードファイルが無いだけの応答を含む。下記「Ready後の運用」参照) | 必須充足。**Codex・CodeRabbitの可用性は問わない** |
| quota失敗等で得られない | 下記「Ready後の運用」の再リクエスト手順(マージ直前に手動で1回まで)を先に尽くす。**それでも得られなければPOにエスカレーションして判断を仰ぐ**(自分で代替を決めない) |

**Draft中にCodeRabbitのレビューを受けたうえでReady化しているはずなので、Ready以降に
CodeRabbitがレート制限でも問題としない**(Codex Cloudは`ready_for_review`で新たに
自動発火する)。

**「マージ前に、その時点のHEADのSHAに対するCodexの結果を最低1回得ることを義務とする」という
以前の規定と、#204で追加した「Codex上限時はclaude-review + CodeRabbitの結果で代替してよい」
という規定は、上記の必須要件に置き換わった。**「代替」という別概念はDraft必須の
(Codexまたは CodeRabbit)のORに吸収され解消済み。**Codex Cloudは Ready後も自動投稿される
ことがあるが**(発火条件・タイミングの実測は`docs/pr-review-flow-details.md`「Codex Cloud」を
参照)、投稿があれば下記「指摘の扱いとマージ」の通常の分類対象にするだけで、マージ前に
能動的に待つ・取りに行く対象ではない。

## Ready後の運用

**claude-review + CodeRabbitの反復。**Ready化以降の`synchronize`(push)ではclaude-reviewは
自動発火しない(#244。CodeRabbitは`drafts: true`のため引き続き自動発火する)。修正のたびに
次のサイクルを回す。

1. ローカルで修正してpushする(CodeRabbitは自動的にレビューする)
2. `review:full`ラベルを付け外し、claude-reviewへ明示的に再依頼する(上記「明示的な
   レビュー依頼」)
3. 両方の指摘を確認し、修正が必要なら1に戻る

**`ready_for_review`以降、この「push→明示依頼→修正」のサイクルを3回行った時点で
P0/P1指摘が枯れていなければ、その場でBlockedにしてPOへエスカレーションする**
(旧「5巡警報」を置き換える基準。3回はReady化以降の回数だけを数え、Draft中の回数は
含めない)。束ねPRで「束ねを解く」を検討する契機も、この基準を流用する
(`docs/task-management.md`「Issueを束ねて1本のPRにする」「束ねを解く」参照)。

Ready化後の追加修正は、ローカルで全部直してからまとめて1回でpushする。
`copilot_code_review` Rulesetの`review_on_push`は`false`に設定済み(2026-08-07適用)なので、
Ready後のpushではCopilotの自動レビューは走らない(CIは通常どおり走るので、機械的な
バックストップは失われない)。
Rulesetの適用状況を確認・変更する必要がある場合は
`docs/pr-review-flow-details.md`「GitHub Copilot」を参照。

Copilotの再レビューが必要なのは次の2つの場合だけで、マージ直前に手動で1回だけ行う。

1. 最初のCopilotレビューがquota上限で失敗し、中身のないコメントしか返っていない
2. Ready後にコードの実装を変更した(ドキュメント・コメント・テスト名のみの修正は対象外)

**次のパターンはquota失敗と見た目が似ているが、上記のどちらにも当たらないため
再リクエストしない。**差分がCopilotのレビュー対象となるコードファイルを含まないPR
(設定ファイル・`.gitignore`・ドキュメントのみ等)では、`Copilot wasn't able to review any
files in this pull request.`という同じく中身のないコメントが返る。これはレビュー対象の
コードファイルが無かっただけでquota失敗ではなく、再リクエストしても結果は変わらないので、
1回までの再リクエストの枠を無駄に消費しない(PR #120で実例確認)。

再リクエストは以下のコマンドで行う。1PRにつき手動再リクエストは1回まで。
**1回で足りない場合(2回目が必要に感じる場合を含む)は、自分でDraftに戻して代替を決めず、
上記「Ready化以降の必須レビュー」のとおりPOにエスカレーションして判断を仰ぐ**(#220)。

```bash
gh api repos/{owner}/{repo}/pulls/{number}/requested_reviewers -X POST \
  -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
```

## 指摘の扱いとマージ

- 人間の承認レビューは必須にしていない(現状は開発者本人のみのため。GitHubはPR作成者自身の
  承認をカウントしない)。マージの実行自体が「人間の確認」に当たる(`docs/prd.md` 8.5)
- ボットの指摘は機械的に全適用しない。「本物の修正 / 妥当なnitpick / 誤検知 / 見送り(軽微)」に
  分類し、何を直して何を意図的に見送ったかをPRにコメントする
- **「見送り(軽微)」は、governance-docs分類のPRで打ち切り条件により直さないと決めた指摘の
  置き場。**判定は「読んだ実行者が取る行動が変わるか」で、基準の正本は`AGENTS.md`の
  `## Code Review Rules`節(`governance-docs`)。指摘の要旨を1行ずつ残す。
  **新しい一覧Issueも専用ファイルも作らない。**この分類コメントが記録そのもので、
  読み返す機会は月末の棚卸し(#119の最終項目。下記「改善点への対応方針」の`後で再評価する`と同じ点)。
  そこで見るのは「放置して実害があったか」の1点だけ
- 「この指摘は静的解析で拾えたはずか」の自問は、下記「マージ後の振り返り」の項目で行う
  (分類の時点では記録しない。判定基準とアクションの正本は`docs/lint-policy.md`
  「レビュー指摘から静的解析を強化する」)
- PRを作成したらCIとレビューボットの結果を待ち、指摘を分類してから自分でマージする。
  mainに直接pushしない

**マージ直前には、まずHEAD OID(`gh pr view {number} --json headRefOid --jq .headRefOid`)
を記録する。**

**続けて、claude-reviewが記録したHEAD OIDに対する結果を持っているか`gh pr checks {number}`で
確認する。**`synchronize`の自動発火を止めたため(#244)、`opened`または最後の`review:full`
実行より後にheadが進んでいれば、`claude-review`(required check)は未達のままになる。
**無ければ`review:full`ラベルを付け直し、結果が出てから先へ進む**(確認せずマージを試みると
required checkの未達でGitHub側にブロックされる。永久にpendingにはならないが、
気づいてからの手戻りを避けるため先に確認する)。

その上で、次の4面をすべて再取得する。

1. CI: `gh pr checks {number}`
2. issueコメント(総評・案内文): `gh api repos/{owner}/{repo}/issues/{number}/comments --paginate`
3. レビュー本文(claude-review・Copilot・**Codex**の総評):
   `gh api repos/{owner}/{repo}/pulls/{number}/reviews --paginate`
4. インラインレビューコメント(行に紐づく個別指摘。Codex・CodeRabbit・Copilotが使う):
   `gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate`

**加えて `yarn review:stats --pr {number}` でボット投稿の分類記録(本物の修正/妥当なnitpick/
誤検知/見送り)を機械集計し、PR本文の記載と食い違っていないか確認する。**

**2・3は`gh pr view {number} --json comments`/`--json reviews`でも取得できるが、
これらは100件を超えると同じくページネーションされずに欠落しうる。**4と揃えて
`gh api`の`--paginate`付きコマンドを既定にする。実際にPR #174で4(インラインコメント)
だけ取得漏れし、CodexのP1指摘を見落としたままマージした。4は既定で最初の30件しか
返らないため、`--paginate`が無いと31件以上ある場合に後続ページの指摘を見落とす。

**Codexは`Reviewed commit`を面2(issueコメント)と面3(レビュー本文)の両方に投稿しうる。**
指摘0件のときは面2(issue comment、例: PR #173の15:38:54Z)、指摘ありのときは面3の本文
**と同時刻に**面4のインラインコメント(指摘の詳細)が投稿される実例がある(例: PR #173の
15:46:51Z。実測の詳細は`docs/pr-review-flow-details.md`「Codex Cloud」参照)。**この場合も面3の本文には
Codexの標準テンプレート(`Reviewed commit: <SHA>`を含む定型文)がそのまま投稿されており、
`commit_id`フィールドでしかSHAが得られないケースは観測していない。**SHAの解決手順
(短縮SHAをフルSHAへ解決してから比較する、fail-closedにする等)は
`docs/pr-review-flow-details.md`「Codex Cloud」を参照。**`Reviewed commit`を探す際は、
面2・面3の両方を対象に含めれば足り、`commit_id`フィールドへの判定ロジック追加は不要
(本文にmarkerが実際に欠けるケースが観測されたら、その時点で改めて判定手段を見直す)。

**CodeRabbitは、GitHubの制約でインライン化できない指摘を面3(レビュー本文)内に
折りたたんで投稿する。**面4(`pulls/{n}/comments`)だけではこの折りたたみの中身は
見えないため、面3は各レビューの`.body`を折りたたみを含めて全文読む(見出し文字列・
実測はPR #237。詳細は`docs/pr-review-flow-details.md`「CodeRabbit」参照)。

**同一HEADに対して同一ボット(Codex等)の投稿が複数あった場合、判定の根拠は最後に到着した
ものとする。**ただし逆方向(古い結果に指摘があり、新しい結果は指摘なし)のときは「最新が
指摘0件だから安全」と判断せず、同一HEADへの全結果を確認して未解決の指摘を分類対象とする
(後続の結果がその指摘に明示的に触れて解消済みとしている場合を除く。実測・実例は
`docs/pr-review-flow-details.md`「Codex Cloud」参照)。

**4面の取得中に新しいpushが起きると、確認した内容と実際にマージするコミットがずれる。**
これを防ぐため、マージ実行時は4面の取得を始める**前に**記録したHEAD OIDを
`gh pr merge {number} --match-head-commit <OID>`に渡す。取得後(取得中を含む)に
新しいpushがあった場合はマージ自体が失敗するため、古い確認結果のまま気づかずマージ
することを防げる。

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
  Sonnet→Haiku)に渡せたか。渡せたはずなら、`docs/task-management.md`「Issue内でモデル階層を分担する」の
  どの基準に当てはまったはずかを書く。渡さなかったのが正しい場合(下限を満たさない等)も理由を1行書く
- **セルフレビュー・ボット両方の指摘は静的解析で拾えたはずか**: `docs/lint-policy.md`
  「レビュー指摘から静的解析を強化する」の自問を、Draft前セルフレビューの指摘と
  Draft後のボット指摘の両方に当てる(この振り返り項目で一括して行い、分類の時点では
  個別に問わない)。該当する場合の判定基準とアクションは同節を参照(判定基準・アクション
  自体は変更しない)

**「より安いモデル層で実行できたか」を明示的に問うのは、振り返りを作業した本人(同じモデル)が行うためである。**
「自分がこの作業をすべきだったか」というコスト面の視点は、問いに書いておかないと自然には出てこない
(`docs/lint-policy.md`「この指摘は静的解析で拾えたはずか」と同型の自問。
issue #43の振り返りでは挙がらず、外部からの指摘で発覚した)。

長い分析は不要。数行程度でよい。

### 改善点への対応方針

「次回改善したい点」は書きっぱなしにしない。**項目ごとに対応方針を1つ決め、
振り返りコメントに書く。**「より安いモデル層で実行できたか」が「渡せたはずだった」だった場合も
同様に対象とする(渡せなかった理由を1行書くだけでは、issue #43のときと同じ抜け漏れが繰り返される)。

`memory`は下記の4分類とは直交する出力先なので、現行の定義のまま残す
(このリポジトリ固有の方針ではなく、エージェント自身の作業プロセスに関する教訓である場合に使う)。

- **memory**: このリポジトリ固有の方針ではなく、エージェント自身の作業プロセス
  (調査の仕方、ツールの使い方、待ち方など)に関する教訓で、他のプロジェクトでも
  再利用できる場合。ここでの「memory」はClaude Codeのメモリシステムを指し、
  **このリポジトリ内のファイルではない。**追加するたびに肥大化していないか
  (エントリが読み込み時に切り捨てられる閾値に近づいていないか)を確認し、
  近ければ新規追加より先に既存エントリの統合・削除を検討する

#### 「対処する」に落とす前に4つの問いを通す

**次の4つすべてに答えてから分類する。1つでも「対処しない」側の答えが出たら、
既定は`対処する`以外とする。**

1. 本当に繰り返し起きる問題か(今回1回きりの事情ではないか)。**いいえ**なら対処しない
2. 対処しなくても実害が小さい、またはエッジケースではないか。**はい**なら対処しない
3. 改善の実装コストを、今後の機能開発で回収できるか。**いいえ**なら対処しない
4. 既存の運用変更だけで防げるか。**はい**なら対処しない(`運用で様子を見る`へ)

そのうえで、次の4分類のいずれかに仕分ける。**新しいファイルや一覧Issueは作らない。**
`対処する`以外の3つの置き場は振り返りコメントそのもの(既にIssue/PRに紐づいており、
リンクも残る)。**複数の条件に同時に該当する場合は、`後で再評価する` >
`運用で様子を見る` > `見送る` の優先順位で1つに決める**(判断材料が足りないことを
最優先で扱い、次に運用でカバーできるかどうかを見る)。

- **対処する**: 上記4つの問いをすべて通ったものだけがここに入る。
  **「リポジトリに変更を加えるもの全般」を既定にしない。**Issueを立て、通常のIssue運用
  (`phase:N` ラベル、`agent:*` は**いずれか1つ**。既定は `agent:sol` / `agent:terra` / `agent:luna`
  のいずれか、Claude側で判断する場合のみ `agent:opus` / `agent:sonnet` / `agent:haiku` の
  いずれかに置き換える。詳細は `docs/model-routing.md` を参照。Projectへの登録)に乗せる。
  **振り返り由来のIssueには、振り返りコメントへのリンクを必ずIssue本文に書く。省略しない。**
  後から「振り返り由来か」を機械的に判別できるようにするための必須要件である
- **運用で様子を見る**: 判断材料は揃っており、問い4で「防げる」側だった場合。
  既存の運用・注意で防げるので、Issueは立てず振り返りコメントに記録するのみとする
- **見送る**: 判断材料は揃っており、`運用で様子を見る`にも当たらない場合
  (問い1・2で今回限りのエッジケースである、もしくは実害が小さい場合、
  または問い3で改善の実装コストを今後の機能開発で回収できない場合)。
  理由を一言添えて振り返りコメントに記録するのみとする
- **後で再評価する**: 4つの問いのいずれかに今は答えられない(判断材料が足りない)場合。
  何が分かれば決まるかを1行、振り返りコメントに書く。**読み返す機会は月末の棚卸し**(#119の最終項目)。
  **月次の常設儀式にはしない。**まず1回やってから必要性を判断する

## 束ねPR

複数のIssueを1本のPRにまとめる運用。**束ねてよい条件・上限は
`docs/task-management.md`「Issueを束ねて1本のPRにする」が正本。ここには書き写さない。**

**PR本文。**「## 対応するIssue」見出しを立て、`Closes #N: <一行説明>` を対象Issueの数だけ
列挙する(#173の書式)。複数の`Closes`を1本のPR本文に並べれば全件に自動closeが効く
(実測の詳細は `docs/pr-review-flow-details.md`)。**Issueの一部の範囲だけをこのPRで解決し
`Closes`で閉じない場合は、同じ見出しの下に `Refs #N: <このPRで済ませた範囲/残る範囲>` を
並べる(`Closes`で閉じてよいかの条件は`docs/task-management.md`「Issueを束ねて1本のPRにする」
「部分解決」が正本)。**

**close漏れの機械確認。**マージ直後、対象Issue全件について
`gh api repos/{owner}/{repo}/issues/{issue_number} --jq .state` でstateを確認する。GitHubのキーワード
解決に委ねきりにしない。**`Closes`で挙げた件は`closed`を期待値とする。`Refs`で挙げた件は
`open`のままであることを期待値とする**(意図的に閉じていない部分解決のため)。`Refs`の対象が
`closed`になっていた場合は、GitHubのキーワード解決が誤って発火した可能性があるため個別に確認する。

**振り返りの記録先。**上記「マージ後の振り返り」の一般則(Issueが紐づく場合はIssueへ記録する)の
**例外として**、束ねPRでは振り返りをPR側を正本として記録し、束ねた各Issueには振り返りコメントへの
参照1行を残す。
