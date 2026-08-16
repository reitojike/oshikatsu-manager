# 草案B: コストから逆算したレビュープロセス

> **これは検討記録であり、正本ではない。**#256 段階1で、逆算の起点を「コスト」に固定して
> **独立に**書かれた3草案のうちの1本。他の2草案を見ずに書かれている。
>
> 評価と統合方針は [`integration.md`](./integration.md)、統合案のプロセス定義は
> [`integrated-process.md`](./integrated-process.md)。**採用された設計が決まった時点で、そちらが正本になる。**

## 1. 要約

**1つの変更につき、AIレビューは自動で1回だけ走らせる。ゲートはCIだけが持つ。**

- 変更は `main` 保護のためPRを経由するが、**Draftを経由せず最初からReadyで1回だけ開く。**
  `opened` と `ready_for_review` は別イベントであり(github-platform 軸1)、2段階にすると
  同じ変更に対してボットが2回起動する。
- 自動で走るレビュアーは**1本だけ**。残り3本は自動発火させない。
- 指摘は**1ターンで4つの面をまとめて読み**、**1コミットに束ねて1回だけpushする。**
- 2巡目は条件付きで**最大1回**。2巡で閉じないPRはレビューを足さず、変更を割る。
- **どのAIレビューもマージのゲートにしない。**Copilotは公式に「マージを止めない」と明記され、
  Codexはcheck run/commit statusを作る権限を持たない。自前workflowをrequiredにすると
  「起動しないと永久pending」の穴に触る(github-platform 軸6)。ゲートは
  `yarn lint && yarn typecheck && yarn test` を回すCIだけが持つ。
- 結果として、**CodeRabbitとCodexの枠は一切消費しない(0回)。**Copilotの枠に収まるかは
  **事前に判定できない**(残量を返すAPIが存在しないため)。収まらない場合に何が起きるかは9節。

## 2. 起点をどう使ったか

コストを起点にするために、次の順序で組んだ。**検知可能性は一度も判断基準にしていない。**

1. **通貨を先に列挙した**(3節)。「コスト」を単一の量として扱うと、待ち時間を減らすために
   枠を余計に払うような交換が見えなくなる。
2. **通貨ごとに支配要因を1つに絞った**(3節)。ほとんどの通貨は
   **「1変更あたり何回起動するか」と「何巡するか」の2つ**に還元された。
   したがって設計の主要な操作対象は**発火契機と巡回の停止条件**であり、
   レビューの中身(観点、深さ、モデル)は主要変数ではないと判断した。
3. **レビュー0回から始めた**(5節)。0回で成立しない理由が言えるものだけを足し、
   足すたびにどの通貨をいくら払ったかを書いた。
4. **削った結果を9節に列挙した。**「捨ててよい」とは主張していない。何を捨てたかの明示である。

**確定不能なものはfail-closed(保守的な側)に倒した。**具体的には ——
Codexのレビュー枠は残量も上限も読めないので「いつでも0でありうる」として扱い、
自動レビューから外した。指摘の重大度の値域はベンダー間で4通りに食い違うので、
**ベンダーの重大度を分岐条件に使わない。**Copilotのプランは台帳に無いので
「自動レビューが要求されないことがある」として扱う(7節・No.8)。

## 3. コストの通貨と、それぞれの支配要因

