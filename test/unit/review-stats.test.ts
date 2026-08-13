import { describe, expect, it } from "vitest";

import {
  aggregate,
  attachFace2Findings,
  collectFace2Launches,
  collectFace3Launches,
  countRealFixes,
  countUsageLimitHits,
  filterMergedSince,
  formatPrLine,
  formatSummary,
  isUsageLimitMessage,
  parseArguments,
  summarizeBotLaunches,
  summarizeClassification,
  summarizePr,
  TARGET_BOTS,
} from "../../scripts/review-stats-lib.mjs";

const codexUsageLimit = (createdAt: string) => ({
  user: { login: "chatgpt-codex-connector[bot]" },
  body: "You have reached your Codex usage limits for code reviews. You can see your limits in the dashboard.",
  created_at: createdAt,
});

const codexZeroFindingLaunch = (createdAt: string) => ({
  user: { login: "chatgpt-codex-connector[bot]" },
  body: "Codex Review: Didn't find any major issues. Hooray!",
  created_at: createdAt,
});

const claudeLaunch = (createdAt: string, sha = "0d5a51661d6b4488b88bcdb087612de3482f3714") => ({
  user: { login: "claude[bot]" },
  body: `<!-- claude-review-head-sha:${sha} -->\n\n## レビュー結果\n\nP0/P1指摘: 0件`,
  created_at: createdAt,
});

const codexReview = (id: number, submittedAt: string) => ({
  user: { login: "chatgpt-codex-connector[bot]" },
  id,
  submitted_at: submittedAt,
});

const codexInlineComment = (reviewId: number, createdAt: string) => ({
  user: { login: "chatgpt-codex-connector[bot]" },
  pull_request_review_id: reviewId,
  created_at: createdAt,
});

const emptyPr = (prNumber: number) =>
  summarizePr({ prNumber, prBody: "", issueComments: [], reviews: [], reviewComments: [] });

describe("parseArguments", () => {
  it("defaults repo to reitojike/stage-tracker", () => {
    expect(parseArguments(["--since", "2026-08-09"])).toEqual({
      repo: "reitojike/stage-tracker",
      since: "2026-08-09",
    });
  });

  it("parses --pr and --repo", () => {
    expect(parseArguments(["--pr", "227", "--repo", "acme/widgets"])).toEqual({
      repo: "acme/widgets",
      pr: 227,
    });
  });

  it.each([
    { args: [], message: "either --since or --pr is required" },
    { args: ["--since", "2026-08-09", "--pr", "227"], message: "mutually exclusive" },
    { args: ["--since", "08-09-2026"], message: "--since must be YYYY-MM-DD" },
    { args: ["--pr", "abc"], message: "--pr requires a positive integer" },
    { args: ["--repo", "no-slash", "--pr", "1"], message: "--repo must be owner/name" },
    { args: ["--wat"], message: "unknown argument" },
  ])("rejects invalid arguments: $message", ({ args, message }) => {
    expect(() => parseArguments(args)).toThrow(message);
  });
});

describe("filterMergedSince", () => {
  it("keeps PRs merged on/after the cutoff and drops earlier or unmerged ones", () => {
    const prs = [
      { number: 1, mergedAt: "2026-08-09T00:00:00Z" },
      { number: 2, mergedAt: "2026-08-08T23:59:59Z" },
      { number: 3, mergedAt: undefined },
    ];
    expect(filterMergedSince(prs, "2026-08-09").map((pr: { number: number }) => pr.number)).toEqual(
      [1],
    );
  });
});

// --- 否定側テスト1: 利用上限メッセージは起動に数えない ---
describe("usage limit messages are not counted as launches (negative)", () => {
  it("isUsageLimitMessage / countUsageLimitHits recognize the Codex usage-limit text", () => {
    const comment = codexUsageLimit("2026-08-13T01:00:00Z");
    expect(isUsageLimitMessage(comment)).toBe(true);
    expect(countUsageLimitHits([comment, codexZeroFindingLaunch("2026-08-13T02:00:00Z")])).toBe(1);
  });

  it("a usage-limit comment contributes zero launches, only the review-result comment does", () => {
    const launches = collectFace2Launches([
      codexUsageLimit("2026-08-13T01:00:00Z"),
      codexZeroFindingLaunch("2026-08-13T02:00:00Z"),
    ]);
    expect(launches).toEqual([
      { bot: "chatgpt-codex-connector[bot]", timestamp: "2026-08-13T02:00:00Z" },
    ]);
  });

  it("summarizeBotLaunches: launches=1 (not 2) when one of two Codex issue comments is a usage-limit message", () => {
    const stats = summarizeBotLaunches({
      issueComments: [
        codexUsageLimit("2026-08-13T01:00:00Z"),
        codexZeroFindingLaunch("2026-08-13T02:00:00Z"),
      ],
      reviews: [],
      reviewComments: [],
    });
    expect(stats.get("chatgpt-codex-connector[bot]")).toEqual({ launches: 1, findingLaunches: 0 });
  });
});

