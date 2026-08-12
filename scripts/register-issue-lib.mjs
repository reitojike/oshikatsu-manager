import {
  addProjectItem,
  getProjectItem,
  PROJECT_ITEM_LIMIT,
  resolveGhPath,
} from "./gh-project-lib.mjs";
import { agentLabels, MODEL_OPTIONS, syncAgentModel } from "./sync-agent-model-lib.mjs";
import { setIssueStatus } from "./set-issue-status-lib.mjs";

export { PROJECT_ITEM_LIMIT, resolveGhPath };

const optionValue = (options, argument, value) => {
  if (argument === "--issue") return { ...options, issue: value };
  return { ...options, repo: value };
};

export const parseArguments = (args) => {
  let options = { repo: "reitojike/stage-tracker", dryRun: false };
  const remaining = [...args];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--dry-run") options = { ...options, dryRun: true };
    else if (["--issue", "--repo"].includes(argument)) {
      const value = remaining.shift();
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${argument} requires a value`);
      options = optionValue(options, argument, value);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.issue === undefined || !/^\d+$/.test(options.issue))
    throw new Error("--issue must be a number");
  if (!/^[^/]+\/[^/]+$/.test(options.repo)) throw new Error("--repo must be owner/name");
  return options;
};

const parseJson = (value) => JSON.parse(value);

const getIssueWithContentId = (runGh, repo, issue) =>
  parseJson(runGh(["issue", "view", issue, "--repo", repo, "--json", "id,labels"]));

export const resolveAgentFromLabels = (labels) => {
  const names = agentLabels(labels);
  if (names.length !== 1)
    throw new Error(
      `issue must have exactly one agent:* label to resolve Project Model (found ${names.length}: ${JSON.stringify(names)})`,
    );
  const [label] = names;
  const agent = label.slice("agent:".length);
  if (!MODEL_OPTIONS.has(agent)) throw new Error(`unknown agent label: ${label}`);
  return agent;
};

const NOT_REGISTERED_MESSAGE = "issue is not registered in the expected GitHub Project";

// gh project item-list はaddProjectV2ItemById直後に新規itemを返さないことがある
// (実測: 登録から反映まで数秒〜数十秒の遅延。issue単体へのnode参照は即時反映される)。
// item-add自体の成否ではなく、後続のgetProjectItem(item-list検索)が追いつくまで待つ。
export const waitForProjectItem = (
  runGh,
  repo,
  issue,
  { sleep, attempts = 10, delayMs = 3000 },
) => {
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new Error("waitForProjectItem requires at least one attempt");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return getProjectItem(runGh, repo, issue);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== NOT_REGISTERED_MESSAGE || attempt === attempts) throw error;
      sleep(delayMs);
    }
  }
};

export const registerIssue = (options, { runGh, log, sleep }) => {
  if (options.dryRun) {
    log(
      `[dry-run] ${options.repo}#${options.issue}: Project item-add (registered issue reuses its existing item)`,
    );
    log(`[dry-run] ${options.repo}#${options.issue}: Project Status -> Todo`);
    log(
      `[dry-run] ${options.repo}#${options.issue}: Project Model -> resolved from the issue's agent:* label at execution time`,
    );
    log("[dry-run] no GitHub data was changed");
    return;
  }
  const issue = getIssueWithContentId(runGh, options.repo, options.issue);
  const agent = resolveAgentFromLabels(issue.labels);
  addProjectItem(runGh, issue.id);
  waitForProjectItem(runGh, options.repo, options.issue, { sleep });
  log(`OK: ${options.repo}#${options.issue} をGitHub Projectへ登録しました`);
  setIssueStatus({ ...options, status: "Todo" }, { runGh, log });
  syncAgentModel({ ...options, agent }, { runGh, log });
};

export const runRegisterIssueCommand = (
  args,
  { configuredPath, platform, exists, execute, log, sleep },
) => {
  const options = parseArguments(args);
  if (options.dryRun) {
    registerIssue(options, {
      runGh: () => {
        throw new Error("dry-run must not execute GitHub CLI");
      },
      log,
      sleep: () => {
        throw new Error("dry-run must not sleep");
      },
    });
    return;
  }
  const ghPath = resolveGhPath({ configuredPath, platform, exists });
  const runGh = (ghArgs) => execute(ghPath, ghArgs);
  registerIssue(options, { runGh, log, sleep });
};
