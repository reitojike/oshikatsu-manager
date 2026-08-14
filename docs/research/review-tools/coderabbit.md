# CodeRabbit 仕様台帳

調査対象は CodeRabbit(AIコードレビューSaaS)の公開仕様。一次情報は `docs.coderabbit.ai`
配下の公式ドキュメント、`https://coderabbit.ai/integrations/schema.v2.json`(設定スキーマ)、
`coderabbit.ai/pricing` 系ページ、および公開GitHubリポジトリ上でCodeRabbitが実際に投稿した
コメント・レビュー・commit statusの実例(GitHub REST API経由)。このリポジトリの設定・運用は
調査対象に含めていない。

**等級は「どの種類の情報源に当たったか」を表し、状態は「そこに何があったか」を表す。**
2列は独立しており、組で読む —— `(A, 確認済み)` は「公式に記載があった」、
`(A, 公式に未文書化)` は「公式を確認したが記載が無かった」。
**どちらも一次情報に当たっている点は同じなので、後者で等級は下がらない。**
**A・Bは「ベンダーが定義したもの」、C1・C2は「実際に起きたことの観測」であり、この線を跨いで混ぜない。**

| 等級 | 定義 |
| --- | --- |
| A | 公式ドキュメントを一次情報として確認した(記載の有無は状態列が示す) |
| B | API仕様・設定スキーマ・公開ソースの定義を一次情報として確認した(観測はここに含めない) |
| C1 | 我々の環境での実測(本調査では対象外。空) |
| C2 | 第三者の公開リポジトリでの実測 |
| D | 推測・未確認 |

**状態が `公式に未文書化` の行は、出典欄に次の2つを必ず書く。**引用が無いぶん、
これが無いと反証できず監査が成立しないため。

1. **検索範囲** —— 見たページのURL、見た節、使った検索語
2. **その情報源が閉じているか** —— スキーマやAPIのenumのような**網羅的な情報源**での不在は
   **「存在しない」**。散文ドキュメントのような**開いた情報源**での不在は
   **「文書化されていない」**にとどまる