| # | 通貨 | 支配要因 | 台帳の根拠 |
| --- | --- | --- | --- |
| a1 | **実装エージェントと共有のベンダー枠** | Codex Cloudのレビューは、実装で使う枠と同じ`週間利用上限`の内訳として計上される(`使用状況の内訳`の凡例に`GitHub Code Review`が1面として現れる)。**レビューに払った分だけ実装に使える分が減る。** | codex-cloud 軸7(A2)、軸7 C1実測(8時間46分07秒、観測された試行はすべて拒否) |
| a2 | **レビュー専用の外部枠** | 起動回数そのもの。CodeRabbitは「1時間あたり」のローリング枠+7日窓のFair Usage、Copilotはpremium request/AI Credits(+privateリポジトリではActions分) | coderabbit 軸7(A)、copilot 軸7(A) |
| b | **`main`に入るまでの待ち時間** | **並走本数ではなく、逐次の巡回数。**同時に走らせても待ちは増えないが、1回pushして待ち直すたびに(ボット応答+CI)が丸ごと1回積まれる | copilot 軸10(C2、check-run実測 約69秒) |
| c | **エージェントのターン・トークン** | (指摘件数)×(読む面の数)×(巡回数)。**面が4つに分かれている**(review / inline comment / issue comment / check-run)ため、素朴に見に行くと1巡あたり4回以上のAPI往復になる | github-platform 軸9(C2、片方だけ見ると取りこぼす)、codex-cloud 軸9・軸10(C2) |
| d | **PO(1名)の時間** | 人に渡す判断の件数。diffを読まない前提なので、diffの正しさに関する問いはPOに渡せない。渡せるのは「どちらとも取れる判断」だけ | 前提(タスク条件) |
| e | **手戻り** | 検査の順序。決定論的検査(lint/型/テスト)より先にAIレビューを走らせると、CIで落ちる変更にレビュー枠を払う。Codex公式も「機械的な検査はCIに残せ」と明記 | codex-cloud 軸8(A) |

**支配要因の集約:** a1・a2・b・c・eはすべて「**1変更あたりの起動回数**」と
「**巡回数**」の2変数に還元される。dだけが別軸で、これは「人に渡す判断の件数」で決まる。

## 4. プロセスの定義

**単位はPRを使う。**`main` はRulesetで保護され直接pushが禁止されている以上、変更は必ず
ブランチ経由で入る。4本のレビューツールはいずれも発火契機をPRイベントの上に定義しており、
PRを使わない単位を選ぶと発火の仕組みを自前で書くことになり、設定コストと自前の枠を払う。
**1 Issue = 1 branch = 1 PR = 1 open イベント。**

| 段階 | 発火契機 | 担当 | 出力の面 | 次へ進む条件 | 終了条件 |
| --- | --- | --- | --- | --- | --- |
| **S0 ローカルゲート** | 変更を書き終えた時点(エージェント自身の判断) | 実装エージェント(worktree内) | ローカルの標準出力のみ。GitHubには何も出さない | `yarn lint && yarn typecheck && yarn test` が全緑 | 緑になるまでpushしない。ここで落ちる変更にレビュー枠を1回も払わない |
| **S1 PRを1回開く** | S0通過 | 実装エージェント | PR(**最初からReady。Draftを経由しない**) | PRがopenされた | — |
| **S2 CIと自動レビュー(並走)** | PRの`opened`イベント | GitHub Actions(CI)/ **自動レビュアー1本のみ** | check-run(CI)、PR review + inline comment(レビュー) | CIが完了し、かつレビューの痕跡が届いたか待ち上限に達した | **CIのみがrequired check。**レビューはrequiredにしない |
| **S3 集約読み取り(1ターン)** | S2の完了 | 実装エージェント | 読むだけ。出力なし | 4つの面(PR review / inline comment / issue comment / check-run)を**1ターンでまとめて読む**。待ち上限(単一の定数)を超えたら痕跡0でも先へ進む | 痕跡が0件なら「AIレビューは走らなかった」とPR本文に1行記録して次へ |
| **S4 一括処置** | S3に処置対象がある | 実装エージェント | **1コミット・1push** | すべての指摘を2値に分類し(下記)、A分類のみ直す。B分類はPR本文に1行ずつ残す | 指摘ごとにpushしない。分類の妥当性判断でPOを呼ばない |
| **S5 条件付き2巡目** | S4のpushが**判定ロジック / テスト / 権限・RLS / `common/`** に触れた場合**のみ** | 自動レビュアー1本 | S2と同じ | S3へ戻る(**1回限り**) | 文言・ドキュメントのみの修正では回さない |
| **S6 マージ** | required checks が緑 かつ 未処置のA分類が無い | 実装エージェント | `main` | squash merge。worktreeを畳む | — |
| **S7 打ち切り** | 2巡しても閉じない | 実装エージェント → PO | Issue | **レビューを足さない。**変更を割って別Issueにする | 3巡目に入らない |

