import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { runRegisterIssueCommand } from "./register-issue-lib.mjs";

const usage = () => {
  console.error("usage: yarn issue:register --issue <number> [--repo owner/name] [--dry-run]");
};

const sleepSync = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const run = () => {
  runRegisterIssueCommand(process.argv.slice(2), {
    configuredPath: process.env.STAGE_TRACKER_GH_PATH,
    platform: process.platform,
    exists: existsSync,
    execute: (path, args) =>
      execFileSync(path, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    log: console.log,
    sleep: sleepSync,
  });
};

try {
  run();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
