import { describe, expect, it, vi } from "vitest";

import {
  auditWorktrees,
  collectCandidates,
  deleteCandidate,
  evaluateBranchConditions,
  evaluateWorktreeConditions,
  isCheckedOutElsewhere,
  parseArguments,
  parseBranchList,
  parseOpenPrNumbers,
} from "../../scripts/worktree-audit-lib.mjs";

describe("parseArguments", () => {
  it("defaults repo and prune", () => {
    expect(parseArguments([])).toEqual({ repo: "reitojike/stage-tracker", prune: false });
  });

  it("parses --repo and --prune", () => {
    expect(parseArguments(["--repo", "acme/widgets", "--prune"])).toEqual({
      repo: "acme/widgets",
      prune: true,
    });
  });

  it.each([
    { args: ["--wat"], message: "unknown argument" },
    { args: ["--repo"], message: "--repo requires a value" },
    { args: ["--repo", "no-slash"], message: "--repo must be owner/name" },
  ])("rejects invalid arguments: $message", ({ args, message }) => {
    expect(() => parseArguments(args)).toThrow(message);
  });
});

describe("parseBranchList", () => {
  it("parses name/oid pairs separated by a tab", () => {
    expect(parseBranchList("main\taaa000\nissue-206\tbbb111\n")).toEqual([
      { name: "main", oid: "aaa000" },
      { name: "issue-206", oid: "bbb111" },
    ]);
  });

  it("ignores blank lines", () => {
    expect(parseBranchList("main\taaa000\n\n")).toEqual([{ name: "main", oid: "aaa000" }]);
  });
});

describe("parseOpenPrNumbers", () => {
  it("parses one PR number per line", () => {
    expect(parseOpenPrNumbers("12\n34\n")).toEqual([12, 34]);
  });

  it("returns an empty array for empty output (no open PRs)", () => {
    expect(parseOpenPrNumbers("")).toEqual([]);
  });
});

describe("isCheckedOutElsewhere", () => {
  const worktrees = [
    { path: "/repo", branch: "main", locked: false, lockReason: undefined },
    { path: "/repo/wt-a", branch: "branch-a", locked: false, lockReason: undefined },
  ];

  it("is true when another worktree holds the branch", () => {
    expect(isCheckedOutElsewhere(worktrees, "branch-a", "/repo/wt-b")).toBe(true);
  });

  it("excludes the worktree itself from the check", () => {
    expect(isCheckedOutElsewhere(worktrees, "branch-a", "/repo/wt-a")).toBe(false);
  });

  it("is false for a branch no worktree holds", () => {
    expect(isCheckedOutElsewhere(worktrees, "orphan", undefined)).toBe(false);
  });
});

describe("collectCandidates", () => {
  it("splits worktrees from branch-only candidates and resolves oids", () => {
    const worktrees = [
      { path: "/repo", branch: "main", locked: false, lockReason: undefined },
      { path: "/repo/wt-a", branch: "branch-a", locked: true, lockReason: "in use" },
    ];
    const branches = [
      { name: "main", oid: "aaa000" },
      { name: "branch-a", oid: "bbb111" },
      { name: "orphan", oid: "ccc222" },
    ];
    const { worktreeCandidates, branchOnlyCandidates } = collectCandidates({
      worktrees,
      branches,
      selfPath: "/repo",
    });
    expect(worktreeCandidates).toEqual([
      {
        kind: "worktree",
        path: "/repo",
        branch: "main",
        isSelf: true,
        locked: false,
        lockReason: undefined,
        oid: "aaa000",
      },
      {
        kind: "worktree",
        path: "/repo/wt-a",
        branch: "branch-a",
        isSelf: false,
        locked: true,
        lockReason: "in use",
        oid: "bbb111",
      },
    ]);
    expect(branchOnlyCandidates).toEqual([{ kind: "branch", branch: "orphan", oid: "ccc222" }]);
  });
});