**指摘の分類は2値。**ベンダーの重大度(Codex `P0`〜`P3`、Copilot `High/Medium/Low`と`[CRITICAL]`、
CodeRabbit `Potential issue`/`Nitpick`)を**そのまま分岐条件に使わない**(6節 No.8)。

- **A(このPRで直す)** — 指摘が次のいずれかに当たると読めるとき:
  `as`/`any`/抑制コメントで型・lintエラーを黙らせている / 判断ロジックが `common/` の外にある、
  または2経路に複製されている / 権限・RLS・論理削除・既定の非公開設定の意味が変わる /
  型を二重定義している / 否定側のテストが無い。
- **B(直さない)** — 上記に当たらないすべて。PR本文に1行残すだけで、Issueは作らない
  (Issueを作ると起票と追跡でPO時間とターンを払う)。

**PO確認は1経路だけ。**「成果物どうしが矛盾している/どちらとも取れる判断が要る」ときに限り、
S4を止めてPOに問う。**レビュー指摘の妥当性そのものはPOに渡さない。**

**自動レビューを走らせない変更クラス:** 生成物のみの変更(`supabase/types.ts` の再生成など)。
これはCIが差分を検出して落とせるので、機械が止められる。ベンダー既定の除外
(ロックファイル、`dist/`、`*.d.ts`、`generated/` 等)には手を入れず、そのまま従う。

## 5. 最小形から足した分と、その対価

**出発点: レビューを1回も走らせない。**ゲートはCIのみ。この形が払うコストは、
CIの実行時間(通貨b)とエージェントのpush 1回(通貨c)だけで、ベンダー枠(a1/a2)とPO時間(d)は0。

| 足したもの | 足さないと成立しない理由 | 払った対価 |
| --- | --- | --- |
| **+1: 自動レビュー1回(PR open時)** | CIが機械的に止められない欠陥クラスが残る。`common/` に置くべき判断ロジックの複製、否定側テストの欠落、権限/RLSの意味の誤り、既定値(参加登録の非公開)の反転は、**いずれも赤くならずに通る。**「機械が止められるか」を先に問うと、ここだけ止められない | a2を1回/変更。b は並走なので実質+0(CIの完了待ちに吸収される)。c を+1ターン(S3のトリガ判定) |
| **+2: 集約読み取り1ターン(S3)** | 出力の面が4つに分かれており、片方だけ見ると指摘を丸ごと取り落とす(github-platform 軸9、codex-cloud 軸9)。面ごとに見に行くと1巡で4往復になる | c を+1ターン(4往復を1ターンに畳んだので、素朴な形より-3) |
| **+3: 条件付き2巡目(S5、最大1回)** | S4の修正自体が新しい欠陥を入れうる。特に判定ロジック・テスト・権限に触れた修正は、修正前より悪くなりうる | a2を+1回(条件成立時のみ)。b を+1巡(ボット応答+CI) |
| **+4: PO確認の1経路** | 成果物の矛盾は、方針が製品の意図と逆でもCIが緑になる。ここだけ機械が止められない | d を+1件(発生時のみ)。b は不定 |

**足さなかったもの:** 2本目以降の自動レビュアー、push時の自動再レビュー、Draft段階での反復、
指摘0件まで回す反復、レビュー実行の事前quota確認、独自のパス除外設定、
マージ後に走る後追いアクション。理由はすべて6節。

## 6. この草案が下した判断の一覧

