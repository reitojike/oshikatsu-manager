import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CLAUDE_REVIEW_CHECK_NAME } from "../../.github/scripts/check-claude-review.mjs";

// .github/workflows/claude-review.yml はGitHub Actions式で書かれておりYAMLパーサーに
// 掛けても式は文字列のまま残る。このテストはYAMLとして構造を検証するのではなく、
// on.pull_request.types と job の if/name 式のリテラル文字列を固定し(ズレたら赤くなる)、
// その式が実際に意図どおりの真偽・check名を返すかをJS側の同値関数で検証する
// (CodeRabbitの指摘・2026-08-14: review:full以外のラベルでjobがskipされることを
// 否定側テストとして固定していなかった)。
const testDirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = join(testDirname, "..", "..", ".github", "workflows", "claude-review.yml");
const workflowText = readFileSync(workflowPath, "utf8");

// トップレベルの `name: Claude Review` と job の `name: ${{ ... }}` が両方とも
// `name:` で始まるため、行の一意な特徴(job側は式`${{`で始まる)で狙い撃ちする。
const extractLineContaining = (needle: string) => {
  const line = workflowText.split(/\r?\n/).find((candidate) => candidate.includes(needle));
  if (line === undefined)
    throw new Error(`line containing "${needle}" not found in claude-review.yml`);
  return line.trim();
};

// permissions: ブロック(トップレベルキー、インデント0)の直後から、次のインデント0の
// 非空行(次のトップレベルキーやコメント)までを抜き出す。
const extractPermissionsBlock = () => {
  const lines = workflowText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "permissions:");
  if (start === -1) throw new Error('line "permissions:" not found in claude-review.yml');
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() !== "" && !line.startsWith(" "),
  );
  return lines.slice(start, end === -1 ? lines.length : end).map((line) => line.trim());
};

