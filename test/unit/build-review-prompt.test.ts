import { describe, expect, test } from "vitest";
import {
  buildPrompt,
  buildSummary,
  classifyChangedFiles,
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

test("heredoc区切りが本文と衝突したときは再生成する", () => {
  const ids = ["collision", "safe"];
  const nextId = () => ids.shift() ?? "unexpected";

  expect(outputEntry("prompt", "collisionを含む本文", nextId)).toBe(
    "prompt<<safe\ncollisionを含む本文\nsafe\n",
  );
});

test("summary内の変更ファイル名をHTMLエスケープする", () => {
  const summary = buildSummary({
    baseSha: "base",
    headSha: "head",
    files: ["<script>&`\n- 偽の項目"],
    classifications: ["automation-config"],
    prompt: "prompt",
  });

  expect(summary).toContain("`&lt;script&gt;&amp;`\n- 偽の項目`");
});