| # | 判断 | 選んだもの | 選ばなかったもの | 理由 | 根拠(台帳の軸/一次情報) |
| --- | --- | --- | --- | --- | --- |
| 1 | 変更を運ぶ単位 | PR(1 Issue = 1 PR) | PRを使わない単位(直push、まとめてリリースブランチ) | `main`が保護され直接pushが禁止。4ツールの発火契機はすべてPRイベント上に定義されており、PRを外すと発火を自前で書く=設定コストと自前枠を払う | 前提 + codex-cloud 軸1、copilot 軸1、coderabbit 軸1(いずれもA) |
| 2 | マージのゲート | CI(`lint`/`typecheck`/`test`)のみ | AIレビューをrequired checkにする | Copilotは公式に「承認にならず、required approvalsに数えられず、マージを止めない」と明記。Codexは`checks:read`/`statuses:read`しか持たずcheck runもcommit statusも作れない。CodeRabbitのcommit statusはスキップ時も`success`/`Review completed`を返す(fail-open)。自前workflowをrequiredにすると「起動しなければ永久pending」の穴に触れる | 7節 No.1・No.2で当たり直し済み。coderabbit 軸6(C2)、github-platform 軸6(A) |
| 3 | 自動レビュアーの本数 | **1本** | 2本以上の並走 | 並走は待ち時間(b)を増やさないが、**指摘件数×分類のターン(c)と枠(a2)を本数分払う。**さらに指摘が増えるほどS4の修正が増え、S5の条件成立確率が上がって巡回が伸びる | 3節の支配要因 |
| 4 | その1本をどれにするか | **GitHub Copilot code review** | Codex Cloud / CodeRabbit / claude-code-action | (i) Codexは**実装エージェントと同じ週間枠**を食い、我々の環境で8時間46分にわたり観測された試行がすべて拒否、クレジット残0。(ii) CodeRabbitは既定でpushごとに再レビューし、枠が「1時間あたり」+7日窓のFair Usageで絞られる。**我々のプランが台帳に無い**ためfail-closedでFree(PRレビュー1件/時・要約のみ)を想定せざるを得ない。(iii) claude-code-actionは自前workflowなのでActions分と自前の枠を払い、発火条件も自分で書く。(iv) Copilotは`opened`で自動発火し、追加設定なしに`CLAUDE.md`/`AGENTS.md`をレビューに取り込む | codex-cloud 軸7(C1/A2)、coderabbit 軸7(A、7節 No.6で再確認)、copilot 軸4「2026-07-17以降 `REVIEW.md`/`GEMINI.md`/`CLAUDE.md` も自動認識」(A) |
| 5 | PRの開き方 | 最初からReadyで1回 | Draftで開いてからReady化 | `opened`と`ready_for_review`は別イベント。Copilotの自動レビューは「Openとして作成」と「Draft→Openへの初回切替」の両方が発火事象であり、2段階にすると同じ変更で2回起動する | github-platform 軸1(A)、copilot 軸1(A) |
| 6 | push時の再レビュー | 有効にしない | pushごとの自動再レビュー | 1変更あたりの起動回数を、pushの回数に比例させてしまう。CodeRabbitの`auto_incremental_review`は既定`true`、Copilotのruleset側にも`review_on_push`がある | 7節 No.6で当たり直し済み |
| 7 | 修正のpush | 1コミットに束ねて1回 | 指摘ごとにpush | pushごとに(ボット応答+CI)が1巡積まれる。指摘nに対して素朴に対応するとn巡になる | 3節・通貨b |
| 8 | 指摘の重大度の扱い | 自前の2値(A/B) | ベンダーの重大度をそのまま分岐に使う | Codexだけで公式(P0/P1のみ)・他社実測(P1/P2/P3)・アナリティクス画面(P0/P1/P2)・集計スキーマ(p0/p1/p2)の**4つが食い違う**。我々の環境の実測は全件バッジ付きでP1=23/P2=6。値域が確定しないものを分岐条件にするとfail-openになる | codex-cloud 軸8(A/C1/C2)、軸10(B)、軸8 A2、copilot 軸5(`High/Medium/Low`と`[CRITICAL]`の関係が未確認) |
| 9 | 反復の停止条件 | 2巡上限。3巡目は変更を割る | 指摘0件になるまで回す | 巡回数は待ち・枠・ターンの3通貨を同時に押し上げる唯一の変数。上限を定数で切る | 3節 |
| 10 | 実行前の残枠確認 | しない | 叩く前にquotaを見に行く | GitHub REST の全スキーマを走査して`remaining`を持つのは`rate-limit`のみ(対照として検出できている)。Codex側も残枠を返すAPIが公開されていない。**確認は不可能で、試みるだけターンを払う** | 7節 No.4で当たり直し済み |
| 11 | 除外パスの設定 | ベンダー既定に従い、独自設定を書かない | 自前の除外リストを持つ | 設定を書けば設定の保守が要る。ロックファイル・生成物・`dist/`・`*.d.ts`は既定で除外される | copilot 軸8(A) |
| 12 | PO確認の範囲 | 「判断が割れたとき」1経路のみ | レビュー指摘の妥当性判断もPOに渡す | POは1名でdiffを読まない前提。diffの正しさを問うと答えが返らないまま待ちが積まれる | 前提(タスク条件) |
| 13 | マージ後に走る機能 | 使わない(チェックボックス系の後追い機能を有効にしない) | Finishing Touches / Post-Merge Actions を使う | **マージ時が新しい自動発火契機になる。**「PRがdefaultブランチにマージされた時点で、チェックが入ったままのアクションを全部実行する」と公式が明記しており、1変更あたりの起動回数を後ろ側から増やす | coderabbit 軸1(A、Post-Merge Actions) |
| 14 | レビュー未実行の扱い | マージをブロックしない(記録するだけ) | 「レビューが走ったこと」をマージ条件にする | 走らなかったことの確定には追加の待ちとターンが要り、しかも走らせ直す手段がquota次第で存在しない。**捨てた検知は9節に明示** | 7節 No.8 |

