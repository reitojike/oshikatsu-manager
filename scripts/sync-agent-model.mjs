import { execFileSync } from "node:child_process";

const PROJECT_ID = "PVT_kwHOAzvh3c4BfeaM";
const PROJECT_OWNER = "reitojike";
const PROJECT_NUMBER = "1";
const MODEL_FIELD_ID = "PVTSSF_lAHOAzvh3c4BfeaMzhZxDK8";
const MODEL_OPTION_IDS = new Map([
  ["opus", "d233b8f2"],
  ["sonnet", "7b1942f7"],
  ["haiku", "6e152153"],
  ["sol", "8e1daf94"],
  ["terra", "c992ffb2"],
  ["luna", "09f22e15"],
]);
const MODEL_NAMES = new Map([
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
  ["sol", "Sol"],
  ["terra", "Terra"],
  ["luna", "Luna"],
]);
const GH_PATH =
  process.platform === "win32" ? "C:\\Program Files\\GitHub CLI\\gh.exe" : "/usr/bin/gh";

const usage = () => {
  console.error(
    "usage: yarn issue:set-agent --issue <number> --agent <model> [--repo owner/name] [--dry-run]",
  );
};

const assignOption = (options, argument, value) => {
  if (argument === "--issue") options.issue = value;
  else if (argument === "--agent") options.agent = value;
  else options.repo = value;
};

const parseArguments = (args) => {
  const options = { repo: "reitojike/stage-tracker", dryRun: false };
  const remaining = [...args];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--issue" || argument === "--agent" || argument === "--repo") {
      const value = remaining.shift();
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${argument} requires a value`);
      assignOption(options, argument, value);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.issue === undefined || !/^\d+$/.test(options.issue))
    throw new Error("--issue must be a number");
  if (!MODEL_OPTION_IDS.has(options.agent))
    throw new Error("--agent must be opus, sonnet, haiku, sol, terra, or luna");
  if (!/^[^/]+\/[^/]+$/.test(options.repo)) throw new Error("--repo must be owner/name");
  return options;
};

const runGh = (args) =>
  execFileSync(GH_PATH, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const parseJson = (value) => JSON.parse(value);

const getIssue = (repo, issue) =>
  parseJson(runGh(["issue", "view", issue, "--repo", repo, "--json", "labels"]));

const getProjectItem = (repo, issue) => {
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

const agentLabels = (labels) =>
  labels.map((label) => label.name).filter((name) => name.startsWith("agent:"));

const updateModelField = (itemId, optionId) => {
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

const sync = (options) => {
  const label = `agent:${options.agent}`;
  const optionId = MODEL_OPTION_IDS.get(options.agent);
  if (options.dryRun) {
    console.log(`[dry-run] ${options.repo}#${options.issue}: agent:* label -> ${label}`);
    console.log(`[dry-run] Project Model -> ${options.agent} (${optionId})`);
    console.log("[dry-run] no GitHub data was changed");
    return;
  }

  const before = getIssue(options.repo, options.issue);
  const item = getProjectItem(options.repo, options.issue);
  const removeArguments = agentLabels(before.labels).flatMap((name) => ["--remove-label", name]);
  runGh([
    "issue",
    "edit",
    options.issue,
    "--repo",
    options.repo,
    ...removeArguments,
    "--add-label",
    label,
  ]);
  updateModelField(item.id, optionId);

  const after = getIssue(options.repo, options.issue);
  const labels = agentLabels(after.labels);
  if (labels.length !== 1 || labels[0] !== label)
    throw new Error("agent label verification failed");
  const projectItem = getProjectItem(options.repo, options.issue);
  if (projectItem.Model !== MODEL_NAMES.get(options.agent))
    throw new Error("Project Model verification failed");
  console.log(
    `OK: ${options.repo}#${options.issue} の ${label} とProject Model=${options.agent} を同期しました`,
  );
};

try {
  sync(parseArguments(process.argv.slice(2)));
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
