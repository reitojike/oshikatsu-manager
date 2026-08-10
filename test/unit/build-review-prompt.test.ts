import { describe, expect, test } from "vitest";
import {
  buildPrompt,
  buildSummary,
  classifyChangedFiles,
  main,
  outputEntry,
} from "../../.github/scripts/build-review-prompt.mjs";

const agents = `# test

## Code Review Rules

共通の規律です。

### code

コードを確認します。

### governance-docs

文書を確認します。

### automation-config

自動化を確認します。

## Next
`;

describe("classifyChangedFiles", () => {
  test("分類規則とreview:fullを固定順で適用する", () => {
    expect(classifyChangedFiles(["app/page.tsx"], false)).toEqual(["code"]);
    expect(classifyChangedFiles(["docs/prd.md"], false)).toEqual(["governance-docs"]);
    expect(classifyChangedFiles(["AGENTS.md"], false)).toEqual(["governance-docs"]);
    expect(classifyChangedFiles([".github/workflows/test.yml"], false)).toEqual([
      "automation-config",
    ]);
    expect(classifyChangedFiles(["app/page.ts", "docs/prd.md"], false)).toEqual([
      "code",
      "governance-docs",
    ]);
    expect(
      classifyChangedFiles(["app/page.ts", "docs/prd.md", ".github/scripts/a.mjs"], false),
    ).toEqual(["code", "governance-docs", "automation-config"]);
    expect(classifyChangedFiles(["README.md"], true)).toEqual([
      "code",
      "governance-docs",
      "automation-config",
    ]);
    expect(classifyChangedFiles(["assets/logo.svg"], false)).toEqual(["automation-config"]);
  });

  test("空の差分は失敗させる", () => {
    expect(() => classifyChangedFiles([], false)).toThrow("changed files が空です");
  });
});

describe("buildPrompt", () => {
  test("共通部分と選択分類だけを固定順で組み立てる", () => {
    const prompt = buildPrompt(agents, ["automation-config", "code"]);

    expect(prompt).toContain("共通の規律です。");
    expect(prompt).toContain("### code");
    expect(prompt).toContain("### automation-config");
    expect(prompt).not.toContain("### governance-docs");
    expect(prompt.indexOf("### code")).toBeLessThan(prompt.indexOf("### automation-config"));
  });

  test("見出し欠落・重複・空本文を失敗させる", () => {
    expect(() =>
      buildPrompt(agents.replace("### code\n\nコードを確認します。\n\n", ""), ["code"]),
    ).toThrow("許可された3つの分類見出し");
    expect(() =>
      buildPrompt(agents.replace("### code", "### code\n\n本文\n\n### code"), ["code"]),
    ).toThrow("許可された3つの分類見出し");
    expect(() => buildPrompt(agents.replace("コードを確認します。", ""), ["code"])).toThrow(
      "### code の本文が空です",
    );
  });

  test("分類見出しの順序違反・節の欠落・共通部分の空を失敗させる", () => {
    expect(() =>
      buildPrompt(
        agents.replace(
          "### code\n\nコードを確認します。\n\n### governance-docs",
          "### governance-docs\n\nコードを確認します。\n\n### code",
        ),
        ["code"],
      ),
    ).toThrow("許可された3つの分類見出し");
    expect(() => buildPrompt(agents.replace("## Code Review Rules", "## Rules"), ["code"])).toThrow(
      "## Code Review Rules は正確に1つ必要です",
    );
    expect(() => buildPrompt(agents.replace("共通の規律です。", ""), ["code"])).toThrow(
      "共通部分が空です",
    );
  });
});

const makeAgents = (prefix: string) => `# ${prefix} test

## Code Review Rules

${prefix}-ONLY-COMMON

### code

${prefix}-ONLY-CODE

### governance-docs

${prefix}-ONLY-GOVERNANCE

### automation-config

${prefix}-ONLY-AUTOMATION

## Next
`;

const hasGitArguments = (actual: string[], expected: string[]): boolean =>
  JSON.stringify(actual) === JSON.stringify(expected);

const decodeOutput = (value: string): Map<string, string> => {
  const entries = new Map<string, string>();
  let remaining = value;
  while (remaining.length > 0) {
    const separatorIndex = remaining.indexOf("<<");
    const markerEndIndex = remaining.indexOf("\n", separatorIndex + 2);
    if (separatorIndex <= 0 || markerEndIndex === -1)
      throw new Error("output entry の開始形式が不正です");
    const marker = remaining.slice(separatorIndex + 2, markerEndIndex);
    const valueStartIndex = markerEndIndex + 1;
    const closingIndex = remaining.indexOf(`\n${marker}\n`, valueStartIndex);
    if (marker.length === 0 || closingIndex === -1)
      throw new Error("output entry の終了形式が不正です");
    entries.set(remaining.slice(0, separatorIndex), remaining.slice(valueStartIndex, closingIndex));
    remaining = remaining.slice(closingIndex + marker.length + 2);
  }
  return entries;
};