## 7. 「このツールはXができない」に依拠した箇所と、一次情報の当たり直し記録

| 依拠した主張 | 台帳のどの行か | 当たり直した一次情報(取得日) | 結果 | 設計への影響 |
| --- | --- | --- | --- | --- |
| **No.1** Codexはcheck run / commit statusを作れない(=ゲートにできない) | codex-cloud 軸5「`checks`と`statuses`がreadのみ」(B)、軸6「GitHubの標準CI面に完了シグナルが存在しない」(B) | `gh api apps/chatgpt-codex-connector`(2026-08-16取得。版固定できないため取得日で固定)→ `permissions` は `actions:write, checks:read, contents:write, emails:read, issues:write, metadata:read, pull_requests:write, statuses:read, workflows:write`。**App権限マニフェストは閉じた情報源** | **支持された** | 判断2を補強。Codexを自動レビュアーに選ばない判断4の補強にもなる |
| **No.2** Copilotのレビューはマージを止められない/承認にならない | copilot 軸5(A) | <https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review> の**raw HTMLを直接取得**(2026-08-16。要約ツールを経由していない)→ 逐語で `Copilot always leaves a "Comment" review, not an "Approve" or "Request changes" review.` と `Its reviews do not count toward required approvals and will not block merging.` を確認 | **支持された** | 判断2の主根拠。AIレビューをゲートにする設計を最初から捨てた |
| **No.3** checkからPRを辿る構造的手段が無い(=自前突き合わせが必要) | github-platform 軸10「`pull_requests`配列は当てにならない」(B) | <https://raw.githubusercontent.com/github/rest-api-description/67c14c7efb01cdeeac0ecd8cee9fae8d7a80e2aa/descriptions/api.github.com/api.github.com.json>(commit SHAで固定、2026-08-16取得)→ `check-run.pull_requests.description` は「トリガー元を示すとは限らない」としか言っておらず、**候補列挙を否定していない。**加えて `GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls` が実在(summary: `List pull requests associated with a commit`) | **反証された** | **自前突き合わせを設計に入れていない。**S3はPR番号を自分で持っているので、この経路に依存しない。もし依存させるなら上記エンドポイントを使う |
| **No.4** 残枠を機械的に読む手段が無い(=事前確認できない) | copilot 軸11「残量を直接返すフィールドは無い」(B)、codex-cloud 軸11(A/B) | 同じpinned SHAのOpenAPI全スキーマを走査し、`remaining`/`balance` に一致するプロパティを列挙 → **`rate-limit.remaining` の1件のみ**(APIレート制限)。対照として`rate-limit`が検出できているので走査自体は機能している。billing系8スキーマには`remaining`/`quota`/`limit`のいずれも0件。**OpenAPIは閉じた情報源** | **支持された(GitHub側)。Codex側は認証必須で追試不能=確定不能** | 判断10。**fail-closedで「事前確認しない/できない前提で設計する」**に倒した |
| **No.5** Codexのレビュー回数上限は公開されていない | codex-cloud 軸7「全セルが`Not available`」(A) | <https://learn.chatgpt.com/docs/pricing.md>(2026-08-16取得。版固定URLが無いため取得日で固定)→ Plusプランの `Code Reviews / 5h` 列は全モデル行が `Not available`。脚注に `The usage limits for local messages and cloud chats share a **five-hour window**. Additional weekly limits may apply.` | **支持された** | 8節の「枠に収まるか」を**事前に言えない**と書く根拠。判断4でCodexを自動から外した |
| **No.6**(裏側)CodeRabbitはpushごとに再レビューするのが既定 | coderabbit 軸1「`auto_incremental_review`の既定は`true`」(A) | <https://docs.coderabbit.ai/reference/configuration> のraw HTML(2026-08-16取得)→ 逐語 `Incremental Review \| Re-run the review on each push. Defaults to true.`、`auto_pause_after_reviewed_commits ... Defaults to 5.`、`drafts ... Defaults to false.`。<https://docs.coderabbit.ai/management/plans>(同日)→ `Free 1 3 3 150 N/A` / `Pro 5 5 5 150 50`、`rolling allowance`、`Fair Usage Limits Policy` | **支持された** | 判断6。CodeRabbitを自動レビュアーに選ばない判断4の根拠(プラン不明→fail-closedでFree想定) |
| **No.7** `run_attempt` は再実行の**回数** | github-platform 軸10(C2) | 同じpinned SHA → `Attempt number of the run, 1 for first attempt and higher if the workflow was re-run.` すなわち**試行番号で、初回が`1`** | **反証された** | **実行回数の計数に`run_attempt`を使う設計を入れていない。**入れるなら「初回=1」で読む |
| **No.8** Copilotのquota切れは必ずレビュー本文として現れる(=走らなかったことは本文で分かる) | copilot 軸7「専用の拒否文言を持つレビューが投稿される」(C2、15件)、軸6・軸10(C2) | 同じpinned SHA の `repository-rule-copilot-code-review.description` → `Request Copilot code review for new pull requests automatically if the author has access to Copilot code review and their premium requests quota has not reached the limit.` **自動要求はquotaが上限に達していない場合に行われる**と書かれており、上限到達時は**要求自体が行われない**読みが成り立つ。C2の15件は手動要求由来の可能性を排除できていない | **確定不能**(本文が出る場合と、痕跡が一切出ない場合の両方がありうる) | **fail-closedで「痕跡0件=レビューは走らなかった」を許容する設計にした**(S3で1行記録して先へ進む)。判断14。捨てた検知は9節 |

