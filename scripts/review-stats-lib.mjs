// 面2(issueコメント) / 面3(レビュー本文) / 面4(インラインコメント)からレビュー投稿を集計する。
// 数え方の根拠は Issue #227 本文(「1回の起動」「有効な指摘」の数え方(判断済み))。

export const TARGET_BOTS = [
  "claude[bot]",
  "chatgpt-codex-connector[bot]",
  "coderabbitai[bot]",
  "copilot-pull-request-reviewer[bot]",
];

// 面3レビュー本文1件=1回の起動、とみなせるボット。
// claude[bot]は面3にも登場するが、mcp__github_inline_comment__create_inline_commentで
// インラインコメントを1件投稿するたびに、GitHubがbody空・stateCOMMENTEDのreviewを1件
// 自動生成する副作用がある(実測: PR #219で3件のインラインコメントに対しreviewが3件、
// bodyはすべて空文字)。これを起動として数えると1回の起動が複数回にふくれ上がるため、
// claude[bot]はここに含めない。claude[bot]の起動は常に面2(総評コメント)から数える
// (`.github/workflows/claude-review.yml`が「総評は必ずgh pr commentで投稿」と指示しており、
// 起動のたびに欠かさず面2に現れる)。
export const FACE3_LAUNCH_BOTS = [
  "chatgpt-codex-connector[bot]",
  "coderabbitai[bot]",
  "copilot-pull-request-reviewer[bot]",
];

// 面2で「1回の起動」を表すボット(Issue #227「面2の投稿のうち、レビュー結果であるもの1件=1回」)。
export const FACE2_LAUNCH_BOTS = ["claude[bot]", "chatgpt-codex-connector[bot]"];

export const CLAUDE_REVIEW_MARKER = /<!--\s*claude-review-head-sha:[0-9a-f]{40}\s*-->/;
export const CODEX_REVIEW_PREFIX = "Codex Review:";
export const CODEX_USAGE_LIMIT_TEXT = "You have reached your Codex usage limits";

const isFace2ReviewResult = (login, body) => {
  if (login === "claude[bot]") return CLAUDE_REVIEW_MARKER.test(body);
  if (login === "chatgpt-codex-connector[bot]") return body.startsWith(CODEX_REVIEW_PREFIX);
  return false;
};

// 利用上限メッセージは起動に数えない(Issue #227)。件数は別途 countUsageLimitHits で出す。
export const isUsageLimitMessage = (comment) =>
  comment.user?.login === "chatgpt-codex-connector[bot]" &&
  typeof comment.body === "string" &&
  comment.body.includes(CODEX_USAGE_LIMIT_TEXT);

export const countUsageLimitHits = (issueComments) =>
  issueComments.filter(isUsageLimitMessage).length;

export const collectFace2Launches = (issueComments) =>
  issueComments
    .filter((comment) => FACE2_LAUNCH_BOTS.includes(comment.user?.login))
    .filter((comment) => isFace2ReviewResult(comment.user.login, comment.body ?? ""))
    .map((comment) => ({ bot: comment.user.login, timestamp: comment.created_at }));

// PENDING状態(未submitのレビュー下書き)はsubmitted_atがnullになる。gh apiは認証ユーザー自身の
// PENDINGレビューだけを返す制約があるため通常は起きないが、実行アカウント自身がそのPRに
// レビュー下書きを残していると発生しうる。nullのまま扱うとDate.parse(null)がNaNになり、
// attachFace2Findingsの時系列ソート・窓判定が静かに壊れるため、起動として数える前に弾く。
export const collectFace3Launches = (reviews) =>
  reviews
    .filter((review) => FACE3_LAUNCH_BOTS.includes(review.user?.login))
    .filter((review) => typeof review.submitted_at === "string")
    .map((review) => ({
      bot: review.user.login,
      timestamp: review.submitted_at,
      reviewId: review.id,
    }));

const hasLinkedFinding = (reviewId, reviewComments) =>
  reviewComments.some((comment) => comment.pull_request_review_id === reviewId);