| 軸 | 主張 | 出典(URL・参照先) | 等級 | 確認日 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 1 | 新規PR作成時にCodeRabbitは自動で包括的な("full comprehensive")レビューを行う | <https://docs.coderabbit.ai/guides/code-review-overview> | A | 2026-08-15 | 確認済み |
| 1 | 既存PRへの新規コミットpush時は"incremental review"(新規変更のみ)が自動で走る | <https://docs.coderabbit.ai/guides/code-review-overview> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.auto_incremental_review` の既定値は `true`(pushごとの自動incremental review) | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 1 | 手動トリガ `@coderabbitai review` は「最新の包括レビュー以降の新規変更のみ」を対象にincremental reviewを行う | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | 手動トリガ `@coderabbitai full review` は全ファイルを最初から("from scratch")再レビューする | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai pause` はPR上の自動レビューを一時停止する | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai resume` は一時停止した自動レビューを再開する | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai ignore` はPRの本文(description)に書いた場合のみ有効で、コメントに書いても効かない。取り除くまで自動レビューは恒久的に無効化される | <https://docs.coderabbit.ai/guides/commands> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.description_keyword` を設定すると、自動レビューが無効な状態でもPR本文への特定キーワード記載でopt-inできる | <https://docs.coderabbit.ai/configuration/auto-review> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.drafts` の既定値は `false`(ドラフトPRは既定で自動レビュー対象外) | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.base_branches` は正規表現で対象ベースブランチを絞り込める | <https://docs.coderabbit.ai/configuration/auto-review> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.labels` はPRラベルで対象を絞り込め、`!` 接頭辞で除外指定もできる | <https://docs.coderabbit.ai/configuration/auto-review> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.ignore_title_keywords` はPRタイトルの特定キーワードに一致した場合にレビューをスキップする | <https://docs.coderabbit.ai/configuration/auto-review> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.ignore_usernames` は特定ユーザー名(大文字小文字を区別する完全一致)のPR作成者をスキップする | <https://docs.coderabbit.ai/configuration/auto-review> | A | 2026-08-15 | 確認済み |
| 1 | `reviews.auto_review.auto_pause_after_reviewed_commits` の既定値は `5`(一定コミット数のレビュー後に自動一時停止) | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 1 | Bot判定されたアカウントが作成したPRは既定で自動レビューがスキップされ、実例コメントは "Bot user detected." および "To trigger a single review, invoke the `@coderabbitai review` command." と表示される | <https://github.com/zenstackhq/zenstack-v3/pull/148>(issue comments API)。公開リポジトリ(zenstackhq/zenstack-v3, visibility: public)。プラン名・OSS文言の記載はこのコメントには見当たらず、文脈不明。観測日2025-08-06。 | C2 | 2026-08-15 | 確認済み |
| 1 | 変更ファイルが `path_filters` で全て除外されるとレビュー自体がスキップされ、実例コメントは "Review was skipped due to path filters" と表示される | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>(issue comments API)。公開リポジトリ(ProjectTech4DevAI/kaapi-backend, visibility: public)。フッタに`It's free for OSS`の文言あり(プラン名自体の明記は無い)。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| 1 | レート制限超過時は新規レビューがスキップされ、実例コメントは "has exceeded the limit for the number of commits or files that can be reviewed per hour. Please wait **N minutes and M seconds** before requesting another review." と具体的な待ち時間を示す | <https://github.com/pyiron/pympipool/pull/338>(issue comments API)。公開リポジトリ(pyiron/pympipool, visibility: public)。フッタは"free to the OSS community"という趣旨の謝辞のみで定型句`free for OSS`とは文面が異なり、プラン名自体の明記は無い。観測日2024-05-28。 | C2 | 2026-08-15 | 確認済み |
| 1 | 同一PRで新規コミットが無いまま `@coderabbitai review` または `full review` を連続で使った場合に、2回目が実際に再実行されるか・重複排除されるかについて、`guides/commands`・`reference/review-commands` のいずれにも明記が無い | 検索範囲: <https://docs.coderabbit.ai/guides/commands>(「Manually request code reviews」節)、<https://docs.coderabbit.ai/reference/review-commands>(「Manual review triggers」節・末尾の「Command reference table」節)。検索語: "again" "duplicate" "idempotent" "no new changes"。`reference/review-commands` は「Complete reference of CodeRabbit commands」「here's a summary of all available commands」と明記されコマンド一覧としては網羅的だが、個々のコマンドの**繰り返し実行時の挙動**という行(値)自体が列挙されておらず、この論点に関しては開いた情報源(散文的な各コマンド説明)での不在にとどまる → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 1 | `@coderabbitai resolve` は新規のトップレベルPRコメントとして投稿する必要があり、レビュースレッド内への返信としては効かない | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai approve` は `reviews.request_changes_workflow` が有効な場合のみ、未解決スレッドを解決した上でApprove submitを試みる | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai autofix` には `autofix stacked pr`(新規ブランチ作成)と直接コミットの2バリアントがあり、エイリアスとして `auto-fix` / `auto fix` がある | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai emit path instructions` は過去7日分の提案を集約し、`.coderabbit.yaml` にpath instructionsを統合したPRを作成する | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai generate docstrings` はドキュメント未整備の関数・クラスに対してdocstringを生成する | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai generate unit tests` はPR内のコード変更に対してユニットテストを生成する(設定での有効化が必要) | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | `@coderabbitai fix-ci` は失敗したCIチェックを調査・修正する。`fix-ci commit`(直接コミット)または既定のstacked PRの2バリアントがあり、エイリアスとして `fix ci` / `fixci` がある | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 1 | Finishing Touchの「Resolve merge conflicts」は、両方の変更セットの意図を解析してマージコンフリクトを検出・解消しコミットする機能である | <https://docs.coderabbit.ai/finishing-touches/index> | A | 2026-08-15 | 確認済み |
| 1 | 「Resolve merge conflicts」の呼び出しトリガはPRコメント `@coderabbitai fix merge conflict` であると、`finishing-touches/index` の「Quick reference」表に明記されている(出力は "Merge commit on branch") | <https://docs.coderabbit.ai/finishing-touches/index>(「Quick reference」節の表) | A | 2026-08-15 | 確認済み |
| 1 | Finishing Touchの「Simplify code」は、変更コードを簡略化・再利用性・品質・効率の観点でレビューし対象を絞った改善を適用する機能である | <https://docs.coderabbit.ai/finishing-touches/index> | A | 2026-08-15 | 確認済み |
| 1 | 「Simplify code」の呼び出しトリガはPRコメントのスラッシュコマンドではなく「GitHub checkbox」(チェックボックス操作)のみであると、`finishing-touches/index` の「Quick reference」表に明記されている | <https://docs.coderabbit.ai/finishing-touches/index>(「Quick reference」節の表) | A | 2026-08-15 | 確認済み |
| 1 | Post-Merge Actionsは、PRがdefaultブランチにマージされた時点で、チェックボックスがオンのアクションを全て実行するという新規の自動発火契機である("When the PR is merged into the default branch, CodeRabbit runs every action whose box is still checked") | <https://docs.coderabbit.ai/pr-reviews/post-merge-actions> | A | 2026-08-15 | 確認済み |
| 2 | 設定ソースはデフォルトでマージされず、優先度は workspace global override > organization global override > repository `.coderabbit.yaml` > 中央リポジトリ設定 > repository UI設定 > organization UI設定 > workspace設定 > デフォルト設定 の順(高い方が優先) | <https://docs.coderabbit.ai/guides/configuration-overview> | A | 2026-08-15 | 確認済み |
| 2 | `.coderabbit.yaml` はリポジトリのルート、または組織内の `coderabbit` という名前の中央リポジトリのいずれかに置ける | <https://docs.coderabbit.ai/guides/configuration-overview> | A | 2026-08-15 | 確認済み |
| 2 | "configuration inheritance" を有効にすると、最優先ソースのみでなく親レベルの設定とマージするよう変更できる | <https://docs.coderabbit.ai/configuration/configuration-inheritance> | A | 2026-08-15 | 確認済み |
| 2 | `.coderabbit.yaml` のJSON Schemaは `https://coderabbit.ai/integrations/schema.v2.json` として公開されている | <https://coderabbit.ai/integrations/schema.v2.json> | B | 2026-08-15 | 確認済み |
| 2 | Web UIには設定変更手段として Concise(既定・主要設定のみ)/ All Settings(全項目) / YAMLエディタ の3モードがある | <https://docs.coderabbit.ai/guides/repository-settings> | A | 2026-08-15 | 確認済み |
| 2 | `path_filters` はglobパターン(`!`接頭辞で除外)で対象ファイルをレビューから完全に除外できる | <https://docs.coderabbit.ai/configuration/path-instructions> | A | 2026-08-15 | 確認済み |
| 2 | `path_instructions` はレビューの観点(ガイダンス)のみを変更するものであり、ファイルをレビュー対象から除外する機能ではない(「他機能が同じコードを検査するのを無効化しない」と明記) | <https://docs.coderabbit.ai/configuration/path-instructions> | A | 2026-08-15 | 確認済み |
| 2 | Enterprise限定で組織設定から "Use Workspace Settings" を有効にすると、対象の組織設定セクションが読み取り専用になる | <https://docs.coderabbit.ai/guides/organization-settings> | A | 2026-08-15 | 確認済み |
| 2 | GitHubのBranch protectionでCodeRabbitのcommit statusをrequired status checkとして組み込めるかどうかは、確認した3ページのいずれにも記載が見当たらない | 検索範囲: <https://docs.coderabbit.ai/guide/repository>(「Repository setup」全体、オンボーディング手順ページ)、<https://docs.coderabbit.ai/guides/repository-settings>(「Repository settings」全体、UI設定リファレンス)、<https://docs.coderabbit.ai/platforms/github-com>(「GitHub」全体、GitHub固有の前提条件・認可手順ページ)。検索語: "branch protection" "required status check" "required check" "block merge"。いずれのページも散文の手順・設定説明ページであり、GitHub側のBranch protection設定項目を網羅的に列挙する情報源ではない(開いた情報源) → 「文書化されていない」。この論点はCodeRabbit側ではなくGitHub側の設定であるため、そもそもCodeRabbitの公式ドキュメントが扱う対象外である可能性がある | A | 2026-08-15 | 公式に未文書化 |
| 2 | `reviews.tools` 配下で50以上のサードパーティlinter/SASTツール(ESLint、Ruff、Semgrepなど)を個別に `enabled: true/false` で切り替えられる | <https://docs.coderabbit.ai/tools/reference> | A | 2026-08-15 | 確認済み |
| 2 | AST-grepベースのpath instructions(`configuration/ast-grep-instructions`)はPro/Pro+/Enterprise限定の機能で、自動レビュー時のみ使え、chatでは使えない | <https://docs.coderabbit.ai/configuration/ast-grep-instructions> | A | 2026-08-15 | 確認済み |
| 2 | `reviews.disable_cache` を `true` にするとリポジトリのキャッシュ利用をオプトアウトできる(既定は有効) | <https://docs.coderabbit.ai/reference/caching> | A | 2026-08-15 | 確認済み |
| 2 | ルートキー `language` は「ISO言語コードでレビュー言語を設定する("Set the language for reviews by using the corresponding ISO language code.")」設定で、既定値は `"en-US"` | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 2 | ルートキー `early_access` は「早期アクセス機能を有効化する("Enable early-access features.")」設定で、既定値は `false` | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 2 | ルートキー `enable_free_tier` は「有料プラン未加入ユーザー向けにFree tier機能を有効化する("Enable free tier features for users not on a paid plan.")」設定で、既定値は `true` | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 2 | スキーマのルートに `code_generation` キーが存在する | <https://coderabbit.ai/integrations/schema.v2.json> | B | 2026-08-15 | 確認済み |
| 2 | `reference/configuration` は全キーを網羅するper-key referenceとして構成されており、`code_generation` は単一のフラットなキーとしてではなく「Code generation」という独立した最上位セクション(Docstrings/Unit Testsの2サブシステムの設定を含む)として文書化されている | <https://docs.coderabbit.ai/reference/configuration>(「Code generation」節) | A | 2026-08-15 | 確認済み |
| 3 | レビュー時はサンドボックス化されたクラウド実行環境にリポジトリ全体をクローンして解析する("Sandboxed cloud execution with your full repository cloned for isolated analysis") | <https://docs.coderabbit.ai/overview/architecture> | A | 2026-08-15 | 確認済み |
| 3 | "Agentic exploration"としてdiff以外のコードベースも自律的に調査してコンテキストを得る("autonomously investigates your codebase for context") | <https://docs.coderabbit.ai/overview/architecture> | A | 2026-08-15 | 確認済み |
| 3 | "Living memory"として過去のフィードバック・PR・issue・コーディング規約を学習し反映する | <https://docs.coderabbit.ai/overview/architecture> | A | 2026-08-15 | 確認済み |
| 3 | Multi-repo analysisは既定で無効("Multi-repo analysis is not enabled by default")であり、有効化しない限りリンク先リポジトリの内容はレビューに反映されない | <https://docs.coderabbit.ai/knowledge-base/multi-repo-analysis> | A | 2026-08-15 | 確認済み |
| 3 | Multi-repo analysisの手動リンクはProプランから、自動リンクはPro+・Enterpriseプラン限定 | <https://docs.coderabbit.ai/knowledge-base/multi-repo-analysis> | A | 2026-08-15 | 確認済み |
| 3 | クロスリポジトリの影響が無い変更の場合、Multi-repo analysisは「所見を出さないのが正常動作であり誤設定を意味しない」と明記されている | <https://docs.coderabbit.ai/knowledge-base/multi-repo-analysis> | A | 2026-08-15 | 確認済み |
| 3 | レビューが「差分のみ」か「変更ファイル全文」かの正確な境界線について、`overview/pull-request-review` ページを確認したが明記が見当たらない | 検索範囲: <https://docs.coderabbit.ai/overview/pull-request-review>(「Automatic and incremental」節・「Connected to your workflow」節を含む全体)。検索語: "diff" "full file" "entire file" "patch"。ページは「Full analysis of all changes」という表現はあるが、diff/patchのみか変更後のファイル全文かを明示的に区別する記述は無い。このページは機能訴求を目的としたnarrative overviewであり、技術仕様を網羅する情報源ではない(開いた情報源) → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 3 | Learningsの適用範囲は既定(Auto)では、公開リポジトリのレビューにはそのリポジトリ固有のlearningsのみ、非公開リポジトリのレビューには組織全体のlearningsを適用する。設定でGlobal/Localに変更可能 | <https://docs.coderabbit.ai/knowledge-base/learnings> | A | 2026-08-15 | 確認済み |
| 3 | 「PR validation using linked issues」は、PR本文でリンクされたJira/Linear issueの内容を読み取り、要件が満たされているかを判定し、ギャップがあればレビューで指摘する("CodeRabbit flags it during review") | <https://docs.coderabbit.ai/issues/pr-validation> | A | 2026-08-15 | 確認済み |
| 3 | Jira/Linear連携によるPR validationは、非公開リポジトリでは既定で有効、公開リポジトリでは既定で無効 | <https://docs.coderabbit.ai/issues/pr-validation> | A | 2026-08-15 | 確認済み |
| 3 | MCPサーバー統合はModel Context Protocol経由で外部ツール・データソースに接続し、レビューに「より豊かなコンテキスト理解("richer contextual understanding")」を与える | <https://docs.coderabbit.ai/integrations/mcp-servers> | A | 2026-08-15 | 確認済み |
| 3 | CI/CDパイプライン解析はGitHub Actions・GitLab CI/CD・CircleCI・Azure DevOps Pipelinesに対応し、失敗した出力を読み取ってコード行にinlineコメントで修正提案を投稿する。ただしGitHub Actionsでの利用には別途 `github-checks` ツール設定が必要 | <https://docs.coderabbit.ai/pr-reviews/cicd-pipeline-analysis> | A | 2026-08-15 | 確認済み |
| 3 | CircleCI連携は、パイプライン失敗の詳細を自動的にレビューへ取り込む("pipeline failure details are pulled into the review automatically") | <https://docs.coderabbit.ai/integrations/circleci> | A | 2026-08-15 | 確認済み |
| 4 | `path_instructions` はglobパターンにマッチするファイルに対して自然言語でレビュー観点を指示できる(例: "src/controllers/\*\*" に "Focus on authentication, authorization, and input validation") | <https://docs.coderabbit.ai/configuration/path-instructions> | A | 2026-08-15 | 確認済み |
| 4 | AST-grepベースのpath instructionsは構文パターン一致に基づくより精密な指示を可能にする | <https://docs.coderabbit.ai/configuration/ast-grep-instructions> | A | 2026-08-15 | 確認済み |
| 4 | `reviews.high_level_summary_instructions` でPRサマリ(walkthrough)の生成指示をカスタマイズできる | <https://docs.coderabbit.ai/pr-reviews/summaries> | A | 2026-08-15 | 確認済み |
| 4 | スキーマのルートに `tone_instructions`(レビュー全体のトーン指示)キーが存在する | <https://coderabbit.ai/integrations/schema.v2.json> | B | 2026-08-15 | 確認済み |
| 4 | スキーマの `reviews` 配下に `labeling_instructions`(提案ラベル生成指示)キーが存在する | <https://coderabbit.ai/integrations/schema.v2.json> | B | 2026-08-15 | 確認済み |
| 4 | スキーマの `reviews` 配下に `suggested_reviewers_instructions`(レビュアー提案生成指示)キーが存在する | <https://coderabbit.ai/integrations/schema.v2.json> | B | 2026-08-15 | 確認済み |
| 4 | PR上で `@coderabbitai` にメンションすると、レビューコメントへの返信・行コメント・トップレベルPRコメントの3通りの方法で自然言語による自由な質問・指示ができる | <https://docs.coderabbit.ai/guide/chat> | A | 2026-08-15 | 確認済み |
| 4 | レビューコメントへの返信で自然言語により好みを伝えると、理由(why)込みでlearningsとして記憶され、以降のレビューに継続適用される | <https://docs.coderabbit.ai/knowledge-base/learnings> | A | 2026-08-15 | 確認済み |
| 4 | Custom checks(pre-merge checks)は自然言語の決定的な("deterministic")指示文で合否基準を定義でき、判定は Passed / Failed / Inconclusive の3状態で返る | <https://docs.coderabbit.ai/pr-reviews/custom-checks> | A | 2026-08-15 | 確認済み |
| 4 | Custom checksはPro+・Enterpriseプラン限定機能である | <https://docs.coderabbit.ai/pr-reviews/custom-checks> | A | 2026-08-15 | 確認済み |
| 5 | レビュー本体はGitHubの Pull Request Review オブジェクトとして投稿され、`state` は観測した実例で `COMMENTED` または `APPROVED` を取った(Reviews APIで取得可能) | <https://github.com/actualbudget/actual/pull/3584>(`GET /repos/{owner}/{repo}/pulls/{n}/reviews`)。公開リポジトリ(actualbudget/actual, visibility: public)。コメント本文にプラン名・OSS文言の明記は見当たらず、文脈不明。観測日2024-10-06〜10-07。 | C2 | 2026-08-15 | 確認済み |
| 5 | 個々の指摘はレビューに紐づくinline review comment(`pulls/comments` API)として投稿される | <https://github.com/actualbudget/actual/pull/3584>(`GET /repos/{owner}/{repo}/pulls/{n}/comments`)。公開リポジトリ(actualbudget/actual, visibility: public)。プラン名・OSS文言の明記は見当たらず、文脈不明。観測日2024-10-06〜10-07。 | C2 | 2026-08-15 | 確認済み |
| 5 | PRサマリ(walkthrough)はissue comment(トップレベルコメント)として投稿され、`issues/comments` APIで取得できる | <https://github.com/actualbudget/actual/pull/3584>(`GET /repos/{owner}/{repo}/issues/{n}/comments`)。公開リポジトリ(actualbudget/actual, visibility: public)。プラン名・OSS文言の明記は見当たらず、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| 5 | `reviews.commit_status` の既定値は `true` で、レビュー進捗をレガシーのcommit statusとしても表面化する(required checkとの互換のため) | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 5 | commit statusの `context` は実例で `"CodeRabbit"`、`description` はレビュー完了時に `"Review completed"`、`state` は `"success"` を取った | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>(`GET /repos/{owner}/{repo}/commits/{sha}/status`)。公開リポジトリ(ProjectTech4DevAI/kaapi-backend, visibility: public)。フッタに`It's free for OSS`の文言あり。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| 5 | 投稿アカウントのGitHub login識別子は `coderabbitai[bot]`、`type` は `Bot`、数値の `id` は安定して同一の値(実例では `136622811`)だった | <https://github.com/tsparticles/utils/pull/71>(issue comments APIの `user` フィールド)。公開リポジトリ(tsparticles/utils, visibility: public)。フッタに`It's free for OSS`の文言あり。観測日2025-08-31。 | C2 | 2026-08-15 | 確認済み |
| 5 | 公式サイトはCodeRabbitのGitHub AppページとしてURL `https://github.com/apps/coderabbitai` を案内している(=App識別子は`coderabbitai`) | <https://docs.coderabbit.ai/faq> | A | 2026-08-15 | 確認済み |
| 5 | レビューコメント本文には `<!-- This is an auto-generated comment by CodeRabbit -->` というHTMLコメントマーカーが個々の指摘の末尾に付く | <https://github.com/actualbudget/actual/pull/3584>(pulls/comments APIのbody)。公開リポジトリ(actualbudget/actual, visibility: public)。文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| 5 | Pre-merge checksの結果はPRの "Walkthrough" 内に表示される(Walkthroughセクションの一部として構成される) | <https://docs.coderabbit.ai/pr-reviews/pre-merge-checks> | A | 2026-08-15 | 確認済み |
| 5 | Pre-merge checksがGitHubのcommit statusとcheck run(Checks API)のどちらの仕組みで報告されるかは、`pr-reviews/pre-merge-checks` ページに明記が見当たらない | 検索範囲: <https://docs.coderabbit.ai/pr-reviews/pre-merge-checks>(「Results in the Walkthrough」節・「Configuring Pre-merge Checks」節を含む全体)。検索語: "commit status" "check run" "Checks API" "status check"。いずれも0件。このページはBuilt-in Checks/Custom Checks/Enforcement Modesなどユーザー向け機能説明が中心のnarrative feature pageであり、GitHub API連携の技術実装仕様を記載する情報源ではない(開いた情報源) → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 5 | GitHub Checksツール統合はCodeRabbit自身がcheck runを作るのではなく、既存のGitHub Actions/CI check runの出力を読み取って"reads their output"、修正提案をinlineコメントとして投稿する | <https://docs.coderabbit.ai/tools/github-checks> | A | 2026-08-15 | 確認済み |
| 6 | 個々のPRレビューコメント本文には `<!-- This is an auto-generated comment: summarize by coderabbit.ai -->` (walkthrough)、`<!-- This is an auto-generated comment: skip review by coderabbit.ai -->` (スキップ)、`<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->` (レート制限)という異なるHTMLマーカーが付き、これによって「成功」「スキップ」「レート制限」をコメント本文の走査で機械的に区別できる | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>、<https://github.com/pyiron/pympipool/pull/338>(issue comments API)。両方とも公開リポジトリ(visibility: public)。kaapi-backendはフッタに`It's free for OSS`の文言あり(観測日2025-12-11)、pympipoolはOSS向け謝辞はあるがプラン名の明記は無し(観測日2024-05-28)。 | C2 | 2026-08-15 | 確認済み |
| 6 | 指摘0件のレビューは実行はされており、レビュー本文が `**Actionable comments posted: 0**` から始まる(空振りではなく成功扱い) | <https://github.com/actualbudget/actual-server/pull/531>(pulls/reviews API)。公開リポジトリ(actualbudget/actual-server, visibility: public)。レビュー詳細に`Plan: Pro`と明記(公開リポジトリでも無料OSS枠ではなくProプランで運用されている実例)。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| 6 | `reviews.review_status` の既定値は `true` で、レビューがスキップされた場合などのステータスメッセージをwalkthroughサマリコメントに投稿する(falseにすると当メッセージ自体を無効化できる) | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 6 | `reviews.fail_commit_status` の既定値は `false` で、「レビューエラー時に外部向けレビューステータス表示を失敗扱いにするか」を制御する(既定ではエラーがcommit statusのfailureに伝播しない) | <https://docs.coderabbit.ai/reference/configuration> | A | 2026-08-15 | 確認済み |
| 6 | グロッサリで "Status Check" は「CI・テスト・CodeRabbitのようなコードレビューツールなど、自動化プロセスの結果を示すPR上の指標(pass/pending/fail)」と定義されている | <https://docs.coderabbit.ai/reference/glossary> | A | 2026-08-15 | 確認済み |
| 6 | 「成功」「指摘0件」「スキップ」「レート制限で未実行」「エラー」の5状態すべてを明確に区別できる単一の公式一覧・ステータス列挙は、`reference/glossary`・`reference/configuration` を確認した範囲では見当たらない(各状態の断片的な言及はあるが、網羅した状態表は無い) | 検索範囲: <https://docs.coderabbit.ai/reference/glossary>(全25用語の一覧)、<https://docs.coderabbit.ai/reference/configuration>(「Reviews」節)。検索語: ページ全体を通読し、状態を列挙した表・enumの有無を確認。`reference/glossary` は冒頭で「This glossary covers terms... referenced in the documentation」と明記しており、CodeRabbit全用語の網羅ではなく本文中に登場した用語の集合という**開いた情報源**であることを自ら宣言している → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 7 | 料金プランはFree・Open Source・Pro・Pro+・Enterpriseの5種類 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | レート制限は"rolling allowance"方式で、「一括リセットではなく、古いレビューがローリングウィンドウから外れるにつれて新たな利用枠が使えるようになる」 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | Freeプランのレート上限: PRレビュー 1件/時(要約のみ)、IDEレビュー 3件/時、CLIレビュー 3件/時、1レビューあたり150ファイル、chatは対象外 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | Open Sourceプランのレート上限: PRレビュー 1〜10件/時(リポジトリのスター数で変動)、IDEレビュー 1件/時、CLIレビュー 3件/時、1レビューあたり100〜300ファイル、chat 25件/時 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | Proプランのレート上限: PR/IDE/CLIレビューいずれも5件/時、1レビューあたり150ファイル、chat 50件/時 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | Pro+プランのレート上限: PR/IDE/CLIレビューいずれも10件/時、1レビューあたり300ファイル、chat 100件/時 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | Enterpriseプランのレート上限: PR/IDE/CLIレビューいずれも12件/時、1レビューあたり300ファイル、chat 100件/時 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | Fair Usage Policy(95パーセンタイル制御)はPro/Pro+プランに存在し、直近7日間のレビュー数が閾値を超えるほど1時間あたりの上限が段階的に絞られる(Proは60件/7日以上で1件/時まで低下、Pro+は90件/7日以上で1件/時まで低下) | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | 枠の共有範囲は「開発者(developer)identityごと・組織ごと」で、公式には「CodeRabbit enforces hourly rate limits for each developer per organization」と明記されている | <https://github.com/pyiron/pympipool/pull/338>(bot本文からの引用。原文は `docs.coderabbit.ai/faq` を参照するよう案内)。公開リポジトリ(pyiron/pympipool, visibility: public)。プラン名の明記は見当たらず、文脈不明。観測日2024-05-28。 | C2 | 2026-08-15 | 確認済み |
| 7 | 連携リポジトリ数(linked repositories)の上限はFree 0、Pro 1、Pro+ 10、Enterprise 20 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | MCPサーバー接続数の上限はPro 5、Pro+ 15、Enterprise 20 | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 7 | 上限超過時、usage-based add-onが無効なら「開発者にレビュー上限到達のメッセージが表示され、admin管理者がadd-onを有効化できる」旨が案内される | <https://docs.coderabbit.ai/management/usage-based-addon> | A | 2026-08-15 | 確認済み |
| 7 | usage-based add-onが有効な場合、上限超過後もレビューを継続し、超過分は従量課金される(開発者側は中断なし) | <https://docs.coderabbit.ai/management/usage-based-addon> | A | 2026-08-15 | 確認済み |
| 7 | usage-based add-onはPro・Pro+・Enterpriseで有効化可能。単価は「$1.00」クレジット=4ファイル分(1ファイルあたり$0.25) | <https://docs.coderabbit.ai/management/usage-based-addon> | A | 2026-08-15 | 確認済み |
| 7 | レート制限超過時、実際のPRコメントには「@ユーザー has exceeded the limit for the number of commits or files that can be reviewed per hour. Please wait **N minutes and M seconds** before requesting another review.」という具体的な残り時間が表示される | <https://github.com/tsparticles/utils/pull/71>(issue comments API)。公開リポジトリ(tsparticles/utils, visibility: public)。フッタに`It's free for OSS`の文言あり。観測日2025-08-31。 | C2 | 2026-08-15 | 確認済み |
| 8 | 14日間のProトライアルは別レート制限プロファイル(PR/IDE/CLIレビュー3件/時、chat 50件/時)を使う | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| 8 | Custom checksは「inlineコメントの投稿はできず、結果はサマリ表にのみ表示される」という制約が明記されている | <https://docs.coderabbit.ai/pr-reviews/custom-checks> | A | 2026-08-15 | 確認済み |
| 8 | AST-grepベースのpath instructionsは「学習コストがあり、YAML設定に慣れたユーザー向け」と明記され、chatでは使えないという制約がある | <https://docs.coderabbit.ai/configuration/ast-grep-instructions> | A | 2026-08-15 | 確認済み |
| 8 | Security Agentは独立したアドオンであり、「CodeRabbitのPro・Pro+・Enterpriseプランには含まれない("is not part of...")」と明記されている | <https://docs.coderabbit.ai/security-agent> | A | 2026-08-15 | 確認済み |
| 8 | 自己ホスティング(self-hosted)はEnterpriseかつ500シート以上の顧客限定と明記されている | <https://docs.coderabbit.ai/self-hosted/overview> | A | 2026-08-15 | 確認済み |
| 8 | FAQページを確認したが、フォークPRでの挙動・force-push後の再レビュー挙動・誤検知率(false positive rate)についての言及は見当たらなかった | 検索範囲: <https://docs.coderabbit.ai/faq>(全質問見出し。「How accurate is CodeRabbit?」「Usage Limits」等を含む全カテゴリ)。検索語: "fork" "force-push" "force push" "false positive"。いずれも0件。ページ冒頭は「Answers to **common** CodeRabbit questions」であり、網羅的なFAQではなく「よくある質問」の抜粋であることを自ら明示し、完全な索引としては`https://docs.coderabbit.ai/llms.txt`を案内している(開いた情報源) → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 8 | 「100%の精度は保証されない("100% accuracy isn't guaranteed due to AI's evolving nature")」とFAQで一般論として述べられているのみで、定量的な誤検知率の開示は無い | <https://docs.coderabbit.ai/faq> | A | 2026-08-15 | 確認済み |
| 9 | パスフィルタで除外されたファイルはCodeRabbit自身のレビュー面(walkthrough・Change Stack)には現れないが、「GitHubはPRの完全なファイル一覧にそれらのファイルを表示し続けることができる("GitHub can still show those files in the pull request's full file list.")」と公式ページに明記されている | <https://docs.coderabbit.ai/configuration/path-instructions>("Configure path filters"節のInfoボックス) | A | 2026-08-15 | 確認済み |
| 9 | CodeRabbitはロックファイル・バイナリ・生成コード・メディア資産などを既定で無視するデフォルトの除外パターンを持つ | <https://docs.coderabbit.ai/configuration/path-instructions> | A | 2026-08-15 | 確認済み |
| 9 | キャッシュ(リポジトリの準備済みコピー+依存関係)は最大7日で自動的に期限切れになる | <https://docs.coderabbit.ai/reference/caching> | A | 2026-08-15 | 確認済み |
| 9 | `disable_cache` を有効にした場合、レビュー詳細欄に "Cache: Disabled due to Reviews > Disable Cache setting." と表示される | <https://docs.coderabbit.ai/reference/caching> | A | 2026-08-15 | 確認済み |
| 9 | Metrics Data API(`GET /v1/metrics/reviews`)のOpenAPIスキーマ記述には、各タイムスタンプフィールドの意味が個別に明記されている: `created_at`="When the PR was created"、`ready_for_review_at`="When the PR became ready for review. Matches created_at if the PR was never a draft, and may be null for older records where this timestamp was not collected."、`first_human_review_at`="When the first human review was submitted"、`last_commit_at`="When the last non-merge, non-rebased commit was pushed"、`merged_at`="When the PR was merged" | <https://docs.coderabbit.ai/api-reference/metrics-data-api>(OpenAPIスキーマコンポーネントの各フィールド説明) | A | 2026-08-15 | 確認済み |
| 9 | Metrics Data APIは `limit`(既定1000)と `cursor` によるページネーションをサポートし、レスポンス最大サイズは16MBという制約がある | <https://docs.coderabbit.ai/api-reference/metrics-data-api> | A | 2026-08-15 | 確認済み |
| 9 | 指摘0件のレビューでもレビューオブジェクト自体は作成される(実例: `state: COMMENTED` で本文が `**Actionable comments posted: 0**`)。つまり「オブジェクトが作られない」パターンは指摘0件では発生しない | <https://github.com/actualbudget/actual-server/pull/531>(pulls/reviews API)。公開リポジトリ(actualbudget/actual-server, visibility: public)。レビュー詳細に`Plan: Pro`と明記。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| 9 | walkthroughコメント本文にはウォークスルー本体とは別に `<!-- This is an auto-generated comment: raw summary by coderabbit.ai -->` で囲われた「ファイル単位のAI生成差分サマリ」がHTMLコメントとして埋め込まれており、通常の表示(レンダリング後のMarkdown)では見えない | <https://github.com/FalkorDB/node-falkordb/pull/1>(issue comments API)。公開リポジトリ(FalkorDB/node-falkordb, visibility: public)。プラン名・OSS文言の記載は本コメントには見当たらず、文脈不明。観測日2023-12-12(2023年時点の古い実例であり、現行仕様と異なる可能性がある)。 | C2 | 2026-08-15 | 確認済み |
| 9 | PRの本文(description)が編集されて `@coderabbitai summary` プレースホルダが除去/変更された場合に何が起きるかについて、`pr-reviews/summaries` ページに明記が見当たらない | 検索範囲: <https://docs.coderabbit.ai/pr-reviews/summaries>(「Controlling placement」節・「Disabling the summary」節を含む全体)。検索語: "edited" "removed" "placeholder" "manually"。プレースホルダを**追加**したときの挙動(`high_level_summary`無効時でもプレースホルダがあれば挿入される)は書かれているが、**除去/改変**したときの逆方向の挙動は書かれていない。このページはconcept説明+設定例が中心のnarrative feature pageであり、エッジケースを網羅する仕様書ではない(開いた情報源) → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 10 | ダッシュボードのメトリクスは「マージ済みPR上で投稿されたCodeRabbitレビューコメント数」「PRあたりの平均レビューイテレーション数(Avg Review Iterations per PR = review eventsの平均)」「重篤度・カテゴリ別の受理率」「マージまでの時間」を中心とし、実行回数の成功/スキップ/エラー別カウントは提供されない | <https://docs.coderabbit.ai/guides/dashboard-metrics> | A | 2026-08-15 | 確認済み |
| 10 | 「1回のレビューが走った」をどの痕跡(pulls/reviews・issues/comments・commit status)から1回と数えるか、複数の面に痕跡が残った場合にどれを正とするかについて、公式ドキュメントに明記が見当たらない | 検索範囲: <https://docs.coderabbit.ai/guides/dashboard-metrics>(「Quality Metrics」「Time Metrics」節を含む全10節)、<https://docs.coderabbit.ai/reference/glossary>(「Incremental Review」定義を含む全25用語)。検索語: ページ全体を通読し「1回のレビュー」の計数根拠を示す記述の有無を確認。`dashboard-metrics`ページは「Detailed definitions and calculations for all CodeRabbit Git platform review dashboard metrics」という前置きで、指標の**定義**は網羅的に見えるが、「複数の面の痕跡のどれを正とするか」という実装上の集計根拠までは踏み込んでおらず、この一次情報自体が持たない情報であるため開いた情報源として扱う → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 10 | Metrics Data APIのレスポンスにはレビュー1件あたりのコスト・所要時間・エラー/権限拒否といった実行メタデータのフィールドは含まれていない(複雑度スコアと予想レビュー分数のみ) | <https://docs.coderabbit.ai/api-reference/metrics-data-api> | A | 2026-08-15 | 確認済み |
| 10 | レビュー詳細コメント本文(`<details><summary>📜 Review details</summary>`)には `Configuration used`・`Review profile`、実例によっては `Plan`(例: "Plan: Pro")といった実行時メタデータが人間可読テキストとして埋め込まれる(構造化フィールドではない) | <https://github.com/actualbudget/actual-server/pull/531>(pulls/reviews APIのbody)。公開リポジトリ(actualbudget/actual-server, visibility: public)。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| 10 | 監査ログAPIは「誰が・何を・いつ変更したか」を記録するが、これは設定変更などの管理操作向けであり、個々のレビュー実行(1回のレビュー実行イベント)自体を記録する用途ではない | <https://docs.coderabbit.ai/management/audit-logs> | A | 2026-08-15 | 確認済み |
| 11 | `.coderabbit.yaml` の妥当性は `https://yaml-editor-ochre.vercel.app/embed` に埋め込まれたWebベースのインタラクティブエディタで検証でき、CLIコマンドや専用APIは提供されていない | <https://docs.coderabbit.ai/configuration/yaml-validator> | A | 2026-08-15 | 確認済み |
| 11 | `@coderabbitai configuration` コメントコマンドで、そのリポジトリに現在適用されている設定を出典(どの階層由来か)付きでPR上に表示できる | <https://docs.coderabbit.ai/reference/review-commands> | A | 2026-08-15 | 確認済み |
| 11 | 公開APIのベースURLは `https://api.coderabbit.ai`、認証は全リクエストで `x-coderabbitai-api-key` ヘッダを使う | <https://docs.coderabbit.ai/api> | A | 2026-08-15 | 確認済み |
| 11 | APIキーには組織スコープ・Enterprise SSO向けworkspace API token・self-hosted用の3種類がある | <https://docs.coderabbit.ai/api> | A | 2026-08-15 | 確認済み |
| 11 | `GET /v1/organizations` は組織の `id`・`name`・`provider`・`provider_organization_id` を返すのみで、契約プラン(plan/tier)・シート数・組織設定の現在値は含まれない | <https://docs.coderabbit.ai/api-reference/organizations-list> | A | 2026-08-15 | 確認済み |
| 11 | `GET /v1/organizations` エンドポイントはEnterpriseプラン限定である | <https://docs.coderabbit.ai/api-reference/organizations-list> | A | 2026-08-15 | 確認済み |
| 11 | 契約プラン・残枠・レート上限の"現在値"をAPI経由で機械的に取得する手段(専用のusage/quotaエンドポイント)は、`api`・`api-reference/*` の一覧を確認した範囲では見当たらない | 検索範囲: <https://docs.coderabbit.ai/api>(「Explore the API」節)、<https://docs.coderabbit.ai/api-reference/organizations-list>(エンドポイント仕様全体)。検索語: "usage" "quota" "remaining"、いずれも0件。`api`インデックスページの「Explore the API」節は「Use it to discover organizations and repositories, retrieve metrics and learnings, manage users and roles, or export audit logs.」という**例示的な言い回し("Use it to...")**であり、「これが全カテゴリである」という完全性の宣言はしていない(開いた情報源) → 「文書化されていない」。ただし列挙されている6カテゴリ(Organizations & Repositories / Metrics & Learnings / Users & Seats / Roles / Audit Logs / Workspace API Tokens)自体は具体的で、usage/quota系エンドポイントが存在するなら通常はこの並びに現れるはずという点で、示唆はやや強い | A | 2026-08-15 | 公式に未文書化 |
| 11 | 監査ログはUI(Settings → Audit Logs、User/Action/Resource Summary/timestampの列)と同一データを返すAPIの両方から取得でき、APIはSIEM連携等のエクスポート用途を想定している | <https://docs.coderabbit.ai/management/audit-logs> | A | 2026-08-15 | 確認済み |
| 11 | 監査ログの保持期間(retention)については `management/audit-logs` ページに明記が見当たらない | 検索範囲: <https://docs.coderabbit.ai/management/audit-logs>(「What is logged」節の2つの表(ログ列一覧・リソース種別/イベント一覧)を含む全体)。検索語: "retention" "days" "how long" "expire"、いずれも0件。「What is logged」節の表はログの**列**とリソース種別/イベントの**種類**を網羅的に列挙しているが、保持**期間**はそもそもその表の対象項目に含まれておらず、記載が無い理由が「表から漏れた」のか「そもそも扱う話題ではない」のか切り分けられない(開いた情報源としての不在) → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| 11 | レート制限超過時、実際のPRコメント本文には「CodeRabbit enforces hourly rate limits for each developer per organization. Our paid plans have higher rate limits than the trial, open-source and free plans.」という一般論の説明のみが埋め込まれ、呼び出し元が自分の残枠の現在値を数値として読める形では提供されない(具体的な待ち秒数のみ埋め込まれる) | <https://github.com/nanotaboada/Dotnet.Samples.AspNetCore.WebApi/pull/277>(issue comments API)。公開リポジトリ(nanotaboada/Dotnet.Samples.AspNetCore.WebApi, visibility: public)。フッタに`It's free for OSS`の文言あり。観測日2025-08-25。 | C2 | 2026-08-15 | 確認済み |
| その他 | Slop Detectionは「公開GitHubリポジトリ上で低品質・AI生成的なPRを自動検出する」機能で、対象プランの明記は見当たらない | <https://docs.coderabbit.ai/pr-reviews/slop-detection> | A | 2026-08-15 | 確認済み |
| その他 | Security Agentは通常のPRレビューとは別建てのスタンドアロン・アドオンで、継続的なセキュリティ姿勢管理・Dependency/SBOM/Secretsスキャン・AI Deep Scan(現在のPR diffを超えた既存コード全体の脆弱性解析)を提供し、所見は別のセキュリティダッシュボードに出る | <https://docs.coderabbit.ai/security-agent> | A | 2026-08-15 | 確認済み |
| その他 | 自己ホスティングはコンテナイメージとして配布され、GitHub Enterprise Server・GitLab self-managed・Azure DevOps・Bitbucket Data Centerに対応し、閉域網向けにアウトバウンドのみで動く「Reverse Tunnel」機能がある | <https://docs.coderabbit.ai/self-hosted/overview> | A | 2026-08-15 | 確認済み |
| その他 | GitHub以外にGitLab.com/self-managed、Azure DevOps、Bitbucket Cloud/Data Centerに対応するが、確認した範囲ではプラットフォーム間でのレビュー出力方式(commit status vs check run)の違いについての明記が見当たらない | 検索範囲: <https://docs.coderabbit.ai/platforms/overview>(「Integration process」節・「Supported Git platforms」節。プラットフォーム横断の比較表は無く、各プラットフォームへのリンクカードのみ)、<https://docs.coderabbit.ai/platforms/github-com>(「Prerequisites」「Troubleshooting」節を含む全体)。検索語: "commit status" "check run" "required status check" "status check"、いずれのページも0件。`platforms/overview`は「Connect CodeRabbit with your preferred Git platform...」という案内ページで、比較マトリクスを持たず各プラットフォーム個別ページへ誘導する構造(開いた情報源)。他のGitLab/Azure DevOps/Bitbucket個別ページは今回未確認であり、検索範囲はGitHub関連2ページに限られる → 「文書化されていない」 | A | 2026-08-15 | 公式に未文書化 |
| その他 | Slack・Discord向けに、PRレビューとは別建ての対話エージェント("CodeRabbit Agent for Slack" / "for Discord")が提供されている(独自のプラン・利用枠を持つ) | <https://docs.coderabbit.ai/overview/slack-agent>、<https://docs.coderabbit.ai/discord-agent> | A | 2026-08-15 | 確認済み |
| その他 | IDE(VS Code拡張)・CLIによるローカルレビューはPRレビューとは別イベント系統で、`management/plans` のレート表では「IDEレビュー」「CLIレビュー」として別枠でカウントされる | <https://docs.coderabbit.ai/management/plans> | A | 2026-08-15 | 確認済み |
| その他 | Issue Planner(`plan/*`)は、issue・PRD・設計書・自由記述の説明からコードベース解析に基づく実装計画(「汎用的な概要ではなくagent-ready prompt」)を生成する別機能で、Webアプリ・issueへの`@coderabbitai plan`コメント・VS Code拡張のいずれからも呼び出せる | <https://docs.coderabbit.ai/plan/index> | A | 2026-08-15 | 確認済み |
| その他 | Issue Enrichment機能は、issueの作成・更新時に自動でコメントを投稿し、重複issueの特定・関連issue/PRの表示・担当者の提案・スマートラベル付与を行う | <https://docs.coderabbit.ai/issues/enrichment> | A | 2026-08-15 | 確認済み |
| その他 | スキーマのルートに `issue_enrichment` キーが存在する | <https://coderabbit.ai/integrations/schema.v2.json> | B | 2026-08-15 | 確認済み |
| その他 | Issues機能の「Create issues」は、レビュー中のチャットで`@coderabbitai`にメンションすることでコード議論をGitHub/GitLab/Jira/Linearのいずれかのissueとして起票できる("Turn code discussions into tracked issues across GitHub, GitLab, Jira, and Linear directly from CodeRabbit's chat interface") | <https://docs.coderabbit.ai/issues/creation> | A | 2026-08-15 | 確認済み |
| その他 | Jira連携は「CodeRabbit Pro plan」以上が必要で、issueコンテキストの取り込み・受け入れ基準との突合・issueからのコーディング計画生成・レビューコメントからの新規issue作成の4機能を提供する | <https://docs.coderabbit.ai/integrations/jira> | A | 2026-08-15 | 確認済み |
| その他 | Linear連携はissueコンテキストの取り込み・受け入れ基準との突合・Linear issueからのCoding Plan生成・レビューコメントからの新規Linear issue作成を提供する | <https://docs.coderabbit.ai/integrations/linear> | A | 2026-08-15 | 確認済み |

