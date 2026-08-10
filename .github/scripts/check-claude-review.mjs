import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BOT_LOGIN = "claude[bot]";

export const headShaMarker = (headSha) => `<!-- claude-review-head-sha:${headSha} -->`;

const environment = (value, name) => {
  if (value === undefined || value.trim() === "") throw new Error(`${name} が空です`);
  return value;
};

export const countClaudePosts = ({ issueComments, reviews, reviewComments, headSha, since }) => {
  const isBot = (entry) => entry.user?.login === BOT_LOGIN;
  const afterActionStarted = (entry) => {
    const created = entry.created_at ?? entry.submitted_at;
    if (typeof created !== "string") return false;
    return Date.parse(created) >= Date.parse(since);
  };
  const isHeadReview = (entry) => entry.commit_id === headSha;
  const isHeadIssueComment = (entry) =>
    typeof entry.body === "string" && entry.body.includes(headShaMarker(headSha));
  return [
    issueComments.filter(
      (entry) => isBot(entry) && isHeadIssueComment(entry) && afterActionStarted(entry),
    ),
    reviews.filter((entry) => isBot(entry) && isHeadReview(entry) && afterActionStarted(entry)),
    reviewComments.filter(
      (entry) => isBot(entry) && isHeadReview(entry) && afterActionStarted(entry),
    ),
  ].reduce((total, entries) => total + entries.length, 0);
};

export const reviewCheckDecision = ({ outcome, conclusion, postCount }) => {
  if (outcome === "skipped") return "skipped";
  if (outcome === "failure") return "failure";
  if (outcome !== "success") throw new Error(`未知のCLAUDE_OUTCOMEです: ${outcome}`);
  if (conclusion === undefined || conclusion === "") return "validation-skipped";
  if (postCount === undefined) return "check-posts";
  return postCount === 0 ? "missing-posts" : "posts-found";
};

const actionStartedAt = (value) => {
  const startedAt = environment(value, "ACTION_STARTED_AT");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(startedAt)) {
    throw new Error("ACTION_STARTED_AT はUTCのRFC 3339時刻である必要があります");
  }
  if (Number.isNaN(Date.parse(startedAt))) {
    throw new Error("ACTION_STARTED_AT は有効な時刻である必要があります");
  }
  return startedAt;
};

const summary = (append, path, message) => append(path, `${message}\n`);
const notice = (message) => console.log(`::notice::${message}`);

export const flattenGhPages = (pages) => {
  if (!Array.isArray(pages)) {
    throw new Error("gh api --paginate --slurp の出力は配列である必要があります");
  }
  return pages.flat();
};

const gh = (path) => {
  const pages = JSON.parse(
    execFileSync("gh", ["api", "--paginate", "--slurp", path], { encoding: "utf8" }),
  );
  return flattenGhPages(pages);
};

const executionDiagnostics = (read, executionFile) => {
  if (executionFile === undefined || executionFile.trim() === "")
    return "実行診断ファイルはありません。";
  try {
    const parsed = JSON.parse(read(executionFile, "utf8"));
    const fields = ["num_turns", "permission_denials_count", "total_cost_usd"];
    const hasDiagnosticField = (value) =>
      typeof value === "object" &&
      value !== null &&
      fields.some((field) => Object.hasOwn(value, field));
    const diagnostics = Array.isArray(parsed)
      ? [...parsed].reverse().find(hasDiagnosticField)
      : parsed;
    if (!hasDiagnosticField(diagnostics)) return "実行診断値はありません。";
    return fields
      .filter((field) => Object.hasOwn(diagnostics, field))
      .map((field) => `${field}: ${String(Reflect.get(diagnostics, field))}`)
      .join(" / ");
  } catch {
    return "実行診断ファイルを読めませんでした。";
  }
};

export const main = ({ env, getGhPosts, append, read, outputNotice }) => {
  const {
    CLAUDE_OUTCOME,
    CLAUDE_CONCLUSION,
    REPOSITORY,
    PR_NUMBER,
    HEAD_SHA,
    ACTION_STARTED_AT,
    GITHUB_STEP_SUMMARY,
    EXECUTION_FILE,
  } = env;
  const outcome = environment(CLAUDE_OUTCOME, "CLAUDE_OUTCOME");
  const summaryPath = environment(GITHUB_STEP_SUMMARY, "GITHUB_STEP_SUMMARY");
  const decision = reviewCheckDecision({ outcome, conclusion: CLAUDE_CONCLUSION });
  if (decision === "skipped") {
    const message = "Claude actionは未実行です。投稿件数判定は行いません。";
    summary(append, summaryPath, `- ${message}`);
    outputNotice(message);
    return;
  }
  if (decision === "failure") {
    const message =
      "Claude actionが失敗したため投稿件数判定は対象外です。元stepの失敗を維持します。";
    summary(append, summaryPath, `- ${message}`);
    outputNotice(message);
    return;
  }
  if (decision === "validation-skipped") {
    const message =
      "Claude actionはworkflow validation skipでした。投稿件数判定は機械では行えません。";
    summary(append, summaryPath, `- ${message}`);
    outputNotice(message);
    return;
  }
  const repository = environment(REPOSITORY, "REPOSITORY");
  const prNumber = environment(PR_NUMBER, "PR_NUMBER");
  const headSha = environment(HEAD_SHA, "HEAD_SHA");
  const since = actionStartedAt(ACTION_STARTED_AT);
  const base = `repos/${repository}/pulls/${prNumber}`;
  const count = countClaudePosts({
    issueComments: getGhPosts(
      `repos/${repository}/issues/${prNumber}/comments?since=${encodeURIComponent(since)}`,
    ),
    reviews: getGhPosts(`${base}/reviews`),
    reviewComments: getGhPosts(`${base}/comments?since=${encodeURIComponent(since)}`),
    headSha,
    since,
  });
  summary(append, summaryPath, `- Claude投稿件数: ${count}`);
  summary(append, summaryPath, `- 診断: ${executionDiagnostics(read, EXECUTION_FILE)}`);
  if (
    reviewCheckDecision({ outcome, conclusion: CLAUDE_CONCLUSION, postCount: count }) ===
    "missing-posts"
  )
    throw new Error("Claude actionは実行されましたが、対象head以降のclaude[bot]投稿が0件です");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main({
      env: process.env,
      getGhPosts: gh,
      append: appendFileSync,
      read: readFileSync,
      outputNotice: notice,
    });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Claude投稿確認で不明なエラーが発生しました",
    );
    process.exitCode = 1;
  }
}
