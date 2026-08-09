// 何を守っているか:
// 改行コードをLFに固定する `.gitattributes` が効いていることを機械的に確かめる(issue #98)。
// この設定が消えても、Ubuntu上のCIは既存blobがLFなので `prettier --check` は緑のまま通る。
// 「壊れたらCIが赤くなる」(AGENTS.md)の外側に落ちる経路なので、ここで明示的に止める。
// 方針、3案の比較、既存チェックアウトの移行手順は docs/lint-policy.md「改行コード」。

import { execFileSync } from "node:child_process";

// encoding を指定しないので戻り値はBuffer。パスに非ASCIIが含まれても壊さずに扱う。
const git = (args, stdin) =>
  execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024, input: stdin });

const splitNul = (buffer) =>
  buffer
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry !== "");

const errors = [];

// 1. 追跡されている全ファイルに `text=auto eol=lf` が適用されているか。
//    `.gitattributes` の削除やパターンの弱体化はここで落ちる。
//    **`eol` だけを見ては足りない。**`* -text eol=lf` と書くと eol は lf のままだが
//    text が無効になり、改行の変換自体が止まる(= `core.autocrlf` の挙動に戻る)。
const paths = splitNul(git(["ls-files", "-z"]));
// `check-attr -z` は <path> <attribute> <value> の3つ組をNUL区切りで返す。
// 前進カーソル + slice で読む(添字アクセスは security/detect-object-injection に掛かる)。
// 値の格納にもオブジェクトではなくMapを使う(同じ理由)。
const attrFields = splitNul(git(["check-attr", "-z", "text", "eol", "--stdin"], paths.join("\0")));
const attrsByPath = new Map();
for (let cursor = 0; cursor + 3 <= attrFields.length; cursor += 3) {
  const [path, attr, value] = attrFields.slice(cursor, cursor + 3);
  const attrs = attrsByPath.get(path) ?? new Map();
  attrs.set(attr, value);
  attrsByPath.set(path, attrs);
}

// `binary`(= `-diff -merge -text`)を明示したファイルは正当な例外なので、
// 「本当にバイナリか」をindexのblobで確かめてから許す。docs/lint-policy.md「改行コード」の
// 「誤検出する形式が出てきたら、そのときに `binary` を明示する」を機械側でも受け止める。
// 全体を `-text` にする書き方はテキストファイルがここで落ちるので通らない。
const TEXT_ENABLED = new Set(["auto", "set"]);
const isBinaryInIndex = (path) => git(["show", `:${path}`]).includes(0);

const missingAttr = [];
const disabledText = [];
for (const [path, attrs] of attrsByPath) {
  const eol = attrs.get("eol");
  if (eol !== "lf") {
    missingAttr.push(`${path} (eol=${eol})`);
  }
  const text = attrs.get("text");
  if (!TEXT_ENABLED.has(text) && !isBinaryInIndex(path)) {
    disabledText.push(`${path} (text=${text})`);
  }
}
if (missingAttr.length > 0) {
  errors.push(
    `eol=lf が適用されていないファイルがあります (${missingAttr.length}件):\n  ` +
      missingAttr.join("\n  "),
  );
}
if (disabledText.length > 0) {
  errors.push(
    `テキストファイルなのに text が無効になっています (${disabledText.length}件):\n  ` +
      disabledText.join("\n  ") +
      "\n  text が無効だと eol=lf があっても改行は変換されない",
  );
}

// 2. indexと作業ツリーの双方にCRLFが残っていないか。
//    index側: attributeが付く前にコミットされたblobは 1 が通っても残りうる。
//    作業ツリー側: `.gitattributes` の追加は既存チェックアウトを書き換えない。
//    indexがLFでも作業ツリーがCRLFのままなら `prettier --check` は落ちたままになる
//    (issue #98 の症状そのもの)。バイナリ(`-text`)と改行を持たないファイル(`none`)は対象外。
const NON_LF = new Set(["crlf", "mixed"]);
const crlfInIndex = [];
const crlfInWorktree = [];
for (const row of splitNul(git(["ls-files", "--eol", "-z"]))) {
  const tabIndex = row.indexOf("\t");
  if (tabIndex === -1) continue;
  const info = row.slice(0, tabIndex);
  const path = row.slice(tabIndex + 1);
  const indexEol = info.match(/(?:^|\s)i\/(\S+)/)?.[1];
  const worktreeEol = info.match(/(?:^|\s)w\/(\S+)/)?.[1];
  if (NON_LF.has(indexEol)) crlfInIndex.push(`${path} (i/${indexEol})`);
  if (NON_LF.has(worktreeEol)) crlfInWorktree.push(`${path} (w/${worktreeEol})`);
}
if (crlfInIndex.length > 0) {
  errors.push(
    `indexにCRLFを含むファイルがあります (${crlfInIndex.length}件):\n  ` +
      crlfInIndex.join("\n  ") +
      "\n  修正: git add --renormalize . を実行してコミットする",
  );
}
if (crlfInWorktree.length > 0) {
  errors.push(
    `作業ツリーにCRLFのファイルがあります (${crlfInWorktree.length}件):\n  ` +
      crlfInWorktree.join("\n  ") +
      "\n  修正: docs/lint-policy.md「既存のチェックアウトを移行する」の手順を実行する" +
      "\n  (git add --renormalize . や git checkout -- . では書き換わらない)",
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  // process.exit(1) は stderr がパイプの場合に出力を切り捨てうるので使わない。
  process.exitCode = 1;
} else {
  // バイナリ判定されたファイルは 2 の対象外なので、「全ファイルがLF」とは言わない
  // (docs/lint-policy.md「改行コード」の「Gitがテキストと判定したファイル」に合わせる)。
  console.log(
    `OK: 追跡ファイル${paths.length}件への text=auto eol=lf の適用と、index・作業ツリーのLFを確認しました。`,
  );
}