// claude[bot]・chatgpt-codex-connector[bot]の面2起動に、時系列で対応する面4インラインコメントを
// 割り当てる。面3起動として既に数えたreview(claimedReviewIds)に紐づく面4は対象から除く
// (claude[bot]は面3起動を持たないため、claimedReviewIdsは空集合となり、その全インラインコメントが
// ここでの割当対象になる。chatgpt-codex-connector[bot]は面3起動で見つかった指摘のみ面3+面4を使い、
// 面2は指摘0件のときの定型文にしか使わない実装のため、割当対象は通常空になる)。
// 起動の境界は「次の面2起動の直前まで」とし、直後の起動が無ければ以降すべてを対象とする。
export const attachFace2Findings = (face2Launches, reviewComments, claimedReviewIds) => {
  const byBot = new Map();
  for (const launch of face2Launches) {
    const bucket = byBot.get(launch.bot) ?? [];
    bucket.push(launch);
    byBot.set(launch.bot, bucket);
  }
  const result = [];
  for (const [bot, launches] of byBot) {
    const sorted = [...launches].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const pool = reviewComments.filter(
      (comment) =>
        comment.user?.login === bot && !claimedReviewIds.has(comment.pull_request_review_id),
    );
    sorted.forEach((launch, index) => {
      const start = Date.parse(launch.timestamp);
      const end = index + 1 < sorted.length ? Date.parse(sorted[index + 1].timestamp) : Infinity;
      const hasFinding = pool.some((comment) => {
        const posted = Date.parse(comment.created_at);
        return posted >= start && posted < end;
      });
      result.push({ ...launch, hasFinding });
    });
  }
  return result;
};

// PR1件分の { issueComments, reviews, reviewComments } から、ボット別の起動回数と
// 「指摘あり」だった起動回数を集計する。
export const summarizeBotLaunches = ({ issueComments, reviews, reviewComments }) => {
  const face3 = collectFace3Launches(reviews).map((launch) => ({
    ...launch,
    hasFinding: hasLinkedFinding(launch.reviewId, reviewComments),
  }));
  const claimedReviewIds = new Set(face3.map((launch) => launch.reviewId));
  const face2 = attachFace2Findings(
    collectFace2Launches(issueComments),
    reviewComments,
    claimedReviewIds,
  );

  const byBot = new Map(TARGET_BOTS.map((bot) => [bot, { launches: 0, findingLaunches: 0 }]));
  for (const launch of [...face3, ...face2]) {
    const entry = byBot.get(launch.bot);
    entry.launches += 1;
    if (launch.hasFinding) entry.findingLaunches += 1;
  }
  return byBot;
};

// --- 「有効な指摘」(本物の修正)の数え方 ---
//
// `pr-review-flow` skillの分類記録は自由記述のMarkdownで、書式は完全には統一されていない。
// ここでは「**本物の修正...**」のような見出し行の直後に続く番号付きリスト項目だけを数える
// (実例: PR #221コメント「**本物の修正として対応(`32d63ae`)**\n1. ...\n2. ...\n3. ...」)。
// 見出しを伴わず地の文で「〜は本物の修正として対応済み」とだけ書かれているケースは
// 数えられない既知の制約(docs/worktree-policy.md「リポジトリ運用スクリプトの置き場所と正本」
// 第6弾に記載)。有効性の自動判定はしない(既に人間が分類した結果を読み取るだけ)。
export const REAL_FIX_HEADING = /本物の修正/;
const OTHER_CLASSIFICATION_HEADING = /(見送り|誤検知|妥当な(?:nitpick|指摘))/;
const NUMBERED_ITEM = /^\d+\.\s+\S/;

export const countRealFixes = (text) => {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  let count = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (REAL_FIX_HEADING.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && OTHER_CLASSIFICATION_HEADING.test(line)) {
      inSection = false;
      continue;
    }
    if (inSection && NUMBERED_ITEM.test(line)) count += 1;
  }
  return count;
};

export const CLASSIFICATION_VOCABULARY = /(本物の修正|見送り|誤検知|妥当な(?:nitpick|指摘))/;

// 分類記録は人間(PO/実装者)が書くものなので、対象ボット自身の投稿は探索対象から除く。
export const summarizeClassification = ({ prBody, issueComments, botLogins }) => {
  const humanTexts = [
    prBody ?? "",
    ...issueComments
      .filter((comment) => !botLogins.includes(comment.user?.login))
      .map((comment) => comment.body ?? ""),
  ];
  const hasRecord = humanTexts.some((text) => CLASSIFICATION_VOCABULARY.test(text));
  const realFixCount = humanTexts.reduce((sum, text) => sum + countRealFixes(text), 0);
  return { hasRecord, realFixCount };
};

