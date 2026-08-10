import { describe, expect, test } from "vitest";
import {
  CLAUDE_ENABLED_ERROR,
  countBotPostsSince,
  countClaudePosts,
  flattenGhPages,
  getGhPosts,
  headShaMarker,
  main,
  MARKER_MISSING_ERROR,
  MISSING_CLAUDE_POSTS_ERROR,
  reviewCheckDecision,
} from "../../.github/scripts/check-claude-review.mjs";

const headSha = "abc1230000000000000000000000000000000000";
const otherHead = "def4560000000000000000000000000000000000";
const since = "2026-08-10T01:00:00Z";
const bot = { login: "claude[bot]" };
const baseEnv = {
  CLAUDE_OUTCOME: "success",
  CLAUDE_ENABLED: "true",
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
  readError,
  readResult = JSON.stringify({ num_turns: 1 }),
}: {
  // 非文字列を渡す否定側テストがあるため unknown にする(process.env は文字列だけだが、
  // 依存注入の境界に非文字列が来たときに「空です」へ化けないことを固定する)
  env?: Record<string, unknown>;
  posts?: Map<string, unknown[]>;
  ghError?: Error;
  readError?: Error;
  readResult?: string;
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
        if (readError !== undefined) throw readError;
        return readResult;
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

  expect(() => main(dependencies)).toThrow(MISSING_CLAUDE_POSTS_ERROR);
  expect(ghPaths).toEqual(apiPaths());
  expect(reads).toEqual(["execution-path"]);
  expect(summaries).toEqual([
    "- Claude投稿件数: 0\n",
    "- 診断: num_turns: 1\n",
    `- ${MISSING_CLAUDE_POSTS_ERROR}\n`,
  ]);
});