describe("evaluateBranchConditions", () => {
  const base = {
    branchName: "issue-206",
    checkedOutElsewhere: false,
    mergedPrs: [],
    openPrNumbers: [],
  };

  it("is black for main regardless of other inputs", () => {
    expect(evaluateBranchConditions({ ...base, branchName: "main" })).toEqual({
      white: false,
      reason: "is-main",
    });
  });

  it("is black when checked out elsewhere", () => {
    expect(evaluateBranchConditions({ ...base, checkedOutElsewhere: true })).toEqual({
      white: false,
      reason: "checked-out-elsewhere",
    });
  });

  it("is black when there is no merged PR at the tip (negative)", () => {
    const result = evaluateBranchConditions(base);
    expect(result).toEqual({ white: false, reason: "no-merged-pr-at-tip" });
  });

  it("is black when there are multiple merged PRs at the tip (negative)", () => {
    const result = evaluateBranchConditions({
      ...base,
      mergedPrs: [{ number: 50 }, { number: 51 }],
    });
    expect(result).toEqual({
      white: false,
      reason: "multiple-merged-prs-at-tip",
      detail: [50, 51],
    });
  });

  it("is black when an open PR points at the same tip (negative)", () => {
    const result = evaluateBranchConditions({
      ...base,
      mergedPrs: [{ number: 50 }],
      openPrNumbers: [99],
    });
    expect(result).toEqual({ white: false, reason: "open-pr-at-tip", detail: [99] });
  });

  it("is white for exactly one merged PR and no open PR at the tip", () => {
    const result = evaluateBranchConditions({
      ...base,
      mergedPrs: [{ number: 50 }],
      openPrNumbers: [],
    });
    expect(result).toEqual({ white: true, reason: undefined, mergedPrNumber: 50 });
  });
});

describe("evaluateWorktreeConditions", () => {
  const cleanStatus = { dirty: false, dirtyLines: [] };
  const whiteBranchEvaluation = { white: true, reason: undefined };
  const base = {
    isSelf: false,
    locked: false,
    lockReason: undefined,
    status: cleanStatus,
    branch: "issue-206",
    branchEvaluation: whiteBranchEvaluation,
  };

  it("is black for the worktree the caller is currently in (negative)", () => {
    expect(evaluateWorktreeConditions({ ...base, isSelf: true })).toEqual({
      white: false,
      reason: "self",
    });
  });

  it("is black for a locked worktree, with no unlock escape hatch (negative)", () => {
    expect(evaluateWorktreeConditions({ ...base, locked: true, lockReason: "in use" })).toEqual({
      white: false,
      reason: "locked",
      detail: "in use",
    });
  });

  it("is black for a dirty worktree (negative)", () => {
    const dirtyStatus = { dirty: true, dirtyLines: ["? scripts/wip.mjs"] };
    expect(evaluateWorktreeConditions({ ...base, status: dirtyStatus })).toEqual({
      white: false,
      reason: "dirty",
      detail: ["? scripts/wip.mjs"],
    });
  });

  it("is black for a detached HEAD worktree (no branch to evaluate)", () => {
    expect(evaluateWorktreeConditions({ ...base, branch: undefined })).toEqual({
      white: false,
      reason: "detached-no-branch",
    });
  });

  it("passes through a black branch evaluation", () => {
    const blackBranchEvaluation = {
      white: false,
      reason: "no-merged-pr-at-tip",
      detail: undefined,
    };
    expect(
      evaluateWorktreeConditions({ ...base, branchEvaluation: blackBranchEvaluation }),
    ).toEqual({
      white: false,
      reason: "no-merged-pr-at-tip",
      detail: undefined,
    });
  });

  it("is white when clean, unlocked, not self, and the branch is white", () => {
    expect(evaluateWorktreeConditions(base)).toEqual({ white: true, reason: undefined });
  });
});

// --- auditWorktrees / deleteCandidate: integration-style tests over the orchestration layer ---

const SELF_PATH = "D:/repo/.claude/worktrees/issue-221";
const REPO = "reitojike/stage-tracker";

const porcelain = [
  "worktree D:/repo\nHEAD aaa000\nbranch refs/heads/main",
  `worktree ${SELF_PATH}\nHEAD bbb111\nbranch refs/heads/self-branch`,
  "worktree D:/repo/.claude/worktrees/black-wt\nHEAD ccc222\nbranch refs/heads/black-branch",
  "worktree D:/repo/.claude/worktrees/white-wt\nHEAD ddd333\nbranch refs/heads/white-branch",
  "worktree D:/repo/.claude/worktrees/locked-wt\nHEAD eee444\nbranch refs/heads/locked-branch\nlocked in use",
  "worktree D:/repo/.claude/worktrees/dirty-wt\nHEAD fff555\nbranch refs/heads/dirty-branch",
].join("\n\n");