`その他` に該当する仕様は、上表(台帳本体)の「その他」区分の行として計12件収録した。0件ではない。

## 出力パターン

「出典」列のC2行には、観測元URLに加えてその環境について観測できた文脈(フッタのプラン/OSS表記、
リポジトリの可視性、観測日)を記載する。文脈が確認できなかった場合は「文脈不明」と明記する。

| 面 | フィールド | 逐語文字列 | 意味する状態 | 出典(URL・観測環境の文脈) | 等級 | 確認日 | 状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR issue comment(walkthrough / スキップ通知の両方) | body冒頭のHTMLマーカー | `<!-- This is an auto-generated comment: summarize by coderabbit.ai -->` | CodeRabbitの自動生成コメントであることの識別マーカー。**walkthroughに固有ではない** —— レビューがスキップされたコメントでも本文冒頭に同じマーカーが現れ、その直後に `<!-- This is an auto-generated comment: skip review by coderabbit.ai -->` が続く。したがってこのマーカーの存在だけでは「レビューが実行された」と判定できない | <https://github.com/FalkorDB/node-falkordb/pull/1>(walkthroughでの出現)、<https://github.com/ably/docs/pull/2867> および <https://github.com/Logging-Studio/RetroUI/pull/52>(スキップ通知での出現)。いずれも公開リポジトリ、後2者はフッタに`It's free for OSS`の文言あり・前者は文脈不明。観測日2023-12-12 / 2025-10-03 / 2025-04-11 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(walkthrough) | body内のセクション境界マーカー | `<!-- walkthrough_start -->` / `<!-- walkthrough_end -->` | walkthrough本体セクションの開始・終了 | <https://github.com/FalkorDB/node-falkordb/pull/1>。公開リポジトリ、文脈不明。観測日2023-12-12(古い実例)。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(walkthrough) | body内の見出し | `## Walkthrough` | ウォークスルー本文の見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、プラン表記なし・文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(walkthrough) | body内の見出し | `## Changes` | 変更点のファイル別サマリ表の見出し | <https://github.com/FalkorDB/node-falkordb/pull/1>。公開リポジトリ、文脈不明。観測日2023-12-12(古い実例)。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(walkthrough) | body内の見出し | `## Possibly related PRs` | 関連しそうな過去PRの一覧見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(walkthrough) | body内の見出し | `## Suggested labels` | 提案ラベルの見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(walkthrough) | body内の見出し | `## Suggested reviewers` | 提案レビュアーの見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(raw summary) | body内のHTMLマーカー | `<!-- This is an auto-generated comment: raw summary by coderabbit.ai -->` / `<!-- end of auto-generated comment: raw summary by coderabbit.ai -->` | ファイル単位のAI生成差分サマリ(通常レンダリングでは非表示)の開始・終了 | <https://github.com/FalkorDB/node-falkordb/pull/1>。公開リポジトリ、文脈不明。観測日2023-12-12(古い実例)。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(短縮サマリ) | body内のHTMLマーカー | `<!-- This is an auto-generated comment: short summary by coderabbit.ai -->` | PR説明欄埋め込み用の短縮サマリの開始マーカー | <https://github.com/FalkorDB/node-falkordb/pull/1>。公開リポジトリ、文脈不明。観測日2023-12-12(古い実例)。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知) | body内のHTMLマーカー | `<!-- This is an auto-generated comment: skip review by coderabbit.ai -->` / `<!-- end of auto-generated comment: skip review by coderabbit.ai -->` | レビューがスキップされたことの開始・終了マーカー | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・共通の見出し) | 見出し行 | `## Review skipped` | 「レビューが実行されなかった」ことの**汎用**見出し。**スキップの理由はこの文字列からは分からない** —— 少なくともパスフィルタによる全ファイル除外、リポジトリでの自動レビュー無効、ファイル数上限超過の3つの異なる理由で同一の見出しが観測されている。理由は直後の本文行(下記の各行)にのみ現れる | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>(パスフィルタ)、<https://github.com/ably/docs/pull/2867>(自動レビュー無効)、<https://github.com/Logging-Studio/RetroUI/pull/52>(ファイル数上限超過)。いずれも公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-12-11 / 2025-10-03 / 2025-04-11 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(パスフィルタによる一部ファイル除外の通知、2023年12月時点) | 見出し行 | `## Auto Review Skipped` | 一部ファイルがパスフィルタで除外されたことの通知の見出し。当該実例では、この直後に除外されなかった残りファイルの通常walkthroughが同一コメント内で続いており、PR全体のレビューは止まっていなかった(2025年の実例とは意味する状態が異なる可能性がある。時期による文言変更か、シナリオ差かは切り分けられていない) | <https://github.com/FalkorDB/node-falkordb/pull/1>。公開リポジトリ、文脈不明。観測日2023-12-12(古い実例)。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・pathフィルタ全除外) | 本文 | `Review was skipped due to path filters` | パスフィルタによる全ファイル除外でのスキップ理由 | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・自動レビュー無効) | 本文 | `Auto reviews are disabled on this repository.` | リポジトリで自動レビューが無効化されているためのスキップ理由 | <https://github.com/ably/docs/pull/2867>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-10-03。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・ファイル数上限超過) | 本文 | `More than 25% of the files skipped due to max files limit. The review is being skipped to prevent a low-quality review.` | 変更ファイルの25%超がプランのファイル数上限を超えたためのスキップ理由 | <https://github.com/Logging-Studio/RetroUI/pull/52>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-04-11。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・ファイル数上限超過) | 本文 | `44 files out of 159 files are above the max files limit of 100. Please upgrade to Pro plan to get higher limits.` | 具体的な超過ファイル数・上限値・プラン名を含む案内(実例値。プラン名は文中に含まれるが、これはCodeRabbitが自動生成した案内文であり実際の契約プラン名の開示APIとは別) | <https://github.com/Logging-Studio/RetroUI/pull/52>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-04-11。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・pathフィルタ、除外ファイル一覧) | details summary | `Files ignored due to path filters (N)`(絵文字接頭辞なし) | 除外されたファイル数の折りたたみ見出し(2023年時点の実例では絵文字接頭辞が無い) | <https://github.com/FalkorDB/node-falkordb/pull/1>。公開リポジトリ、文脈不明。観測日2023-12-12(古い実例)。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・pathフィルタ、除外ファイル一覧) | details summary | `` `:no_entry: Files ignored due to path filters (N)` ``(絵文字ショートコード接頭辞) | 除外されたファイル数の折りたたみ見出し(2025年時点の実例ではショートコード接頭辞が付く) | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・Bot検出) | 本文 | `Bot user detected.` | PR作成者がBotと判定されたためのスキップ理由 | <https://github.com/zenstackhq/zenstack-v3/pull/148>。公開リポジトリ、文脈不明。観測日2025-08-06。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(スキップ通知・Bot検出) | 本文 | `` To trigger a single review, invoke the `@coderabbitai review` command. `` | 手動でレビューを起動する手順の案内 | <https://github.com/zenstackhq/zenstack-v3/pull/148>。公開リポジトリ、文脈不明。観測日2025-08-06。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(レート制限通知) | body内のHTMLマーカー | `<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->` / `<!-- end of auto-generated comment: rate limited by coderabbit.ai -->` | レート制限超過による未実行の開始・終了マーカー | <https://github.com/pyiron/pympipool/pull/338>。公開リポジトリ、プラン表記なし・文脈不明。観測日2024-05-28。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(レート制限通知、2025年8月時点) | 見出し行 | `## Rate limit exceeded`(文頭のみ大文字) | レート制限超過の見出し(2025年8月時点の複数実例で確認) | <https://github.com/nanotaboada/Dotnet.Samples.AspNetCore.WebApi/pull/277>、<https://github.com/tsparticles/utils/pull/71>。いずれも公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-08-25・2025-08-31。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(レート制限通知、2024年5月時点) | 見出し行 | `## Rate Limit Exceeded`(各単語の頭文字が大文字) | レート制限超過の見出し(2024年5月時点の実例。2025年の実例と大文字小文字の表記が異なり、時期による文言変更の可能性がある) | <https://github.com/pyiron/pympipool/pull/338>。公開リポジトリ、プラン表記なし・文脈不明。観測日2024-05-28。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(レート制限通知) | 本文 | `` @{username} has exceeded the limit for the number of commits or files that can be reviewed per hour. Please wait **{N} minutes and {M} seconds** before requesting another review. `` | 具体的な再試行可能時刻の案内 | <https://github.com/tsparticles/utils/pull/71>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-08-31。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(レート制限通知) | details summary | `⌛ How to resolve this issue?` | 対処法セクションの見出し | <https://github.com/nanotaboada/Dotnet.Samples.AspNetCore.WebApi/pull/277>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-08-25。 | C2 | 2026-08-15 | 確認済み |
| PR issue comment(レート制限通知) | details summary | `🚦 How do rate limits work?` | レート制限の仕組み説明セクションの見出し | <https://github.com/nanotaboada/Dotnet.Samples.AspNetCore.WebApi/pull/277>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-08-25。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body冒頭 | `**Actionable comments posted: {N}**`(Nが0の場合を含む) | そのレビューで投稿された「対応が必要な指摘」の件数(0でもレビュー自体は実行・投稿されている) | <https://github.com/actualbudget/actual-server/pull/531>。公開リポジトリ、レビュー詳細に`Plan: Pro`と明記。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `📜 Review details` | 使用設定・レビュープロファイルなどのメタデータの折りたたみ見出し | <https://github.com/actualbudget/actual-server/pull/531>。公開リポジトリ、`Plan: Pro`と明記。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary本文 | `**Configuration used: CodeRabbit UI**` | 適用設定の出所(UI経由か`.coderabbit.yaml`かなど)を示す行 | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary本文 | `**Review profile: CHILL**` | 使用されたレビュープロファイル名 | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary本文 | `**Plan: Pro**`(観測できたのは一部実例のみ) | 実行時点の契約プラン名を示す行(全実例で出現するかは未確認) | <https://github.com/actualbudget/actual-server/pull/531>。公開リポジトリ、プランは逐語文字列列のとおり`Plan: Pro`。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `📥 Commits` | レビュー対象となったコミット範囲の折りたたみ見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `📒 Files selected for processing (N)` | レビュー対象として選定されたファイル数・一覧 | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `⛔ Files ignored due to path filters (N)`(Unicode絵文字接頭辞) | パスフィルタで除外されたファイル数・一覧(レビュー自体はスキップされず一部ファイルのみ除外) | <https://github.com/actualbudget/actual-server/pull/531>。公開リポジトリ、`Plan: Pro`と明記。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `🧹 Outside diff range and nitpick comments (N)` | 軽微な指摘(actionable扱いではない)のうち、差分範囲外の指摘も含む折りたたみ見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `🧹 Nitpick comments (N)` | 軽微な指摘(actionable扱いではない)の折りたたみ見出し(差分範囲外という限定が付かない別表記) | <https://github.com/actualbudget/actual-server/pull/531>。公開リポジトリ、`Plan: Pro`と明記。観測日2025-01-01。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `🔇 Additional comments (N)` | 参考情報としての追加コメントの折りたたみ見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | details summary | `🧰 Additional context used` | 参照した追加コンテキストの折りたたみ見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| review comment(pulls/comments) | body末尾 | `<!-- This is an auto-generated comment by CodeRabbit -->` | 個々のインライン指摘コメントであることの識別マーカー | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| review comment(pulls/comments) | 冒頭の重篤度ラベル | `` _:warning: Potential issue_ `` | 「潜在的な問題」区分の指摘であることを示す接頭辞 | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| review comment(pulls/comments) | 冒頭の重篤度ラベル | `` _:hammer_and_wrench: Refactor suggestion_ `` | 「リファクタ提案」区分の指摘であることを示す接頭辞 | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| review comment(pulls/comments) | 提案ブロックのマーカー | `<!-- suggestion_start -->` / `<!-- suggestion_end -->` | committable suggestion(適用可能な差分提案)ブロックの開始・終了 | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| review comment(pulls/comments) | details summary | `📝 Committable suggestion` | 適用可能な差分提案の折りたたみ見出し | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| review comment(pulls/comments) | 警告文 | `` > ‼️ **IMPORTANT** `` に続く "Carefully review the code before committing..." | 提案を無検証で適用しないよう促す定型の警告文 | <https://github.com/actualbudget/actual/pull/3584>。公開リポジトリ、文脈不明。観測日2024-10-06。 | C2 | 2026-08-15 | 確認済み |
| commit status | `context` | `CodeRabbit` | commit statusの発行元識別名(GitHub Commit Status API上のcontext値) | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| commit status | `description`(成功時) | `Review completed` | レビュー完了(成功)を示す説明文 | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| commit status | `state`(成功時) | `success` | GitHub Commit Status APIの標準state値としての成功 | <https://github.com/ProjectTech4DevAI/kaapi-backend/pull/487>。公開リポジトリ、フッタに`It's free for OSS`の文言あり。観測日2025-12-11。 | C2 | 2026-08-15 | 確認済み |
| 全般 | Pre-merge checksの状態記号 | `❌`(Error)/`⚠️`(Warning)/`✅`(Passed)/`❓`(Inconclusive) | Pre-merge checksの4状態を示す絵文字(Errorはrequest changes workflow有効時にマージをブロック、Warningは非ブロッキング) | <https://docs.coderabbit.ai/pr-reviews/pre-merge-checks> | A | 2026-08-15 | 確認済み |
| walkthrough | body末尾に生成される一節 | 例: `"In the code burrow, deep and wide, / Errors dance, but can't hide. / ..."`(`reviews.poem` 設定に対応する詩的な一節。文面はレビュー内容に応じて毎回変わる) | `reviews.poem` が有効な場合に付与される装飾的な出力(定型文言ではなく都度生成) | <https://github.com/FalkorDB/node-falkordb/pull/1>。公開リポジトリ、文脈不明。観測日2023-12-12(古い実例)。 | C2 | 2026-08-15 | 確認済み |
| Pre-merge checks の一般的な状態文言(pass/fail/skip時の逐語) | walkthrough内のPre-merge checksセクション本文 | 未確認 | 具体的な逐語(例えば各チェック名ごとのpass/fail本文の完全な文字列)は実例取得に至らず | 未取得(公開ドキュメント・公開実例のいずれも当該逐語には到達できていない) | D | 2026-08-15 | 未調査 |

