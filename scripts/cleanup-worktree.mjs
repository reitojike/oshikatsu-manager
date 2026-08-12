import { execFileSync } from "node:child_process";

import { cleanupWorktree, parseArguments } from "./cleanup-worktree-lib.mjs";

const usage = () => {
  console.error("usage: yarn worktree:cleanup --path <worktree-path> [--unlock]");
};

const run = () => {
  const options = parseArguments(process.argv.slice(2));
  const git = (args) =>
    execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const result = cleanupWorktree(options, { git, log: console.log });
  if (!result.removed) process.exitCode = 1;
};

try {
  run();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
