# 草案A: 検知可能性から逆算したレビュープロセス

## 1. 要約

このリポジトリは「人間がdiffを読まない」「変更はほぼAIエージェントが書く」「`main` はRulesetで守られる」の3つを前提にしている。
その前提のもとで**唯一マージを止められる機構は、PRに掛かる required status check である。**
したがって本草案は次の1本の原則で全体を組む ——
**「止めたいものは、必ず required check の赤として表現する。表現できないものは、レビュー判断の対象として残し、その判断が行われたこと自体をまた required check の赤で守る。」**

ここから3つの帰結が出る。

1. **決定論的に判定できる欠陥は、レビューではなくCI/型/テスト/DB権限の側へ移す。**ベンダー公式もそう書いている(Codex: `**Leave mechanical checks in CI.** Keep formatting, lint, and other deterministic checks out of review rules.` 逐語、2026-08-16取得)。
2. **レビューボット4種のどれ1つも、それ自身の出力面を required check にしてはならない。**「実行されなかった」「枠切れで拒否された」「パスフィルタで飛ばされた」が、成功と同じ見え方をする経路が各ツールに実在するためである(§5)。
3. **Draft PR を使わない。**Draftはレビュアーの沈黙が仕様どおりに起きる状態であり、「仕様どおりの沈黙」と「故障による沈黙」を外から区別できない。検知可能性を最上位に置くなら、そういう状態を工程に置いてはいけない。

代わりに置くのは、**我々が所有する1本の集約ジョブ(以下「関門ジョブ」)**である。
関門ジョブは各ボットの痕跡をGitHub APIから自分で取りに行き、**陽性の証拠が揃ったときだけ緑にする。**証拠が取れないときは赤にする。pendingにはしない。

## 2. 起点をどう使ったか

起点は「壊れたときに機械が止められるか」。これを2段階に分けて適用した。

- **第1段: 欠陥そのものを機械が止められるか。**止められるなら、レビューを一切使わずCI側に置く(§3)。ここでの判定は「lint/tsc/テスト/DB権限のどれかで、欠陥の入ったコードが赤になるか」だけで行う。
- **第2段: 止められない残りについて、レビュー判断が行われたことを機械が止められるか。**レビュー判断そのものの正しさは機械が測れないが、**「レビューが実行されたか」「指摘に処置が付いたか」は機械が測れる。**ここを測らないと、プロセス全体が静かに空回りする(§5)。

第2段を置く理由は、このリポジトリの品質保証の第一原理が「壊れたらCIが赤くなる」だからである。
レビュープロセスがその外側にあると、**プロセスが動かなくなったこと自体が誰にも検知されない。**
「レビューは通っている」という状態が、実は「ボットが1度も走っていない」だったとしても、GitHubのUI上は何も赤くならない。これが本草案が最も恐れている失敗である。

コストは意図的に無視した。Codexの枠が尽きて関門ジョブが半日赤のままになる設計を、そのまま採用している(§8)。

## 3. `main` に入ってはいけない欠陥と、機械が止められるかの判定

材料は `AGENTS.md` のレビュープロセス以外の記述、`docs/permissions.md`、`docs/testing.md`、`docs/lint-policy.md`、`docs/decision-policy.md`。

