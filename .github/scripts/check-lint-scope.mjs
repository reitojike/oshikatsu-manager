// 何を守っているか:
// ESLintが別チェックアウト(`.claude/worktrees/**`)を走査しないことを確かめる(issue #130)。
//
// この設定はCIでもローカルでも、退行が黙って通る。
// CIのcheckoutに `.claude/worktrees/` は存在せず、ローカルでもworktreeの中身がlintを
// 通るコードなら「余分に検査されるだけ」でエラーにならない。つまり
// **走査対象が広がったことは、どちらの経路でも観測できない。**
// だからファイルの有無に依存しない形で、ESLintの無視判定そのものを直接問い合わせる。
//
// 方針と、ツールごとに無視の指定が別管理になっている理由は docs/lint-policy.md「無視の指定」。

import { ESLint } from "eslint";

// worktreeのディレクトリ名も、その中のパスの深さも決め打ちできないので、
// 形の違う代表例を並べる。実在しないパスでよい(isPathIgnoredは存在を要求しない)。
const MUST_BE_IGNORED = [
  ".claude/worktrees/example/app/page.tsx",
  ".claude/worktrees/example/common/permissions.ts",
  ".claude/worktrees/example/.github/scripts/check-eol.mjs",
  ".claude/worktrees/a/b/c/d/e/deep.ts",
];

// 「全部無視する」で上のチェックを通せてしまわないよう、通常のパスは対象のままであることも見る。
const MUST_NOT_BE_IGNORED = ["app/page.tsx", "common/permissions.ts", "eslint.config.mjs"];

const eslint = new ESLint();
const errors = [];

const wronglyLinted = [];
for (const path of MUST_BE_IGNORED) {
  if (!(await eslint.isPathIgnored(path))) wronglyLinted.push(path);
}
if (wronglyLinted.length > 0) {
  errors.push(
    `ESLintが別チェックアウトを走査対象にしています (${wronglyLinted.length}件):\n  ` +
      wronglyLinted.join("\n  ") +
      "\n  修正: eslint.config.mjs の globalIgnores に .claude/worktrees/** を戻す",
  );
}

const wronglyIgnored = [];
for (const path of MUST_NOT_BE_IGNORED) {
  if (await eslint.isPathIgnored(path)) wronglyIgnored.push(path);
}
if (wronglyIgnored.length > 0) {
  errors.push(
    `ESLintが本来の検査対象を無視しています (${wronglyIgnored.length}件):\n  ` +
      wronglyIgnored.join("\n  ") +
      "\n  globalIgnores が広すぎる",
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  // process.exit(1) は stderr がパイプの場合に出力を切り捨てうるので使わない。
  process.exitCode = 1;
} else {
  console.log("OK: ESLintの走査範囲(別チェックアウトの除外)を確認しました。");
}
