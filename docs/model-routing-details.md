## なぜ併用するか

**Claude Pro に含まれる Claude Code** と **ChatGPT Plus に含まれる Codex** の、
**2つの利用枠を1つのプロジェクトで消費する**ため。どちらの利用枠もアカウント内の
他の利用(チャット等)と共有されるプールであり、Web/デスクトップ/CLIの操作を合算して消費する。
片方に寄せると、そちらの利用枠に達した時点で作業が止まる。目的は速さではなく、
止まる頻度を下げることにある。したがって配分は意図的に非対称にする(下記「既定はCodex優先」)。

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

理由は世代名の入れ替わりが速いこと。**本節も含め、この文書に個別のモデル名やretire日を書かない。**
Codexの公式changelogは頻繁に世代交代を案内しており([Codex changelog](https://developers.openai.com/codex/changelog))、
世代名を運用ルールに埋めると、モデルが変わるたびにルール本体を書き直すことになる
(本節がまさにその具体例を書いてしまうと、この節の主張自体が自己矛盾で陳腐化する)。
実際のretireスケジュールはchangelogを都度参照すること。

reasoning effort も同様に設定側で決める。公式の指針は
"Use the lowest reasoning effort that produces the result you need."
([Codex Models](https://learn.chatgpt.com/docs/models))で、
Anthropic側も effort の調整を「モデルを切り替えるより良いレバーであることが多い」としている
([Choosing the right model](https://platform.claude.com/docs/en/docs/about-claude/models/choosing-a-model))。
**上限節約のためにeffortを常に最大にするのは逆効果**なので、既定を上げない。

**Codexには「境界の明確な1タスク」を渡す。**ping・本命・追加説明・修正指示のような
不要な分割をしない。利用上限はモデル・タスクの大きさや複雑さ・実行環境に応じて消費され、
5時間の共有窓を単位とする([Codex Pricing](https://learn.chatgpt.com/docs/pricing))。
turn単位で区切られる保証はないが、少なくとも「進行中のturnは上限到達後も継続できる」
("If you reach your usage limits during an active turn, the agent will be able to continue working
on that turn, subject to fair use limits."、同上)ため、細切れに投げて呼び出し回数を増やすほど、
上限に当たる境界を不必要に増やすことになる点は変わらない。

### 事前には検知できない

Codexの残量確認手段は、対話セッション内の `/status` と
[使用量ダッシュボード](https://chatgpt.com/codex/settings/usage) の2つだけで、
**`codex mcp-server` 経由の非対話呼び出しではどちらも使えない**
([Codex Pricing](https://learn.chatgpt.com/docs/pricing))。
上限は「呼んで失敗して初めて分かる」。

事前に軽い1往復を投げて生存確認する運用は**採らない。**ping成功の直後に本命のturnで
上限に達しうるので可用性を保証せず、ping自体が枠と時間を消費する(Solの見解、issue #67)。
**Codex優先のまま投げ、失敗したら切り替える。**

### 失敗の分類

**「エラーが返った = 上限」ではない。**切り替える前に必ず分類する。

**下表の判別文字列は暫定である。**Sol自身がこの環境からモデル名・上限値・エラー文言を確認できず
「推測で埋めない」と明言しており(issue #67)、`usage limit` / `rate limit` / `quota` という概念上の
区別は公式ドキュメントの用語([Codex Pricing](https://learn.chatgpt.com/docs/pricing))から起こした
ものであって、`mcp__codex__codex` 経由で実際に返るエラー文言そのものを確認済みではない。
**最初にこの分類のいずれかに実際に遭遇したら、判別に使った実際の文言をこの表に追記して更新する。**

**上から順に判定し、最初に一致した行を採用する(複数該当してもそれ以降は見ない)。**
`rate limit` と `retry-after` が明示されていれば、たとえ本文に `quota` や `try again` が
同時に含まれていても「一時的なレート制限」を優先する。フェイルオーバー(横移動)は
不可逆コストが伴う一方、待つ・再試行するだけの誤判定は安全側だからである。

| 分類 | 判別 | 対応 |
| --- | --- | --- |
| 認証・権限 | ログイン切れ、`codex` が見つからない、MCPサーバー未接続 | 人間に依頼。Claudeへ切り替えても直らない |
| サンドボックス拒否 | ファイル書き込み・ネットワークの拒否 | 呼び出し時のパラメータを直す。切り替えない |
| コンテキスト超過 | 入力が長すぎる旨 | 引き継ぎを圧縮して**同じ階層で1回だけ**再試行 |
| 一時的なレート制限 | `rate limit` かつ短い retry-after が示される | 待つか、別のIssueに移る。切り替えない |
| 上限到達 | 本文に `usage limit` / `limit reached` / `quota` と、リセット時刻や `try again` の言及 | 同階層のClaudeへ即フェイルオーバー |
| 不明 | 上のどれでもない | **連続リトライしない。**原文をIssueに貼って上位へ返す |

**文字列判定だけで断定しない。**上限とレート制限の区別が付かないときは、
**1回だけ同じ内容で再試行し、同じエラーなら上限として扱う。**
**この表の判定はまだ実エラー文言で検証されていない(前述)。**実際に取り違いが起きた場合は、
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

フェイルオーバー時の引き継ぎは、下記「プロバイダをまたぐ引き継ぎ計画」の内容に加えて、
**Codexがどこまで進めたか**を書く。これが無いと受け取った側が最初からやり直す。
**Issueコメント(上記「手順」4)への記録だけでは不十分で、次を引き継ぎ先へのprompt本文にも
そのまま含める**(受け取る側はコールドスタートで、Issueコメントを能動的に遡って読むとは限らない)。

- 失敗した具体的な箇所(どのプロバイダ・階層で、何を渡したときに止まったか)
- 実際に返ったエラー文言の原文と、上表のどの分類に判定したか
- リセット時刻が読み取れていればその時刻。読み取れなければ「不明」と明記する
- 変更済みのファイルと、その変更が意図どおりか未確認か
- 実行したコマンドと結果(緑だったもの・赤いままのもの)
- Codexが判断を保留した箇所

**この4項目は儀式ではなく、両プロバイダのサブエージェントに共通する前提そのものである。**
Claude Code の公式文書は "Each subagent starts with a fresh, isolated context window. It doesn't
see your conversation history, the skills you've already invoked, or the files Claude has already read."
と書く([Subagents](https://code.claude.com/docs/en/sub-agents))。
Codex側も同じで、リポジトリ全体が自動でコンテキストに入るわけではなく、
**「ファイルを読める」ことと「最初から内容を知っている」ことは別**である(Solの見解、issue #67)。
実行環境と作業状態が特に効くのは、**渡し先が書き込めない環境なのに実装タスクを渡す事故**と、
**他のエージェントの未コミット変更を自分の変更と取り違える事故**を、どちらも機械が検出しないため。

## 出典

この文書の判断は、Codex側(Sol、`mcp__codex__codex` 経由で2往復)の見解と、
以下の公式ドキュメントを突き合わせて決めた。やり取りの内容は issue #67 のコメントに記録がある。

- [Codex Models](https://learn.chatgpt.com/docs/models) —— Sol / Terra / Luna の使い分けと reasoning effort
- [Codex Pricing](https://learn.chatgpt.com/docs/pricing) —— 利用上限の窓、turn途中で上限に達した場合、残量の確認手段
- [Codex changelog](https://developers.openai.com/codex/changelog) —— モデル世代の retire と置換
- [Choosing the right model](https://platform.claude.com/docs/en/docs/about-claude/models/choosing-a-model) —— Opus / Sonnet / Haiku の選択軸と effort パラメータ
- [Subagents](https://code.claude.com/docs/en/sub-agents) —— サブエージェントのコンテキスト分離とモデル指定