| # | 欠陥 | 機械が止められるか | 置き場所 |
| --- | --- | --- | --- |
| F1 | `as` キャスト / `any` | **止められる** | ESLint(`no-explicit-any`、`consistent-type-assertions`)。CI |
| F2 | インラインの `@ts-ignore` / `eslint-disable` で黙らせる | **止められる(要追加)** | 抑制コメントの出現自体をCIで検出し赤にする。設定ファイル側の例外だけを許す |
| F3 | 判断ロジックを `common/` 以外の層に置く | **部分的**。`no-restricted-imports` / `no-restricted-syntax` で止まるが、`lib/` に構文ルールが無い・間接依存を辿らない・ブラケット記法で抜ける、というギャップが文書化済み | CI + 残余はレビュー |
| F4 | Web UI と MCP が同じ判断を2経路で持ち、片方だけ古くなる | **止められる(要追加)** | 同一入力集合を両経路に流して結論の一致を assert する等価性テスト。`test/unit/` |
| F5 | DB生成型 / Zod由来型を使わず型を二重定義 | **部分的**。`supabase/types.ts` の手編集は `yarn gen:types` の差分検出で止まる。手書きの重複定義は止まらない | CI(生成型) + 残余はレビュー |
| F6 | 権限マトリクスの行が片方の層にしか実装されていない | **止められる(要追加)** | マトリクスを機械可読な単一データにし、RLSテストとアプリ層テストの両方をそこから駆動する。行に対応するテストが無ければCIが赤 |
| F7 | `test/db/` で service_role キーを使い、RLSを検証していないテスト | **止められる** | `test/db/` から service_role キーを参照できないようにし、参照をCIで検出 |
| F8 | 参加登録の公開設定など既定値の反転 | **止められる** | 既定値を固定するテスト |
| F9 | イベントの物理削除 | **止められる** | DB側で当該ロールから DELETE 権限を外し、否定側の `test/db/` で「消せないこと」を固定 |
| F10 | 静かに失敗する変更に、否定側テストが無い | **部分的に止められる(要追加)** | `common/` に対する mutation testing。条件を反転しても緑のままなら赤にする。カバレッジ率では代替できない |
| F11 | 成果物どうしの矛盾 / どちらとも取れる判断を、確認せず決めた | **止められない** | `docs/decision-policy.md` が明示するとおり、方針が逆でもCIは緑。**レビュー判断とPO確認の領域** |
| F12 | ガバナンス文書の正本が複数箇所に増えた | **止められない**(重複文字列の検出はできるが「読んだ人の行動が変わるか」は測れない) | レビュー判断 |
| F13 | 自動化設定の変更で、権限拡大・skipがsuccessに見える穴・required checkの永久pending・fork PRでのsecret挙動 | **部分的に止められる** | workflow/Rulesetの静的検査をCIに置く。残余はレビュー判断 |
| F14 | PRの差分が大きすぎて、レビュー面が構造的に欠落する | **止められる(要追加)** | 変更ファイル数 > 300 または変更行数 > 20,000 を関門ジョブで赤にする(§6 J8) |

**レビュー判断に残るのは F3・F5 の残余、F10 の残余、F11、F12、F13 の残余だけである。**
他はすべてCI側に移す。移せるものをレビューに残すのは、判断の枠(§8)を決定論的欠陥の指摘に食わせる分だけ損である。

## 4. プロセスの定義

**PRという単位は使う。**理由は好みではなく機構である —— `main` はRulesetで守られており、マージを機械的に止められるのは required status check だけで、それはPRのhead(またはテストマージコミット)に対して評価される。
4つのレビュアーの出力面(review / review comment / issue comment)もすべてPRスコープである。とくにCodexは check run も commit status も作れない(App権限が `checks: read` / `statuses: read`。2026-08-16に自分で再確認)ため、PRという器が無いと出力面自体が存在しない。

**Draftは使わない。**PRは最初からReadyで作る(理由は §6 J2)。

| 段階 | 発火契機 | 担当 | 出力の面 | 次へ進む条件 | 終了条件 |
| --- | --- | --- | --- | --- | --- |
| G0 事前 | Issue着手・worktree作成 | 実装エージェント | ローカル | `yarn lint && yarn typecheck && yarn test` が緑 | pushしてPRを作成(Readyで) |
| G1 決定論ゲート | `pull_request`(`opened` / `synchronize` / `reopened`)と `push` | CI(我々のworkflow) | check run(required) | F1〜F10・F13・F14 の機械チェックが全緑 | 緑になるまでG2の判断を開始しない |
| G2 レビュー実行ゲート | G1が緑になったこと、および各ボット自身の発火契機 | CodeRabbit / Copilot / Codex / Claude(claude-code-action) | review、review comment、issue comment | **4ツールそれぞれについて「実行された」陽性の証拠が取れた**(§5) | 関門ジョブが実行証拠を全部確認できたら次へ |
| G3 指摘処置ゲート | G2の証拠が揃ったこと | 実装エージェント(判断)+ 関門ジョブ(計数) | PR本文の処置表 + 追加コミット | **未処置の指摘が0件。**処置は「適用」「反論(理由付き)」「見送り(理由付き)」の3値で、指摘IDと1対1に対応する | 全指摘に処置が付いたら次へ |
| G4 意図ゲート | 変更が `docs/prd.md` / `docs/permissions.md` / `docs/data-model.md` / `supabase/migrations/**` / Ruleset・workflow を含むとき**だけ** | PO(人間) | PR approve | POのapprove(CODEOWNERS + `required_approving_review_count`) | approve が付いたら次へ。**ここだけ機械が止められないので、機械は「approveが無いこと」を止める** |
| G5 マージ | G1〜G4のrequired checkが全緑 | 実装エージェント | マージコミット | Rulesetの `required_status_checks` と `pull_request` ruleが全て満たされる | マージ、worktree撤収 |

### 関門ジョブ(G1〜G3を1本の required check に集約する)

