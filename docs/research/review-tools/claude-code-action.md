# claude-code-action 仕様台帳

調査対象は `anthropics/claude-code-action`(GitHub Action)の公開仕様のみ。一次情報は同リポジトリの
`action.yml`・README・`docs/*.md`・公開ソース(TypeScript)、および第三者の公開リポジトリでの実行結果。
**Claude Code 一般の挙動についての知識は根拠にしない。**このActionの公開設定(inputs/outputs/ドキュメント/
公開ソース)から到達・区別できない項目は「公式に未文書化」として明示する。

## 等級の凡例

| 等級 | 定義 |
| --- | --- |
| A | 公式ドキュメントを一次情報として確認した(記載の有無は状態列が示す) |
| B | API仕様・設定スキーマ・公開ソースの定義を一次情報として確認した(観測はここに含めない) |
| C1 | 我々の環境での実測(本調査では対象外。空) |
| C2 | 第三者の公開リポジトリでの実測 |
| D | 推測・未確認 |

## 出典欄の略記

- 参照ref: コミットSHA `b49813d0e7f26cce63155bbb0695d44320998e50`(`gh api repos/anthropics/claude-code-action/commits/main --jq .sha` で2026-08-15に取得)
- ベースURL: `https://github.com/anthropics/claude-code-action/blob/b49813d0e7f26cce63155bbb0695d44320998e50/`
- 生ファイル取得コマンド: `gh api repos/anthropics/claude-code-action/contents/<path>?ref=b49813d0e7f26cce63155bbb0695d44320998e50`
- 取得日: 2026-08-15(特記なき限り本文中の全確認日はこの日付)
- 略記 `action.yml` = 上記ベースURL + `action.yml`(**`anthropics/claude-code-action` リポジトリ内のパス。このリポジトリ`stage-tracker`のものではない**)
- 略記 `README` = 上記ベースURL + `README.md`
- 以下で単独ファイル名として書く `docs/xxx.md`・`src/...`・`base-action/src/...` は、すべて `anthropics/claude-code-action` リポジトリ内のパス(このリポジトリのものではない)
- 略記 `例1` = 第三者公開リポジトリ `xability/maidr` の Pull Request #887(`https://github.com/xability/maidr/pull/887`)に投稿された `claude[bot]`(user_id `209825114`)のコメント。`gh api repos/xability/maidr/issues/887/comments` で2026-08-15に取得。観測環境の文脈: 公開リポジトリ、ワークフロー内で `anthropics/claude-code-action@v1`(タグ参照。コミットSHA未固定)を参照、コメント投稿日時は2026-08-14
- 略記 `例2` = 第三者公開リポジトリ `laurimoyle/lusory` の Issue #3(`https://github.com/laurimoyle/lusory/issues/3`)に投稿された `claude[bot]`(user_id `209825114`)のコメント。`gh api repos/laurimoyle/lusory/issues/3/comments` で2026-08-15に取得。観測環境の文脈: 公開リポジトリ、ワークフロー内で `anthropics/claude-code-action@v1`(タグ参照。コミットSHA未固定)を参照、コメント投稿日時は2026-08-13

## 本体

