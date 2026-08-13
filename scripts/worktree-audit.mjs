import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { resolveGhPath } from "./gh-project-lib.mjs";
import { auditWorktrees, parseArguments } from "./worktree-audit-lib.mjs";

const usage = () => {
  console.error("usage: yarn worktree:audit [--repo owner/name] [--prune]");
};

const run = () => {
  const options = parseArguments(process.argv.slice(2));
  const git = (args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  const ghPath = resolveGhPath({
    configuredPath: process.env.STAGE_TRACKER_GH_PATH,
    platform: process.platform,
    exists: existsSync,
  });
  const gh = (args) =>
    execFileSync(ghPath, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  auditWorktrees(options, { git, gh, log: console.log });
};

try {
  run();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
