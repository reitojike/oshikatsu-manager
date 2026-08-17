# 台帳と現行プロセスの3箱仕分け(#257)

> **これは検討記録であり、正本ではない。**本書は `docs/research/review-tools/*.md`(フェーズ1の仕様台帳)と
> **現行プロセス(C側。このリポジトリの実際の設定・運用)** を突き合わせ、3箱に仕分けた記録である。
> **`docs/review-process-design.md`(#256の設計成果物)は比較対象ではない。**設計は「どこを見るか」を
> 指す光であって、被比較物ではない(#257本文)。処置方針(「こう直す」)はここでは決めない。**#258の仕事。**

**本書の日付はJST(日本標準時)。**UTC由来の記録(GitHub APIのタイムスタンプ等)を引用する場合は
`Z`付きの時刻(UTC)とJSTを併記する。この注記は計画セッションの指摘(2026-08-17)による訂正
——CodeRabbitがPR #269で「2026-08-17は未来の日付」と誤検知したのは同レビューアがUTC基準で
判定したためで指摘自体は誤りだったが、その過程で本書がUTC基準とJST基準の日付を無自覚に
混在させていたこと自体は実在の欠陥だった(#257本文265-277行がCodeRabbitのプラン切替について
「日付から判定しないこと。JSTとUTCで33時間の幅がある」と警告しているのと同型の問題が、
本書側の記録にも出ていた)。

## 0. 3箱の定義

| 箱 | 意味 | 処置 |
| --- | --- | --- |
| **箱1** 台帳にあり、C側にもある | 一致 / 不一致 | **不一致は最重要の発見** |
| **箱2** 台帳にあり、C側に無い | ツールにあるが我々が使っていない機能 | 設計の余地(#258) |
| **箱3** C側にあり、台帳に無い | 我々が前提にしているがツール側の裏付けが無い | 追加調査(#258) |

**不一致が出たら、まず台帳側を疑う。**#252の実測(台帳774行中63行=8.1%が「主張が引用より強い」)があるため、
本書の箱1不一致はすべて台帳側の該当行を実際に開いて引用に当たり直した上で記録している。

## 1. C側(現行プロセス)の範囲の点検

本Issue(#257)本文が指定する範囲(`AGENTS.md`「Code Review Rules」「ブランチとPR」、`.claude/skills/pr-review-flow/SKILL.md`、
`docs/pr-review-flow-details.md`、`.coderabbit.yaml`の現在値、`.github/workflows/**`の現在値、
`.github/scripts/`の検出ロジック)を実際に走査し、尽きているかを点検した。

- `.github/workflows/`実在ファイル: `ci.yml` / `claude-review.yml` / `keep-alive.yml` / `pr-template-check.yml` / `supabase.yml` の5件。
  - `ci.yml`(lint/typecheck/unit test) / `keep-alive.yml`(Supabase一時停止防止) / `supabase.yml`(db test・生成型検証)は
    レビューボットと無関係(CI品質ゲート)であることを内容(冒頭コメント)から確認した。**範囲外として扱ってよい。**
  - `pr-template-check.yml`は「Draft前セルフレビュー」の記入漏れを検知するゲートで、レビューボット自体の
    検出ロジックではないが**プロセス遵守の機械ゲート**として`.github/scripts/`の走査対象に含めた(下記)。
- `.github/scripts/`実在ファイル: `build-review-prompt.mjs` / `check-claude-review.mjs` / `check-eol.mjs` /
  `check-lint-scope.mjs` / `check-pr-template.mjs` の5件。
  - `build-review-prompt.mjs` / `check-claude-review.mjs` はClaude Reviewの検出ロジックそのもの(本書で全文確認済み)。
  - `check-eol.mjs` / `check-lint-scope.mjs` / `check-pr-template.mjs` は改行コード・lintスコープ・PRテンプレート記入の
    検証であり、4系統のレビューボットの検出ロジックとは無関係(#236クラスタAで「未着手のままオープン」と
    記録されている3本と一致。テスト不足の課題はあるが、本Issueの3箱仕分けの対象は、ボット挙動の突き合わせではない)。
- **点検結果: 範囲は尽きている。**追加で見つかった`pr-template-check.yml`/`check-pr-template.mjs`はプロセス遵守ゲートで
  あり、ボット挙動そのものの検出ロジックではないため3箱の対象を広げる必要はない。

## 2. 系統別の箱1(一致/不一致)

### 2.1 Claude Review(`claude-code-action.md`)

**一致(抜粋。全項目を書くと台帳の丸写しになるため、C側の設計判断が対応している箇所のみ挙げる)**

| 台帳の主張 | C側の現在値 | 判定 |
| --- | --- | --- |
| 軸1: `prompt`が与えられれば常にagentモード(A) | `claude-review.yml`は`prompt:`を直接渡す設計 | 一致 |
| 軸2: 個別CLI引数はすべて`claude_args`という単一自由文字列で渡す(B) | `claude_args: --allowedTools "..." --max-turns 60`(claude-review.yml) | 一致 |
| 軸2: `enableAllProjectMcpServers`は常に`true`に固定(A) | ワークフローのコメントが同じ制約を明記し、`disabledMcpjsonServers`で`.mcp.json`のcodexサーバーを個別ブロック | 一致(C側が台帳と同じ制約を独自に把握し対処済み) |
| 軸3: 復元対象パスは`.claude`/`.mcp.json`/`.claude.json`/`.gitmodules`/`.ripgreprc`/`CLAUDE.md`/`CLAUDE.local.md`/`.husky`(A) | `build-review-prompt.mjs`の`RESTORED_PATHS`定数が完全一致するリストを持つ(pinned SHAへの参照コメント付き) | 一致 |
| 軸5: `conclusion`は`success`/`failure`の2値のみで、0件・スキップ・レート制限を区別しない(B) | `check-claude-review.mjs`の`reviewCheckDecision`が、この2値だけでは判定しきれない状態(skip・cancelled・validation-skipped等)を個別envで補って多分岐化 | 一致(台帳の限界をC側が把握し設計で吸収) |
| 軸6: `resultMessage.is_error`が何によってtrueになるか特定できていない(D、未調査) | `check-claude-review.mjs`は`outcome === "failure"`を「元stepが既に赤い」として扱うのみで、is_errorの内部原因追跡はしない | **一致**(計画セッション裁定・2026-08-17。台帳もC側も「分からない」で揃っており、台帳が「分かっている」ことをC側が違えている構造ではないため不一致ではない。`is_error:true`で投稿0件のまま赤くなる再現性の無い事象が#150として追跡中だが、判定は「意図的か/ずれか」の対象外——不一致ではないため) |
| 軸8: 正式PRレビュー提出不可・複数コメント投稿不可(A) | promptは「総評は`gh pr comment`」「個別指摘は`mcp__github_inline_comment__create_inline_comment`」と明示的に使い分けさせる設計 | 一致 |

**不一致**

- **#262(すでに実測済み。導出をやり直さない)。`--allowedTools`に汎用`Read`/`Grep`/`Glob`が無く、
  差分の外を一切読めない。判定: 箱1(不一致)**(計画セッション回答・2026-08-17。#257本文には
  当初この件を箱1とする段落(421-449行)と箱2寄りとする段落(85-88行)の両方があり内容が矛盾していたが、
  計画セッションが箱1と裁定した)。
  **箱2の定義は「台帳にあり、C側に無い」。`--allowedTools`はC側にエントリが在り
  (`claude-review.yml:47`の`CLAUDE_REVIEW_ALLOWED_TOOLS`)、その値は台帳の機構記述(軸4、
  `permission_denials_count`を含む)と突き合わせ可能である。突き合わせた結果が不一致——
  無いのは能力ではなく我々が与えた値のほう——なので、定義上これは箱1に入る。**
  詳細は下記5節「読める範囲の差」。
  **「意図的か/ずれか」は2つに分けて書く(1文にまとめない。まとめると処置判断が
  「意図的だから触らない」に寄ってしまうため)。**
  - **意図的なのは`Read(.claude-pr/**)`という限定そのもの。**`claude-review.yml`のコメントに
    「復元対象パスの退避先(実行されない)に限定した読み取り権限」とあり、#229の修正のために
    最小権限として意図して置かれた
  - **意図されていないのは、汎用`Read`/`Grep`/`Glob`が無いことの帰結(配った観点のうち
    差分横断系が実行不能になること)。**この帰結は`.claude-pr/**`への限定を決めた時点(#229)では
    評価されておらず、その証拠として同じ問題が後から#242として別Issueで改めて起票されている

  **追加の実測(計画セッション・2026-08-17、本PR自身のclaude-review runで発生。
  一度「読めないまま読んだと報告している」と記録したが、その後の実測でこの断定は誤りと判明し
  訂正した。訂正の経緯自体を残す——推論だけで断定し、引用の実ファイル一致を確認しなかった
  ことが誤りの原因だった)。**

  `71b96d6`に対するclaude-reviewは、本PRの差分に含まれない2ファイルを**正確に参照した**。
  `docs/pr-review-flow-details.md:507`の「外部設定の意図する値」表の該当行を逐語・行番号とも
  一致する形で引用し、`.coderabbit.yaml`に`reviews.enabled`という独立キーが実在しないこと
  (`reviews.auto_review.enabled`のみ存在)を正しく指摘した。この回も`--allowedTools`に汎用
  `Read`/`Grep`/`Glob`は無く(run `31982033715`のログで確認、変更なし)、
  `permission_denials_count`は6件——**拒否された試行と成功した参照が混在しており、
  どの経路で到達したかはログから特定できない。**「読めた」は事実、「どうやって」は不明であり、
  この2つを混ぜない。

  **したがって記録すべき不一致は「権限設定から読めないと演繹できる」ことではなく、
  次の対応表である。**

  | | |
  | --- | --- |
  | 台帳 | `--allowedTools`の機構(単位4) |
  | C側の現在値 | 汎用`Read`/`Grep`/`Glob`を含まない |
  | C側の文書が主張する帰結 | 「差分の外は読まない」(`.claude/skills/pr-review-flow/SKILL.md`117行、#242) |
  | 実測 | 差分の外の2ファイルを正確に参照した(`71b96d6`のrun) |

  **不一致は「設定値」ではなく「設定値から導いた帰結」にある。設定は宣言どおりでも、
  今回の観測では宣言された制約が貫徹しなかった(到達経路と`--allowedTools`の実効性は
  未確定のまま。CodeRabbit指摘・2026-08-17で「貫徹していない」という一般化を「今回は
  貫徹しなかった」に修正)。**`.claude/skills/pr-review-flow/SKILL.md`117行はこの制約を
  事実として扱い、「`common/`への複製・型の二重定義・成果物間の矛盾など差分の外を読まないと
  判定できない観点はCodeRabbit・Codex Cloud・Draft前セルフレビューが担う」という観点の
  担当割り当てをこの前提の上に組んでいる。**この前提が常に成り立つとは限らないことを
  今回の実測が示した(常に成り立たないと示したわけではない)。**

  **「意図的か/ずれか」は2つに分ける:**
  - **意図的なのは、汎用`Read`を渡していないこと**
  - **意図されていないのは、その制限が今回貫徹しなかったこと(到達経路・実効性は未確定)。**
    C側は貫徹している前提で観点の担当を割り振っている

  **取り下げないもの:**`permission_denials_count`が出ていること自体(今回6件)は事実として残る。
  #262のPR #260での実測(3回連続・投稿0件・denial 7/10/19)も別runの観測であり取り下げない
  (「今回は読めた」は「常に読める」ではない)。`AGENTS.md`が自動読み込みで参照できる点も変わらない
  (2巡目のP1指摘「`automation-config`が7項目」はこの経路で成立しており正当だった)。
  **`--allowedTools`をどうするか、`SKILL.md`117行の記述や観点の担当割り当てを見直すかは
  #258。本Issueは記録まで。**

### 2.2 Codex Cloud(`codex-cloud.md`)

**一致**

| 台帳の主張 | C側の現在値 | 判定 |
| --- | --- | --- |
| 軸1/軸11: 自動発火は`ready_for_review`のときのみ(A/C1) | SKILL.md「Draftフェーズ」「自動発火するのは`ready_for_review`のときだけ」。PR #169/170/173/174/161で5件連続実測 | 一致 |
| 軸4: 観点は`AGENTS.md`の`## Code Review Rules`をワークフロー不要でネイティブに読む(A) | `.github/workflows/`にCodex用ファイルが存在しない(注入機構を持たない) | 一致 |
| 軸2/軸7: ワークフローファイル・APIキー不要、ChatGPT Plusの枠内(A) | `docs/roadmap.md`「ワークフローファイルもAPIキーも不要で、ChatGPT Plusの枠内で動く」 | 一致 |
| 軸1/軸5/軸9/軸10: 複数投稿・短縮SHA解決・0件時もテキスト投稿(C2) | `docs/pr-review-flow-details.md`がPR #173の2件投稿実測、短縮SHA解決手順、PR #168〜171での0件時テキスト投稿を記録 | 一致 |
| 軸5/軸6: check run/commit statusを作らない(権限マニフェストが`checks:read`等のみ、B) | `docs/roadmap.md`「codex-reviewは追加しない(workflowごと削除済み)」= required checkにできない前提と符合 | 一致 |

**不一致(最重要)**

- **①「GitHub上ではP0/P1のみ」という記述と、自リポジトリでのP2実測の食い違い。判定: ずれ**
  (計画セッション回答・2026-08-17)。
  台帳 軸8は公式ドキュメント("Codex flags only P0 and P1 issues")をA等級で確認する一方、**同じ軸8に**
  「PR単位のゲート適用後の46 PR分で...値域はP0=0/P1=23/**P2=6**/P3=0。公式ドキュメント(P0/P1のみ)と
  実際の表示(P1・P2が出る)は一致しない」という**自リポジトリでのC1実測**(2026-08-16確認)を併記している。
  `.claude/skills/pr-review-flow/SKILL.md:118`は前者(公式ドキュメント)のみを運用前提にしており、
  **意図的にP2を無視すると決めた記録はどのIssue・PRにも無い。**「指摘0件でも全観点を通過したとは
  読まないこと」という同記述の警告としての役割はP2の存在によって弱まらないが、
  **「P2というラベルは来ないはず」で分類する側が読むと、実際に来たP2の扱いを誤る。読んだ側の
  行動が変わるため、ずれとして記録する。**
- **②「Plusの同じ5時間ローリングウィンドウの枠を共有する」という断定。判定: 2つの主張に分けると
  片方は確定、片方はずれ**(計画セッション回答・2026-08-17)。
  `docs/roadmap.md`の当該文は「GitHub経由のレビューが一般利用枠と枠を共有する」と
  「その枠の単位が5時間ローリングウィンドウである」という**2つの主張を1文に混ぜている。**

  | 主張 | 状態 |
  | --- | --- |
  | GitHub経由のレビューが一般利用枠と枠を共有する | **確定している** |
  | その枠の単位が「5時間ローリングウィンドウ」である | **確定していない(ずれ)** |

  「共有する」が確定している根拠は料金ページではなく、認証済み画面の実測(台帳 軸7、A2、
  2026-08-15)である——アナリティクス画面の「残高」セクションは`週間利用上限`を示し、説明は
  「Codex と Work は同じ利用上限を共有しています。」、さらに「使用状況の内訳」の凡例に
  `GitHub Code Review`が他の利用面(Desktop App/CLI/Cloud/モバイル/Exec)と並んで1つの面として
  現れる(同軸7、A2)。加えて[issue #125のPO決定コメント(2026-08-13)](https://github.com/reitojike/stage-tracker/issues/125#issuecomment-5277190241)が、
  使用状況の内訳グラフでGitHub Code Review(46%)がExec+CLI(42%)を上回って同居していることを
  一次情報として確認し、共有バケット前提での決定を下している。
  一方「5時間ローリングウィンドウ」という単位のほうは支えが無い。台帳 軸7が「料金ページの`/5h`
  という見出しは、確認日時点の枠の体制を示す根拠として使えない」と明示しており、実際に画面に
  出ているのは`週間利用上限`である。**倒れているのは単位(5h)のほうだけであり、「共有する」まで
  一緒に疑わない。**roadmap.mdをどう書き換えるかは#258の仕事であり、本書では書き換えない。

### 2.3 CodeRabbit(`coderabbit.md`)

**一致**

| 台帳の主張 | C側の現在値 | 判定 |
| --- | --- | --- |
| 軸1: `auto_review.drafts`既定値`false`(A) | `.coderabbit.yaml`で`drafts: true`に意図的に上書き(コメントで理由明記) | 一致(意図的な既定値逸脱) |
| 軸1: `auto_pause_after_reviewed_commits`既定値`5`、`0`で無効化可(A、スキーマ逐語) | `.coderabbit.yaml`で`0`に設定。このリポジトリ自身での検証実績(PR #35)をコメントに記録 | 一致(意図的、かつ実測で裏付け済み) |
| 軸2: `language`はISO言語コードのenum制約(約100件、B) | `.coderabbit.yaml`で`language: "ja-JP"`(enum内) | 一致 |
| 軸3: リポジトリ全体クローンで解析、Agentic exploration(A) | SKILL.mdが「`common/`への複製、型の二重定義、成果物間の矛盾などはCodeRabbit・Codex Cloud・セルフレビューが担う」と、この能力への依存を前提に役割分担を設計 | 一致 |

**不一致**

- **③ `review_progress`/`commit_status`の適用条件が、台帳の仕様記述と実挙動で食い違う。
  判定: 台帳(B等級)の記述とC1実測の食い違い(ベンダー側)であり、C側は既定値のまま何も選んでいない**
  (計画セッション回答・2026-08-17。回答にあたり計画セッションがPR #267の
  head(`f80a4ca`)で`GET /commits/{sha}/status`と`GET /commits/{sha}/check-runs`を分けて
  実測し、取り違えの可能性を排除した上で確定させた)。
  台帳 軸2/軸5(スキーマ逐語、B等級)は「`commit_status`(legacy)は`review_progress`が無効な場合にのみ
  使われ、`review_progress`は既定で有効(GitHub progress reports/check runsを制御)」と明記する。
  C側`.coderabbit.yaml`はどちらのキーも未設定(=`review_progress: true`が既定で有効)だが、
  実測では`GET /commits/{sha}/status`に`{context: "CodeRabbit", state: "success", description:
  "Review rate limited"}`が現れる一方、同SHAの`GET /commits/{sha}/check-runs`には
  CodeRabbit由来のcheck runが1件も無い(github-actions系のみ)。**CodeRabbitはlegacy commit
  status側にのみ出ている。**「commit status経由でしか信号を得ていない」という観測が、
  check runとcommit statusを取り違えた結果ではないことを実測で確認した上での結論であり、
  **食い違っているのは台帳のB等級記述と実挙動(C1)**——C側の設定選択の話ではない。
  記録はB(スキーマ逐語)とC1(上記実測)の両等級を明記する。
- **④ レート制限メッセージの文言が台帳のC2観測(2024-2025年)とC側実測(2026年)で異なる。
  判定: 時点差・プラン差によるベンダー側の文言変更であり、C側の観測ミスではない**
  (計画セッション回答・2026-08-17)。
  台帳は「Please wait N分M秒」という秒単位の待機時間を含む文言をC2(2024-2025年、第三者リポジトリ)で
  記録するが、C側の2026年実測(このリポジトリ自身)では「Review limit reached」+「Next review
  available in: N minutes」(分単位)、`## Review limit reached`という異なる見出し(PR #267、
  2026-08-16)、または commit status の`description`のみで、秒単位の文言は一度も出ていない。
  **両方とも観測としては正しく、ベンダー側の文言が時間とともに変わっている(見出しは3変種を確認)。**
  **変わらなかったものが1つある: HTMLマーカー`<!-- This is an auto-generated comment: rate
  limited by coderabbit.ai -->`は3変種すべてで台帳の記録と一致した。**見出しで判定していたら
  2026-08-16のPR #267で判定が壊れていたが、マーカーで判定していれば壊れない。これは
  `docs/review-process-design.md`§11(逐語文字列の照合をpure関数に切り出し、文言が変わったら
  赤くなるテストを付ける)の直接の裏付けになる実測である。

**この不一致は箱1に含める(相乗り修正と混同しないこと)。** `github-platform.md`の「Draft PRで空配列」の
訂正(下記4節)は台帳と一次情報の食い違いであり3箱の対象外だが、上記③④は台帳とC側実測の突き合わせなので
通常どおり箱1として扱う。

### 2.4 GitHub Copilot(`copilot.md`)

**一致**

| 台帳の主張 | C側の現在値 | 判定 |
| --- | --- | --- |
| 軸1/軸2: `review_draft_pull_requests`(Draft中もレビューするか)(A/B) | Ruleset(id 20465536)で`false`。SKILL.md「Draft中は走らない」 | 一致 |
| 軸1/軸2: `review_on_push`(Ready後pushで走るか)(A/B) | Ruleset(id 20465536)で`false`。SKILL.md「Ready後のpushでは走らない(2026-08-07適用)」 | 一致 |
| 軸1: 再リクエストは`copilot-pull-request-reviewer[bot]`をreviewerとしてAPI指定(A) | SKILL.mdの再リクエストコマンドが完全一致 | 一致 |
| 軸11: Ruleset経由で現在値を機械的に読める(B) | `docs/pr-review-flow-details.md`のRuleset確認手順が一致(ただし一覧系エンドポイントの`rules`欠落という追加の実務知識を持つ。下記4.4節の箱3) | 一致 |

**不一致・状態不明(最重要。#257本文の前提を修正する発見)**

- **⑤ #257本文の「Copilotは観点を一切持っていない」という前提はPO側の誤りだった。
  判定: 計画セッションが本文の誤りを訂正(2026-08-17)。**
  台帳`copilot.md`軸4(2026-08-16確認、GitHub公式changelog逐語、本Issueで直接確認済み):

  > 2026-07-17以降、`.github/copilot-instructions.md`・`*.instructions.md`・**AGENTS.md**・agent skillsに
  > 加えて、`REVIEW.md`・`GEMINI.md`・`CLAUDE.md`という既存のレビューガイドライン用ファイルも
  > 自動的に認識し、レビューに取り込むようになった

  このリポジトリには`## Code Review Rules`節を含む`AGENTS.md`が実在する。**計画セッションの回答:
  本文が「既知の欠落(PO側で確認済み)」としていたのは、実際には`.github/copilot-instructions.md`が
  存在しないことのみであり、AGENTS.md自動認識の存在を踏まえていなかった。ファイルの不在から
  「観点を持たない」は導けない。**

  **分類(計画セッション確定):**
  - **箱2は「`.github/copilot-instructions.md`と`.github/instructions/**`の不在」に限定する**(下記3.4節)
  - **AGENTS.md自動認識の分は箱1に置くが、「一致」と断定しない。**台帳側は公式changelogの
    機能説明(A)どまりで、このリポジトリで実際にCopilotがAGENTS.mdを読んだ直接実測(レビュー本文に
    AGENTS.md由来の指摘が現れるか等)は無い。**状態は「未調査」のまま置く。**

  **あわせて、下記6.3節「観点配布に検知の価値がある」の帰属を1段弱める(計画セッション指摘)。**
  PR #267でCopilotが表記3件しか出せなかったことを「観点を持たないことの影響を示す標本」と
  断定していたが、Copilotが実際にAGENTS.mdを読んでいた可能性がある以上、この帰属は取り下げる。
  残る言い方は「同一差分・同一回でCodexはAGENTS.mdを引用したP1を3件出し、Copilotは表記3件
  だった。指摘の性質に差がある」まで——**原因を観点の有無に帰属させない。**
- **⑥ quota失敗時の文言と課金体系の食い違い。判定: 意図的ではない・ずれ、両方とも確定**
  (計画セッション回答・2026-08-17。当初「ずれか」は保留だったが、C側組織のGitHub Copilot Pro
  契約が2026-08=今月からと判明し確定した)。
  台帳 軸7(A等級)は「2026-06-01以降の現行課金はAI Credits + GitHub Actions minutesの2軸で、
  『premium request』はそれ以前の年間契約Pro/Pro+にのみ残るレガシー課金」と確認しているが、
  C側(SKILL.md・`docs/pr-review-flow-details.md`)は一貫して「プレミアムリクエスト」という
  レガシー用語のみを使用している。

  | | 判定 |
  | --- | --- |
  | 意図的か | **意図的ではない(確定)。**レガシー用語を維持すると決めた記録はどのIssue・PR・docsにも無い |
  | ずれか | **ずれ(確定)。**契約が2026-08(今月)からであり、台帳が言うレガシー課金の対象(2026-06-01以前からの年間契約Pro/Pro+)に該当しない。C側の「プレミアムリクエスト」という用語は現行課金の用語ではない |

  **あわせて記録する発見: 現行課金2軸のうち、このリポジトリには片方しか掛からない。**
  台帳 軸7(A等級、公式changelog)は現行課金が「AI Credits」+「GitHub Actions minutes」の
  2軸であり、**Actions minutesはprivateリポジトリのみ消費し、publicでは消費されない**と記録する。
  本リポジトリの現在値(2026-08-17実測、`GET /repos/{owner}/{repo}`)は
  `private: false` / `visibility: public`。**したがって本リポジトリでのCopilot code reviewの
  消費はAI Creditsの1軸のみで、Actions minutesは掛からない。**台帳が2軸と記録する一方、
  C側の条件(public)によって片方が無効化されている、という突き合わせ結果である。

  **別立てで記録する追加の発見(用語の古さとは別の問題):**`docs/pr-review-flow-details.md`
  「Draft先行の根拠」の実測(1レビューあたりプレミアムリクエスト13回相当)は、Draft先行運用
  (`.claude/skills/pr-review-flow/SKILL.md`「Draft先行の目的は、Copilotのプレミアムリクエスト
  消費を『Ready化時の1回』に限定すること」)の根拠として置かれている数値である。台帳 軸7は
  この13が**レガシー課金専用のmodel multiplierと一致する**ことを示しており(台帳が引く公式
  ドキュメントの当該ページ自体がレガシー課金限定であることを明記)、当時の実測がレガシー
  課金下だったことは裏付けられる。**現行課金(AI Credits)下でこの13が何に対応するかは、
  台帳から確認・換算できない**(「対応する単位が存在しない」という強い主張ではなく、
  Code ReviewのモデルがOpenAI・GitHubいずれからも非開示であるため、AI Creditsでの
  1レビューあたりのコストを台帳の記述から導出する手段が無い、という限定的な主張。
  CodeRabbit指摘・2026-08-17で「単位が存在しない」から訂正)。Draft先行という結論そのものは
  動かない(AI Creditsは有限=月$10分、CopilotはDraft中にレビューしないため、限定することの
  効果はどちらの課金体系でも残る)が、**その根拠に置かれている「13」という数値は現行課金下で
  意味を確認できない。**「13」を現行の
  数値として読ませない書き換え・再測定は#258で行い、本Issueでは記録まで。

## 3. 系統別の箱2(台帳にありC側に無い)

### 3.1 Claude Review

**`--allowedTools`の絞り込み(#262)は箱2ではなく箱1(不一致)。**C側に`CLAUDE_REVIEW_ALLOWED_TOOLS`
というエントリが実在し、台帳の機構記述と値として突き合わせられるため(2.1節の#262参照。
計画セッション裁定・2026-08-17)。ここには載せない。

- `track_progress`入力(進捗トラッキングコメント、実験的機能、軸1・軸3): 未使用。
- `use_commit_signing`(コミット署名、軸2): claude-reviewはコミットしないため無関係だが、機能としては未使用。
- `--json-schema`による構造化出力(軸6): 未使用(自由記述のinline commentとissue commentのみ)。
- `additional_permissions`(`actions:read`等でCI関連MCPツールを有効化、軸2・軸3): 未設定。claude-reviewは
  CI状況を読む必要がない設計のため未使用と見られるが、明示的な言及は無い。

### 3.2 Codex Cloud

- **Security Review**(`@codex security review`、専用の観点・報告閾値、軸7・軸8): 有効化の記録が無い。
- **観点付き一回限りのトリガー**(`@codex review for issues in X`)・**cloud chat起動の修正依頼**
  (`@codex fix the P1 issue`)(軸1): SKILL.mdは「Draft中に手動で`＠codex review`を打つ運用はしない」と
  明記しており、手動トリガー全般を使わない運用。
- **レビュートリガーの`すべてのプッシュ時`/`スマートトリガー`**(軸2・軸11): 現在値は`PRのオープン時`のみ選択。
- **`徹底的なコードレビュー`トグル**(軸不明、追加指摘を探す設定): C側に言及なし、状態不明。
- **`クレジットの使用を有効にする`トグル**(レート制限到達後のフォールバック): C側に言及なし。
- **Codex GitHub Action**(自前workflowから走らせる別経路): `docs/roadmap.md`「保留: 外部アカウント待ち」で
  **明示的に見送り(確定)と記録済み**(積極的な不使用であり、単なる未使用ではない)。

### 3.3 CodeRabbit

- **`path_instructions`が`.github/**`を覆っていない(既知の欠落。#257本文で正式記録)。**
  台帳 軸4(A等級)が確認する「globパターンにマッチするファイルに自然言語でレビュー観点を指示できる」
  機能に対し、C側`.coderabbit.yaml`の`path_instructions`(24-51行)は`**/*.{ts,tsx}` /
  `supabase/migrations/**` / `test/db/**` の3パスのみで、`AGENTS.md`の`automation-config`分類
  (7項目: 権限拡大・secret/skipの穴・イベント種別/再実行条件・required checkの永久pending・
  fork PRでのsecret・action参照のSHA固定・設定変更と関連文書/テストの整合)がCodeRabbitに
  一切届いていない。**#256論点1の「下限を揃える」を実現するには、この欠落が埋まらないかぎり
  Claude以外の2系統で十分という前提が崩れうる(#257本文)。**
  **この7項目のうち2つは、単に「配られていない」だけでなく、配られたとしても他の制約と
  二重に効く(計画セッション指摘・2026-08-17)。**「イベント種別や再実行条件が意図と一致しない」は
  判定に`.github/workflows/**`の`on:`を読む必要があるが、その`.github/**`自体が
  `path_instructions`の対象パスに含まれていない——観点と読める範囲の両方が同時に欠けている。
  「設定変更と関連文書・テストが整合していない」は定義上差分の外(関連文書・テスト)を読む必要が
  あり、6.3節のClaude行(`automation-config`分類の同項目)と同じ型の制約である。
- `@coderabbitai emit path instructions`(過去7日の提案を集約しPR化、軸1): 未使用(path_instructionsは手動記述)。
- AST-grepベースのpath instructions(構文パターン一致、Pro/Pro+限定、軸2): 未使用。
- `path_filters`(ファイルをレビュー対象から完全除外、軸2): 未設定。
- `reviews.tools`配下の50以上のサードパーティlinter/SAST個別トグル(軸2): 未設定(既定のまま)。
- `Custom checks`/`pre_merge_checks`(自然言語の決定的合否基準、Pro+限定、軸2・軸4): 未設定。
  `AGENTS.md`のCode Review Rules(P0/P1定義)をPre-merge checksとして機械的にゲート化する余地があるが未使用。
- Finishing Touches(`autofix` / `fix-ci` / `Resolve merge conflicts` / `Simplify code`)(軸1): 未使用。
- Post-Merge Actions(軸1・軸2): 未使用。
- `suggested_reviewers`/`auto_assign_reviewers`/`suggested_labels`/`auto_apply_labels`(軸2): 未設定。
- Jira/Linear連携によるPR validation・MCPサーバー統合(軸3): 未使用(外部トラッカー非連携のため対象が無い)。
- `@coderabbitai configuration`コマンド(適用中設定の出典付き表示、軸11): 運用手順上使う場面が無い。

### 3.4 GitHub Copilot

- **観点配布ファイルのうち`.github/copilot-instructions.md`と`.github/instructions/*.instructions.md`
  (`applyTo` glob)が存在しない。**`.github/skills/`(agent skills)も存在しない。
  **箱2はこの範囲に限定する(計画セッション確定・2026-08-17)。**`AGENTS.md`自体は2026-07-17以降の
  自動認識対象ファイル名と一致するため、そちらは箱1(状態=未調査。上記2.4の⑤)に置き、箱2には
  含めない。確実に言えるのは「パス単位の観点分岐(`applyTo` glob)や専用ファイルによる明示的な
  観点追加の経路は使っていない」ことに限られる。
- `.github/workflows/copilot-code-review.yml`によるセットアップ手順・runner個別設定(軸2): 未使用(該当ファイル無し)。
- effort level(Lite/Balanced)の組織既定値設定(軸1・軸2・軸7): 組織設定UI側の話でリポジトリファイルからは
  確認できないが、C側文書に言及が無い。
- content exclusion設定(2026-06-12以降対応): C側言及なし。
- Copilot Memory: C側言及なし。
- リポジトリ設定側のMCPサーバー連携(GitHub Settings > Copilot > MCP): GitHub側UI設定であり
  `.mcp.json`(Claude Code独自設定でcodexサーバーのみ定義)とは別物。混同しないよう記録。

## 4. 系統別の箱3(C側にあり台帳に無い)

**#257本文が指定する参照先ごとに、探した結果を記録する(見つからなかった場合も「無かった」と明記)。**

### 4.1 #236の受け入れ条件に残っている性質(参照先: issue #236)

**見つかった。**`check-claude-review.mjs`の`hasRestoredPathReadAccess`/`isRestoredPathGateBlocked`は、
`--allowedTools`の中に`Read(.claude-pr/...)`という**文字列パターンが宣言されているか**を正規表現で
静的にチェックするだけで、その宣言が実行時に実際に読み取りを許可しているか(パターンが正しく
マッチしているか)までは検証しない。#236本文が指摘する「パス限定の`Read`はパターンが外れても
赤くならない。宣言はあるがマッチしていない状態は緑のまま通る」という性質は、この検出スクリプトの
設計そのものに起因する。**台帳(4系統いずれの`docs/research/review-tools/*.md`にも、この種の
自己検証スクリプトの盲点についての記述は無い**(台帳はベンダー側ツールの仕様を扱うものであり、
我々が独自に組んだ検出ロジックの限界は範囲外)。典型的な箱3。

### 4.2 circuit breaker自体の不発を検知する手段が無い(参照先: `docs/pr-review-flow-details.md`「同一head SHAへの反復失敗を検知するcircuit breaker」)

**見つかった。**`continue-on-error: true`とGitHub API取得失敗時のfail-open設計の組み合わせにより、
「反復失敗が実際に起きていない」状態と「circuit breakerが壊れていて何も検知できていない」状態が
外から区別できない(PO確認済み・2026-08-16、`docs/pr-review-flow-details.md`に明記)。これは
claude-code-action自体の仕様ではなく、C側が#262で独自に組んだ検出機構の限界であり、**台帳に
対応する記述は無い**(台帳はActionの`conclusion`/`is_error`等の限界は記録するが、その上にC側が
築いた多段検知の自己観測不能性までは扱わない)。典型的な箱3。

### 4.3 C側の各面を1つずつ走査した結果(参照先: 上記1節「C側の範囲」)

- `AGENTS.md`「Code Review Rules」「ブランチとPR」: 上記2.1-2.4の箱1で扱った項目以外に、
  台帳の裏付けが無い前提は**見つからなかった**。
- `.claude/skills/pr-review-flow/SKILL.md`: 4.4節(Copilotの`rules/branches/main`挙動)を除き、
  **見つからなかった**。
- `docs/pr-review-flow-details.md`: 4.1・4.2に記載の2件のほか、**見つからなかった**。
- `.coderabbit.yaml`の現在値: **見つからなかった**(CodeRabbitエージェント担当分。下記4.4参照)。
- `.github/workflows/**`の現在値: **見つからなかった**(claude-review.ymlは2.1で扱った)。
- `.github/scripts/`の検出ロジック: 4.1・4.2に記載の2件で尽きている。

### 4.4 系統別の追加項目

**CodeRabbit**

- **`reviews.profile: assertive`というキー自体の仕様。**C側`.coderabbit.yaml`4行目で明示設定しているが、
  台帳を全文検索した結果、`profile`キー自体(取りうる値、`assertive`と`chill`の違い、既定値)を
  公式ドキュメント/スキーマ(等級A/B)として記録した行は**見つからなかった**。唯一の言及は
  第三者リポジトリでの観測(C2)から`Review profile: CHILL`という値の実例が出てきただけ。
- **`reviews.enabled: true`というルートレベルのon/offキー。**`auto_review.enabled`とは別物だが、
  台帳の軸1-11本表に単体の仕様記述は**見つからなかった**。
- **`path_instructions`の内容とAGENTS.mdの同期を保証する仕組み。**C側の`path_instructions`は
  AGENTS.mdの内容を手作業で要約・転記したものだが、台帳には(a)path_instructionsという機能の
  存在は記載があるが、(b)外部ドキュメントとの自動同期・ドリフト検知の仕組みについての記述は
  **見つからなかった**。C側もCI/lintでこの整合を検証する仕組みを持たず、同期は人手依存。

**GitHub Copilot**

- **`Copilot wasn't able to review any files in this pull request.`という文言。**SKILL.mdがPR #120の
  実例確認として「対象コードファイルが無かっただけでquota失敗ではない」ケースの判定に使っているが、
  台帳の出力パターン表は「quota超過」「行数上限超過」「ファイル数上限超過」の3種はC2実測で
  裏付けている一方、**この文言は台帳のどこにも見つからなかった**(grep 0件)。
- **`gh api repos/{owner}/{repo}/rulesets`(一覧系エンドポイント)が`rules`フィールドを返さず誤判定する、
  という具体的なAPI挙動。**`docs/pr-review-flow-details.md`が明記する実務知識だが、台帳 軸11は
  rules系エンドポイントで値を読めること自体は裏付けるものの、一覧/詳細エンドポイント間でのこの
  挙動差は**見つからなかった**。
- **`main`に複数のRulesetが同時に効きうる(`ruleset_source_type`で区別)という一般知識と、
  このリポジトリでの実測が「Repository由来1件のみ」という具体値。**GitHub Rulesetsの一般仕様であり、
  Copilot固有の仕様を扱う`copilot.md`の対象外という可能性が高い(**見つからなかった、というより
  そもそも当該台帳の管轄外**)。

**Codex Cloud**

- **発火後のレイテンシ実測(push後約3分、`gh pr ready`単独でも約3分、8分以上無投稿の例)。**
  `docs/pr-review-flow-details.md`にPR #113/#169/#170/#173/#174/#161の実測があるが、台帳 軸8は
  「所要時間・SLA・同時実行数の上限について公式の言及がない」と**不在を記録するのみ**で、
  具体的な秒〜分単位の数値自体は台帳に**見つからなかった**(台帳の一次情報調査=GitHub検索による
  他社150件コーパスの対象にも含まれていない)。

## 5. 追加スコープ1: レビュアーが読める範囲の差

台帳が確認済みの4系統の「読める範囲」(#257本文の表、いずれも等級A)と、Claudeの現在値
(`claude-review.yml`の`CLAUDE_REVIEW_ALLOWED_TOOLS`)を突き合わせる。

| 系統 | 読める範囲(台帳、既存) | 読める範囲(現在値) |
| --- | --- | --- |
| CodeRabbit | リポジトリ全体をクローンして解析。Agentic explorationでdiff以外も自律調査。リンクissueも読む | 変更なし(台帳どおり) |
| Copilot | コード・ディレクトリ構造・参照関係を能動的に収集(Rich Context with Tool Calling) | 変更なし(台帳どおり) |
| Codex | diff + 変更ファイルに掛かる`AGENTS.md`群。Security Reviewはsupporting repository contextも | 変更なし(台帳どおり) |
| **Claude** | (#257で確認) | **設定値は`gh pr diff` / `gh pr view`の出力と、`Read(.claude-pr/**)`(復元対象パス退避先限定)のみ。汎用`Read`/`Grep`/`Glob`/`Bash(git ...)`は無い。ただし2.1節#262の追加実測のとおり、この設定値どおりに読める範囲が実際に制限されているかは未確定(`71b96d6`のrunで差分外2ファイルへの正確な参照が観測された。経路不明)** |

**判定: 箱1(不一致。2.1節#262と同一の事実)。箱2でも箱3でもない**(計画セッション裁定・
2026-08-17。当初「台帳にある能力を我々が自分で殺している」という理由で箱2に置いていたが、
`--allowedTools`はC側にエントリが実在し、台帳の機構記述と値として突き合わせ可能なため、
定義上は箱1に入る。「我々が自分で殺している」というニュアンス自体は誤りではなく、
下記の意図的/意図されていないの区別と「我々の設定が原因」という整理(6.3節)にそのまま引き継ぐ)。

- claude-code-action自体は既定でファイル読み取りを許可する設計であり(台帳 軸4)、`tagModeTools`の
  既定リストには`Glob`・`Grep`・`LS`・`Read`が含まれる(台帳 軸2)。**ベンダー側の制約ではない。**
- `--allowedTools "${CLAUDE_REVIEW_ALLOWED_TOOLS}"`という明示指定はホワイトリストとして働き、
  `docs/pr-review-flow-details.md`が「汎用`Read`/`Grep`/`Globは付与しない方針(#242)」と明記するとおり、
  **C側が意図的に絞った結果**である(`claude-review.yml`は`pull-requests: write` / `issues: write` /
  `id-token: write`とOAuthトークンを持つワークフローであるため、権限拡大には別途の根拠が要ると
  判断した、と同文書に理由も記録されている)。**ただし「意図的」なのは`Read(.claude-pr/**)`への
  限定そのもの(#229由来)であり、「配った観点のうち差分横断系が実行不能になる」という帰結は
  そのとき評価されていない(2.1節#262参照)。**
- 帰結として、`AGENTS.md`の`## Code Review Rules`が定義する観点のうち「差分の外を読まないと
  判定できないもの」(`common/`への複製、型の二重定義、成果物間の矛盾)は、Claudeだけが
  実行できない**、とC側の文書(`SKILL.md`117行、#242)は主張している。CodeRabbit・Codex・
  セルフレビューが役割分担で担っている(同文書に明記済み)。ただしこの前提(制約が貫徹している)は
  2.1節#262の追加実測により常には成り立たないことが分かっている——設定は宣言どおりでも、
  宣言された制約が実際には貫徹しない場合がある。**

## 6. 追加スコープ2: レビュー観点の配布状況

### 6.1 観点を得る経路の現在値

| 系統 | 観点を得る経路 | 現在値 |
| --- | --- | --- |
| Claude | 我々のスクリプトが`AGENTS.md`の該当節を注入 | `build-review-prompt.mjs`が`AGENTS.md`の`## Code Review Rules`節を`git show <base>:AGENTS.md`で取得し、共通部分+変更ファイルの分類(`code`/`governance-docs`/`automation-config`)に応じた`###`見出しブロックだけをpromptへ結合する。**節が正確に1つ・各分類ブロックが空でない・見出しの並びが3分類の順**であることを構造的にvalidateし、条件を満たさなければ`fail()`でCIごと落とす |
| Codex | `AGENTS.md`をネイティブに読む(台帳 軸4、等級A) | ワークフロー不在。追加設定は不要(2.2節で確認済み) |
| CodeRabbit | `.coderabbit.yaml`の`path_instructions` | `**/*.{ts,tsx}` / `supabase/migrations/**` / `test/db/**` の3パスのみ。**`.github/**`を含む`automation-config`系のパスは対象外**(3.3節の箱2) |
| Copilot | ①専用ファイル`.github/copilot-instructions.md` / `.github/instructions/**` / `.github/skills/`(agent skills) ②2026-07-17以降の自動認識対象ファイル(`AGENTS.md`・`REVIEW.md`・`GEMINI.md`・`CLAUDE.md`) | **①はいずれも存在しない(箱2として確定。3.4節)。**②のうち`AGENTS.md`(`## Code Review Rules`節を含む)と`CLAUDE.md`は実在し、自動認識対象ファイル名と一致する(箱1、状態=未調査。2.4節⑤)。「観点が一切届いていない」わけではない可能性がある |

### 6.2 発火タイミングと1PRあたりの起動回数

| 系統 | 発火契機(現在値) | 1PRあたりの回数(現在値) |
| --- | --- | --- |
| claude-review | `pull_request: types: [opened, reopened, labeled]`。ただしjob条件で`labeled`は`review:full`ラベルのときのみ実行。`synchronize`(push)では発火しない(#244) | Draft作成時1回 + Ready化時は自動発火なし(明示的な`review:full`付け直しが必要) + 反復のたびに`review:full`で明示依頼 |
| CodeRabbit | `auto_review.drafts: true` + `auto_incremental_review`既定`true`により、Draft中も含めpushのたびに自動発火 | 作成時1回(comprehensive) + push毎に自動(incremental)。**最も頻繁** |
| Codex | `ready_for_review`のときのみ自動発火(#244で訂正済み、2.2節で一致確認済み) | **1PRあたり1回**(PO実測、3PR標本。2.2節「一致」表に記載) |
| Copilot | `copilot_code_review` Rulesetで`review_draft_pull_requests: false` / `review_on_push: false`。Ready化(`gh pr ready`)が唯一の自動契機 | **1PRあたり1回**(自動)。手動再リクエストは1PRにつき1回まで(SKILL.md「Ready後の運用」) |

**予想(#257本文)との突き合わせ: 「Codexと Copilotは1PRに1回、CodeRabbitはDraft中も含めて都度」は
現在値と一致した。**claude-reviewだけが「push毎の自動発火」を持たない設計(#244でコスト理由により撤去済み)で、
反復には毎回`review:full`ラベルの付け外しという明示操作が要る点が他3系統と異なる。

### 6.3 配った観点のうち、読める範囲の制約で実行できないもの

**下限として配った`AGENTS.md`の`## Code Review Rules`を実行できるだけの読める範囲を、
各系統が持っているか。**判定例(#257本文): `code`分類の「`common/`に置くべき判断ロジックを
別の層に置く、または複製している」「型を二重定義している」、`governance-docs`分類の
「成果物間に矛盾がある」は、**差分に片方しか現れていなくても、もう片方(または複数ファイル)を
読まないと判定できない。**差分の外を読めない系統はこれらの観点を実行できない。

| 系統 | 配った観点のうち、読める範囲の制約で**実行できないもの** |
| --- | --- |
| Claude | `code`分類の「`common/`への複製・別層配置」「型の二重定義」、`governance-docs`分類の「成果物間の矛盾」「正本の複数配置」、`automation-config`分類の「設定変更と関連文書・テストの整合」——**C側の文書(`SKILL.md`117行)は差分の外を一切読めないためこれらすべてが実行不能としているが、2.1節#262の追加実測はこの前提が常には成り立たないことを示した**(5節「読める範囲の差」参照)。**設定(`--allowedTools`)自体は我々が絞った結果だが、その設定から「実行不能」という帰結を導けるかは未確定** |
| CodeRabbit | リポジトリ全体クローン+Agentic explorationにより、上記の差分横断系観点は原理的に実行可能。ただし`automation-config`分類の7項目自体が`path_instructions`の対象パス(`.github/**`)に含まれていないため、**観点として指示されておらず「配られていない」状態に近い**(3.3節の箱2)。読める範囲の制約ではなく、観点配布側の欠落 |
| Copilot | Rich Context with Tool Callingにより読める範囲自体は広いと台帳は示す。専用の観点ファイル(`.github/copilot-instructions.md`等、code/governance-docs/automation-configの明示的な書き分け)は無い(箱2、確定)が、`AGENTS.md`自体は2026-07-17以降の自動認識対象であり、これを読んでいれば`## Code Review Rules`全体は届いている可能性がある(箱1、状態=未調査、直接実測なし)。読める範囲の制約ではなく、観点配布側の状態不明 |
| Codex | `AGENTS.md`をネイティブに読むため、`## Code Review Rules`全体(3分類とも)が届いている。**ただし読める範囲そのものが「diff + 変更ファイルに掛かるAGENTS.md群」であり、差分に現れないファイルとの突き合わせ(成果物間の矛盾等)は、C側の設定ではなくこの製品設計自体に起因する可能性がある。**Claude・CodeRabbit・Copilotの制約(いずれもC側の設定・ファイル配置が原因)とは種類が異なりうる。台帳・C側とも「読める範囲の外側で何が起きるか」を明示的に述べた記述は見つからず、確定はできない |

**我々の設定によって特定の系統だけが制限されている状態かどうかの区別(CodeRabbitの指摘で
Codexの扱いを訂正・2026-08-17。当初「ベンダー側の読める範囲の狭さが原因の系統は無い」と
全系統一律に結論していたが、Codexの行自体がそれと矛盾していたため、Codexを分けて書く):**

- **我々の設定が原因(是正の余地がある):** Claude(`--allowedTools`の絞り込み、箱1=#262)、CodeRabbit
  (`path_instructions`の`.github/**`欠落、箱2)、Copilot(専用観点ファイルの不在、箱2。ただし
  `AGENTS.md`自動認識がある分、この系統の「観点が届いていない」は他2系統ほど確定的ではない)
- **ベンダー側の設計に起因する可能性があり、断定できない:** Codex(diff + `AGENTS.md`群という
  読める範囲そのものが製品設計であり、C側はワークフロー等で何も絞っていない。差分横断系の
  観点が実行できないとしても、それは我々の設定の結果ではない可能性が高い)
- **明確にベンダー側の仕様でアンコントローラブル:** 4系統とも観点を得る経路そのもの
  (Agentic exploration・Rich Context・AGENTS.mdネイティブ読み込み)は製品機能であり、
  それ自体は誰にとっても制約ではない。

**PR #267 Ready後1巡目の実測(2026-08-16T15:44Z、JST 2026-08-17 00:44)からは、指摘の性質の
違いまでしか言えない(計画セッション指摘・2026-08-17。当初「観点配布に検知の価値がある」という
帰属を書いていたが、以下のとおり弱めた)。**
同一差分・同一回で、Codex(`AGENTS.md`をネイティブに読む)は`AGENTS.md:L86-L90`を引用したP1指摘
3件(設計内部の不変条件の矛盾)を出した一方、Copilot(当時`.github/copilot-instructions.md`無し)は
表記3件のみだった。**この差を「観点を持たないことの影響」と断定しない。**Copilotが`AGENTS.md`を
実際に読んでいた可能性がある以上(上記2.4節⑤)、「観点が無いから表記しか出なかった」という
原因帰属は取り下げる。**言えるのは「同一差分・同一回で、指摘の性質に差があった」という事実まで。**
原因(観点の有無か、他の要因か)は本書の範囲では決まらない。

### 6.4 レート制限の信号に、待ち時間が常に含まれるとは限らない

**#256採用決定8(赤の出口)が「ベンダー名で分岐しない」とする根拠(#257本文)を現在値として確認する。**

- 台帳(`coderabbit.md`軸1・軸7、いずれもC2)は、レート制限時のコメント本文に具体的な残り時間
  (「Please wait N分M秒」)が入る実例を2件記録している(2024-2025年時点)。
- **一方C側の実測(2026年)では、commit statusに`Review rate limited`(待ち時間なし)、
  issueコメントに「Review limit reached」+「Next review available in: N minutes」(分単位、秒無し)、
  さらに2026-08-16のPR #267では見出し自体が`## Review limit reached`(台帳が記録する
  `## Rate limit exceeded` / `## Rate Limit Exceeded`のいずれとも異なる)という**3つ目の変種**が
  observedされた。**HTMLマーカー`<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->`
  だけは台帳の記録と一致した(見出しで判定していたら壊れていた事例)。**
- **結論: 「この系統ならN分待てば戻る」と決め打つと、待ち時間の情報が無いケース
  (commit statusのみ、または見出しが変わった場合)で根拠なく待つことになる。**採用決定8が
  判定子を「その信号が待ち時間を持っているか」に置いていることは、この現在値と整合している。
- **Fair Usage Policy(直近7日間のレビュー数で1時間あたりの上限が段階的に絞られる)と
  rolling allowance方式(古いレビューがウィンドウから外れるにつれ枠が空く)は台帳(等級A)で
  裏付けが取れている。**「N分待て」で戻るのは1件分の枠であって、絞られている状態そのものは
  続くという理解は、この2つの台帳記述と整合する。
- **4つ目の変種と、`state: success`が「レビュー不要」を意味しない実例(計画セッション実測・
  2026-08-17、PR #269の4回目push `5f34452`)。**commit statusの`description`が
  `Review skipped`(PR #267の`Review rate limited`とも異なる文言)になった一方、`state`は
  `success`のまま。**`success`+`skipped`を「レビュー不要につき通過」と読むと、Draft中の
  必須2本(claude-review・CodeRabbit。SKILL.md「Draft PR中の必須レビュー」)のうち
  CodeRabbitが実際には走っていないのに条件を満たしたことになる**
  (#256§8.5「不在を成功の根拠にしない」が想定する形そのもの)。同時刻(12秒前)に、既存の
  walkthroughコメントへレート制限の告知(`## Review limit reached`、「Next review available
  in: 31 minutes」)が**新規投稿ではなく編集(`updated_at`のみ進む)で**追記されていた——
  `created_at`だけでポーリングする取得手段はこの告知を取りこぼす。**HTMLマーカー
  `<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->`は3回目も
  一致した**(見出し・commit status文言がいずれも変わった中でマーカーだけが安定)。
  **さらに強い標本: 同一PRの連続する2 push(4分差)で、同一条件(どちらもレート制限、
  レビューは1本も走っていない)の`description`が2通り出た**(`5f34452`は`Review skipped`、
  `417f2cb`は`Review rate limited`。いずれも`state: success`。`pulls/269/reviews`への
  CodeRabbit投稿は23:19/23:36/23:42の3件のみでこの間に増えていないことを確認済み)。
  **これは「文言が時点で変わった」ではなく「同一条件・同一セッションでdescriptionが
  2通りある」ことの直接証拠であり、時点差・プラン差では説明できない。逐語照合という
  選択肢自体が成立しないことを示す、`docs/review-process-design.md`§11の裏付けとしては
  最も強い標本である。**

## 7. 相乗り修正(3箱の仕分けとは別。記録のみ)

`docs/research/review-tools/github-platform.md`の「Draft PRで空配列になる」という帰属の誤りを、
一次情報との食い違いとして同じPRで修正した(軸10の行と値域表)。**決定変数は`draft`ではなく`fork`。**
`cli/cli` #14104(draft:true・非fork)は非空、`vercel/next.js` #97420(draft:false・fork)は空、を
2026-08-16観測(標本2リポジトリ)で確認済み。**これは3箱の仕分け結果ではない(#257本文の指定どおり、
混ぜていない)。**

## 8. 受け入れ条件との対応

- [x] 3箱すべてが埋まっている(2〜4節)
- [x] 箱3が空の参照先は無かったが、探した結果を含め参照先ごとに記録した(4.1〜4.4節)
- [x] 箱1の不一致それぞれに、台帳側の引用に当たり直した記録がある(2.1〜2.4節、各項目に台帳の逐語・軸番号を明記)
- [x] 箱1の不一致それぞれに、「意図的か/ずれか」が記録されている(CodeRabbit指摘・2026-08-17、
      計画セッション回答2件で確定。**「5件」という数え方自体が誤りだった**——#150は不一致では
      なく一致であり対象外、#262は判定済みだが引用コメントが漏れていた。以下は
      **不一致として列挙した項目と1対1で対応する最終形**)
      - **②CodexのP0/P1のみ記述=ずれ(2.2節①)** [回答1](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310184730)
      - **③Codexの5時間ウィンドウ=「共有する」は確定・単位のみずれ(2.2節②)** [回答1](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310184730)
      - **④CodeRabbitのreview_progress=台帳B等級とC1実測の食い違い(2.3節③)** [回答1](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310184730)
      - **⑤CodeRabbitのレート制限文言=時点差・プラン差でマーカーは安定(2.3節④)** [回答1](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310184730)
      - **Claude#262=`.claude-pr/**`限定は意図的。「差分の外は読まない」という帰結が今回
        貫徹しなかったことは意図されていない(到達経路・実効性は未確定のまま記録。2.1節。
        訂正あり)**
        [回答2](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310203364)、
        [訂正](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310524970)
        (当初「読めないまま読んだと報告し緑を返す」と記録したが、権限設定からの演繹のみで
        引用の実ファイル一致を確認しなかったための誤りと判明し、上記の形に訂正した)
      - **Copilot⑥のquota用語差=「意図的ではない」「ずれ」両方とも確定(契約が2026-08からで
        レガシー課金の対象外と判明。2.4節⑥)**
        [回答3](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310262725)、
        [回答4](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310509189)
      - **(参考)Claude#150は不一致ではなく一致に分類し直した(2.1節の表。対象外)**
        [回答3](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310262725)
      - **(参考)Copilotの観点配布(①/2.4節⑤)は状態=未調査であり不一致に数えていない。**
        本文の前提誤り(「観点を一切持っていない」)は訂正済みだが、`AGENTS.md`をCopilotが
        実際に読んでいるかの直接実測は無い。「無理に一致/不一致へ倒さず未調査のまま置く」という
        計画セッションの回答([回答2](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310203364))
        どおり、この項目には「意図的か/ずれか」の判定を要求しない(#150と同じ理屈。
        [回答3](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310262725))
- [x] C側の範囲が上記で尽きているかを点検した記録がある(1節)
- [x] 処置方針を書いていない(すべて#258へ送る前提で統一)

**Draft後のCodeRabbit・計画セッションの指摘(2026-08-17、3巡)を反映して修正した点:**
`=`の述語(37行目付近)、**#262の分類を箱2から箱1へ訂正**(#257本文自体が2箇所で矛盾していたための
計画セッション裁定。5節・3.1節・6.3節を連動して修正)、Codexの読取範囲をClaude・CodeRabbit・Copilotの
「我々の設定が原因」から分離(6.3節)、本書冒頭へのJST/UTC日付基準の明記、github-platform.mdの
`check_run.pull_requests`(公式仕様)と`commits/{sha}/pulls`(我々の観測)の混同回避、
`automation-config`分類の項目数(5→7)、6.1節Copilot経路表へのAGENTS.md自動認識・`.github/skills/`の追加、
**#150を不一致から一致へ再分類**(2.1節)、⑥Copilotのquota用語差の判定を「意図的か」「ずれか」の
2軸に分割、Draft先行の根拠に置かれた「13回相当」という数値が現行課金下では意味を持たない可能性
(用語の古さとは別問題として2.4節に追記)、**Copilotの観点配布(未調査)を不一致の集計から除外**
(受け入れ条件、8節)、**CodeRabbitレート制限信号の4つ目の変種**(`Review skipped`+
`state: success`、既存コメントの編集による告知追記、マーカーの再度の安定。6.4節)、
**同一条件でcommit status descriptionが2通り出た実測**(6.4節)、Draft必須2本の記載を
「claude-review・Copilot」から「claude-review・CodeRabbit」(Draft期の正しい対)へ訂正、
⑥Copilotのquota用語差を「意図的ではない」「ずれ」両方とも確定に更新し、現行課金2軸のうち
Actions minutesはこのリポジトリ(public)には掛からないという発見を追加(2.4節)、**#262に
追加した「読めないまま『読んで突き合わせた』と報告し緑を返す」という記録を、その後の反証
(`71b96d6`のrunで差分外2ファイルへの正確な参照が確認された)を受けて訂正**——設定値からの
演繹のみで断定し引用の実ファイル一致を確認しなかったことが誤りの原因であり、訂正後は
「設定は宣言どおりだが、今回の観測では宣言された制約(『差分の外は読まない』)が貫徹しなかった
(到達経路・実効性は未確定)」という所見に置き換えた(CodeRabbit指摘によりさらに「常に
貫徹していない」への一般化を避ける形へ修正。2.1節・5節・6.3節を連動して修正)。