- **`if:` 条件も path/branch フィルタも掛けない。**掛けると走らない条件が生まれ、走らなかった結果が「Success」に化ける(skipされたjobは `"Success"` を報告し、required check であってもマージを妨げない。docs逐語で2026-08-16に確認)。
- **他ジョブの結果を `needs` で受け、`skipped` を成功と読み替えない。**`skipped` は明示的に失敗として扱う。
- **待たない。**その時点で取れた証拠だけで合否を出す。ボットが遅れていれば赤になり、再実行で更新する。required check を pending のまま放置しない(永久pendingは文書化された典型的な穴)。
- **fork由来のPRは常に赤。**fork PRでは `GITHUB_TOKEN` 以外のsecretがrunnerに渡らず、関門ジョブが証拠収集に必要な権限を持てない。「証拠を取れなかった」を緑にしない。
- **action参照はcommit SHAで固定する。**タグ参照(例: `@v1`)は指す先が後から変わるので、「同じ設定なら同じ判定になる」ことが検証できない。検知可能性が壊れる。
- Rulesetの `required_status_checks` は `strict_required_status_checks_policy` を有効にする。`pull_request` はマージコンフリクトのあるPRでは発火しない(docs逐語、2026-08-16確認)ため、古いbaseに対する古い結果でマージされる経路を塞ぐ。

## 5. プロセス自身の沈黙を検知する仕組み

**基本則: 「否定の証拠が無いこと」を成功の根拠にしない。各ツールについて陽性の証拠を定義し、それが取れなければ未実行として赤にする。**

### 5.1 取得の作法(全ツール共通)

- **面を4つとも取る。**差分行コメント(`/pulls/{n}/comments`)と会話コメント(`/issues/{n}/comments`)は重ならない実例がある(C2)。reviewオブジェクト(`/pulls/{n}/reviews`)、check run(`/commits/{sha}/check-runs`)も併せて取る。片方だけ見ると指摘を丸ごと取り落とす。
- **`per_page=100` を明示し、`Link` の `rel="next"` を辿る。**既定30のまま打ち切ると静かに欠落する。1ページに収まると `Link` が付かないので、`Link` の不在を異常と読まない。
- **check run は `filter=all`。**既定 `latest` では再実行前が見えない。
- **レビュースレッドの解決状態はGraphQLでしか読めない。**RESTの `review-comment` の全29プロパティに解決状態のフィールドが無く、`paths` にもレビュースレッド用のパスが無い(閉じた情報源。2026-08-16に自分でOpenAPIを走査して確認)。G3の「未処置0件」をスレッド解決で表すなら、GraphQLの `PullRequestReviewThread.isResolved` を使う。
- **botの同定に `login` を使わない。**同一アクターが面によって別のloginで返る実例がある(C2)。`user.type == "Bot"` と、既知の `user.id` との一致の**両方**を要求し、どちらか外れたら「同定不能=未実行扱い」にする。
- **reviewが増えたことを「本文が投稿された」と読まない。**`body` が空のreviewが作られる実例が複数ある(C2)。本文の有無は長さで判定する。
- **PRとcheckの突き合わせに自前の照合表を作らない。**`GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls` が存在する(§7 X1)。`check_run.pull_requests` はトリガー元の同定には使えないが、「head_sha または head_branch が一致する open PR の列挙」としては定義どおり使える。用途を分けて使う。
- **実行回数は `run_attempt` で数える。**これは試行番号で、初回が `1`(2026-08-16にOpenAPIで確認)。「再実行された回数」ではないので、再実行の有無は `run_attempt >= 2` で判定する。

### 5.2 ツール別の「実行された」陽性証拠と、沈黙の扱い

