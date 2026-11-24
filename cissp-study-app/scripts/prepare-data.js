import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const appRoot = path.resolve(process.cwd());
const base = path.resolve(appRoot, "..");
const out = path.join(appRoot, "src", "data", "seedData.json");

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

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(base, relative), "utf8"));
}

function readCsv(relative) {
  const text = fs.readFileSync(path.join(base, relative), "utf8").replace(/^\uFEFF/, "");
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function readJsonIfExists(relative) {
  const file = path.join(base, relative);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeOfficial(q) {
  const domain = domains[q.domain_id] || {};
  return {
    id: `OFF-${q.id}`,
    source: "官方大纲原创题",
    domainId: q.domain_id,
    domainName: domain.name || q.domain_name,
    domainNameCn: domain.nameCn || q.domain_name_cn,
    chapterId: q.chapter_id || "",
    chapterName: q.chapter_name || "",
    topic: q.topic_name || (q.tags || []).at(-1) || "",
    tags: q.tags || [],
    difficulty: q.difficulty || "medium",
    questionEn: q.question_en || "",
    questionCn: q.question_cn || q.question_en || "",
    options: q.options || [],
    correctAnswer: q.correct_answer || "",
    explanationCn: q.explanation_cn || "",
    distractorsCn: q.distractor_explanations_cn || {},
    managerMindsetCn: q.manager_mindset_cn || "",
    importedAt: "seed"
  };
}

function normalizeCsv(row) {
  const domain = domains[row.domain_id] || {};
  const tags = String(row.tags || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    id: `ZTH-${row.id}`,
    source: "CISSP Zero to Hero",
    domainId: row.domain_id,
    domainName: domain.name || row.domain_name,
    domainNameCn: domain.nameCn || "",
    chapterId: "",
    chapterName: "",
    topic: tags.find((tag) => /^\d+\./.test(tag)) || tags[2] || "",
    tags,
    difficulty: row.difficulty || "medium",
    questionEn: row.question_en || "",
    questionCn: row.question_cn || row.question_en || "",
    options: [
      { key: "A", text: row.option_a || "" },
      { key: "B", text: row.option_b || "" },
      { key: "C", text: row.option_c || "" },
      { key: "D", text: row.option_d || "" }
    ],
    correctAnswer: row.correct_answer || "",
    explanationCn: row.explanation_cn || "",
    distractorsCn: {
      A: row.why_a_wrong_cn || "",
      B: row.why_b_wrong_cn || "",
      C: row.why_c_wrong_cn || "",
      D: row.why_d_wrong_cn || ""
    },
    managerMindsetCn: row.manager_mindset_cn || "",
    importedAt: "seed"
  };
}

function noteTitle(file) {
  const match = file.match(/Domain-(\d+)/i);
  const id = match ? `D${match[1]}` : "";
  return {
    id,
    title: id ? `${id} ${domains[id]?.nameCn || ""}` : file.replace(/\.md$/, ""),
    domainName: domains[id]?.name || "",
    domainNameCn: domains[id]?.nameCn || ""
  };
}

const official = readJson("CISSP官方大纲练习题/cissp_official_outline_questions.json").map(normalizeOfficial);
const zth = readCsv("CISSP-Zero-to-Hero题库CSV/cissp_zero_to_hero_questions_zh_app.csv").map(normalizeCsv);
const supplemental = readJsonIfExists("补充题库整理/cissp_supplemental_questions_zh_app.json");

const notesDir = path.join(base, "CISSP笔记");
const notes = fs
  .readdirSync(notesDir)
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => {
    const meta = noteTitle(file);
    return {
      ...meta,
      file,
      content: fs.readFileSync(path.join(notesDir, file), "utf8")
    };
  });

const seed = {
  generatedAt: new Date().toISOString(),
  questions: [...official, ...zth, ...supplemental],
  notes,
  domains: Object.entries(domains).map(([id, value]) => ({ id, ...value }))
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(seed, null, 2));
console.log(`questions=${seed.questions.length} notes=${seed.notes.length} output=${out}`);
