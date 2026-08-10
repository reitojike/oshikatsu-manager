import { describe, expect, test } from "vitest";
import {
  countClaudePosts,
  flattenGhPages,
  headShaMarker,
  main,
  reviewCheckDecision,
} from "../../.github/scripts/check-claude-review.mjs";

const headSha = "abc123";
const since = "2026-08-10T01:00:00Z";
const bot = { login: "claude[bot]" };
const baseEnv = {
  CLAUDE_OUTCOME: "success",
  CLAUDE_CONCLUSION: "success",
  REPOSITORY: "owner/repository",
  PR_NUMBER: "42",
  HEAD_SHA: headSha,
  ACTION_STARTED_AT: since,
  GITHUB_STEP_SUMMARY: "summary-path",
  EXECUTION_FILE: "execution-path",
};

const createDependencies = ({
  env = baseEnv,
  posts = new Map<string, unknown[]>(),
  ghError,
}: {
  env?: Record<string, string | undefined>;
  posts?: Map<string, unknown[]>;
  ghError?: Error;
} = {}) => {
  const ghPaths: string[] = [];
  const summaries: string[] = [];
  const reads: string[] = [];
  const notices: string[] = [];
  return {
    dependencies: {
      env,
      getGhPosts: (path: string) => {
        ghPaths.push(path);
        if (ghError !== undefined) throw ghError;
        return posts.get(path) ?? [];
      },
      append: (_path: string, message: string) => summaries.push(message),
      read: (path: string) => {
        reads.push(path);
        return JSON.stringify({ num_turns: 1 });
      },
      outputNotice: (message: string) => notices.push(message),
    },
    ghPaths,
    notices,
    reads,
    summaries,
  };
};

const apiPaths = () => [
  "repos/owner/repository/issues/42/comments?since=2026-08-10T01%3A00%3A00Z",
  "repos/owner/repository/pulls/42/reviews",
  "repos/owner/repository/pulls/42/comments?since=2026-08-10T01%3A00%3A00Z",
];

test("main: success時は正しい3 APIを各1回読み、投稿と診断をsummaryへ書く", () => {
  const [issuePath, reviewPath, commentPath] = apiPaths();
  const cases = [
    new Map([[issuePath, [{ user: bot, body: headShaMarker(headSha), created_at: since }]]]),
    new Map([[reviewPath, [{ user: bot, commit_id: headSha, submitted_at: since }]]]),
    new Map([[commentPath, [{ user: bot, commit_id: headSha, created_at: since }]]]),
  ];

  for (const posts of cases) {
    const { dependencies, ghPaths, reads, summaries } = createDependencies({ posts });
    main(dependencies);
    expect(ghPaths).toEqual(apiPaths());
    expect(reads).toEqual(["execution-path"]);
    expect(summaries).toEqual(["- Claude投稿件数: 1\n", "- 診断: num_turns: 1\n"]);
  }
});

test("main: 投稿が0件なら件数summaryの後に例外を伝播する", () => {
  const { dependencies, ghPaths, reads, summaries } = createDependencies();

  expect(() => main(dependencies)).toThrow(
    "Claude actionは実行されましたが、対象head以降のclaude[bot]投稿が0件です",
  );
  expect(ghPaths).toEqual(apiPaths());
  expect(reads).toEqual(["execution-path"]);
  expect(summaries).toEqual(["- Claude投稿件数: 0\n", "- 診断: num_turns: 1\n"]);
});

test.each([
  ["skipped", undefined, "Claude actionは未実行です。投稿件数判定は行いません。"],
  [
    "failure",
    undefined,
    "Claude actionが失敗したため投稿件数判定は対象外です。元stepの失敗を維持します。",
  ],
  [
    "success",
    "",
    "Claude actionはworkflow validation skipでした。投稿件数判定は機械では行えません。",
  ],
])("main: %sはAPIと診断readを行わずsummaryとnoticeを書く", (outcome, conclusion, message) => {
  const env = { ...baseEnv, CLAUDE_OUTCOME: outcome, CLAUDE_CONCLUSION: conclusion };
  const { dependencies, ghPaths, notices, reads, summaries } = createDependencies({ env });

  main(dependencies);

  expect(ghPaths).toEqual([]);
  expect(reads).toEqual([]);
  expect(notices).toEqual([message]);
  expect(summaries).toEqual([`- ${message}\n`]);
});

test("main: successのAPI取得失敗をそのまま伝播し、summaryを書かない", () => {
  const error = new Error("gh failed");
  const { dependencies, ghPaths, reads, summaries } = createDependencies({ ghError: error });

  expect(() => main(dependencies)).toThrow(error);
  expect(ghPaths).toEqual([apiPaths()[0]]);
  expect(reads).toEqual([]);
  expect(summaries).toEqual([]);
});

test.each([
  ["CLAUDE_OUTCOME", ""],
  ["GITHUB_STEP_SUMMARY", ""],
  ["REPOSITORY", ""],
  ["PR_NUMBER", ""],
  ["HEAD_SHA", ""],
  ["ACTION_STARTED_AT", ""],
  ["ACTION_STARTED_AT", "not-a-timestamp"],
])("main: 必須環境値 %s の不正をAPI取得前に拒否する", (name, value) => {
  const env = { ...baseEnv, [name]: value };
  const { dependencies, ghPaths, summaries } = createDependencies({ env });

  expect(() => main(dependencies)).toThrow();
  expect(ghPaths).toEqual([]);
  expect(summaries).toEqual([]);
});

test("main: headと開始時刻を投稿フィルタに渡し、別headと開始前だけなら0件で失敗する", () => {
  const [issuePath, reviewPath, commentPath] = apiPaths();
  const posts = new Map([
    [issuePath, [{ user: bot, body: headShaMarker("other"), created_at: since }]],
    [reviewPath, [{ user: bot, commit_id: headSha, submitted_at: "2026-08-10T00:59:59Z" }]],
    [commentPath, [{ user: bot, commit_id: "other", created_at: since }]],
  ]);
  const { dependencies, summaries } = createDependencies({ posts });

  expect(() => main(dependencies)).toThrow(
    "Claude actionは実行されましたが、対象head以降のclaude[bot]投稿が0件です",
  );
  expect(summaries).toEqual(["- Claude投稿件数: 0\n", "- 診断: num_turns: 1\n"]);
});

test("main: 可変headと開始時刻の対象投稿を数える", () => {
  const env = {
    ...baseEnv,
    HEAD_SHA: "new-head",
    ACTION_STARTED_AT: "2026-08-10T02:00:00Z",
  };
  const issuePath = "repos/owner/repository/issues/42/comments?since=2026-08-10T02%3A00%3A00Z";
  const posts = new Map([
    [
      issuePath,
      [{ user: bot, body: headShaMarker("new-head"), created_at: env.ACTION_STARTED_AT }],
    ],
  ]);
  const { dependencies, summaries } = createDependencies({ env, posts });

  main(dependencies);

  expect(summaries).toEqual(["- Claude投稿件数: 1\n", "- 診断: num_turns: 1\n"]);
});

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
