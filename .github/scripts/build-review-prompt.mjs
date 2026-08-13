import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLASSIFICATIONS = ["code", "governance-docs", "automation-config"];
const HEADING_BY_CLASSIFICATION = new Map(
  CLASSIFICATIONS.map((classification) => [`### ${classification}`, classification]),
);

// anthropics/claude-code-action@5ef2e550a465a721f4f45e4a7d3c340c873e1dcc(claude-review.ymlに
// ピン留めしているSHAと同一)の restoreConfigFromBase が復元するパスと一致させる
// (src/github/operations/restore-config.ts の SENSITIVE_PATHS)。ずれると型(c)の
// 検知対象が実際の復元対象からずれる。
const RESTORED_PATHS = [
  ".claude",
  ".mcp.json",
  ".claude.json",
  ".gitmodules",
  ".ripgreprc",
  "CLAUDE.md",
  "CLAUDE.local.md",
  ".husky",
];

const fail = (message) => {
  throw new Error(`Build review prompt: ${message}`);
};

const nonEmptyEnvironment = (value, name) => {
  if (value === undefined || value.trim() === "") fail(`${name} が空です`);
  return value;
};

const splitNul = (buffer) =>
  buffer
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry !== "");

const isAutomationConfig = (file) => {
  const name = file.split("/").at(-1) ?? "";
  const isTsconfig =
    name === "tsconfig.json" || (name.startsWith("tsconfig.") && name.endsWith(".json"));
  return (
    file.startsWith(".github/workflows/") ||
    file.startsWith(".github/actions/") ||
    file.startsWith(".github/scripts/") ||
    file === "package.json" ||
    /(?:^|\/)(?:yarn|package-lock|pnpm-lock|bun)\.(?:lock|lockb|yaml|json)$/.test(file) ||
    file === "supabase/config.toml" ||
    file === ".coderabbit.yaml" ||
    name === "vercel.json" ||
    name.startsWith("eslint.config.") ||
    isTsconfig ||
    /^vitest\.config\./.test(name)
  );
};

export const classifyChangedFiles = (files, reviewFull) => {
  if (files.length === 0) fail("changed files が空です");
  if (reviewFull) return [...CLASSIFICATIONS];

  const selected = new Set();
  for (const file of files) {
    let matched = false;
    if (/\.(?:ts|tsx|mjs)$/.test(file) || file.startsWith("supabase/migrations/")) {
      selected.add("code");
      matched = true;
    }
    if (
      file.startsWith("docs/") ||
      file === "AGENTS.md" ||
      file === "CLAUDE.md" ||
      file.startsWith(".claude/skills/") ||
      file === ".github/pull_request_template.md"
    ) {
      selected.add("governance-docs");
      matched = true;
    }
    if (isAutomationConfig(file)) {
      selected.add("automation-config");
      matched = true;
    }
    if (!matched) {
      selected.add("automation-config");
    }
  }
  return CLASSIFICATIONS.filter((classification) => selected.has(classification));
};

// ディレクトリ形式のパス(`.claude`, `.husky`)は配下のファイルも一致させる。
// `.claude.json` が `.claude` の配下と誤って一致しないよう、区切りを挟んだ前方一致で判定する。
const matchesRestoredPath = (file, restoredPath) =>
  file === restoredPath || file.startsWith(`${restoredPath}/`);

export const detectRestoredPaths = (files) =>
  RESTORED_PATHS.filter((restoredPath) =>
    files.some((file) => matchesRestoredPath(file, restoredPath)),
  );

// `.claude-pr/${元のパス}` というレイアウト(例: `.claude/x` → `.claude-pr/.claude/x`)は
// anthropics/claude-code-action@5ef2e550a465a721f4f45e4a7d3c340c873e1dcc の
// src/github/operations/restore-config.ts、restoreConfigFromBase内
// `snapshotSensitivePath(p, \`.claude-pr/${p}\`, ...)` で確認済み(PR #241)。
// action更新でレイアウトが変わった場合はこの注意書きが誤った案内になるため、
// pinned SHAを上げるPRでは同ファイルの該当箇所を合わせて確認すること。
export const restoredPathsNotice = (restoredPaths) => {
  if (restoredPaths.length === 0) return "";
  const list = restoredPaths.map((path) => `\`${path}\``).join(", ");
  return [
    "## 復元対象パスの注意",
    "",
    `このPRは復元対象パス(${list})を変更しています。`,
    "セキュリティ機構により、カレントディレクトリの該当パスは `origin/main` の内容へ復元されており、PRの内容ではありません。",
    "PRが変更した内容は `.claude-pr/` 配下に同じ相対パスで退避されています(例: `.claude/x` の変更は `.claude-pr/.claude/x` を読んでください)。該当パスをレビューする際は必ず `.claude-pr/` 配下を読んでください。",
    "この復元によってカレントディレクトリとPRの内容に差が生じますが、これは復元機構によるものであり、作業ツリーの汚れとして指摘しないでください。",
  ].join("\n");
};

