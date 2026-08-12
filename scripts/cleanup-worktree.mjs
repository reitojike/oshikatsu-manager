import { execFileSync } from "node:child_process";
import path from "node:path";

import { cleanupWorktree, parseArguments } from "./cleanup-worktree-lib.mjs";

const usage = () => {
  console.error("usage: yarn worktree:cleanup --path <worktree-path> [--unlock]");
};

const run = () => {
  const options = parseArguments(process.argv.slice(2));
  const resolvedOptions = { ...options, path: path.resolve(options.path) };
  const git = (args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  const result = cleanupWorktree(resolvedOptions, { git, log: console.log });
  if (!result.removed) process.exitCode = 1;
};

try {
  run();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