// `id: circuit-breaker` を含むstepの `- name:` 開始行から、次のstep(同じインデント以下の
// `- ` 開始行)までを抜き出す。extractLineContainingは行の先頭一致しか見ないため、
// 他のstepに同じ文字列(continue-on-error: true 等)が増えても検出できてしまう
// (CodeRabbit指摘・2026-08-16)。
const extractCircuitBreakerStepBlock = () => {
  const lines = workflowText.split(/\r?\n/);
  const idIndex = lines.findIndex((line) => line.includes("id: circuit-breaker"));
  if (idIndex === -1) throw new Error('line "id: circuit-breaker" not found in claude-review.yml');
  let start = idIndex;
  while (start > 0 && !/^\s*- name:/.test(lines[start])) start -= 1;
  const stepIndent = lines[start].search(/\S/);
  const end = lines.findIndex(
    (line, index) => index > start && /^\s*- /.test(line) && line.search(/\S/) <= stepIndent,
  );
  return lines.slice(start, end === -1 ? lines.length : end).map((line) => line.trim());
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
// claude action の if 条件(#262)。circuit-breakerがskip=trueを返したら、
// tokenが有効でもclaude actionを起動しない(--max-turnsまで焼き切る前に止める)。
const CLAUDE_STEP_IF_LINE =
  "if: steps.check.outputs.enabled == 'true' && steps.circuit-breaker.outputs.skip != 'true'";

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

  it("job name式の通常runでのcheck名が、check-claude-review.mjsのCLAUDE_REVIEW_CHECK_NAMEと一致する(#262)", () => {
    // countPriorFailuresが対象を絞り込む check run 名(CLAUDE_REVIEW_CHECK_NAME)と、
    // このYAMLが実際に報告するcheck名が食い違うと、circuit breakerは常に0件を数えて
    // 機能しなくなる。値は離れているが、この1行が両者をつなぐ。
    expect(JOB_NAME_LINE).toContain(`|| '${CLAUDE_REVIEW_CHECK_NAME}' }}`);
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

const runnableCases = [
  ["opened", undefined, true, "claude-review"],
  ["reopened", undefined, true, "claude-review"],
  ["labeled", "review:full", true, "claude-review"],
] satisfies ReadonlyArray<readonly [string, string | undefined, boolean, string]>;

const skippedLabelCases = [["bug"], ["documentation"]] satisfies ReadonlyArray<readonly [string]>;

describe("claude-review.yml: labeled行動ごとの起動可否(否定側を含む)", () => {
  it.each(runnableCases)(
    "%s(label=%s)はjobを実行し(実行結果=%s)check名は%s",
    (action, labelName, expectedRuns, expectedName) => {
      expect(jobRuns(action, labelName)).toBe(expectedRuns);
      expect(jobName(action, labelName)).toBe(expectedName);
    },
  );

  it.each(skippedLabelCases)(
    "labeled(label=%s、review:full以外)はjobをskipし、required check名(claude-review)を上書きしない(negative)",
    (labelName) => {
      expect(jobRuns("labeled", labelName)).toBe(false);
      expect(jobName("labeled", labelName)).toBe("claude-review-label-ignored");
    },
  );
});

describe("claude-review.yml: claude action 起動条件のリテラル固定(#262)", () => {
  it("claude action の if 条件に circuit-breaker の skip 判定が追加されている", () => {
    // 「steps.circuit-breaker.outputs.skip」は「Claude Review 投稿確認」stepのenvにも
    // 出現するため、claude step固有の「!= 'true'」まで含めて狙い撃ちする。
    expect(extractLineContaining("steps.circuit-breaker.outputs.skip != 'true'")).toBe(
      CLAUDE_STEP_IF_LINE,
    );
  });

  it("permissions: ブロックが commits/{sha}/check-runs を読むための checks: read を持つ(セルフレビュー指摘)", () => {
    // このpermissionが無いと GET commits/{sha}/check-runs が403になり、
    // preCheckMainのfail-open設計により黙ってskip=falseになる(circuit breakerが
    // 常にトリガーされない)。checkが赤くならないため気づきにくい退行であるため固定する。
    // permissions:ブロック内にあることまで固定する(他ブロックへの同一文字列混入を否定する)。
    expect(extractPermissionsBlock()).toContain("checks: read");
  });

  it("circuit-breaker stepに continue-on-error: true が付いている(セルフレビュー指摘)", () => {
    // このPR自身のCIでは、circuit-breaker stepが参照するscriptがbase SHA(main)から
    // 取得されるため、CHECK_MODEを解釈しない旧版scriptが実行されてthrowする
    // (Issue #262本文の既知の制約と同じ形、このPRでは自己検証できない)。
    // continue-on-errorが無いと、それだけでjob全体が赤くなり後続stepが暗黙のsuccess()
    // 判定でskipされてしまう。マージ後(mainが更新された後)のPRでは通常どおり動く。
    // circuit-breaker step自身のブロックに属することまで固定する(extractLineContainingの
    // 最初の一致だけでは、他stepへの同一文字列混入を検出できない。CodeRabbit指摘)。
    expect(extractCircuitBreakerStepBlock()).toContain("continue-on-error: true");
  });
});

// 上記のclaude action if式と同値のJS関数。circuit-breakerがskip=trueを返したときに
// enabled=trueでも起動しないことを否定側として固定する(#262の中心的な変更点)。
const claudeStepRuns = (enabled: string, circuitBreakerSkip: string | undefined) =>
  enabled === "true" && circuitBreakerSkip !== "true";

describe("claude-review.yml: circuit breaker skip によるclaude action起動可否(否定側を含む)", () => {
  it.each([
    ["true", "false", true],
    ["true", undefined, true],
    ["true", "true", false],
    ["false", "false", false],
    ["false", "true", false],
  ] satisfies ReadonlyArray<readonly [string, string | undefined, boolean]>)(
    "enabled=%s, circuitBreakerSkip=%s なら起動可否は%s",
    (enabled, circuitBreakerSkip, expected) => {
      expect(claudeStepRuns(enabled, circuitBreakerSkip)).toBe(expected);
    },
  );
});
