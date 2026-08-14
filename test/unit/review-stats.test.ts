import { describe, expect, it } from "vitest";

import {
  aggregate,
  assertPrListComplete,
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
  PR_LIST_LIMIT,
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

const claudeInlineComment = (reviewId: number, createdAt: string) => ({
  user: { login: "claude[bot]" },
  pull_request_review_id: reviewId,
  created_at: createdAt,
});

const claudeFace2Launch = (timestamp: string) => ({ bot: "claude[bot]", timestamp });

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
    { args: ["--since", "2026-02-30"], message: "existing calendar date" },
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

describe("assertPrListComplete", () => {
  // claude-reviewの指摘: gh-project-lib.mjsのPROJECT_ITEM_LIMIT/getProjectItemと同型の
  // fail-closed判定なのにテストが無かった。
  it("passes through the list when it is below the limit", () => {
    const prs = [{ number: 1 }, { number: 2 }];
    expect(assertPrListComplete(prs)).toBe(prs);
  });

  it("throws when the list length hits PR_LIST_LIMIT exactly (negative)", () => {
    const prs = Array.from({ length: PR_LIST_LIMIT }, (_, index) => ({ number: index }));
    expect(() => assertPrListComplete(prs)).toThrow(`${PR_LIST_LIMIT}-item limit`);
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

  it("a target bot's own non-review comment (no marker / no prefix) contributes zero launches (negative)", () => {
    // CodeRabbitの指摘: マーカー/プレフィックス判定を緩めても既存テストは緑のままだった
    // (静かな過大集計を検知できるテストが不足していた)。
    const launches = collectFace2Launches([
      {
        user: { login: "claude[bot]" },
        body: "作業を開始します。",
        created_at: "2026-08-13T01:00:00Z",
      },
      {
        user: { login: "chatgpt-codex-connector[bot]" },
        body: "承知しました。",
        created_at: "2026-08-13T02:00:00Z",
      },
    ]);
    expect(launches).toEqual([]);
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
    expect(result).toEqual({ hasRecord: false, realFixCount: 0, realFixUnparsable: false });
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
    expect(result).toEqual({ hasRecord: true, realFixCount: 0, realFixUnparsable: false });
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

  it("stops counting at ANY heading, not just the known classification headings (negative)", () => {
    // Codex Cloudの指摘: 「見送り/誤検知」以外の見出し(検証手順など)ではセクションが
    // 閉じず、その下の無関係な番号付き項目まで数えてしまっていた。
    const text = [
      "**本物の修正**",
      "1. 対応済み",
      "",
      "## 検証",
      "1. `curl https://example.com`",
      "2. `curl https://example.com/health`",
    ].join("\n");
    expect(countRealFixes(text)).toBe(1);
  });

  it("does not treat a single leading * (Markdown bullet marker) as a bold heading opener (negative)", () => {
    // Copilotの指摘: `\*{0,2}`は0〜2個の`*`を許すため、単一の`*`(箇条書きマーカー)も
    // 見出しと誤認しうる。行頭の`*`は0個か2個(太字)のみ見出しとして扱う。
    expect(countRealFixes("*本物の修正について検討する余地がある\n1. これは無関係な箇条書き")).toBe(
      0,
    );
  });

  it("does not treat an undecorated line starting with 本物の修正 as a heading (negative)", () => {
    // Copilotの指摘(抑制コメント): `#`・`**`のどちらも省略可能だと、装飾のない地の文
    // (例:「本物の修正がどれかを判断するのは難しい」)まで見出しと誤認しうる。
    expect(
      countRealFixes("本物の修正がどれかを判断するのは難しい\n1. これは無関係な箇条書き"),
    ).toBe(0);
  });

  it("returns 0 when there is no 本物の修正 heading at all", () => {
    expect(countRealFixes("1. これはただの箇条書き\n2. 見出しが無い")).toBe(0);
  });

  it("does not treat a numbered item that merely mentions 本物の修正/見送り mid-line as a heading, and does not let it leave the section open (negative)", () => {
    // claude-reviewの指摘(PR #230本文自身で再現): 見出し判定が行頭以外にもマッチすると、
    // 「本物の修正」を含む地の文の番号付き項目が見出し扱いされてcontinueし、同じ行の閉じ語
    // (見送り)にも到達できずセクションが閉じないまま、後続の無関係な番号付き項目まで数えてしまう。
    const text = [
      "1. 対応(`abc`)。→ 本物の修正として対応した",
      "2. `countRealFixes`が「本物の修正」という語に反応する可能性 → 見送り(軽微)",
      "",
      "## 別セクション",
      "1. 無関係な番号付き項目",
      "2. 無関係な番号付き項目",
    ].join("\n");
    expect(countRealFixes(text)).toBe(0);
  });
});

describe("countRealFixes: table format (#243)", () => {
  it("counts a plain 本物の修正 cell in a table row", () => {
    const text = [
      "| # | 指摘元 | 分類 | 対応 |",
      "| --- | --- | --- | --- |",
      "| 1 | claude-review | 本物の修正 | abc123 |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(1);
  });

  it("counts a ×N multiplier cell as N", () => {
    const text = [
      "| # | 指摘元 | 分類 | 対応 |",
      "| --- | --- | --- | --- |",
      "| 1 | CodeRabbit | 本物の修正×2 | abc123 |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(2);
  });

  it("does not count non-本物の修正 cells such as 見送り/誤検知/em-dash (negative)", () => {
    const text = [
      "| # | 指摘元 | 分類 | 対応 |",
      "| --- | --- | --- | --- |",
      "| 1 | claude-review | 見送る(軽微) | — |",
      "| 2 | CodeRabbit | **誤検知として見送り**(前提誤り) | — |",
      "| 3 | claude-review | — | 打ち切り |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(0);
  });

  it("sums heading+list and table counts independently without either scan re-counting the other's rows (negative)", () => {
    const text = [
      "**本物の修正**",
      "1. 直した",
      "",
      "| # | 分類 |",
      "| --- | --- |",
      "| 1 | 本物の修正×2 |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(3);
  });
});

// 手入力Markdownで起こりうる、構造が想定からずれた表の行(エスケープされたパイプ・
// バックスラッシュのパリティ・列数の書き忘れ)を扱う。いずれも「classificationColumnIndex
// が無関係な別のセルを指してしまい、実際にある本物の修正への言及がfail-closedにすら
// 上がらず握りつぶされる」という同じ形の穴に対する回帰テスト。
describe("countRealFixes: table format robustness against malformed rows (#243)", () => {
  it("handles an escaped pipe in an earlier column without misaligning the 分類 column (negative)", () => {
    // Codex Cloudの指摘(2026-08-14): 単純なsplit("|")だとセル内の`\|`(エスケープされた
    // パイプ)で余分に分割され、以降のセルが1つずつ右へずれる。分類列を正しく特定できず
    // fail-closedの前提が崩れる(この行がcoveredLinesに入るのに分類列を誤読する)。
    const text = [
      "| # | 指摘概要 | 分類 |",
      "| --- | --- | --- |",
      "| 1 | a \\| b | 本物の修正 |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(1);
  });

  it("splits on a pipe preceded by an even run of backslashes (an escaped backslash, not an escaped pipe) (negative)", () => {
    // CodeRabbitの指摘(2026-08-14): 直前の1文字だけを見るlookbehindだと、偶数個の
    // 連続バックスラッシュ(バックスラッシュ自体がエスケープされ、後続のパイプは
    // エスケープされていない)を誤って「エスケープされたパイプ」と判定し、列がずれていた。
    const text = [
      "| # | 指摘概要 | 分類 |",
      "| --- | --- | --- |",
      "| 1 | C:\\\\| 本物の修正 |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(1);
  });

  it("does not misread a shifted column when a data row's cell count differs from the header (negative)", () => {
    // claude-reviewの指摘(2026-08-14、6巡目): データ行のセル数がヘッダと不一致(列の
    // 書き忘れ等)だと、ヘッダ基準のclassificationColumnIndexが無関係な別のセルを指し、
    // 実際にある「本物の修正」への言及がfail-closedにすら上がらず握りつぶされていた。
    const text = [
      "| # | 指摘元 | 分類 | 対応 |",
      "| --- | --- | --- | --- |",
      "| 1 | 本物の修正 | ac1 |",
    ].join("\n");
    const result = summarizeClassification({
      prBody: text,
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 0, realFixUnparsable: true });
  });

  it("does not treat an omitted trailing pipe as a column-count mismatch (negative)", () => {
    // CodeRabbitの指摘(2026-08-14): 末尾の`|`は省略可能な有効なMarkdown記法(GFM)。
    // 省略の有無だけで末尾セル数が変わり、それをそのままヘッダと比較すると、正しく
    // 書かれた「本物の修正」への言及まで列数不一致として誤って判定不能にしてしまっていた。
    const text = ["| # | 分類 |", "| --- | --- |", "| 1 | 本物の修正"].join("\n");
    expect(countRealFixes(text)).toBe(1);
  });
});

describe("countRealFixes: 分類列限定・セル書式の判定 (#243)", () => {
  it("counts only the 分類 column, not a description column that happens to start with 本物の修正 (negative)", () => {
    // /code-reviewのセルフレビューで発見: 全セルを無条件に走査すると、分類列以外の
    // 説明文がたまたま「本物の修正」で始まるだけで誤集計する。
    const text = [
      "| # | 分類 | 指摘概要 |",
      "| --- | --- | --- |",
      "| 1 | 見送り | 本物の修正が必要か再検討中 |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(0);
  });

  it("tolerates whitespace before the ×N multiplier (negative)", () => {
    // /code-reviewのセルフレビューで発見: `×`の前に空白があると乗数を読み落としていた。
    const text = ["| # | 分類 |", "| --- | --- |", "| 1 | 本物の修正 ×2 |"].join("\n");
    expect(countRealFixes(text)).toBe(2);
  });

  it("does not count anything in a table with no 分類 header column (negative)", () => {
    const text = ["| # | 状態 |", "| --- | --- |", "| 1 | 本物の修正 |"].join("\n");
    expect(countRealFixes(text)).toBe(0);
  });

  it("rejects an undecided/free-text 分類 cell that merely starts with 本物の修正 (negative)", () => {
    // CodeRabbitの指摘: 前方一致だけだと「本物の修正が必要か再検討中」のような未確定の
    // 地の文も分類列に書かれていれば1件と誤集計してしまう(realFixUnparsableも骨抜きになる)。
    const text = ["| # | 分類 |", "| --- | --- |", "| 1 | 本物の修正が必要か再検討中 |"].join("\n");
    expect(countRealFixes(text)).toBe(0);
  });

  it("still allows the exact annotated forms seen in real records (regression)", () => {
    const text = [
      "| # | 分類 |",
      "| --- | --- |",
      "| 1 | 本物の修正 |",
      "| 2 | 本物の修正×2 |",
      "| 3 | 本物の修正(自己訂正) |",
      "| 4 | **本物の修正** |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(5);
  });

  it("rejects an unconfirmed parenthetical annotation such as (要検討)/(保留) (negative)", () => {
    // claude-reviewの指摘: 括弧の中身を問わず1件と数めていたため、まだ確定していない
    // ことを示す注記まで無条件に本物の修正として数えてしまっていた。
    const text = [
      "| # | 分類 |",
      "| --- | --- |",
      "| 1 | 本物の修正(要検討) |",
      "| 2 | 本物の修正(保留) |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(0);
  });
});

describe("countRealFixes: PR #225 fixture regression (#243)", () => {
  it("matches the real fixture: PR #225's classification table sums to 15 (regression)", () => {
    // 実測(2026-08-13): PR #225「レビュー巡の記録」表の分類列を数えると15件になった
    // (現状の実装は0件を返す既知の不具合)。fail-closed化・表対応の追加後もこの実測値を
    // 回帰させないための固定テスト。
    const text = [
      "| # | HEAD | 指摘元 | 指摘概要 | 分類 | 対応 |",
      "| --- | --- | --- | --- | --- | --- |",
      "| 1 | d0f9e03 | claude-review(P0) | ... | 本物の修正 | ac24fe2 |",
      "| 1 | d0f9e03 | CodeRabbit | ... | 本物の修正×2 | ac24fe2 / 2fbef0e |",
      "| 3 | 2fbef0e〜df8e203 | CodeRabbit | ... | 本物の修正×2 | df8e203 |",
      "| 4 | df8e203 | claude-review(P1) | ... | 本物の修正 | 14ccb8a |",
      "| 5 | 14ccb8a | claude-review(P1×2) | ... | 本物の修正×2 | 22ca8bb |",
      "| 6 | 22ca8bb | (メインセッション実測) | ... | 本物の修正 | 84628cb |",
      "| 7 | 84628cb | CodeRabbit | ... | 本物の修正 | f174ba2 |",
      "| 7 | 84628cb | CodeRabbit | ... | **誤検知として見送り**(前提誤り) | コメントで記録 |",
      "| 8 | f174ba2 | (メインセッション実測) | ... | 本物の修正(自己訂正) | 32117b7 |",
      "| 9 | 32117b7 | claude-review(P0) | ... | 本物の修正 | 0dc9066 |",
      "| 9 | 32117b7 | claude-review(P1) | ... | 本物の修正 | 0dc9066 |",
      "| 10 | 0dc9066 | claude-review(P1候補) | ... | 本物の修正 | 5c967a0 |",
      "| 11 | 5c967a0 | claude-review(P1) | ... | 本物の修正 | e652e94 |",
      "| 12 | e652e94 | claude-review | **P0/P1指摘なし** | — | 打ち切り |",
      "| 12 | e652e94 | CodeRabbit | レート制限中 | — | — |",
      "| — | — | claude-review(参考・P0/P1非該当) | ... | 見送る(軽微、対象外) | 対応なし |",
    ].join("\n");
    expect(countRealFixes(text)).toBe(15);
  });
});

// --- 否定側テスト4: 「本物の修正0件」と「構造化できず判定不能」を同じ0扱いにしない ---
describe("realFixUnparsable: fail-closed distinction between 0件 and 判定不能 (#243)", () => {
  it("is false when no 本物の修正 mention exists anywhere (genuine zero)", () => {
    const result = summarizeClassification({
      prBody: "**見送り**\n1. 既存慣習に合わせて見送り",
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 0, realFixUnparsable: false });
  });

  it("is true when 本物の修正 is mentioned but neither structured parser could count it (negative)", () => {
    // 見出し+番号付きリストでも表でもない、地の文だけの言及(記載漏れ・未知の書式を想定)。
    const result = summarizeClassification({
      prBody: "レビューで1件を本物の修正として対応した。",
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 0, realFixUnparsable: true });
  });

  it("is false when the table format successfully counts at least one item", () => {
    const result = summarizeClassification({
      prBody: ["| 分類 |", "| --- |", "| 本物の修正 |"].join("\n"),
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 1, realFixUnparsable: false });
  });
});

describe("realFixUnparsable: 複数テキスト・複数行にまたがる握りつぶしを防ぐ (#243)", () => {
  it("stays true even when a different human text's count makes the PR total non-zero (negative)", () => {
    // claude-reviewの指摘: PR全体を合算してから0判定すると、prBodyの表形式で1件正しく
    // 数えられた場合、別のissueCommentにある未パースの言及(地の文)が握りつぶされ、
    // realFixUnparsableがfalseに戻ってしまっていた。テキストごとに判定する必要がある。
    const result = summarizeClassification({
      prBody: ["| 分類 |", "| --- |", "| 本物の修正 |"].join("\n"),
      issueComments: [
        {
          user: { login: "reitojike" },
          body: "他にも1件、本物の修正として対応した(見出しも表も無い地の文)。",
        },
      ],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 1, realFixUnparsable: true });
  });

  it("stays true even when a different row in the SAME table cell/text makes the count non-zero (negative)", () => {
    // claude-reviewの指摘(2026-08-14、2巡目): テキスト単位の判定に直した後も、
    // 同じテキスト内の別の行(表の別セル)が正しく数えられていると、KNOWN_ANNOTATIONSに
    // 無い未登録の確定表記(例: 「本物の修正(部分適用)」)を握りつぶしてしまっていた。
    const result = summarizeClassification({
      prBody: ["| 分類 |", "| --- |", "| 本物の修正 |", "| 本物の修正(部分適用) |"].join("\n"),
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 1, realFixUnparsable: true });
  });

  it("stays true when an un-itemized note inside a 本物の修正 heading section mentions it again (negative)", () => {
    // 見出し+番号付きリスト形式でも同型の穴がありうる: セクション内の番号無し行
    // (地の文の注記)は現状カウントされないが、その行自体が「本物の修正」に言及していれば
    // 判定不能として拾う。
    const text = ["**本物の修正**", "1. 直した", "本物の修正だが要件が未確定の1件を保留"].join(
      "\n",
    );
    const result = summarizeClassification({
      prBody: text,
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 1, realFixUnparsable: true });
  });
});

describe("realFixUnparsable: 分類列限定・行の被覆範囲を守る (#243)", () => {
  it("is false when the 分類 column resolves cleanly even if another column mentions 本物の修正 (negative)", () => {
    // claude-reviewの指摘(2026-08-14、3巡目): hasUnparsedMentionのフォールバックが
    // テキスト全体を再スキャンしていたため、「分類」列は明確に0件(見送り)と読み取れて
    // いても、無関係な別の列(指摘概要等)にある「本物の修正」という語のせいで
    // 判定不能扱いになっていた。分類列限定の原則はhasUnparsedMention側でも守る必要がある。
    const text = [
      "| # | 分類 | 指摘概要 |",
      "| --- | --- | --- |",
      "| 1 | 見送り | 本物の修正が必要か再検討中 |",
    ].join("\n");
    const result = summarizeClassification({
      prBody: text,
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 0, realFixUnparsable: false });
  });

  it("stays true when a mention outside any table/heading structure sits alongside a resolved table (negative)", () => {
    // claude-reviewの指摘(2026-08-14、4巡目): hasStructureゲートは「テキスト中のどこかに
    // 構造があるか」でフォールバック全体のon/offを決めていたため、表が1つ見つかっただけで
    // その表にも見出しセクションにも属さない別の場所の地の文言及が、判定不能に上がらず
    // 握りつぶされていた。行ごとの被覆範囲(coveredLines)で判定する必要がある。
    const text = [
      "| 分類 |",
      "| --- |",
      "| 本物の修正 |",
      "",
      "あと、他にも1件本物の修正として対応した(表に書き忘れ)。",
    ].join("\n");
    const result = summarizeClassification({
      prBody: text,
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 1, realFixUnparsable: true });
  });

  it("is false when a table follows a 本物の修正 heading without an explicit closing heading (negative)", () => {
    // 見出しセクションが表行では閉じないと、後続の独立した表がセクション内の地の文として
    // 誤って未パース扱いされる(表側は正しく数えているにもかかわらず判定不能になる過剰検知)。
    // 表行(`|`始まり)もセクションの閉じ語に含めることで、表は表として独立に走査させる。
    const text = [
      "**本物の修正**",
      "1. 直した",
      "",
      "| # | 分類 |",
      "| --- | --- |",
      "| 1 | 本物の修正×2 |",
    ].join("\n");
    const result = summarizeClassification({
      prBody: text,
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 3, realFixUnparsable: false });
  });

  it("stays true for a 本物の修正 mention in a table with no 分類 header column (negative)", () => {
    // claude-reviewの指摘(2026-08-14、5巡目): 「分類」列が見つからない表(=分類記録の
    // 表として認識できない)のデータ行も無条件にcoveredLinesへ入れていたため、
    // parseTableDataRowが中身を見ずに{count:0, hasUnparsedMention:false}を返した後、
    // 全体フォールバック走査からもその行が除外され、言及が判定不能に上がらず
    // 静かに0件として消えていた。既存のnegative test(countRealFixesが0を返すことのみ検証)
    // ではこの欠陥を検出できていなかった。
    const text = ["| # | 状態 |", "| --- | --- |", "| 1 | 本物の修正 |"].join("\n");
    const result = summarizeClassification({
      prBody: text,
      issueComments: [],
      botLogins: TARGET_BOTS,
    });
    expect(result).toEqual({ hasRecord: true, realFixCount: 0, realFixUnparsable: true });
  });
});

describe("realFixUnparsable: formatPrLine/aggregate/formatSummaryへの反映 (#243)", () => {
  it("formatPrLine reports 判定不能 distinctly from a genuine 0件 (negative)", () => {
    const unparsablePr = summarizePr({
      prNumber: 1,
      prBody: "レビューで1件を本物の修正として対応した。",
      issueComments: [],
      reviews: [],
      reviewComments: [],
    });
    expect(formatPrLine(unparsablePr)).toContain("本物の修正:判定不能");
    expect(formatPrLine(unparsablePr)).not.toContain("本物の修正:0件");
  });

  it("aggregate counts prsWithUnparsableRealFix separately from prsWithoutRecord", () => {
    const unparsablePr = summarizePr({
      prNumber: 1,
      prBody: "レビューで1件を本物の修正として対応した。",
      issueComments: [],
      reviews: [],
      reviewComments: [],
    });
    const summary = aggregate([emptyPr(2), unparsablePr]);
    expect(summary.prsWithoutRecord).toBe(1);
    expect(summary.prsWithUnparsableRealFix).toBe(1);
  });

  it("formatSummary includes the 判定不能 total", () => {
    const unparsablePr = summarizePr({
      prNumber: 1,
      prBody: "レビューで1件を本物の修正として対応した。",
      issueComments: [],
      reviews: [],
      reviewComments: [],
    });
    expect(formatSummary(aggregate([unparsablePr]))).toContain("本物の修正 判定不能PR数: 1");
  });
});

describe("attachFace2Findings", () => {
  it("attributes an inline comment posted BEFORE its own launch, not after (negative)", () => {
    // claude-reviewの指摘: claude[bot]はインラインコメントを総評コメント(面2)より先に投稿する
    // (`.github/workflows/claude-review.yml`のprompt指示の順序どおり)。窓は「直前の起動より後、
    // この起動の時刻まで」でなければならない。
    const launches = [
      claudeFace2Launch("2026-08-12T16:00:00Z"),
      claudeFace2Launch("2026-08-12T17:00:00Z"),
    ];
    const reviewComments = [
      claudeInlineComment(100, "2026-08-12T15:59:00Z"),
      claudeInlineComment(101, "2026-08-12T16:59:00Z"),
    ];
    const result = attachFace2Findings(launches, reviewComments, new Set());
    expect(result.map((launch) => launch.hasFinding)).toEqual([true, true]);
  });

  it("PR #219 real 4-round shape: reproduces claude-review's expected true/false/false/true (negative)", () => {
    const launches = [
      "2026-08-12T16:29:54Z",
      "2026-08-12T16:34:04Z",
      "2026-08-12T16:45:57Z",
      "2026-08-12T16:57:26Z",
    ].map(claudeFace2Launch);
    const reviewComments = [
      claudeInlineComment(1, "2026-08-12T16:29:25Z"),
      claudeInlineComment(2, "2026-08-12T16:57:05Z"),
      claudeInlineComment(3, "2026-08-12T16:57:09Z"),
    ];
    const result = attachFace2Findings(launches, reviewComments, new Set());
    expect(result.map((launch) => launch.hasFinding)).toEqual([true, false, false, true]);
  });

  it("excludes inline comments already claimed by a counted face-3 launch", () => {
    const launches = [{ bot: "chatgpt-codex-connector[bot]", timestamp: "2026-08-11T10:59:32Z" }];
    const reviewComments = [codexInlineComment(4907460540, "2026-08-11T10:00:00Z")];
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

  it("claude[bot]: the launch whose window covers a preceding inline comment is findingLaunches=1, the other is 0", () => {
    // インラインコメントは自分の総評(面2)より先に投稿される(claude-reviewの指摘、PR #219実測)。
    const issueComments = [
      claudeLaunch("2026-08-12T16:00:00Z"),
      claudeLaunch("2026-08-12T18:00:00Z"),
    ];
    const reviews = [
      { user: { login: "claude[bot]" }, id: 100, submitted_at: "2026-08-12T17:59:00Z" },
    ];
    const reviewComments = [
      {
        user: { login: "claude[bot]" },
        pull_request_review_id: 100,
        created_at: "2026-08-12T17:59:00Z",
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
