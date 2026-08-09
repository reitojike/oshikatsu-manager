// 何を守っているか:
// 改行コードをLFに固定する `.gitattributes` が効いていることを機械的に確かめる(issue #98)。
// この設定が消えても、Ubuntu上のCIは既存blobがLFなので `prettier --check` は緑のまま通る。
// 「壊れたらCIが赤くなる」(AGENTS.md)の外側に落ちる経路なので、ここで明示的に止める。
// 方針と3案の比較は docs/lint-policy.md「改行コード」。

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

// 1. 追跡されている全ファイルに eol=lf が適用されているか。
//    `.gitattributes` の削除やパターンの弱体化はここで落ちる。
const paths = splitNul(git(["ls-files", "-z"]));
// `check-attr -z` は <path> <attribute> <value> の3つ組をNUL区切りで返す。
// 添字ではなく splice で先頭から3つずつ取り出す(添字アクセスは security/detect-object-injection に掛かる)。
const attrFields = splitNul(git(["check-attr", "-z", "eol", "--stdin"], paths.join("\0")));
const missingAttr = [];
while (attrFields.length >= 3) {
  const [path, , value] = attrFields.splice(0, 3);
  if (value !== "lf") {
    missingAttr.push(`${path} (eol=${value})`);
  }
}
if (missingAttr.length > 0) {
  errors.push(
    `eol=lf が適用されていないファイルがあります (${missingAttr.length}件):\n  ` +
      missingAttr.join("\n  "),
  );
}

// 2. indexにCRLFのblobが入っていないか。
//    1が通っていても、attributeが付く前にコミットされたCRLFのblobは残りうる。
//    そのファイルはWindowsでもCRLFのままチェックアウトされ、issue #98 の症状が再発する。
const crlfInIndex = [];
for (const row of splitNul(git(["ls-files", "--eol", "-z"]))) {
  const tabIndex = row.indexOf("\t");
  if (tabIndex === -1) continue;
  const indexEol = row.slice(0, tabIndex).match(/^i\/(\S+)/)?.[1];
  if (indexEol === "crlf" || indexEol === "mixed") {
    crlfInIndex.push(`${row.slice(tabIndex + 1)} (i/${indexEol})`);
  }
}
if (crlfInIndex.length > 0) {
  errors.push(
    `indexにCRLFを含むファイルがあります (${crlfInIndex.length}件):\n  ` +
      crlfInIndex.join("\n  ") +
      "\n  修正: git add --renormalize . を実行してコミットする",
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

// バイナリ判定されたファイルは 2 の対象外なので、「全ファイルがLF」とは言わない
// (docs/lint-policy.md「改行コード」の「Gitがテキストと判定したファイル」に合わせる)。
console.log(
  `OK: 追跡ファイル${paths.length}件への eol=lf の適用と、テキストblobのLF正規化を確認しました。`,
);
