import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(appRoot, "..");
const inputRoot = process.env.CISSP_SUPPLEMENTAL_INPUT || path.resolve(repoRoot, "..", "补充题库");
const outputRoot = path.join(repoRoot, "补充题库整理");
const outJson = path.join(outputRoot, "cissp_supplemental_questions_zh_app.json");
const outCsv = path.join(outputRoot, "cissp_supplemental_questions_zh_app.csv");
const cachePath = path.join(outputRoot, "translation_cache_supplemental.json");
const summaryPath = path.join(outputRoot, "summary.json");

const domains = {
  D1: { name: "Security and Risk Management", nameCn: "安全与风险管理" },
  D2: { name: "Asset Security", nameCn: "资产安全" },
  D3: { name: "Security Architecture and Engineering", nameCn: "安全架构和工程设计" },
  D4: { name: "Communication and Network Security", nameCn: "通信和网络安全" },
  D5: { name: "Identity and Access Management", nameCn: "身份识别访问管理" },
  D6: { name: "Security Assessment and Testing", nameCn: "安全评估和测试" },
  D7: { name: "Security Operations", nameCn: "安全运营" },
  D8: { name: "Software Development Security", nameCn: "软件开发安全" }
};

const domainAliases = [
  ["D1", /security and risk|risk management|governance|ethic|legal|compliance|privacy|policy|bcp|business continuity|quantitative|qualitative/i],
  ["D2", /asset security|data classification|data owner|data custodian|privacy control|retention|destruction|media|asset|classification/i],
  ["D3", /architecture|engineering|cryptography|crypto|encryption|physical security|cloud|virtualization|security model|biba|bell|covert|tempest|ics|iot/i],
  ["D4", /communication|network|osi|tcp|udp|vpn|tls|firewall|router|switch|wireless|dns|network attack/i],
  ["D5", /identity|access management|iam|authentication|authorization|sso|federation|kerberos|radius|account|password|biometric|mac|dac|rbac/i],
  ["D6", /assessment|testing|audit|vulnerability|penetration|owasp|test|scan/i],
  ["D7", /operations|incident|forensic|backup|restore|change management|logging|monitoring|disaster|malware|patch/i],
  ["D8", /software|sdlc|secure coding|devsecops|api|application|development|code|supply chain/i]
];

fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(path.join(outputRoot, "raw_cache"), { recursive: true });
const translationCache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};

function text(value = "") {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/✓/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBilingualParenthetical(value = "") {
  const cleaned = text(value).replace(/\s*\([^)]*[\u0100-\u1ef9][^)]*\)/g, "").trim();
  if (/[\u0100-\u1ef9]/.test(cleaned)) {
    const questionMark = cleaned.indexOf("?");
    if (questionMark !== -1) return cleaned.slice(0, questionMark + 1).trim();
  }
  return cleaned;
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function answerKey(indexOrKey) {
  if (typeof indexOrKey === "number") return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[indexOrKey] || "A";
  const raw = String(indexOrKey ?? "").trim();
  if (/^[A-Z]$/i.test(raw)) return raw.toUpperCase();
  const n = Number(raw);
  if (Number.isFinite(n)) return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n - 1] || "A";
  return raw || "A";
}

function inferDomain(input = "") {
  const value = String(input || "");
  const direct = value.match(/\bD([1-8])\b/i) || value.match(/domain\s*([1-8])/i);
  if (direct) return `D${direct[1]}`;
  for (const [id, re] of domainAliases) {
    if (re.test(value)) return id;
  }
  return "D1";
}

function difficultyFromTags(tags = []) {
  const joined = tags.join(" ");
  if (/hard|difficult/i.test(joined)) return "hard";
  if (/easy/i.test(joined)) return "easy";
  return "medium";
}

function makeQuestion({ source, sourceFile, sourceId, domainInput, chapterName, topic, tags = [], difficulty, questionEn, options, correctAnswer, explanationEn, managerMindsetEn }) {
  const domainId = inferDomain(`${domainInput || ""} ${chapterName || ""} ${topic || ""} ${tags.join(" ")} ${questionEn || ""}`);
  const cleanOptions = options.map((value, idx) => ({ key: answerKey(idx), text: text(value) })).filter((opt) => opt.text);
  return {
    id: `SUP-${sourceId}`,
    source,
    sourceFile,
    domainId,
    domainName: domains[domainId].name,
    domainNameCn: domains[domainId].nameCn,
    chapterId: "",
    chapterName: text(chapterName || domains[domainId].name),
    topic: text(topic || chapterName || tags[0] || domains[domainId].name),
    tags: [...new Set([source, ...tags.map(text).filter(Boolean)])],
    difficulty: difficulty || difficultyFromTags(tags),
    questionEn: stripBilingualParenthetical(questionEn),
    questionCn: "",
    options: cleanOptions,
    correctAnswer,
    explanationEn: text(explanationEn || ""),
    explanationCn: "",
    distractorsCn: {},
    managerMindsetEn: text(managerMindsetEn || ""),
    managerMindsetCn: "",
    importedAt: "supplemental-seed"
  };
}

