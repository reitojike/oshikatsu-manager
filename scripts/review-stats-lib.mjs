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
//
// 窓の向きは「このLaunchの直前」であって「直後」ではない。claude[bot]はインラインコメントを
// 個々の指摘ごとに先に投稿してから、まとめの総評コメント(面2)を最後に投稿する
// (`.github/workflows/claude-review.yml`のprompt指示の順序どおり)。実測(PR #219): 総評コメントの
// created_atは16:29:54Zだが、同じラウンドのインラインコメントは16:29:25Z(29秒前)に投稿されている。
// 次の総評は16:57:26Zで、直前のインラインコメント2件(16:57:05Z/16:57:09Z)を回収する。
// (claude-reviewの指摘で判明。当初は逆向き(直後まで)で実装しており、実データでは
// 起動と指摘の対応が体系的にずれていた。)
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
      const end = Date.parse(launch.timestamp);
      const start = index > 0 ? Date.parse(sorted[index - 1].timestamp) : -Infinity;
      const hasFinding = pool.some((comment) => {
        const posted = Date.parse(comment.created_at);
        return posted > start && posted <= end;
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
//
// 見出し判定は行頭(先頭の見出し記号`#`・太字`**`のみ許容)に限定する。単に「本物の修正」という
// 語を含むだけの行(番号付きリストの説明文、この定数自体の説明コメントなど)まで見出しと誤認すると、
// その行がREAL_FIX_HEADINGに無条件優先でマッチしてcontinueするため、同じ行に閉じ語(見送り/誤検知)が
// 同居していてもセクションが閉じず、後続の無関係な番号付き項目まで数えてしまう
// (claude-reviewの指摘・PR #230本文自身で再現: 「1. ...→本物の修正として対応」の行が見出し扱いされ
// 素通りし、次の「2. ...本物の修正...→見送り(軽微)」の行もセクションを閉じられず、以降の
// 無関係な番号付き項目まで誤集計された)。
// `#`・`**`のどちらも省略可能にすると、装飾の無い地の文(例:「本物の修正がどれかを
// 判断するのは難しい」)まで行頭一致だけで見出しと誤認しうる(Copilotの指摘、抑制コメント)。
// 実際に観測した分類記録の見出しは常に`**...**`太字か`#`見出しのいずれかで装飾されている
// (装飾なしの例は確認されていない)ため、どちらか一方の装飾を必須にする。
export const REAL_FIX_HEADING = /^(?:#{1,6}\s+|\*\*)本物の修正/;
// 「本物の修正」セクションを閉じる境界は、見送り/誤検知等の分類見出しに限らない。
// Markdown見出し(`#`)や太字見出し(`**...**`)、表の行(`|`始まり)であれば、
// 分類とは無関係な見出し(例: 「## 検証」に続く番号付きのコマンド手順)や、見出しの直後に
// 続く別構造の表でもセクションを閉じる必要がある(Codex Cloudの指摘: 見送り/誤検知だけを
// 閉じ語にすると、それ以外の見出しの下にたまたま番号付きリストがあるだけで誤集計される。
// 表行も閉じ語に含めないと、見出しセクションが閉じないまま続く独立した表がセクション内の
// 地の文として誤って未パース扱いされる。claude-reviewの指摘・2026-08-14、4巡目)。
const SECTION_CLOSER = /^#{1,6}\s|^\*\*|^\|/;
const NUMBERED_ITEM = /^\d+\.\s+\S/;

// 「本物の修正」という語自体が行/セルに現れるかどうか(構造の有無を問わない)。
// countRealFixesが0を返しても、この語が存在するなら「記載はあるが構造化されておらず
// 数えられなかった」可能性がある(fail-closed。#243)。誤って「0件」と読まれると、
// 効果測定(#244の削減前後比較など)が実際は判定不能なのに0件で埋まってしまう。
const REAL_FIX_MENTION = /本物の修正/;

// count・hasUnparsedMentionを行(項目)単位で返す。加えて、この関数が実際に扱った行の
// 番号をcoveredLinesとして返す(見出し行・セクション内の行)。「本物の修正」セクション内に
// 番号付きリスト項目として認識できない行(地の文の注記等)があり、かつその行自体にも
// 「本物の修正」という語が含まれる場合は、その行を「言及はあるが構造化できなかった」
// ものとして拾う(claude-reviewの指摘・2026-08-14: テキスト単位の判定では、同じテキスト
// 内の他の行が正しく数えられていると、この行の未パースが握りつぶされていた)。
const countHeadingListRealFixes = (text) => {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  let count = 0;
  let hasUnparsedMention = false;
  const coveredLines = new Set();
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (REAL_FIX_HEADING.test(line)) {
      inSection = true;
      coveredLines.add(index);
      return;
    }
    if (inSection && SECTION_CLOSER.test(line)) {
      inSection = false;
      return;
    }
    if (!inSection) return;
    coveredLines.add(index);
    if (NUMBERED_ITEM.test(line)) count += 1;
    else if (line !== "" && REAL_FIX_MENTION.test(line)) hasUnparsedMention = true;
  });
  return { count, hasUnparsedMention, coveredLines };
};

// 表形式の分類記録(実例: PR #225「レビュー巡の記録」)。「分類」列のセル値が
// `本物の修正`単体、または`本物の修正×2`のように乗数を伴う(1回の指摘に複数件の
// 修正が対応する場合の表記。見出し+番号付きリスト形式には無い概念)。`×`の前の空白は
// 許容する(`本物の修正 ×2`のような表記ゆれも数える。/code-reviewのセルフレビューで発見)。
// セル全体を検証し前方一致では終わらせない(CodeRabbitの指摘・2026-08-14):
// 前方一致だと「本物の修正が必要か再検討中」のような未確定の地の文も1件と誤集計し、
// realFixUnparsableのfail-closedも骨抜きになる(誤集計でcountが非ゼロになるため)。
// 1本の正規表現(`\s*`を複数隣接させた前後オプション)でセル全体を検証すると
// sonarjs/super-linear-regexに引っかかる(バックトラックの組み合わせ数が入力長に対し
// 超線形になりうる)ため、prefix切り出し→残り部分の単純判定という手続き的な形に分ける。
const REAL_FIX_PREFIX = /^\*{0,2}本物の修正/;
const REAL_FIX_MULTIPLIER = /^×(\d+)$/;
const REAL_FIX_ANNOTATION = /^\(([^)]*)\)$/;
const TABLE_SEPARATOR_ROW = /^\|[\s|:-]+\|$/;

