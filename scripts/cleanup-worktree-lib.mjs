// CWD依存のパス解決(相対パス→絶対パス)はI/O境界であるCLIエントリ(cleanup-worktree.mjs)の
// 責務とし、ここでは既に絶対パスであることを前提に文字列としての正規化だけを行う
// (AGENTS.md「境界では依存を引数で渡す」)。
const normalizePath = (value) => value.replace(/\\/g, "/");

const parseWorktreeBlock = (block) => {
  const lines = block.split(/\r?\n/).filter((line) => line !== "");
  const info = { path: undefined, branch: undefined, locked: false, lockReason: undefined };
  for (const line of lines) {
    if (line.startsWith("worktree ")) info.path = line.slice("worktree ".length);
    else if (line.startsWith("branch refs/heads/"))
      info.branch = line.slice("branch refs/heads/".length);
    else if (line === "locked") info.locked = true;
    else if (line.startsWith("locked ")) {
      info.locked = true;
      info.lockReason = line.slice("locked ".length);
    }
  }
  return info;
};

export const parseWorktreeList = (porcelainOutput) =>
  porcelainOutput
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim() !== "")
    .map(parseWorktreeBlock);

export const findWorktree = (porcelainOutput, targetPath) => {
  const normalizedTarget = normalizePath(targetPath).toLowerCase();
  const found = parseWorktreeList(porcelainOutput).find(
    (worktree) => worktree.path !== undefined && worktree.path.toLowerCase() === normalizedTarget,
  );
  if (found === undefined)
    throw new Error(`worktree not found in 'git worktree list': ${targetPath}`);
  return found;
};

export const parseStatus = (statusOutput) => {
  const lines = statusOutput.split(/\r?\n/).filter((line) => line !== "");
  let upstream;
  let ahead;
  const dirtyLines = [];
  for (const line of lines) {
    if (line.startsWith("# branch.upstream ")) upstream = line.slice("# branch.upstream ".length);
    else if (line.startsWith("# branch.ab ")) {
      const match = /^# branch\.ab \+(\d+) -\d+$/.exec(line);
      if (match !== null) ahead = Number(match[1]);
    } else if (!line.startsWith("#")) dirtyLines.push(line);
  }
  return { dirty: dirtyLines.length > 0, dirtyLines, upstream, ahead };
};

export const evaluatePreconditions = ({ worktree, status, unlockRequested }) => {
  if (worktree.locked && !unlockRequested)
    return {
      ok: false,
      reason: "locked",
      message: `worktree is locked (${worktree.lockReason ?? "no reason given"}); rerun with --unlock only if this is your own worktree`,
    };
  if (status.dirty)
    return {
      ok: false,
      reason: "dirty",
      message: `worktree has uncommitted or untracked changes:\n${status.dirtyLines.join("\n")}`,
    };
  // detached HEAD にはブランチが無く、push対象のupstreamという概念自体が存在しないため、
  // 以降のupstreamチェックは対象外にする(worktree.branch === undefined はcleanupWorktree側の
  // ブランチ削除スキップと対応しており、ここで弾くと常に到達不能になる)。
  if (worktree.branch !== undefined) {
    if (status.upstream === undefined)
      return {
        ok: false,
        reason: "no-upstream",
        message: "branch has no upstream configured; cannot verify it was pushed",
      };
    if (status.ahead === undefined)
      return {
        ok: false,
        reason: "upstream-gone",
        message: `upstream '${status.upstream}' is gone; cannot verify the branch was pushed`,
      };
    if (status.ahead > 0)
      return {
        ok: false,
        reason: "unpushed",
        message: `branch is ahead of '${status.upstream}' by ${status.ahead} commit(s)`,
      };
  }
  return { ok: true, needsUnlock: worktree.locked && unlockRequested };
};

export const parseArguments = (args) => {
  let options = { unlock: false };
  const remaining = [...args];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--unlock") options = { ...options, unlock: true };
    else if (argument === "--path") {
      const value = remaining.shift();
      if (value === undefined || value.startsWith("--")) throw new Error("--path requires a value");
      options = { ...options, path: value };
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.path === undefined) throw new Error("--path is required");
  return options;
};

export const cleanupWorktree = (options, { git, log }) => {
  const worktree = findWorktree(git(["worktree", "list", "--porcelain"]), options.path);
  const status = parseStatus(git(["-C", worktree.path, "status", "--porcelain=v2", "--branch"]));
  const decision = evaluatePreconditions({ worktree, status, unlockRequested: options.unlock });
  if (!decision.ok) {
    log(`STOP (${decision.reason}): ${decision.message}`);
    return { removed: false, branchDeleted: false, reason: decision.reason };
  }
  if (decision.needsUnlock) git(["worktree", "unlock", worktree.path]);
  git(["worktree", "remove", worktree.path]);
  log(`OK: removed worktree ${worktree.path}`);
  if (worktree.branch === undefined) {
    log("NOTE: worktree had a detached HEAD; no branch to delete");
    return { removed: true, branchDeleted: false, reason: undefined };
  }
  try {
    git(["branch", "-d", worktree.branch]);
    log(`OK: deleted branch ${worktree.branch}`);
    return { removed: true, branchDeleted: true, reason: undefined };
  } catch (error) {
    log(
      `WARN: worktree removed, but branch '${worktree.branch}' was not deleted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { removed: true, branchDeleted: false, reason: "branch-delete-failed" };
  }
};