## 8. 自己コスト見積もり

**1つの変更(1 Issue = 1 PR)あたり。**

| 通貨 | 1巡で閉じる場合 | 2巡目まで行った場合 |
| --- | --- | --- |
| **a1 実装と共有の枠(Codex)** | **0回** | **0回** |
| **a2 レビュー専用の枠** | Copilot 1回 / CodeRabbit 0回 / Codex Cloud 0回 / claude-code-action 0回 | Copilot 2回、他は0回 |
| **b 待ち時間** | (CI実行時間)+(レビュー到着。Copilotのcheck-run実測で約69秒の桁、C2)。並走なので加算ではなく最大値 | 上記の約2倍(pushでもう1巡) |
| **c エージェントのターン** | S0で1〜3(検査が一発で通らなければ増える)、S1で1、S3で1、S4で0(処置なし)、S6で1 → **概ね4〜6ターン** | S4で2〜4、S3をもう1回、S6で1 → **概ね9〜12ターン** |
| **d PO時間** | **0分**(既定) | 0分。判断が割れたときだけ1件 |
| **e 手戻り** | S0で落ちた変更はレビュー枠を1回も払わない=手戻りのコストがCI時間だけに閉じる | 同じ |
| **CI(Actions)** | 1 run + Copilot側のrunner分(privateリポジトリならActions分を消費) | 2 run + Copilot分×2 |

**入力5で確定した枠との突き合わせ:**

