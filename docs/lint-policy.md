# lint / 型の運用方針

lintエラーや型エラーを消そうとする前に読むこと。

## 原則

**人間がdiffを読まない前提で運用している。**うるさく言ってくれる仕組みがなければ、誰も気づかない。
「いちいち厳しい」と感じたら、それは設定が間違っているのではなく、この方針が機能している証拠。

**エラーを消す最短経路を取らない。**`@ts-ignore` や `eslint-disable` は最短経路だが、
使うたびに機械が守ってくれる範囲が静かに減る。根本を直す。

## 導入済みのルール

### プリセット

```js
js.configs.recommended
tseslint.configs.strict        // recommended ではなく strict
next/core-web-vitals
sonarjs.configs.recommended    // sonarjs は recommended が最上位
security.configs.recommended   // security も同じ
```

typescript-eslintで `strict` を選んでいるのは、`any` まわりや非nullアサーションのような
「動くけれど後で困る」書き方をerrorにするため。sonarjs / security が `recommended` なのは
手加減ではなく、この2つには strict プリセットが存在しないため。

### サイズ・複雑さ

```js
"max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
"complexity": ["error", 20],
"max-depth": ["error", 4],
"max-params": ["warn", 6],
"max-nested-callbacks": ["error", 4],
"sonarjs/cognitive-complexity": ["error", 15],
```

引っかかったら、まず**pure関数として切り出せないか**を考える。
分割の口実として無意味に関数を割るのではなく、判断ロジックがI/Oに埋まっていないかを疑う。

### 型の逃げ道

```js
"@typescript-eslint/no-explicit-any": "error",
"@typescript-eslint/no-non-null-assertion": "error",
"@typescript-eslint/consistent-type-assertions": "error",
```

- `as` によるキャストの代わりに**型ガード**を書く: `const isX = (v: unknown): v is X => ...`
- 非nullアサーション `!` の代わりに、nullの場合の分岐を書く

### 型情報を要するルール(4つだけ)

`projectService` を有効にするとTypeScriptのプログラムを丸ごと構築するため重い。
ただしルール数を増やしてもコストはほぼ変わらない(構築が全部)。
**型情報でなければ原理的に捕まえられないもの**に絞って入れている。

```js
"@typescript-eslint/no-floating-promises": "error",   // await の付け忘れ
"@typescript-eslint/no-misused-promises": "error",    // 同期専用APIに渡されたasyncコールバック
"@typescript-eslint/await-thenable": "error",
"@typescript-eslint/no-base-to-string": "error",      // "[object Object]" になる文字列化
```

`strictTypeChecked` を丸ごと入れないのは、大半がスタイル系のルールで、
上記4つのような**実バグ**が大量の指摘に埋もれるため。

### テスト

```js
"sonarjs/assertions-in-tests": "error",
"sonarjs/no-ignored-exceptions": "error",
```

アサーションのないテストと、握りつぶしたcatchはCIで止める。
以前は人間が目で見つけていたもの。

### 層の境界 (`common/` / `lib/` / `app/` / `mcp/`)