| ツール | 陽性の証拠(これが取れたときだけ実行とみなす) | 沈黙が成功に見える経路 | fail-closedの既定 |
| --- | --- | --- | --- |
| **Claude**(claude-code-action) | 我々のworkflowなので、jobの `conclusion == "success"` かつAction出力の `conclusion` が `"success"` | トリガー未該当・workflow検証ミスマッチのスキップでは `conclusion` が**設定されない**(空)。後者を示す出力は `action.yml` の `outputs:` に宣言が無く、呼び出し元へ渡らない | `conclusion` が空文字列なら**失敗**として扱う。jobのsuccessだけで緑にしない |
| **CodeRabbit** | head SHA を対象とした review が存在し、`body` が `**Actionable comments posted: N**` を含む(C2) | (a) レビューエラー時に外向きステータスを失敗にする設定 `fail_commit_status` の既定が `false`(2026-08-16にスキーマで確認)。(b) パスフィルタ全除外のスキップでも commit status が `Review completed` / `success` を返した実例(C2)。(c) `auto_pause_after_reviewed_commits` 既定5でレビュー済みコミットが5に達すると自動停止 | **CodeRabbit自身のcheck run / commit statusをrequired checkにしない。**スキップ・レート制限のHTMLマーカーは「未実行」の陽性証拠として使うが、**マーカーが無いことを成功の根拠にしない** |
| **Copilot** | head SHA に対する review が存在し、`body` が3つの拒否文言(quota超過 / 行数上限 / ファイル数上限。いずれも逐語が判明済み、C2)のいずれでも始まらない | reviewの `state` は成功時も拒否時も `COMMENTED` で一致し、`state` では判別できない(C2)。そもそもCopilotのレビューは `Approve` / `Request changes` にならず、必須レビュー数にカウントされずマージをブロックしない(公式逐語、2026-08-16確認) | **Copilotをゲートとして数えない。**quotaの種類は文言から判別できない(§7 X8)ので種類で分岐しない。check runの存在は補助信号にとどめる(正常時に作られた実例が1件しか無く、不在を失敗と断定できない) |
| **Codex** | 「指摘あり」= review の `body` が `### 💡 Codex Review` で始まる。「指摘0件」= issue comment が `Codex Review: Didn't find any major issues.` で**始まる**(末尾は18種以上のランダムな一言なので完全一致では判定できない、C2) | **check run も commit status も作れない**(App権限が read のみ。2026-08-16に自分で再確認)。設定OFF・対象外・トリガ不一致の「スキップ」はGitHub側に痕跡が観測されていない。レート制限・エラー・未接続・環境未作成はすべて issue comment | **Codexの沈黙は常に「未実行」= 赤。**枠が数時間〜1日単位で尽きうることが我々の環境で実測されている(§9 C-2)ため、この赤は日常的に発生する。それでよい |

### 5.3 プロセスが空回りしていることを、変更が無くても検知する

上の仕組みは「PRがあるときに」しか働かない。**設定が壊れてボットが1つも走らなくなった状態は、PRが出るまで見えない。**
そこで**定期的な合成PR(canary)**を置く。無害な差分を持つPRを定期的に自動で開き、関門ジョブが4ツールの陽性証拠を全部取れることを確認して自動でcloseする。取れなければ人に通知する。
これは「レビュープロセスが生きているか」を、実作業のPRとは独立に測る唯一の手段である。

## 6. この草案が下した判断の一覧

