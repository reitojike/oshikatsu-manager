# 台帳と現行プロセスの3箱仕分け(#257)

> **これは検討記録であり、正本ではない。**本書は `docs/research/review-tools/*.md`(フェーズ1の仕様台帳)と
> **現行プロセス(C側。このリポジトリの実際の設定・運用)** を突き合わせ、3箱に仕分けた記録である。
> **`docs/review-process-design.md`(#256の設計成果物)は比較対象ではない。**設計は「どこを見るか」を
> 指す光であって、被比較物ではない(#257本文)。処置方針(「こう直す」)はここでは決めない。**#258の仕事。**

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
    記録されている3本と一致。テスト不足の課題はあるが、本Issueの3箱仕分けの対象=ボット挙動の突き合わせではない)。
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
| 軸6: `resultMessage.is_error`が何によってtrueになるか特定できていない(D、未調査) | `check-claude-review.mjs`は`outcome === "failure"`を「元stepが既に赤い」として扱うのみで、is_errorの内部原因追跡はしない | 一致(同じ限界を共有したまま運用。#150として追跡) |
| 軸8: 正式PRレビュー提出不可・複数コメント投稿不可(A) | promptは「総評は`gh pr comment`」「個別指摘は`mcp__github_inline_comment__create_inline_comment`」と明示的に使い分けさせる設計 | 一致 |

**不一致**

- **#150(すでに実測済み。導出をやり直さない)。**台帳 軸6が記録する「`is_error`が何によってtrueになるか特定できていない」という限界がそのまま現れた事象。`is_error:true`で投稿0件のまま赤くなる再現性の無いバグとして#150がオープンのまま追跡中。**見立て: ずれ(未解決バグ)。意図的な設計ではない。**
- **#262(すでに実測済み。導出をやり直さない)。**`--allowedTools`に汎用`Read`/`Grep`/`Glob`が無く、差分の外を一切読めない。ただしこれは箱1(不一致)ではなく**箱2**として扱う(下記5節)。理由は#257本文のとおり: 台帳が示す既定の許可範囲(ファイル読み取りを含む。軸4)に対し、C側が`--allowedTools`で明示的に絞っている「我々が自分で殺している」形であり、ベンダー側の制約ではない。

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

- **①「GitHub上ではP0/P1のみ」という記述と、自リポジトリでのP2実測の食い違い。**
  台帳 軸8は公式ドキュメント("Codex flags only P0 and P1 issues")をA等級で確認する一方、**同じ軸8に**
  「PR単位のゲート適用後の46 PR分で...値域はP0=0/P1=23/**P2=6**/P3=0。公式ドキュメント(P0/P1のみ)と
  実際の表示(P1・P2が出る)は一致しない」という**自リポジトリでのC1実測**(2026-08-16確認)を併記している。
  `.claude/skills/pr-review-flow/SKILL.md`は前者(公式ドキュメント)のみを運用前提にしている。
  **見立て: [Issueコメント(2026-08-17)](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310119211)の確認事項2件目として提示済み。ずれの可能性が高い**
  (skill側がC1実測の確認日より前の理解のまま更新されていない)。
- **②「Plusの同じ5時間ローリングウィンドウの枠を共有する」という断定と、台帳の未確定な調査結果の食い違い。**
  `docs/roadmap.md`は5時間ローリングウィンドウの共有を断定するが、台帳 軸7は「料金ページの`/5h`列は
  全プランで`Not available`」「2026-07-13に5時間上限の一時撤廃がXで告知された(D、未確認)」
  「実際の画面表示は`週間利用上限`」を記録し、**「両者が同じ枠の別表現なのか、別々の制限なのかは
  確認できていない」「`/5h`という見出しは、確認日時点の枠の体制を示す根拠として使えない」**と
  結論している。**見立て: 上記Issueコメントの確認事項3件目として提示済み。**

### 2.3 CodeRabbit(`coderabbit.md`)

**一致**

| 台帳の主張 | C側の現在値 | 判定 |
| --- | --- | --- |
| 軸1: `auto_review.drafts`既定値`false`(A) | `.coderabbit.yaml`で`drafts: true`に意図的に上書き(コメントで理由明記) | 一致(意図的な既定値逸脱) |
| 軸1: `auto_pause_after_reviewed_commits`既定値`5`、`0`で無効化可(A、スキーマ逐語) | `.coderabbit.yaml`で`0`に設定。このリポジトリ自身での検証実績(PR #35)をコメントに記録 | 一致(意図的、かつ実測で裏付け済み) |
| 軸2: `language`はISO言語コードのenum制約(約100件、B) | `.coderabbit.yaml`で`language: "ja-JP"`(enum内) | 一致 |
| 軸3: リポジトリ全体クローンで解析、Agentic exploration(A) | SKILL.mdが「`common/`への複製、型の二重定義、成果物間の矛盾などはCodeRabbit・Codex Cloud・セルフレビューが担う」と、この能力への依存を前提に役割分担を設計 | 一致 |

**不一致**

- **③ `review_progress`/`commit_status`の適用条件が、台帳の仕様記述と実挙動で食い違う。**
  台帳 軸2/軸5(スキーマ逐語、B等級)は「`commit_status`(legacy)は`review_progress`が無効な場合にのみ使われる」と
  明記する。C側`.coderabbit.yaml`はどちらのキーも未設定(=`review_progress: true`が既定で有効なはず)だが、
  `docs/pr-review-flow-details.md`のレート制限実測(PR #225)はcommit status経由でしか信号を得ていない。
  **見立て: 上記Issueコメントの確認事項4件目として提示済み。**ベンダー側の一次情報間の食い違いの可能性が高く、
  C側の設定変更の要否ではなく理解の確認。
- **④ レート制限メッセージの文言が台帳のC2観測(2024-2025年)とC側実測(2026年)で異なる。**
  台帳は「Please wait N分M秒」という秒単位の待機時間を含む文言をC2で記録するが、C側の2026年実測
  (このリポジトリ自身)では「Review limit reached」+「Next review available in: N minutes」(分単位)、
  または commit status の`description`のみで、秒単位の文言は一度も出ていない。
  **見立て: 上記Issueコメントの確認事項5件目として提示済み。**時点差またはプラン差による可能性が高い。

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

**不一致(最重要。#257本文の前提を修正する発見)**

- **⑤ 台帳自身が「Copilotは2026-07-17以降`AGENTS.md`を自動認識する」とA等級で確認しているのに対し、
  #257本文は「Copilotは観点を一切持っていない」を前提に箱3として調査対象を組んでいた。**
  台帳`copilot.md`軸4(2026-08-16確認、GitHub公式changelog逐語、本Issueで直接確認済み):

  > 2026-07-17以降、`.github/copilot-instructions.md`・`*.instructions.md`・**AGENTS.md**・agent skillsに
  > 加えて、`REVIEW.md`・`GEMINI.md`・`CLAUDE.md`という既存のレビューガイドライン用ファイルも
  > 自動的に認識し、レビューに取り込むようになった

  このリポジトリには`## Code Review Rules`節を含む`AGENTS.md`が実在する。**したがって「Copilotへ
  観点が一切届いていない」は台帳自身の記述と矛盾する可能性が高い。**ただしCopilotが実際にAGENTS.mdを
  読んでいるかの直接実測(実際のレビュー本文にAGENTS.md由来の指摘が現れるか等)は本Issueの範囲では
  行っていない。**見立て: 上記Issueコメントの確認事項1件目として提示済み。**箱2の記録範囲(下記3.4節)をこの発見を
  踏まえて絞り込むべきかどうかはPO回答待ち。
- **⑥ quota失敗時の文言と課金体系の食い違い(用語のずれの可能性)。**
  台帳 軸7(A等級)は「2026-06-01以降の現行課金はAI Credits + GitHub Actions minutesの2軸で、
  『premium request』はそれ以前の年間契約Pro/Pro+にのみ残るレガシー課金」と確認しているが、
  C側(SKILL.md・`docs/pr-review-flow-details.md`)は一貫して「プレミアムリクエスト」という
  レガシー用語のみを使用している。`docs/pr-review-flow-details.md`「Draft先行の根拠」の実測
  (1レビューあたりプレミアムリクエスト13回相当)は台帳のレガシー課金下のmodel multiplier数値と
  一致するため、**当時の実測はレガシー課金下だったことは裏付けられる**が、現在のC側組織の契約が
  移行済みかどうかはリポジトリ側のファイルからは判別できない。
  **見立て: ずれの可能性(用語が古いまま)だが、確定にはGitHub側の契約状態確認が要る。
  PO確認は必須としないが、`docs/pr-review-flow-details.md`の用語が古い可能性がある点として記録。**

## 3. 系統別の箱2(台帳にありC側に無い)

### 3.1 Claude Review

- **`--allowedTools`が汎用`Read`/`Grep`/`Glob`を持たない(#262 / #242「方針」)。**
  台帳 軸4(A等級)は既定で許可される範囲に「ファイル操作(読み取り)」を含むと明記しており、
  `--allowedTools`で明示的に絞らない限りBashコマンド以外の読み取りは既定で可能と読める。
  C側は`CLAUDE_REVIEW_ALLOWED_TOOLS`を`mcp__github_inline_comment__create_inline_comment` /
  `Bash(gh pr comment:*)` / `Bash(gh pr diff:*)` / `Bash(gh pr view:*)` / `Read(.claude-pr/**)`
  (パス限定)のみに絞っており、`docs/pr-review-flow-details.md`は「汎用`Read`/`Grep`/`Globは
  付与しない方針(#242)」と明記している。**能力自体は台帳にあり(tagModeTools定義に
  `Glob`・`Grep`・`LS`・`Read`が含まれる、軸2)、C側が意図的に絞っている。**
  詳細は下記5節「読める範囲の差」。
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
  (5項目: 権限拡大・secret/skipの穴・イベント種別/再実行条件・required checkの永久pending・
  fork PRでのsecret・action参照のSHA固定・設定変更と関連文書/テストの整合)がCodeRabbitに
  一切届いていない。**#256論点1の「下限を揃える」を実現するには、この欠落が埋まらないかぎり
  Claude以外の2系統で十分という前提が崩れうる(#257本文)。**
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
  **ただし上記2.4の⑤のとおり、`AGENTS.md`自体は2026-07-17以降の自動認識対象ファイル名と一致するため、
  「観点が一切届いていない」への強い主張はPO確認待ち。**確実に言えるのは「パス単位の観点分岐
  (`applyTo` glob)や専用ファイルによる明示的な観点追加の経路は使っていない」こと。
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
| **Claude** | (#257で確認) | **`gh pr diff` / `gh pr view`の出力と、`Read(.claude-pr/**)`(復元対象パス退避先限定)のみ。汎用`Read`/`Grep`/`Glob`/`Bash(git ...)`は無い** |

**判定: 箱2(台帳にある能力を我々が自分で殺している)。箱3ではない。**

- claude-code-action自体は既定でファイル読み取りを許可する設計であり(台帳 軸4)、`tagModeTools`の
  既定リストには`Glob`・`Grep`・`LS`・`Read`が含まれる(台帳 軸2)。**ベンダー側の制約ではない。**
- `--allowedTools "${CLAUDE_REVIEW_ALLOWED_TOOLS}"`という明示指定はホワイトリストとして働き、
  `docs/pr-review-flow-details.md`が「汎用`Read`/`Grep`/`Globは付与しない方針(#242)」と明記するとおり、
  **C側が意図的に絞った結果**である(`claude-review.yml`は`pull-requests: write` / `issues: write` /
  `id-token: write`とOAuthトークンを持つワークフローであるため、権限拡大には別途の根拠が要ると
  判断した、と同文書に理由も記録されている)。
- 帰結として、`AGENTS.md`の`## Code Review Rules`が定義する観点のうち「差分の外を読まないと
  判定できないもの」(`common/`への複製、型の二重定義、成果物間の矛盾)は、Claudeだけが
  実行できない。CodeRabbit・Codex・セルフレビューが役割分担で担っている(#242 決定4、
  `docs/pr-review-flow-details.md`に明記済み)。

## 6. 追加スコープ2: レビュー観点の配布状況

### 6.1 観点を得る経路の現在値

| 系統 | 観点を得る経路 | 現在値 |
| --- | --- | --- |
| Claude | 我々のスクリプトが`AGENTS.md`の該当節を注入 | `build-review-prompt.mjs`が`AGENTS.md`の`## Code Review Rules`節を`git show <base>:AGENTS.md`で取得し、共通部分+変更ファイルの分類(`code`/`governance-docs`/`automation-config`)に応じた`###`見出しブロックだけをpromptへ結合する。**節が正確に1つ・各分類ブロックが空でない・見出しの並びが3分類の順**であることを構造的にvalidateし、条件を満たさなければ`fail()`でCIごと落とす |
| Codex | `AGENTS.md`をネイティブに読む(台帳 軸4、等級A) | ワークフロー不在。追加設定は不要(2.2節で確認済み) |
| CodeRabbit | `.coderabbit.yaml`の`path_instructions` | `**/*.{ts,tsx}` / `supabase/migrations/**` / `test/db/**` の3パスのみ。**`.github/**`を含む`automation-config`系のパスは対象外**(3.3節の箱2) |
| Copilot | `.github/copilot-instructions.md` / `.github/instructions/**` | **どちらも存在しない。**ただし2026-07-17以降`AGENTS.md`自体が自動認識対象(2.4節⑤、PO確認待ち) |

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
| Claude | `code`分類の「`common/`への複製・別層配置」「型の二重定義」、`governance-docs`分類の「成果物間の矛盾」「正本の複数配置」、`automation-config`分類の「設定変更と関連文書・テストの整合」——**差分の外(比較対象の別ファイル)を一切読めないため、これらすべてが実行不能**(5節「読める範囲の差」参照)。**これは箱2の帰結であり、ベンダー制約ではなく我々の設定による制限** |
| CodeRabbit | リポジトリ全体クローン+Agentic explorationにより、上記の差分横断系観点は原理的に実行可能。ただし`automation-config`分類の5項目自体が`path_instructions`の対象パス(`.github/**`)に含まれていないため、**観点として指示されておらず「配られていない」状態に近い**(3.3節の箱2)。読める範囲の制約ではなく、観点配布側の欠落 |
| Copilot | Rich Context with Tool Callingにより読める範囲自体は広いと台帳は示すが、**専用の観点ファイル(`.github/copilot-instructions.md`等)が無いため、`## Code Review Rules`の分類別の観点(code/governance-docs/automation-configの書き分け)自体が渡っていない可能性がある**(2.4節⑤、AGENTS.md自動認識の実効性はPO確認待ち)。読める範囲ではなく観点配布側の不確実性 |
| Codex | `AGENTS.md`をネイティブに読むため、`## Code Review Rules`全体(3分類とも)が届いている。読める範囲は「diff + 変更ファイルに掛かるAGENTS.md群」で、差分に現れないファイルとの突き合わせ(成果物間の矛盾等)は原理上難しい可能性があるが、台帳・C側とも明示的な制約の記述は見つからなかった |

**我々の設定によって特定の系統だけが制限されている状態かどうかの区別:**

- **我々の設定が原因(是正の余地がある):** Claude(`--allowedTools`の絞り込み、箱2)、CodeRabbit
  (`path_instructions`の`.github/**`欠落、箱2)、Copilot(専用観点ファイルの不在、箱2。ただし
  AGENTS.md自動認識の実効性次第で評価が変わる、PO確認待ち)
- **ベンダー側の仕様でアンコントローラブル(是正の余地が無い、または別の意味を持つ):** 4系統とも
  読める範囲そのものはベンダー機能(Agentic exploration・Rich Context・AGENTS.mdネイティブ読み込み)
  であり制約ではない。**「実行できない」の原因はすべて観点配布側(我々が絞っている `path_instructions`
  や`--allowedTools`、または専用ファイルの不在)にあり、ベンダー側の読める範囲の狭さが原因の系統は無い。**

**この実測に検知の価値がある根拠(#257本文、PR #267実測・2026-08-17)。**観点を持つ系統(Codex、
AGENTS.mdをネイティブに読む)は同一差分でP1指摘3件(設計内部の不変条件の矛盾、いずれも
`AGENTS.md:L86-L90`引用)を出した一方、観点を持たない系統(Copilot、当時`.github/copilot-instructions.md`
無し)は同じ回に表記3件のみだった。**標本は1回のみ**であり「観点を配ればCopilotもP1を出せる」とは
言えないが、「観点を持つ系統と持たない系統で、同一差分に対する指摘の性質が違った」ことは示している。

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
- [ ] 箱1の不一致それぞれに、「意図的か/ずれか」が計画セッションの回答として記録されている
      —— **5件をIssueコメント([#257](https://github.com/reitojike/stage-tracker/issues/257#issuecomment-5310119211))で確認依頼済み、回答待ち**
      (①Copilotの観点配布、②CodexのP0/P1のみ記述、③Codexの5時間ウィンドウ、④CodeRabbitのreview_progress、⑤CodeRabbitのレート制限文言)
- [x] C側の範囲が上記で尽きているかを点検した記録がある(1節)
- [x] 処置方針を書いていない(すべて#258へ送る前提で統一)
