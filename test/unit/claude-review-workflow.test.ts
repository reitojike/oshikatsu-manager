import { readFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// .github/workflows/claude-review.yml はGitHub Actions式で書かれておりYAMLパーサーに
// 掛けても式は文字列のまま残る。このテストはYAMLとして構造を検証するのではなく、
// on.pull_request.types と job の if/name 式のリテラル文字列を固定し(ズレたら赤くなる)、
// その式が実際に意図どおりの真偽・check名を返すかをJS側の同値関数で検証する
// (CodeRabbitの指摘・2026-08-14: review:full以外のラベルでjobがskipされることを
// 否定側テストとして固定していなかった)。
const testDirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = path.join(
  testDirname,
  "..",
  "..",
  ".github",
  "workflows",
  "claude-review.yml",
);
const workflowText = readFileSync(workflowPath, "utf8");

// トップレベルの `name: Claude Review` と job の `name: ${{ ... }}` が両方とも
// `name:` で始まるため、行の一意な特徴(job側は式`${{`で始まる)で狙い撃ちする。
const extractLineContaining = (needle: string) => {
  const line = workflowText.split(/\r?\n/).find((candidate) => candidate.includes(needle));
  if (line === undefined)
    throw new Error(`line containing "${needle}" not found in claude-review.yml`);
  return line.trim();
};

// on.pull_request.types のリテラル。ここに synchronize が無いことは #244(起動コスト削減)の
// 中心的な変更点であり、このテストの主目的でもある。
const TYPES_LINE = "types: [opened, reopened, labeled]";
// job の if 条件。review:full以外のlabeled行動をskipする既存ロジック(変更なし)。
const JOB_IF_LINE =
  "if: github.event.action != 'labeled' || github.event.label.name == 'review:full'";
// job の name 式。skip時は claude-review 以外の名前で報告し、required status checkの
// 対象名(claude-review)を上書きしない(#95の穴の再導入防止)。
const JOB_NAME_LINE =
  "name: ${{ (github.event.action == 'labeled' && github.event.label.name != 'review:full') && 'claude-review-label-ignored' || 'claude-review' }}";

describe("claude-review.yml: トリガーとjob条件のリテラル固定", () => {
  it("on.pull_request.types からsynchronizeが外れている(#244)", () => {
    expect(extractLineContaining("types: [")).toBe(TYPES_LINE);
  });

  it("job if 条件が変更されていない(review:full以外のlabeledをskipする既存ロジック)", () => {
    expect(extractLineContaining("if: github.event.action")).toBe(JOB_IF_LINE);
  });

  it("job name 式が変更されていない(skip時はrequired check名を上書きしない)", () => {
    expect(extractLineContaining("name: ${{")).toBe(JOB_NAME_LINE);
  });
});

// 上記で固定した if/name 式と同値のJS関数(GitHub Actions式の三項演算子パターンを移植)。
// リテラルが変わればテストが赤くなるため、この移植がズレたまま気づかない経路は無い。
const jobRuns = (action: string, labelName: string | undefined) =>
  action !== "labeled" || labelName === "review:full";

const jobName = (action: string, labelName: string | undefined) =>
  action === "labeled" && labelName !== "review:full"
    ? "claude-review-label-ignored"
    : "claude-review";

describe("claude-review.yml: labeled行動ごとの起動可否(否定側を含む)", () => {
  it.each([
    ["opened", undefined, true, "claude-review"],
    ["reopened", undefined, true, "claude-review"],
    ["labeled", "review:full", true, "claude-review"],
  ] as const)(
    "%s(label=%s)はjobを実行しcheck名は%s",
    (action, labelName, expectedRuns, expectedName) => {
      expect(jobRuns(action, labelName)).toBe(expectedRuns);
      expect(jobName(action, labelName)).toBe(expectedName);
    },
  );

  it.each([["bug"], ["documentation"]] as const)(
    "labeled(label=%s、review:full以外)はjobをskipし、required check名(claude-review)を上書きしない(negative)",
    (labelName) => {
      expect(jobRuns("labeled", labelName)).toBe(false);
      expect(jobName("labeled", labelName)).toBe("claude-review-label-ignored");
    },
  );
});