- **Codex Cloudの週間枠 — 収まる(消費0)。**これが最も重要な結論である。
  Codexのレビュー枠は実装エージェントの枠と同じプールであり(`使用状況の内訳`に
  `GitHub Code Review` が1面として現れる)、我々の環境では
  **8時間46分07秒にわたり観測された試行がすべて拒否**、`残りのクレジット`は0、
  すなわちクレジットへのフォールバックも効かない。この設計はレビューでCodexを0回しか
  叩かないので、週間枠は**全額を実装に回せる。**
- **CodeRabbitの時間枠・Fair Usage — 収まる(消費0)。**7日窓の閾値にも触れない。
- **Copilotの枠 — 収まるかを事前に判定できない。**
  1変更あたり1〜2回という数字自体は、4本並走(1変更で最大8回以上)に比べれば最小である。
  しかし **(i) プラン別のCopilot code review許容回数が公開されておらず、
  (ii) 残量を返すAPIがGitHub REST に存在しない**(7節 No.4)ため、
  「月にn変更まで収まる」は**この設計からは言えない。**
  **収まらなかった場合、自動レビューの要求自体が行われない可能性がある**(7節 No.8)。
  そのときこのプロセスは止まらず、**AIレビュー0回のままCI緑でマージへ進む。**
  これは意図した挙動であり、捨てた検知として9節に書く。
- **GitHub Actions — 1〜2 run/変更 + Copilot分。**Actionsの上限(同時job数等)には桁で余裕がある。

## 9. 削ったことで検知できなくなるもの

**コスト最小化は必ず何かを捨てている。**この設計で `main` に入りうるようになった欠陥は次のとおり。

1. **AIレビューが1回も走らないままマージされた変更の欠陥すべて。**
   Copilotのquotaが尽きると自動要求自体が行われない可能性があり(7節 No.8)、
   S3は痕跡0件でも先へ進む。**この状態は連続しうる**(枠は時間で回復するが、
   残量を読めないので回復の見込みも立てられない)。
2. **修正pushで新しく入った欠陥。**push時の自動再レビューを切ったため、
   S5の条件(判定ロジック/テスト/権限・RLS/`common/`に触れた)を満たさない修正は
   誰にもレビューされずに入る。**とくに「文言だけ直したつもりが挙動を変えていた」変更。**
3. **2巡目の修正で入った欠陥。**2巡上限なので原理的にレビューされない。
4. **視点の重複が消えたことで落ちるもの。**レビュアーが1本になったので、
   CodeRabbitのリポジトリ全体クローンによる探索、Codexが `AGENTS.md` の観点をそのまま
   引用して指摘する経路、claude-code-actionでの自前観点はすべて自動経路から消えた。
   **リポジトリ固有ルールの違反検出は、Copilotが `CLAUDE.md`/`AGENTS.md` を読む1本に全依存する。**
5. **具体的な欠陥クラス(このリポジトリで実際に起こりうるもの):**
   - `common/` に置くべき判断ロジックが `app/` または `mcp/` に複製され、
     **2経路の片方だけが直った状態**でマージされる。CIは緑のまま。
   - 権限判定・RLSの意味的な誤り。とくに **service_roleキーで書いたテスト**は
     何も検証していないのに緑になる。
   - **参加登録の公開設定の既定を反転させる変更。**テストが無ければ何も赤くならない。
   - **論理削除を物理削除に変える変更。**型もlintも通る。
   - 型の二重定義(生成型/Zod由来型を使わずに手で書いた型)。
   - ドキュメント間の矛盾。読んだ実行者の行動が変わるものでも、CIは止めない。
6. **B分類に落とした指摘。**Issue化しないので追跡されない。
   **同じ指摘が別のPRで繰り返し出ても、繰り返していること自体に気づけない。**
7. **Draft段階が無いことで捨てたもの。**書きかけの差分を一度もボットに見せないので、
   「早い段階で方向の誤りを指摘される」経路が無い。誤った方向のまま完成させると、
   S4の修正が大きくなり、結局2巡目に入って通貨b/cを払う。
8. **待ち上限の打ち切りで捨てたもの。**上限を超えて遅れて届いたレビューは読まれない。
   マージ後のPRに指摘が付いたまま残る。
9. **ベンダー既定の除外パス配下の欠陥。**`dist/`・`*.d.ts`・`generated/`・ロックファイル等。
   ただし `supabase/types.ts` は手編集禁止でCIが差分を検出するため、
   ここは機械が止められる側に残る。