| 軸 | 主張 | 出典(URL・参照先) | 等級 | 確認日 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 1 | READMEは「@claudeメンション、issue割り当て、明示プロンプトによる自動化タスク」のいずれかに基づき自動的に起動すると説明している | README 5行目 | A | 2026-08-15 | 確認済み |
| 1 | `docs/experimental.md`は自動モード判定ロジックを「(1) promptが与えられれば常にagentモード (2) promptが無く@claudeが検出されればtagモード (3) どちらも無ければ何もしない」と説明する。この節は同ファイル冒頭で「実験的機能であり本番利用は非対応、いつでも変更・削除されうる」と明記されている | docs/experimental.md 1-49行目 | A | 2026-08-15 | 確認済み |
| 1 | 公開ソース `src/modes/detector.ts` の `detectMode()` は、`track_progress`指定時はPR/issue系イベントで強制的にtagモード、コメント/レビュー系イベントでは`prompt`があればagent、なければ`checkContainsTrigger()`結果でtag判定、PRイベント(opened/synchronize/ready_for_review/reopened)では`prompt`があればagent、それ以外は既定でagentモード(promptが無ければ発火しない)、という分岐を実装している | src/modes/detector.ts 14-81行目 | B | 2026-08-15 | 確認済み |
| 1 | `docs/custom-automations.md`は対応するGitHubイベントとして `pull_request`/`pull_request_target`、`issue_comment`、`pull_request_comment`、`issues`、`pull_request_review`、`pull_request_review_comment`、`repository_dispatch`、`workflow_dispatch` を列挙している | docs/custom-automations.md 14-25行目 | A | 2026-08-15 | 確認済み |
| 1 | 直前行の`workflow_dispatch`には「(coming soon)」の注記があり、他のイベントと異なり現時点では未対応であることが明示されている | docs/custom-automations.md 25行目 | A | 2026-08-15 | 確認済み |
| 1 | 公開ソース `src/github/validation/trigger.ts` の `checkContainsTrigger()` は、`prompt`指定時は常にtrue、issue割り当てイベントでは`assignee_trigger`との一致、issueの`labeled`アクションでは`label_trigger`との一致(大小文字無視)、issueの`opened`アクションではissue本文・タイトルの正規表現一致、pull_requestイベント全アクションでPR本文・タイトルの正規表現一致、pull_request_reviewの`submitted`/`edited`アクションでレビュー本文の正規表現一致、issue_comment/pull_request_review_commentイベントでコメント本文の正規表現一致、を判定条件としている | src/github/validation/trigger.ts 14-145行目 | B | 2026-08-15 | 確認済み |
| 1 | トリガーフレーズの一致判定は正規表現 `(^\|\s)${escapeRegExp(triggerPhrase)}([\s.,!?;:]\|$)` (大文字小文字を無視)であり、単語境界(先頭または空白の後、末尾または空白・句読点の前)を要求する | src/github/validation/trigger.ts 55-58行目 | B | 2026-08-15 | 確認済み |
| 1 | `docs/faq.md`は「`@claude`は完全な単語である必要があり、`@claude-bot`・`@claude!`・`claude@mention`のような変化形はカスタム`trigger_phrase`を設定しない限り機能しない」と説明する | docs/faq.md 209-211行目 | A | 2026-08-15 | 確認済み |
| 1 | `trigger_phrase`入力の既定値は`@claude`、説明文は「コメントまたはissue本文内で探すトリガーフレーズ」 | action.yml 8-11行目 | B | 2026-08-15 | 確認済み |
| 1 | `docs/usage.md`の`trigger_phrase`の説明は「コメント、issue/PR本文、issueタイトル内で探すトリガーフレーズ」であり、action.ymlの説明(コメントまたはissue本文のみ)より対象範囲が広く書かれている(PR本文・issueタイトルへの言及がaction.yml側に無い) | docs/usage.md 76行目 | A | 2026-08-15 | 確認済み |
| 1 | `assignee_trigger`(issue割り当てユーザー名)と`label_trigger`(issueに付与されたラベル名、既定`claude`)がトリガー手段として`action.yml`のinputsに定義されている | action.yml 12-18行目 | B | 2026-08-15 | 確認済み |
| 1 | `docs/security.md`は、issue・pull request・comment・review系イベントと`workflow_run`イベント(upstream runを開始したactorも含めてチェック)ではリポジトリへの書き込み権限を持つactorのみが発火できると説明する。`workflow_dispatch`・`repository_dispatch`・`schedule`イベントは個別にはチェックしない(GitHub自体がworkflow_dispatchにwrite権限を要求し、scheduleには外部actorが存在しないため)、としている | docs/security.md 5行目 | A | 2026-08-15 | 確認済み |
| 1 | 公開ソース `src/github/validation/trigger.ts`・`src/modes/detector.ts`のいずれにも、直前の実行結果を参照して同一トリガーの再発火を抑止する状態(過去のコメントID・実行履歴等)を読むロジックは存在しない。トリガー判定はそのイベントのpayloadのみから毎回独立に行われる | src/github/validation/trigger.ts 全体、src/modes/detector.ts 全体 | B | 2026-08-15 | 確認済み |
| 1 | `例1`(xability/maidr PR #887)では、同一PRに対して1時間強のあいだに同じ`claude[bot]`から「Claude finished @user's task」で始まるコメントが7件連続して投稿されており、同じトリガー手段の再利用が繰り返し発火することと矛盾しない(ただし各コメントが同一手段の再利用によるものかは本文からは断定できない) | 例1 | C2 | 2026-08-15 | 確認済み |
| 1 | `use_sticky_comment`入力の説明は「PRコメントを1つのコメントで配信する(pull_requestイベントのworkフローにのみ適用)」であり、issue系イベントには適用されないと明記されている | docs/usage.md 69行目 | A | 2026-08-15 | 確認済み |
| 2 | `action.yml`は39件のinputsを定義している(全キー): `trigger_phrase`(既定`@claude`)・`assignee_trigger`(既定なし)・`label_trigger`(既定`claude`)・`base_branch`(既定なし)・`branch_prefix`(既定`claude/`)・`branch_name_template`(既定`""`)・`allowed_bots`(既定`""`)・`allowed_non_write_users`(既定`""`)・`include_comments_by_actor`(既定`""`)・`exclude_comments_by_actor`(既定`""`)・`prompt`(既定`""`)・`settings`(既定`""`)・`anthropic_api_key`(既定なし)・`claude_code_oauth_token`(既定なし)・`anthropic_federation_rule_id`(既定なし)・`anthropic_organization_id`(既定なし)・`anthropic_service_account_id`(既定なし)・`anthropic_workspace_id`(既定なし)・`anthropic_oidc_audience`(既定なし)・`github_token`(既定なし)・`use_bedrock`(既定`false`)・`use_vertex`(既定`false`)・`use_foundry`(既定`false`)・`claude_args`(既定`""`)・`additional_permissions`(既定`""`)・`use_sticky_comment`(既定`false`)・`classify_inline_comments`(既定`true`)・`use_commit_signing`(既定`false`)・`ssh_signing_key`(既定`""`)・`bot_id`(既定`41898282`)・`bot_name`(既定`claude[bot]`)・`track_progress`(既定`false`)・`include_fix_links`(既定`true`)・`path_to_claude_code_executable`(既定`""`)・`path_to_bun_executable`(既定`""`)・`display_report`(既定`false`)・`show_full_output`(既定`false`)・`plugins`(既定`""`)・`plugin_marketplaces`(既定`""`)。すべて`required: false` | action.yml 7-167行目 | B | 2026-08-15 | 確認済み |
| 2 | `docs/usage.md`の「Deprecated Inputs」表は`mode`・`direct_prompt`・`override_prompt`・`custom_instructions`・`max_turns`・`model`・`fallback_model`・`allowed_tools`・`disallowed_tools`・`mcp_config`・`claude_env`の11キーを「非推奨(将来削除予定)」として案内している | docs/usage.md 93-109行目 | A | 2026-08-15 | 確認済み |
| 2 | このref時点の`action.yml`のinputs定義には、直前行の11キーはいずれも存在しない(`mode`を含む)。inputsは網羅的な情報源のため、これらのキーは「非推奨」ではなく既にこのAction自身の`with:`インターフェースからは指定不能である | action.yml 7-167行目 | B | 2026-08-15 | 確認済み |
| 2 | `action.yml`のcomposite steps内では`MODE: ${{ inputs.mode }}`という環境変数割り当てが残っているが、`inputs.mode`はinputs定義に存在しないため常に空文字列に評価される(dead code)。docsの「mode廃止」表現とaction.ymlの実装が整合していない箇所として記録する | action.yml 290行目 | B | 2026-08-15 | 確認済み |
| 2 | `docs/migration-guide.md`は`timeout_minutes`も非推奨入力として案内し、移行先はAction入力ではなくGitHub Actionsのジョブレベル`timeout-minutes`であるとしている(Action自身には実行時間上限のinputは存在しない) | docs/migration-guide.md 29行目、201-220行目 | A | 2026-08-15 | 確認済み |
| 2 | `branch_name_template`入力(ブランチ名テンプレート、既定`""`)は`action.yml`のinputsに定義されているが、`docs/usage.md`のInputs表には掲載されていない | action.yml 26-29行目 | B | 2026-08-15 | 確認済み |
| 2 | `display_report`(GitHub Step SummaryにClaude Code Reportを表示するか、既定`false`)と`show_full_output`(Claude Codeの全JSON出力を表示するか、既定`false`)は`action.yml`のinputsに定義されているが、`docs/usage.md`のInputs表には掲載されていない | action.yml 152-159行目 | B | 2026-08-15 | 確認済み |
| 2 | `allowed_bots`入力の既定値は`""`(空文字列)であり、説明文は「空文字列(既定)はどのbotも許可しない」。`'*'`を指定すると全botを許可する | action.yml 30-33行目 | B | 2026-08-15 | 確認済み |
| 2 | `allowed_non_write_users`入力は`github_token`入力が指定されている場合のみ機能する、と`action.yml`の説明文に明記されている | action.yml 34-46行目 | B | 2026-08-15 | 確認済み |
| 2 | `additional_permissions`で要求できる追加権限は`docs/configuration.md`で`actions: read`・`checks: read`・`discussions: read`または`write`・`workflows: read`または`write`の4系統に限定して案内されている。標準権限(`contents: write`・`pull_requests: write`・`issues: write`)は常に含まれ指定不要 | docs/configuration.md 177-182行目 | A | 2026-08-15 | 確認済み |
| 2 | `additional_permissions`の実装(`src/github/token.ts`の`parseAdditionalPermissions()`)は`key: value`形式の行をそのまま`DEFAULT_PERMISSIONS`(`contents/pull_requests/issues`各`write`)にマージするのみで、キー自体をホワイトリストで制限するコードは無い(呼び出し先のトークン交換API側での制限は本リポジトリのソースからは確認できない) | src/github/token.ts 69-101行目 | B | 2026-08-15 | 確認済み |
| 2 | 個別のClaude Code CLI引数(`--allowedTools`・`--disallowedTools`・`--max-turns`・`--model`・`--append-system-prompt`・`--mcp-config`・`--json-schema`等)はすべて`claude_args`という単一の自由形式文字列inputを介して渡す設計であり、`action.yml`にはこれらに対応する個別inputsは存在しない | action.yml 104-107行目、docs/configuration.md 各所 | B | 2026-08-15 | 確認済み |
| 2 | `settings`入力(JSON文字列またはファイルパス)は`model`・`env`・`permissions`・`hooks`等を設定できるとdocsは説明し、「`claude_args`はsettingsより優先される」と明記している | docs/configuration.md 320-334行目 | A | 2026-08-15 | 確認済み |
| 2 | `enableAllProjectMcpServers`設定は常にこのActionによって`true`に固定される、と`docs/configuration.md`に明記されている(ユーザー側で`false`に上書きする手段はdocsに記載が無い) | docs/configuration.md 332行目 | A | 2026-08-15 | 確認済み |
| 3 | `docs/faq.md`はPRイベントでは`--depth=20`、新規ブランチでは`--depth=1`のシャロークローンを使うと説明している(「Why are my commits shallow/missing history?」) | docs/faq.md 117-124行目 | A | 2026-08-15 | 確認済み |
| 3 | 公開ソース`src/github/operations/fetch-depth.ts`の`fetchDepthArgs(depth)`は、チェックアウトが既にシャローである場合にのみ`--depth=${depth}`を付与し、フル履歴チェックアウトに対しては深さ制限を適用しない(履歴を切り詰めてマージベースを失わせないため)というガードを実装している。具体的な深さの値(20/1)自体はこの関数の外部から渡される引数であり、このファイル自体には値は無い | src/github/operations/fetch-depth.ts 19-40行目 | B | 2026-08-15 | 確認済み |
| 3 | フェッチ深さを変更するinputは`action.yml`のinputsに存在しない。参照範囲(取得する履歴の深さ)をこのActionの公開inputsから直接制御する手段は無い | action.yml 7-167行目 | B | 2026-08-15 | 確認済み |
| 3 | `docs/security.md`は、PR上で実行する際`.claude/`・`.mcp.json`・`.claude.json`・`.gitmodules`・`.ripgreprc`・`CLAUDE.md`・`CLAUDE.local.md`・`.husky/`をベースブランチから復元し、それ以外(`package.json`・lockfile・`Makefile`・`node_modules/`等)はPRヘッドのまま残す、と説明している | docs/security.md 56-58行目 | A | 2026-08-15 | 確認済み |
| 3 | `additional_permissions`に`actions: read`を設定すると、Claudeは`mcp__github_ci__get_ci_status`・`mcp__github_ci__get_workflow_run_details`・`mcp__github_ci__download_job_log`のMCPツールでワークフロー実行結果・ジョブログにアクセスできるようになる、とdocsは説明する | docs/configuration.md 141-145行目 | A | 2026-08-15 | 確認済み |
| 4 | `prompt`入力(直接プロンプトまたはテンプレート)と`claude_args`(CLI引数)が観点指定の主要な手段であり、`docs/custom-automations.md`はGitHubコンテキスト変数(`${{ github.event.pull_request.number }}`等)を`prompt`内に埋め込む例を示す | docs/custom-automations.md 74-105行目 | A | 2026-08-15 | 確認済み |
| 4 | `docs/configuration.md`は、既定で許可されるのはファイル操作(読み取り・コミット・編集・読み取り専用git)とコメント管理・基本GitHub操作のみであり、任意のBashコマンドは`claude_args`の`--allowedTools "Bash(npm install),..."`のように明示的に許可しない限り実行できないと説明する | docs/configuration.md 223-244行目 | A | 2026-08-15 | 確認済み |
| 4 | 公開ソース`src/modes/tag/index.ts`のtagモードでは、`Edit`/`MultiEdit`/`Write`ツールは`tagModeTools`リストに意図的に含めていない(コメントで「acceptEdits権限モードが`$GITHUB_WORKSPACE`内のファイル編集を自動許可し、それ以外への書き込みを拒否するため、ここに列挙するとランナー全体への書き込み権限を許してしまう」と明記)。ファイル編集の可否は`--allowedTools`ではなく`--permission-mode acceptEdits`という別の仕組みで制御されている | src/modes/tag/index.ts 130-186行目 | B | 2026-08-15 | 確認済み |
| 4 | 公開ソース`src/modes/tag/index.ts`は、tagモードでユーザーの`claude_args`由来の`mcp__github_`接頭辞ツールのみを`tagModeTools`にマージし、それ以外のユーザー指定ツールはtagモード側のツールリストには混ぜない(ユーザーの`claude_args`自体は末尾にそのまま追加される) | src/modes/tag/index.ts 123-190行目 | B | 2026-08-15 | 確認済み |
| 4 | `docs/configuration.md`は、リポジトリルートに`.mcp.json`があれば自動検出して使うが、そのツールは`--allowedTools`で明示的に許可しない限り使用できないと説明する | docs/configuration.md 233行目 | A | 2026-08-15 | 確認済み |
| 4 | `docs/faq.md`は、Claudeがrebase等の破壊的git操作を拒否するのはシステムプロンプトによる制約であり、`--allowedTools "Bash(git rebase:*)"`のようにツール自体を許可しても、Claudeは説明とともに実行を拒否すると明記している(ツール許可では覆せない制約として記載) | docs/faq.md 64-73行目 | A | 2026-08-15 | 確認済み |
| 5 | `action.yml`のoutputsは6件: `conclusion`(値`${{ steps.run.outputs.conclusion }}`、説明「'success'または'failure'」)・`execution_file`(実行出力ファイルパス)・`branch_name`(作成したブランチ名)・`github_token`(使用したトークン)・`structured_output`(`--json-schema`指定時のJSON文字列)・`session_id`(`--resume`に使えるセッションID) | action.yml 169-187行目 | B | 2026-08-15 | 確認済み |
| 5 | 公開ソース`src/entrypoints/run.ts`は、複合action内部でのみ使う`skipped_due_to_workflow_validation_mismatch`という出力を`core.setOutput`で設定するが、この名前は`action.yml`のoutputs:節には宣言されていない。複合actionの仕様上、outputs:に宣言されていないstep出力は呼び出し元ワークフローの`steps.<id>.outputs`からは参照できず、action.yml自身の後続step条件式(`inputs.github_token == '' && steps.run.outputs...`)でのみ消費される内部限定の信号である | src/entrypoints/run.ts 176-180行目、action.yml 449行目 | B | 2026-08-15 | 確認済み |
| 5 | 同様に`src/github/validation/trigger.ts`の`checkTriggerAction()`が設定する`contains_trigger`出力も`action.yml`のoutputs:には宣言されていない内部限定の信号である | src/github/validation/trigger.ts 151-155行目、action.yml 169-187行目 | B | 2026-08-15 | 確認済み |
| 5 | 公開ソース`src/entrypoints/run.ts`は、トリガー条件を満たさなかった場合(`containsTrigger`がfalse)、`github_token`出力のみ設定して即座にreturnする。`conclusion`出力はこの経路では一切設定されない(空文字列のまま) | src/entrypoints/run.ts 216-220行目 | B | 2026-08-15 | 確認済み |
| 5 | `base-action/src/run-claude-sdk.ts`の型定義上、`conclusion`は`"success" \| "failure"`の2値のみであり、action.ymlのoutputs説明と一致する | base-action/src/run-claude-sdk.ts 13-18行目 | B | 2026-08-15 | 確認済み |
| 5 | `docs/capabilities-and-limitations.md`は「Claudeは単一の初期コメントを更新することで進捗と結果を伝え、複数コメントは投稿しない」「Claudeは正式なGitHub PRレビューを提出できない」「Claudeはpull requestをapproveできない」と明記している | docs/capabilities-and-limitations.md 5-24行目 | A | 2026-08-15 | 確認済み |
| 5 | 公開ソース`src/github/operations/comments/create-initial.ts`は、pull_request_review_commentイベントでは`octokit.rest.pulls.createReplyForReviewComment`、それ以外(issue・issue_comment等)は`octokit.rest.issues.createComment`で「初期コメント」を1回だけ作成し、そのコメントIDを`GITHUB_OUTPUT`に`claude_comment_id`として書き出す | src/github/operations/comments/create-initial.ts 19-111行目 | B | 2026-08-15 | 確認済み |
| 5 | `use_sticky_comment`かつPRイベントの場合、`create-initial.ts`は投稿前に既存コメントを`user.id === 209825114`または`user.type === "Bot" && login`に`claude`を含む、または本文完全一致、のいずれかで検索し、見つかれば新規作成せず`octokit.rest.issues.updateComment`で上書きする | src/github/operations/comments/create-initial.ts 31-65行目 | B | 2026-08-15 | 確認済み |
| 5 | 実行中〜完了までの以降の更新は、`src/github/operations/comments/update-claude-comment.ts`の`updateClaudeComment()`が`octokit.rest.issues.updateComment`(または`pulls.updateReviewComment`、404時は`issues.updateComment`にフォールバック)で同一コメントIDを編集する形で行われる。新規コメントの追加投稿ではなく既存コメントの編集更新である | src/github/operations/comments/update-claude-comment.ts 25-70行目 | B | 2026-08-15 | 確認済み |
| 5 | インラインPRコメント(`create_inline_comment`ツール)は`octokit.rest.pulls.createReviewComment`で個別に作成される(初期コメントとは別の投稿経路であり、こちらは常に新規作成であって編集ではない) | src/mcp/github-inline-comment-server.ts 152-212行目 | B | 2026-08-15 | 確認済み |
| 5 | 投稿アカウントの識別子は定数`CLAUDE_BOT_LOGIN = "claude[bot]"`(`src/github/constants.ts`)。ただし`docs/faq.md`は「`github_token`をworkflowに指定するとそのトークンの持ち主として投稿されるため`claude[bot]`にならない」と説明しており、識別子はAction自身のGitHub App認証を使う場合にのみ安定して`claude[bot]`になる | src/github/constants.ts 10-13行目、docs/faq.md 184-190行目 | B | 2026-08-15 | 確認済み |
| 5 | `src/github/constants.ts`の`CLAUDE_APP_BOT_ID`定数値は`41898282`だが、`src/github/operations/comments/create-initial.ts`は同名`CLAUDE_APP_BOT_ID`をこのファイル内でローカルに`209825114`として再定義しており(constants.tsからimportしていない)、両者の値が異なる | src/github/constants.ts 8行目、src/github/operations/comments/create-initial.ts 17行目 | B | 2026-08-15 | 確認済み |
| 5 | `bot_id`入力の既定値`41898282`は`action.yml`の説明上「git操作(コミット)に使うGitHub user ID」であり、コメント投稿時のbot識別とは異なる用途として文書化されている | action.yml 128-131行目 | B | 2026-08-15 | 確認済み |
| 5 | `例1`・`例2`いずれの観測でも、コメント投稿者の`user.id`は`209825114`であった。これは`src/github/constants.ts`の`41898282`ではなく、`create-initial.ts`ローカル定数`209825114`と一致する | 例1、例2 | C2 | 2026-08-15 | 確認済み |
| 5 | 公開ソース`src/entrypoints/format-turns.ts`は、`display_report`が`false`でない限り実行結果JSON(`execution_file`)からGitHub Step Summary用Markdownを生成する。見出しは`## Claude Code Report`固定、パース失敗時のフォールバック見出しは`## Claude Code Report (Raw Output)`固定 | src/entrypoints/format-turns.ts 358-359行目、src/entrypoints/run.ts 123-148行目 | B | 2026-08-15 | 確認済み |
| 5 | `execution_file`出力(`$RUNNER_TEMP/claude-execution-output.json`)は、Claude Agent SDKが返す`SDKMessage`の配列をそのままJSON化したものである(`base-action/src/execution-file.ts`の`writeExecutionFile`) | base-action/src/execution-file.ts 15-32行目 | B | 2026-08-15 | 確認済み |
| 6 | `conclusion`出力は`"success"`または`"failure"`の2値のみで、「指摘0件で成功」「スキップ」「レート制限で未実行」を区別する専用の値は存在しない(型定義上この2値のみ) | base-action/src/run-claude-sdk.ts 13-18行目 | B | 2026-08-15 | 確認済み |
| 6 | トリガー未該当によるスキップの場合、`conclusion`出力は一切設定されない(空)。ワークフロー検証ミスマッチによるスキップ(`skipped_due_to_workflow_validation_mismatch`)も同様に`conclusion`は設定されない。両者とも「未実行」を`conclusion`の値からは判別できず、値が空であることでしか気づけない。さらに後者を示す出力自体が`action.yml`のoutputs:に宣言されていないため呼び出し元ワークフローから参照できない(軸5参照) | src/entrypoints/run.ts 176-220行目、action.yml 169-187行目 | B | 2026-08-15 | 確認済み |
| 6 | `resultMessage.subtype === "success"`かつ`is_error === true`のケースは、Agent SDKのresult subtypeが"success"であってもこのAction自身が`conclusion = "failure"`に倒す(コメントで「誤って緑チェックを出さないため」と明記) | base-action/src/run-claude-sdk.ts 222-226行目 | B | 2026-08-15 | 確認済み |
| 6 | `--json-schema`(構造化出力)を指定したのに`structured_output`が返らなかった場合、成功判定だったとしても`core.setFailed`を呼び`conclusion`を`"failure"`に上書きしてthrowする | base-action/src/run-claude-sdk.ts 228-248行目 | B | 2026-08-15 | 確認済み |
| 6 | `execution_file`の有無自体が実行完了の代理指標になりうる。`writeExecutionFile`は例外発生時にも呼ばれるため、ファイルの存在は「SDK呼び出しが最低1メッセージ受信した」ことまでしか保証しない | base-action/src/run-claude-sdk.ts 182-196行目、base-action/src/execution-file.ts 15-32行目 | B | 2026-08-15 | 確認済み |
| 7 | `docs/configuration.md`は`--max-turns`を`claude_args`経由で渡すターン数制限として案内し、「上限到達時はClaudeが処理を穏当に停止する」と説明する。ターン上限の既定値そのものはdocsに記載が無い | docs/configuration.md 204-221行目 | A | 2026-08-15 | 確認済み |
| 7 | `base-action/src/run-claude-sdk.ts`は、result subtypeが"success"かつ`num_turns`が指定`maxTurns`を上回っている場合、成功扱いにせずエラーを投げる(「ターン数超過にもかかわらずsuccessが返った」場合の安全弁) | base-action/src/run-claude-sdk.ts 211-220行目 | B | 2026-08-15 | 確認済み |
| 7 | 実行時間の上限はこのAction自身のinputには存在せず、`docs/migration-guide.md`は移行先としてGitHub Actionsジョブレベルの`timeout-minutes`を案内している(Action非公開機能ではなくGitHub Actions自体の機能) | docs/migration-guide.md 202-220行目 | A | 2026-08-15 | 確認済み |
| 7 | 認証方式は「Anthropic直接API(既定)」「Amazon Bedrock(OIDC)」「Google Vertex AI(OIDC)」「Microsoft Foundry(OIDC)」の4種、加えてワークロードアイデンティティ連携(`anthropic_federation_rule_id`等)がある、と`docs/cloud-providers.md`は説明する | docs/cloud-providers.md 1-8行目 | A | 2026-08-15 | 確認済み |
| 7 | `docs/setup.md`は「Inline comment classification(`classify_inline_comments`)は現状`anthropic_api_key`を要する。ワークロードアイデンティティ連携ではこの分類はスキップされ、未確認のインラインコメントは直接投稿される」と説明する。これは認証方式によって挙動(分類の有無)が変わる具体例である | docs/setup.md 57行目 | A | 2026-08-15 | 確認済み |
| 7 | `src/entrypoints/post-buffered-inline-comments.ts`の分類関数は`process.env.ANTHROPIC_API_KEY`が未設定の場合、分類APIを呼ばず全ての未確認コメントをそのまま投稿する(Bedrock/Vertex利用者が直接キーを持たない場合の後方互換フォールバックとコメントに明記) | src/entrypoints/post-buffered-inline-comments.ts 1-11行目、45-52行目 | B | 2026-08-15 | 確認済み |
| 7 | OIDCトークン取得とAppトークン交換は`retryWithBackoff`により最大3回、初回5秒・倍率2・上限20秒のバックオフで再試行される(Claude API呼び出し自体のレート制限リトライではなく、GitHub Actions側のOIDC/トークン交換に対するリトライ) | src/github/token.ts 158-185行目、base-action/src/retry.ts 9-47行目 | B | 2026-08-15 | 確認済み |
| 7 | 「残枠・レート上限」を数値として返すinputやoutputは`action.yml`のinputs/outputsのいずれにも存在しない | action.yml 7-187行目 | B | 2026-08-15 | 確認済み |
| 8 | `docs/capabilities-and-limitations.md`は「What Claude Cannot Do」として、正式PRレビュー提出不可・PR承認不可・複数コメント投稿不可・トリガーされたコンテキスト外への操作不可・既定でBash実行不可・マージ/リベース等のブランチ操作不可、を明記している | docs/capabilities-and-limitations.md 16-24行目 | A | 2026-08-15 | 確認済み |
| 8 | `docs/security.md`は「既定では、@claudeメンションに応答してもClaudeが自動でPRを作成することはない。ブランチにコミットしPR作成ページへのリンクを返すのみで、ユーザー自身がリンクをクリックしてPRを作成する必要がある」と明記している | docs/security.md 66-74行目 | A | 2026-08-15 | 確認済み |
| 8 | `docs/security.md`の「GitHub App Permissions」節は、Discussions(Read & Write)・Actions(Read)・Checks(Read)・Workflows(Read & Write)を「将来機能向けに要求しているが現状未使用」と明記している。これは「Actionの公開設定からは到達できない(将来用に権限だけ確保されている)」の具体例である | docs/security.md 92-99行目 | A | 2026-08-15 | 確認済み |
| 8 | `docs/faq.md`は「ClaudeのGitHub Appはセキュリティ上workflow書き込み権限を持たない」と明記し、この制約は将来見直す可能性があるとも述べている | docs/faq.md 60-62行目 | A | 2026-08-15 | 確認済み |
| 8 | このAction自体が「レビュー観点(何をレビューするか)」を強制するデフォルトの観点リストや、レビュー種別(セキュリティ/パフォーマンス等)を選択するinputは`action.yml`に存在しない。観点は`prompt`または`claude_args`の自由記述にすべて委ねられている。**公式に未文書化**(検索範囲: `action.yml`のinputs定義全件、`docs/*.md`全文の"review"関連記述。inputs:は網羅的な情報源のため、専用inputが無いことは「観点を選択する仕組みは存在しない」と言い切れる) | action.yml 7-167行目 | B | 2026-08-15 | 公式に未文書化 |
| 8 | Claude自身が投稿する進捗チェックリスト・見出しテキストの内容(例: タスク文言、絵文字見出し)がAction側の固定テンプレートで決まるのか、モデルが`update_claude_comment`ツール呼び出し時に自由記述するのかについて、`action.yml`・README・`docs/*.md`のいずれにも明文の記載が無い。**公式に未文書化**(検索範囲: `docs/capabilities-and-limitations.md`・`docs/experimental.md`・README全文、検索語「checkbox」「progress」「Tasks」。README/docsは開いた情報源であるため「記載が無い」にとどまり「存在しない」とは言えない)。ただし公開ソース`src/mcp/github-comment-server.ts`の`update_claude_comment`ツール定義は`body`パラメータを「更新後のコメント内容全文」として受け取るのみで、本文の構造(チェックリスト形式か否か)を強制する固定テンプレートやスキーマは無く、呼び出し側(モデル)が本文全体を自由に組み立てる設計であることがソースからは確認できる | src/mcp/github-comment-server.ts 27-32行目 | B | 2026-08-15 | 確認済み |
| 9 | `src/mcp/github-inline-comment-server.ts`の`create_inline_comment`ツールは、`confirmed`パラメータが省略またはfalseの場合、GitHub APIへは投稿せず`/tmp/inline-comments-buffer.jsonl`に追記するのみで即座には出力オブジェクトを作らない。`confirmed: true`の場合のみ即時投稿される | src/mcp/github-inline-comment-server.ts 79-146行目 | B | 2026-08-15 | 確認済み |
| 9 | バッファされたインラインコメントは、セッション終了後の`post-buffered-inline-comments`ステップ(`if: always()`)で、`confirmed: false`のものは常に破棄され、それ以外はHaiku(`claude-haiku-4-5`)による分類APIで「REAL」と判定されたものだけが実際に`createReviewComment`で投稿される。「TEST/PROBE」と判定されたものは`::warning::`ログに件数と冒頭120文字を出すのみで、GitHub上には一切投稿されない | src/entrypoints/post-buffered-inline-comments.ts 179-227行目 | B | 2026-08-15 | 確認済み |
| 9 | `classify_inline_comments`を`'false'`に設定すると、上記の分類・バッファリングは行われず、`confirmed !== true`の全呼び出しが即座に投稿される(pre-buffering挙動への切り戻し) | action.yml 116-119行目 | B | 2026-08-15 | 確認済み |
| 9 | 分類APIが利用不可(キー未設定・HTTPエラー・レスポンス形状不一致・例外)の場合は`null`を返し、その場合はバッファ中の全候補(`confirmed !== false`)がそのまま投稿される(分類スキップ時はフィルタされない) | src/entrypoints/post-buffered-inline-comments.ts 45-108行目 | B | 2026-08-15 | 確認済み |
| 9 | ライブ投稿(`confirmed: true`)された呼び出しは、バッファ中の同一(path/line/startLine/body)エントリを`removeBufferedComment`で削除する。これはモデルが「Set confirmed=true to post immediately」という返答を読んで同じコメントを`confirmed: true`で再送するケースに対する重複投稿防止であり、ソースコード中のコメントに明記されている | src/mcp/inline-comment-buffer.ts 10-54行目、src/mcp/github-inline-comment-server.ts 184-192行目 | B | 2026-08-15 | 確認済み |
| 9 | `show_full_output`が`false`(既定)の場合、SDKメッセージのうち`system/init`と`result`のみサニタイズ済みサマリとしてジョブログに出力され、それ以外のメッセージ種別はログに一切出力されない(`sanitizeSdkOutput`が`null`を返す) | base-action/src/run-claude-sdk.ts 88-130行目 | B | 2026-08-15 | 確認済み |
| 9 | `docs/security.md`は、`ACTIONS_STEP_DEBUG`シークレットが`true`のときGitHub Actionsデバッグモードが有効になると`show_full_output`相当が自動的に有効化される、と説明している | docs/security.md 190-192行目 | A | 2026-08-15 | 確認済み |
| 9 | `updateCommentBody()`(コメント本文の再構成ロジック)は、既存本文から`Claude Code is working[…\.]{1,3}(?:\s*<img[^>]*>)?`という正規表現にマッチする「作業中」文言を除去し、`[Create .* PR](...)` 形式のリンクを抽出・除去してから、ヘッダーとリンク列を先頭に再構築する。すなわちClaudeが自由記述したコメント本文の一部(作業中の表示やPRリンク)を、Action側が事後的に文字列パターンマッチで書き換える設計である | src/github/operations/comment-logic.ts 70-206行目 | B | 2026-08-15 | 確認済み |
| 9 | `updateCommentLink()`の`executionDetails`はexecution_fileの**配列の最後の要素**が`type === "result"`かつ`total_cost_usd`/`duration_ms`を持つ場合のみ抽出される。最後の要素がresultでない場合はコスト・所要時間情報が取得できない(黙って`null`のまま扱われる) | src/entrypoints/update-comment-link.ts 178-205行目 | B | 2026-08-15 | 確認済み |
| 9 | `updateClaudeComment()`はPRレビューコメント更新APIが404を返した場合、issueコメント更新APIにフォールバックする(投稿先の型を取り違えても片方が失敗すればもう片方で編集を試みる) | src/github/operations/comments/update-claude-comment.ts 33-63行目 | B | 2026-08-15 | 確認済み |
| 9 | インラインコメントは`octokit.rest.pulls.createReviewComment`単発呼び出しで作成される(下書きレビュー→submitのワークフローを経由しない)。このAPIはPRの正式レビュー提出(`docs/capabilities-and-limitations.md`が「できない」とする操作)とは別のエンドポイントである | src/mcp/github-inline-comment-server.ts 152-182行目 | B | 2026-08-15 | 確認済み |
| 10 | 「1回のレビュー実行」を機械的に数える一意な痕跡は、GitHub Actionsのworkflow run(`GITHUB_RUN_ID`、`jobUrl`としてコメントに埋め込まれる)である。コメント本文中の「[View job](url)」リンクがこのrun IDを指す | src/entrypoints/update-comment-link.ts 51行目 | B | 2026-08-15 | 確認済み |
| 10 | 実行コスト(`total_cost_usd`)・所要時間(`duration_ms`・`duration_api_ms`)は、execution_fileの最後の要素(`type: "result"`)から取得できるが、外部のoutputsとしては公開されていない(execution_fileを別途パースする必要がある。conclusion/execution_file/branch_name/github_token/structured_output/session_idのいずれにもコスト・所要時間は含まれない) | src/github/operations/comment-logic.ts 4-20行目、action.yml 169-187行目 | B | 2026-08-15 | 確認済み |
| 10 | 権限拒否(permission denial)の件数は、`sanitizeSdkOutput`のresultサマリ内に`permission_denials_count`としてログには出力されるが、`execution_file`のJSON自体(生のSDKMessage配列)やAction outputsに専用フィールドとして機械可読な形で存在するかは、本調査で読んだソース範囲(`run-claude-sdk.ts`・`execution-file.ts`)からは確認できない。**公式に未文書化**(検索範囲: `base-action/src/run-claude-sdk.ts`全文、`base-action/src/execution-file.ts`全文、検索語「permission_denials」。`execution_file`はwriteExecutionFileが`messages`配列をそのままダンプする実装であり、SDKMessage型定義自体はこのリポジトリ外の`@anthropic-ai/claude-agent-sdk`パッケージにあるため、フィールドの有無をこのリポジトリのソースだけでは判定しきれない。開いた情報源での不在にとどまる) | base-action/src/run-claude-sdk.ts 110-126行目 | B | 2026-08-15 | 公式に未文書化 |
| 11 | 設定の現在値(inputsに何を渡したか)をワークフローファイルを読む以外の方法でAction自身が返す手段は、`action.yml`のoutputsには存在しない(outputsは実行結果に関する6件のみで、入力エコーバック用の出力は無い) | action.yml 169-187行目 | B | 2026-08-15 | 確認済み |
| 11 | 残枠・レート上限の現在値を返すinput/outputは`action.yml`に存在しない | action.yml 7-187行目 | B | 2026-08-15 | 確認済み |
| 11 | `docs/faq.md`は「Claudeが何をしているか確認する方法」として、GitHub Actionsのジョブログを見ることだけを案内しており、Action独自の可観測性APIやダッシュボードへの言及は無い | docs/faq.md 205-207行目 | A | 2026-08-15 | 確認済み |
| その他 | `docs/security.md`は「Claudeを`pull_request_target`や`workflow_run`で使う場合、ワークスペースルートに信頼できないrefをチェックアウトしてはならない」とし、推奨パターン(base refのみをルートに、head refはサブディレクトリへ`--add-dir`で渡す)を示す | docs/security.md 23-52行目 | A | 2026-08-15 | 確認済み |
| その他 | `docs/security.md`はプロンプトインジェクション対策として、HTMLコメント・不可視文字・markdown画像alt・隠しHTML属性・HTMLエンティティをストリッピングすると明記しつつ「新たな回避手法が出現しうる」と限界も明記している | docs/security.md 76-78行目 | A | 2026-08-15 | 確認済み |
| その他 | `include_comments_by_actor`/`exclude_comments_by_actor`は`*[bot]`ワイルドカードで全bot一致に対応し、両方に一致した場合は除外が優先される、と`action.yml`の説明文に明記されている | action.yml 47-54行目 | B | 2026-08-15 | 確認済み |

`その他`に該当する仕様のうち上記3行を記録した(空ではない)。

## 出力パターン

| 面 | フィールド | 逐語文字列 | 意味する状態 | 出典(URL・観測環境の文脈) | 等級 | 確認日 | 状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR/issueコメント本文 | 初期コメント全文 | `Claude Code is working…␣<img .../>\n\nI'll analyze this and get back to you.\n\n[View job run](url)` (`␣`は半角スペース1つ) | 初期起動直後、Claudeがまだ本文を上書きする前の状態 | src/github/operations/comments/common.ts 24-33行目(SPINNER_HTMLのURLは`.../5ac382c7-e004-429b-8e35-7feb3e8f9c6f`) | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | working文言の正規表現 | `Claude Code is working[…\.]{1,3}(?:\s*<img[^>]*>)?` | 完了時に旧本文からこの部分だけを除去するためのマッチャ(`…`と`...`の両表記に対応) | src/github/operations/comment-logic.ts 85行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | 完了ヘッダー(成功) | `**Claude finished @{username}'s task**` | 実行完了、失敗ではない | src/github/operations/comment-logic.ts 124-133行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | 完了ヘッダー(成功・所要時間あり) | `**Claude finished @{username}'s task in {duration}**` | 実行完了(所要時間が計測できた場合。`{duration}`は`Xm Ys`または`Xs`) | src/github/operations/comment-logic.ts 104-133行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | 完了ヘッダー(失敗) | `**Claude encountered an error**` | prepareフェーズまたは実行が失敗 | src/github/operations/comment-logic.ts 116-121行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | 完了ヘッダー(失敗・所要時間あり) | `**Claude encountered an error after {duration}**` | 実行失敗(所要時間が計測できた場合) | src/github/operations/comment-logic.ts 116-121行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | リンク区切り | `␣——␣[View job]({jobUrl})` (`␣`は半角スペース1つ) | ヘッダー直後に常に付くジョブリンク | src/github/operations/comment-logic.ts 136行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | ブランチリンク区切り | ``␣•␣[`{branchName}`]({branchUrl})`` (`␣`は半角スペース1つ) | 新規ブランチが作成された場合に追加 | src/github/operations/comment-logic.ts 168-172行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | PR作成リンク | `␣•␣[Create PR ➔]({prUrl})` (`␣`は半角スペース1つ) | ブランチに差分があり、まだPRリンクが本文中に無い場合 | src/github/operations/comment-logic.ts 176-179行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | エラー詳細ブロック | `` \n\n```\n{redactSecrets(errorDetails)}\n```\n `` | 失敗時、prepareフェーズのエラーメッセージ本文(既知のシークレット形式は伏字化) | src/github/operations/comment-logic.ts 188-190行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | 新規ブランチ作成時のPRリンク | `\n[Create a PR]({prUrl})` | issueまたはclosed/merged PRから新規ブランチを作成し、差分があるがまだPRリンクが本文に無い場合 | src/entrypoints/update-comment-link.ts 154-156行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文 | issue用ブランチリンク | `\n[View branch]({branchUrl})` | issueトリガーで新規ブランチが作成された場合(PRの場合は付与されない) | src/github/operations/comments/common.ts 15-22行目、src/github/operations/comments/update-with-branch.ts 30-34行目 | B | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | 完了ヘッダー+リンク(成功) | `**Claude finished @jooyoungseo's task in 1m 45s** —— [View job](https://github.com/xability/maidr/actions/runs/31835971815)` | tagモードでの成功完了 | 例1(1件目のコメント) | C2 | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | 完了ヘッダー+リンク(失敗) | `**Claude encountered an error after 2s** —— [View job](https://github.com/laurimoyle/lusory/actions/runs/31723017302)` | prepareフェーズまたは実行の失敗 | 例2(1件目のコメント) | C2 | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | 失敗時の残存文言 | `\n\n---\nI'll analyze this and get back to you.` | 失敗時、初期テンプレートの一部(作業中文言のみ除去され、この一文はそのまま残る) | 例2(1件目のコメント) | C2 | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | 進捗タスクリスト見出し | `**Tasks**` | Claudeが`update_claude_comment`ツールで自由記述した進捗チェックリストの見出し(Action側の固定テンプレートかは軸8「公式に未文書化」参照) | 例1(1〜7件目のコメント) | C2 | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | 完了タスクのチェックボックス | `- [x] {タスク文言}` | GFMタスクリストの完了マーカー(モデルが自由記述) | 例1(1〜7件目のコメント) | C2 | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | 未完了タスクのチェックボックス | `- [ ] {タスク文言}` | GFMタスクリストの未完了マーカー(モデルが自由記述) | 例1(1〜7件目のコメント) | C2 | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | レビュー中見出し+スピナー | `### Claude is reviewing this PR␣<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" .../>` (`␣`は半角スペース1つ) | tagモードでレビュー作業中(モデル自由記述だが、画像URLはsrc/github/operations/comments/common.tsのSPINNER_HTML定数と一致) | 例1(1〜7件目のコメント) | C2 | 2026-08-15 | 確認済み |
| PR/issueコメント本文(実測) | ブランチ脚注リンク | `[Branch]({url})` | 作業ブランチへのリンク(モデル自由記述。ソース上の固定文言`[View branch](...)`とは表記が異なる) | 例1(3〜7件目のコメント) | C2 | 2026-08-15 | 確認済み |
| ジョブログ(GitHub Actions) | インラインコメントのバッファ確認応答 | `Comment buffered. It will be classified and posted after this session completes (real review comments post, test/probe comments are dropped). Set confirmed=true to post immediately. If you are testing whether this tool works: it works — no need to test further.` | `confirmed`未指定/false時の`create_inline_comment`ツール応答本文(モデルへの返信、MCPツール結果) | src/mcp/github-inline-comment-server.ts 130-139行目 | B | 2026-08-15 | 確認済み |
| ジョブログ(GitHub Actions) | バッファなし | `No buffered inline comments` | セッション終了後、バッファファイルが存在しないか空 | src/entrypoints/post-buffered-inline-comments.ts 151行目、161行目 | B | 2026-08-15 | 確認済み |
| ジョブログ(GitHub Actions) | バッファ件数 | `Found {n} buffered inline comment(s)` | バッファに1件以上あり分類処理を開始 | src/entrypoints/post-buffered-inline-comments.ts 165行目 | B | 2026-08-15 | 確認済み |
| ジョブログ(GitHub Actions) | test/probe判定の警告 | `::warning::{n} buffered comment(s) classified as test/probe — NOT posted:` | Haiku分類でtest/probeと判定され投稿されなかった件数 | src/entrypoints/post-buffered-inline-comments.ts 200-202行目 | B | 2026-08-15 | 確認済み |
| ジョブログ(GitHub Actions) | 投稿完了サマリ | `Posted {posted}/{toPost.length}` | 分類後の投稿試行結果(成功件数/対象件数) | src/entrypoints/post-buffered-inline-comments.ts 227行目 | B | 2026-08-15 | 確認済み |
| ジョブログ(GitHub Actions) | ワークフロー検証スキップ | `Action skipped due to workflow validation error. This is expected when adding Claude Code workflows to new repositories or on PRs with workflow changes. If you're seeing this, your workflow will begin working once you merge your PR.` | Appトークン交換がworkflow検証エラー(`workflow_not_found_on_default_branch`等)を返し、実行全体をスキップした場合 | src/github/token.ts 131-135行目 | B | 2026-08-15 | 確認済み |
| ジョブログ(GitHub Actions) | 分類APIキー未設定 | `ANTHROPIC_API_KEY not set — skipping classification, posting all unconfirmed comments` | Bedrock/Vertex等で直接APIキーが無く、インラインコメント分類をスキップする場合 | src/entrypoints/post-buffered-inline-comments.ts 48-51行目 | B | 2026-08-15 | 確認済み |
| Step Summary(GitHub Actions) | レポート見出し | `## Claude Code Report` | `display_report`が`false`でない場合の正常なレポート生成 | src/entrypoints/format-turns.ts 359行目 | B | 2026-08-15 | 確認済み |
| Step Summary(GitHub Actions) | フォールバック見出し | `## Claude Code Report (Raw Output)` | フォーマット処理が例外を投げ、生JSONにフォールバックした場合 | src/entrypoints/run.ts 137行目 | B | 2026-08-15 | 確認済み |
| Step Summary(GitHub Actions) | フォールバック本文冒頭 | `Failed to format output (please report). Here's the raw JSON:` | フォールバック時の説明文 | src/entrypoints/run.ts 138-139行目 | B | 2026-08-15 | 確認済み |

## 出力の構造

- GitHub Step Summaryの固定見出し(レベル2): `## Claude Code Report`、`## 🚀 System Initialization`、`## ⚙️ System Message`、`## 👤 User`、`## ✅ Final Result`(`src/entrypoints/format-turns.ts` 358-422行目、B、2026-08-15確認)
- Step Summaryの区切り線: 各セクション末尾に`---`(`src/entrypoints/format-turns.ts` 365-410行目、B)
- Step Summaryのコスト・所要時間行の固定書式: `**Cost:** ${cost.toFixed(4)} | **Duration:** {seconds}s`(`src/entrypoints/format-turns.ts` 421行目、B)
- コメント本文とStep Summaryで共通のスピナー画像URL(機械可読なマーカーではないが、Action由来の埋め込みを識別する固定アセットURL): `https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f`(`src/github/operations/comments/common.ts` 3-4行目、B。例1でも同一URLが観測された、C2)
- `execution_file`(`claude-execution-output.json`)はClaude Agent SDKの`SDKMessage`配列をそのままJSON化したもので、Action独自の追加ラッパーやメタデータフィールドは付与されない(`base-action/src/execution-file.ts` 15-32行目、B)
- インラインコメントのバッファファイル`/tmp/inline-comments-buffer.jsonl`は改行区切りJSON(JSONL)で、各行が`{ts, path, line, startLine, side, commit_id, body, confirmed}`形式(`src/mcp/inline-comment-buffer.ts` 3-8行目、`src/mcp/github-inline-comment-server.ts` 111-124行目、B)
- HTMLコメント等による機械可読マーカー(隠しメタデータ)は、調査したソース範囲(コメント投稿・更新・インラインコメント関連ファイル)には見当たらなかった。**公式に未文書化**(検索範囲: `src/github/operations/comments/*.ts`全文、`src/github/operations/comment-logic.ts`全文、検索語「`<!--`」「marker」。開いた情報源=公開ソース全体を悉皆的に読んだわけではないため「存在しない」ではなく「見当たらなかった」にとどめる)

## 網羅性パス

- README目次(`## Documentation`)の10リンクすべてに目を通した: Solutions Guide・Migration Guide・Setup Guide・Usage Guide・Custom Automations・Configuration・Experimental Features・Cloud Providers・Capabilities & Limitations・Security・FAQ。うち`docs/solutions.md`(599行、自動化パターン集)は個別レシピの列挙が中心で、11軸に新規事実を追加する固有の仕様記述は見当たらなかったため上記の行には未反映(内容はexamples配下のワークフロー例の説明であり、他docsで既出のinputsの組み合わせにとどまる)
- `action.yml`のinputs全39キー・outputs全6キーは軸2・軸5の行で全件列挙済み(未言及キーは無い)
- 網羅性パスで新たに追加した行: 軸1の`workflow_dispatch`「coming soon」注記、軸2の`branch_name_template`/`display_report`/`show_full_output`のdocs不掲載、軸5の`skipped_due_to_workflow_validation_mismatch`/`contains_trigger`という非公開出力の存在、軸7の認証方式ごとの分類スキップ差異、軸9のexecution_file末尾要素依存の脆さ
- 公開ソースに現れる状態文言のうち、`src/entrypoints/run.ts`のインストール関連ログ(`Installing Claude Code v{version}...`、`Installation attempt {n}...`、`Claude Code installed successfully`、`Installation failed, retrying...`)は出力パターン表に未収録だったため、ここに追記して処置する: これらはジョブログにのみ現れるインストールフェーズの進捗文言であり、GitHub Actionsのジョブログ(面: ジョブログ)、B等級、2026-08-15確認、状態は確認済み(`src/entrypoints/run.ts` 68-116行目)
- `base-action/src/token.ts`(実体は`src/github/token.ts`)の`App token exchange failed: {status} {statusText} - {message}`というエラーログ文言も出力パターン表に未収録だったため追記して処置する: ワークフロー検証エラー以外の理由でAppトークン交換が失敗した場合のジョブログ、B等級、2026-08-15確認、確認済み(`src/github/token.ts` 138-142行目)
