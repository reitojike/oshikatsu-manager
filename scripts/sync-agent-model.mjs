import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { runSyncAgentModelCommand } from "./sync-agent-model-lib.mjs";

const usage = () => {
  console.error(
    "usage: yarn issue:set-agent --issue <number> --agent <model> [--repo owner/name] [--dry-run]",
  );
};

const run = () => {
  runSyncAgentModelCommand(process.argv.slice(2), {
    configuredPath: process.env.STAGE_TRACKER_GH_PATH,
    platform: process.platform,
    exists: existsSync,
    execute: (path, args) =>
      execFileSync(path, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    log: console.log,
  });
};

try {
  run();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
