import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { resolveGhPath } from "./gh-project-lib.mjs";
import {
  aggregate,
  assertPrListComplete,
  filterMergedSince,
  formatPrLine,
  formatSummary,
  parseArguments,
  PR_LIST_LIMIT,
  summarizePr,
} from "./review-stats-lib.mjs";

const usage = () => {
  console.error(
    "usage: yarn review:stats (--since YYYY-MM-DD | --pr <number>) [--repo owner/name]",
  );
};

const fetchPaginated = (gh, path) => JSON.parse(gh(["api", "--paginate", "--slurp", path])).flat();

const resolveTargets = (options, gh) => {
  if (options.pr !== undefined) {
    return [
      JSON.parse(
        gh(["pr", "view", String(options.pr), "--repo", options.repo, "--json", "number,body"]),
      ),
    ];
  }
  const prs = JSON.parse(
    gh([
      "pr",
      "list",
      "--repo",
      options.repo,
      "--state",
      "merged",
      "--json",
      "number,mergedAt,body",
      "--limit",
      String(PR_LIST_LIMIT),
    ]),
  );
  return filterMergedSince(assertPrListComplete(prs), options.since);
};

const run = () => {
  const options = parseArguments(process.argv.slice(2));
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

  const targets = resolveTargets(options, gh);
  const perPr = targets.map((target) => {
    const issueComments = fetchPaginated(
      gh,
      `repos/${options.repo}/issues/${target.number}/comments`,
    );
    const reviews = fetchPaginated(gh, `repos/${options.repo}/pulls/${target.number}/reviews`);
    const reviewComments = fetchPaginated(
      gh,
      `repos/${options.repo}/pulls/${target.number}/comments`,
    );
    return summarizePr({
      prNumber: target.number,
      prBody: target.body ?? "",
      issueComments,
      reviews,
      reviewComments,
    });
  });

  for (const pr of perPr) console.log(formatPrLine(pr));
  console.log("");
  console.log(formatSummary(aggregate(perPr)));
};

try {
  run();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
