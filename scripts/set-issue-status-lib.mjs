import {
  getProjectItem,
  PROJECT_ID,
  PROJECT_ITEM_LIMIT,
  resolveGhPath,
} from "./gh-project-lib.mjs";

export { PROJECT_ITEM_LIMIT, resolveGhPath };

const STATUS_FIELD_ID = "PVTSSF_lAHOAzvh3c4BfeaMzhZxC-o";
const STATUS_OPTIONS = new Map([
  ["Todo", { id: "0c779f74", name: "Todo" }],
  ["In Progress", { id: "75a98976", name: "In Progress" }],
  ["Blocked", { id: "52cced27", name: "Blocked" }],
  ["Done", { id: "f1e50cdb", name: "Done" }],
]);

const optionValue = (options, argument, value) => {
  if (argument === "--issue") return { ...options, issue: value };
  if (argument === "--status") return { ...options, status: value };
  return { ...options, repo: value };
};

export const parseArguments = (args) => {
  let options = { repo: "reitojike/stage-tracker", dryRun: false };
  const remaining = [...args];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--dry-run") options = { ...options, dryRun: true };
    else if (["--issue", "--status", "--repo"].includes(argument)) {
      const value = remaining.shift();
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${argument} requires a value`);
      options = optionValue(options, argument, value);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.issue === undefined || !/^\d+$/.test(options.issue))
    throw new Error("--issue must be a number");
  if (options.status === undefined || !STATUS_OPTIONS.has(options.status))
    throw new Error("--status must be Todo, In Progress, Blocked, or Done");
  if (!/^[^/]+\/[^/]+$/.test(options.repo)) throw new Error("--repo must be owner/name");
  return options;
};

const updateStatusField = (runGh, itemId, optionId) => {
  const query = `mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){
    updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,
      value:{singleSelectOptionId:$option}}){projectV2Item{id}}
  }`;
  runGh([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `project=${PROJECT_ID}`,
    "-f",
    `item=${itemId}`,
    "-f",
    `field=${STATUS_FIELD_ID}`,
    "-f",
    `option=${optionId}`,
  ]);
};

const verify = (runGh, options, expectedStatus) => {
  const projectItem = getProjectItem(runGh, options.repo, options.issue);
  if (projectItem.status !== expectedStatus) throw new Error("Project Status verification failed");
};

export const setIssueStatus = (options, { runGh, log }) => {
  const statusOption = STATUS_OPTIONS.get(options.status);
  if (statusOption === undefined)
    throw new Error("status must be Todo, In Progress, Blocked, or Done");
  if (options.dryRun) {
    log(
      `[dry-run] ${options.repo}#${options.issue}: Project Status -> ${statusOption.name} (${statusOption.id})`,
    );
    log("[dry-run] no GitHub data was changed");
    return;
  }
  const item = getProjectItem(runGh, options.repo, options.issue);
  updateStatusField(runGh, item.id, statusOption.id);
  verify(runGh, options, statusOption.name);
  log(
    `OK: ${options.repo}#${options.issue} のProject Status -> ${statusOption.name} に更新しました`,
  );
};

export const runSetIssueStatusCommand = (
  args,
  { configuredPath, platform, exists, execute, log },
) => {
  const options = parseArguments(args);
  if (options.dryRun) {
    setIssueStatus(options, {
      runGh: () => {
        throw new Error("dry-run must not execute GitHub CLI");
      },
      log,
    });
    return;
  }
  const ghPath = resolveGhPath({ configuredPath, platform, exists });
  const runGh = (ghArgs) => execute(ghPath, ghArgs);
  setIssueStatus(options, { runGh, log });
};
