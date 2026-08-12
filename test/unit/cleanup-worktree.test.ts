import { describe, expect, it, vi } from "vitest";

import {
  cleanupWorktree,
  evaluatePreconditions,
  findWorktree,
  parseArguments,
  parseStatus,
  parseWorktreeList,
} from "../../scripts/cleanup-worktree-lib.mjs";

const TARGET_PATH = "D:/repo/.claude/worktrees/issue-206";

const mainWorktree = "worktree D:/repo\nHEAD abc123\nbranch refs/heads/main";
const targetBlock = (extra = "") =>
  `worktree ${TARGET_PATH}\nHEAD def456\nbranch refs/heads/issue-206${extra}`;

const cleanStatus =
  "# branch.oid def456\n# branch.head issue-206\n# branch.upstream origin/issue-206\n# branch.ab +0 -0";

const worktree = { path: TARGET_PATH, branch: "issue-206", locked: false, lockReason: undefined };
const cleanPushedStatus = { dirty: false, dirtyLines: [], upstream: "origin/issue-206", ahead: 0 };

type GitState = { status: string; branchDeleteThrows?: boolean };

const createGit = (state: GitState) =>
  vi.fn((args: string[]) => {
    if (args[0] === "worktree" && args[1] === "list")
      return [mainWorktree, targetBlock()].join("\n\n");
    if (args[0] === "-C" && args[2] === "status") return state.status;
    if (args[0] === "worktree" && args[1] === "unlock") return "";
    if (args[0] === "worktree" && args[1] === "remove") return "";
    if (args[0] === "branch" && args[1] === "-d") {
      if (state.branchDeleteThrows === true) throw new Error("not fully merged");
      return "";
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  });

const createLockedGit = (unlockRequested: boolean) =>
  vi.fn((args: string[]) => {
    if (args[0] === "worktree" && args[1] === "list")
      return [mainWorktree, targetBlock("\nlocked")].join("\n\n");
    if (args[0] === "-C" && args[2] === "status") return cleanStatus;
    if (unlockRequested) return "";
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  });

describe("parseWorktreeList / findWorktree", () => {
  it("parses multiple worktree blocks including lock reason", () => {
    const porcelain = [mainWorktree, targetBlock("\nlocked testing")].join("\n\n");
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: "D:/repo", branch: "main", locked: false, lockReason: undefined },
      { path: TARGET_PATH, branch: "issue-206", locked: true, lockReason: "testing" },
    ]);
  });

  it("parses a locked worktree with no reason", () => {
    expect(parseWorktreeList(targetBlock("\nlocked"))[0]).toEqual({
      path: TARGET_PATH,
      branch: "issue-206",
      locked: true,
      lockReason: undefined,
    });
  });

  it("parses a detached worktree without a branch line", () => {
    const porcelain = "worktree D:/repo/.claude/worktrees/detached\nHEAD def456\ndetached";
    expect(parseWorktreeList(porcelain)[0].branch).toBeUndefined();
  });

  it("finds a worktree by path regardless of case", () => {
    const porcelain = [mainWorktree, targetBlock()].join("\n\n");
    expect(findWorktree(porcelain, "D:/repo/.claude/worktrees/ISSUE-206").branch).toBe("issue-206");
  });

  it("finds a worktree even when the porcelain listing itself uses backslashes", () => {
    const porcelain =
      "worktree D:\\repo\\.claude\\worktrees\\issue-206\nHEAD def456\nbranch refs/heads/issue-206";
    expect(findWorktree(porcelain, "D:/repo/.claude/worktrees/issue-206").branch).toBe("issue-206");
  });

  it("throws when the path is not in the worktree list", () => {
    expect(() => findWorktree(mainWorktree, "D:/repo/.claude/worktrees/missing")).toThrow(
      "worktree not found",
    );
  });
});

