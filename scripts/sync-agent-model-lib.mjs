import {
  getProjectItem,
  PROJECT_ID,
  PROJECT_ITEM_LIMIT,
  resolveGhPath,
} from "./gh-project-lib.mjs";

export { PROJECT_ITEM_LIMIT, resolveGhPath };

const MODEL_FIELD_ID = "PVTSSF_lAHOAzvh3c4BfeaMzhZxDK8";
export const MODEL_OPTIONS = new Map([
  ["opus", { id: "d233b8f2", name: "Opus" }],
  ["sonnet", { id: "7b1942f7", name: "Sonnet" }],
  ["haiku", { id: "6e152153", name: "Haiku" }],
  ["sol", { id: "8e1daf94", name: "Sol" }],
  ["terra", { id: "c992ffb2", name: "Terra" }],
  ["luna", { id: "09f22e15", name: "Luna" }],
]);

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

const parseJson = (value) => JSON.parse(value);
export const agentLabels = (labels) =>
  labels.map((label) => label.name).filter((name) => name.startsWith("agent:"));

const getIssue = (runGh, repo, issue) =>
  parseJson(runGh(["issue", "view", issue, "--repo", repo, "--json", "labels"]));

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

const clearModelField = (runGh, itemId) => {
  const query = `mutation($project:ID!,$item:ID!,$field:ID!){
    clearProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field}){
      projectV2Item{id}
    }
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

const sameLabels = (left, right) =>
  left.length === right.length && left.every((label) => right.includes(label));

const rollbackLabels = (runGh, options, currentLabels, originalLabels, attemptedLabel) => {
  try {
    editAgentLabels(runGh, options, currentLabels, originalLabels);
  } catch (rollbackError) {
    throw new Error(
      `label rollback failed: original=${JSON.stringify(originalLabels)}, attempted=${attemptedLabel}; ${errorMessage(rollbackError)}`,
    );
  }
};

const optionForModelName = (modelName) =>
  [...MODEL_OPTIONS.values()].find((option) => option.name === modelName);

const rollbackModel = (runGh, itemId, originalModel, attemptedModel) => {
  try {
    if (originalModel === undefined || originalModel === "") {
      clearModelField(runGh, itemId);
      return;
    }
    const originalOption = optionForModelName(originalModel);
    if (originalOption === undefined) throw new Error("original Model option is unknown");
    updateModelField(runGh, itemId, originalOption.id);
  } catch (rollbackError) {
    throw new Error(
      `Model rollback failed: original=${JSON.stringify(originalModel)}, attempted=${attemptedModel}; ${errorMessage(rollbackError)}`,
    );
  }
};

const rollbackChanges = (runGh, options, item, originalLabels, attemptedLabel, attemptedModel) => {
  const failures = [];
  try {
    const currentItem = getProjectItem(runGh, options.repo, options.issue);
    if (currentItem.model === attemptedModel)
      rollbackModel(runGh, item.id, item.model, attemptedModel);
    else if (currentItem.model !== item.model)
      throw new Error(
        `Model rollback conflict: current=${JSON.stringify(currentItem.model)}, attempted=${attemptedModel}`,
      );
  } catch (error) {
    failures.push(errorMessage(error));
  }
  try {
    const currentLabels = agentLabels(getIssue(runGh, options.repo, options.issue).labels);
    if (sameLabels(currentLabels, [attemptedLabel]))
      rollbackLabels(runGh, options, currentLabels, originalLabels, attemptedLabel);
    else if (!sameLabels(currentLabels, originalLabels))
      throw new Error(
        `label rollback conflict: current=${JSON.stringify(currentLabels)}, attempted=${attemptedLabel}`,
      );
  } catch (error) {
    failures.push(errorMessage(error));
  }
  return failures;
};

export const syncAgentModel = (options, { runGh, log }) => {
  const label = `agent:${options.agent}`;
  const modelOption = MODEL_OPTIONS.get(options.agent);
  if (modelOption === undefined)
    throw new Error("agent must be opus, sonnet, haiku, sol, terra, or luna");
  if (options.dryRun) {
    log(`[dry-run] ${options.repo}#${options.issue}: agent:* label -> ${label}`);
    log(`[dry-run] Project Model -> ${modelOption.name} (${modelOption.id})`);
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
    const rollbackFailures = rollbackChanges(
      runGh,
      options,
      item,
      originalLabels,
      label,
      modelOption.name,
    );
    if (rollbackFailures.length > 0)
      throw new Error(`${errorMessage(error)}; ${rollbackFailures.join("; ")}`);
    throw error;
  }
  log(
    `OK: ${options.repo}#${options.issue} の ${label} とProject Model=${modelOption.name} を同期しました`,
  );
};

export const runSyncAgentModelCommand = (
  args,
  { configuredPath, platform, exists, execute, log },
) => {
  const options = parseArguments(args);
  if (options.dryRun) {
    syncAgentModel(options, {
      runGh: () => {
        throw new Error("dry-run must not execute GitHub CLI");
      },
      log,
    });
    return;
  }
  const ghPath = resolveGhPath({ configuredPath, platform, exists });
  const runGh = (ghArgs) => execute(ghPath, ghArgs);
  syncAgentModel(options, { runGh, log });
};
