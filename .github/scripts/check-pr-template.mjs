// 何を守っているか:
// Draft前セルフレビュー(issue #81)の記入漏れを検知する。記入内容が真実かは検証できないが、
// セクション自体が欠けている・必須項目が空のPRは止める(issue #81「軽量な必須チェック」)。

const body = process.env.PR_BODY ?? "";

const sectionMatch = body.match(/##\s*Draft前セルフレビュー([\s\S]*?)(?=\n##\s|$)/);
if (!sectionMatch) {
  console.error("PR本文に「## Draft前セルフレビュー」セクションが見つかりません。");
  console.error(".github/pull_request_template.md を参照して記入してください。");
  process.exit(1);
}
const section = sectionMatch[1];

const REQUIRED_LABELS = [
  "実施主体",
  "レビュー対象リビジョン",
  "結果",
  "指摘と処置",
  "静的解析でのフォローアップ有無",
];

// トップレベルの箇条書き(行頭が "- ")だけを項目境界として扱う。
// インデントされたネスト行(例: 指摘一覧の子項目)は直前のラベルの内容として蓄積する。
const fields = new Map();
let currentLabel = null;
let currentLines = [];

const flush = () => {
  if (currentLabel !== null) {
    fields.set(currentLabel, currentLines.join("\n").trim());
  }
  currentLabel = null;
  currentLines = [];
};

for (const line of section.split("\n")) {
  const bulletBodyMatch = line.match(/^-(.*)$/);
  // "**実施主体**:" "**実施主体：**" のいずれもMarkdown強調装飾を剥がしてから照合する。
  // 装飾はラベルの周囲にしか現れない前提で、行全体から "**" を除去してから分割する。
  const rest = bulletBodyMatch?.[1]?.replaceAll("**", "").trimStart();
  if (rest !== undefined) {
    // トップレベルの箇条書きは、必須ラベルに一致するかどうかに関わらず常に項目境界とする。
    // 一致しない場合(例: "- メモ:")でも直前の必須フィールドへ取り込んではいけない
    // (取り込むと、空の必須項目が後続の無関係な箇条書きで非空に化けてすり抜ける)。
    flush();
    const colonIndex = rest.search(/[:：]/);
    const label = (colonIndex === -1 ? rest : rest.slice(0, colonIndex)).trim();
    if (REQUIRED_LABELS.includes(label)) {
      currentLabel = label;
      const content = colonIndex === -1 ? "" : rest.slice(colonIndex + 1).trim();
      currentLines = content ? [content] : [];
    }
    continue;
  }
  if (currentLabel !== null) {
    currentLines.push(line);
  }
}
flush();

const missing = ["実施主体", "レビュー対象リビジョン", "静的解析でのフォローアップ有無"].filter(
  (label) => !fields.get(label),
);
if (missing.length > 0) {
  console.error(`「Draft前セルフレビュー」セクションの次の項目が空です: ${missing.join("、")}`);
  process.exit(1);
}

const resultText = (fields.get("結果") ?? "").trim();
// .github/pull_request_template.md の初期値そのもの(未選択のプレースホルダー)を弾く。
// これを弾かないと「結果」の部分一致が先頭の「指摘なし」に誤って一致してしまう。
if (resultText === "指摘なし / 指摘あり") {
  console.error(
    "「結果」がテンプレートの初期値のまま(未選択)です。指摘なし・指摘ありのいずれかを選んでください。",
  );
  process.exit(1);
}
const resultMatch = resultText.match(/^(指摘なし|指摘あり)/);
if (!resultMatch) {
  console.error("「結果」に指摘なし・指摘ありのいずれかが記載されていません。");
  process.exit(1);
}

if (resultMatch[1] === "指摘あり" && !fields.get("指摘と処置")) {
  console.error("結果が「指摘あり」ですが、指摘と処置の記載が空です。");
  process.exit(1);
}

console.log("OK: 「Draft前セルフレビュー」セクションの記入を確認しました。");
