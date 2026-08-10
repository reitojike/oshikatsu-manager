import { isAbsolute } from "node:path";

const PROJECT_ID = "PVT_kwHOAzvh3c4BfeaM";
const PROJECT_OWNER = "reitojike";
const PROJECT_NUMBER = "1";
const MODEL_FIELD_ID = "PVTSSF_lAHOAzvh3c4BfeaMzhZxDK8";
const MODEL_OPTIONS = new Map([
  ["opus", { id: "d233b8f2", name: "Opus" }],
  ["sonnet", { id: "7b1942f7", name: "Sonnet" }],
  ["haiku", { id: "6e152153", name: "Haiku" }],
  ["sol", { id: "8e1daf94", name: "Sol" }],
  ["terra", { id: "c992ffb2", name: "Terra" }],
  ["luna", { id: "09f22e15", name: "Luna" }],
]);

const ghCandidates = (platform) => {
  if (platform === "win32")
    return ["C:\\Program Files\\GitHub CLI\\gh.exe", "C:\\Program Files (x86)\\GitHub CLI\\gh.exe"];
  if (platform === "darwin") return ["/usr/local/bin/gh", "/opt/homebrew/bin/gh"];
  if (platform === "linux") return ["/usr/bin/gh", "/usr/local/bin/gh"];
  return [];
};

const optionValue = (options, argument, value) => {
  if (argument === "--issue") return { ...options, issue: value };
  if (argument === "--agent") return { ...options, agent: value };
  return { ...options, repo: value };
};

export const parseArguments = (args) => {
  let options = { repo: "reitojike/stage-tracker", dryRun: false };
  const remaining = [...args];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--dry-run") options = { ...options, dryRun: true };
    else if (["--issue", "--agent", "--repo"].includes(argument)) {
      const value = remaining.shift();
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${argument} requires a value`);
      options = optionValue(options, argument, value);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.issue === undefined || !/^\d+$/.test(options.issue))
    throw new Error("--issue must be a number");
  if (!MODEL_OPTIONS.has(options.agent))
    throw new Error("--agent must be opus, sonnet, haiku, sol, terra, or luna");
  if (!/^[^/]+\/[^/]+$/.test(options.repo)) throw new Error("--repo must be owner/name");
  return options;
};

export const resolveGhPath = ({ configuredPath, platform, exists }) => {
  if (configuredPath !== undefined) {
    if (!isAbsolute(configuredPath) || !exists(configuredPath))
      throw new Error("STAGE_TRACKER_GH_PATH must be an existing absolute path to gh");
    return configuredPath;
  }
  const candidates = ghCandidates(platform);
  const found = candidates.find((candidate) => exists(candidate));
  if (found === undefined)
    throw new Error(
      "GitHub CLI was not found; set STAGE_TRACKER_GH_PATH to its absolute executable path",
    );
  return found;
};

const parseJson = (value) => JSON.parse(value);
const agentLabels = (labels) =>
  labels.map((label) => label.name).filter((name) => name.startsWith("agent:"));

const getIssue = (runGh, repo, issue) =>
  parseJson(runGh(["issue", "view", issue, "--repo", repo, "--json", "labels"]));

const getProjectItem = (runGh, repo, issue) => {
  const result = parseJson(
    runGh([
      "project",
      "item-list",
      PROJECT_NUMBER,
      "--owner",
      PROJECT_OWNER,
      "--format",
      "json",
      "--limit",
      "1000",
    ]),
  );
  const item = result.items.find(
    (candidate) =>
      candidate.content?.number === Number(issue) && candidate.content?.repository === repo,
  );
  if (item?.id === undefined)
    throw new Error("issue is not registered in the expected GitHub Project");
  return item;
};

const labelEditArguments = (currentLabels, desiredLabels) => [
  ...currentLabels
    .filter((name) => !desiredLabels.includes(name))
    .flatMap((name) => ["--remove-label", name]),
  ...desiredLabels
    .filter((name) => !currentLabels.includes(name))
    .flatMap((name) => ["--add-label", name]),
];

const editAgentLabels = (runGh, options, currentLabels, desiredLabels) => {
  const editArguments = labelEditArguments(currentLabels, desiredLabels);
  if (editArguments.length === 0) return;
  runGh(["issue", "edit", options.issue, "--repo", options.repo, ...editArguments]);
};

const updateModelField = (runGh, itemId, optionId) => {
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
    `field=${MODEL_FIELD_ID}`,
    "-f",
    `option=${optionId}`,
  ]);
};

const verify = (runGh, options, expectedLabel, expectedModel) => {
  const labels = agentLabels(getIssue(runGh, options.repo, options.issue).labels);
  if (labels.length !== 1 || labels[0] !== expectedLabel)
    throw new Error("agent label verification failed");
  const projectItem = getProjectItem(runGh, options.repo, options.issue);
  if (projectItem.model !== expectedModel) throw new Error("Project Model verification failed");
};

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

const rollbackLabels = (runGh, options, originalLabels, attemptedLabel) => {
  try {
    const current = agentLabels(getIssue(runGh, options.repo, options.issue).labels);
    editAgentLabels(runGh, options, current, originalLabels);
  } catch (rollbackError) {
    throw new Error(
      `label rollback failed: original=${JSON.stringify(originalLabels)}, attempted=${attemptedLabel}; ${errorMessage(rollbackError)}`,
    );
  }
};

export const syncAgentModel = (options, { runGh, log }) => {
  const label = `agent:${options.agent}`;
  const modelOption = MODEL_OPTIONS.get(options.agent);
  if (options.dryRun) {
    log(`[dry-run] ${options.repo}#${options.issue}: agent:* label -> ${label}`);
    log(`[dry-run] Project Model -> ${options.agent} (${modelOption.id})`);
    log("[dry-run] no GitHub data was changed");
    return;
  }
  const before = getIssue(runGh, options.repo, options.issue);
  const originalLabels = agentLabels(before.labels);
  const item = getProjectItem(runGh, options.repo, options.issue);
  editAgentLabels(runGh, options, originalLabels, [label]);
  try {
    updateModelField(runGh, item.id, modelOption.id);
    verify(runGh, options, label, modelOption.name);
  } catch (error) {
    rollbackLabels(runGh, options, originalLabels, label);
    throw error;
  }
  log(
    `OK: ${options.repo}#${options.issue} の ${label} とProject Model=${options.agent} を同期しました`,
  );
};
