# Codexのモデル階層をローカル設定で使い分ける

`docs/model-routing.md`「階層の対応」の Sol / Terra / Luna を、実際のCodexモデルに結び付けるための
ローカル設定。**この文書には具体的なモデル名(バージョン付きslug)を書かない。**
理由は `docs/model-routing.md`「モデル名を文書に固定しない」にあるので、ここには書き写さない。

**Codexへ階層を指定して委譲する前に読む(MCP・CLIのどちらでも)。**

## プロファイル名

`sol` / `terra` / `luna` の3つ。`agent:*` ラベル、Projectの `Model` フィールド、
`docs/model-routing.md` の階層表と**同じ語彙をそのまま使う。**
`judgment` / `implementation` / `mechanical` のような別語彙を新設しない。
ラベルからコマンドへの変換表が要らなくなり、対応の取り違えが起きる場所が消える。

**この3つは不変の論理IDとして扱い、現行のモデル世代名との一致を保証しない。**
モデルが世代交代したら、書き換えるのは下記プロファイルファイルの中身だけで、名前は変えない
(`docs/model-routing.md`「モデル名を文書に固定しない」を、名前そのものにも適用する)。

## 置き場所

`$CODEX_HOME/<プロファイル名>.config.toml`(既定の `CODEX_HOME` は `~/.codex`)。
つまり `sol.config.toml` / `terra.config.toml` / `luna.config.toml` の3ファイル。

**`$CODEX_HOME/config.toml` の中に `[profiles.<名前>]` ブロックを書く形式ではない。**
codex-cli 0.147.0 の `codex exec --help` は `-p, --profile` を
「`$CODEX_HOME/<name>.config.toml` をベースのユーザー設定に重ねる」と説明しており、
独立ファイル形式が現行の仕様である。**形式が変わっていないかは `codex exec --help` の
`--profile` の行で確かめられる**(古い記憶に引きずられやすい箇所なので、
下記「効いていることの確認」まで通すこと)。

**リポジトリには置かない。**バージョン付きのモデルslugを含むため。
新しい環境ではこの3ファイルを手で作り直す(下記テンプレート)。

**プロジェクト直下の `.codex/config.toml` に `model` を書かない。CLIの `-p` より優先される。**
codex-cli 0.147.0 での実測:

- `$CODEX_HOME/config.toml` の `[projects.<絶対パス>] trust_level = "trusted"` に**入っている**
  プロジェクトでは、`.codex/config.toml` が読まれる。`model` を書くと、
  **`-p` でプロファイルを指定してもそちらが勝つ**(`-p terra` を付けても
  `.codex/config.toml` の `model` が使われた)。**階層指定が黙って無効になる**
- 信頼済みに**入っていない**プロジェクトでは `.codex/config.toml` は読まれない。
  未知のキーを入れて `codex exec --strict-config` を実行してもエラーにならない
  (信頼済みなら同じキーで `unknown configuration field` になる)

**この禁止は「`model` キーを書くな」であって、「ファイル自体を置くな」ではない。**
`model` 以外の用途(`mcp_servers` の登録など)でこのファイルを置くこと自体は妨げない
(issue #166実測: メインチェックアウトの `.codex/config.toml` は `mcp_servers.codex` の
登録のみを持ち `model` を含まない状態で運用されており、無害だった)。