// Markdownの表はセル内に`\|`でエスケープしたパイプを含められる。単純な`split("|")`だと
// そのセルが2つに割れてしまい、以降のセルが1つずつ右へずれる。ずれた状態で
// classificationColumnIndexを適用すると「分類」列と違うセルを読んでしまい、fail-closedの
// 前提(分類列を正しく特定できていること)が崩れる(Codex Cloudの指摘・2026-08-14)。
// 直前の1文字だけを見る固定長lookbehind(`/(?<!\\)\|/`)は、連続する偶数個の
// バックスラッシュ(バックスラッシュ自体がエスケープされ、後続のパイプはエスケープ
// されていない)を誤って「エスケープされたパイプ」と判定してしまう(CodeRabbitの指摘・
// 2026-08-14: `C:\\|` のような2連続バックスラッシュのケース)。連続するバックスラッシュの
// 個数の偶奇でパイプの意味が変わるため、正規表現ではなく1文字ずつ数える手続きにする。
const splitTableRow = (line) => {
  const cells = [];
  let cell = "";
  let backslashRun = 0;
  for (const char of line) {
    if (char === "|" && backslashRun % 2 === 0) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
    backslashRun = char === "\\" ? backslashRun + 1 : 0;
  }
  cells.push(cell.trim());
  return cells;
};

// 括弧の中身を問わず1件と数めると、「(要検討)」「(保留)」のようなまだ確定していない
// ことを示す注記まで無条件に1件扱いになり、fail-closedの効果がこの経路だけ効かなくなる
// (CodeRabbitの指摘・2026-08-14)。実際に観測された確定表記だけを許可リストにする。
// 新しい確定表記が実際に使われたら、ここに追加する。
const KNOWN_ANNOTATIONS = new Set(["自己訂正"]);

// PO/実装者が実際に書いている形(実例: PR #225「本物の修正」「本物の修正×2」
// 「本物の修正(自己訂正)」)だけを1件として数える。それ以外の後置(地の文の継続、
// 未知の注記など)は「本物の修正」への言及はあるが構造化できなかったものとして0を返す
// (呼び出し元がrealFixUnparsableの判定に使う)。
const parseRealFixCell = (rawCell) => {
  const prefixMatch = REAL_FIX_PREFIX.exec(rawCell);
  if (prefixMatch === null) return 0;
  let rest = rawCell.slice(prefixMatch[0].length).trim();
  if (rest.endsWith("**")) rest = rest.slice(0, -2).trim();
  if (rest === "") return 1;
  const multiplierMatch = REAL_FIX_MULTIPLIER.exec(rest);
  if (multiplierMatch !== null) return Number(multiplierMatch[1]);
  const annotationMatch = REAL_FIX_ANNOTATION.exec(rest);
  if (annotationMatch !== null && KNOWN_ANNOTATIONS.has(annotationMatch[1])) return 1;
  return 0;
};