const mainFailureCases = [
  {
    name: "差分が空",
    diff: Buffer.from("", "utf8"),
    rules: agents,
    message: "changed files が空です",
  },
  {
    name: "Code Review Rules節が無い",
    diff: Buffer.from("docs/prd.md\0", "utf8"),
    rules: agents.replace("## Code Review Rules", "## Rules"),
    message: "## Code Review Rules は正確に1つ必要です",
  },
  {
    name: "共通部分が空",
    diff: Buffer.from("docs/prd.md\0", "utf8"),
    rules: agents.replace("共通の規律です。", ""),
    message: "共通部分が空です",
  },
  {
    name: "分類見出しが欠けている",
    diff: Buffer.from("docs/prd.md\0", "utf8"),
    rules: agents.replace("### code\n\nコードを確認します。\n\n", ""),
    message: "許可された3つの分類見出し",
  },
  {
    name: "分類見出しが重複している",
    diff: Buffer.from("docs/prd.md\0", "utf8"),
    rules: agents.replace("### code", "### code\n\n本文\n\n### code"),
    message: "許可された3つの分類見出し",
  },
  {
    name: "分類見出しの順序が違う",
    diff: Buffer.from("docs/prd.md\0", "utf8"),
    rules: agents.replace(
      "### code\n\nコードを確認します。\n\n### governance-docs",
      "### governance-docs\n\nコードを確認します。\n\n### code",
    ),
    message: "許可された3つの分類見出し",
  },
  {
    name: "ある分類の本文が空",
    diff: Buffer.from("docs/prd.md\0", "utf8"),
    rules: agents.replace("コードを確認します。", ""),
    message: "### code の本文が空です",
  },
];

const expectMainFailsClosed = (failure: (typeof mainFailureCases)[number]): void => {
  const baseSha = "base-sha";
  const headSha = "head-sha";
  const appended: Array<{ path: string; value: string }> = [];
  const diffArguments = ["diff", "--name-only", "--no-renames", "-z", baseSha, headSha];
  const showBaseArguments = ["show", `${baseSha}:AGENTS.md`];
  const runGit = (arguments_: string[]): Buffer => {
    if (hasGitArguments(arguments_, diffArguments)) return failure.diff;
    if (hasGitArguments(arguments_, showBaseArguments)) return Buffer.from(failure.rules, "utf8");
    throw new Error(`unexpected git arguments: ${arguments_.join(",")}`);
  };
  const appendFile = (path: string, value: string): void => {
    appended.push({ path, value });
  };

  expect(() =>
    main({
      environment: {
        BASE_SHA: baseSha,
        HEAD_SHA: headSha,
        REVIEW_FULL: "false",
        GITHUB_OUTPUT: "test-output",
        GITHUB_STEP_SUMMARY: "test-summary",
      },
      runGit,
      appendFile,
    }),
  ).toThrow(failure.message);
  expect(appended, failure.name).toHaveLength(0);
};