describe("parseStatus", () => {
  it("reports a clean, fully-pushed branch", () => {
    expect(parseStatus(cleanStatus)).toEqual({
      dirty: false,
      dirtyLines: [],
      upstream: "origin/issue-206",
      ahead: 0,
    });
  });

  it("collects dirty lines for uncommitted and untracked changes", () => {
    const output = `${cleanStatus}\n1 .M N... 100644 100644 100644 abc def scripts/foo.mjs\n? scripts/new-file.mjs`;
    const status = parseStatus(output);
    expect(status.dirty).toBe(true);
    expect(status.dirtyLines).toEqual([
      "1 .M N... 100644 100644 100644 abc def scripts/foo.mjs",
      "? scripts/new-file.mjs",
    ]);
  });

  it("reports unpushed commits via the ahead count", () => {
    const output = cleanStatus.replace("# branch.ab +0 -0", "# branch.ab +2 -0");
    expect(parseStatus(output).ahead).toBe(2);
  });

  it("reports no upstream when the branch was never pushed", () => {
    const output = "# branch.oid def456\n# branch.head issue-206";
    expect(parseStatus(output).upstream).toBeUndefined();
  });

  it("reports upstream present but ahead undefined when the remote ref is gone", () => {
    const output =
      "# branch.oid def456\n# branch.head issue-206\n# branch.upstream origin/issue-206";
    const status = parseStatus(output);
    expect(status.upstream).toBe("origin/issue-206");
    expect(status.ahead).toBeUndefined();
  });
});

describe("evaluatePreconditions: lock", () => {
  it("stops on a locked worktree without --unlock", () => {
    const result = evaluatePreconditions({
      worktree: { ...worktree, locked: true, lockReason: "in use" },
      status: cleanPushedStatus,
      unlockRequested: false,
    });
    expect(result).toEqual({
      ok: false,
      reason: "locked",
      message: expect.stringContaining("in use"),
    });
  });

  it("allows a locked worktree to proceed when --unlock is passed", () => {
    const result = evaluatePreconditions({
      worktree: { ...worktree, locked: true, lockReason: "in use" },
      status: cleanPushedStatus,
      unlockRequested: true,
    });
    expect(result).toEqual({ ok: true, needsUnlock: true });
  });

  it("allows a clean, unlocked, fully-pushed worktree to proceed", () => {
    expect(
      evaluatePreconditions({ worktree, status: cleanPushedStatus, unlockRequested: false }),
    ).toEqual({ ok: true, needsUnlock: false });
  });

  it("allows a clean detached-HEAD worktree to proceed despite having no upstream", () => {
    const detachedWorktree = {
      path: TARGET_PATH,
      branch: undefined,
      locked: false,
      lockReason: undefined,
    };
    const detachedStatus = { dirty: false, dirtyLines: [], upstream: undefined, ahead: undefined };
    expect(
      evaluatePreconditions({
        worktree: detachedWorktree,
        status: detachedStatus,
        unlockRequested: false,
      }),
    ).toEqual({ ok: true, needsUnlock: false });
  });
});