function extractGithubRawLines(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const marker = '"codeViewBlobLayoutRoute.StyledBlob":{"rawLines":';
  const index = html.indexOf(marker);
  if (index === -1) return null;
  const start = index + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(start, i + 1)).join("\n");
      }
    }
  }
  return null;
}

function normalize037g() {
  const raw = extractGithubRawLines(path.join(inputRoot, "cissp_questions.json"));
  if (!raw) return [];
  const data = JSON.parse(raw);
  return data.questions.map((q, idx) => makeQuestion({
    source: "补充题库-037g-cissp_test_sim",
    sourceFile: "cissp_questions.json",
    sourceId: `037G-${idx + 1}`,
    domainInput: q.question,
    chapterName: "GitHub 037g 练习题",
    topic: "综合题库",
    tags: [],
    questionEn: q.question,
    options: Object.values(q.answers || {}),
    correctAnswer: answerKey(q.solution),
    explanationEn: q.explanation || ""
  }));
}

function extractJsArrayAfter(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const arrStart = html.indexOf("[", start);
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = arrStart; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
    } else if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return Function(`"use strict"; return (${html.slice(arrStart, i + 1)});`)();
    }
  }
  return [];
}

function normalizeExamSimulator() {
  const file = path.join(inputRoot, "CISSP_Exam_Simulator.html");
  if (!fs.existsSync(file)) return [];
  const html = fs.readFileSync(file, "utf8");
  const data = extractJsArrayAfter(html, "const BANK=");
  return data.map((q, idx) => makeQuestion({
    source: "补充题库-CISSP-Exam-Simulator",
    sourceFile: "CISSP_Exam_Simulator.html",
    sourceId: `SIM-${idx + 1}`,
    domainInput: `${q.dn || ""} ${q.d || ""}`,
    chapterName: q.d || domains[q.dn]?.name || "",
    topic: q.d || domains[q.dn]?.name || "",
    tags: [q.dn, q.d].filter(Boolean),
    difficulty: "medium",
    questionEn: q.q,
    options: q.o || [],
    correctAnswer: answerKey(q.a ?? 0),
    explanationEn: q.e
  }));
}

function normalizeCisspPrep() {
  const file = path.join(inputRoot, "cissp-prep-main", "questions.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return data.map((q, idx) => makeQuestion({
    source: "补充题库-cissp-prep",
    sourceFile: "cissp-prep-main/questions.json",
    sourceId: `PREP-${q.id || idx + 1}`,
    domainInput: `D${q.domain} ${q.subdomain} ${q.guide_section || ""}`,
    chapterName: q.guide_section || q.subdomain,
    topic: q.subdomain || q.tags?.[0],
    tags: q.tags || [],
    difficulty: q.difficulty,
    questionEn: q.stem,
    options: q.choices || [],
    correctAnswer: answerKey(q.correct ?? 0),
    explanationEn: q.explanation,
    managerMindsetEn: q.notes
  }));
}

function normalizeCisspQuiz() {
  const dir = path.join(inputRoot, "cissp-quiz-main");
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file !== "package.json" && file !== "package-lock.json")
    .sort();
  const results = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (!Array.isArray(data)) continue;
    data.forEach((q, idx) => {
      results.push(makeQuestion({
        source: "补充题库-mcc-cissp-quiz",
        sourceFile: `cissp-quiz-main/${file}`,
        sourceId: `MCC-${file.replace(/[^A-Za-z0-9]/g, "-")}-${q.number || idx + 1}`,
        domainInput: `${q.domain || ""} ${file} ${q.tags?.join(" ") || ""}`,
        chapterName: q.source || file,
        topic: q.tags?.[0] || q.domain || file,
        tags: q.tags || [],
        questionEn: q.text,
        options: q.options || [],
        correctAnswer: answerKey(q.answer ?? 0),
        explanationEn: q.explanation
      }));
    });
  }
  return results;
}

