# GitHub Copilot code review 仕様台帳

調査対象は GitHub Copilot code review(プルリクエストの自動/手動コードレビュー機能)の公開仕様。
一次情報は `docs.github.com`(GitHub Docs)、`github.blog/changelog`(GitHub 公式 Changelog)、
GitHub REST API リファレンス、および第三者の公開リポジトリでの実測(`gh api`)。

## 等級の凡例

| 等級 | 定義 |
| --- | --- |
| A | 公式ドキュメントを一次情報として確認した(記載の有無は状態列が示す) |
| A2 | **認証必須のベンダー公式画面(製品面)**を一次情報として確認した。散文の公式ドキュメントではないが、ベンダー自身が提示する面であり、そこに現れる選択肢・指標が存在すること自体は製品の仕様である。**ログインが必要なため第三者が追試できない**点で `A` と区別する(**本単位には該当行が無い**) |
| B | API仕様・設定スキーマ・公開ソースの定義を一次情報として確認した(観測はここに含めない) |
| C1 | 我々の環境での実測(本調査では対象外。空) |
| C2 | 第三者の公開リポジトリでの実測 |
| D | **一次情報で確立していない**(推測・未確認、および公式ドキュメント・機械可読定義・実測のいずれにも当たらない二次情報。`(D, 確認済み)` は「その情報源には当たったが、情報源が権威的でない」を意味する。種別は出典欄を見る) |

## 出典欄の略記

台帳内で繰り返し引用する観測対象・検索範囲を一度だけ定義する。台帳の各行はこの略記を使ってよい。
略記の展開先はこの節で一意に定まるため、行を単独で取り出しても本節と照合すれば検証できる
(「前の行を指す」参照ではなく、文書内で一意に定義された略記)。

| 略記 | 指す先 | 取得日 |
| --- | --- | --- |
| `OpenAPI` | <https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json> (12.9MB。`main` ブランチのため内容は時点依存) | 2026-08-16 |

略記の後ろは、そのドキュメント内のパス(例: `components.schemas.repository-rule-copilot-code-review.description`)を指す。

観測(C2)対象のPR:

- `[DB214]` = <https://github.com/dancing-bear-show/dancing-bear/pull/214> — public、個人名義のGitHub
  Organization配下の単一リポジトリ(社内組織的な形跡は見られない)。観測日2026-08-15。Copilotレビューの
  `submitted_at` は2026-08-14T17:22:13Z。リポジトリのruleset設定(自動レビュー有無)は非公開のため文脈不明。
- `[HBT10215]` = <https://github.com/chenrui333/homebrew-tap/pull/10215> — public、個人リポジトリ
  (Homebrewの非公式tap)。観測日2026-08-15。レビュー `submitted_at` は2026-08-14T17:21:41Z。GitHub
  Actionsを多用している(check-runs多数)ことは確認できたが、ruleset設定自体は非公開のため文脈不明。
- `[DHC8367]` = <https://github.com/deephaven/deephaven-core/pull/8367> — public、OSS財団配下の
  組織リポジトリ(Deephaven Data Labs / Linux Foundationプロジェクト)。観測日2026-08-15。レビュー
  `submitted_at` は2026-08-14T17:21:10Z。ruleset設定は非公開のため文脈不明。
- `[MAS5671]` = <https://github.com/music-assistant/server/pull/5671> — public、組織リポジトリ
  (Music Assistant、OSSプロジェクト)。観測日2026-08-15。レビュー `submitted_at` は
  2026-08-14T17:21:26Z。ruleset設定は非公開のため文脈不明。
- `[LFSX66]` = <https://github.com/FerrLabs/LFSX/pull/66> — public、組織リポジトリ。観測日2026-08-15。
  quota超過メッセージのレビュー。check-runsは同commitに15件存在(actionlint等のCI多数)。ruleset設定は
  非公開のため文脈不明。
- `[FC387]` = <https://github.com/theFactoryHQ/factory-careers/pull/387> — public、組織リポジトリ。
  観測日2026-08-15。quota超過メッセージのレビュー。check-runsは同commitに28件存在(観測時点の値。件数は増減する)(Playwright等のCI
  多数)。ruleset設定は非公開のため文脈不明。
- `[DBV1]` = <https://github.com/mostafa-html/database_viewer/pull/1> — public、個人リポジトリ。
  観測日2026-08-15。quota超過メッセージのレビュー。同commitのcheck-runs総数は0件(このリポジトリ自体が
  GitHub Actionsをほぼ使っていないと見られ、check-run不在がCopilot固有の挙動かの参考にはならない)。
  ruleset設定は非公開のため文脈不明。
- `[EVITA1420]` = <https://github.com/FgForrest/evitaDB/pull/1420> — public、組織リポジトリ(evitaDB、
  OSSプロジェクト)。観測日2026-08-15。quota超過メッセージのレビュー。同commitのcheck-runsは
  2026-08-16の再取得時点で7件(CodeQL等)存在(**件数は観測時点の値であり増減する**)。
  ruleset設定は非公開のため文脈不明。
- `[COE25]` = <https://github.com/coe-management-system/coe-management-system/pull/25> — public、
  組織リポジトリ。観測日2026-08-15。行数上限超過メッセージのレビュー。ruleset設定は非公開のため文脈不明。
- `[KRIA1]` = <https://github.com/ObaidGits/kria-ai/pull/1> — public、個人リポジトリ。観測日2026-08-15。
  ファイル数上限超過メッセージのレビュー。ruleset設定は非公開のため文脈不明。

`[QUOTA-LIST]` = quota超過の定型文言 `Copilot was unable to review this pull request because the
user who requested the review has reached their quota limit.` を完全一致で確認した15件の独立した
公開リポジトリのPR(いずれもpublic、observed 2026-08-14の17時台UTC、各リポジトリのruleset設定は非公開
のため文脈不明。運営主体は個人・組織が混在):

- <https://github.com/mostafa-html/database_viewer/pull/1>(`[DBV1]` と同一)
- <https://github.com/FgForrest/evitaDB/pull/1420>(`[EVITA1420]` と同一)
- <https://github.com/HybridAIOne/hybridclaw/pull/1401>
- <https://github.com/FerrLabs/LFSX/pull/66>(`[LFSX66]` と同一)
- <https://github.com/muratarslan35/ims-performance-manager/pull/41>
- <https://github.com/Johan621/Pyrintu/pull/29>
- <https://github.com/Medora-Health-System/medora-s/pull/120>
- <https://github.com/xiaoqianran/modal-ashleykza-comfyui/pull/45>
- <https://github.com/theFactoryHQ/factory-careers/pull/387>(`[FC387]` と同一)
- <https://github.com/FerrLabs/LFSX/pull/65>
- <https://github.com/DeliciousBuding/metapi-go/pull/690>
- <https://github.com/logos-co/logos-evm-wallet-ui/pull/24>
- <https://github.com/logos-blockchain/logos-blockchain-ui/pull/58>
- <https://github.com/logos-co/counter/pull/4>
- <https://github.com/logos-co/logos-module-builder/pull/198>

公式ドキュメントの検索範囲(未文書化の根拠):

- `[SCOPE-USECR]` = <https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review>
  全文と <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review>
  全文を確認(2026-08-15)。検索語: "twice", "again", "queue", "draft" を含め通読。両ページとも散文の
  解説ページ(開いた情報源)であり、不在は「文書化されていない」にとどまる。
- `[SCOPE-RATELIMIT]` = <https://docs.github.com/en/copilot/how-tos/troubleshoot/rate-limits-for-github-copilot>
  全文と <https://docs.github.com/en/copilot/concepts/usage-limits> 全文を確認(2026-08-15)。検索語:
  "code review", "skip", "status" を含め通読。両ページとも散文の解説ページ(開いた情報源)であり、
  不在は「文書化されていない」にとどまる。
- `[SCOPE-LANG]` = <https://docs.github.com/en/copilot/concepts/code-review/code-review> 全文と
  <https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review>
  全文を確認(2026-08-15)。検索語: "language", "supported" を含め通読。両ページとも散文の解説ページ
  (開いた情報源)であり、不在は「文書化されていない」にとどまる。