// --- 否定側テスト2: 面4のインラインコメントは起動回数に二重計上しない ---
describe("face-4 inline comments do not add extra launches (negative)", () => {
  it("collectFace3Launches counts one launch per review regardless of how many linked inline comments exist", () => {
    const reviews = [
      { user: { login: "coderabbitai[bot]" }, id: 1, submitted_at: "2026-08-13T01:22:30Z" },
    ];
    const launches = collectFace3Launches(reviews);
    expect(launches).toEqual([
      { bot: "coderabbitai[bot]", timestamp: "2026-08-13T01:22:30Z", reviewId: 1 },
    ]);
  });

  it("ignores a PENDING review (submitted_at: null) instead of letting it corrupt the timeline (negative)", () => {
    const reviews = [
      { user: { login: "coderabbitai[bot]" }, id: 1, state: "PENDING", submitted_at: null },
      { user: { login: "coderabbitai[bot]" }, id: 2, submitted_at: "2026-08-13T01:22:30Z" },
    ];
    expect(collectFace3Launches(reviews)).toEqual([
      { bot: "coderabbitai[bot]", timestamp: "2026-08-13T01:22:30Z", reviewId: 2 },
    ]);
  });

  it("summarizeBotLaunches: 6 linked inline comments still count as 1 launch (CodeRabbit shape from PR #224)", () => {
    const reviews = [
      {
        user: { login: "coderabbitai[bot]" },
        id: 4922580225,
        submitted_at: "2026-08-13T01:22:30Z",
      },
    ];
    const reviewComments = Array.from({ length: 6 }, (_, index) => ({
      user: { login: "coderabbitai[bot]" },
      pull_request_review_id: 4922580225,
      created_at: `2026-08-13T01:22:${28 + index}Z`,
    }));
    const stats = summarizeBotLaunches({ issueComments: [], reviews, reviewComments });
    expect(stats.get("coderabbitai[bot]")).toEqual({ launches: 1, findingLaunches: 1 });
  });

  it("claude[bot]'s per-inline-comment empty-body reviews are excluded from face-3 launch counting", () => {
    // 実測(PR #219): インラインコメント1件ごとにbody空・state COMMENTEDのreviewが1件生成される。
    const reviews = [
      {
        user: { login: "claude[bot]" },
        id: 100,
        state: "COMMENTED",
        submitted_at: "2026-08-12T16:29:25Z",
      },
      {
        user: { login: "claude[bot]" },
        id: 101,
        state: "COMMENTED",
        submitted_at: "2026-08-12T16:57:05Z",
      },
      {
        user: { login: "claude[bot]" },
        id: 102,
        state: "COMMENTED",
        submitted_at: "2026-08-12T16:57:09Z",
      },
    ];
    expect(collectFace3Launches(reviews)).toEqual([]);
  });
});

// --- 否定側テスト3: 「分類記録なし」と「有効な指摘0件」を同じカウンタに入れない ---
describe("classification record absence vs explicit zero (negative)", () => {
  it("hasRecord is false and realFixCount is 0 when no classification vocabulary appears anywhere", () => {
    const result = summarizeClassification({
      prBody: "普通のPR説明。分類の言及なし。",
      issueComments: [{ user: { login: "reitojike" }, body: "CIが緑になりました。" }],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: false, realFixCount: 0 });
  });

  it("hasRecord is true and realFixCount is 0 when a record explicitly finds zero real fixes", () => {
    const result = summarizeClassification({
      prBody: "",
      issueComments: [
        {
          user: { login: "reitojike" },
          body: "CodeRabbitの指摘1件を確認した。\n\n**見送り(理由付き)**\n1. 既存慣習に合わせているため見送り",
        },
      ],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 0 });
  });

  it("summarizePr keeps hasClassificationRecord=false distinct from a genuine realFixCount=0", () => {
    const noRecordPr = emptyPr(1);
    expect(noRecordPr.hasClassificationRecord).toBe(false);
    expect(noRecordPr.realFixCount).toBe(0);

    const zeroFixPr = summarizePr({
      prNumber: 2,
      prBody: "**誤検知**\n1. 前提が実測と食い違う",
      issueComments: [],
      reviews: [],
      reviewComments: [],
    });
    expect(zeroFixPr.hasClassificationRecord).toBe(true);
    expect(zeroFixPr.realFixCount).toBe(0);
  });
});