function normalizeWiki() {
  const dir = path.join(inputRoot, "cissp-wiki-main");
  const files = fs.readdirSync(dir).filter((file) => /^quiz-d[1-8].*\.html$/i.test(file)).sort();
  const results = [];
  for (const file of files) {
    const html = fs.readFileSync(path.join(dir, file), "utf8");
    const title = text((html.match(/<h1>(.*?)<\/h1>/s) || [])[1] || file);
    const cards = html.match(/<div class="quiz-card">[\s\S]*?(?=<div class="quiz-card">|<\/div>\s*<\/div>\s*(?:<script|<\/body>))/g) || [];
    cards.forEach((card, idx) => {
      const qText = text((card.match(/<p class="q-text">([\s\S]*?)<\/p>/) || [])[1]);
      if (!qText) return;
      const optionMatches = [...card.matchAll(/<li>([A-D])\.\s*([\s\S]*?)<\/li>/g)];
      const correctLabel = text((card.match(/<div class="correct-label">([\s\S]*?)<\/div>/) || [])[1]);
      const answer = (correctLabel.match(/Correct(?: Answer)?:?\s*([A-D])/i) || [])[1] || "A";
      const tags = [...card.matchAll(/<span class="tag[^"]*">([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
      const rationale = text((card.match(/<div class="rationale">([\s\S]*?)<\/div>/) || [])[1]);
      const mindset = text((card.match(/<div class="mindset-note">([\s\S]*?)<\/div>/) || [])[1]);
      results.push(makeQuestion({
        source: "补充题库-cissp-wiki",
        sourceFile: `cissp-wiki-main/${file}`,
        sourceId: `WIKI-${file.replace(/[^A-Za-z0-9]/g, "-")}-${idx + 1}`,
        domainInput: `${file} ${title} ${tags.join(" ")}`,
        chapterName: title,
        topic: tags[0] || title,
        tags,
        questionEn: qText,
        options: optionMatches.map((m) => m[2]),
        correctAnswer: answer.toUpperCase(),
        explanationEn: rationale,
        managerMindsetEn: mindset
      }));
    });
  }
  return results;
}

async function normalizeMockCissp() {
  const localDir = path.join(inputRoot, "Mock-CISSP-App-main", "questions");
  const known = [
    "domain1_security_risk_management.json",
    "domain2_asset_security.json",
    "domain3_security_architecture.json",
    "domain4_network_security.json",
    "domain5_iam.json",
    "domain6_security_assessment.json",
    "domain7_security_operations.json",
    "domain8_software_security.json"
  ];
  const results = [];
  for (const file of known) {
    let raw = "";
    const local = path.join(localDir, file);
    const cached = path.join(outputRoot, "raw_cache", file);
    if (fs.existsSync(local)) {
      raw = fs.readFileSync(local, "utf8");
    } else if (fs.existsSync(cached)) {
      raw = fs.readFileSync(cached, "utf8");
    } else {
      const url = `https://raw.githubusercontent.com/smaeung/Mock-CISSP-App/feature/readme-arch-docs/questions/${file}`;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetch(url, { headers: { "user-agent": "codex-cissp-import" } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          raw = await response.text();
          fs.writeFileSync(cached, raw);
          break;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
      }
      if (!raw) {
        console.warn(`skip ${file}: ${lastError?.message || "download failed"}`);
        continue;
      }
    }
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : data.questions || [];
    items.forEach((q, idx) => {
      results.push(makeQuestion({
        source: "补充题库-Mock-CISSP-App",
        sourceFile: `questions/${file}`,
        sourceId: `MOCK-${file.replace(/[^A-Za-z0-9]/g, "-")}-${idx + 1}`,
        domainInput: `${file} ${q.domain || ""} ${q.category || ""} ${q.tags?.join(" ") || ""}`,
        chapterName: q.category || q.domain || file,
        topic: q.topic || q.category || q.domain || file,
        tags: q.tags || [q.category, q.difficulty].filter(Boolean),
        difficulty: q.difficulty,
        questionEn: q.question || q.text || q.stem,
        options: q.options || q.choices || [],
        correctAnswer: answerKey(q.correctAnswer ?? q.correct ?? q.answer ?? 0),
        explanationEn: q.explanation || q.rationale
      }));
    });
  }
  return results;
}

async function translateBatch(items) {
  const todo = items.filter((item) => item && !translationCache[item]);
  let done = 0;
  for (let i = 0; i < todo.length; i += 12) {
    const batch = todo.slice(i, i + 12);
    const sep = "\n<<<CISSP_SPLIT>>>\n";
    const body = batch.join(sep);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(body)}`;
      const response = await fetch(url, { headers: { "user-agent": "codex-cissp-import" } });
      if (!response.ok) throw new Error(`translate ${response.status}`);
      const data = await response.json();
      const translated = data[0].map((part) => part[0]).join("");
      const split = translated.split(/<<<\s*CISSP_SPLIT\s*>>>/i).map((x) => x.trim());
      if (split.length === batch.length) {
        batch.forEach((source, idx) => { translationCache[source] = split[idx]; });
      } else {
        for (const source of batch) {
          const singleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(source)}`;
          const singleResponse = await fetch(singleUrl, { headers: { "user-agent": "codex-cissp-import" } });
          const singleData = await singleResponse.json();
          translationCache[source] = singleData[0].map((part) => part[0]).join("").trim();
        }
      }
    } catch (error) {
      console.warn(`translation fallback for ${batch.length} strings: ${error.message}`);
      batch.forEach((source) => { translationCache[source] = source; });
    }
    done += batch.length;
    if (done % 240 === 0) {
      fs.writeFileSync(cachePath, JSON.stringify(translationCache, null, 2));
      console.log(`translated/cache checked ${done}/${todo.length}`);
    }
  }
  fs.writeFileSync(cachePath, JSON.stringify(translationCache, null, 2));
}