- `[SCOPE-BILLING]` = <https://docs.github.com/en/rest/billing/usage> 全文、
  <https://docs.github.com/en/copilot/concepts/billing/copilot-requests> 全文、
  <https://docs.github.com/en/copilot/concepts/usage-limits> 全文を確認(2026-08-15)。検索語:
  "remaining", "balance", "individual" を含め通読。3ページとも散文の解説ページ/APIリファレンスの
  解説文(開いた情報源)であり、不在は「文書化されていない」にとどまる。
- `[SCOPE-LARGE-PR]` = <https://github.blog/changelog/2025-07-02-copilot-code-review-better-handling-of-large-pull-requests/>
  全文を確認(2026-08-15)。検索語: "limit", "maximum", "files", "lines" を含め通読。changelog記事
  (開いた情報源)であり、不在は「文書化されていない」にとどまる。

## 情報源の独立性について(較正で判明)

**`docs.github.com/en/rest/**` のエンドポイント本文と `docs.github.com/en/webhooks/webhook-events-and-payloads` は、`github/rest-api-description` の OpenAPI から自動生成されている**(`github/docs` の `src/rest/README.md` および `content/rest/**` の frontmatter `autogenerated: rest`)。この範囲を引く行は、散文と機械可読定義の**独立した2つの裏付けではない**。

独立している情報源: `/en/copilot/**` の概念・手順ページ、`/en/pull-requests/**`、`github.blog/changelog`、`/en/rest/using-the-rest-api/*`(ガイド、人手)。

## 台帳