`AGENTS.md`「ディレクトリ構成」が定める依存の向きを、`no-restricted-imports` と
`no-restricted-syntax` で固定する(issue #43)。**向きが逆でもTypeScriptは通り、テストも緑になる。**
人間がdiffを読まない前提では、ここを機械が止めないと誰も気づかない。

許す向きは1方向だけ。

```text
app/ ──┐                     app/ と mcp/ は同じ操作の2経路。互いにimportしない
       ├──> common/ (判断)
mcp/ ──┘                     common/ はどこにも依存しない(npmの純粋な
       │                     ユーティリティを除く)
app/ ──┤
       ├──> lib/ (I/O) ──> common/ は型だけ (`import type`)
mcp/ ──┘
```

| 層 | 禁止するimport | 理由 |
| --- | --- | --- |
| `common/` | `app/` `lib/` `mcp/` / Next.js・React系 / `@supabase/*` | 判断ロジック層。何かに依存した瞬間に「Supabaseもブラウザも無しに全ルールをテストできる」(`docs/roadmap.md` フェーズ2の完了条件)が壊れる |
| `lib/` | `app/` `mcp/` / `common/` の値としてのimport(`import type` は可) | I/O層にルールを持たせない。呼び出し側に依存させない |
| `app/` | `mcp/` / `@supabase/*` | クエリは `lib/` に置く。2経路を直結させない |
| `mcp/` | `app/` / Next.js・React系 / `@supabase/*` | stdioサーバーがNext.jsを丸ごと読み込むのを防ぐ |

「Next.js・React系」は `next` `next/**` `next-*` `next-*/**` `react` `react/**`
`react-*` `react-*/**` `@next/*` `@next/**` `@react-*/*` `@react-*/**` を指す。
`next-auth` `react-hook-form` のようなハイフン系や、`@next/env` `@react-three/fiber` の
ようなスコープ付きは `next/**` `react/**` ではマッチしないので、別に列挙している。
**パッケージ名の形が1つ増えるたびに穴が開く種類の設定**なので、
足すときは静的import側(グロブ)と動的import側(正規表現)を必ず対で直す。

`app/` から `lib/` へのimportは**禁止していない。**`app/` が `lib/` のクエリ関数を呼ぶこと自体は
正当なI/O呼び出しで、これを塞ぐと今度はSupabaseクライアントを直接握ったクエリが `app/` に
生えるだけになる。禁止したいのは「importすること」ではなく「結果を使って判断すること」である。

**だからimportの向きだけでは足りない。**判断ロジックの実体である配列操作を、消費側の2層
(`app/` と `mcp/`)で `no-restricted-syntax` により禁止する。`docs/roadmap.md` フェーズ3の
「`app/` から `lib/` のクエリ結果を直接フィルタ・集計するコード」を実際に捕まえているのはこちら。

```text
filter find findIndex findLast findLastIndex flatMap
every some includes indexOf sort toSorted reduce reduceRight
```

`.map()` は描画のための変換として正当なので除いてある。引っかかったら
`common/` のpure関数に切り出す(`AGENTS.md`「ルールをpure関数に切り出す」の
「フィルタ、並び順、検証、集計、権限判定、日付計算」がそのまま対象)。

`includes` / `indexOf` を含めているのは、`ALLOWED_IDS.includes(userId)` が
`ALLOWED_IDS.some((id) => id === userId)` と意味的に同じ**権限判定**だからである。
片方だけ止めても、書きやすいほうへ逃げられるだけで抜け道になる。

**`mcp/` も対象に含めている。**`app/` と同じく `common/` を経由せず `lib/` を直接叩いて
判断する余地があり、そちらだけ古いルールで動き続けるのがこのリポジトリで最も痛い壊れ方
(`AGENTS.md`「MCPサーバーとWeb UIは同じ操作を2経路持つ」)。着手時点で `mcp/` は空なので、
含めるコストはゼロだった。

#### 設定を書くときの落とし穴

- **パッケージ名も `paths` ではなく `patterns` に書く。**`paths` は完全一致しか見ないため、
  `next` を禁止しても `next/headers` がすり抜ける
- **相対パスも塞ぐ。ただし階層数を数えない。**内部モジュールは `@/` エイリアスで書く規約だが、
  `../../lib/x` と書けばエイリアスのパターンをすり抜ける。かといって `../` の個数を
  列挙すると、その数が検出の上限になる(App Routerのルート木は5階層を簡単に超える)。
  `../**/lib` `../**/lib/**` の形で受け、深さに依存しないようにしている。
  先頭に `../` を要求するのでnpmパッケージの深いパスは巻き込まない
  (逆に `**/lib/**` のような広いパターンは巻き込むので使わない)
- **`lib/` の `common/` 制約だけ `@typescript-eslint/no-restricted-imports` を使う。**
  `allowTypeImports` は拡張ルール側にしかない。型を二重定義しない方針(上記「型の出どころ」)と
  両立させるため、型のimportは通す必要がある
- **動的 `import()` は `no-restricted-imports` の対象外。**このルールは静的なimport宣言しか
  見ないため、`await import("react")` と書けば全部すり抜ける。Next.jsではコード分割で
  動的importが自然に出てくるので、意図的な回避というより「うっかり踏む」経路になる。
  同じ制約を `no-restricted-syntax` の `ImportExpression` セレクタにも掛けている。
  **こちらはグロブではなく正規表現で書くことになるので、グロブ側と対で管理する。**
  片方だけ直すと、そちらだけがすり抜ける
- **`files` に拡張子を書き並べない。**`app/**/*.ts` だけだと `.mts` `.cts` や素のJSが
  対象外になる。拡張子リストを1か所に置いて組み立てる

#### 残っているギャップ

**`lib/` には構文ルールを掛けていない。**PostgRESTのクエリビルダが `.filter()` を持つため
(`supabase.from(...).select().filter("col", "eq", v)`)、同じ名前で誤検知する。
`lib/` 内での `.reduce()` による集計は機械では止まらない。`lib/` 側は
「`common/` を値としてimportしない」制約だけで押さえている。

**間接依存は見ていない。**`no-restricted-imports` が見るのはそのファイルに書かれた
import文だけで、依存グラフは辿らない。特に効いてくるのが `mcp/` のNext.js禁止で、
`lib/` にはフレームワークの制約を掛けていない(Supabaseのサーバークライアントは
`next/headers` の `cookies()` を使うのが定番なので、掛けられない)。
したがって **`lib/` のあるファイルが `next/headers` に依存していると、`mcp/` がそれを
許可された経路でimportするだけでNext.jsを引きずり込む。**lintは緑のまま、
フェーズ5で実行時に初めて顕在化する。

対処はフェーズ3で `lib/` にSupabaseクライアントを置くときに行う。
**Next.js専用APIに触れるファイルをパスで分離し(例: `lib/web/`)、
`mcp/` からそのパスへのimportをこの節のルールに1行追加して禁止する。**
今の時点で `lib/` は空なので、置き場所を決めるのはフェーズ3の作業に含める。

**層と同名のサブディレクトリへの相対importは誤検知する。**`lib/a/b.ts` から
`../common/x`(= `lib/common/x`)と書くと、トップレベルの `common/` への
層越えと区別が付かず止まる。層と同じ名前のサブディレクトリはそもそも紛らわしいので、
この方向の誤検知は許容している。

**`no-restricted-syntax` はメソッド名しか見ていない。**誤検知とすり抜けが両方ある。

- 誤検知: 配列でないオブジェクトの `.find()` や `.sort()` も止まる。
  **特に文字列の `.includes()` / `.indexOf()`**(`pathname.includes("/events")` など)は
  `app/` で普通に書きたくなるが、レシーバの型を見ていないので止まる。
  それでも対象に入れているのは、配列のメンバーシップ判定が権限判定そのものだからで、
  「厳しすぎて例外が出る」ほうが「判断が静かに `app/` に残る」より戻しやすいという
  非対称性による。引っかかったらまず `common/` に切り出せないか考え、
  本当に表示の都合なら、インラインでdisableせず「例外の作法」に従って
  設定ファイルに理由付きで置く
- すり抜け: ブラケット記法(`rows["filter"](fn)`)や動的なメソッド名では検出できない。
  同様に、動的importのモジュール名が文字列リテラルでない場合
  (`import(someVariable)`、テンプレートリテラル)も検出できない。
  ここは「うっかり書いてしまう層越え」を止めるための仕組みであって、
  意図的な回避を防ぐものではないと割り切っている

**`.mts` ファイルは `yarn lint` 自体がクラッシュする。**層の境界とは別の既存の問題で、
型情報を要するルールのブロックが `**/*.mts` を対象にしている一方、
`eslint-config-next` のパーサーが `.mts` に対して `parserOptions.project` を
転送しないため。issue #43 の時点では `.mts` ファイルが1つも無いため実害はなく、
別Issueに切り出した(issue #61。この節の制約自体は `.mts` `.cts` や素のJSも対象にしてある)。

導入時点(issue #43)で `app/` はNext.jsの雛形のみ、`lib/` と `mcp/` は空だったため、
違反は1件もなく、drainを挟まず**最初からerror**で入れた。

### markdown (`docs/**/*.md`, `.claude/skills/**/*.md`, ルート直下 `*.md`)

`markdownlint-cli2`(設定は `.markdownlint-cli2.jsonc`)を `yarn lint` に統合している。
CodeRabbitがPR #35〜#39で繰り返し指摘した「コードフェンスに言語識別子がない(MD040)」
「フェンス後に空行がない(MD031)」は、本来ここで無料かつ即座に拾えるべきものだった。

デフォルトルールセット(全ルールon)をそのまま採用し、以下2つだけ理由付きでoffにしている
(理由は `.markdownlint-cli2.jsonc` 内のコメントにも書いてある)。

| ルール | 扱い | 理由 |
| --- | --- | --- |
| MD013 (line-length) | off | 日本語の長文段落には改行位置の慣習がなく、誤検知の温床になるだけで実バグを捕まえない |
| MD036 (no-emphasis-as-heading) | off | `**強調**` を見出し代わりに使う書き方が `docs/` 全体で既に定着している。実見出しへの一括昇格は目次構造を変える意味のある変更で、機械的にやるものではない |

導入時点(Issue #40)で `docs/**/*.md` 等に236件の違反があったが、
すべて `markdownlint-cli2 --fix` で自動修正できるスタイル系(見出し/リスト/テーブル前後の空行、
テーブルのパイプ間隔など)だったため、drainの手作業を挟まず**その場でfixして初日からerror**にした。
言語識別子の欠落(MD040、3件)と引用ブロック内の空行(MD028、1件)だけは自動修正できず手で直した。

### フォーマット (Prettier)

ESLint v9のコアからスタイル系ルールは削除済みで、`@stylistic` も未導入のため、
整形を機械的に止める仕組みが無かった(issue #65)。Prettierを**ESLintと併用**で導入している
(置き換えではない)。

- `yarn lint` では `prettier --check .` をESLintより先に実行し、整形の失敗を本題より先に落とす
  (さらにその手前で改行コードを確認する。下記「改行コード」)
- 対象は `.prettierignore` の除外を除く、Prettierがパーサーを推論できるファイル種別
  (JS/TS/JSON/CSS/YAML等)。**Markdownは対象外**
  (`markdownlint-cli2` が既に担当しており、リストマーカー・テーブル整形・順序付きリスト番号で
  衝突するため。二重に持たせない)
- オプションは `printWidth: 100` のみ設定する。既存の書き方に近く、
  `max-lines-per-function: 60` を余計に圧迫しない。それ以外は既定値のまま動かさない
- `eslint-config-prettier` は導入していない。競合するスタイルルールが現状ゼロのため不要。
  `@stylistic` を入れる日が来たらその時に追加する
- `.prettierignore` で除外しているもの(各行の理由は `.prettierignore` 内のコメントを参照):
  `*.md`(上記)、`supabase/types.ts`(`yarn gen:types` で再生成するたびに差分が出ると
  Supabaseワークフローが恒久的に赤くなるため)、生成物(`.next/` `out/` `build/`
  `*.tsbuildinfo` `yarn.lock`)、`supabase/.temp/`、`supabase/migrations/**/*.sql`
  (Prettierは標準でSQLのパーサーを持たない。`prettier --check .` のディレクトリ指定では
  未対応拡張子は黙ってスキップされ現状は無害だが、明示的にglob指定した場合はエラーになるため
  先回りして除外する)

導入時点(issue #65)でTSファイルは11個のみで違反が無かったため、drainを挟まず
**最初からerrorで入れた**(`prettier --write .` を1回かけただけ)。

#### 改行コード

**`.gitattributes` の `* text=auto eol=lf` で作業ツリーをLFに固定する。**Prettierの
`endOfLine` は既定値(`lf`)のまま動かさない。

Prettierは改行コードもフォーマットの一部として見る。Windowsで `core.autocrlf=true` だと
作業ツリーがCRLFになるため、**1行も編集していないファイルまで `prettier --check` が全滅する**
一方、CI(ubuntu、LF)は緑のままになる(issue #98)。
`AGENTS.md`「コミット前に `yarn lint && yarn typecheck && yarn test` を通す」が
その環境では原理的に実行できなくなる。件数は対象ファイル数に比例して増える
(issue #98 起票時点で27ファイル、修正時点の再現で29ファイル)。

`.gitattributes` を選ぶのは、**ローカルとCIの判定基準を1つに保ったまま直せる唯一の案**だからである。

| 案 | 差分 | 判定基準 |
| --- | --- | --- |
| `.gitattributes` に `* text=auto eol=lf` | ファイル1つ | ローカル=CI。両方ともLFだけを通す |
| `.prettierrc` に `"endOfLine": "auto"` | 1行 | **CIもCRLFを通すようになる。**判定そのものが消える |
| `core.autocrlf` を各自ローカルで `input` | コミット不能 | 環境ごとに揺れる。設定を消せば再発する |

- **`endOfLine: "auto"` は判定を弱める側の変更である。**ファイルに既にある改行に合わせるので、
  CRLFのまま入ったファイルをCIも通す。「壊れたらCIが赤くなる」の逆方向であり、
  上記「オプションは `printWidth: 100` のみ設定する」とも衝突する
- **`core.autocrlf` はリポジトリにコミットできない。**issue #98 の起票後、この設定がローカルで
  `false` にされていたため症状は一時的に見えなくなっていたが、**設定が消えれば戻る。**
  再発を機械が検出しないので、これは修正ではない
- **`.gitattributes` は `core.autocrlf` より優先される。**各環境で手を動かす必要が無くなる。
  さらに `text=auto` がindex側もLFに正規化するので、**Gitがテキストと判定したファイルについては、
  CRLFがリポジトリに入る経路自体が閉じる**

**バイナリを拡張子で列挙しない。**列挙するとその一覧が検出の上限になり、形式が1つ増えるたびに
穴が開く(層の境界の設定と同じ失敗の形。上記「設定を書くときの落とし穴」)。
`text=auto` はNUL検出で自動的に外すので、上限が無い。誤検出する形式が出てきたら、
そのときに `binary` を明示する(下記のチェックは、`binary` を付けたファイルが
**本当にバイナリか**をindexのblobで確かめたうえで通す。テキストに `binary` を付けて
チェックを黙らせることはできない)。

**上の保証は「Gitがテキストと判定したファイル」にしか掛からない。**判定はNULの有無で行われるので、
UTF-16のようにNULを含むテキストはバイナリ扱いになり、変換も正規化も受けない。
現時点の追跡ファイルでバイナリ判定されるのは `app/favicon.ico` の1件だけで実害はないが、
「全ファイルが必ずLFになる」とは読まないこと。

導入時点(issue #98)で index にCRLFのblobは**0件**、作業ツリーも全ファイルがLFだったため、
再チェックアウトも `git add --renormalize` も差分を生まなかった。
**これは作業していたマシンの `core.autocrlf` がたまたま `false` だったからで、一般には成り立たない。**
CRLFのチェックアウトが手元にある場合は下記「既存のチェックアウトを移行する」が要る。

#### `.gitattributes` が効いていることを機械で確かめる

**`.gitattributes` を消しても、Ubuntu上のCIは既存blobがLFなので `prettier --check` は緑のまま通る。**
つまりこの設定自体は「壊れたらCIが赤くなる」の外側にある。そこで `yarn lint` の先頭で
`node .github/scripts/check-eol.mjs` を実行し、4つを確かめる。

1. **追跡されている全ファイルに `text=auto eol=lf` が適用されているか**(`git check-attr`)。
   `.gitattributes` の削除やパターンの弱体化がここで落ちる。
   **`eol` だけを見ては足りない。**`* -text eol=lf` と書くと `eol` は `lf` のまま残るが
   `text` が無効になり、**変換自体が止まって `core.autocrlf` の挙動に戻る。**
   **`text`(= set)も通さない。**全ファイルをテキスト扱いにするので、`text=auto` を選んだ理由
   (バイナリの自動判定)が消え、バイナリが改行変換で壊れる。
   `binary` を明示したファイルは正当な例外なので、indexのblobにNULがあるか
   (本当にバイナリか)を確かめたうえで許す
2. **indexにLF以外の改行のblobが入っていないか**(`git ls-files --eol` の `i/crlf` `i/mixed`)。
   1が通っていても、attributeが付く前にコミットされたblobは残りうる
3. **作業ツリーにLF以外の改行のファイルが残っていないか**(同じく `w/crlf` `w/mixed`)。
   下記のとおり `.gitattributes` の追加は既存のチェックアウトを書き換えないので、
   **indexがLFでも作業ツリーがCRLFのままなら `prettier --check` は落ちたまま**になる
4. **indexの `-text` のうち、本当はテキストのものが混ざっていないか。**
   **単独CR(旧Mac改行)のテキストはGitがバイナリと判定する**ので、`crlf` にも `mixed` にも
   現れないまま変換の対象外になる。NULが無いのに `-text` になっているものはこれなので落とす
   (`*.md` はPrettierの対象外なので、これを見ないとlintの列を素通りする)。
   **作業ツリー側で単独CRを見ないのは意図的。**作業ツリーがLFなのに単独CRになる経路はGitの
   変換には無く(LF→CRの変換は存在しない)、ローカルで書いた場合も `git add` した瞬間に
   indexの判定で落ちる。ここで見るとファイルを直接読むことになり、
   捕まえられるものが同じ割にI/Oが増える

`check-attr` の結果が取れなかったファイルも失敗として扱う。
**検査できなかったものを「検査済み」に数えると、この仕組み自体が静かに無効になる。**

**`yarn lint` に入れる(CI専用のジョブにしない)。**このIssueで直したのは
「ローカルとCIで判定基準が割れていたこと」なので、その再発を見る仕組みを片方だけに置くと
同じ形の穴をもう一度開けることになる。3はfresh checkoutのCIでは常に緑になるが、
**その3こそがローカルでしか起きない**という非対称性が、`yarn lint` 側に置く理由そのものである。

#### 既存のチェックアウトを移行する

**`.gitattributes` の追加は、既にあるチェックアウトの作業ツリーを書き換えない。**
`core.autocrlf=true` でcloneしたリポジトリにこの変更を取り込んでも、内容が変わらないファイルは
触られずCRLFのまま残る(実測: 50ファイルが `i/lf w/crlf` になり、
`prettier --check` は27ファイルで落ちたままだった)。

**次の3つはいずれも書き換えない。**先に試して「効かないので設定が間違っている」と読み違えないこと。

| 試したくなるコマンド | 結果 | 理由 |
| --- | --- | --- |
| `git add --renormalize .` | 変化なし | indexは既にLF。正規化の差分が出ない |
| `git checkout -- .` | 変化なし | 属性を通した比較でindexと一致するため、変更扱いにならない |
| `git checkout-index -f -a` | 変化なし | 同上 |

**indexへの登録をいったん外して作り直す。**未コミットの変更は失われるので、先に退避する。

```bash
git status --porcelain                   # 空でなければ commit するか stash する
git rm --cached -qr .
git reset --hard
git ls-files --eol | grep -c 'w/crlf'    # 0 になっていることを確認する
```

**この操作は他のworktreeには影響しない**(作業ツリーとindexはworktreeごとに独立している)。
影響するのは実行したworktreeの未コミット変更だけである。

### 無視の指定

`yarn lint` はツールを順に呼ぶが、**何を走査しないかの指定はツールごとに別の場所にある。**
片方だけ直すと、そちらだけがすり抜ける。

下表は**ファイルを探しに行くツール**を並べたもの
(`check-lint-scope.mjs` は下記のとおりESLintの無視判定を問い合わせるだけで、走査はしない)。

| ツール | 除外の指定 | 未追跡ディレクトリへ入るか |
| --- | --- | --- |
| `check-eol.mjs` | (指定なし) | 入らない。`git ls-files` が返す**追跡ファイル**しか見ない |
| Prettier | `.prettierignore` | 入らない。Prettier 3 の `--ignore-path` の既定が `.gitignore` + `.prettierignore` |
| markdownlint-cli2 | `.markdownlint-cli2.jsonc` の globs | 入らない。対象globがルート相対で、worktree配下まで届かない |
| **ESLint** | `eslint.config.mjs` の `globalIgnores` | **入る。**flat configは `.gitignore` を参照しない |

**追加の対応が要るのはESLintだけである。**`.gitignore` にあるディレクトリでも、
`globalIgnores` に書かなければ走査する。

これで実際に踏んだのが `.claude/worktrees/**`(issue #130)。**worktreeは別チェックアウト**なので、
除外していないと**作業中の別ブランチのコードが、メインのチェックアウトの `yarn lint` を落とす。**
issue #98 の直後に、まさにその形で `yarn lint` が赤くなった
(worktree側にコピーされた `check-eol.mjs` が、ルート相対で書かれた例外エントリに
マッチせずerrorになった)。worktreeは作業完了時に畳む決まりだが(`AGENTS.md`)、
**作業中は必ず存在する**ので、踏む頻度は「たまに」ではない。

**`.gitignore` に足したディレクトリが走査されて困るものなら、`globalIgnores` にも足す。**

#### 走査範囲の退行は、ファイルの有無では検出できない

**`globalIgnores` からこの行が消えても、CIでもローカルでも黙って通る。**

- CIのcheckoutに `.claude/worktrees/` は**存在しない**ので、走査対象が広がっても差が出ない
- ローカルでも、worktreeの中身がlintを通るコードなら(作成直後は普通そうである)
  **余分に検査されるだけでエラーにならない**

issue #130 が見つかったのは、たまたまworktree側のファイルが例外エントリに
マッチせずerrorになったからで、**再現性のある検出ではなかった。**

そこで `yarn lint` から `node .github/scripts/check-lint-scope.mjs` を実行し、
**ESLintの無視判定そのものを問い合わせる**(`ESLint#isPathIgnored`)。
ファイルの有無に依存しないので、CIでもローカルでも同じ結果になる。

両方向を見る。片方だけでは通り抜けられる。

- `.claude/worktrees/**` 配下の代表パスが**無視されること**
- 通常のパス(`app/` `common/` など)が**無視されないこと**
  —— これが無いと、全部を無視する設定で1つ目を満たせてしまう

**代表パスは実在しなくてよい。**worktreeのディレクトリ名も階層の深さも決め打ちできないので、
形の違う例を並べてある。

## 型の出どころ

**同じ型を二重に定義しない。**出どころは3つだけ。

| 出どころ | 用途 |
| --- | --- |
| `supabase gen types typescript` の生成型 | DBのテーブル行そのもの |
| Zodスキーマ → `z.infer` | 外部入力(フォーム、MCPツール引数)の検証と型 |
| 手書き | 原則なし |

### Supabase生成型の運用

- 生成型(`supabase/types.ts`)は**リポジトリにコミットする**
- **手で編集しない**
- CIで `yarn gen:types` を実行し、差分があればジョブを失敗させる
- これにより「マイグレーションを書いたが型の再生成を忘れた」状態がmainに入らない

### Zodスキーマの共通化

入力検証のZodスキーマは `common/` に1つだけ置き、
**Web UIのフォーム検証とMCPツールの入力スキーマの両方がそこから導出する。**

二重定義すると、片方だけ条件が緩くなったときに、
緩いほうを通ったデータがエラーを出さずに保存される。誰も気づけない。

## 例外の作法

厳しくすれば正当な例外は必ず出る。**ここで `// eslint-disable` を許すと、この方針全体が死ぬ。**

### インラインで消さない

```ts
// ダメ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = await client.rpc("...");
```

インラインのdisableは、半年後に「これはまだ必要か？」を判断できない。

### 設定ファイルに理由付きで置く

```js
{
  // 例外リスト。各エントリはルールと構造的に衝突するもの。
  // 理由を最新に保ち、理由が消えたらエントリも消すこと。
  files: [
    "lib/supabase/rpc.ts",   // 生成型が及ばないRPCの戻り値
  ],
  rules: { "@typescript-eslint/no-explicit-any": "off" },
}
```

**1エントリにつき1つの理由**を書く。理由が解消したらエントリを消す。

### 妥協には期限と条件を書く

warnで残すルールがある場合、なぜ今errorにできないのか、いつerrorに上げるのかを書く。

```js
// max-params は WARN のまま。理由: <該当箇所と事情>。
// 解消したら error に上げる。
```

## 新しいルールを追加するとき

**drain してから ratchet する。**

1. まず `warn` で入れる
2. 既存の指摘をゼロにする
3. `error` に上げる

「誰も読まない警告リストに1件足す」ことを許さない。
ゼロにしてからerrorに上げれば、再発した瞬間にCIが落ちる。

新規開発の段階では既存の負債がないので、**最初からerrorで入れられる**。この機会は今しかない。

## レビュー指摘から静的解析を強化する

ボット(Claude/Codex/CodeRabbit/Copilot)の指摘往復には、有料枠やレート制限のコストがかかる
(`pr-review-flow` skill参照)。**本来lintのような静的解析で無料かつ即座に拾えたはずの指摘**に
そのコストを払うのは割に合わない。同じ種類の指摘を機械に払い出したら、静的解析側を強化する。

### 「lintルール化を検討すべき」の判定基準

- **該当する**: フォーマット・構文の機械的な誤り(言語識別子の欠落、インデント、
  クォートの統一、未使用importなど)。人間が読まなくても検出できるもの
- **該当しない**: 文章の論理矛盾、設計判断の妥当性、命名の意味的な適切さなど、
  **意味理解を要するもの**。lintルールとして表現できない

目安として、**同じ種類の指摘が別々のPRで2回以上出たら検討する**。ただし今回のMD040/MD031の
ように「機械的に拾える性質」が明白なものは、1回目でも即座に検討してよい。

### 見つけたときのアクション

- 軽微(既存コードへの影響が小さい、例: markdownルールを1つ追加する程度) →
  **そのPRで即座に**ルールを追加し、この節か対応するプリセットの節を更新する
- 既存コードへの影響が大きい(大量の指摘が出る、設定の見直しが要る) →
  別Issueを立て、上記「新しいルールを追加するとき」のdrain-then-ratchetに従う

`pr-review-flow` skill「マージ後の振り返り」で、
「この指摘は静的解析で拾えたはずか」も合わせて自問すること。

## 当面入れないもの

- **jscpd(重複検出)** — コード量が増えてから効くもので、現時点では見送る。
  **着手条件: `common/`のpure関数の実装が揃うフェーズ2完了時点、またはフェーズ4
  (Web UI書き込み)完了時点のいずれか早い方**。導入する場合もCIのゲートにはせず、
  レポートのみにする。方式・ノイズ排除の設定候補は
  [元記事](https://zenn.dev/singularity/articles/jscpd-dry-detection-mono)と#45を参照する。
- **knip(デッドコード検出)** — `common/`を`app/`と`mcp/`の2経路から呼ぶ構造
  (`AGENTS.md`「ディレクトリ構成」)で片方の経路が呼ばなくなった関数の検出に効くが、
  **2経路が揃って初めて意味を持つ**ため現時点では見送る。**着手条件: フェーズ5
  (MCPサーバー)完了時点**。導入する場合もCIのゲートにはせず、レポートのみにする。
  `entry`指定にはテスト・スクリプトも含める。
  初日からブロックすると、無視するための作法(`// knip-ignore` を反射的に付ける等)が育つ。
- **複数OSでのCI** — 実行環境がVercel(Linux)に一本化されているため不要。
- **Biome(formatter-onlyでの置き換えを含む)** — linterとして見ると、`no-restricted-syntax` の
  ASTセレクタ(層の境界を強制する判断ロジック配列メソッド13種の禁止、動的import封じ。issue #43 / #60)に
  等価物が無く、移行は `eslint.config.mjs` の最も作り込んだ部分を実験的機構へ書き直すことになる。
  型情報を要する4ルールや `eslint-plugin-security` / `sonarjs` / `eslint-config-next` の穴も埋まらない。
  formatter-onlyの置き換えにも利点が無い(速度差はtscのプログラム構築コストに埋まる、
  ツール数は減らない、Windows/Linux向けにネイティブバイナリを追加で配ることになる)。
  詳細は issue #65 参照。