| # | 判断 | 選んだもの | 選ばなかったもの | 理由 | 根拠(台帳の軸/一次情報) |
| --- | --- | --- | --- | --- | --- |
| J1 | 工程の単位 | PR | コミット単位、ブランチ単位、レビューキュー | マージを機械的に止められるのは required status check だけで、それはPRに掛かる。Codexは check/status 面を持たないためPRが唯一の出力面 | github-platform 軸2・軸6、codex-cloud 軸5(App権限を2026-08-16に再取得) |
| J2 | Draftの使用 | 使わない(最初からReady) | Draftで反復→Ready化 | Draftは複数のボットが仕様どおり沈黙する状態で、沈黙の原因を外から区別できない。加えて `ready_for_review` は `pull_request` の既定 activity type に含まれず(docs逐語、2026-08-16)、`commits/{sha}/pulls` がDraft PRで空配列になる例も記録されている | github-platform 軸2、coderabbit 軸1(`drafts` 既定 `false`、2026-08-16にスキーマ確認)、copilot 軸1 |
| J3 | required check の構成 | 我々が所有する関門ジョブ1本に集約 | 各ボットのcheck/statusを個別にrequired化 | ボット側の面は「未実行」「スキップ」「エラー」が成功に見える経路を持つ。他者の面を止める側に置かない | coderabbit 軸6(`fail_commit_status` 既定 `false`)、coderabbit 軸6のスキップ時 `success` 実例、copilot 軸6 |
| J4 | skipの扱い | `skipped` を明示的に失敗として扱う | GitHub既定のまま | skipされたjobは `"Success"` を報告し、required checkでもマージを妨げない(docs逐語、2026-08-16確認) | github-platform 軸6 |
| J5 | 待ち方 | 待たずにその時点の証拠で赤/緑を返す | ボットの完了をポーリングして待つ | required check の永久pendingは文書化された典型的な穴。赤は再実行で解ける | github-platform 軸6 |
| J6 | 決定論的欠陥の置き場所 | CI/型/テスト/DB権限 | レビュー観点として記述 | ベンダー公式が明示(`Leave mechanical checks in CI.` 逐語、2026-08-16取得)。判断の枠を機械が言えることに使わない | codex-cloud 軸8 |
| J7 | 権限マトリクスの検証 | 機械可読な単一マトリクスから両層のテストを駆動 | 表を人手で2箇所に写す | 行を足してテストに足し忘れる経路を消す。`docs/permissions.md` が「×が1つでもテストされていなければ検証されていない権限」と定める | `docs/permissions.md`、`docs/testing.md` |
| J8 | PR差分の上限 | 300ファイル / 20,000行を超えたら赤 | 上限を置かない、目安にとどめる | この閾値を超えるとGitHubの差分表示もCopilotのレビューも構造的に成立しない(Copilotは同じ数値で拒否する逐語文言を持つ) | github-platform 軸3、copilot 軸7・出力パターン表 |
| J9 | botの同定キー | `user.type == "Bot"` と既知 `user.id` の両方一致 | `login` での照合、`login` の `[bot]` サフィックス | 同一アクターが面によって別のloginで返る実例がある。`[bot]` は `type: Bot` でも付かないことがある | github-platform 軸5、copilot 軸5 |
| J10 | check→PRの突き合わせ | `commits/{sha}/pulls` を使う。`check_run.pull_requests` は候補列挙にのみ使う | 自前の `head_sha`/ブランチ名の照合表を持つ | エンドポイントが存在し、定義文も一致(§7 X1)。自前照合は保守対象が増えるだけで、精度は上がらない | github-platform 軸10(OpenAPIを2026-08-16に自分で確認) |
| J11 | 指摘の処置の記録 | 指摘IDと1対1の3値(適用/反論/見送り)。関門ジョブが未処置0件を検査 | 自由記述のまとめコメント | 「読んだ」を機械が数えられる形にしないと、処置の欠落が静かに通る。人間はdiffを読まない | 起点(検知可能性)からの導出 |
| J12 | Codexの重大度バッジの利用 | 使わない(全指摘を等しく処置対象にする) | P0/P1のみ処置、P2以下は見送り | 値域が3つの情報源で食い違い、確定不能(§9 C-1) | codex-cloud 軸8・軸10 |
| J13 | ボットの実行回数の集計 | GitHub側の痕跡から数える | ベンダーの集計API/ダッシュボードを正とする | CodeRabbitは「1回」の計数根拠が未文書化、Codexの集計APIは `p3` を持たず表示系と体系が食い違う。集計を設計の根拠に使えない | coderabbit 軸10、codex-cloud 軸10 |
| J14 | fork PR | 常に赤(マージ不可) | 通常PRと同じ扱い | fork PRでは `GITHUB_TOKEN` 以外のsecretがrunnerに渡らず、証拠収集ができない。「取れなかった」を緑にしない | github-platform 軸2 |
| J15 | action参照 | commit SHAで固定 | タグ参照(`@v1` 等) | 指す先が後から変わると、同じ設定で同じ判定になることを検証できない。台帳の第三者実測でもタグ参照の例が観測されている | claude-code-action 例1(C2)、本草案の引用方針 |
| J16 | プロセス生存の監視 | 定期の合成PR(canary) | 実PRのときだけ確認 | 設定が壊れて全ボットが沈黙した状態は、PRが出るまで見えない | §5.3(起点からの導出) |
| J17 | POゲートの範囲 | `docs/prd.md` / `docs/permissions.md` / `docs/data-model.md` / マイグレーション / Ruleset・workflow に触れるPRのみ | 全PRでPO approve | `docs/decision-policy.md` の「成果物の書き換えが要るなら確認」の線をそのまま機械の条件に写す。全PRに掛けると人がボトルネックになり、確認が形骸化する | `docs/decision-policy.md` |

## 7. 「このツールはXができない」に依拠した箇所と、一次情報の当たり直し記録