test.each([
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

test.each([
  [
    "cancelled",
    "Claude actionがキャンセルされたため投稿件数判定は行わず、既存のキャンセル状態を維持します。",
  ],
  [
    "skipped",
    "Claude actionは実行制御上キャンセル相当でスキップされたため、投稿件数判定は行わず、既存のキャンセル状態を維持します。",
  ],
])("main: %sは専用のキャンセル注記を書き、APIと診断readを行わない", (outcome, message) => {
  const env = { ...baseEnv, CLAUDE_OUTCOME: outcome, CLAUDE_ENABLED: "true" };
  const { dependencies, ghPaths, notices, reads, summaries } = createDependencies({ env });

  main(dependencies);

  expect(ghPaths).toEqual([]);
  expect(reads).toEqual([]);
  expect(notices).toEqual([message]);
  expect(summaries).toEqual([`- ${message}\n`]);
});

test("main: skippedかつCLAUDE_ENABLED=falseはトークン未設定を通知して失敗する", () => {
  const env = { ...baseEnv, CLAUDE_OUTCOME: "skipped", CLAUDE_ENABLED: "false" };
  const { dependencies, ghPaths, notices, reads, summaries } = createDependencies({ env });
  const message =
    "CLAUDE_CODE_OAUTH_TOKEN が利用できないため Claude action は実行されませんでした。claude setup-token でトークンを発行し、リポジトリシークレット CLAUDE_CODE_OAUTH_TOKEN に追加してください。";

  expect(() => main(dependencies)).toThrow(message);
  expect(ghPaths).toEqual([]);
  expect(reads).toEqual([]);
  expect(notices).toEqual([message]);
  expect(summaries).toEqual([`- ${message}\n`]);
});

test("main: その他のAPI取得失敗は対象path付きで通知し、件数summaryを書かない", () => {
  const error = new Error("gh failed");
  const { dependencies, ghPaths, notices, reads, summaries } = createDependencies({
    ghError: error,
  });

  expect(() => main(dependencies)).toThrow(
    `GitHub API取得に失敗したため投稿件数を判定できない: ${apiPaths()[0]}`,
  );
  expect(ghPaths).toEqual([apiPaths()[0]]);
  expect(reads).toEqual([]);
  expect(notices).toEqual([`GitHub API取得に失敗したため投稿件数を判定できない: ${apiPaths()[0]}`]);
  expect(summaries).toEqual([
    `- GitHub API取得に失敗したため投稿件数を判定できない: ${apiPaths()[0]}\n`,
  ]);
});

test("getGhPosts: gh実行にはUTF-8、64MiB、60秒を指定する", () => {
  const calls: { command: string; arguments_: string[]; options: object }[] = [];
  const execute = (command: string, arguments_: string[], options: object) => {
    calls.push({ command, arguments_, options });
    return "[[]]";
  };

  expect(getGhPosts("repos/owner/repository/pulls/42/reviews", execute)).toEqual([]);
  expect(calls).toEqual([
    {
      command: "gh",
      arguments_: ["api", "--paginate", "--slurp", "repos/owner/repository/pulls/42/reviews"],
      options: { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
    },
  ]);
});

test.each([
  ["ENOBUFS", new Error("buffer full")],
  ["ERR_CHILD_PROCESS_STDIO_MAXBUFFER", new RangeError("stdout maxBuffer length exceeded")],
])("main: %sは容量超過として通知し、0件扱いにしない", (code, base) => {
  const error = Object.assign(base, { code });
  const { dependencies, notices, summaries } = createDependencies({ ghError: error });
  const message = `GitHub API応答が64MiB上限を超えたため投稿件数を判定できない: ${apiPaths()[0]}`;

  expect(() => main(dependencies)).toThrow(message);
  expect(notices).toEqual([message]);
  expect(summaries).toEqual([`- ${message}\n`]);
});

test("main: timeout固有情報は60秒タイムアウトとして通知し、0件扱いにしない", () => {
  const error = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
  const { dependencies, notices, summaries } = createDependencies({ ghError: error });
  const message = `GitHub API取得が60秒でタイムアウトしたため投稿件数を判定できない: ${apiPaths()[0]}`;

  expect(() => main(dependencies)).toThrow(message);
  expect(notices).toEqual([message]);
  expect(summaries).toEqual([`- ${message}\n`]);
});

test.each([
  ["CLAUDE_OUTCOME", "", "CLAUDE_OUTCOME が空です"],
  ["GITHUB_STEP_SUMMARY", "", "GITHUB_STEP_SUMMARY が空です"],
  // 非文字列。trim() のTypeErrorへ化けず、所定のメッセージで落ちることを固定する
  ["CLAUDE_OUTCOME", 123, "CLAUDE_OUTCOME が空です"],
  ["GITHUB_STEP_SUMMARY", {}, "GITHUB_STEP_SUMMARY が空です"],
])("main: 必須環境値 %s の不正をAPI取得前に拒否する", (name, value, message) => {
  const env = { ...baseEnv, [name]: value };
  const { dependencies, ghPaths, notices, summaries } = createDependencies({ env });

  expect(() => main(dependencies)).toThrow(message);
  expect(ghPaths).toEqual([]);
  expect(notices).toEqual([]);
  expect(summaries).toEqual([]);
});

test.each([
  ["REPOSITORY", "", "REPOSITORY が空です"],
  ["PR_NUMBER", "", "PR_NUMBER が空です"],
  ["HEAD_SHA", "", "HEAD_SHA が空です"],
  ["ACTION_STARTED_AT", "", "ACTION_STARTED_AT が空です"],
  [
    "ACTION_STARTED_AT",
    "not-a-timestamp",
    "ACTION_STARTED_AT はUTCのRFC 3339時刻である必要があります",
  ],
  // 配線を間違えて head_ref(ブランチ名)やPR番号でない値を渡したとき、
  // 「投稿0件」や「マーカー不一致」ではなく入力の不正として落とす
  ["HEAD_SHA", "main", "HEAD_SHA は40桁の小文字16進数である必要があります"],
  ["HEAD_SHA", ` ${headSha}`, "HEAD_SHA は40桁の小文字16進数である必要があります"],
  ["HEAD_SHA", headSha.toUpperCase(), "HEAD_SHA は40桁の小文字16進数である必要があります"],
  ["HEAD_SHA", headSha.slice(0, 7), "HEAD_SHA は40桁の小文字16進数である必要があります"],
  ["PR_NUMBER", "abc", "PR_NUMBER は正の整数である必要があります"],
  ["PR_NUMBER", "0", "PR_NUMBER は正の整数である必要があります"],
  ["PR_NUMBER", "-1", "PR_NUMBER は正の整数である必要があります"],
])(
  "main: summary出力先確定後の必須環境値 %s の不正をAPI取得前に記録して拒否する",
  (name, value, message) => {
    const env = { ...baseEnv, [name]: value };
    const { dependencies, ghPaths, notices, summaries } = createDependencies({ env });

    expect(() => main(dependencies)).toThrow(message);
    expect(ghPaths).toEqual([]);
    expect(notices).toEqual([message]);
    expect(summaries).toEqual([`- ${message}\n`]);
  },
);

test.each([undefined, "", "unexpected"])(
  "main: CLAUDE_ENABLEDが%pならAPI取得前に通知して拒否する",
  (enabled) => {
    const env = { ...baseEnv, CLAUDE_ENABLED: enabled };
    const { dependencies, ghPaths, notices, reads, summaries } = createDependencies({ env });
    const message = CLAUDE_ENABLED_ERROR;

    expect(() => main(dependencies)).toThrow(message);
    expect(ghPaths).toEqual([]);
    expect(reads).toEqual([]);
    expect(notices).toEqual([message]);
    expect(summaries).toEqual([`- ${message}\n`]);
  },
);

test.each(["success", "failure", "cancelled", "skipped"])(
  "main: %sでもCLAUDE_ENABLEDの欠落を許容しない",
  (outcome) => {
    const env = { ...baseEnv, CLAUDE_OUTCOME: outcome, CLAUDE_ENABLED: undefined };
    const { dependencies, ghPaths } = createDependencies({ env });

    expect(() => main(dependencies)).toThrow(CLAUDE_ENABLED_ERROR);
    expect(ghPaths).toEqual([]);
  },
);

test("main: 正規表現を通る不可能な開始時刻をAPI取得前に記録して拒否する", () => {
  const env = { ...baseEnv, ACTION_STARTED_AT: "2026-13-45T00:00:00Z" };
  const { dependencies, ghPaths, notices, summaries } = createDependencies({ env });
  const message = "ACTION_STARTED_AT は有効な時刻である必要があります";

  expect(() => main(dependencies)).toThrow(message);
  expect(ghPaths).toEqual([]);
  expect(notices).toEqual([message]);
  expect(summaries).toEqual([`- ${message}\n`]);
});

test.each([undefined, ""])(
  "main: 診断ファイルが%pならreadせずファイルなしと書く",
  (executionFile) => {
    const env = { ...baseEnv, EXECUTION_FILE: executionFile };
    const { dependencies, reads, summaries } = createDependencies({ env });

    expect(() => main(dependencies)).toThrow(MISSING_CLAUDE_POSTS_ERROR);

    expect(reads).toEqual([]);
    expect(summaries).toEqual([
      "- Claude投稿件数: 0\n",
      "- 診断: 実行診断ファイルはありません。\n",
      `- ${MISSING_CLAUDE_POSTS_ERROR}\n`,
    ]);
  },
);

test.each([
  ["read例外", undefined, new Error("read failed")],
  ["不正JSON", "{", undefined],
])("main: 診断%sは読めないと書く", (_caseName, readResult, readError) => {
  const { dependencies, summaries } = createDependencies({ readError, readResult });

  expect(() => main(dependencies)).toThrow(MISSING_CLAUDE_POSTS_ERROR);
  expect(summaries).toEqual([
    "- Claude投稿件数: 0\n",
    "- 診断: 実行診断ファイルを読めませんでした。\n",
    `- ${MISSING_CLAUDE_POSTS_ERROR}\n`,
  ]);
});

test("main: 診断配列は末尾から診断要素を探し、後方の非診断要素を飛ばす", () => {
  const diagnostics = JSON.stringify([
    { num_turns: 1 },
    { permission_denials_count: 2 },
    { ignored: true },
  ]);
  const { dependencies, summaries } = createDependencies({ readResult: diagnostics });

  expect(() => main(dependencies)).toThrow(MISSING_CLAUDE_POSTS_ERROR);
  expect(summaries).toEqual([
    "- Claude投稿件数: 0\n",
    "- 診断: permission_denials_count: 2\n",
    `- ${MISSING_CLAUDE_POSTS_ERROR}\n`,
  ]);
});

test.each(["{}", JSON.stringify([{ ignored: true }])])(
  "main: 診断値がない入力は値なしと書く",
  (readResult) => {
    const { dependencies, summaries } = createDependencies({ readResult });

    expect(() => main(dependencies)).toThrow(MISSING_CLAUDE_POSTS_ERROR);
    expect(summaries).toEqual([
      "- Claude投稿件数: 0\n",
      "- 診断: 実行診断値はありません。\n",
      `- ${MISSING_CLAUDE_POSTS_ERROR}\n`,
    ]);
  },
);

test("main: headと開始時刻を投稿フィルタに渡し、別headと開始前だけなら0件で失敗する", () => {
  const [issuePath, reviewPath, commentPath] = apiPaths();
  const posts = new Map([
    [issuePath, [{ user: bot, body: headShaMarker("other"), created_at: since }]],
    [reviewPath, [{ user: bot, commit_id: headSha, submitted_at: "2026-08-10T00:59:59Z" }]],
    [commentPath, [{ user: bot, commit_id: "other", created_at: since }]],
  ]);
  const { dependencies, summaries } = createDependencies({ posts });

  // 開始時刻以降のbot投稿は存在する(別head向け)ので、原因はマーカー不一致側になる
  expect(() => main(dependencies)).toThrow(MARKER_MISSING_ERROR);
  expect(summaries).toEqual([
    "- Claude投稿件数: 0\n",
    "- 診断: num_turns: 1\n",
    `- ${MARKER_MISSING_ERROR}\n`,
  ]);
});

test("main: マーカーだけが無い投稿は、無投稿ではなくマーカー不一致として失敗する", () => {
  const [issuePath] = apiPaths();
  const posts = new Map([
    [issuePath, [{ user: bot, body: "総評(マーカー無し)", created_at: since }]],
  ]);
  const { dependencies, notices, summaries } = createDependencies({ posts });

  expect(() => main(dependencies)).toThrow(MARKER_MISSING_ERROR);
  expect(notices).toEqual([MARKER_MISSING_ERROR]);
  expect(summaries).toEqual([
    "- Claude投稿件数: 0\n",
    "- 診断: num_turns: 1\n",
    `- ${MARKER_MISSING_ERROR}\n`,
  ]);
});

test("main: bot投稿が1件も無いときはマーカー不一致ではなく無投稿として失敗する", () => {
  const [issuePath] = apiPaths();
  // 開始時刻以降の投稿はあるが、bot以外なので切り分け用の件数にも入らない
  const posts = new Map([
    [
      issuePath,
      [{ user: { login: "reitojike" }, body: headShaMarker(headSha), created_at: since }],
    ],
  ]);
  const { dependencies, notices } = createDependencies({ posts });

  expect(() => main(dependencies)).toThrow(MISSING_CLAUDE_POSTS_ERROR);
  expect(notices).toEqual([MISSING_CLAUDE_POSTS_ERROR]);
});

describe("review commentのhead固定", () => {
  // GitHubはoutdatedでないreview commentの commit_id を最新headへ書き換える。
  // 実測(PR #151): original_commit_id=b61052c8 のまま commit_id=98b206fe を返した。
  test("commit_idが最新headへ書き換えられた過去runのコメントを数えない", () => {
    expect(
      countClaudePosts({
        issueComments: [],
        reviews: [],
        // 書き換え後の姿。commit_id だけ見ると一致してしまう
        reviewComments: [
          { user: bot, commit_id: headSha, original_commit_id: otherHead, created_at: since },
        ],
        headSha,
        since,
      }),
    ).toBe(0);
  });

  test("original_commit_idが対象headなら、commit_idが先へ進んでいても数える", () => {
    expect(
      countClaudePosts({
        issueComments: [],
        reviews: [],
        reviewComments: [
          { user: bot, commit_id: otherHead, original_commit_id: headSha, created_at: since },
        ],
        headSha,
        since,
      }),
    ).toBe(1);
  });

  test("original_commit_idが無い応答では commit_id へフォールバックする", () => {
    expect(
      countClaudePosts({
        issueComments: [],
        reviews: [],
        reviewComments: [{ user: bot, commit_id: headSha, created_at: since }],
        headSha,
        since,
      }),
    ).toBe(1);
  });

  test("reviewは commit_id が動かないので original_commit_id を見ない", () => {
    expect(
      countClaudePosts({
        issueComments: [],
        // reviewに original_commit_id は無い。commit_id 一致だけで数える
        reviews: [{ user: bot, commit_id: headSha, submitted_at: since }],
        reviewComments: [],
        headSha,
        since,
      }),
    ).toBe(1);
  });
});

describe("countBotPostsSince", () => {
  test("マーカーとcommit_idを見ず、開始時刻以降のbot投稿を3種類とも数える", () => {
    expect(
      countBotPostsSince({
        issueComments: [{ user: bot, body: "マーカー無し", created_at: since }],
        reviews: [{ user: bot, commit_id: "other", submitted_at: since }],
        reviewComments: [{ user: bot, created_at: since }],
        since,
      }),
    ).toBe(3);
  });

  test("開始時刻より前・bot以外・user未定義は数えない", () => {
    expect(
      countBotPostsSince({
        issueComments: [{ user: bot, created_at: "2026-08-10T00:59:59Z" }],
        reviews: [{ user: { login: "coderabbitai[bot]" }, submitted_at: since }],
        reviewComments: [{ created_at: since }],
        since,
      }),
    ).toBe(0);
  });

  test("日時が文字列でない投稿は数えない", () => {
    expect(
      countBotPostsSince({
        issueComments: [{ user: bot, created_at: 20260810 }],
        reviews: [],
        reviewComments: [],
        since,
      }),
    ).toBe(0);
  });
});

test("main: 可変headと開始時刻の対象投稿を数える", () => {
  const env = {
    ...baseEnv,
    HEAD_SHA: otherHead,
    ACTION_STARTED_AT: "2026-08-10T02:00:00Z",
  };
  const issuePath = "repos/owner/repository/issues/42/comments?since=2026-08-10T02%3A00%3A00Z";
  const posts = new Map([
    [issuePath, [{ user: bot, body: headShaMarker(otherHead), created_at: env.ACTION_STARTED_AT }]],
  ]);
  const { dependencies, summaries } = createDependencies({ env, posts });

  main(dependencies);

  expect(summaries).toEqual(["- Claude投稿件数: 1\n", "- 診断: num_turns: 1\n"]);
});

test("reviewCheckDecision: 公式の4 outcomeを判定する", () => {
  expect(
    reviewCheckDecision({
      outcome: "skipped",
      enabled: true,
      conclusion: undefined,
      postCount: undefined,
    }),
  ).toBe("skipped-cancelled");
  expect(
    reviewCheckDecision({
      outcome: "skipped",
      enabled: false,
      conclusion: undefined,
      postCount: undefined,
    }),
  ).toBe("token-unavailable");
  expect(
    reviewCheckDecision({
      outcome: "failure",
      enabled: true,
      conclusion: undefined,
      postCount: undefined,
    }),
  ).toBe("failure");
  expect(
    reviewCheckDecision({
      outcome: "cancelled",
      enabled: false,
      conclusion: "success",
      postCount: 1,
    }),
  ).toBe("cancelled");
});

test("reviewCheckDecision: enabled に文字列 false を渡すと入力契約違反として拒否する", () => {
  expect(() =>
    reviewCheckDecision({
      outcome: "skipped",
      enabled: "false",
      conclusion: undefined,
      postCount: undefined,
    }),
  ).toThrow("reviewCheckDecision の enabled 引数は boolean である必要があります");
});

test.each(["true", "yes", 1, undefined, null, 0])(
  "reviewCheckDecision: enabled に boolean 以外の %s を渡すと入力契約違反として拒否する",
  (enabled) => {
    expect(() =>
      reviewCheckDecision({
        outcome: "skipped",
        enabled,
        conclusion: undefined,
        postCount: undefined,
      }),
    ).toThrow("reviewCheckDecision の enabled 引数は boolean である必要があります");
  },
);

test.each(["success", "failure", "cancelled"])(
  "reviewCheckDecision: %s でも enabled の入力契約を先に検証する",
  (outcome) => {
    expect(() =>
      reviewCheckDecision({
        outcome,
        enabled: "false",
        conclusion: "success",
        postCount: 1,
      }),
    ).toThrow("reviewCheckDecision の enabled 引数は boolean である必要があります");
  },
);

test("reviewCheckDecision: 未知のoutcomeを説明付きで拒否する", () => {
  expect(() =>
    reviewCheckDecision({
      outcome: "unexpected",
      enabled: true,
      conclusion: undefined,
      postCount: undefined,
    }),
  ).toThrow("未知のCLAUDE_OUTCOMEです: unexpected");
});

test("reviewCheckDecision: successの検証段階を判定する", () => {
  expect(
    reviewCheckDecision({
      outcome: "success",
      enabled: true,
      conclusion: "",
      postCount: undefined,
    }),
  ).toBe("validation-skipped");
  expect(
    reviewCheckDecision({
      outcome: "success",
      enabled: true,
      conclusion: undefined,
      postCount: undefined,
    }),
  ).toBe("validation-skipped");
  expect(
    reviewCheckDecision({
      outcome: "success",
      enabled: true,
      conclusion: "success",
      postCount: undefined,
    }),
  ).toBe("check-posts");
});

test("reviewCheckDecision: 投稿件数の有無を判定する", () => {
  expect(
    reviewCheckDecision({
      outcome: "success",
      enabled: true,
      conclusion: "success",
      postCount: 0,
    }),
  ).toBe("missing-posts");
  expect(
    reviewCheckDecision({
      outcome: "success",
      enabled: true,
      conclusion: "success",
      postCount: 1,
    }),
  ).toBe("posts-found");
  expect(
    reviewCheckDecision({
      outcome: "success",
      enabled: true,
      conclusion: "success",
      postCount: 2,
    }),
  ).toBe("posts-found");
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

  test("3種類ともuser未定義の投稿を数えない", () => {
    const issueComments = [{ body: headShaMarker(headSha), created_at: since }];
    const reviews = [{ commit_id: headSha, submitted_at: since }];
    const reviewComments = [{ commit_id: headSha, created_at: since }];

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