describe("evaluatePreconditions: dirty and push state (negative tests)", () => {
  it("stops on a dirty worktree and must not proceed to delete", () => {
    const result = evaluatePreconditions({
      worktree,
      status: {
        dirty: true,
        dirtyLines: ["? scripts/wip.mjs"],
        upstream: "origin/issue-206",
        ahead: 0,
      },
      unlockRequested: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("dirty");
    expect(result.message).toContain("scripts/wip.mjs");
  });

  it("stops when the branch has no upstream", () => {
    const result = evaluatePreconditions({
      worktree,
      status: { dirty: false, dirtyLines: [], upstream: undefined, ahead: undefined },
      unlockRequested: false,
    });
    expect(result).toEqual({ ok: false, reason: "no-upstream", message: expect.any(String) });
  });

  it("stops when the upstream ref is gone", () => {
    const result = evaluatePreconditions({
      worktree,
      status: { dirty: false, dirtyLines: [], upstream: "origin/issue-206", ahead: undefined },
      unlockRequested: false,
    });
    expect(result).toEqual({ ok: false, reason: "upstream-gone", message: expect.any(String) });
  });

  it("stops when there are unpushed commits", () => {
    const result = evaluatePreconditions({
      worktree,
      status: { dirty: false, dirtyLines: [], upstream: "origin/issue-206", ahead: 3 },
      unlockRequested: false,
    });
    expect(result).toEqual({
      ok: false,
      reason: "unpushed",
      message: expect.stringContaining("3 commit"),
    });
  });
});

describe("parseArguments", () => {
  it.each([
    { args: ["--wat"], message: "unknown argument" },
    { args: ["--path"], message: "--path requires a value" },
    { args: ["--unlock"], message: "--path is required" },
  ])("rejects invalid arguments: $message", ({ args, message }) => {
    expect(() => parseArguments(args)).toThrow(message);
  });

  it("parses a path and defaults --unlock to false", () => {
    expect(parseArguments(["--path", TARGET_PATH])).toEqual({ path: TARGET_PATH, unlock: false });
  });

  it("parses --unlock", () => {
    expect(parseArguments(["--path", "D:/repo", "--unlock"])).toEqual({
      path: "D:/repo",
      unlock: true,
    });
  });
});

describe("cleanupWorktree: happy path and negative (dirty) test", () => {
  it("removes the worktree and deletes the branch on a clean, pushed worktree", () => {
    const git = createGit({ status: cleanStatus });
    const log = vi.fn();
    const result = cleanupWorktree({ path: TARGET_PATH, unlock: false }, { git, log });
    expect(result).toEqual({ removed: true, branchDeleted: true, reason: undefined });
    expect(git).toHaveBeenCalledWith(["worktree", "remove", TARGET_PATH]);
    expect(git).toHaveBeenCalledWith(["branch", "-d", "issue-206"]);
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["unlock"]));
  });

  it("does NOT remove a dirty worktree (negative test: must not proceed to delete)", () => {
    const dirtyStatus = `${cleanStatus}\n? scripts/wip.mjs`;
    const git = createGit({ status: dirtyStatus });
    const log = vi.fn();
    const result = cleanupWorktree({ path: TARGET_PATH, unlock: false }, { git, log });
    expect(result).toEqual({ removed: false, branchDeleted: false, reason: "dirty" });
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["remove"]));
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["-d"]));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("STOP (dirty)"));
  });

  it("stops when the branch has unpushed commits", () => {
    const aheadStatus = cleanStatus.replace("# branch.ab +0 -0", "# branch.ab +1 -0");
    const git = createGit({ status: aheadStatus });
    const result = cleanupWorktree({ path: TARGET_PATH, unlock: false }, { git, log: vi.fn() });
    expect(result).toEqual({ removed: false, branchDeleted: false, reason: "unpushed" });
  });
});

describe("cleanupWorktree: detached HEAD", () => {
  it("removes a clean detached worktree and skips branch deletion", () => {
    const detachedPorcelain = [mainWorktree, `worktree ${TARGET_PATH}\nHEAD def456\ndetached`].join(
      "\n\n",
    );
    const detachedStatus = "# branch.oid def456\n# branch.head (detached)";
    const git = vi.fn((args: string[]) => {
      if (args[0] === "worktree" && args[1] === "list") return detachedPorcelain;
      if (args[0] === "-C" && args[2] === "status") return detachedStatus;
      if (args[0] === "worktree" && args[1] === "remove") return "";
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });
    const log = vi.fn();
    const result = cleanupWorktree({ path: TARGET_PATH, unlock: false }, { git, log });
    expect(result).toEqual({ removed: true, branchDeleted: false, reason: undefined });
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["-d"]));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("detached HEAD"));
  });
});

describe("cleanupWorktree: lock handling and branch delete failure", () => {
  it("does not remove a locked worktree without --unlock", () => {
    const git = createLockedGit(false);
    const result = cleanupWorktree({ path: TARGET_PATH, unlock: false }, { git, log: vi.fn() });
    expect(result.removed).toBe(false);
    expect(result.reason).toBe("locked");
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["unlock"]));
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(["remove"]));
  });

  it("unlocks then removes a locked worktree when --unlock is passed", () => {
    const git = createLockedGit(true);
    const result = cleanupWorktree({ path: TARGET_PATH, unlock: true }, { git, log: vi.fn() });
    expect(result.removed).toBe(true);
    const calls = git.mock.calls.map((call) => call[0]);
    const unlockIndex = calls.findIndex((call) => call[1] === "unlock");
    const removeIndex = calls.findIndex((call) => call[1] === "remove");
    expect(unlockIndex).toBeGreaterThanOrEqual(0);
    expect(unlockIndex).toBeLessThan(removeIndex);
  });

  it("reports a branch delete failure without failing the whole run", () => {
    const git = createGit({ status: cleanStatus, branchDeleteThrows: true });
    const log = vi.fn();
    const result = cleanupWorktree({ path: TARGET_PATH, unlock: false }, { git, log });
    expect(result).toEqual({ removed: true, branchDeleted: false, reason: "branch-delete-failed" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not fully merged"));
  });
});