| # | 依拠した「Xができない」 | 台帳のどの行か | 当たり直した一次情報(取得日) | 結果 | 設計への影響 |
| --- | --- | --- | --- | --- | --- |
| X1 | checkからPRを辿る構造的手段が無い(`pull_requests` 配列は当てにならない) | `github-platform.md` 軸10 | OpenAPI(pinned SHA `67c14c7efb01cdeeac0ecd8cee9fae8d7a80e2aa`、2026-08-16取得)。`check-run.properties.pull_requests.description` = "…The returned pull requests do not necessarily indicate pull requests that triggered the check."、`paths./repos/{owner}/{repo}/commits/{commit_sha}/pulls` が存在し description = "Lists the merged pull request that introduced the commit… If the commit is not present in the default branch, it will return merged and open pull requests associated with the commit." | **反証**(2つに分かれる: トリガー元の同定は不可、PR候補の列挙は可。別エンドポイントは存在する) | **自前の突き合わせ機構を設計から外した(J10)。**関門ジョブは `commits/{sha}/pulls` を使う |
| X2 | `run_attempt` は「再実行の回数」 | `github-platform.md` 軸10 | 同OpenAPI。`workflow-run.properties.run_attempt.description` = "Attempt number of the run, 1 for first attempt and higher if the workflow was re-run." | **反証**(試行番号。初回が `1`) | 再実行の判定を `run_attempt >= 2` にした(§5.1)。`0` を初期値と読む実装を排除 |
| X3 | Codexは check run も commit status も作れない | `codex-cloud.md` 軸5・軸6 | `gh api apps/chatgpt-codex-connector`(2026-08-16取得)。`permissions` に `checks: read` / `statuses: read`。App マニフェストは閉じた情報源 | **支持** | Codexの沈黙を陽性判定できないと確定。**Codexの沈黙を常に赤にする**設計の根拠(§5.2) |
| X4 | Copilotのレビューはマージをブロックしない | `copilot.md` 軸5 | docs.github.com の Copilot code review 手順ページ(2026-08-16取得、不変refなし)逐語: "Copilot always leaves a \"Comment\" review, not an \"Approve\" or \"Request changes\" review. Its reviews do not count toward required approvals and will not block merging." | **支持** | Copilotをゲートに数えない(J3)。Copilotの結果は関門ジョブが読み替えて初めてゲートになる |
| X5 | skipされたjobは required check でもマージを妨げない | `github-platform.md` 軸6 | docs.github.com の status-checks リファレンス(2026-08-16取得、不変refなし)逐語: "A job that is skipped will report its status as \"Success\". It will not prevent a pull request from merging, even if it is a required check." | **支持** | 関門ジョブに `if:`/pathフィルタを掛けない、`needs` の `skipped` を失敗扱いにする(J4) |
| X6 | レビュースレッドの解決状態はRESTから読めない | `github-platform.md` 軸9 | 同OpenAPI。`paths` のうち `thread\|resolve` に一致するのは `/notifications/threads/*` の2件のみ。`review-comment` の29プロパティに `resolv\|thread` を含むものは0件 | **支持**(閉じた情報源での不在) | G3の未処置検査にGraphQLを使う(§5.1) |
| X7 | CodeRabbitのレビューエラーは外向きステータスを失敗にしない | `coderabbit.md` 軸6 | `https://coderabbit.ai/integrations/schema.v2.json`(2026-08-16取得、バージョン付きURLなし)。`reviews.fail_commit_status.default = false`、`reviews.review_progress.default = true`、`reviews.commit_status.description` に "only used when review_progress is disabled" | **支持** | CodeRabbitの面をrequired checkにしない(J3)。設定変更で塞ぐ案も採らない —— 既定に依存しない側に倒した |
| X8 | Copilotのquota拒否は premium request / AI Credits の枠切れである | `copilot.md` 軸7 | 拒否文言の逐語は `…has reached their quota limit.` のみで種類を含まない。一方 OpenAPI の `repository-rule-copilot-code-review.description` は "…if the author has access to Copilot code review and their premium requests quota has not reached the limit." と書くが、これは**自動レビューの発火条件**であって拒否文言の説明ではない | **確定不能** | quotaの種類で分岐しない。拒否文言のいずれかに一致したら理由を問わず「未実行」に倒す(§5.2) |
| X9 | `ready_for_review` は `pull_request` の既定 activity type に含まれない | `github-platform.md` 軸2 | docs.github.com のイベントリファレンス(2026-08-16取得、不変refなし)逐語: "By default, a workflow only runs when a `pull_request` event's activity type is `opened`, `synchronize`, or `reopened`." および "Workflows will not run on `pull_request` activity if the pull request has a merge conflict." | **支持** | Draftを使わない(J2)。マージコンフリクト時にチェックが更新されないことへの対処として `strict_required_status_checks_policy` を有効化(§4) |
| X10 | check run の `conclusion` に `stale` は存在しない | `github-platform.md` 値域表 | 同OpenAPI。`check-run.conclusion.enum` は7値(`stale` なし)、`check-suite.conclusion.enum` は9値+`null`(`stale` あり) | **支持** | 関門ジョブは check run と check suite で `conclusion` の値域を分けて扱う。想定外値は失敗に倒す |

**不変refの限界について。**docs.github.com の3ページ(X4・X5・X9)にはバージョン付きURLもcommit SHAも存在しない。取得日と逐語引用で固定したが、後から中身が変わりうる点は残る。REST APIリファレンス側は `?apiVersion=2022-11-28` で固定できるが、Actions/PRのガイドページには対応する仕組みが無い。**この3件は、他の7件より弱い固定である。**

