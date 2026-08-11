# Codexのモデル階層をローカル設定で使い分ける

`docs/model-routing.md`「階層の対応」の Sol / Terra / Luna を、実際のCodexモデルに結び付けるための
ローカル設定。**この文書には具体的なモデル名(バージョン付きslug)を書かない。**
理由は `docs/model-routing.md`「モデル名を文書に固定しない」にあるので、ここには書き写さない。

**Codex CLIを階層別に呼び分ける前に読む。**

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

**プロジェクト直下の `.codex/config.toml` に `model` を書かない。プロファイルより優先される。**
codex-cli 0.147.0 での実測:

- `$CODEX_HOME/config.toml` の `[projects.<絶対パス>] trust_level = "trusted"` に**入っている**
  プロジェクトでは、`.codex/config.toml` が読まれる。`model` を書くと、
  **`-p` でプロファイルを指定してもそちらが勝つ**(`-p terra` を付けても
  `.codex/config.toml` の `model` が使われた)。**階層指定が黙って無効になる**
- 信頼済みに**入っていない**プロジェクトでは `.codex/config.toml` は読まれない。
  未知のキーを入れて `codex exec --strict-config` を実行してもエラーにならない
  (信頼済みなら同じキーで `unknown configuration field` になる)

**「今は効いていない」を根拠にしない。**信頼済みかどうかで挙動が変わり、
信頼済みへの昇格は `.codex/config.toml` を触らなくても起きる。
`.codex/` は `.gitignore` 済み(issue #90)でCIからも見えないので、
**この取り違えを機械が検出する経路は無い。**下記「効いていることの確認」で毎回見る。

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

## 呼び出し方

```bash
codex exec -p terra "..."
```

**プロファイルの指定漏れはエラーにならない。**指定しなければ既定のモデル(実測では最上位階層)が
使われ、警告も出ずに正常終了する。ローカルの呼び出しなのでCIからは観測できず、
`AGENTS.md`「壊れたらCIが赤くなることで品質を担保する」の外側にある。
**CLIでCodexを呼ぶときは常に `-p` を付ける**、を運用側の規律として持つしかない。
(MCP経由の扱いは次節「階層を指定できるのはCLIだけ」を参照。MCPには `-p` に相当する
指定口自体が無いので、この規律の対象外である)

## 階層を指定できるのはCLIだけ

**`mcp__codex__codex`(MCP)経由ではプロファイル名による階層の指定ができない。**
codex-cli 0.147.0 で考えられる経路をすべて実測した(issue #163)。

| 試した経路 | 結果 |
| --- | --- |
| ツール引数の `config: { profile: "<階層名>" }` | **エラー。**`profile` は廃止済みのキーで、turnに入る前に設定のロードが失敗する |
| MCPサーバーを `codex -p <階層名> mcp-server` で起動する | **エラー。**`--profile` は `mcp-server` には適用できないと明示的に拒否される |
| MCPサーバーを `codex -c model="<slug>" mcp-server` で起動する | **起動はするが効かない。**ツール呼び出しで作られるセッションは既定のモデルのままだった |
| ツール引数の `model` に実モデルslugを直接渡す | **効く**(rolloutログで確認) |

**唯一効いた最後の経路は採らない。**階層名 → slug の変換を呼び出し側に持つことになり、
これは #114 で「作らない」と決めたルーター層そのものだからである。
`.mcp.json` はリポジトリにコミットされるので、そこにslugを書くのは
`docs/model-routing.md`「モデル名を文書に固定しない」にも反する。

したがって**階層を選んでCodexに渡す呼び出しは、すべてCLI(`codex exec -p <階層名>`)で行う。**
MCP経由を使ってよいのは、既定のモデルで構わない限定的な呼び出しだけである。
**MCP経由の指定漏れはCLIより悪い。**CLIの `-p` 漏れは規律で防げるが、
MCPには `-p` に相当する指定口が無いので、**規律でも防げない。**
MCPが解決する既定プロファイルは、CLIで `-p` を省略したときと同じ経路をたどる
(上記「呼び出し方」の「指定しなければ既定のモデル(実測では最上位階層)が使われる」がそのまま
MCPにも当てはまることを、今回のベースライン実測(issue #163)でも確認した)。
`agent:terra` / `agent:luna` の作業をMCPで投げると、黙って最上位階層を消費する。

**MCPが無反応になったときは、同じMCP呼び出しを繰り返さない。**
エラー文言が返っているなら `docs/model-routing-details.md`「失敗の分類」に掛ける。

**何も返らない場合は分類できないが、CLIへ切り替える前にMCP側の処理が実際に終了しているかを
確認する。**stdio経由のMCPは、応答が返らないことと処理が停止したことが同義ではない
([MCP仕様のcancellation節](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports))。
確認せずにCLIを起動すると、`codex exec` のバックグラウンド化が引き起こした二重実行
(#138)と同じ失敗をMCP側で再現しかねない。worktreeの変更・rolloutログ・Issue/PRへの
投稿状況など、処理が実際に進行・完了しているかを示す痕跡を確認してから切り替える。

**確認できたら、同じ内容を1回だけ `codex exec -p <階層名>` に渡す。そのCLI呼び出しの結果も
同じ「失敗の分類」に掛ける。**上限到達など既存の分類に該当するならそちらの対応(同階層への
即フェイルオーバー等)に従い、**分類できない場合に限り**通常の3回ルール(`AGENTS.md`)に従う。

**MCPから別の階層へ黙ってフォールバックしない**(Solの見解、issue #163)。

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