test("mainはbase SHAのAGENTS.mdとbaseからheadへの差分を使う", () => {
  const baseSha = "base-sha";
  const headSha = "head-sha";
  const baseAgents = makeAgents("BASE");
  const headAgents = makeAgents("HEAD");
  const gitCalls: string[][] = [];
  const appended: Array<{ path: string; value: string }> = [];
  const diffArguments = ["diff", "--name-only", "--no-renames", "-z", baseSha, headSha];
  const showBaseArguments = ["show", `${baseSha}:AGENTS.md`];
  const runGit = (arguments_: string[]): Buffer => {
    gitCalls.push(arguments_);
    if (hasGitArguments(arguments_, diffArguments)) return Buffer.from("docs/prd.md\0", "utf8");
    if (hasGitArguments(arguments_, showBaseArguments)) return Buffer.from(baseAgents, "utf8");
    throw new Error(`unexpected git arguments: ${arguments_.join(",")}`);
  };
  const appendFile = (path: string, value: string): void => {
    appended.push({ path, value });
  };
  const expectedPrompt = `BASE-ONLY-COMMON

### governance-docs

BASE-ONLY-GOVERNANCE`;
  const expectedSummary = `## Claude Review prompt

- Base SHA: \`base-sha\`
- Head SHA: \`head-sha\`
- Changed files:
<pre>docs/prd.md</pre>
- Classifications: governance-docs

<details><summary>組み立てたprompt</summary>

<pre>${expectedPrompt}</pre>
</details>
`;

  main({
    environment: {
      BASE_SHA: baseSha,
      HEAD_SHA: headSha,
      REVIEW_FULL: "false",
      GITHUB_OUTPUT: "test-output",
      GITHUB_STEP_SUMMARY: "test-summary",
    },
    runGit,
    appendFile,
  });

  expect(headAgents).toContain("HEAD-ONLY-GOVERNANCE");
  expect(gitCalls).toContainEqual(showBaseArguments);
  expect(gitCalls).not.toContainEqual(["show", `${headSha}:AGENTS.md`]);
  expect(gitCalls).toContainEqual(diffArguments);
  expect(appended).toHaveLength(2);
  expect(appended.map(({ path }) => path)).toEqual(["test-output", "test-summary"]);
  const output = decodeOutput(appended[0].value);
  expect([...output.keys()]).toEqual(["prompt", "classifications"]);
  expect(output.get("classifications")).toBe("governance-docs");
  expect(output.get("prompt")).toBe(expectedPrompt);
  expect(appended[0].value).not.toContain("HEAD-ONLY-GOVERNANCE");
  expect(appended[1].value).not.toContain("HEAD-ONLY-GOVERNANCE");
  expect(appended[1].value).toBe(expectedSummary);
});

test("mainはreview:fullで3分類を固定順かつカンマ区切りで出力する", () => {
  const baseSha = "base-sha";
  const headSha = "head-sha";
  const appended: Array<{ path: string; value: string }> = [];
  const diffArguments = ["diff", "--name-only", "--no-renames", "-z", baseSha, headSha];
  const showBaseArguments = ["show", `${baseSha}:AGENTS.md`];
  const runGit = (arguments_: string[]): Buffer => {
    if (hasGitArguments(arguments_, diffArguments)) return Buffer.from("docs/prd.md\0", "utf8");
    if (hasGitArguments(arguments_, showBaseArguments)) return Buffer.from(agents, "utf8");
    throw new Error(`unexpected git arguments: ${arguments_.join(",")}`);
  };
  const appendFile = (path: string, value: string): void => {
    appended.push({ path, value });
  };

  main({
    environment: {
      BASE_SHA: baseSha,
      HEAD_SHA: headSha,
      REVIEW_FULL: "true",
      GITHUB_OUTPUT: "test-output",
      GITHUB_STEP_SUMMARY: "test-summary",
    },
    runGit,
    appendFile,
  });

  const output = decodeOutput(appended[0].value);
  const prompt = output.get("prompt") ?? "";
  expect(output.get("classifications")).toBe("code,governance-docs,automation-config");
  expect(prompt).toContain("コードを確認します。");
  expect(prompt).toContain("文書を確認します。");
  expect(prompt).toContain("自動化を確認します。");
  expect(prompt.indexOf("コードを確認します。")).toBeLessThan(prompt.indexOf("文書を確認します。"));
  expect(prompt.indexOf("文書を確認します。")).toBeLessThan(prompt.indexOf("自動化を確認します。"));
  expect(appended[1].value).toContain(
    "- Classifications: code, governance-docs, automation-config",
  );
  expect(appended).toHaveLength(2);
  expect(appended.map(({ path }) => path)).toEqual(["test-output", "test-summary"]);
});

test("mainは異常時にどちらの出力先にも書き込まない", () => {
  for (const failure of mainFailureCases) expectMainFailsClosed(failure);
});

test("heredoc区切りが本文と衝突したときは再生成する", () => {
  const ids = ["collision", "safe"];
  const nextId = () => ids.shift() ?? "unexpected";

  expect(outputEntry("prompt", "collisionを含む本文", nextId)).toBe(
    "prompt<<safe\ncollisionを含む本文\nsafe\n",
  );
});

test("summary内の悪意ある変更ファイル名がMarkdownまたはHTML構造を作れない", () => {
  const summary = buildSummary({
    baseSha: "base",
    headSha: "head",
    files: ["<script>&`\n## 偽の見出し\n- 偽の項目"],
    classifications: ["automation-config"],
    prompt: "prompt",
  });

  expect(summary).toContain(
    "- Changed files:\n<pre>&lt;script&gt;&amp;&#96;⏎## 偽の見出し⏎- 偽の項目</pre>",
  );
  expect(summary).not.toContain("<script>");
  expect(summary).not.toContain("`\n## 偽の見出し");
  expect(summary).not.toContain("\n- 偽の項目");
});