## 8. 自己コスト見積もり

1つの変更(1 Issue = 1 PR)あたりの想定。push回数を3回(初回 + 指摘反映2回)と置く。

| 項目 | 回数/変更 | 備考 |
| --- | --- | --- |
| workflow run(G1決定論ゲート + 関門ジョブ) | 3 + 再実行分 | `pull_request` の `opened`/`synchronize` で発火 |
| 関門ジョブ内のGitHub APIリクエスト | 約10 × 3 = 30 | reviews / pulls-comments / issues-comments / check-runs / status / commits-pulls / GraphQL(スレッド解決)+ ページング。Actions の `GITHUB_TOKEN` はリポジトリ単位1,000/時なので余裕 |
| CodeRabbit レビュー | 3 | pushごとのincremental自動レビューが既定 `true`。**ただし `auto_pause_after_reviewed_commits` 既定5**で5コミット到達後は自動停止する。Proの枠は5レビュー/時なので、1時間に1変更なら収まる |
| Copilot レビュー | 1〜3 | `review_on_push` を有効にすれば3。無効なら初回1 + 手動再依頼 |
| Codex レビュー | 1(自動)+ 手動0〜2 | 現在の設定は「PR のオープン時」。Draftを使わないので初回に必ず1回発火する |
| Claude(claude-code-action) | 3 | 我々のworkflow。1変更あたりのAction実行 |
| PO確認 | 0 または 1 | G4の対象カテゴリに触れたときだけ |
| 合計「レビュー実行」 | **8〜11回** | 4ツール分の合計 |

**枠に収まるか。**

- **CodeRabbit: 収まる。**Proの5レビュー/時に対し1変更あたり3回。ただし1時間に2変更以上を並行させると超える。またFair Usage Policyにより直近7日のレビュー数が閾値を超えると1件/時まで絞られるので、**週あたり60レビューを超える運用では収まらない。**上の見積もりだと週20変更で60回に達する。
- **Copilot: 判定不能。**premium request / AI Credits の残量を返すAPIフィールドが存在せず(消費量レポートAPIはあるが `remaining` を返すフィールドが無い)、残枠を機械的に読めない。effort level ごとの想定コスト($0.05〜$5/レビュー)は公開されているが、これは枠ではない。
- **Codex: 収まらない可能性が高い。**我々の環境の実測で、8時間46分07秒にわたって観測された試行がすべて拒否だった区間、および23時間11分14秒にわたって同様だった区間がある。**1変更あたり1回すら通らない日が現実に起きる。**
- **Claude: 判定不能。**残枠・レート上限を返す input/output が `action.yml` に存在しない。

したがって**本設計は、Codexについては枠に収まらない。**その場合、関門ジョブは「Codex未実行」で赤のままになり、変更はマージされない。
**これは意図した挙動である。**検知可能性を最上位に置いた以上、「枠が尽きたのでレビューを1つ飛ばして通す」は選べない。飛ばしてよいかどうかは、コストを起点にする別の草案が扱うべき問いである。

## 9. 確定不能を前提にした箇所(fail-closed の置き方)

入力5で前段が確定させた3点を、そのまま設計の前提にした。

- **C-1 指摘の優先度の値域 —— 確定不能。**公式ドキュメントは「GitHubではP0とP1のみをフラグする」と書き、第三者リポジトリの実測はP1/P2/P3を観測し、ベンダーのアナリティクス画面の凡例はP0/P1/P2、ベンダー自身の集計APIの `CommentDetails` は `p0`/`p1`/`p2` の3キーで `p3` を持たない。我々の環境ではP1=23件・P2=6件(全件バッジ付き)。P3該当の指摘が集計から落ちるのか `p2` に混入するのかは、実レスポンスを見ないと判定できない。
  → **fail-closed: 優先度を処置の可否に使わない(J12)。**全指摘に処置を要求する。ベンダーの集計値を「カバーできている」の証拠にしない(J13)。
- **C-2 レビューの枠(quota) —— 確定不能。**料金ページの `Code Reviews / 5h` 列は全プランで `Not available`(数値が無い)。アナリティクス画面が示すのは `週間利用上限`。5時間ウィンドウの一時撤廃が2026-07-13に公表されたが、継続しているかは確認できていない。「公式ページに `/5h` 列があるから5h枠が存在する」という推論は成立しない。枠の共有範囲(リポジトリ/ユーザー/組織)の定義も公式に無い。
  → **fail-closed: 枠の大きさ・リセット周期を一切前提にしない。**「いつでも、予告なく、半日単位で使えなくなりうる」として設計する。Codexの沈黙は常に赤(§5.2)。マージ前に必ず1回はCodexが通ることを要求するが、**通るまで待つ**のであって、通らないから通す設計にはしない。
