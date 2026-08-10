import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { parseArguments, resolveGhPath, syncAgentModel } from "./sync-agent-model-lib.mjs";

const usage = () => {
  console.error(
    "usage: yarn issue:set-agent --issue <number> --agent <model> [--repo owner/name] [--dry-run]",
  );
};

const run = () => {
  const ghPath = resolveGhPath({
    configuredPath: process.env.STAGE_TRACKER_GH_PATH,
    platform: process.platform,
    exists: existsSync,
  });
  const runGh = (args) =>
    execFileSync(ghPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  syncAgentModel(parseArguments(process.argv.slice(2)), { runGh, log: console.log });
};

try {
  run();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