export const summarizePr = ({ prNumber, prBody, issueComments, reviews, reviewComments }) => {
  const botStats = summarizeBotLaunches({ issueComments, reviews, reviewComments });
  const classification = summarizeClassification({ prBody, issueComments, botLogins: TARGET_BOTS });
  return {
    prNumber,
    bots: Object.fromEntries(botStats),
    codexUsageLimitHits: countUsageLimitHits(issueComments),
    realFixCount: classification.realFixCount,
    hasClassificationRecord: classification.hasRecord,
  };
};

export const aggregate = (perPr) => {
  const totals = new Map(TARGET_BOTS.map((bot) => [bot, { launches: 0, findingLaunches: 0 }]));
  let totalRealFixes = 0;
  let totalUsageLimitHits = 0;
  let prsWithoutRecord = 0;
  for (const pr of perPr) {
    for (const bot of TARGET_BOTS) {
      const entry = totals.get(bot);
      entry.launches += pr.bots[bot].launches;
      entry.findingLaunches += pr.bots[bot].findingLaunches;
    }
    totalRealFixes += pr.realFixCount;
    totalUsageLimitHits += pr.codexUsageLimitHits;
    if (!pr.hasClassificationRecord) prsWithoutRecord += 1;
  }
  const prCount = perPr.length;
  const perBot = Object.fromEntries(
    TARGET_BOTS.map((bot) => {
      const { launches, findingLaunches } = totals.get(bot);
      return [
        bot,
        {
          launches,
          launchesPerPr: prCount === 0 ? 0 : launches / prCount,
          findingRate: launches === 0 ? 0 : findingLaunches / launches,
        },
      ];
    }),
  );
  return { prCount, perBot, totalRealFixes, totalUsageLimitHits, prsWithoutRecord };
};

export const formatPrLine = (pr) => {
  const botPart = TARGET_BOTS.map(
    (bot) => `${bot}:${pr.bots[bot].launches}起動/${pr.bots[bot].findingLaunches}指摘あり`,
  ).join(" ");
  const realFixPart = pr.hasClassificationRecord
    ? `本物の修正:${pr.realFixCount}件`
    : "分類記録なし";
  return `PR#${pr.prNumber} ${botPart} ${realFixPart} Codex利用上限到達:${pr.codexUsageLimitHits}件`;
};

export const formatSummary = (summary) => {
  const lines = [`対象PR数: ${summary.prCount}`];
  for (const bot of TARGET_BOTS) {
    const stat = summary.perBot[bot];
    lines.push(
      `${bot}: 起動${stat.launches}回 (1PRあたり${stat.launchesPerPr.toFixed(2)}回) 指摘あり率${(stat.findingRate * 100).toFixed(1)}%`,
    );
  }
  lines.push(`本物の修正 合計: ${summary.totalRealFixes}件`);
  lines.push(`Codex利用上限到達 合計: ${summary.totalUsageLimitHits}件`);
  lines.push(`分類記録なしPR数: ${summary.prsWithoutRecord}`);
  return lines.join("\n");
};

export const filterMergedSince = (prs, since) => {
  const sinceEpoch = Date.parse(`${since}T00:00:00Z`);
  return prs.filter(
    (pr) => typeof pr.mergedAt === "string" && Date.parse(pr.mergedAt) >= sinceEpoch,
  );
};

const parseSinceValue = (remaining) => {
  const value = remaining.shift();
  if (value === undefined || value.startsWith("--")) throw new Error("--since requires a value");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("--since must be YYYY-MM-DD");
  return value;
};

const parsePrValue = (remaining) => {
  const value = remaining.shift();
  if (value === undefined || !/^[1-9]\d*$/.test(value))
    throw new Error("--pr requires a positive integer");
  return Number(value);
};

const parseRepoValue = (remaining) => {
  const value = remaining.shift();
  if (value === undefined || value.startsWith("--")) throw new Error("--repo requires a value");
  if (!/^[^/]+\/[^/]+$/.test(value)) throw new Error("--repo must be owner/name");
  return value;
};

export const parseArguments = (args) => {
  let options = { repo: "reitojike/stage-tracker" };
  const remaining = [...args];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--since") options = { ...options, since: parseSinceValue(remaining) };
    else if (argument === "--pr") options = { ...options, pr: parsePrValue(remaining) };
    else if (argument === "--repo") options = { ...options, repo: parseRepoValue(remaining) };
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.since === undefined && options.pr === undefined)
    throw new Error("either --since or --pr is required");
  if (options.since !== undefined && options.pr !== undefined)
    throw new Error("--since and --pr are mutually exclusive");
  return options;
};