// 「分類」列だけを対象にする(全セルを無条件に走査しない)。ヘッダ行から「分類」列の
// 位置を特定し、以降のデータ行はその列だけを見る。全セル走査だと、指摘概要・対応列に
// たまたま「本物の修正」で始まる説明文があるだけで誤集計する(/code-reviewのセルフレビューで
// 発見。例: 「本物の修正が必要か再検討中」という説明文が分類欄以外にあるケース)。
// 表を抜けた(`|`で始まらない行が来た)ら列位置をリセットし、複数の表が同じテキストに
// あっても取り違えない。セルごとにhasUnparsedMentionも判定する(理由は
// countHeadingListRealFixesと同じ。claude-reviewの指摘・2026-08-14: 同じテキスト内の
// 別の行が正しく数えられていると、この行の未パースが握りつぶされていた)。
// 「分類」列が特定できているデータ行1件を判定する(ヘッダ行・列不明の表は
// countTableRealFixes側でスキップ済み)。ループ本体の分岐を減らすための切り出し。
const parseTableDataRow = (cells, classificationColumnIndex) => {
  const cell = cells[classificationColumnIndex];
  if (cell === undefined) return { count: 0, hasUnparsedMention: false };
  const cellCount = parseRealFixCell(cell);
  return { count: cellCount, hasUnparsedMention: cellCount === 0 && REAL_FIX_MENTION.test(cell) };
};

const countTableRealFixes = (text) => {
  const lines = text.split(/\r?\n/);
  let count = 0;
  let hasUnparsedMention = false;
  let classificationColumnIndex = null;
  let headerCellCount = null;
  const coveredLines = new Set();
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line.startsWith("|")) {
      classificationColumnIndex = null;
      headerCellCount = null;
      return;
    }
    if (TABLE_SEPARATOR_ROW.test(line)) {
      coveredLines.add(index);
      return;
    }
    const cells = splitTableRow(line);
    if (classificationColumnIndex === null) {
      classificationColumnIndex = cells.indexOf("分類");
      headerCellCount = cells.length;
      coveredLines.add(index);
      return;
    }
    // 「分類」列が見つからない表(=分類記録の表として認識できない)のデータ行は
    // coveredLinesに入れない。ここでcoveredLines扱いにすると、行のどこかに
    // 「本物の修正」への言及があっても構造化できないまま握りつぶされ、
    // analyzeRealFixesの全体フォールバック走査(下記)からも除外されてしまう
    // (claude-reviewの指摘・2026-08-14、5巡目)。列不明の表は全体フォールバックに委ねる。
    if (classificationColumnIndex === -1) return;
    // データ行のセル数がヘッダと一致しない(列の書き忘れ・余分な`|`混入などの現実的な
    // タイポ)場合も同様にcoveredLinesへ入れない。ヘッダ基準のclassificationColumnIndexを
    // セル数の違う行にそのまま適用すると、無関係な別のセルを「分類」列として読んでしまい、
    // 実際にある「本物の修正」への言及が判定不能にすら上がらず握りつぶされる
    // (claude-reviewの指摘・2026-08-14、6巡目)。
    if (cells.length !== headerCellCount) return;
    coveredLines.add(index);
    const row = parseTableDataRow(cells, classificationColumnIndex);
    count += row.count;
    if (row.hasUnparsedMention) hasUnparsedMention = true;
  });
  return { count, hasUnparsedMention, coveredLines };
};

// 見出し+番号付きリストと表、両方の集計を合わせる。count・hasUnparsedMentionとも
// 行(項目)単位で判定した結果を合算するため、一方の形式にだけ未パースな言及があっても
// もう一方の正しく数えられた分に隠れて握りつぶされない。
//
// どちらの構造(本物の修正見出し・`|`で始まる行)にも属さない行は、この2つの走査
// (countHeadingListRealFixes・countTableRealFixes)のどちらからも見過ごされる。
// そのような行自体に「本物の修正」という語があれば、テキスト全体に構造が別途
// 存在するかどうかによらず判定不能として拾う(claude-reviewの指摘・2026-08-14、
// 4巡目。表の外・見出しの外にある地の文の言及が、テキスト内の他の構造の有無で
// 握りつぶされていた)。「分類」列以外のセルは表の走査自体が対象外にしているため
// (3巡目で修正済み)、ここでの再走査でも拾わない。
const analyzeRealFixes = (text) => {
  const lines = text.split(/\r?\n/);
  const heading = countHeadingListRealFixes(text);
  const table = countTableRealFixes(text);
  let hasUnparsedMention = heading.hasUnparsedMention || table.hasUnparsedMention;
  if (!hasUnparsedMention) {
    hasUnparsedMention = lines.some((rawLine, index) => {
      if (heading.coveredLines.has(index) || table.coveredLines.has(index)) return false;
      const line = rawLine.trim();
      return line !== "" && REAL_FIX_MENTION.test(line);
    });
  }
  return { count: heading.count + table.count, hasUnparsedMention };
};