- **C-3 レビューモデルの固定/選択 —— 確定不能。**公式ドキュメント・設定ファイルの網羅キー一覧・個人/リポジトリ設定画面の閉じた列挙・GitHub側の出力面のいずれにも、GitHub Code Reviewのモデルを選択する手段が無い。ただし「およそいかなる手段でも選択できない=固定である」への格上げは確定不能。アナリティクスには `codex-auto-review` というモデル名が現れるが、選択可能な設定かは分からない。
  → **fail-closed: レビューの品質・観点の安定性を前提にした設計をしない。**「このモデルならこの種の欠陥は必ず拾う」という仮定をどこにも置かない。だから§3で、機械が止められる欠陥をレビューに残さない。**モデルが黙って入れ替わっても、CIの側は同じ判定を出し続ける。**

その他の fail-closed:

- **陽性証拠が取れない = 未実行。**「否定の証拠が無いこと」を成功にしない(§5)。
- **想定外の値は失敗に倒す。**check run の `conclusion` は7値+`null`だがdocs側は `stale` にも言及があり、列挙同士が食い違っている。列挙に無い値が来たら緑にしない。
- **`bypass_actors` が `null` でも「バイパス者がいない」と読まない。**権限が無いと `null` が返り、「いない」と「見えない」が同じ値に潰れる。Ruleset検査は `rules/branches` 側で「適用中のルールが0件でないこと」を陽性に確認する。
- **`combined status` の `state` で判定しない。**ステータスが1件も無いコミットは `success` ではなく `pending` になり、「成功」と「何も出ていない」が潰れる。`total_count` を見る。

## 10. 実装に踏み込んでいないことの自己点検

本草案に含めていないもの(意図的に外した):

- `.coderabbit.yaml` の具体的な設定値(キー名は判定の根拠として引用したが、書くべき値は指定していない)
- workflow YAML の具体的な差分、job名、`needs` の具体的な構成
- 関門ジョブのスクリプトコード、APIレスポンスのパース処理、正規表現
- Ruleset の具体的なJSON、required check の具体的な名前
- mutation testing / 等価性テスト / 権限マトリクス駆動テストの、ファイル配置とフレームワーク選定
- canary PR の頻度、通知先

含めたのは「何を、どの信号で、どちら側に倒して判定させるか」まで。
1点だけ境界が近いのは §4 の「`if:`/pathフィルタを掛けない」「`needs` の `skipped` を失敗扱いにする」で、これは実装の指示に見えうる。ただし**この2つは判定の意味論そのもの**(skipをどちらに倒すか)であり、これを外すと設計が空になるため残した。具体的なYAMLの書き方は書いていない。

## 11. 隔離の逸脱

**1件ある。**

- あるBashコマンドの先頭に `cd /tmp 2>/dev/null;` を付けて実行した(その後にcurl+jqをパイプしたコマンド)。**`/tmp` へのカレントディレクトリ移動を1回行った。**
  - **ファイルの列挙・読み取り・検索は一切行っていない。**`ls` / `cat` / `grep` は実行しておらず、当該コマンドの出力には `/tmp` 配下の内容が1文字も含まれていない(出力はGitHub OpenAPIのjq結果のみ)。
  - 意図は作業ディレクトリの明示であり、`/tmp` 配下の情報を得る目的ではなかった。以降のコマンドでは `cd` を付けていない。
  - 影響範囲: 本草案のどの行も `/tmp` 配下の内容を根拠にしていない。

他の隔離条件については逸脱していない —— `.claude/skills/pr-review-flow/**`、`docs/pr-review-flow-details.md`、`.coderabbit.yaml`、`.github/workflows/**` は開いていない。`reitojike/stage-tracker` に到達するツール呼び出し(`gh issue`/`gh pr`/`gh api`/`git log`/`git show`/`git diff`/WebFetch)は1度も行っていない。`gh api` は `apps/chatgpt-codex-connector` と `repos/github/rest-api-description/commits/main` の2件で、いずれもowner/nameを明示している。`AGENTS.md` / `CLAUDE.md` の `## Code Review Rules` 節、Draft/Readyの流れ、`pr-review-flow` skillへの参照は、本草案のどの行の根拠にも使っていない(Draftを使わない判断J2は、台帳と一次情報から独立に導出した)。
