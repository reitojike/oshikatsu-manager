import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BOT_LOGIN = "claude[bot]";

export const CLAUDE_ENABLED_ERROR =
  'CLAUDE_ENABLED は "true" または "false" である必要があります。workflow の check step と検知stepの配線を確認してください。';

export const MISSING_CLAUDE_POSTS_ERROR =
  "Claude actionは実行されましたが、対象head以降のclaude[bot]投稿が0件です";

// 「レビューが走っていない」と「走ったがマーカーが無い」を区別する。
// 総評コメントには commit_id が無く本文マーカーだけが根拠なので、モデルが指示を落とすと
// 投稿があっても0件と判定される。どちらも赤にする(fail-closed)が、原因が読めないと
// 再実行すべきか prompt を直すべきかが判断できない。
export const MARKER_MISSING_ERROR =
  "Claude actionは実行され、対象head以降にclaude[bot]の投稿がありますが、head SHAマーカーに一致する投稿が0件です。promptのマーカー指示が守られていない可能性があります";

export const headShaMarker = (headSha) => `<!-- claude-review-head-sha:${headSha} -->`;

// 型(c): 復元対象パスを変更しているのに、`.claude-pr/` を読む手段が --allowedTools に
// 無い状態。レビューが復元後(origin/main)のツリーを見たまま完了しうる
// (レビュー内容の正しさは判定しない。読み取り手段の有無だけを見る)。
export const RESTORED_PATH_GATE_ERROR =
  "このPRは復元対象パスを変更していますが、.claude-pr/ を読む手段(Read(.claude-pr/**)等)が --allowedTools に含まれていません。レビューは復元後(origin/main)のツリーを見たまま完了した可能性があります。";

// allowedToolsはカンマ区切りのツール宣言の並びであり、部分一致では
// `Bash(echo Read(.claude-pr/**))` のようなBashの引数文字列に埋め込まれた
// テキストにも誤って一致する(CodeRabbit実測)。カンマで分割し、宣言1件全体が
// `Read(.claude-pr/...)` の形であることを要求する(先頭・末尾ともにアンカー)。
// `.claude-pr` を含むだけでは `Read(.claude-pr-decoy/**)` のような別パスにも
// 一致するため(matchesRestoredPathが`.claude`と`.claude.json`を区別しているのと
// 同じ境界の問題)、`Read(.claude-pr/` に続くことも要求する。
const CLAUDE_PR_READ_PATTERN = /^Read\(\.claude-pr\/.*\)$/;

export const hasRestoredPathReadAccess = (allowedTools) =>
  allowedTools.split(",").some((entry) => CLAUDE_PR_READ_PATTERN.test(entry.trim()));

// 復元対象パスを変更しているのに読み取り手段が無いときだけ true。呼び出し側は
// この2値しか見ないため、判定を3値(not-applicable/ok/missing-read-access)で
// 返す必要は無い。
export const isRestoredPathGateBlocked = ({ restoredPaths, allowedTools }) =>
  restoredPaths.length > 0 && !hasRestoredPathReadAccess(allowedTools);