const sectionLines = (agents) => {
  const lines = agents.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const starts = lines.reduce(
    (found, line, index) => (line === "## Code Review Rules" ? [...found, index] : found),
    [],
  );
  if (starts.length !== 1) fail("## Code Review Rules は正確に1つ必要です");
  const start = starts.at(0);
  if (start === undefined) fail("Code Review Rules の開始位置を取得できません");
  const endOffset = lines.slice(start + 1).findIndex((line) => /^## /.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  const section = lines.slice(start + 1, end);
  if (section.join("\n").trim() === "") fail("Code Review Rules 節が空です");
  return section;
};

export const buildPrompt = (agents, classifications) => {
  const lines = sectionLines(agents);
  const headings = lines.reduce(
    (found, line, index) => (/^### /.test(line) ? [...found, [line, index]] : found),
    [],
  );
  const foundNames = headings.map(([heading]) => heading);
  const expectedNames = [...HEADING_BY_CLASSIFICATION.keys()];
  if (
    foundNames.length !== expectedNames.length ||
    foundNames.join("\n") !== expectedNames.join("\n")
  ) {
    fail("許可された3つの分類見出しが code, governance-docs, automation-config の順で必要です");
  }
  const first = headings.at(0);
  if (first === undefined) fail("分類見出しがありません");
  const common = lines.slice(0, first[1]);
  if (common.join("\n").trim() === "") fail("共通部分が空です");

  const blocks = new Map();
  for (const [heading, index] of headings) {
    const next = headings.find(([, candidate]) => candidate > index);
    const block = lines.slice(index, next?.[1] ?? lines.length);
    if (block.slice(1).join("\n").trim() === "") fail(`${heading} の本文が空です`);
    const classification = HEADING_BY_CLASSIFICATION.get(heading);
    if (classification === undefined) fail(`未許可の分類見出しです: ${heading}`);
    blocks.set(classification, block);
  }
  const selected = CLASSIFICATIONS.filter((classification) =>
    classifications.includes(classification),
  );
  if (selected.length === 0) fail("選択分類がありません");
  return [common, ...selected.map((classification) => blocks.get(classification) ?? [])]
    .map((block) => block.join("\n").trim())
    .join("\n\n");
};

/** @type {() => string} */
const createDefaultUuid = () => randomUUID();

const delimiter = (value, createUuid) => {
  let candidate = createUuid();
  while (value.includes(candidate)) candidate = createUuid();
  return candidate;
};

export const outputEntry = (name, value, createUuid = createDefaultUuid) => {
  const marker = delimiter(value, createUuid);
  return `${name}<<${marker}\n${value}\n${marker}\n`;
};

const escapeHtml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeSummaryFileName = (file) =>
  escapeHtml(file)
    .replaceAll("`", "&#96;")
    .replaceAll("\r\n", "⏎")
    .replaceAll("\r", "⏎")
    .replaceAll("\n", "⏎");

export const buildSummary = ({ baseSha, headSha, files, classifications, prompt }) => {
  const displayFiles = files.map(escapeSummaryFileName).join("\n");
  return [
    "## Claude Review prompt",
    "",
    `- Base SHA: \`${baseSha}\``,
    `- Head SHA: \`${headSha}\``,
    "- Changed files:",
    `<pre>${displayFiles}</pre>`,
    `- Classifications: ${classifications.join(", ")}`,
    "",
    "<details><summary>組み立てたprompt</summary>",
    "",
    `<pre>${escapeHtml(prompt)}</pre>`,
    "</details>",
    "",
  ].join("\n");
};

const git = (args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });

export const main = ({ environment, runGit, appendFile }) => {
  const { BASE_SHA, HEAD_SHA, REVIEW_FULL, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = environment;
  const baseSha = nonEmptyEnvironment(BASE_SHA, "BASE_SHA");
  const headSha = nonEmptyEnvironment(HEAD_SHA, "HEAD_SHA");
  const outputPath = nonEmptyEnvironment(GITHUB_OUTPUT, "GITHUB_OUTPUT");
  const summaryPath = nonEmptyEnvironment(GITHUB_STEP_SUMMARY, "GITHUB_STEP_SUMMARY");
  const files = splitNul(runGit(["diff", "--name-only", "--no-renames", "-z", baseSha, headSha]));
  const classifications = classifyChangedFiles(files, REVIEW_FULL === "true");
  const agents = runGit(["show", `${baseSha}:AGENTS.md`]).toString("utf8");
  const restoredPaths = detectRestoredPaths(files);
  const notice = restoredPathsNotice(restoredPaths);
  const prompt = [buildPrompt(agents, classifications), notice]
    .filter((part) => part !== "")
    .join("\n\n");
  appendFile(
    outputPath,
    outputEntry("prompt", prompt) +
      outputEntry("classifications", classifications.join(",")) +
      outputEntry("restored_paths", restoredPaths.join(",")),
  );
  appendFile(summaryPath, buildSummary({ baseSha, headSha, files, classifications, prompt }));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main({ environment: process.env, runGit: git, appendFile: appendFileSync });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Build review prompt: 不明なエラーです");
    process.exitCode = 1;
  }
}
