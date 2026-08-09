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

**プロジェクト直下の `.codex/config.toml` には書かない。効かない。**
codex-cli 0.147.0 での実測: プロジェクト直下の `.codex/config.toml` はCodex CLIの設定として
読まれていない。未知のキーを入れて `codex exec --strict-config` を実行してもエラーにならず、
一方で同じキーを `$CODEX_HOME` 側のプロファイルに入れると
`unknown configuration field` で失敗する。`model` を書いても使用モデルは変わらない。
なお `.codex/` は `.gitignore` 済みである(issue #90)。

## テンプレート

```toml
# stage-tracker: 論理階層 terra (確定した仕様どおりの実装・テスト・レビュー反復)
# 詳細は docs/codex-profiles.md
model = "TERRA_MODEL_SLUG"
```

`TERRA_MODEL_SLUG` の部分に、その階層に対応する現行のモデルslugを入れる。
`sol` / `luna` も同じ形で、コメントの階層名だけ差し替える。

**slugの一覧は `codex debug models` の出力(JSON)から取る。**codex-cli 0.147.0 で確認。
`debug` はサブコマンドが版によって入れ替わりうるので、通らなければ
`codex debug --help` で現行のサブコマンド名を確認するか、対話セッションのモデル選択と
[Codex Models](https://learn.chatgpt.com/docs/models) の一覧を突き合わせる。
どの経路で取ったslugでも、下記「効いていることの確認」を通すまで採用しない。

## reasoning effort は書かない

各モデル固有の既定に任せる(`docs/model-routing.md`「モデル名を文書に固定しない」の
「既定を上げない」)。

**ただしこれには前提条件がある。`$CODEX_HOME/config.toml`(ベース設定)に
`model_reasoning_effort` を書かないこと。**プロファイルはベース設定に**重ねる**方式なので、
ベース側にeffortが書かれているとプロファイルで省略しても継承され、
「モデル固有の既定に任せる」が成立しない。この前提が守られているかは下記の確認手順で見る。

## 呼び出し方

```bash
codex exec -p terra "..."
```

**プロファイルの指定漏れはエラーにならない。**指定しなければ既定のモデル(実測では最上位階層)が
使われ、警告も出ずに正常終了する。ローカルの呼び出しなのでCIからは観測できず、
`AGENTS.md`「壊れたらCIが赤くなることで品質を担保する」の外側にある。
**Codexを呼ぶときは常に `-p` を付ける**、を運用側の規律として持つしかない。

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
  (ベース設定かプロファイルにeffortが書かれている)

3階層とも一度ずつ実行して、3つとも意図どおりのモデルになることを確認する。
1つだけ確かめて残りを推測しない。
