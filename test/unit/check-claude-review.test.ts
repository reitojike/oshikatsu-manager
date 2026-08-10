import { describe, expect, test } from "vitest";
import {
  countClaudePosts,
  flattenGhPages,
  headShaMarker,
  reviewCheckDecision,
} from "../../.github/scripts/check-claude-review.mjs";

describe("reviewCheckDecision", () => {
  test("action未実行と失敗をそのまま判定する", () => {
    expect(
      reviewCheckDecision({ outcome: "skipped", conclusion: undefined, postCount: undefined }),
    ).toBe("skipped");
    expect(
      reviewCheckDecision({ outcome: "failure", conclusion: undefined, postCount: undefined }),
    ).toBe("failure");
  });

  test("未知のoutcomeを説明付きで拒否する", () => {
    expect(() =>
      reviewCheckDecision({ outcome: "cancelled", conclusion: undefined, postCount: undefined }),
    ).toThrow("未知のCLAUDE_OUTCOMEです: cancelled");
  });

  test("successの検証段階を判定する", () => {
    expect(reviewCheckDecision({ outcome: "success", conclusion: "", postCount: undefined })).toBe(
      "validation-skipped",
    );
    expect(
      reviewCheckDecision({ outcome: "success", conclusion: undefined, postCount: undefined }),
    ).toBe("validation-skipped");
    expect(
      reviewCheckDecision({ outcome: "success", conclusion: "success", postCount: undefined }),
    ).toBe("check-posts");
  });

  test("投稿件数の有無を判定する", () => {
    expect(reviewCheckDecision({ outcome: "success", conclusion: "success", postCount: 0 })).toBe(
      "missing-posts",
    );
    expect(reviewCheckDecision({ outcome: "success", conclusion: "success", postCount: 1 })).toBe(
      "posts-found",
    );
    expect(reviewCheckDecision({ outcome: "success", conclusion: "success", postCount: 2 })).toBe(
      "posts-found",
    );
  });
});

describe("countClaudePosts", () => {
  const headSha = "abc123";
  const since = "2026-08-10T01:00:00Z";
  const bot = { login: "claude[bot]" };

  test("対象headのマーカーを持つ総評だけを数える", () => {
    const otherHeadSha = `${headSha}4`;
    const issueComments = [
      { user: bot, body: `総評 ${headShaMarker(headSha)}`, created_at: since },
      { user: bot, body: "マーカーなし", created_at: "2026-08-10T01:01:00Z" },
      {
        user: bot,
        body: `別head ${headShaMarker(otherHeadSha)}`,
        created_at: "2026-08-10T01:01:00Z",
      },
    ];

    expect(
      countClaudePosts({ issueComments, reviews: [], reviewComments: [], headSha, since }),
    ).toBe(1);
  });

  test("開始前の3種類の投稿を数えない", () => {
    const before = "2026-08-10T00:59:59Z";
    const issueComments = [{ user: bot, body: headShaMarker(headSha), created_at: before }];
    const reviews = [{ user: bot, commit_id: headSha, submitted_at: before }];
    const reviewComments = [{ user: bot, commit_id: headSha, created_at: before }];

    expect(countClaudePosts({ issueComments, reviews, reviewComments, headSha, since })).toBe(0);
  });

  test("review系は対象headだけを数える", () => {
    const reviews = [
      { user: bot, commit_id: headSha, submitted_at: since },
      { user: bot, commit_id: "other", submitted_at: since },
    ];
    const reviewComments = [
      { user: bot, commit_id: headSha, created_at: since },
      { user: bot, commit_id: "other", created_at: since },
    ];

    expect(countClaudePosts({ issueComments: [], reviews, reviewComments, headSha, since })).toBe(
      2,
    );
  });

  test("claude bot以外の投稿を数えない", () => {
    const user = { login: "other-user" };
    const issueComments = [{ user, body: headShaMarker(headSha), created_at: since }];
    const reviews = [{ user, commit_id: headSha, submitted_at: since }];
    const reviewComments = [{ user, commit_id: headSha, created_at: since }];

    expect(countClaudePosts({ issueComments, reviews, reviewComments, headSha, since })).toBe(0);
  });

  test("同一headでも過去runの投稿だけなら0件になる", () => {
    const past = "2026-08-09T23:00:00Z";
    const issueComments = [{ user: bot, body: headShaMarker(headSha), created_at: past }];
    const reviews = [{ user: bot, commit_id: headSha, submitted_at: past }];
    const reviewComments = [{ user: bot, commit_id: headSha, created_at: past }];

    expect(countClaudePosts({ issueComments, reviews, reviewComments, headSha, since })).toBe(0);
  });
});

describe("flattenGhPages", () => {
  test("複数ページを1つの配列に平坦化する", () => {
    expect(flattenGhPages([["a", "b"], ["c"]])).toEqual(["a", "b", "c"]);
  });

  test("1ページを平坦化する", () => {
    expect(flattenGhPages([["a", "b"]])).toEqual(["a", "b"]);
  });

  test("空のページとページなしを空配列にする", () => {
    expect(flattenGhPages([[]])).toEqual([]);
    expect(flattenGhPages([])).toEqual([]);
  });

  test("配列でない値を説明付きで拒否する", () => {
    expect(() => flattenGhPages({ page: [] })).toThrow(
      "gh api --paginate --slurp の出力は配列である必要があります",
    );
  });
});