const branchListOutput = [
  "main\taaa000",
  "self-branch\tbbb111",
  "black-branch\tccc222",
  "white-branch\tddd333",
  "locked-branch\teee444",
  "dirty-branch\tfff555",
  "orphan-white\tggg666",
  "orphan-multi\thhh777",
  "orphan-open\tiii888",
].join("\n");

const statusByPath: Record<string, string> = {
  "D:/repo": "# branch.oid aaa000\n# branch.head main",
  [SELF_PATH]: "# branch.oid bbb111\n# branch.head self-branch",
  "D:/repo/.claude/worktrees/black-wt": "# branch.oid ccc222\n# branch.head black-branch",
  "D:/repo/.claude/worktrees/white-wt": "# branch.oid ddd333\n# branch.head white-branch",
  "D:/repo/.claude/worktrees/locked-wt": "# branch.oid eee444\n# branch.head locked-branch",
  "D:/repo/.claude/worktrees/dirty-wt":
    "# branch.oid fff555\n# branch.head dirty-branch\n? scripts/wip.mjs",
};

const prListByBranch: Record<
  string,
  Array<{ number: number; state: string; headRefOid: string; headRefName: string }>
> = {
  "black-branch": [],
  "white-branch": [
    { number: 50, state: "MERGED", headRefOid: "ddd333", headRefName: "white-branch" },
  ],
  "orphan-white": [
    { number: 60, state: "MERGED", headRefOid: "ggg666", headRefName: "orphan-white" },
  ],
  "orphan-multi": [
    { number: 61, state: "MERGED", headRefOid: "hhh777", headRefName: "orphan-multi" },
    { number: 62, state: "MERGED", headRefOid: "hhh777", headRefName: "orphan-multi" },
  ],
  "orphan-open": [
    { number: 63, state: "MERGED", headRefOid: "iii888", headRefName: "orphan-open" },
  ],
};

const openPrsByOid: Record<string, number[]> = {
  ccc222: [],
  ddd333: [],
  ggg666: [],
  hhh777: [],
  iii888: [99],
};

const createGit = (options: { deleteFailsFor?: Set<string> } = {}) =>
  vi.fn((args: string[]) => {
    if (args[0] === "worktree" && args[1] === "list") return porcelain;
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return `${SELF_PATH}\n`;
    if (args[0] === "for-each-ref") return branchListOutput;
    if (args[0] === "-C" && args[2] === "status") return statusByPath[args[1]];
    if (args[0] === "worktree" && args[1] === "remove") return "";
    if (args[0] === "update-ref" && args[1] === "-d") {
      if (options.deleteFailsFor?.has(args[2])) {
        throw new Error(
          `error: cannot lock ref '${args[2]}': is at <actual> but expected <expected>`,
        );
      }
      return "";
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  });

const createGh = () =>
  vi.fn((args: string[]) => {
    if (args[0] === "pr" && args[1] === "list") {
      const branch = args[args.indexOf("--head") + 1];
      return JSON.stringify(prListByBranch[branch] ?? []);
    }
    if (args[0] === "api") {
      const match = /repos\/[^/]+\/[^/]+\/commits\/([^/]+)\/pulls/.exec(args[1]);
      const oid = match?.[1] ?? "";
      return (openPrsByOid[oid] ?? []).join("\n");
    }
    throw new Error(`unexpected gh call: ${args.join(" ")}`);
  });

describe("auditWorktrees: report-only (default)", () => {
  it("classifies white/black candidates and deletes nothing without --prune", () => {
    const git = createGit();
    const gh = createGh();
    const log = vi.fn();
    const result = auditWorktrees({ repo: REPO, prune: false }, { git, gh, log });

    const byBranch = Object.fromEntries(result.results.map((r) => [r.branch, r]));
    expect(byBranch["main"]).toMatchObject({ white: false, reason: "is-main" });
    expect(byBranch["self-branch"]).toMatchObject({ white: false, reason: "self" });
    expect(byBranch["black-branch"]).toMatchObject({ white: false, reason: "no-merged-pr-at-tip" });
    expect(byBranch["white-branch"]).toMatchObject({ white: true });
    expect(byBranch["locked-branch"]).toMatchObject({
      white: false,
      reason: "locked",
      detail: "in use",
    });
    expect(byBranch["dirty-branch"]).toMatchObject({ white: false, reason: "dirty" });
    expect(byBranch["orphan-white"]).toMatchObject({ white: true });
    expect(byBranch["orphan-multi"]).toMatchObject({
      white: false,
      reason: "multiple-merged-prs-at-tip",
    });
    expect(byBranch["orphan-open"]).toMatchObject({ white: false, reason: "open-pr-at-tip" });

    // negative: without --prune, no destructive git call happens at all
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["remove"]));
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["update-ref"]));
    expect(result.deleted).toEqual([]);
  });

  it("does not call gh for candidates already decided black by cheaper checks (self/locked/dirty)", () => {
    const git = createGit();
    const gh = createGh();
    auditWorktrees({ repo: REPO, prune: false }, { git, gh, log: vi.fn() });

    expect(gh).not.toHaveBeenCalledWith(expect.arrayContaining(["--head", "self-branch"]));
    expect(gh).not.toHaveBeenCalledWith(expect.arrayContaining(["--head", "locked-branch"]));
    expect(gh).not.toHaveBeenCalledWith(expect.arrayContaining(["--head", "dirty-branch"]));
  });
});

