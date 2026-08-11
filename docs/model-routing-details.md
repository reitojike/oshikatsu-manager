# Claude / Codex 併用の根拠と、上限到達時の手順

`docs/model-routing.md` の規則が**なぜそうなっているか**(併用の目的、階層の対応が
両社の公式ガイダンスと一致すること、出典)と、**Codexがエラーを返して実際に切り替えを
検討するときの手順**。
**振り分けを決めるだけならこの文書は読まなくてよい。**配分の方針を見直すとき、
または上限到達に遭遇したときに読む。

規則そのものは `docs/model-routing.md` にある。ここには書き写さない。

## なぜ併用するか

**Claude Pro に含まれる Claude Code** と **ChatGPT Plus に含まれる Codex** の、
**2つの利用枠を1つのプロジェクトで消費する**ため。どちらの利用枠もアカウント内の
他の利用(チャット等)と共有されるプールであり、Web/デスクトップ/CLIの操作を合算して消費する。
片方に寄せると、そちらの利用枠に達した時点で作業が止まる。目的は速さではなく、
止まる頻度を下げることにある。したがって配分は意図的に非対称にする
(`docs/model-routing.md`「既定はCodex優先」)。

## 階層の対応が公式ガイダンスと一致する

**この対応は偶然ではなく、両社の公式ガイダンスが同じ軸で書かれている。**
Codexの公式ドキュメントは Sol を "complex, open-ended work" で "extra analysis, judgment, or polish"
を要するもの、Terra を "the pragmatic all-rounder"、Luna を
"specific, high-volume tasks when you know what a good result looks like" と説明する
([Codex Models](https://learn.chatgpt.com/docs/models))。
Anthropic のモデル選択マトリクスは最上位モデル(Opus)を "Complex agentic coding ... multihour
autonomous coding agents, large-scale refactoring"、最下位モデル(Haiku)を "high-volume
intelligent processing ... sub-agent tasks" とする
([Choosing the right model](https://platform.claude.com/docs/en/docs/about-claude/models/choosing-a-model))。
Claude Code のサブエージェント文書も "Control costs by routing tasks to faster, cheaper models like Haiku"
と書く([Subagents](https://code.claude.com/docs/en/sub-agents))。
**「判断は上位、機械的作業は下位」は自前の運用則ではなく、両プロバイダの公式指針と一致している。**

## モデル名とreasoning effortを設定側に置く理由

世代名の入れ替わりが速いこと。
Codexの公式changelogは頻繁に世代交代を案内しており([Codex changelog](https://developers.openai.com/codex/changelog))、
世代名を運用ルールに埋めると、モデルが変わるたびにルール本体を書き直すことになる
(この節がまさにその具体例を書いてしまうと、節の主張自体が自己矛盾で陳腐化する)。
**この文書自身も同じ禁止の対象である**(規則は `docs/model-routing.md`「モデル名を文書に固定しない」)。

reasoning effort を設定側に置くのも同じ理由による。公式の指針は
"Use the lowest reasoning effort that produces the result you need."
([Codex Models](https://learn.chatgpt.com/docs/models))で、
Anthropic側も effort の調整を「モデルを切り替えるより良いレバーであることが多い」としている
([Choosing the right model](https://platform.claude.com/docs/en/docs/about-claude/models/choosing-a-model))。
この2つの指針が、effortの既定を上げないことの根拠である。

## 呼び出しを細かく割らない理由

利用上限はモデル・タスクの大きさや複雑さ・実行環境に応じて消費され、
ローカルのメッセージとクラウドのchatが5時間の共有窓を単位として共有する
([Codex Pricing](https://learn.chatgpt.com/docs/pricing)、
"local messages and cloud chats share a five-hour window")。
**この5時間窓とは別に、追加の週次上限が適用されることがある**
(同上、"Additional weekly limits may apply.")。
turn単位で区切られる保証はないが、少なくとも「進行中のturnは上限到達後も継続できる」
("If you reach your usage limits during an active turn, the agent will be able to continue working
on that turn, subject to fair use limits."、同上)ため、細切れに投げて呼び出し回数を増やすほど、
上限に当たる境界を不必要に増やすことになる点は変わらない。

## 上限到達時に読む手順

**Codexがエラーを返した時点で読む節。**振り分けを決めるときには要らない
(規則の入口は `docs/model-routing.md`「上限到達時のフェイルオーバー」)。

### 事前には検知できない

Codexの残量確認手段は、対話セッション内の `/status` と
[使用量ダッシュボード](https://chatgpt.com/codex/settings/usage) の2つだけで、
**`codex mcp-server` 経由の非対話呼び出しではどちらも使えない**
([Codex Pricing](https://learn.chatgpt.com/docs/pricing))。
上限は「呼んで失敗して初めて分かる」。

> **プロファイルによる階層指定はCLIの機能で、MCP経由の呼び出しでは解決されない。**
> MCP経由は実モデルIDを要求するため、役割名で呼び分けるには別途ルーター層が要る
> (#114 では作らないと判断した)。**階層を確実に効かせたいときは
> `codex exec -p <階層名>` のCLI直接呼び出しを使う**(`docs/codex-profiles.md`)。

事前に軽い1往復を投げて生存確認する運用は**採らない。**ping成功の直後に本命のturnで
上限に達しうるので可用性を保証せず、ping自体が枠と時間を消費する(Solの見解、issue #67)。
**Codex優先のまま投げ、失敗したら切り替える。**

### 失敗の分類

**「エラーが返った = 上限」ではない。**切り替える前に必ず分類する。

**下表の判別文字列は、行ごとに実測状況が異なる。**元々はSol自身がこの環境からモデル名・上限値・
エラー文言を確認できず「推測で埋めない」と明言した上で(issue #67)、`usage limit` / `rate limit` /
`quota` という概念上の区別を公式ドキュメントの用語([Codex Pricing](https://learn.chatgpt.com/docs/pricing))
から起こした、全行暫定の表だった。**2026-08-11、上限到達に初めて遭遇し(#153)、`codex exec`
(CLI)経由で実際に返った文言を確認した。**同日、`mcp__codex__codex`(MCP)経由でも同一の
上限到達に遭遇し(issue #86 のコメント)、文言が一致することを確認した。それ以外の行
(認証・権限/サンドボックス拒否/コンテキスト超過/一時的なレート制限/不明)は依然として未確認で、
判別文字列は推測に基づく暫定のままである。行ごとの実測状況は表の最終列で読み分ける。
**最初にある分類に実際に遭遇したら、判別に使った実際の文言をこの表に追記して更新する。**
(未確認の行にはまだこれが適用される)

**上から順に判定し、最初に一致した行を採用する(複数該当してもそれ以降は見ない)。**
`rate limit` と `retry-after` が明示されていれば、たとえ本文に `quota` や `try again` が
同時に含まれていても「一時的なレート制限」を優先する。フェイルオーバー(横移動)は
不可逆コストが伴う一方、待つ・再試行するだけの誤判定は安全側だからである。

| 分類 | 判別 | 対応 | 実測状況 |
| --- | --- | --- | --- |
| 認証・権限 | ログイン切れ、`codex` が見つからない、MCPサーバー未接続 | 人間に依頼。Claudeへ切り替えても直らない | 未確認(推測) |
| サンドボックス拒否 | ファイル書き込み・ネットワークの拒否 | 呼び出し時のパラメータを直す。切り替えない | 未確認(推測) |
| コンテキスト超過 | 入力が長すぎる旨 | 引き継ぎを圧縮して**同じ階層で1回だけ**再試行 | 未確認(推測) |
| 一時的なレート制限 | `rate limit` かつ短い retry-after が示される | 待つか、別のIssueに移る。切り替えない | 未確認(推測) |
| 上限到達 | 本文に `You've hit your usage limit`(実測)、`try again at <時刻>`(実測)。`limit reached` / `quota` は未確認 | 同階層のClaudeへ即フェイルオーバー | **`codex exec`(CLI)・`mcp__codex__codex`(MCP)の両経由で実測**(2026-08-11、#153・#86)。文言は両経路で一致した |
| 不明 | 上のどれでもない | **連続リトライしない。**原文をIssueに貼って上位へ返す | 対象外(このリストに一致しない場合の受け皿) |

**上限到達行の実測文言は、`codex exec`(CLI)経由と `mcp__codex__codex`(MCP)経由の
両方で確認済みで、一致している。**経路が違えばラッパーの整形が異なりうるという
未確認の前提を置いていたが、少なくとも上限到達エラーについては今回の実測で文言が一致した
(他の分類でも経路差が無いとは限らない。分類ごとに実測するまでは未確認のまま扱う)。
また、`try again at Aug 16th, 2026 8:32 AM` のようなリセット時刻表記が UTC かローカル
タイムゾーンかは**未確認**であり、断定しない。

**この実測例のリセット時刻は、実測日(2026-08-11)から見て約5日後であり、
「呼び出しを細かく割らない理由」で述べた5時間の共有窓とは周期が異なる。**
Codex Pricingは5時間窓とは別に「追加の週次上限が適用されることがある」と明記しており
(前述、"Additional weekly limits may apply.")、今回の実測はこの週次(またはそれに類する
長い周期)の上限に該当した可能性が高い。ただし応答本文だけからはどちらの上限に当たったかを
確定できないため、断定はしない。

**文字列判定だけで断定しない。**上限とレート制限の区別が付かないときは、
**1回だけ同じ内容で再試行し、同じエラーなら上限として扱う。**
**上限到達以外の行の判定はまだ実エラー文言で検証されていない(前述)。**実際に取り違いが起きた場合は、
安全側(レート制限扱い・待つ)に倒れていたはずで、逆方向(誤ってフェイルオーバー)より実害が小さい。

### 手順

1. **上限と判定したら、そのセッション中はCodexを利用不可としてマークする。**
   以後は同階層のClaudeへ直接送る。呼び直して確かめない
2. **横に移す。**`Sol → Opus`、`Terra → Sonnet`、`Luna → Haiku`。
   **これはエスカレーションではない。**Terraが上限で止まったときの移動先はSolではなくSonnetである
3. **3回ルールを適用しない。**上限は試行回数では解消しない
   (`AGENTS.md` の3回ルールは「同じことを試して失敗する」ためのもの)。1回で切り替える
4. **Issueにコメントする。**どの階層がどのエラーで止まったか、リセット時刻が読み取れたならその時刻、
   どこまで終わっているか。Projectの `Status` は `In Progress` のまま(進められるので `Blocked` にしない)
5. **ラベルとProjectの `Model` を切り替え先に書き換える。**担当が変わったので、
   `AGENTS.md`「Issue全体の担当が変わったとき」の扱いに従う。**書き換える対象のIssueは、
   Codex側のラベルが実際に付いていたIssueそのもの。**Sub-issueに分担して渡していた作業が
   フェイルオーバーで止まった場合はそのSub-issue自身のラベルを書き換え、親Issueには触れない
   (`docs/task-management.md`「Issue内でモデル階層を分担する」、
   `AGENTS.md`「親Issueは判断を下したモデルのまま残す」と同じ)
6. **リセット時刻を過ぎるまでCodexに戻さない。**時刻が読み取れなかった場合は、
   人間が明示的に解除するまで戻さない

### 引き継ぎに何を足すか

フェイルオーバー時の引き継ぎは、`docs/model-routing.md`「プロバイダをまたぐ引き継ぎ計画」の
内容に加えて、**Codexがどこまで進めたか**を書く。これが無いと受け取った側が最初からやり直す。
**Issueコメント(上記「手順」4)への記録だけでは不十分で、次を引き継ぎ先へのprompt本文にも
そのまま含める**(受け取る側はコールドスタートで、Issueコメントを能動的に遡って読むとは限らない)。

- 失敗した具体的な箇所(どのプロバイダ・階層で、何を渡したときに止まったか)
- 実際に返ったエラー文言の原文と、上表のどの分類に判定したか
- リセット時刻が読み取れていればその時刻。読み取れなければ「不明」と明記する
- 変更済みのファイルと、その変更が意図どおりか未確認か
- 実行したコマンドと結果(緑だったもの・赤いままのもの)
- Codexが判断を保留した箇所

## 引き継ぎに4項目を足す理由

`docs/model-routing.md`「プロバイダをまたぐ引き継ぎ計画」が足す4項目(実行環境と権限 /
現在の作業状態 / 必読資料と読む順序 / 差し戻し契約)について。

**この4項目は儀式ではなく、両プロバイダのサブエージェントに共通する前提そのものである。**
Claude Code の公式文書は "Each subagent starts with a fresh, isolated context window. It doesn't
see your conversation history, the skills you've already invoked, or the files Claude has already read."
と書く([Subagents](https://code.claude.com/docs/en/sub-agents))。
Codex側も同じで、リポジトリ全体が自動でコンテキストに入るわけではなく、
**「ファイルを読める」ことと「最初から内容を知っている」ことは別**である(Solの見解、issue #67)。
実行環境と作業状態が特に効くのは、**渡し先が書き込めない環境なのに実装タスクを渡す事故**と、
**他のエージェントの未コミット変更を自分の変更と取り違える事故**を、どちらも機械が検出しないため。

## 配分を振り返るときに読む手順

**月次の振り返りを回すときに読む節。**規則(頻度・記録先・実施者・記録項目・見直しのトリガ)は
`docs/model-routing.md`「配分を月次で振り返る」にある。ここには書き写さない。

### なぜ月次で、必須項目を3つに絞るのか

**月次にするのは、配分の見直しが月単位の契約(Claude Pro / Codex Plus)に紐づく判断だからである。**
週次にすると母数が足りず、比の揺れを傾向と読み違える。逆に四半期では、
上限到達が起きた月の事情を思い出せなくなる。

**必須項目を `gh` とIssueコメントで取れるものに限るのは、器を手作業で回せる重さに保つためである。**
ローカルログを機械集計すればモデル別・日別のトークン量まで取れるが(#134で実測済み)、
**集計スクリプトを正式にリポジトリへ置くかは保留中で**(#134 / #118、
`docs/worktree-policy.md`「リポジトリ運用スクリプトの置き場所と正本」)、
そこに依存する項目を必須にすると1回目から回らなくなる。

### 集計する

```bash
# ラベル内訳の材料。closed / open と agent:* の組で数える
gh issue list --state all --limit 300 --json number,state,labels

# 過去の振り返り。タイトル規約で引く
gh issue list --state all --search '消費実績の振り返り in:title'
```

上限到達とフェイルオーバーは、`docs/model-routing.md`「上限到達時のフェイルオーバー」に従って
**該当Issueのコメントに記録されている前提で数える**(上記「手順」4・5)。
**記録が無い月は「0回」ではなく「記録が無い」と書く。**運用が回っていない可能性と区別が付かないため。

### 記録した数字を読み違えないための制約

**次の3つを添えずに数字だけ残すと、翌月以降に読んだ側が誤った結論を出す。**

- **ラベル内訳はこのリポジトリしか数えていないが、消費枠はアカウント単位である。**
  Claude Code側は他プロジェクトでの利用も同じ枠を食う(#134で全プロジェクトを対象に実測。
  このリポジトリだけに絞ると大きく過小になる)。
  **「このリポジトリでの件数比」と「枠の消費比」は別物**として読む
- **金額も契約枠の消費率も取得できない。**ローカルログのどちらにも価格・請求額・残枠は記録されていない
  (#134)。**「上限に当たったか」は実際に止まった事実でしか観測できず、事前にも事後にも%では測れない**
  (残量確認手段そのものの制約は上記「事前には検知できない」)
- **`claude-review` の消費は対話セッションと同じレート制限ウィンドウを共有する**(#95で実測)。
  Claude側の枠は対話とCIで食い合うので、Issue件数だけを見るとClaude側の消費を過小評価する

**トークン量を任意で添える月も、上の3つは同じように掛かる。**加えてCodex側は、
同一ログ内に先行する `turn_context` 行が無くモデルを特定できないイベントが残る(#134で実測)。
**この分をどのモデルにも配賦せず「不明」として別に出す。**推測で埋めない。

## 出典

`docs/model-routing.md` とこの文書の判断は、Codex側(Sol、`mcp__codex__codex` 経由で2往復)の
見解と、以下の公式ドキュメントを突き合わせて決めた。やり取りの内容は issue #67 のコメントに記録がある。

- [Codex Models](https://learn.chatgpt.com/docs/models) —— Sol / Terra / Luna の使い分けと reasoning effort
- [Codex Pricing](https://learn.chatgpt.com/docs/pricing) —— 利用上限の窓、turn途中で上限に達した場合、残量の確認手段
- [Codex changelog](https://developers.openai.com/codex/changelog) —— モデル世代の retire と置換
- [Choosing the right model](https://platform.claude.com/docs/en/docs/about-claude/models/choosing-a-model) —— Opus / Sonnet / Haiku の選択軸と effort パラメータ
- [Subagents](https://code.claude.com/docs/en/sub-agents) —— サブエージェントのコンテキスト分離とモデル指定