`その他` に該当する仕様は、上表(台帳本体)の「その他」区分の行として計12件収録した(前段参照)。

## 出力の構造

- 固定のHTMLコメントマーカー(役割ごとに異なる接頭辞を持つ):
  - `<!-- This is an auto-generated comment: summarize by coderabbit.ai -->`(walkthrough)
  - `<!-- This is an auto-generated comment: skip review by coderabbit.ai -->` / `<!-- end of auto-generated comment: skip review by coderabbit.ai -->`(スキップ)
  - `<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->` / `<!-- end of auto-generated comment: rate limited by coderabbit.ai -->`(レート制限)
  - `<!-- This is an auto-generated comment: raw summary by coderabbit.ai -->` / `<!-- end of auto-generated comment: raw summary by coderabbit.ai -->`(ファイル単位AI生成サマリ、非表示)
  - `<!-- This is an auto-generated comment: short summary by coderabbit.ai -->`(短縮サマリ)
  - `<!-- This is an auto-generated comment by CodeRabbit -->`(個々のインライン指摘コメント)
  - `<!-- walkthrough_start -->` / `<!-- walkthrough_end -->`(walkthrough本体の範囲)
  - `<!-- suggestion_start -->` / `<!-- suggestion_end -->`(committable suggestionブロックの範囲)
  - `<!-- finishing_touch_checkbox_start -->` / `<!-- finishing_touch_checkbox_end -->`(Finishing Touchesのチェックボックス群の範囲)
  - `<!-- tips_start -->`(利用ヒント・共有導線セクションの開始)
  - チェックボックス内に埋め込まれるJSON片 `<!-- {"checkboxId": "...", "radioGroupId": "..."} -->`(Finishing Touchesのアクション識別用)
- walkthroughコメント内の固定セクション見出し(observed): `## Walkthrough` / `## Changes` / `## Possibly related PRs` / `## Suggested labels` / `## Suggested reviewers`
- レビュー本体(pulls/reviews)内の固定details見出し(observed): `📜 Review details` / `📥 Commits` / `📒 Files selected for processing` / `⛔ Files ignored due to path filters` / `🧰 Additional context used` / `🔇 Additional comments` / `🧹 Nitpick comments` (または `🧹 Outside diff range and nitpick comments`)
- 出典: 上記いずれも `docs.coderabbit.ai` の公式ページには構造の一覧としてのまとまった記載は見当たらず、本節の記述は公開GitHubリポジトリ上の実例(pulls/reviews・issues/comments API)からの逐語採取(等級C2)である。
