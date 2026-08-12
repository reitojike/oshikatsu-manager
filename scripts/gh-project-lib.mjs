import { posix, win32 } from "node:path";

export const PROJECT_ID = "PVT_kwHOAzvh3c4BfeaM";
export const PROJECT_OWNER = "reitojike";
export const PROJECT_NUMBER = "1";
export const PROJECT_ITEM_LIMIT = 1000;

const ghCandidates = (platform) => {
  if (platform === "win32")
    return ["C:\\Program Files\\GitHub CLI\\gh.exe", "C:\\Program Files (x86)\\GitHub CLI\\gh.exe"];
  if (platform === "darwin") return ["/usr/local/bin/gh", "/opt/homebrew/bin/gh"];
  if (platform === "linux") return ["/usr/bin/gh", "/usr/local/bin/gh"];
  return [];
};

const isAbsolutePath = (platform, path) =>
  platform === "win32" ? win32.isAbsolute(path) : posix.isAbsolute(path);

export const resolveGhPath = ({ configuredPath, platform, exists }) => {
  if (configuredPath !== undefined) {
    if (!isAbsolutePath(platform, configuredPath) || !exists(configuredPath))
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

export const addProjectItem = (runGh, contentId) => {
  const query = `mutation($project:ID!,$content:ID!){
    addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}
  }`;
  const result = parseJson(
    runGh([
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `project=${PROJECT_ID}`,
      "-f",
      `content=${contentId}`,
    ]),
  );
  return result.data.addProjectV2ItemById.item.id;
};

export const getProjectItem = (runGh, repo, issue) => {
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
      String(PROJECT_ITEM_LIMIT),
    ]),
  );
  const item = result.items.find(
    (candidate) =>
      candidate.content?.number === Number(issue) && candidate.content?.repository === repo,
  );
  if (item === undefined && result.items.length === PROJECT_ITEM_LIMIT)
    throw new Error(
      `GitHub Project item list reached the ${PROJECT_ITEM_LIMIT}-item limit; the issue may be outside the returned results`,
    );
  if (item?.id === undefined)
    throw new Error("issue is not registered in the expected GitHub Project");
  return item;
};
