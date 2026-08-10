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

const GH_OPTIONS = { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60_000 };

/** @typedef {(file: string, args: string[], options: typeof GH_OPTIONS) => string} GhExecutor */

/** @param {string} path @param {GhExecutor} execute */
export const getGhPosts = (path, execute = execFileSync) => {
  const pages = JSON.parse(execute("gh", ["api", "--paginate", "--slurp", path], GH_OPTIONS));
  return flattenGhPages(pages);
};

const hasProperty = (value, property) =>
  typeof value === "object" && value !== null && Object.hasOwn(value, property);

const isBufferError = (error) => hasProperty(error, "code") && error.code === "ENOBUFS";

const isTimeoutError = (error) =>
  (hasProperty(error, "code") && error.code === "ETIMEDOUT") ||
  (hasProperty(error, "killed") &&
    error.killed === true &&
    hasProperty(error, "signal") &&
    error.signal === "SIGTERM");

const ghFailureReason = (error) => {
  if (isBufferError(error)) return "GitHub API応答が64MiB上限を超えたため投稿件数を判定できない";
  if (isTimeoutError(error))
    return "GitHub API取得が60秒でタイムアウトしたため投稿件数を判定できない";
  return "GitHub API取得に失敗したため投稿件数を判定できない";
};

const ghRetrievalError = (error, path) => {
  return new Error(`${ghFailureReason(error)}: ${path}`, { cause: error });
};

const getGhPostsOrThrow = (getPosts, path) => {
  try {
    return getPosts(path);
  } catch (error) {
    throw ghRetrievalError(error, path);
  }
};

const getClaudePostCount = (getPosts, repository, prNumber, headSha, since) => {
  const base = `repos/${repository}/pulls/${prNumber}`;
  const issueCommentsPath = `repos/${repository}/issues/${prNumber}/comments?since=${encodeURIComponent(since)}`;
  const reviewsPath = `${base}/reviews`;
  const reviewCommentsPath = `${base}/comments?since=${encodeURIComponent(since)}`;
  return countClaudePosts({
    issueComments: getGhPostsOrThrow(getPosts, issueCommentsPath),
    reviews: getGhPostsOrThrow(getPosts, reviewsPath),
    reviewComments: getGhPostsOrThrow(getPosts, reviewCommentsPath),
    headSha,
    since,
  });
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
  let count;
  try {
    count = getClaudePostCount(getGhPosts, repository, prNumber, headSha, since);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GitHub API取得に失敗したため投稿件数を判定できない";
    summary(append, summaryPath, `- ${message}`);
    outputNotice(message);
    throw error;
  }
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
      getGhPosts,
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