describe("auditWorktrees: --prune", () => {
  it("deletes only white candidates (worktree removal + update-ref -d, or update-ref -d alone)", () => {
    const git = createGit();
    const gh = createGh();
    const result = auditWorktrees({ repo: REPO, prune: true }, { git, gh, log: vi.fn() });

    expect(result.deleted).toEqual(
      expect.arrayContaining([
        { branch: "white-branch", worktreeRemoved: true, branchDeleted: true },
        { branch: "orphan-white", worktreeRemoved: false, branchDeleted: true },
      ]),
    );
    expect(result.deleted).toHaveLength(2);
    expect(git).toHaveBeenCalledWith(["worktree", "remove", "D:/repo/.claude/worktrees/white-wt"]);
    expect(git).toHaveBeenCalledWith(["update-ref", "-d", "refs/heads/white-branch", "ddd333"]);
    expect(git).toHaveBeenCalledWith(["update-ref", "-d", "refs/heads/orphan-white", "ggg666"]);
    // negative: black candidates are never targeted for deletion
    expect(git).not.toHaveBeenCalledWith([
      "worktree",
      "remove",
      "D:/repo/.claude/worktrees/black-wt",
    ]);
    expect(git).not.toHaveBeenCalledWith(["update-ref", "-d", "refs/heads/black-branch", "ccc222"]);
    expect(git).not.toHaveBeenCalledWith([
      "update-ref",
      "-d",
      "refs/heads/locked-branch",
      "eee444",
    ]);
  });

  it("leaves the branch behind when its tip moved since judging it white (negative)", () => {
    const git = createGit({ deleteFailsFor: new Set(["refs/heads/orphan-white"]) });
    const gh = createGh();
    const log = vi.fn();
    const result = auditWorktrees({ repo: REPO, prune: true }, { git, gh, log });

    const orphan = result.deleted.find((d) => d.branch === "orphan-white");
    expect(orphan).toMatchObject({ branchDeleted: false });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("was not deleted"));
    // the other white candidate still gets deleted; one failure must not abort the run
    const whiteWt = result.deleted.find((d) => d.branch === "white-branch");
    expect(whiteWt).toMatchObject({ branchDeleted: true });
  });
});

describe("deleteCandidate", () => {
  it("does not attempt update-ref -d when worktree removal fails (negative)", () => {
    const git = vi.fn((args: string[]) => {
      if (args[0] === "worktree" && args[1] === "remove") throw new Error("Permission denied");
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });
    const log = vi.fn();
    const result = deleteCandidate(
      { kind: "worktree", path: "/repo/wt", branch: "issue-206", oid: "aaa000" },
      { git, log },
    );
    expect(result).toEqual({
      branch: "issue-206",
      worktreeRemoved: false,
      branchDeleted: false,
      error: expect.stringContaining("Permission denied"),
    });
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["update-ref"]));
  });

  it("deletes a branch-only candidate without calling worktree remove", () => {
    const git = vi.fn((args: string[]) => {
      if (args[0] === "update-ref") return "";
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });
    const result = deleteCandidate(
      { kind: "branch", branch: "orphan", oid: "aaa000" },
      { git, log: vi.fn() },
    );
    expect(result).toEqual({ branch: "orphan", worktreeRemoved: false, branchDeleted: true });
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["remove"]));
  });
});