describe("countRealFixes", () => {
  it("counts numbered items directly under a 本物の修正 heading", () => {
    const text = [
      "**本物の修正として対応(`32d63ae`)**",
      "1. docs/worktree-policy.md:365 — 記述を更新した",
      "2. scripts/worktree-audit-lib.mjs:259 — gh呼び出しを吸収した",
      "3. test/unit/worktree-audit.test.ts:333 — Mapに変更した",
      "",
      "**見送り(理由付き)**",
      "2. scripts/worktree-audit-lib.mjs:17 — 既存慣習に合わせて見送り",
    ].join("\n");
    expect(countRealFixes(text)).toBe(3);
  });

  it("stops counting once a different classification heading starts (negative)", () => {
    const text = [
      "**本物の修正**",
      "1. 対応済み",
      "**誤検知**",
      "1. 前提が違う",
      "2. 前提が違う",
    ].join("\n");
    expect(countRealFixes(text)).toBe(1);
  });

  it("returns 0 when there is no 本物の修正 heading at all", () => {
    expect(countRealFixes("1. これはただの箇条書き\n2. 見出しが無い")).toBe(0);
  });
});

describe("attachFace2Findings", () => {
  it("attributes an inline comment to the launch whose time window contains it", () => {
    const launches = [
      { bot: "claude[bot]", timestamp: "2026-08-12T16:00:00Z" },
      { bot: "claude[bot]", timestamp: "2026-08-12T17:00:00Z" },
    ];
    const reviewComments = [
      {
        user: { login: "claude[bot]" },
        pull_request_review_id: 100,
        created_at: "2026-08-12T16:29:25Z",
      },
      {
        user: { login: "claude[bot]" },
        pull_request_review_id: 101,
        created_at: "2026-08-12T17:30:00Z",
      },
    ];
    const result = attachFace2Findings(launches, reviewComments, new Set());
    expect(result).toEqual([
      { bot: "claude[bot]", timestamp: "2026-08-12T16:00:00Z", hasFinding: true },
      { bot: "claude[bot]", timestamp: "2026-08-12T17:00:00Z", hasFinding: true },
    ]);
  });

  it("excludes inline comments already claimed by a counted face-3 launch", () => {
    const launches = [{ bot: "chatgpt-codex-connector[bot]", timestamp: "2026-08-11T10:59:32Z" }];
    const reviewComments = [
      {
        user: { login: "chatgpt-codex-connector[bot]" },
        pull_request_review_id: 4907460540,
        created_at: "2026-08-11T14:44:33Z",
      },
    ];
    const result = attachFace2Findings(launches, reviewComments, new Set([4907460540]));
    expect(result).toEqual([
      { bot: "chatgpt-codex-connector[bot]", timestamp: "2026-08-11T10:59:32Z", hasFinding: false },
    ]);
  });
});