function compactDedupe(questions) {
  const seen = new Set();
  const output = [];
  for (const q of questions) {
    if (!q.questionEn || q.options.length < 2) continue;
    const key = `${q.questionEn.toLowerCase().replace(/\W+/g, " ").trim()}::${q.correctAnswer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(q);
  }
  return output;
}

function synthesizeExplanation(q) {
  const correct = q.options.find((option) => option.key === q.correctAnswer);
  const correctText = correct?.text || q.correctAnswer;
  const topic = q.topic || q.chapterName || q.domainNameCn;
  return `正确答案是 ${q.correctAnswer}。该选项“${correctText}”最符合题干要求，考点属于「${topic}」。复习时请重点区分题干中的关键词、控制目标和角色责任；其他选项虽然可能与安全概念相关，但没有直接满足本题问法或优先级。`;
}

function toCsv(questions) {
  const headers = [
    "id", "source", "source_file", "domain_id", "domain_name_cn", "chapter_name", "topic_name", "tags", "difficulty",
    "question_en", "question_cn", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f", "option_g",
    "correct_answer", "explanation_en", "explanation_cn", "manager_mindset_cn"
  ];
  const rows = questions.map((q) => [
    q.id, q.source, q.sourceFile, q.domainId, q.domainNameCn, q.chapterName, q.topic, q.tags.join(";"), q.difficulty,
    q.questionEn, q.questionCn,
    q.options[0]?.text || "", q.options[1]?.text || "", q.options[2]?.text || "", q.options[3]?.text || "",
    q.options[4]?.text || "", q.options[5]?.text || "", q.options[6]?.text || "",
    q.correctAnswer, q.explanationEn, q.explanationCn, q.managerMindsetCn
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function main() {
  const collected = [
    ...normalize037g(),
    ...normalizeExamSimulator(),
    ...normalizeCisspPrep(),
    ...normalizeCisspQuiz(),
    ...normalizeWiki(),
    ...(await normalizeMockCissp())
  ];
  const questions = compactDedupe(collected);
  const strings = [];
  for (const q of questions) {
    strings.push(q.questionEn, q.explanationEn, q.managerMindsetEn);
    q.options.forEach((option) => strings.push(option.text));
  }
  await translateBatch([...new Set(strings.filter(Boolean))]);
  for (const q of questions) {
    q.questionCn = translationCache[q.questionEn] || q.questionEn;
    q.explanationCn = translationCache[q.explanationEn] || q.explanationEn || "该题源未提供解析。";
    q.managerMindsetCn = translationCache[q.managerMindsetEn] || q.managerMindsetEn || "";
    q.options = q.options.map((option) => ({
      ...option,
      text: translationCache[option.text] || option.text
    }));
    if (!q.explanationCn || q.explanationCn === "该题源未提供解析。" || q.explanationCn.length < 20) {
      q.explanationCn = synthesizeExplanation(q);
      q.managerMindsetCn = q.managerMindsetCn || "答题时优先从风险、合规、业务责任和管理者视角判断，不只看技术名词是否熟悉。";
    }
  }

  fs.writeFileSync(outJson, JSON.stringify(questions, null, 2));
  fs.writeFileSync(outCsv, toCsv(questions));
  const summary = {
    generatedAt: new Date().toISOString(),
    inputRoot,
    outputRoot,
    total: questions.length,
    bySource: Object.fromEntries(Object.entries(questions.reduce((acc, q) => {
      acc[q.source] = (acc[q.source] || 0) + 1;
      return acc;
    }, {})).sort()),
    byDomain: Object.fromEntries(Object.entries(questions.reduce((acc, q) => {
      acc[q.domainId] = (acc[q.domainId] || 0) + 1;
      return acc;
    }, {})).sort())
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