export const countRealFixes = (text) => analyzeRealFixes(text).count;

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
  const perText = humanTexts.map((text) => analyzeRealFixes(text));
  const realFixCount = perText.reduce((sum, entry) => sum + entry.count, 0);
  const realFixUnparsable = perText.some((entry) => entry.hasUnparsedMention);
  return { hasRecord, realFixCount, realFixUnparsable };
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
    realFixUnparsable: classification.realFixUnparsable,
  };
};

export const aggregate = (perPr) => {
  const totals = new Map(TARGET_BOTS.map((bot) => [bot, { launches: 0, findingLaunches: 0 }]));
  let totalRealFixes = 0;
  let totalUsageLimitHits = 0;
  let prsWithoutRecord = 0;
  let prsWithUnparsableRealFix = 0;
  for (const pr of perPr) {
    for (const bot of TARGET_BOTS) {
      const entry = totals.get(bot);
      entry.launches += pr.bots[bot].launches;
      entry.findingLaunches += pr.bots[bot].findingLaunches;
    }
    totalRealFixes += pr.realFixCount;
    totalUsageLimitHits += pr.codexUsageLimitHits;
    if (!pr.hasClassificationRecord) prsWithoutRecord += 1;
    if (pr.realFixUnparsable) prsWithUnparsableRealFix += 1;
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
  return {
    prCount,
    perBot,
    totalRealFixes,
    totalUsageLimitHits,
    prsWithoutRecord,
    prsWithUnparsableRealFix,
  };
};

const formatRealFixPart = (pr) => {
  if (!pr.hasClassificationRecord) return "分類記録なし";
  if (pr.realFixUnparsable) return "本物の修正:判定不能";
  return `本物の修正:${pr.realFixCount}件`;
};

export const formatPrLine = (pr) => {
  const botPart = TARGET_BOTS.map(
    (bot) => `${bot}:${pr.bots[bot].launches}起動/${pr.bots[bot].findingLaunches}指摘あり`,
  ).join(" ");
  return `PR#${pr.prNumber} ${botPart} ${formatRealFixPart(pr)} Codex利用上限到達:${pr.codexUsageLimitHits}件`;
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
  lines.push(`本物の修正 判定不能PR数: ${summary.prsWithUnparsableRealFix}`);
  return lines.join("\n");
};

export const filterMergedSince = (prs, since) => {
  const sinceEpoch = Date.parse(`${since}T00:00:00Z`);
  return prs.filter(
    (pr) => typeof pr.mergedAt === "string" && Date.parse(pr.mergedAt) >= sinceEpoch,
  );
};

// gh pr list の1回の呼び出しで返せる上限。到達したら「取りこぼしがあるかもしれない」を
// fail-closedで報告する(gh-project-lib.mjsのPROJECT_ITEM_LIMIT/getProjectItemと同じ考え方。
// claude-reviewの指摘: 同型の上限判定なのに、あちらはpure関数として切り出されテストされている
// のに対し、こちらはCLIエントリのI/O呼び出しに埋め込まれておりテストが無かった)。
export const PR_LIST_LIMIT = 1000;

export const assertPrListComplete = (prs) => {
  if (prs.length === PR_LIST_LIMIT)
    throw new Error(
      `gh pr list reached the ${PR_LIST_LIMIT}-item limit; results may be incomplete`,
    );
  return prs;
};

// 書式が合っていても存在しない日付はDate.parseで静かに補正されうる
// (例: "2026-02-30" は月末超過分を繰り上げて2026-03-02になり、NaNにならない。
// "2026-13-01" のような範囲外の月はNaNになる)。前者はDate.parseのNaN判定だけでは
// 検出できないため、往復変換(ISO文字列に戻して入力と一致するか)で実在する暦日か確認する。
// 通さないと、filterMergedSinceの比較が全件falseになりエラーも出さず「対象PR数: 0」を
// 返す(CodeRabbitの指摘)。
const isExistingCalendarDate = (value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
};

const parseSinceValue = (remaining) => {
  const value = remaining.shift();
  if (value === undefined || value.startsWith("--")) throw new Error("--since requires a value");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("--since must be YYYY-MM-DD");
  if (!isExistingCalendarDate(value)) throw new Error("--since must be an existing calendar date");
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
