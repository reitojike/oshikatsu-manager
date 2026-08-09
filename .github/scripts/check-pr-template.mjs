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

const resultMatch = section.match(/結果[:：]\s*(指摘なし|指摘あり)/);
if (!resultMatch) {
  console.error(
    "「Draft前セルフレビュー」セクションに結果(指摘なし・指摘あり)の記載がありません。",
  );
  process.exit(1);
}

if (resultMatch[1] === "指摘あり") {
  const findingsMatch = section.match(/指摘と処置[:：]?\s*\n?([\s\S]*)/);
  const findingsText = (findingsMatch?.[1] ?? "").trim();
  if (!findingsText) {
    console.error("結果が「指摘あり」ですが、指摘と処置の記載が空です。");
    process.exit(1);
  }
}

console.log("OK: 「Draft前セルフレビュー」セクションの記入を確認しました。");