**「今は効いていない」を根拠にしない。**信頼済みかどうかで挙動が変わり、
信頼済みへの昇格は `.codex/config.toml` を触らなくても起きる。
`.codex/` は `.gitignore` 済み(issue #90)でCIからも見えないので、
**この取り違えを機械が検出する経路は無い。**下記「効いていることの確認」で毎回見る。

**信頼設定はworktreeのサブディレクトリにも継承される**(issue #166実測)。
`$CODEX_HOME/config.toml` の `trust_level = "trusted"` はメインチェックアウトの絶対パスにしか
無いが、`.claude/worktrees/<name>` はその配下にあるというだけで信頼済みとして扱われた。
**ただし現時点でworktree内に独自の `.codex/config.toml` を置く運用は導入していない。**
必要になった場合は改めて判断する。

## テンプレート

```toml
# stage-tracker: 論理階層 terra (確定した仕様どおりの実装・テスト・レビュー反復)
# 詳細は docs/codex-profiles.md
model = "TERRA_MODEL_SLUG"
```

`TERRA_MODEL_SLUG` の部分に、その階層に対応する現行のモデルslugを入れる。

`sol` / `luna` も同じ形で作る。**差し替えるのは階層名だけではない。
カッコ内の役割の説明も、その階層のものに書き換える**(`docs/model-routing.md`「階層の対応」の
「責任」列をそのまま使う)。階層名だけ替えると、Terraの役割説明が
`sol.config.toml` に残って表と食い違う。

**slugの一覧は `codex debug models` の出力(JSON)から取る。**codex-cli 0.147.0 で確認。
`debug` はサブコマンドが版によって入れ替わりうるので、通らなければ
`codex debug --help` で現行のサブコマンド名を確認するか、対話セッションのモデル選択と
[Codex Models](https://learn.chatgpt.com/docs/models) の一覧を突き合わせる。
どの経路で取ったslugでも、下記「効いていることの確認」を通すまで採用しない。

## reasoning effort は書かない

各モデル固有の既定に任せる(`docs/model-routing.md`「モデル名を文書に固定しない」の
「既定を上げない」)。

**ただしこれには前提条件がある。プロファイル以外のどこにも `model_reasoning_effort` を
書かないこと**(`$CODEX_HOME/config.toml` のベース設定、および信頼済みプロジェクトの
`.codex/config.toml`)。プロファイルはベース設定に**重ねる**方式なので、
省略しても他所に書かれた値が残り、「モデル固有の既定に任せる」が成立しない。
この前提が守られているかは下記の確認手順で見る。

## 階層をCodexへ渡す(既定はMCP)

**階層指定を含むClaude→Codexの委譲は、`mcp__codex__codex`(MCP)を既定経路とする。**
CLI(`codex exec -p <階層名>`)は、下記「MCP経路が失敗したときの扱い」に述べる
限定的なフォールバックの場合のみ使う。

issue #163では、MCPにプロファイル名を直接渡す経路が無いことを実測した
(下記「プロファイル名を直接渡す経路は無い」)。issue #166では、その制約を踏まえて
「既存プロファイルから値を1回読み、MCPの `model` 引数へ渡す」動的解決が成立するかを検証し、
成立を確認した。**この節はissue #166の結論であり、旧結論(階層指定はCLI限定)を置き換える。**

### 階層名からslugを解決する

`scripts/resolve-codex-tier.mjs <階層名>` が `$CODEX_HOME/<階層名>.config.toml` を読み、
`model` の値だけを標準出力へ1行返す。

```bash
node scripts/resolve-codex-tier.mjs terra
```

**`package.json` に `yarn` コマンドを持たない。**`AGENTS.md`「ディレクトリ構成」は
`scripts/` の公開の入口を `yarn` コマンドとする(`docs/worktree-policy.md`「リポジトリ運用
スクリプトの置き場所と正本」)が、これは`issue:set-agent`のような**人が必要な時に呼ぶ**
運用スクリプトを指す。このヘルパーは主にエージェント(Claude/Codex)がCodexへの委譲のたびに
呼ぶもので、`yarn run` が既定で混ぜ込むバナー行が値を1行だけ返す契約を壊す
(`yarn --silent` で回避できるが、付け忘れが起きうる呼び方を正式な入口にしない)。
**そのため `yarn` ラッパーを持たせず、常に `node scripts/resolve-codex-tier.mjs` を直接使う。**

このヘルパーの責務は設定解決だけに限定する。

- 入力は `sol` / `terra` / `luna` の固定集合のみを受け付ける。**タスクの内容から階層を選ばない**
- `CODEX_HOME` が未設定または空なら、Codex本体と同じ既定ホーム(`~/.codex` 相当)を解決する。
  相対パスが指定された場合は停止する
- プロファイルファイルが無い/読めない、`model` キーが無い/空文字列/空白のみ/改行を含む、
  `model` 以外のトップレベルキーがある、TOMLとして解析できない、のいずれでも**既定モデルや
  他階層へ黙ってフォールバックせず停止する**(非ゼロ終了、標準出力には何も書かない)。
  改行を含む値を拒否するのは、CLIが `model` を標準出力へ1行だけ返す契約
  (下記「MCP呼び出しで明示すること」)を守るため
- UTF-8 BOM付きのプロファイルも受理する(Codex本体が受理するため)
- MCP呼び出し・階層選択・利用状況判定・リトライ判断は行わない
- 許可するトップレベルキーは `model` だけに絞る。将来プロファイルへ `model_reasoning_effort` 等が
  増えても、**MCP経由でも同等に再現できることを確認して明示的に許可対象へ加えるまでは**
  `UNSUPPORTED_PROFILE_KEY` で停止する(同等性が黙って崩れることを防ぐ)

**実モデルslugは、このヘルパーの呼び出し元プロセス以外へ書き出さない。**
リポジトリ・Issue・PR・運用文書のいずれにも記録しない
(`docs/model-routing.md`「モデル名を文書に固定しない」)。

### MCP呼び出しで明示すること

`mcp__codex__codex` を呼ぶときは、次の2つを**必ず明示的な引数として渡す。**

- `model`: 上記ヘルパーで解決した値
- `cwd`: 委譲対象worktreeの絶対パス

**この2つを渡し忘れる事故は、ヘルパーのfail-closed設計では防げない。**ヘルパーが保証するのは
「設定解決そのものが黙って失敗しないこと」であって、「解決した値をMCP呼び出しへ渡し忘れる」
事故は別の残存リスクとして扱う。

- `model` を省略すると、既定のモデル(実測では最上位階層)が黙って使われる(issue #163)
- `cwd` を省略すると、**メインチェックアウトが既定になる**(issue #166実測)。
  `docs/worktree-policy.md`「ローカル`main`は参照専用」に反する書き込みをCodex経由で
  引き起こしうるので、worktree配下の作業をCodexへ委譲するときは `cwd` を必ず
  対象worktreeの絶対パスにする

### `.codex/config.toml` に対してMCPは安全側

CLIの `-p` は信頼済みプロジェクトの `.codex/config.toml` の `model` に**負ける**
(上記「置き場所」)が、**MCPの `model` 引数はこれに勝つ**(issue #166実測)。
MCP経由であれば、`.codex/config.toml` に `model` が書かれていても階層指定は黙って
無効にならない。

### MCP経路が失敗したときの扱い

CLIへの切り替えは最後の手段であり、**原因を分類する前に切り替えない。**

1. **設定解決失敗**(上記ヘルパーが非ゼロ終了した)。**その場で停止する。**
   既定モデルもCLIも使わない
2. MCPから明示的なエラー文言が返った。`docs/model-routing-details.md`「失敗の分類」に掛ける
3. 上限到達・レート制限・認証/権限・モデル無効など、原因を分類できた。
   分類結果に対応する既存手順へ進む。**同じ処理をCLIで無条件に再試行しない**
4. transport error、timeout、所定時間内にtool resultが返らないなど、
   **MCP経路自体の障害。**次のステップへ進む
5. 上記4の場合、CLIへ切り替える前に、**元のMCP turnが実際に停止した、または
   処理を開始していないと確認できるかを見る。**stdio経由のMCPは、応答が返らないことと
   処理が停止したことが同義ではない
   ([MCP仕様のcancellation節](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports))。
   確認せずにCLIを起動すると、`codex exec` のバックグラウンド化が引き起こした二重実行
   (#138)と同じ失敗をMCP側で再現しかねない。worktreeの変更・rolloutログ・
   取得済みのthread情報・Issue/PRへの投稿状況など、処理が実際に進行・完了しているかを
   示す痕跡で確認する。**確認できない場合はCLIへ切り替えず、Blockedとして報告する**
6. 確認できたら、**同じ階層・同じ内容を1回だけ**
   `codex exec -p <階層名> -m <上記ヘルパーで解決した値> --cd <対象worktreeの絶対パス>`
   にフォールバックする。**`-p` だけに頼らない。**`-p` は信頼済みプロジェクトの
   `.codex/config.toml` の `model` に負ける(上記「置き場所」)が、`-m` は
   `.codex/config.toml` にも勝つ(issue #166実測。カナリア値による検証: `.codex/config.toml`
   に `model` を仕込んだ状態で `-p` と `-m` を併用したところ、rolloutログには `-m` の値だけが
   残り `.codex/config.toml` の値は一切現れなかった)。`-C, --cd <DIR>` は
   「エージェントの作業ルートとして指定ディレクトリを使う」フラグで、`codex exec --help` に
   存在する(issue #166実測、codex-cli 0.147.0)。
   **別階層や既定モデルへ黙って切り替えない**(Solの見解、issue #163)
7. CLIフォールバックの結果も、同じ「失敗の分類」に掛ける。上限到達など既存の分類に
   該当するならそちらの対応(同階層への即フェイルオーバー等)に従う
8. どの分類にも一致しない場合は、「失敗の分類」表の`不明`行のとおり連続リトライせず、
   `docs/model-routing-details.md`「『不明』に分類したときの扱い」に従う(記録範囲は
   同文書「エラー原文の記録範囲」を参照。`AGENTS.md`の3回ルールは、同じ判断ややり方を
   3回試して解決しないときのものであり、分類不能なエラーへの繰り返し再試行を許すものではない)

**CLIフォールバック自体にも、CLI固有の注意がそのまま残る。**タイムアウトの明示、出力の回収、
`ps` / `jobs` による生存確認の必要性は、フォールバック1回分については変わらない
(`docs/model-routing-details.md`「上限到達時に読む手順」)。

### プロファイル名を直接渡す経路は無い

**`mcp__codex__codex` の引数でプロファイル名(`sol` 等)を直接指定する経路は無い。**
codex-cli 0.147.0 で考えられる経路をすべて実測した(issue #163)。

| 試した経路 | 結果 |
| --- | --- |
| ツール引数の `config: { profile: "<階層名>" }` | **エラー。**`profile` は廃止済みのキーで、turnに入る前に設定のロードが失敗する |
| MCPサーバーを `codex -p <階層名> mcp-server` で起動する | **エラー。**`--profile` は `mcp-server` には適用できないと明示的に拒否される |
| MCPサーバーを `codex -c model="<slug>" mcp-server` で起動する | **起動はするが効かない。**ツール呼び出しで作られるセッションは既定のモデルのままだった |
| ツール引数の `model` に実モデルslugを直接渡す | **効く**(rolloutログで確認) |

**だからと言って呼び出し側がslugの対応表を持つわけではない。**上記「階層名からslugを解決する」
のとおり、slugの正本は常にプロファイルファイルであり、呼び出し直前に1回読むだけである。
これは #114 で「作らない」と決めた汎用ルーター・常駐サービスには当たらない
(issue #166でのSolの見解: ルーターは「どの階層を選ぶか」を判断するものであり、
今回のヘルパーは選択済みの論理IDを機械的に展開するだけ)。

## 効いていることの確認

**「設定ファイルを書いた」は確認にならない。**設定が効いていない状態でも設定ファイルは書ける。
実際に使われたモデルはrolloutログに残るので、そこまで見る。

```bash
# 1. 実行し、表示された session id を控える
codex exec -p terra "Reply with exactly OK. Do not use any tools."

# 2. 対応するrolloutログを開く(日付ディレクトリは実行日)
#    $CODEX_HOME/sessions/<年>/<月>/<日>/rollout-*-<session id>.jsonl
```

そのファイルの `type` が `turn_context` の行を見る。

- `payload.model` が、意図した階層に対応するモデルslugになっていること
- `payload.collaboration_mode.settings.reasoning_effort` が `null` であること。
  `null` でなければ、上記「reasoning effort は書かない」の前提条件が破れている

どちらかが期待と違ったら、**上書きしている側を先に探す。**
プロファイルより優先されるものが2種類ある(どちらもcodex-cli 0.147.0で実測)。

- **同じコマンドの `-m` / `--model` と `-c model=...`。**`-p` と併用すると、こちらが勝つ
- **信頼済みプロジェクトの `.codex/config.toml`**(上記「置き場所」)

3階層とも一度ずつ実行して、3つとも意図どおりのモデルになることを確認する。
1つだけ確かめて残りを推測しない。

**MCP経由でも確認手段は同じ(rolloutログ)である。**`mcp__codex__codex` に
`model`(上記ヘルパーの出力)と `cwd` を明示して呼び、返ってきたセッションのrolloutログで
`payload.model` と `payload.collaboration_mode.settings.reasoning_effort` を同様に確認する。

**ただし上書きの優先順位はCLIと逆になる。**MCP経由では `.codex/config.toml` の `model` は
ツール引数の `model` に**勝てない**(issue #166実測)。CLIで発生する「`-p` を指定したのに
`.codex/config.toml` に黙って上書きされる」事故は、MCP経路では起きない。
確認すべきなのは「`model` / `cwd` を渡し忘れていないか」であり、
上記「MCP呼び出しで明示すること」を参照する。

## `.agents/` へのskill複製(既知の副作用)

プロジェクト直下に、未追跡の `.agents/skills/<name>/SKILL.md` が出現することがある
(issue #213で `.agents/skills/pr-review-flow/SKILL.md` として観測)。
`.claude/skills/**` の複製だが、`Claude`→`Codex`、`.claude`→`.Codex`、`CLAUDE.md`→`AGENTS.md`
という**機械的な文字列置換**を伴っており、実在しないファイル・パスを指す形で正本と食い違う
(例: `claude-review.yml` → 実在しない`Codex-review.yml`)。**内容を正本として読んではならない。**

**生成元は、Codexデスクトップアプリの「外部エージェントのインポート同期」機能である可能性が高い
(断定はできていない)。**根拠(issue #213調査時点)。

- `.agents/plugins/marketplace.json` + `.agents/skills/<name>/SKILL.md` という構成は、
  Codex本体が使う「plugin/skillのマーケットプレイスリポジトリ」自体のレイアウトと一致する
  (`$CODEX_HOME/.tmp/plugins/README.md` に同じ構成の説明がある)
- `$CODEX_HOME/config.toml`(プロジェクト直下の`.codex/config.toml`とは別のファイルで、
  リポジトリのディレクトリツリーの外にある。上記「置き場所」参照)に
  `[desktop] external-agent-import-sync-enabled = true` が入っており、実際にClaude Codeの
  セッション履歴が同ホーム配下へインポートされていることも確認できた
  (`$CODEX_HOME/external_agent_session_imports.json`)
- Codexデスクトップアプリの設定画面に「インポートしたエージェント設定」という項目があり、
  「前回のインポート」の表示が `.agents/` の生成時刻(20:53)に近いタイミングを指していた
  (呼び出し元が2026-08-12に画面上で確認)

**ただし再現実行による実証はできていない。**Codexが2026-08-18までレート制限中で生成を意図的に
再現する実行ができないため、上記は状況証拠にとどまる。

**対処: 呼び出し元がCodexデスクトップアプリの設定でこの機能(Claudeからのインポート)を
オフにした(2026-08-12。ローカル個人設定なのでリポジトリには反映されない)。**これにより
再発しなくなる見込みだが、他の開発者・別マシンではこの設定が有効なままの可能性があるため、
リポジトリ側の備え(下記)は残す。

**運用: 出現したら削除する。**`.agents/`は`.gitignore`済み(issue #213)なので誤コミットはされないが、
削除するまでは正本(`.claude/skills/**`)との乖離が残る。`.agents/skills/**`を新たな正本として
採用しないこと、`.claude/skills/**`が常に正本であることは、issue #213で決めた本節固有の運用である
(`AGENTS.md`「ディレクトリ構成」の複製禁止は`common/`のドメインロジックを対象にした別のルールで、
本件はそこには含まれない)。

**このリポジトリ内の自動レビューは`.agents/`を読まない(issue #213確認済み)。**
`claude-review.yml`はAGENTS.mdをbase SHAから読み、変更分類の対象パスも`.claude/skills/**`に
固定している。`.mcp.json`にも`.agents/`を読み込む指定は無い。**読まれるリスクがあるのは、
Codexデスクトップアプリ/CLIそのものが自分のセッションで`.agents/skills/**`をローカルスキルとして
拾う経路である**(上記「対処」で軽減済みだが未実証)。「出現したら削除する」運用は、
その未実証の経路への備えとして残す。
