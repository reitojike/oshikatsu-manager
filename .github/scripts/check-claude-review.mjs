import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BOT_LOGIN = "claude[bot]";

export const CLAUDE_ENABLED_ERROR =
  'CLAUDE_ENABLED は "true" または "false" である必要があります。workflow の check step と検知stepの配線を確認してください。';

export const MISSING_CLAUDE_POSTS_ERROR =
  "Claude actionは実行されましたが、対象head以降のclaude[bot]投稿が0件です";

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

export const reviewCheckDecision = ({ outcome, enabled, conclusion, postCount }) => {
  if (typeof enabled !== "boolean") {
    throw new Error(
      "reviewCheckDecision の enabled 引数は boolean である必要があります。呼び出し元で環境値を boolean に正規化してください。",
    );
  }
  if (outcome === "skipped") return enabled === true ? "skipped-cancelled" : "token-unavailable";
  if (outcome === "failure") return "failure";
  if (outcome === "cancelled") return "cancelled";
  if (outcome !== "success") throw new Error(`未知のCLAUDE_OUTCOMEです: ${outcome}`);
  if (conclusion === undefined || conclusion === "") return "validation-skipped";
  if (postCount === undefined) return "check-posts";
  return postCount === 0 ? "missing-posts" : "posts-found";
};

const claudeEnabled = (value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(CLAUDE_ENABLED_ERROR);
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
const report = (append, path, outputNotice, message) => {
  summary(append, path, `- ${message}`);
  outputNotice(message);
};

const reportValidationError = (append, summaryPath, outputNotice, error) => {
  if (error instanceof Error) report(append, summaryPath, outputNotice, error.message);
  throw error;
};

const earlyDecisionMessage = (decision) => {
  if (decision === "skipped-cancelled")
    return "Claude actionは実行制御上キャンセル相当でスキップされたため、投稿件数判定は行わず、既存のキャンセル状態を維持します。";
  if (decision === "token-unavailable")
    return "CLAUDE_CODE_OAUTH_TOKEN が利用できないため Claude action は実行されませんでした。claude setup-token でトークンを発行し、リポジトリシークレット CLAUDE_CODE_OAUTH_TOKEN に追加してください。";
  if (decision === "failure")
    return "Claude actionが失敗したため投稿件数判定は対象外です。元stepの失敗を維持します。";
  if (decision === "cancelled")
    return "Claude actionがキャンセルされたため投稿件数判定は行わず、既存のキャンセル状態を維持します。";
  if (decision === "validation-skipped")
    return "Claude actionはworkflow validation skipでした。投稿件数判定は機械では行えません。";
  return undefined;
};

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
    CLAUDE_ENABLED,
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
  let enabled;
  try {
    enabled = claudeEnabled(CLAUDE_ENABLED);
  } catch (error) {
    report(append, summaryPath, outputNotice, CLAUDE_ENABLED_ERROR);
    throw error;
  }
  const decision = reviewCheckDecision({ outcome, enabled, conclusion: CLAUDE_CONCLUSION });
  const message = earlyDecisionMessage(decision);
  if (message !== undefined) {
    report(append, summaryPath, outputNotice, message);
    if (decision === "token-unavailable") throw new Error(message);
    return;
  }
  let repository;
  let prNumber;
  let headSha;
  let since;
  try {
    repository = environment(REPOSITORY, "REPOSITORY");
    prNumber = environment(PR_NUMBER, "PR_NUMBER");
    headSha = environment(HEAD_SHA, "HEAD_SHA");
    since = actionStartedAt(ACTION_STARTED_AT);
  } catch (error) {
    reportValidationError(append, summaryPath, outputNotice, error);
  }
  let count;
  try {
    count = getClaudePostCount(getGhPosts, repository, prNumber, headSha, since);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GitHub API取得に失敗したため投稿件数を判定できない";
    report(append, summaryPath, outputNotice, message);
    throw error;
  }
  summary(append, summaryPath, `- Claude投稿件数: ${count}`);
  summary(append, summaryPath, `- 診断: ${executionDiagnostics(read, EXECUTION_FILE)}`);
  if (
    reviewCheckDecision({ outcome, enabled, conclusion: CLAUDE_CONCLUSION, postCount: count }) ===
    "missing-posts"
  )
    throw new Error(MISSING_CLAUDE_POSTS_ERROR);
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