10. **CIそのものを壊す変更。**CIを唯一のゲートにしたので、CI設定を緩める変更が入ると
    ゲート全体が静かに無効化される。この設計はそれを検知する仕組みを持たない。

## 10. 実装に踏み込んでいないことの自己点検

- `.coderabbit.yaml` の具体的な設定値を**書いていない。**
  `auto_incremental_review` / `drafts` / `auto_pause_after_reviewed_commits` /
  `review_on_push` / `review_draft_pull_requests` という**キー名は7節・6節に出てくるが、
  これは「当たり直した一次情報の所在」と「既定値がどちらか」を示すための識別子**であって、
  設定ファイルに書く値としては提示していない。設計としての記述は
  「push時に再レビューさせない」「Draftではレビューさせない」までに留めた。
- workflow YAMLの差分を**書いていない。**required checkの中身も
  「`yarn lint && yarn typecheck && yarn test` を回すCI」までで、jobの分割やmatrixに触れていない。
- スクリプトのコードを**書いていない。**S3の集約読み取りについては
  「4つの面を1ターンでまとめて読む」「痕跡0件なら記録して進む」という**判定の内容**だけを定義し、
  どのエンドポイントをどう呼ぶかの実装は書いていない
  (7節に出てくるエンドポイント名は、当たり直しの記録としての引用である)。
- 待ち上限は「単一の定数として持つ」とだけ書き、**具体的な分数を決めていない。**
  値は実測(CIの実行時間分布)を見てから決める性質のものであり、設計で固定すると外れる。
- 4節の分類基準は**何を止めるか**の定義であり、判定を自動化するかどうかには踏み込んでいない。
- **踏み越えかけた箇所を1つ自己申告する:** 判断4で自動レビュアーを製品名で指定した。
  これは設定作業を1つに確定させる決定であり、実装に近い。ただし
  「どれを選ぶか」はコスト起点の帰結そのものなので設計に残し、
  **選定の理由を製品名ではなく条件(自動発火する / 実装枠と別プール / リポジトリのルールを
  追加設定なしで読む)として書いた。**条件が変われば別の製品に置き換わる。

## 11. 隔離の逸脱

**無し。**

- 開いてはいけないものに触れていない。`.claude/skills/pr-review-flow/**`、
  `docs/pr-review-flow-details.md`、`.coderabbit.yaml`、`.github/workflows/**`、
  `/tmp` 配下、他の一時ディレクトリのいずれも、読み取り・一覧・grepのどれもしていない。
- 到達先が `reitojike/stage-tracker` であるものに触れていない。`gh issue`/`gh pr`/`gh api` の
  リポジトリ系呼び出し、`git log`/`git show`/`git diff`、当該リポジトリのURLへのフェッチを
  1回も行っていない。`gh api` は `apps/chatgpt-codex-connector`(owner/repoを含まない)と
  `repos/github/rest-api-description/commits/main`(owner/nameを明示、第三者の公開リポジトリ)の
  2つだけで、`repos/{owner}/{repo}` 形式の暗黙解決を使っていない。
  C1行が言及する我々のPR番号(#190 / #208 / #210 など)は台帳の記述として読んだだけで、
  当該PRを見に行っていない。
- `AGENTS.md` / `CLAUDE.md` については、`## Code Review Rules` 節、Draft/Readyの流れ、
  `pr-review-flow` skillへの参照を**設計の根拠にしていない。**
  4節のA分類の中身は `## Code Review Rules` ではなく「絶対に守ること」
  (`as`/`any`/抑制コメントの禁止、型の二重定義の禁止、pure関数への切り出し)と
  「このリポジトリ固有の注意」(`common/` の2経路、論理削除、既定の非公開、RLSとservice_role)、
  および「機械が止められるか」の第一原理から引いた。
  重大度の呼称も、あちらのP0/P1を借りずに自前の2値(A/B)を定義している。
  4節でDraftを使わない判断を下したのは、github-platform 軸1の
  「`opened` と `ready_for_review` は別イベント」(等級A)からの帰結であって、
  既存の運用に対する賛否ではない。