// 文字列前提で trim() を呼ぶと、非文字列が来たときTypeErrorになって「空です」に化ける。
// 赤くはなるが原因が読めないので、型ごと明示的に弾く。
const environment = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} が空です`);
  return value;
};

const isBot = (entry) => entry.user?.login === BOT_LOGIN;

const afterStarted = (entry, sinceEpoch) => {
  const created = entry.created_at ?? entry.submitted_at;
  if (typeof created !== "string") return false;
  return Date.parse(created) >= sinceEpoch;
};

// マーカーとcommit_idを一切見ず、そのrunの開始以降にclaude[bot]が何か投稿したかだけを数える。
// 判定には使わない。投稿0件のときに「走っていない」と「マーカーが無い」を切り分けるためだけの値。
export const countBotPostsSince = ({ issueComments, reviews, reviewComments, since }) => {
  const sinceEpoch = Date.parse(since);
  return [issueComments, reviews, reviewComments].reduce(
    (total, entries) =>
      total + entries.filter((entry) => isBot(entry) && afterStarted(entry, sinceEpoch)).length,
    0,
  );
};

export const countClaudePosts = ({ issueComments, reviews, reviewComments, headSha, since }) => {
  const sinceEpoch = Date.parse(since);
  const afterActionStarted = (entry) => afterStarted(entry, sinceEpoch);
  // reviewの commit_id は提出時のheadのまま動かない。
  const isHeadReview = (entry) => entry.commit_id === headSha;
  // review commentの commit_id は、コメントがoutdatedにならない限りGitHubが最新headへ
  // 書き換える。実測(PR #151): 11:48:31Zに作成されたclaude[bot]のreview commentが
  // original_commit_id=b61052c8 のまま commit_id=98b206fe(当時の最新head)を返した。
  // commit_id で固定すると「outdatedでない」しか意味せず、head固定が実質無効になる。
  // 安定しているのは original_commit_id。
  const isHeadReviewComment = (entry) => (entry.original_commit_id ?? entry.commit_id) === headSha;
  const isHeadIssueComment = (entry) =>
    typeof entry.body === "string" && entry.body.includes(headShaMarker(headSha));
  return [
    issueComments.filter(
      (entry) => isBot(entry) && isHeadIssueComment(entry) && afterActionStarted(entry),
    ),
    reviews.filter((entry) => isBot(entry) && isHeadReview(entry) && afterActionStarted(entry)),
    reviewComments.filter(
      (entry) => isBot(entry) && isHeadReviewComment(entry) && afterActionStarted(entry),
    ),
  ].reduce((total, entries) => total + entries.length, 0);
};

// 各分岐の根拠の正本はissue #95(決定3とPO確認のコメント)にある。ここには写さない。
// 判定値ごとの扱いはmain()のearlyDecisionMessageと対応する。
export const reviewCheckDecision = ({ outcome, enabled, conclusion, postCount }) => {
  // 環境値は文字列なので、truthy判定にすると "false" が緑側へ倒れる。boolean厳格にして閉じる。
  if (typeof enabled !== "boolean") {
    throw new Error(
      "reviewCheckDecision の enabled 引数は boolean である必要があります。呼び出し元で環境値を boolean に正規化してください。",
    );
  }
  // skippedの原因は2つある。checkが通ってからのskipは中断であって、トークン欠落ではない。
  // トークン欠落側をfail-closedにするのはPO決定(issue #95 issuecomment-5242167400)。
  if (outcome === "skipped") return enabled === true ? "skipped-cancelled" : "token-unavailable";
  // failureは元stepが既に赤い。同じ事象を二重に赤くしない。
  if (outcome === "failure") return "failure";
  // cancel-in-progressによる世代交代は正常。人工的なfailureを重ねない。
  // ここでexit 0にしても、先行step・job・runに付いたキャンセル状態は反転しない。
  if (outcome === "cancelled") return "cancelled";
  // 公式outcomeは success / failure / cancelled / skipped の4つ。未知値は静かに通さない。
  if (outcome !== "success") throw new Error(`未知のCLAUDE_OUTCOMEです: ${outcome}`);
  // #83のworkflow検証スキップ。注記のみでpassさせるのはissue #95 決定3 (i)の既決
  // (機械では埋められない。判定は参考であり最終判断は人間 —— docs/prd.md 8.6)。
  // 残存リスク: claude-review.yml を変更するPRはここに落ち、Claudeレビューを受けずにcheckが緑になる。
  // 埋め合わせはセルフレビュー + CodeRabbit(Draft中はCopilotが走らないため対象外)で、
  // どれで満たしたかをPR本文に書く(#95の不変条件。.claude/skills/pr-review-flow/SKILL.md「Claude」項)。
  if (conclusion === undefined || conclusion === "") return "validation-skipped";
  if (postCount === undefined) return "check-posts";
  return postCount === 0 ? "missing-posts" : "posts-found";
};

// 欠落や不正値を緑へ倒すと、workflowの配線漏れやoutput名の変更がそのままゲート迂回になる。
// outcomeによらず一律に必須とする。2つの環境値(CLAUDE_ENABLED・CIRCUIT_BREAKER_SKIP)が
// 同じ"true"/"false"厳格パースを要求するため、エラーメッセージだけ呼び出し側で変える。
const booleanEnvironment = (value, errorMessage) => {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(errorMessage);
};

const claudeEnabled = (value) => booleanEnvironment(value, CLAUDE_ENABLED_ERROR);

export const CIRCUIT_BREAKER_SKIP_ERROR =
  'CIRCUIT_BREAKER_SKIP は "true" または "false" である必要があります。workflow の circuit-breaker step と検知stepの配線を確認してください。';

const circuitBreakerSkipEnvironment = (value) =>
  booleanEnvironment(value, CIRCUIT_BREAKER_SKIP_ERROR);

// 直近の実測(#262、PR #260): 同一head SHAへのreview:full再発火が7→10→19件と拒否を
// 単調に増やしながら3回連続で投稿0件になり、3回目は$7.31を無駄にして--max-turns上限で
// 打ち切られた。上限そのものの値の妥当性は#254(フェーズ2)の対象だが、「直っていないのに
// 同じ失敗を繰り返し焼く」こと自体は再実行前に機械的に検知できる。閾値2
// (=3回目の起動を見送る)は、この実測で実際に無駄になった3回目を指す最小値であり、
// AGENTS.mdの「3回試して解決しない」エスカレーション基準とは根拠が別(モデルの試行回数では
// なく、1回あたり最大$7規模のコストを繰り返し焼かないための閾値)。
export const MAX_TOLERATED_CLAUDE_REVIEW_FAILURES = 2;

export const shouldSkipRepeatedFailure = (priorFailureCount) => {
  if (
    typeof priorFailureCount !== "number" ||
    !Number.isInteger(priorFailureCount) ||
    priorFailureCount < 0
  ) {
    throw new Error("priorFailureCount は0以上の整数である必要があります");
  }
  return priorFailureCount >= MAX_TOLERATED_CLAUDE_REVIEW_FAILURES;
};

export const CIRCUIT_BREAKER_TRIPPED_ERROR =
  `直近の同一head SHAでclaude-reviewの投稿確認が既に${MAX_TOLERATED_CLAUDE_REVIEW_FAILURES}回失敗しているため、` +
  "起動を見送りました(コスト超過防止。#262)。docs/pr-review-flow-details.md「赤・無投稿に遭遇した" +
  "ときの見分け方」で原因を切り分けたうえで、原因が特定できていれば再実行せず、" +
  "必要ならclaude-reviewのbypassを検討してください。";

// claude-review.ymlのjob name式(通常runでのcheck名)と同じ文字列。ternary式自体は
// YAML側にしか無くJSからimportできないため、test/unit/claude-review-workflow.test.tsで
// この定数とYAMLのリテラルが一致することを固定する(#262セルフレビュー。値が離れて
// 二重管理になり、片方だけ変わってcircuit breakerが対象を取り違える穴を防ぐ)。
export const CLAUDE_REVIEW_CHECK_NAME = "claude-review";

// GitHub REST APIの `commits/{sha}/check-runs` は既定で filter=latest である
// (CodeRabbit指摘、#262セルフレビュー)。
//
// **`latest` が畳むのは同一workflow runの再試行(`run_attempt`)であって、
// review:full再ラベルが作る別々のworkflow runではない**(PO実測・2026-08-16。
// 別run3件はfilter=latestでも各2件、同一run内の再試行1件のみfilter=latestで
// 1件・filter=allで2件になった。当初この節に書いていた「同一head SHAで過去に
// 何回失敗していても常に1件しか見えない」は誤りだった)。
// **それでもfilter=allが必要な理由は別にある。**
// `docs/pr-review-flow-details.md`の型(b)の対処は「再実行」であり、
// これは`run_attempt`を増やす経路として運用に正規に組み込まれている
// (このPRで追加した但し書き「原因が特定できている場合は再実行しない」の対象外の
// ケース、すなわち原因不明のまま再実行する場合)。**試行ごとに個別に課金される**
// ため、この経路をfilter=latestで畳むと「1回焼いた」としか数えられず、コスト超過
// 防止という本来の目的に反する。check_nameで絞り込む。per_page=100は
// --paginateと併用して複数ページにまたがっても取りこぼさないための上限。
export const checkRunsQuery = (checkName) =>
  new URLSearchParams({ filter: "all", check_name: checkName, per_page: "100" }).toString();

// claude-reviewは同一head SHAに対してreview:fullの付け直しで複数回起動しうる
// (labeled再発火。docs/pr-review-flow-details.md「明示的なレビュー依頼」)。cancelled/skipped等の
// 世代交代は「直っていないのに同じ失敗を繰り返す」ことを意味しないため対象に含めない
// (conclusion === "failure" のみを数える)。
export const countPriorFailures = (checkRuns, { name, headSha }) =>
  checkRuns.filter(
    (run) =>
      hasProperty(run, "name") &&
      run.name === name &&
      hasProperty(run, "head_sha") &&
      run.head_sha === headSha &&
      hasProperty(run, "conclusion") &&
      run.conclusion === "failure",
  ).length;

// 形式を検証しないと、配線を間違えて head_ref(ブランチ名)やPR番号でない値を渡しても
// 「投稿0件」または「マーカー不一致」として赤くなり、原因が入力側だと読めない。
// ACTION_STARTED_AT に regex + Date.parse ガードを置いたのと同じ理由。
const headShaEnvironment = (value) => {
  const headSha = environment(value, "HEAD_SHA");
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error("HEAD_SHA は40桁の小文字16進数である必要があります");
  }
  return headSha;
};

const prNumberEnvironment = (value) => {
  const prNumber = environment(value, "PR_NUMBER");
  if (!/^[1-9]\d*$/.test(prNumber)) {
    throw new Error("PR_NUMBER は正の整数である必要があります");
  }
  return prNumber;
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

// getGhPosts/getCheckRuns で共有するfetch部分。差はflatten方法だけなので、
// gh呼び出しそのもの(オプション・引数)は1か所にまとめる。
/** @param {string} path @param {GhExecutor} execute */
const fetchGhPages = (path, execute) =>
  JSON.parse(execute("gh", ["api", "--paginate", "--slurp", path], GH_OPTIONS));

/** @param {string} path @param {GhExecutor} execute */
export const getGhPosts = (path, execute = execFileSync) =>
  flattenGhPages(fetchGhPages(path, execute));

const hasProperty = (value, property) =>
  typeof value === "object" && value !== null && Object.hasOwn(value, property);

// commits/{sha}/check-runs はページごとに {total_count, check_runs: []} を返す
// (issues/comments 等のフラット配列とは形が違うため、flattenGhPages を流用しない)。
export const flattenCheckRunPages = (pages) => {
  if (!Array.isArray(pages)) {
    throw new Error("gh api --paginate --slurp の出力は配列である必要があります");
  }
  return pages.flatMap((page) => {
    if (!hasProperty(page, "check_runs") || !Array.isArray(page.check_runs)) {
      throw new Error("check-runsページはcheck_runs配列を含む必要があります");
    }
    return page.check_runs;
  });
};

/** @param {string} path @param {GhExecutor} execute */
export const getCheckRuns = (path, execute = execFileSync) =>
  flattenCheckRunPages(fetchGhPages(path, execute));

// maxBuffer超過時のcodeは呼び出したAPIで変わる。実測(Node v24):
// 同期(execFileSync)は Error / "ENOBUFS"、非同期(execFile)は RangeError /
// "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"。本番は同期側だけを通るが、CIのNode版とOSでの
// 同期側の値は未実測なので、片方に決め打たず両方を容量超過として扱う。
// 取り違えると容量超過が汎用メッセージへ落ちる(赤くはなるが原因が読めない)。
const MAX_BUFFER_ERROR_CODES = new Set(["ENOBUFS", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"]);

const isBufferError = (error) =>
  hasProperty(error, "code") && MAX_BUFFER_ERROR_CODES.has(error.code);

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

// 取得は1回だけ行い、厳格な件数と切り分け用の件数の両方を同じ応答から出す。
// 2回取得すると、その間に投稿が増えて2つの値が食い違う。
const getClaudePostCounts = (getPosts, repository, prNumber, headSha, since) => {
  const base = `repos/${repository}/pulls/${prNumber}`;
  const issueCommentsPath = `repos/${repository}/issues/${prNumber}/comments?since=${encodeURIComponent(since)}`;
  const reviewsPath = `${base}/reviews`;
  const reviewCommentsPath = `${base}/comments?since=${encodeURIComponent(since)}`;
  const posts = {
    issueComments: getGhPostsOrThrow(getPosts, issueCommentsPath),
    reviews: getGhPostsOrThrow(getPosts, reviewsPath),
    reviewComments: getGhPostsOrThrow(getPosts, reviewCommentsPath),
  };
  return {
    matched: countClaudePosts({ ...posts, headSha, since }),
    botPostsSince: countBotPostsSince({ ...posts, since }),
  };
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

// 空文字列は「復元対象パスの変更なし」として許容する(他の必須環境値と違い、
// 非該当が正当な値であるため)。型のみ厳格に見る。
const restoredPathsEnvironment = (value, name) => {
  if (typeof value !== "string") throw new Error(`${name} は文字列である必要があります`);
  return value.trim() === "" ? [] : value.split(",");
};

const restoredPathGateEnvironment = (restoredPathsValue, allowedToolsValue) => ({
  restoredPaths: restoredPathsEnvironment(restoredPathsValue, "RESTORED_PATHS"),
  allowedTools: environment(allowedToolsValue, "ALLOWED_TOOLS"),
});

// レビューが実際に走ったか・投稿したかに関係なく判定できる静的な設定チェックのため、
// 呼び出し元(main)の2箇所——validation-skipped分岐と通常のverifyPosts経路——で共有する。
const throwIfRestoredPathGateBlocked = (restoredPathGate, append, summaryPath, outputNotice) => {
  if (!isRestoredPathGateBlocked(restoredPathGate)) return;
  report(append, summaryPath, outputNotice, RESTORED_PATH_GATE_ERROR);
  throw new Error(RESTORED_PATH_GATE_ERROR);
};

// validation-skipped(claude-review.yml自体を変更するPR)はレビューが1回も走らず従来は
// 注記のみで緑になる。ただし復元対象パスを変更しているのにallowedToolsの読み取り手段が
// 欠落している状態は、レビューの実行結果に関係なく静的に判定できるため、この分岐でも検知する。
// 素通りするとallowedToolsの配線ミスをこの回だけ検知できない(#229 型(c)。実測で見つかった穴)。
const checkRestoredPathGateOnValidationSkipped = (env, append, summaryPath, outputNotice) => {
  let restoredPathGate;
  try {
    restoredPathGate = restoredPathGateEnvironment(env.RESTORED_PATHS, env.ALLOWED_TOOLS);
  } catch (error) {
    reportValidationError(append, summaryPath, outputNotice, error);
  }
  throwIfRestoredPathGateBlocked(restoredPathGate, append, summaryPath, outputNotice);
};

// 取得・件数summary・失敗判定をmainから切り出す。判定の順序は変えない。
const verifyPosts = ({
  outcome,
  enabled,
  conclusion,
  executionFile,
  target,
  io,
  restoredPathGate,
}) => {
  const { repository, prNumber, headSha, since } = target;
  const { getGhPosts, append, read, outputNotice, summaryPath } = io;
  let counts;
  try {
    counts = getClaudePostCounts(getGhPosts, repository, prNumber, headSha, since);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GitHub API取得に失敗したため投稿件数を判定できない";
    report(append, summaryPath, outputNotice, message);
    throw error;
  }
  summary(append, summaryPath, `- Claude投稿件数: ${counts.matched}`);
  // review:full運用のコスト確認用(#244)。summary()だけだとGITHUB_STEP_SUMMARYにしか
  // 残らずAPIで取得できないため、report()でnoticeにも出しCheck Runs Annotations API
  // (`gh api repos/{owner}/{repo}/check-runs/{id}/annotations`)から機械参照できるようにする。
  report(append, summaryPath, outputNotice, `診断: ${executionDiagnostics(read, executionFile)}`);
  summary(
    append,
    summaryPath,
    `- 復元対象パス: ${restoredPathGate.restoredPaths.join(", ") || "無し"}`,
  );
  // 投稿の有無によらず判定する。投稿があっても、復元後のツリーを見たまま書かれた
  // 可能性を消せないため(#229 型(c))。
  throwIfRestoredPathGateBlocked(restoredPathGate, append, summaryPath, outputNotice);
  if (
    reviewCheckDecision({ outcome, enabled, conclusion, postCount: counts.matched }) !==
    "missing-posts"
  )
    return;
  // 判定は厳格側のまま。切り分け用の件数で原因表示だけを変える。
  const failure = counts.botPostsSince > 0 ? MARKER_MISSING_ERROR : MISSING_CLAUDE_POSTS_ERROR;
  report(append, summaryPath, outputNotice, failure);
  throw new Error(failure);
};

// circuit-breaker step(pre-check)が投稿確認stepへ渡す判定を検証してthrowする。
// skip=trueの場合、claude actionは--allowedToolsを一切消費せずskipされているため、
// 以降の投稿件数判定(GitHub API呼び出しを伴う)を行わずここで打ち切る。
const checkCircuitBreakerOrThrow = (circuitBreakerSkipValue, append, summaryPath, outputNotice) => {
  let circuitBreakerSkip;
  try {
    circuitBreakerSkip = circuitBreakerSkipEnvironment(circuitBreakerSkipValue);
  } catch (error) {
    report(append, summaryPath, outputNotice, CIRCUIT_BREAKER_SKIP_ERROR);
    throw error;
  }
  if (circuitBreakerSkip) {
    report(append, summaryPath, outputNotice, CIRCUIT_BREAKER_TRIPPED_ERROR);
    throw new Error(CIRCUIT_BREAKER_TRIPPED_ERROR);
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
    RESTORED_PATHS,
    ALLOWED_TOOLS,
    CIRCUIT_BREAKER_SKIP,
  } = env;
  // この2つだけはreport()を通さず直接throwする。summaryの出力先が確定する前なので、
  // 構造上どこにも書けない。以降の検証失敗はすべてsummaryとnoticeに残す
  // (required checkに配線された後は、失敗理由をログではなくStep Summaryで追うため)。
  const outcome = environment(CLAUDE_OUTCOME, "CLAUDE_OUTCOME");
  const summaryPath = environment(GITHUB_STEP_SUMMARY, "GITHUB_STEP_SUMMARY");
  let enabled;
  try {
    enabled = claudeEnabled(CLAUDE_ENABLED);
  } catch (error) {
    report(append, summaryPath, outputNotice, CLAUDE_ENABLED_ERROR);
    throw error;
  }
  // tokenが無ければどのみちclaude actionは動かないため、circuit breakerの判定より
  // token不足のメッセージを優先する(#262のセルフレビューで発覚。token不足のまま
  // 失敗が積み重なると、以降の実行がすべて「circuit breaker発動」というtoken不足を
  // 覆い隠すメッセージになっていた)。
  if (enabled) checkCircuitBreakerOrThrow(CIRCUIT_BREAKER_SKIP, append, summaryPath, outputNotice);
  const decision = reviewCheckDecision({ outcome, enabled, conclusion: CLAUDE_CONCLUSION });
  const message = earlyDecisionMessage(decision);
  if (message !== undefined) {
    report(append, summaryPath, outputNotice, message);
    if (decision === "token-unavailable") throw new Error(message);
    if (decision === "validation-skipped") {
      checkRestoredPathGateOnValidationSkipped(env, append, summaryPath, outputNotice);
    }
    return;
  }
  let repository;
  let prNumber;
  let headSha;
  let since;
  let restoredPathGate;
  try {
    repository = environment(REPOSITORY, "REPOSITORY");
    prNumber = prNumberEnvironment(PR_NUMBER);
    headSha = headShaEnvironment(HEAD_SHA);
    since = actionStartedAt(ACTION_STARTED_AT);
    restoredPathGate = restoredPathGateEnvironment(RESTORED_PATHS, ALLOWED_TOOLS);
  } catch (error) {
    reportValidationError(append, summaryPath, outputNotice, error);
  }
  verifyPosts({
    outcome,
    enabled,
    conclusion: CLAUDE_CONCLUSION,
    executionFile: EXECUTION_FILE,
    target: { repository, prNumber, headSha, since },
    io: { getGhPosts, append, read, outputNotice, summaryPath },
    restoredPathGate,
  });
};

// claude action実行前のcircuit-breaker step本体。同一head SHAへの反復失敗を検知し、
// skip出力をclaude stepの if 条件と投稿確認stepの両方へ渡す(main()側は
// checkCircuitBreakerOrThrowで検証する)。このstep自体の失敗をjob全体の赤に
// 直結させない(下記catch。判定の正本は常に投稿確認stepに一本化する)。
export const preCheckMain = ({ env, getCheckRuns, writeOutput, append, outputNotice }) => {
  const { REPOSITORY, HEAD_SHA, GITHUB_STEP_SUMMARY } = env;
  const summaryPath = environment(GITHUB_STEP_SUMMARY, "GITHUB_STEP_SUMMARY");
  let repository;
  let headSha;
  try {
    repository = environment(REPOSITORY, "REPOSITORY");
    headSha = headShaEnvironment(HEAD_SHA);
  } catch (error) {
    reportValidationError(append, summaryPath, outputNotice, error);
  }
  let checkRuns;
  try {
    checkRuns = getCheckRuns(
      `repos/${repository}/commits/${headSha}/check-runs?${checkRunsQuery(CLAUDE_REVIEW_CHECK_NAME)}`,
    );
  } catch (error) {
    // このstep自体はコスト超過対策の補助ゲートであり、レビューの安全性を守るものではない。
    // fail-closedにすると、GitHub API の一時的な不調が初回起動のPRまで巻き込んで
    // claude-reviewを止めてしまう副作用の方が大きいため、取得失敗だけは意図的にfail-open
    // (skip=false)にする。投稿確認step側の各種ゲートはfail-closedのまま変更しない。
    const detail = error instanceof Error ? error.message : "不明なエラー";
    report(
      append,
      summaryPath,
      outputNotice,
      `直近の失敗回数を取得できなかったため、反復失敗チェックをスキップします: ${detail}`,
    );
    writeOutput("skip", "false");
    return;
  }
  const priorFailureCount = countPriorFailures(checkRuns, {
    name: CLAUDE_REVIEW_CHECK_NAME,
    headSha,
  });
  const skip = shouldSkipRepeatedFailure(priorFailureCount);
  writeOutput("skip", skip ? "true" : "false");
  if (skip) report(append, summaryPath, outputNotice, CIRCUIT_BREAKER_TRIPPED_ERROR);
  else summary(append, summaryPath, `- 直近の同一head失敗回数: ${priorFailureCount}`);
};

const writeGithubOutput = (name, value) => {
  appendFileSync(environment(process.env.GITHUB_OUTPUT, "GITHUB_OUTPUT"), `${name}=${value}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.CHECK_MODE === "pre-check") {
      preCheckMain({
        env: process.env,
        getCheckRuns,
        writeOutput: writeGithubOutput,
        append: appendFileSync,
        outputNotice: notice,
      });
    } else {
      main({
        env: process.env,
        getGhPosts,
        append: appendFileSync,
        read: readFileSync,
        outputNotice: notice,
      });
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Claude投稿確認で不明なエラーが発生しました",
    );
    process.exitCode = 1;
  }
}