describe("summarizeBotLaunches: integration", () => {
  it("PR #169 shape: 3 finding-review launches + 1 zero-finding issue-comment launch for Codex", () => {
    const reviews = [
      {
        user: { login: "chatgpt-codex-connector[bot]" },
        id: 1,
        submitted_at: "2026-08-11T09:47:13Z",
      },
      {
        user: { login: "chatgpt-codex-connector[bot]" },
        id: 2,
        submitted_at: "2026-08-11T10:27:38Z",
      },
      {
        user: { login: "chatgpt-codex-connector[bot]" },
        id: 3,
        submitted_at: "2026-08-11T10:47:09Z",
      },
    ];
    const reviewComments = [1, 2, 3].map((reviewId) => ({
      user: { login: "chatgpt-codex-connector[bot]" },
      pull_request_review_id: reviewId,
      created_at: "2026-08-11T10:00:00Z",
    }));
    const issueComments = [codexZeroFindingLaunch("2026-08-11T10:59:32Z")];
    const stats = summarizeBotLaunches({ issueComments, reviews, reviewComments });
    expect(stats.get("chatgpt-codex-connector[bot]")).toEqual({ launches: 4, findingLaunches: 3 });
  });

  it("claude[bot]: one launch with a linked inline comment is findingLaunches=1, one without is 0", () => {
    const issueComments = [
      claudeLaunch("2026-08-12T16:00:00Z"),
      claudeLaunch("2026-08-12T18:00:00Z"),
    ];
    const reviews = [
      { user: { login: "claude[bot]" }, id: 100, submitted_at: "2026-08-12T16:29:25Z" },
    ];
    const reviewComments = [
      {
        user: { login: "claude[bot]" },
        pull_request_review_id: 100,
        created_at: "2026-08-12T16:29:25Z",
      },
    ];
    const stats = summarizeBotLaunches({ issueComments, reviews, reviewComments });
    expect(stats.get("claude[bot]")).toEqual({ launches: 2, findingLaunches: 1 });
  });

  it("unrelated bots and human comments never contribute launches", () => {
    const stats = summarizeBotLaunches({
      issueComments: [
        { user: { login: "reitojike" }, body: "@codex review", created_at: "2026-08-13T00:00:00Z" },
      ],
      reviews: [{ user: { login: "some-other-bot" }, id: 1, submitted_at: "2026-08-13T00:00:00Z" }],
      reviewComments: [],
    });
    for (const bot of TARGET_BOTS)
      expect(stats.get(bot)).toEqual({ launches: 0, findingLaunches: 0 });
  });
});

describe("aggregate", () => {
  it("computes per-bot launches-per-PR and finding rate across multiple PRs", () => {
    const perPr = [
      summarizePr({
        prNumber: 1,
        prBody: "",
        issueComments: [codexZeroFindingLaunch("2026-08-11T10:59:32Z")],
        reviews: [],
        reviewComments: [],
      }),
      summarizePr({
        prNumber: 2,
        prBody: "",
        issueComments: [],
        reviews: [codexReview(1, "2026-08-11T10:00:00Z")],
        reviewComments: [codexInlineComment(1, "2026-08-11T10:00:00Z")],
      }),
    ];
    const summary = aggregate(perPr);
    expect(summary.prCount).toBe(2);
    expect(summary.perBot["chatgpt-codex-connector[bot]"]).toEqual({
      launches: 2,
      launchesPerPr: 1,
      findingRate: 0.5,
    });
  });

  it("findingRate is 0 (not NaN) for a bot with zero launches (negative)", () => {
    const summary = aggregate([emptyPr(1)]);
    expect(summary.perBot["coderabbitai[bot]"]).toEqual({
      launches: 0,
      launchesPerPr: 0,
      findingRate: 0,
    });
  });

  it("counts prsWithoutRecord separately from totalRealFixes", () => {
    const withRecord = summarizePr({
      prNumber: 2,
      prBody: "**本物の修正**\n1. 直した",
      issueComments: [],
      reviews: [],
      reviewComments: [],
    });
    const summary = aggregate([emptyPr(1), withRecord]);
    expect(summary.prsWithoutRecord).toBe(1);
    expect(summary.totalRealFixes).toBe(1);
  });
});

describe("formatPrLine / formatSummary", () => {
  it("never includes raw comment bodies, only counts", () => {
    const pr = summarizePr({
      prNumber: 227,
      prBody: "**本物の修正**\n1. 直した",
      issueComments: [],
      reviews: [],
      reviewComments: [],
    });
    const line = formatPrLine(pr);
    expect(line).toContain("PR#227");
    expect(line).toContain("本物の修正:1件");
    expect(line).not.toContain("直した");
  });

  it("marks a PR with no classification record distinctly from one with a record", () => {
    expect(formatPrLine(emptyPr(1))).toContain("分類記録なし");
  });

  it("formatSummary reports totals without throwing on an empty PR list", () => {
    expect(formatSummary(aggregate([]))).toContain("対象PR数: 0");
  });
});
