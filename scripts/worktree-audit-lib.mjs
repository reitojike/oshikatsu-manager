import { findWorktree, parseStatus, parseWorktreeList } from "./cleanup-worktree-lib.mjs";

export { findWorktree, parseStatus, parseWorktreeList };

export const parseArguments = (args) => {
  let options = { repo: "reitojike/stage-tracker", prune: false };
  const remaining = [...args];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--prune") options = { ...options, prune: true };
    else if (argument === "--repo") {
      const value = remaining.shift();
      if (value === undefined || value.startsWith("--")) throw new Error("--repo requires a value");
      options = { ...options, repo: value };
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (!/^[^/]+\/[^/]+$/.test(options.repo)) throw new Error("--repo must be owner/name");
  return options;
};

export const parseBranchList = (forEachRefOutput) =>
  forEachRefOutput
    .split(/\r?\n/)
    .filter((line) => line !== "")
    .map((line) => {
      const [name, oid] = line.split("\t");
      return { name, oid };
    });

export const parsePrList = (jsonOutput) => JSON.parse(jsonOutput);

export const parseOpenPrNumbers = (jqOutput) =>
  jqOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map(Number);

// 白の条件2(「畳もうとしているworktree以外にチェックアウトされていない」)をworktree候補と
// branchのみの候補の両方に同じ形で適用するための共通判定
// (docs/worktree-policy.md「削除してよい条件(白)」条件1)。
export const isCheckedOutElsewhere = (worktrees, branchName, excludePath) =>
  worktrees.some((worktree) => worktree.branch === branchName && worktree.path !== excludePath);

// worktreeを持つ候補はworktreesの中に自分自身を含むので、branchOnlyCandidatesは
// 既にworktreeを持つ候補と重複しないよう除外する。
export const collectCandidates = ({ worktrees, branches, selfPath }) => {
  const checkedOutBranchNames = new Set(
    worktrees.map((worktree) => worktree.branch).filter((branch) => branch !== undefined),
  );
  const worktreeCandidates = worktrees.map((worktree) => ({
    kind: "worktree",
    path: worktree.path,
    branch: worktree.branch,
    isSelf: worktree.path === selfPath,
    locked: worktree.locked,
    lockReason: worktree.lockReason,
    oid: branches.find((branch) => branch.name === worktree.branch)?.oid,
  }));
  const branchOnlyCandidates = branches
    .filter((branch) => !checkedOutBranchNames.has(branch.name))
    .map((branch) => ({ kind: "branch", branch: branch.name, oid: branch.oid }));
  return { worktreeCandidates, branchOnlyCandidates };
};

export const evaluateBranchConditions = ({
  branchName,
  checkedOutElsewhere,
  mergedPrs,
  openPrNumbers,
}) => {
  if (branchName === "main") return { white: false, reason: "is-main" };
  if (checkedOutElsewhere) return { white: false, reason: "checked-out-elsewhere" };
  if (mergedPrs.length === 0) return { white: false, reason: "no-merged-pr-at-tip" };
  if (mergedPrs.length > 1)
    return {
      white: false,
      reason: "multiple-merged-prs-at-tip",
      detail: mergedPrs.map((pr) => pr.number),
    };
  if (openPrNumbers.length > 0)
    return { white: false, reason: "open-pr-at-tip", detail: openPrNumbers };
  return { white: true, reason: undefined, mergedPrNumber: mergedPrs[0].number };
};

export const evaluateWorktreeConditions = ({
  isSelf,
  locked,
  lockReason,
  status,
  branch,
  branchEvaluation,
}) => {
  if (isSelf) return { white: false, reason: "self" };
  if (locked) return { white: false, reason: "locked", detail: lockReason };
  if (status.dirty) return { white: false, reason: "dirty", detail: status.dirtyLines };
  if (branch === undefined) return { white: false, reason: "detached-no-branch" };
  if (!branchEvaluation.white)
    return { white: false, reason: branchEvaluation.reason, detail: branchEvaluation.detail };
  return { white: true, reason: undefined };
};

const auditBranchOid = (branchName, oid, worktrees, excludePath, { gh, repo }) => {
  const checkedOutElsewhere = isCheckedOutElsewhere(worktrees, branchName, excludePath);
  if (branchName === "main" || checkedOutElsewhere)
    return evaluateBranchConditions({
      branchName,
      checkedOutElsewhere,
      mergedPrs: [],
      openPrNumbers: [],
    });
  const mergedPrs = parsePrList(
    gh([
      "pr",
      "list",
      "--head",
      branchName,
      "--repo",
      repo,
      "--state",
      "all",
      "--json",
      "number,state,headRefOid,headRefName",
    ]),
  ).filter((pr) => pr.state === "MERGED" && pr.headRefOid === oid);
  const openPrNumbers = parseOpenPrNumbers(
    gh([
      "api",
      `repos/${repo}/commits/${oid}/pulls`,
      "--jq",
      '.[] | select(.state == "open") | .number',
    ]),
  );
  return evaluateBranchConditions({ branchName, checkedOutElsewhere, mergedPrs, openPrNumbers });
};

const auditWorktreeCandidate = (candidate, worktrees, { git, gh, repo }) => {
  const status = parseStatus(git(["-C", candidate.path, "status", "--porcelain=v2", "--branch"]));
  // gh呼び出し(API・レート制限あり)は、他の条件で既に黒と決まっている場合は行わない。
  // git statusはローカルで完結するため、self/lockedの場合も含めて常に取得する
  // (cleanup-worktree-lib.mjsのcleanupWorktreeと同じく、判定は後段の純関数に委ねる)。
  const needsBranchEvaluation =
    !candidate.isSelf && !candidate.locked && !status.dirty && candidate.branch !== undefined;
  const branchEvaluation = needsBranchEvaluation
    ? auditBranchOid(candidate.branch, candidate.oid, worktrees, candidate.path, { gh, repo })
    : { white: false, reason: undefined, detail: undefined };
  const evaluation = evaluateWorktreeConditions({
    isSelf: candidate.isSelf,
    locked: candidate.locked,
    lockReason: candidate.lockReason,
    status,
    branch: candidate.branch,
    branchEvaluation,
  });
  return {
    ...candidate,
    white: evaluation.white,
    reason: evaluation.reason,
    detail: evaluation.detail,
  };
};

const auditBranchOnlyCandidate = (candidate, worktrees, { gh, repo }) => {
  const branchEvaluation = auditBranchOid(candidate.branch, candidate.oid, worktrees, undefined, {
    gh,
    repo,
  });
  return {
    ...candidate,
    white: branchEvaluation.white,
    reason: branchEvaluation.reason,
    detail: branchEvaluation.detail,
  };
};

const formatResultLine = (result) => {
  const label =
    result.kind === "worktree"
      ? `worktree ${result.path} (branch: ${result.branch ?? "(detached)"})`
      : `branch ${result.branch}`;
  if (result.white) return `WHITE: ${label}`;
  const detail = result.detail !== undefined ? ` detail=${JSON.stringify(result.detail)}` : "";
  return `BLACK: ${label} reason=${result.reason}${detail}`;
};

export const deleteCandidate = (result, { git, log }) => {
  if (result.kind === "worktree") {
    try {
      git(["worktree", "remove", result.path]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(
        `WARN: failed to remove worktree '${result.path}'; branch '${result.branch}' left untouched: ${message}`,
      );
      return {
        branch: result.branch,
        worktreeRemoved: false,
        branchDeleted: false,
        error: message,
      };
    }
  }
  try {
    git(["update-ref", "-d", `refs/heads/${result.branch}`, result.oid]);
    log(`OK: deleted branch ${result.branch}`);
    return {
      branch: result.branch,
      worktreeRemoved: result.kind === "worktree",
      branchDeleted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      `WARN: branch '${result.branch}' was not deleted (its tip may have moved since judging it white): ${message}`,
    );
    return {
      branch: result.branch,
      worktreeRemoved: result.kind === "worktree",
      branchDeleted: false,
      error: message,
    };
  }
};

export const auditWorktrees = (options, { git, gh, log }) => {
  const porcelain = git(["worktree", "list", "--porcelain"]);
  const worktrees = parseWorktreeList(porcelain);
  const selfPath = findWorktree(porcelain, git(["rev-parse", "--show-toplevel"]).trim()).path;
  const branches = parseBranchList(
    git(["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads"]),
  );
  const { worktreeCandidates, branchOnlyCandidates } = collectCandidates({
    worktrees,
    branches,
    selfPath,
  });

  const results = [
    ...worktreeCandidates.map((candidate) =>
      auditWorktreeCandidate(candidate, worktrees, { git, gh, repo: options.repo }),
    ),
    ...branchOnlyCandidates.map((candidate) =>
      auditBranchOnlyCandidate(candidate, worktrees, { gh, repo: options.repo }),
    ),
  ];

  for (const result of results) log(formatResultLine(result));

  const whiteResults = results.filter((result) => result.white);
  if (!options.prune) {
    log(
      `report only: ${whiteResults.length} white / ${results.length} candidate(s); rerun with --prune to delete white candidates`,
    );
    return { results, deleted: [] };
  }

  const deleted = whiteResults.map((result) => deleteCandidate(result, { git, log }));
  return { results, deleted };
};