| 軸 | 主張 | 出典(URL・参照先) | 等級 | 確認日 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 1 | 手動起動は「PRのReviewersサイドバーでCopilotの横のRequestをクリック」。通常30秒未満で完了する | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 1 | API経由では `copilot-pull-request-reviewer[bot]` をreviewerとしてリクエストすることでCopilotレビューを起動できる | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 1 | 自動レビューの発火事象は「PRをOpenとして作成」「DraftからOpenへ初めて切り替え」の2つが基本 | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review) | A | 2026-08-15 | 確認済み |
| 1 | 自動レビューの追加オプションとして「新しいpushのたびにレビュー」を有効化できる(`review_on_push`) | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review); [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules) | A | 2026-08-15 | 確認済み |
| 1 | 自動レビューの追加オプションとして「Draft PRのままレビュー」を有効化できる(`review_draft_pull_requests`) | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review); [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules) | A | 2026-08-15 | 確認済み |
| 1 | 自動レビュー未設定の場合、PRへの新規push後にCopilotは自動で再レビューしない | [Using GitHub Copilot code review](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review) | A | 2026-08-15 | 確認済み |
| 1 | 手動での再レビューはReviewersメニューのCopilot名横の更新(refresh)アイコンから行う | [Using GitHub Copilot code review](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review) | A | 2026-08-15 | 確認済み |
| 1 | PRコメント中で `@copilot` にメンションすると、Copilotが提示した提案コードをCopilot coding agentへハンドオフし、stacked pull request上に自動適用する。ただしこれは「新規レビューの起動」ではなく「既存の提案の適用ハンドオフ」として説明されている | [New public preview features in Copilot code review: AI reviews that see the full picture](https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/) | A | 2026-08-15 | 確認済み |
| 1 | PRコメントで `@copilot review` のように明示的にレビュー実行そのものを再依頼できるかは、本調査で確認した公式ページには明記が無い(上記行の `@copilot` メンションはハンドオフ専用として説明されている) | `[SCOPE-USECR]`。加えて <https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/> 全文(2026-08-15)を確認したが、レビュー再依頼としての `@copilot review` 文言は無い | A | 2026-08-15 | 公式に未文書化 |
| 1 | 再レビュー時、解決(resolve)済みやdownvote済みの過去コメントを再掲することがある | [Using GitHub Copilot code review](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review) | A | 2026-08-15 | 確認済み |
| 1 | 手動リクエストを短時間に2回連続で行った場合に2回目が発火するか(冪等性)は、GitHub Docsに記載がない | `[SCOPE-USECR]` | A | 2026-08-15 | 公式に未文書化 |
| 1 | Draft PR状態で手動でRequestを押した場合(自動review-on-draft未設定時)の挙動は、GitHub Docsに明記が無い | `[SCOPE-USECR]` | A | 2026-08-15 | 公式に未文書化 |
| 1 | レビュー effort level(Lite/Balanced)はレビュー依頼のたびに選択でき、選択はリポジトリ/組織既定に影響しない | [Copilot code review effort levels are generally available](https://github.blog/changelog/2026-08-07-copilot-code-review-effort-levels-are-generally-available/) | A | 2026-08-15 | 確認済み |
| 1 | GitHub Code Quality機能が自動生成していた「Copilotを自動レビュアーに追加するruleset」は2026-08-07付で既定動作を停止(ユーザーの明示選択に戻した) | [GitHub Code Quality no longer adds Copilot as a reviewer](https://github.blog/changelog/2026-08-07-github-code-quality-no-longer-adds-copilot-as-a-reviewer/) | A | 2026-08-15 | 確認済み |
| 1 | 発火事象「DraftからOpenへの切り替え」に対応するissue/PRタイムラインの事象種別は `ready_for_review`(「pull requestがdraftからready for reviewへ変換された」)。この事象自体はCopilot固有ではなく汎用のPRタイムライン事象である | [Issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types) | B | 2026-08-15 | 確認済み |
| 1 | GitHub CLI(v2.88.0以降)から `gh pr edit --add-reviewer @copilot` または `gh pr create` のreviewer選択でCopilotレビューを手動起動できる。対話モードでは他のteammateと並んでCopilotが選択肢に出る | [Request Copilot code review from GitHub CLI](https://github.blog/changelog/2026-03-11-request-copilot-code-review-from-github-cli/) | A | 2026-08-15 | 確認済み |
| 2 | リポジトリ設定でのオン/オフ: Settings > Rules > Rulesets > 新規rulesetのbranch ruleで「Automatically request Copilot code review」を選択 | [Configuring automatic code review by GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-automatic-review) | A | 2026-08-15 | 確認済み |
| 2 | 組織設定でも同じrulesetルールを設定でき、対象リポジトリをfnmatch形式のinclude/excludeパターンで絞り込める | [Configuring automatic code review by GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-automatic-review) | A | 2026-08-15 | 確認済み |
| 2 | 個人設定: プロフィールメニュー > Copilot settings > 「Automatic Copilot code review」ドロップダウンで有効化できる | [Configuring automatic code review by GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-automatic-review) | A | 2026-08-15 | 確認済み |
| 2 | public preview段階の新機能(2025-10-28時点でのagentic tool calling等)は、Copilot Pro/Pro+ユーザーには既定で有効。Copilot Business/Enterpriseユーザーは組織ポリシー経由のopt-inが必要 | [New public preview features in Copilot code review: AI reviews that see the full picture](https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/) | A | 2026-08-15 | 確認済み |
| 2 | **組織のポリシー画面に `Code review` という項目は無い。**(台帳が以前置いていた6項目の列挙 `Copilot Features and Models` / `MCP Servers` / `Third-party Coding Agents` / `Cloud Agent Configuration` / `Preview Features` / `User Feedback Collection` は現在のページ見出しと一致しないため差し替えた。)`curl` で再取得した現在のページの見出し(h2)は `Enabling Copilot features and models in your organization` / `Enabling or disabling third-party coding agents in your repositories` / `Opting in to previews or feedback` の3つのみで、MCPサーバーの利用可否は1つ目の見出し内の注記(`The MCP servers in Copilot policy`)として触れられるだけで独立した見出しではない。code review 専用の項目もチーム単位の設定も現れない | 検索範囲: <https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-organization/manage-policies> の記事本文(`id="article-contents"`)を `curl` で再取得し、検索語 `Code review` / `per-team` / `spending limit` / `premium request` で走査(記事本文外のサイトナビゲーションには `Code review` という無関係なリンクが多数あるため、本文部分に絞って確認した)。情報源の性質: **設定項目を列挙する形式のページ(網羅的)での不在**のため「この階層にはその項目が存在しない」と言える | A | 2026-08-15 | 公式に未文書化 |
| 2 | Copilot code review の可否を制御するポリシーは**エンタープライズ階層**にあり、値域は `Enabled everywhere` と `Let organizations decide` の2値。組織階層で Enabled/Disabled を選ぶ形ではない | <https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/enable-copilot-code-review> | A | 2026-08-16 | 確認済み |
| 2 | rulesetのルール種別 `copilot_code_review` のパラメータは `review_draft_pull_requests`(boolean)と `review_on_push`(boolean)の2つのみで、effort levelはこのスキーマに含まれない。**このrule自体の説明文は「作者がCopilot code reviewを利用でき、かつpremium requestのquotaが上限に達していない場合に」自動レビューを要求すると明記している**("Request Copilot code review for new pull requests automatically if the author has access to Copilot code review and their premium requests quota has not reached the limit.")。この文は生成ページのraw HTMLにも存在する(`curl` で直接取得しgrepして確認、WebFetchの要約には現れなかった)。台帳への転記時に条件部分を落としていたため補った。自動レビューが発火しない場合の切り分けに、この2条件(アクセス権・quota)を要確認 | OpenAPI `components.schemas.repository-rule-copilot-code-review.description`。生成ページ [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules) にも同じ説明文が載っている | B | 2026-08-16 | 確認済み |
| 2 | effort levelの組織既定値は ruleset APIではなく Organization Settings > Copilot > Copilot code review の別画面で設定する | [Copilot code review effort levels are generally available](https://github.blog/changelog/2026-08-07-copilot-code-review-effort-levels-are-generally-available/) | A | 2026-08-15 | 確認済み |
| 2 | 2026-06-12以降、Copilot code reviewはリポジトリ/組織/エンタープライズ単位のcontent exclusion設定(除外パス)を尊重するようになった | [Copilot code review: New configurations and controls](https://github.blog/changelog/2026-06-12-copilot-code-review-new-configurations-and-controls/) | A | 2026-08-15 | 確認済み |
| 2 | 組織管理者はCopilot code review用の既定runner(self-hosted/large runner)を組織全体に強制でき、リポジトリ側の個別設定を上書きするロック設定も可能 | [Copilot code review: New configurations and controls](https://github.blog/changelog/2026-06-12-copilot-code-review-new-configurations-and-controls/) | A | 2026-08-15 | 確認済み |
| 2 | premium request の予算(budget)は user / organization / cost center / enterprise の4階層で設定できる。**ただしこれは premium request 全般の機能であって、Copilot code review 専用の支出上限ではない** | <https://docs.github.com/en/copilot/concepts/billing/budgets-for-usage-based-billing>: "You have budget controls at the user, organization, cost center, and enterprise levels, each serving a different purpose." | A | 2026-08-16 | 確認済み |
| 2 | モデル切り替えは非対応と明記されている(「変更すると信頼性・UX・レビュー品質を損なう可能性が高い」) | [Responsible use of GitHub Copilot code review](https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review) | A | 2026-08-15 | 確認済み |
| 2 | Copilot code review でカスタム指示を使うかどうかは**リポジトリ設定**(Settings > Copilot > Code review)でオン/オフでき、既定はオン。**ただし「個人設定ではない」とは言えない** —— 同じページの Prerequisites 節に "For Copilot code review, your personal choice of whether to use custom instructions must be set to enabled. This is enabled by default." という記述があり、**個人側のトグルとリポジトリ側のトグルの両方が存在する** —— "Custom instructions are enabled for Copilot code review by default but you can disable, or re-enable, them in the repository settings on GitHub.com." | [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions) | A | 2026-08-15 | 確認済み |
| 2 | Copilot Memoryはユーザー単位で有効化される(リポジトリ単位ではない)。個人プランは既定で有効、組織/エンタープライズプランは管理者が先に有効化した上でユーザーがopt-outできる | [About GitHub Copilot Memory](https://docs.github.com/en/copilot/concepts/agents/copilot-memory) | A | 2026-08-15 | 確認済み |
| 2 | リポジトリのブランチ保護ルール一覧を網羅的に列挙する「Available rules for rulesets」ページ(16種類のルールタイプを列挙。**ただしこのページは網羅的ではない** —— OpenAPI の `components.schemas.repository-rule.oneOf` は23種を定義しており、同ページは7種を落としている。したがって**このページでの不在は「存在しない」を意味しない**)には、Copilot code reviewのルールタイプが含まれていない。Copilotのruleset連携はCopilotドキュメントセット側(軸2の他行、および軸11のREST APIスキーマ)でのみ説明されている | <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>(2026-08-15、全16項目のルール一覧を確認。列挙されたルールタイプは Restrict creations / Restrict updates / Restrict deletions / Require linear history / Require deployments to succeed before merging / Require signed commits / Require a pull request before merging / Require status checks to pass before merging / Block force pushes / Require code scanning results / Require code quality results / Restrict code coverage / Restrict file paths / Restrict file path length / Restrict file extensions / Restrict file size) | A | 2026-08-15 | 確認済み |
| 2 | 組織のCopilotポリシー画面(Organization Settings > Copilot > Policies)には、code review以外にも「MCP servers in Copilot」のようなポリシーがあり、MCPサーバーの利用可否を組織単位で制御する。この設定はcode reviewが既定で使うMCPサーバー(軸4参照)の利用可否にも影響しうるが、code review専用ポリシーとの相互作用は当該ページに明記が無い | <https://docs.github.com/enterprise-cloud@latest/copilot/managing-copilot/managing-github-copilot-in-your-organization/setting-policies-for-copilot-in-your-organization/managing-policies-for-copilot-in-your-organization>(2026-08-15、Policies節を確認。個別ポリシーの完全な列挙はページ内になく「MCP servers in Copilot」のみ具体名で言及) | A | 2026-08-15 | 確認済み |
| 2 | リポジトリ単位のrunner設定は `.github/workflows/copilot-code-review.yml` の `runs-on` 属性で指定する。このファイルが無い場合は `copilot-setup-steps.yml` にフォールバックする | [Configuring runners for GitHub Copilot code review](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-runners) | A | 2026-08-15 | 確認済み |
| 2 | 組織単位のrunner設定は Organization Settings > Copilot > Runner type から「Standard GitHub runner」または「Labeled runner」を選択する。「Allow repositories to customize the runner type」を無効化すると、リポジトリ側の個別設定を禁止できる | [Configuring runners for GitHub Copilot code review](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-runners) | A | 2026-08-15 | 確認済み |
| 3 | Copilot code reviewはGitHub.com上でPRのdiffとメタデータをレビューする | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/code-review/code-review) | A | 2026-08-15 | 確認済み |
| 3 | agentic な "full project context gathering" によりリポジトリ全体を解析し、diffの文脈をより正確に把握するとされる | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/code-review/code-review) | A | 2026-08-15 | 確認済み |
| 3 | カスタム指示・agent instructions・agent skillsは「head branch(変更側のブランチ)」から読む。base branchからは読まない | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review) | A | 2026-08-15 | 確認済み |
| 3 | effort level=Balancedを選ぶと、より高い推論能力のモデルへルーティングされ複雑なロジック・セキュリティ重要箇所・サービス横断変更をより深く解析する。Liteは既定の標準的レビュー | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review) | A | 2026-08-15 | 確認済み |
| 3 | 既定の除外ファイル(下記軸8参照)はレビュー対象にならない。**ただし「effort level や ruleset 設定に関わらず」という独立性は出典に書かれていない** —— 引用先ページは除外ファイルの列挙と「除外されたファイルはレビュー対象にならない」しか述べておらず、`effort level` にも `ruleset` にも言及が無い(raw HTML 全文で確認) | [Files excluded from GitHub Copilot code review](https://docs.github.com/en/copilot/reference/review-excluded-files) | A | 2026-08-15 | 確認済み |
| 3 | 2025-10-28付でpublic preview公開された「Rich Context with Tool Calling」により、agentic tool callingでコード・ディレクトリ構造・参照関係を能動的に収集する(「full project context gathering」という表現は、概念ページとこのchangelogの両方に現れる) | [New public preview features in Copilot code review: AI reviews that see the full picture](https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/) | A | 2026-08-15 | 確認済み |
| 3 | 同changelogは「CCRはまもなくCodeQLと主要linter(ESLintから開始)を統合し、意味解析とルールベースのチェックを組み合わせる」とも述べている。一方、別ページ(軸8参照)は「GitHub Code QualityはCopilot code reviewとは別製品」と明記しており、Copilot code review自体がCodeQL/ESLint検出を内包するのか、Code Qualityという別製品と連携するだけなのかは、2ページの記述だけでは判別できない | [New public preview features in Copilot code review: AI reviews that see the full picture](https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/)、[GitHub Code Quality](https://docs.github.com/en/code-security/concepts/code-quality/code-quality) | A | 2026-08-15 | 確認済み |
| 3 | 2026-06-25以降、コード探索にCopilot CLI/SDK由来の `grep`/`rg`/`glob`/`view` ツールを使うようになり、独自ツールより的確に「重要なコードを素早く見つける」ようになったとされる | [Copilot code review: Analysis depth and efficiency updates](https://github.blog/changelog/2026-06-25-copilot-code-review-analysis-depth-and-efficiency-updates/) | A | 2026-08-15 | 確認済み |
| 3 | Copilot code reviewは「Copilot Memory」のうちリポジトリレベルの事実(コーディング規約・アーキテクチャ上の決定・ビルドコマンド等)のみを参照する。ユーザーレベルの個人的な好みはレビューには適用されない | [About GitHub Copilot Memory](https://docs.github.com/en/copilot/concepts/agents/copilot-memory) | A | 2026-08-15 | 確認済み |
| 3 | あるPRのレビューで発見された事実(fact)は、同じリポジトリの以降のレビューでも再利用されうる(レビューをまたいだ記憶) | [About GitHub Copilot Memory](https://docs.github.com/en/copilot/concepts/agents/copilot-memory) | A | 2026-08-15 | 確認済み |
| 4 | `.github/copilot-instructions.md` でリポジトリ全体向けのレビュー観点(コーディング規約・レビュー基準など)を指定できる | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 4 | `.github/instructions/NAME.instructions.md` で、frontmatterの `applyTo` にglobパターンを指定してパス単位のレビュー観点を指定できる。複数パターンはカンマ区切り | [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/configure-coding-guidelines) | A | 2026-08-15 | 確認済み |
| 4 | `AGENTS.md` は特定のカスタムagent向けの指示を書く場所として案内されている | [Using custom instructions to unlock the power of Copilot code review](https://docs.github.com/en/copilot/tutorials/customize-code-review) | A | 2026-08-15 | 確認済み |
| 4 | 複数種類のカスタム指示が同時に適用される場合の優先順位は「個人指示 > リポジトリ指示 > 組織指示」の順 | [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions) | A | 2026-08-15 | 確認済み |
| 4 | パス指定の指示ファイルとリポジトリ全体向けの指示ファイルが同時に対象ファイルへ適用される場合、両方が併用される(どちらか一方に上書きされるのではない) | [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions) | A | 2026-08-15 | 確認済み |
| 4 | `.github/skills` に置いたagent skillsをレビュー時に読む | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 4 | リポジトリ設定で構成したMCPサーバーをレビュー時に利用できる。GitHub MCP serverとPlaywright MCP serverは既定で有効 | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 4 | MCPサーバー設定はリポジトリ単位で、Copilot cloud agentとCopilot code reviewが同一設定を共有する。「Allow Copilot to use MCP tools when reviewing pull requests」というトグルにより、cloud agentは有効のままcode reviewだけMCPツール利用を無効化できる | [Configure MCP servers for your repository](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers) | A | 2026-08-15 | 確認済み |
| 4 | Copilot cloud agentとCopilot code reviewはMCPの「tools」のみサポートし、resourcesやpromptsは非対応。OAuth認証を要するremote MCPサーバーにも非対応 | [Configure MCP servers for your repository](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers) | A | 2026-08-15 | 確認済み |
| 4 | 1つの指示ファイルは目安1,000行までを推奨。それを超えると応答品質が劣化しうる | [Using custom instructions to unlock the power of Copilot code review](https://docs.github.com/en/copilot/tutorials/customize-code-review) | A | 2026-08-15 | 確認済み |
| 4 | 従来あった「指示ファイルは4,000文字までしか読まない」という上限は2026-06-12付で撤廃された | [Copilot code review: New configurations and controls](https://github.blog/changelog/2026-06-12-copilot-code-review-new-configurations-and-controls/) | A | 2026-08-15 | 確認済み |
| 4 | 旧「coding guidelines」機能(Copilot Enterprise向けprivate preview)は2025-08-06にplayground非推奨化、2025-09-03に完全非推奨化され、`copilot-instructions.md`に一本化された | [Upcoming deprecations and changes to Copilot code review](https://github.blog/changelog/2025-07-18-upcoming-deprecations-and-changes-to-copilot-code-review/) | A | 2026-08-15 | 確認済み |
| 5 | レビューはPRの「review」オブジェクトとインラインコメントとして投稿され、人間レビュアーのコメントと同様に扱える(reaction・返信・resolve・hide可) | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 5 | Copilotのレビューは常に「Comment」であり「Approve」「Request changes」にはならない。必須レビュー数にはカウントされず、マージもブロックしない | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 5 | reviewer登録APIで指定するログイン名は `copilot-pull-request-reviewer[bot]` | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 5 | `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews` はreview一覧を返す。フィールドは `id`, `state`, `body`, `user.login`, `submitted_at`, `commit_id`, `author_association` など | [REST API endpoints for pull request reviews](https://docs.github.com/en/rest/pulls/reviews) | B | 2026-08-15 | 確認済み |
| 5 | review単位のインラインコメントは `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments`、PR全体のインラインコメントは `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` の別エンドポイントで取得する | [REST API endpoints for pull request reviews](https://docs.github.com/en/rest/pulls/reviews) | B | 2026-08-15 | 確認済み |
| 5 | review オブジェクトの `user.login` は `copilot-pull-request-reviewer[bot]` である(`gh api repos/dancing-bear-show/dancing-bear/pulls/214/reviews` で確認、review id 4939680421) | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| 5 | 一方、同一レビューのインラインコメントオブジェクトの `user.login` が `Copilot`(角括弧`[bot]`なし)で、review単位と表記が異なっていた実例がある(**単一のPRでの観測であり、製品の一般規則としては確認していない**)(`gh api repos/dancing-bear-show/dancing-bear/pulls/214/reviews/4939680421/comments` で確認) | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| 5 | login表記が異なる2オブジェクトは同一の `id: 175728472` / `node_id: BOT_kgDOCnlnWA` を持つ。**観測した範囲で一致していたのは `login` ではなく `id`/`node_id` だった。ただし「安定した識別子である」とは言えない** —— GitHub の id/node_id が経時的に不変であることは GitHub 側の仕様であって、単一時点の一致からは導けない(review側 `user` と review-comment側 `user` を突合して確認) | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| 5 | レビュー完了時に head commit へ GitHub Actions の check-run が作成された実例がある(**単一のPRでの観測であり、製品の一般規則としては確認していない**)。その実例の check-run(`name: copilot-pull-request-reviewer`, `app.slug: github-actions`)が作成され、`status: completed` / `conclusion: success` を持つ(`gh api repos/chenrui333/homebrew-tap/commits/6b5bf1e95a8ca24028e2146181be95788ddb4c3d/check-runs` で確認) | `[HBT10215]` | C2 | 2026-08-15 | 確認済み |
| 5 | 提案コード変更(suggested change)はフェンス付きコードブロックとして提示され、ワンクリックで適用できるとされる。今回のC2サンプルでは実例を再現できなかった(0件) | [Using GitHub Copilot code review on GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | A | 2026-08-15 | 確認済み |
| 5 | 2026-05-12以降、インラインコメントに `High`/`Medium`/`Low` の重大度ラベルが付き、コメント右上に表示されるとされる。本調査のC2実測で観測した `[CRITICAL]` という接頭辞(`[MAS5671]`、軸9出力パターン表参照)とは表記が一致せず、同一機構なのか別機構(旧仕様、または本文中の接頭辞と右上バッジが別々に存在する)なのかは未確認 | [Copilot code review: Comment experience improvements](https://github.blog/changelog/2026-05-12-copilot-code-review-comment-experience-improvements/) | A | 2026-08-15 | 確認済み |
| 5 | 2026-05-12以降、大規模PRで似た指摘をグループ化し、重複感を減らす「grouped comments」機能がある | [Copilot code review: Comment experience improvements](https://github.blog/changelog/2026-05-12-copilot-code-review-comment-experience-improvements/) | A | 2026-08-15 | 確認済み |
| 6 | quota超過などでレビューが失敗した場合でも、reviewオブジェクトの `state` は正常時と同じ `COMMENTED` になる。`state` フィールド単体では成功/失敗を判別できない(`[QUOTA-LIST]` の15件全PRの `pulls/{n}/reviews` を `gh api` で確認し、正常完了レビューである `[DB214]`/`[HBT10215]` と同一の `state` 値であることを突合) | `[QUOTA-LIST]`、`[DB214]`、`[HBT10215]` | C2 | 2026-08-15 | 確認済み |
| 6 | 「成功」「指摘0件」「quota超過でスキップ」を区別する専用の構造化フィールド(webhookイベント種別やAPIフィールド)への言及は`[SCOPE-RATELIMIT]`(トラブルシュート・usage limitsの解説ページ)には無い。**この2ページは散文の解説ページであり、GitHubのwebhook/APIスキーマを網羅的に確認したものではないため、フィールドの不在そのものを保証しない**(文書化されていないにとどまる)。本調査でC2実測により確認できている判定手段は`body`本文の文言のみである(直上の行の`state`一致の実測、および出力パターン表を参照) | `[SCOPE-RATELIMIT]`。検索語: "code review", "skip", "status"。両ページとも散文の解説ページ(開いた情報源)であり、不在は「文書化されていない」にとどまる。C2の裏付けは`[QUOTA-LIST]`・`[DB214]`・`[HBT10215]`(直上の行) | A | 2026-08-16 | 公式に未文書化 |
| 6 | 正常完了時はcheck-run `copilot-pull-request-reviewer` が `success` で作られる一方、**quota超過**で失敗した場合に同名の check-run が作られなかった実例が2件ある(**サイズ上限超過については check-run を確認した観測が無い。2種類の失敗理由を1つに束ねない**)(CIの盛んな他リポジトリでも0件)。`gh api repos/{owner}/{repo}/commits/{sha}/check-runs` で各head shaのcheck-runs総数・名称を確認した | `[LFSX66]`(15件のcheck-runあり、Copilot分0件)、`[FC387]`(28件のcheck-runあり(観測時点の値。件数は増減する)、Copilot分0件) | C2 | 2026-08-15 | 確認済み |
| 6 | `pull_request_review` webhookイベントの `action` フィールドは `submitted`/`edited`/`dismissed` の3値を取る(汎用のPRレビューwebhookで、Copilot固有ではない) | <https://docs.github.com/en/webhooks/webhook-events-and-payloads>(2026-08-15、pull_request_review イベントの action 列挙を確認) | B | 2026-08-15 | 確認済み |
| 6 | **同一PRに Copilot のレビューオブジェクトが複数積み上がる。**`[DB214]` で6件、`[MAS5671]` で4件、`[EVITA1420]` で2件を観測。つまり再レビューは既存レビューの更新ではなく**新規レビューオブジェクトの追加**として現れる | `[DB214]` / `[MAS5671]` / `[EVITA1420]` の `GET /repos/{owner}/{repo}/pulls/{n}/reviews` を2026-08-16に再取得し、`copilot-pull-request-reviewer[bot]` 著者のレビュー数がそれぞれ 6 / 4 / 2 であることを確認 | C2 | 2026-08-16 | 確認済み |
| 6 | 再レビューが `pull_request_review` webhook 上で `submitted` として届くか `edited` として届くかは未調査。**ただし上記のとおりレビューオブジェクト自体は追加されるため、`/pulls/{n}/reviews` の件数増分では再レビューを検知できる** | 未調査。追試手段: `review_on_push` を有効化したリポジトリでpushを2回行い webhook ペイロードを確認する | D | 2026-08-16 | 未調査 |
| 6 | check-runの `status` フィールドが取りうる値は `queued`/`in_progress`/`completed`/`waiting`/`requested`/`pending` の6種、`conclusion` フィールドは `success`/`failure`/`neutral`/`cancelled`/`skipped`/`timed_out`/`action_required`/`null` の8種(APIスキーマの列挙)。本調査でCopilotのcheck-run `copilot-pull-request-reviewer` について実際に観測できたのは `status: completed` / `conclusion: success` のみで、他の値(`failure`/`timed_out`等)が実際に使われるかは未確認 | [REST API endpoints for check runs](https://docs.github.com/en/rest/checks/runs) | B | 2026-08-15 | 確認済み |
| 7 | (レガシー課金、2026-06-01以前からの年間契約でPro/Pro+のみ対象)Copilot code review 1回でpremium requestを13消費する(model multiplier 13) | [Requests in GitHub Copilot (legacy)](https://docs.github.com/en/copilot/concepts/billing/copilot-requests) | A | 2026-08-15 | 確認済み |
| 7 | (現行課金、2026-06-01以降)1回のcode reviewは「AI Credits(トークン消費、使用モデルは非開示)」と「GitHub Actions minutes(agentic基盤の実行)」の2軸で課金される | [GitHub Copilot code review will start consuming GitHub Actions minutes on June 1, 2026](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/) | A | 2026-08-15 | 確認済み |
| 7 | Actions minutesはprivateリポジトリのみ消費し、publicリポジトリでは消費されない | [GitHub Copilot code review will start consuming GitHub Actions minutes on June 1, 2026](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/) | A | 2026-08-15 | 確認済み |
| 7 | Actions minutesは組織の既存Actionsプラン割当を消費し、超過分は標準料金。self-hosted runner・large runnerにも対応し、料金は標準GitHub-hosted runnerと異なる | [GitHub Copilot code review will start consuming GitHub Actions minutes on June 1, 2026](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/) | A | 2026-08-15 | 確認済み |
| 7 | プラン別AI Credits月額付与額(現行、2026-06-01〜): Pro=$10分、Pro+=$39分、Business=$19/ユーザー分(2026年6月〜8月のプロモ期間は$30)、Enterprise=$39/ユーザー分(同プロモ期間は$70) | [GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/) | A | 2026-08-15 | 確認済み |
| 7 | effort levelごとの想定コスト目安: Lite=約$0.05〜$1、Balanced=約$0.25〜$5(1レビューあたり) | [About GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review) | A | 2026-08-15 | 確認済み |
| 7 | 2026-06-25付の探索ツール変更(軸3参照)により「レビュー品質を保ったままCopilot code reviewのコストを約20%削減した」と明記されている | [Copilot code review: Analysis depth and efficiency updates](https://github.blog/changelog/2026-06-25-copilot-code-review-analysis-depth-and-efficiency-updates/) | A | 2026-08-15 | 確認済み |
| 7 | PR単位のCopilot code reviewはCopilot **Student**/Pro/Pro+/Max/Business/Enterpriseで利用可能(台帳が以前落としていた `Student` を追加。プラン比較表は7列で、Free列だけが「Only "Review selection" in VS Code」、Student以降の6列はすべて利用可能を示すチェックマーク)。Free プランのみVS Code内の「Review selection」のみ利用でき、PRレビューは対象外 | [Plans for GitHub Copilot](https://docs.github.com/en/copilot/get-started/plans) | A | 2026-08-15 | 確認済み |
| 7 | 変更ファイル数300、変更行数20,000という上限値は、公式ドキュメント本文には数値として明記されていない(数値は出力パターン表の `[COE25]`/`[KRIA1]` のC2観測でのみ確認) | `[SCOPE-LARGE-PR]` | A | 2026-08-15 | 公式に未文書化 |
| 7 | ユーザーのpremium request/AI Creditsのquotaが尽きた場合には、専用の拒否文言を持つレビューが投稿される(`[QUOTA-LIST]` の15件で文字列完全一致。逐語文字列は出力パターン表を参照)。**再試行・キューイングの有無、および投稿までの所要時間は出典からは判別できない**(拒否メッセージの観測だけでは、その後に不可視の再試行が行われていないことは示せない) | `[QUOTA-LIST]` | C2 | 2026-08-16 | 確認済み |
| 8 | 既定で除外されるファイル(抜粋): `.gitignore`, `package-lock.json`, `yarn.lock`, `requirements.txt`, `Gemfile.lock`, `Cargo.lock`, `go.sum` ほか多数の依存管理・ロックファイル。パターン除外: `**/*.svg`, `**/*.log`, `**/*.lock`, `**/node_modules/**/*`, `**/dist/**/*`, `**/*.min.js`, `**/*.d.ts`, `**/vendor/**/*`, `**/generated/**/*`, `**/bin/**/*` など。ただし `**/bin/**/*.rs` と SAP Commerce(Hybris)の `**/hybris/bin/custom/**` は例外的に対象に含める | [Files excluded from GitHub Copilot code review](https://docs.github.com/en/copilot/reference/review-excluded-files) | A | 2026-08-15 | 確認済み |
| 8 | self-hosted runnerを使う場合はUbuntu x64 Linux限定で、Actions Runner Controller(ARC)が唯一の公式サポート方式。ARC以外のself-hosted runnerは使用しないよう明記されている(セキュリティ上の理由) | [Configuring runners for GitHub Copilot code review](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-runners) | A | 2026-08-15 | 確認済み |
| 8 | Copilot code reviewは「GitHub Code Quality」(CodeQLによるルールベースの静的解析)とは別製品であり、Copilot code reviewの出力にCodeQLのルールベース検出結果は含まれない。両者は個別に有効化する | [GitHub Code Quality](https://docs.github.com/en/code-security/concepts/code-quality/code-quality) | A | 2026-08-15 | 確認済み |
| 8 | 「変更が大きい・複雑な場合は特に、すべての問題を検出できるとは限らない」と明記 | [Responsible use of GitHub Copilot code review](https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review) | A | 2026-08-15 | 確認済み |
| 8 | 「ハルシネーションのリスクがある。存在しない問題や誤解に基づく問題を指摘することがある」と明記 | [Responsible use of GitHub Copilot code review](https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review) | A | 2026-08-15 | 確認済み |
| 8 | 提案コードは「妥当に見えても意味的・構文的に正しくない場合があり、コメントで指摘した問題を正しく解決しない場合もある」と明記(原文は "The code generated may appear to be valid but may not actually be semantically or syntactically correct, or may not correctly resolve the problem identified in the comment." で、`or` で並ぶ2つ目の節「コメントで指摘した問題を正しく解決しない場合がある」を台帳が落としていたため補った) | [Responsible use of GitHub Copilot code review](https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review) | A | 2026-08-15 | 確認済み |
| 8 | 提案コードは「セキュリティ脆弱性や他の問題を含む場合がある」と明記 | [Responsible use of GitHub Copilot code review](https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review) | A | 2026-08-15 | 確認済み |
| 8 | 「特定のプログラミング言語やコーディングスタイルに偏る場合があり、不十分・不完全なフィードバックにつながりうる」と明記 | [Responsible use of GitHub Copilot code review](https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review) | A | 2026-08-15 | 確認済み |
| 8 | 「任意の言語のコードをレビューする」とされ、対応言語の明示的な一覧(allowlist)は無い | `[SCOPE-LANG]` | A | 2026-08-15 | 公式に未文書化 |
| 9 | 「低確信度のため抑制されたコメント」は、review本文中の折りたたみブロックの中に置かれていた実例がある(**単一のPRでの観測であり、製品の一般規則としては確認していない**)。`<details><summary>Suppressed comments (N)</summary>` の中に存在し、`/pulls/{n}/comments` や `/reviews/{id}/comments` などコメント一覧系エンドポイントには含まれていなかった(**この1件の観測からは「一切現れない」という一般規則までは言えない**)(review本文は「generated 2 comments」+「Suppressed comments (1)」と記載するが、`gh api repos/dancing-bear-show/dancing-bear/pulls/214/reviews/4939680421/comments` は厳密に2件のみを返し、抑制分の1件は含まれない) | `[DB214]` | C2 | 2026-08-16 | 確認済み |
| 9 | ファイル別サマリ表も同様に review 本文中の折りたたみブロックに置かれていた実例がある(**単一のPRでの観測であり、製品の一般規則としては確認していない**)。 `<details><summary>Show a summary per file</summary>` にのみ存在し、別個の構造化フィールドではない(同PRのreview本文をhtml_url `https://github.com/dancing-bear-show/dancing-bear/pull/214` で目視確認) | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| 9 | review オブジェクトのAPIスキーマには `updated_at` に相当するフィールドが無く、`submitted_at`(投稿時刻)のみを持つ。`PUT .../reviews/{id}` で本文編集した際に何らかのタイムスタンプが変化するかはAPIリファレンスに記載が無い(レスポンススキーマの列挙に `updated_at` フィールド自体が存在しないため「存在しない」と言えるが、更新時の挙動そのものは記載が無いという開いた意味での不在) | <https://docs.github.com/en/rest/pulls/reviews>(2026-08-15、Get a review for a pull request のレスポンススキーマを確認) | B | 2026-08-15 | 公式に未文書化 |
| 9 | 一方、インラインのreview commentオブジェクトは `created_at` と `updated_at` の両方を持つ(本文編集で `updated_at` が動く設計であることが読み取れる) | [REST API endpoints for pull request reviews](https://docs.github.com/en/rest/pulls/reviews) | B | 2026-08-15 | 確認済み |
| 9 | `/pulls/{n}/reviews` や `/pulls/{n}/comments` は既定30件/ページ、最大100件/ページでページネーションが必要 | [REST API endpoints for pull request reviews](https://docs.github.com/en/rest/pulls/reviews) | B | 2026-08-15 | 確認済み |
| 9 | インラインコメントの `line` が `null` になった実例がある(**null 側の実例は1件のみ。対照として挙げている2件は非null側であり、null 側の一般挙動を補強しない**)。その実例では `diff_hunk` と `position`/`original_position`(diff内の相対位置、pushのたびにずれうる)が実質的な位置情報になる(実例: `[MAS5671]` の Copilot インラインコメント id `3785860959` が `line: null` / `position: 1`。**`[DHC8367]` の2件はいずれも `line` が具体値(192 と 69)で null ではない**) | `[MAS5671]` | C2 | 2026-08-15 | 確認済み |
| 10 | 「レビューが1回走った」の一次的な痕跡は `/pulls/{n}/reviews` に追加される1件のreviewエントリ(`user.login: copilot-pull-request-reviewer[bot]`、`submitted_at` 付き)。**1PRに1件とは限らず、同一PRに複数件積み上がる**(軸6参照)ので、PR単位ではなくレビューエントリ単位で数える必要がある | `[DB214]`、`[HBT10215]`、`[DHC8367]`、`[MAS5671]` の各PRで `gh api repos/{owner}/{repo}/pulls/{n}/reviews` を確認 | C2 | 2026-08-15 | 確認済み |
| 10 | issue/PRタイムラインAPI(`/issues/{n}/timeline`)には `review_requested`(「レビューが依頼された」)と `reviewed`(「PRがレビューされた」)という別個の事象種別があり、依頼回数と実際にreview submitted_at相当の提出が起きた回数を別々に数えられる。ただしquota超過の拒否レビューも技術的には1件の提出(`state: COMMENTED`)なので、`reviewed` の増分だけでは「意味のあるレビューが行われたか」までは判別できない | [Issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types) | B | 2026-08-15 | 確認済み |
| 10 | `review_requested`/`review_request_removed`/`reviewed` はCopilot固有ではなく汎用のPRタイムライン事象種別であり、Copilot以外の人間レビュアーの依頼・削除・提出でも同じ種別が使われる。Copilot由来かどうかはtimelineの各エントリの `actor`/`review.user.login` を見て判別する必要がある | [Issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types) | B | 2026-08-15 | 確認済み |
| 10 | 副次的な痕跡としてGitHub Actionsのcheck-run `copilot-pull-request-reviewer` があり、`started_at`/`completed_at`/`status`/`conclusion` とActions run/jobへのリンクを持つ。review オブジェクト自体には所要時間や成否のconclusionが無いため、**観測範囲ではこれが実行時間ソースになる(他に存在しないことの証明ではない)**((started_at 2026-08-14T17:20:31Z, completed_at 2026-08-14T17:21:40Z, 所要約69秒) | `[HBT10215]`(`gh api repos/chenrui333/homebrew-tap/commits/6b5bf1e95a8ca24028e2146181be95788ddb4c3d/check-runs` で確認) | C2 | 2026-08-15 | 確認済み |
| 10 | reviewオブジェクトとcheck-runの2つの痕跡は食い違いうる: quota超過時はreviewオブジェクト(Commentレビュー)は作られるがcheck-runは一切作られない。「レビュー投稿の有無」と「課金対象のActions実行の有無」は別の問いであり、どちらを正とするかは数えたい対象による | `[LFSX66]`、`[FC387]`(軸6のcheck-run不在確認と同一の `gh api` 呼び出し結果) | C2 | 2026-08-15 | 確認済み |
| 10 | AI Credits消費量や実行コストは、review オブジェクトにもcheck-runオブジェクトにも含まれていない(観測した全サンプルで不在)。コストを機械的に取得するには組織のbilling usageエンドポイント(軸11参照)を別途叩く必要がある | `[DB214]`、`[HBT10215]`、`[LFSX66]`、`[FC387]`、`[EVITA1420]`、`[DBV1]` の各review/check-run JSONをフィールド単位で確認し、いずれにもコスト・トークン数フィールドが無いことを確認 | C2 | 2026-08-15 | 確認済み |
| 11 | `GET /repos/{owner}/{repo}/rulesets` などrules系エンドポイントで、`copilot_code_review` ルールの現在値(`review_draft_pull_requests`/`review_on_push`)を機械的に読める | [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules) | B | 2026-08-15 | 確認済み |
| 11 | `GET /orgs/{org}/copilot/billing` で組織のCopilotサブスクリプション・シート内訳を取得できる(manage_billing:copilot または read:org スコープが必要)。**ただし閲覧できるのはorganization ownerのみ**("Only organization owners can view details about the organization's Copilot Business or Copilot Enterprise subscription.")。このエンドポイントはpublic preview段階("This endpoint is in public preview and is subject to change.")。これらの文は生成ページのraw HTMLにも存在する(`curl` で直接取得しgrepして確認、WebFetchの要約には現れなかった)。台帳への転記時に落としていたため補った | OpenAPI `paths./orgs/{org}/copilot/billing.get.description`。生成ページ [REST API endpoints for Copilot user management](https://docs.github.com/en/rest/copilot/copilot-user-management) にも同内容が載っている | B | 2026-08-16 | 確認済み |
| 11 | `GET /orgs/{org}/copilot/billing/seats` でシート単位の詳細をページネーション付きで取得できる(既定 `per_page` は50、最大100)。**閲覧できるのはorganization ownerのみ**("Only organization owners can view assigned seats.")。このエンドポイントもpublic preview段階。各seatの `last_activity_at` はIDE側でtelemetryが有効な場合のみ反映される。これらの文は生成ページのraw HTMLにも存在する(`curl` で直接取得しgrepして確認、WebFetchの要約には現れなかった)。台帳への転記時に落としていたため補った | OpenAPI `paths./orgs/{org}/copilot/billing/seats.get`。生成ページ [REST API endpoints for Copilot user management](https://docs.github.com/en/rest/copilot/copilot-user-management) にも同内容が載っている | B | 2026-08-16 | 確認済み |
| 11 | `GET /organizations/{org}/settings/billing/premium_request/usage` でpremium request/AI Credits使用量レポートを取得できる。`user`/`year`/`month`/`day`/`model`/`product` でフィルタ可能、過去24か月分、組織またはエンタープライズの管理者権限が必要 | [Billing usage](https://docs.github.com/en/rest/billing/usage) | B | 2026-08-15 | 確認済み |
| 11 | 上記エンドポイントの `user` フィルタは、エンタープライズ配下の組織では組織admin権限では使えず、エンタープライズowner/billing managerのみ利用可能とコミュニティディスカッションで報告されている。公式APIリファレンス自体にはこの制限の明記は無く、二次情報(フォーラム投稿)にとどまる | <https://github.com/orgs/community/discussions/184208>(2026-08-15にWebFetchで内容確認)。報告者の所属組織・エンタープライズ規模等は投稿本文から特定できず、文脈不明。本調査ではこの制限自体を実機で再現していない | D | 2026-08-15 | 確認済み |
| 11 | **「対応するREST/GraphQLエンドポイントの案内が見つからなかった」という従来の記載は誤りだった(WebFetchによる要約段階で当該記述が落ちていたため)。**`[SCOPE-BILLING]` が含む <https://docs.github.com/en/rest/billing/usage> には個人ユーザー向けの使用量レポートAPIが4種類存在する: `GET /users/{username}/settings/billing/premium_request/usage`、`GET /users/{username}/settings/billing/ai_credit/usage`、`GET /users/{username}/settings/billing/usage`、`GET /users/{username}/settings/billing/usage/summary`(いずれも `curl` で生成ページのraw HTMLを直接取得しgrepして存在を確認、OpenAPIの `paths` にも同名で定義されている)。**ただしこれらは消費量レポート**(レスポンスは `grossQuantity`/`netAmount` 等の行アイテム配列)**であり、「現在の期間の残量(remaining)」を直接返すフィールドはOpenAPIのレスポンススキーマ(`billing-premium-request-usage-report-user` 等)に存在しない。**したがって「残量を返すAPIが無い」という結論自体は変わらないが、「対応するエンドポイント自体が見当たらない」は誤りで、正しくは「個人ユーザー向けの消費量レポートAPIは存在するが、残量を直接返すフィールドは無い」 | OpenAPI `paths./users/{username}/settings/billing/premium_request/usage.get` ほか3エンドポイントの `get` と、レスポンススキーマ `components.schemas.billing-premium-request-usage-report-user`。生成ページ <https://docs.github.com/en/rest/billing/usage> にも同じ4エンドポイントが載っている | B | 2026-08-16 | 確認済み |
| 11 | effort level(Lite/Balanced)の現在値をrulesetの `copilot_code_review` パラメータ経由で機械的に読む方法は、確認したAPIスキーマ上には存在しない(組織設定UI側の値であり、対応するREST/GraphQLフィールドは見つからなかった) | [REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules) | B | 2026-08-15 | 確認済み |
| 4 | 2026-07-17以降、`.github/copilot-instructions.md`・`*.instructions.md`・AGENTS.md・agent skillsに加えて、`REVIEW.md`・`GEMINI.md`・`CLAUDE.md` という既存のレビューガイドライン用ファイルも自動的に認識し、レビューに取り込むようになった | [Copilot code review: Customization and configurability improvements](https://github.blog/changelog/2026-07-17-copilot-code-review-customization-and-configurability-improvements/) | A | 2026-08-15 | 確認済み |
| 4 | 「カスタム指示はhead branchから読む(base branchではない)」という挙動は2026-07-17付で導入されたと明記されている(軸3の同旨記載の導入時期の裏取り) | [Copilot code review: Customization and configurability improvements](https://github.blog/changelog/2026-07-17-copilot-code-review-customization-and-configurability-improvements/) | A | 2026-08-15 | 確認済み |
| 2 | リポジトリ管理者は `.github/workflows/copilot-code-review.yml` にセットアップ手順(依存インストール等)を追加でき、runner設定もリポジトリ単位で独立して行える | [Copilot code review: Customization and configurability improvements](https://github.blog/changelog/2026-07-17-copilot-code-review-customization-and-configurability-improvements/) | A | 2026-08-15 | 確認済み |
| 2 | 組織単位のrunner設定は2026-07-17以降、Copilot code review用とCopilot cloud agent用が別セクションに分かれ、それぞれ独立してrunner種別を選べる | [Copilot code review: Customization and configurability improvements](https://github.blog/changelog/2026-07-17-copilot-code-review-customization-and-configurability-improvements/) | A | 2026-08-15 | 確認済み |
| 8 | レビュー実行中はfirewallが既定で有効になり、ネットワークアクセスを制限する。設定はCopilot cloud agentとは別建てでリポジトリ/組織単位に存在する。self-hosted runnerはfirewall機能に非対応 | [Copilot code review: Customization and configurability improvements](https://github.blog/changelog/2026-07-17-copilot-code-review-customization-and-configurability-improvements/) | A | 2026-08-15 | 確認済み |
| その他 | Copilot code reviewはgithub.com上のPRだけでなく、VS Code・Visual Studio・JetBrains・Xcodeの各エディタでもGA(一般提供)として利用できる。本台帳は主にgithub.com上のPRレビュー(自動/手動)を対象としており、エディタ内レビューの挙動は対象外としている | [New public preview features in Copilot code review: AI reviews that see the full picture](https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/) | A | 2026-08-15 | 確認済み |

## 出力パターン

| 面 | フィールド | 逐語文字列 | 意味する状態 | 出典(URL・観測環境の文脈) | 等級 | 確認日 | 状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR review(pulls/reviews) | body冒頭の見出し | `## Pull request overview` | 正常完了レビューの構造見出し(サマリ冒頭) | `[HBT10215]`、`[DB214]` | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body中の小見出し | `### Reviewed changes` | ファイル別サマリ・コメント件数を続けるセクションの開始(指摘が0件の場合はこのセクション自体が省略されることを `[HBT10215]` で観測) | `[DB214]`(このセクションを持つ側)、`[HBT10215]`(このセクションを持たない側の対照例) | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body中の定型文(テンプレート、N/Mは可変) | `Copilot reviewed {N} out of {N} changed files in this pull request and generated {M} comments.` | レビュー対象ファイル数と生成コメント数の要約(実例: `Copilot reviewed 155 out of 155 changed files in this pull request and generated 2 comments.`) | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body中の折りたたみ見出し | `<details>` / `<summary>Show a summary per file</summary>` | ファイル別サマリ表(File / Description の2列)を格納する折りたたみブロック | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body中の折りたたみ見出し(Nは件数、可変) | `<details>` / `<summary>Suppressed comments (1)</summary>` | 低確信度などの理由でインラインコメント化されず抑制されたコメントの格納先。この中身は `/pulls/{n}/comments` 等には出てこない | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body末尾の定型フッター | ``💡 <a href="/{owner}/{repo}/new/main?filename=.github/skills/code-review/SKILL.md">Add a `code-review` agent skill</a> or configure MCP servers for context-aware, tailored reviews. <a href="https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review#mcp-servers-and-agent-skills">Learn more in the docs.</a>`` | agent skill / MCP未設定リポジトリへの定型案内フッター。2つの独立リポジトリで文字列が完全一致(固定テンプレートと推定) | `[HBT10215]`、`[DB214]` | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body全文(quota超過時) | `Copilot was unable to review this pull request because the user who requested the review has reached their quota limit.` | premium request/AI Creditsのquota超過によりレビューを実行できなかった | `[QUOTA-LIST]`(15件全件で文字列完全一致を確認) | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body全文(行数上限超過時) | `Copilot wasn't able to review this pull request because it exceeds the maximum number of lines (20,000). Try reducing the number of changed lines and requesting a review from Copilot again.` | 変更行数が20,000行を超えたためレビュー不可(quota超過とは別の失敗理由・別文言) | `[COE25]` | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body全文(ファイル数上限超過時) | `Copilot wasn't able to review this pull request because it exceeds the maximum number of files (300). Try reducing the number of changed files and requesting a review from Copilot again.` | 変更ファイル数が300を超えたためレビュー不可(quota超過・行数超過とは別の失敗理由・別文言) | `[KRIA1]` | C2 | 2026-08-15 | 確認済み |
| PR review comment(インライン) | body先頭の重大度タグ | `[CRITICAL]` | インラインコメントに付与される重大度接頭辞(全コメントに付くかは未確認。1件のみ観測) | `[MAS5671]` | C2 | 2026-08-15 | 確認済み |
| PR review(reviews).state | state値 | `COMMENTED` | 「Copilotは常にCommentレビューを残す」という公式記載どおりの値。quota超過などの失敗時body(上記)でも同じ値が使われ、成功/失敗の判別には使えない | <https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review>(A、公式記載を確認、2026-08-15)。C2による裏取り: `[DB214]`、`[HBT10215]`、`[QUOTA-LIST]` すべて `state: "COMMENTED"` で一致 | A | 2026-08-15 | 確認済み |
| check-run(commits/{sha}/check-runs) | name | `copilot-pull-request-reviewer` | 正常完了したレビュー実行を表すGitHub Actions check-run名 | `[HBT10215]` | C2 | 2026-08-15 | 確認済み |
| check-run(commits/{sha}/check-runs) | status/conclusion | `"status":"completed"` / `"conclusion":"success"` | レビュー実行が正常完了したことを示す機械可読な状態 | `[HBT10215]` | C2 | 2026-08-15 | 確認済み |
| check-run(commits/{sha}/check-runs) | (存在しないこと自体が痕跡) | (該当なし。`copilot-pull-request-reviewer` という名のcheck-runが1件も無い) | quota超過/サイズ上限超過でレビューが失敗した場合、CIの盛んな他リポジトリ(check-run 15〜27件)でもこの名前のcheck-runは一切作られない | `[LFSX66]`(15件のcheck-runあり、Copilot分は0件)、`[FC387]`(28件のcheck-runあり(観測時点の値。件数は増減する)、Copilot分は0件) | C2 | 2026-08-15 | 確認済み |
| review(pulls/reviews).user | login | `copilot-pull-request-reviewer[bot]` | reviewオブジェクト面での投稿者ログイン名 | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| review comment(pulls/comments).user | login | `Copilot` | インラインコメント面での投稿者ログイン名(review面とは別表記。`id`は同一) | `[DB214]` | C2 | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body中の定型文(旧表記、時期不明) | `Comments suppressed due to low confidence (n)` | コミュニティディスカッションが伝える旧バージョンの抑制コメント表記。本調査でC2実測した現行表記は `Suppressed comments (N)` であり、同じ機能を指す別文言である可能性が高いが未検証(二次情報) | <https://github.com/orgs/community/discussions/157330>(2026-08-15にWebFetchで内容確認)。観測環境: フォーラム投稿者のリポジトリ・組織/個人の別・投稿時期はいずれも本文から特定できず、文脈不明 | D | 2026-08-15 | 確認済み |
| PR review(pulls/reviews) | body全文(旧表記、時期不明) | `Copilot reviewed N out of N changed files in this pull request and generated no comments.` | コミュニティディスカッションが伝える、指摘0件時の旧文面。本調査のC2実測 `[HBT10215]`(0コメント)ではこの文が本文中に存在せず、該当箇所が空行になっていたため、現行仕様と一致するか未検証(二次情報) | <https://github.com/orgs/community/discussions/157330>(2026-08-15にWebFetchで内容確認)。観測環境: フォーラム投稿者のリポジトリ・組織/個人の別・投稿時期はいずれも本文から特定できず、文脈不明 | D | 2026-08-15 | 確認済み |
| PR review comment(インライン) | コメント右上の重大度ラベル(公式仕様、逐語) | `High` / `Medium` / `Low` | 2026-05-12以降の重大度分類。C2実測で観測した `[CRITICAL]` という本文接頭辞(上記行)とは表記が異なり、UIバッジ(このラベル)と本文中の接頭辞が同一機構か別機構かは未確認 | [Copilot code review: Comment experience improvements](https://github.blog/changelog/2026-05-12-copilot-code-review-comment-experience-improvements/)(2026-08-15、changelog本文で確認。C2での再現は本調査では未実施) | A | 2026-08-15 | 確認済み |

## 出力の構造

- `## Pull request overview` — レビュー本文冒頭のサマリ見出し(固定文字列)。
- `### Reviewed changes` — ファイル数・コメント数サマリと詳細情報を続ける小見出し(指摘0件時は省略されうる)。
- `<details><summary>Show a summary per file</summary>` 内に `| File | Description |` 形式の表(2列)を格納する。この表はレビュー本文の折りたたみブロック内にのみ存在し、独立した構造化フィールドとしては提供されない。
- `<details><summary>Suppressed comments (N)</summary>` — 低確信度等で抑制されたコメントを格納する折りたたみブロック。中身は `**path:line**` の見出し行と箇条書きの指摘文。
- 本文末尾の `---` 区切り線の後に、`💡` 絵文字で始まる固定フッター(agent skill / MCPサーバー設定を促す案内)が付与される。
- インラインコメント本文の先頭に `[CRITICAL]` のような重大度接頭辞が付くことがある(観測1件、全件共通かは未確認)。公式changelogは別途 `High`/`Medium`/`Low` という重大度ラベルがコメント右上に表示されると説明しており、この2つの表記の関係(同一機構か別機構か)は未確認。
- 生のreview本文(API `body` フィールド)にHTMLコメント(`<!-- -->`)形式の機械可読マーカーは、本調査で取得した2件のサンプルには見つからなかった。
