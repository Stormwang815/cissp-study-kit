import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Edit3,
  Eye,
  FilePlus2,
  Flame,
  Highlighter,
  ListChecks,
  Moon,
  NotebookText,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Upload,
  XCircle
} from "lucide-react";
import Papa from "papaparse";
import seed from "./data/seedData.json";
import "./styles.css";

const STORAGE_KEY = "cissp-study-app-state-v1";

const wrongReasons = [
  { id: "concept", label: "概念混淆" },
  { id: "keyword", label: "关键词误判" },
  { id: "english", label: "英文理解" },
  { id: "manager", label: "管理者视角错误" }
];

const builtInSources = [...new Set([...seed.questions.map((q) => q.source || "未知来源"), "手动导入"])];

const defaultState = {
  answers: {},
  customQuestions: [],
  theme: "dark",
  quizMode: "smart",
  selectedDomain: "all",
  selectedSources: builtInSources,
  quizOrder: "normal",
  showEnglish: true,
  showExplanationFirst: false,
  quizProgress: {},
  wrongSort: "wrongCount",
  bookmarks: [],
  mastered: [],
  questionNotes: {},
  noteMode: "preview",
  noteSearch: "",
  activeNote: "D1",
  noteEdits: {},
  customNotes: [],
  deletedNotes: []
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const selectedSources = stored.selectedSources
      ? [...new Set([...stored.selectedSources, ...builtInSources.filter((source) => source.startsWith("补充题库-"))])]
      : builtInSources;
    return {
      ...defaultState,
      ...stored,
      selectedSources
    };
  } catch {
    return defaultState;
  }
}

function saveState(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function todayKey(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function nextReviewDate(wrongCount, correct) {
  if (!correct) return todayKey(1);
  if (wrongCount >= 2) return todayKey(3);
  return todayKey(7);
}

function answerSet(answer) {
  return String(answer || "")
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .sort()
    .join(";");
}

function isCorrect(selected, correct) {
  return answerSet(selected) === answerSet(correct);
}

function markdownToHtml(md) {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- \[(x|X)\] (.*)$/gm, "<li class=\"task done\">$2</li>")
    .replace(/^- \[ \] (.*)$/gm, "<li class=\"task\">$1</li>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br />");
}

function percent(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function normalizeImportedCsv(row, idx) {
  return {
    id: `IMP-${Date.now()}-${idx}`,
    source: "手动导入",
    domainId: row.domain_id || "D1",
    domainName: row.domain_name || "",
    domainNameCn: seed.domains.find((d) => d.id === (row.domain_id || "D1"))?.nameCn || "",
    chapterId: row.chapter_id || "",
    chapterName: "",
    topic: row.topic_name || row.tags || "手动导入",
    tags: String(row.tags || "").split(";").filter(Boolean),
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
    importedAt: new Date().toISOString()
  };
}

function sourceNamesFor(questions) {
  return [...new Set([...questions.map((q) => q.source || "未知来源"), "手动导入"])];
}

function sourceSummary(questions, sources) {
  return sources.map((source) => ({
    source,
    count: questions.filter((q) => (q.source || "未知来源") === source).length
  }));
}

function buildNotes(state) {
  const seedNotes = seed.notes
    .filter((note) => !state.deletedNotes?.includes(`seed:${note.id}`))
    .map((note) => {
      const key = `seed:${note.id}`;
      const edit = state.noteEdits?.[key] || {};
      return {
        ...note,
        key,
        type: "seed",
        title: edit.title ?? note.title,
        content: edit.content ?? note.content,
        updatedAt: edit.updatedAt
      };
    });
  const customNotes = (state.customNotes || [])
    .filter((note) => !state.deletedNotes?.includes(note.key))
    .map((note) => ({ ...note, type: "custom" }));
  return [...seedNotes, ...customNotes];
}

function sortWrongPool(questions, answers, sort = "wrongCount") {
  const copy = [...questions];
  return copy.sort((a, b) => {
    const ar = answers[a.id] || {};
    const br = answers[b.id] || {};
    if (sort === "recent") return String(br.lastAttemptAt || "").localeCompare(String(ar.lastAttemptAt || ""));
    if (sort === "due") return String(ar.nextReview || "9999").localeCompare(String(br.nextReview || "9999"));
    if (sort === "domain") return `${a.domainId}${a.topic}`.localeCompare(`${b.domainId}${b.topic}`);
    return (br.wrongCount || 0) - (ar.wrongCount || 0);
  });
}

function selectPool(mode, filteredQuestions, dueQuestions, wrongQuestions, state) {
  const answers = state.answers || {};
  if (mode === "review") return dueQuestions;
  if (mode === "wrong") return sortWrongPool(wrongQuestions, answers, state.wrongSort);
  if (mode === "unattempted") return filteredQuestions.filter((q) => !answers[q.id]?.attempts);
  if (mode === "attempted") return filteredQuestions.filter((q) => answers[q.id]?.attempts > 0);
  if (mode === "correct") return filteredQuestions.filter((q) => answers[q.id]?.attempts > 0 && answers[q.id]?.lastCorrect);
  if (mode === "bookmarks") return filteredQuestions.filter((q) => state.bookmarks?.includes(q.id));
  if (mode === "mastered") return filteredQuestions.filter((q) => state.mastered?.includes(q.id));
  if (mode === "all") return filteredQuestions;
  return filteredQuestions.filter((q) => !state.mastered?.includes(q.id));
}

function poolKey(mode, state, query) {
  return [
    mode,
    state.selectedDomain,
    [...(state.selectedSources || [])].sort().join("|"),
    query || ""
  ].join("::");
}

function firstUnattempted(pool, answers) {
  return pool.find((q) => !answers[q.id]?.attempts) || pool[0];
}

function buildPracticeStats(questions, state, dueQuestions, wrongQuestions) {
  const answers = state.answers || {};
  return {
    all: questions.length,
    smart: questions.filter((q) => !state.mastered?.includes(q.id)).length,
    unattempted: questions.filter((q) => !answers[q.id]?.attempts).length,
    attempted: questions.filter((q) => answers[q.id]?.attempts > 0).length,
    correct: questions.filter((q) => answers[q.id]?.attempts > 0 && answers[q.id]?.lastCorrect).length,
    wrong: wrongQuestions.length,
    review: dueQuestions.length,
    bookmarks: questions.filter((q) => state.bookmarks?.includes(q.id)).length,
    mastered: questions.filter((q) => state.mastered?.includes(q.id)).length
  };
}

function App() {
  const [state, setState] = useState(loadState);
  const [view, setView] = useState("dashboard");
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [pendingReason, setPendingReason] = useState("concept");
  const [query, setQuery] = useState("");

  const questions = useMemo(() => [...seed.questions, ...state.customQuestions], [state.customQuestions]);
  const sourceNames = useMemo(() => sourceNamesFor(questions), [questions]);
  const notes = useMemo(() => buildNotes(state), [state]);
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const domainOk = state.selectedDomain === "all" || q.domainId === state.selectedDomain;
      const sourceOk = (state.selectedSources || []).includes(q.source || "未知来源");
      const text = `${q.questionCn} ${q.questionEn} ${q.topic} ${q.tags?.join(" ")}`.toLowerCase();
      return sourceOk && domainOk && (!query || text.includes(query.toLowerCase()));
    });
  }, [questions, state.selectedDomain, state.selectedSources, query]);

  const dueQuestions = useMemo(() => {
    const today = todayKey();
    return filteredQuestions.filter((q) => {
      const record = state.answers[q.id];
      return record?.nextReview && record.nextReview <= today;
    });
  }, [filteredQuestions, state.answers]);

  const wrongQuestions = useMemo(() => {
    return filteredQuestions.filter((q) => state.answers[q.id]?.wrongCount > 0);
  }, [filteredQuestions, state.answers]);

  const stats = useMemo(() => buildStats(questions, state.answers), [questions, state.answers]);
  const visibleStats = useMemo(() => buildStats(filteredQuestions, state.answers), [filteredQuestions, state.answers]);
  const sourceStats = useMemo(() => sourceSummary(questions, sourceNames), [questions, sourceNames]);
  const practiceStats = useMemo(() => buildPracticeStats(filteredQuestions, state, dueQuestions, wrongQuestions), [filteredQuestions, state, dueQuestions, wrongQuestions]);
  const activeQuestion = questions.find((q) => q.id === activeQuestionId) || filteredQuestions[0];

  function patchState(patch) {
    const next = { ...state, ...patch };
    setState(next);
    saveState(next);
  }

  function setActiveFromPool(mode, pool, restart = false) {
    const key = poolKey(mode, state, query);
    const savedId = state.quizProgress?.[key]?.currentQuestionId;
    const savedQuestion = pool.find((q) => q.id === savedId);
    const target = restart ? pool[0] : savedQuestion || firstUnattempted(pool, state.answers);
    setActiveQuestionId(target?.id || null);
    return target;
  }

  function startQuiz(mode, options = {}) {
    const pool = selectPool(mode, filteredQuestions, dueQuestions, wrongQuestions, state);
    const target = setActiveFromPool(mode, pool.length ? pool : filteredQuestions, options.restart);
    setSelected([]);
    setShowResult(false);
    patchState({
      quizMode: mode,
      quizProgress: {
        ...(state.quizProgress || {}),
        [poolKey(mode, state, query)]: {
          ...(state.quizProgress?.[poolKey(mode, state, query)] || {}),
          currentQuestionId: target?.id || null,
          lastOpenedAt: new Date().toISOString()
        }
      }
    });
    setView("quiz");
  }

  function submitAnswer(reason = pendingReason) {
    const selectedAnswer = selected.sort().join(";");
    const correct = isCorrect(selectedAnswer, activeQuestion.correctAnswer);
    const previous = state.answers[activeQuestion.id] || { attempts: 0, correct: 0, wrongCount: 0, reasons: {} };
    const nextRecord = {
      ...previous,
      attempts: previous.attempts + 1,
      correct: previous.correct + (correct ? 1 : 0),
      wrongCount: correct ? previous.wrongCount : previous.wrongCount + 1,
      lastAnswer: selectedAnswer,
      lastCorrect: correct,
      lastAttemptAt: new Date().toISOString(),
      nextReview: nextReviewDate(previous.wrongCount + (correct ? 0 : 1), correct),
      reasons: {
        ...previous.reasons,
        [reason]: (previous.reasons?.[reason] || 0) + (correct ? 0 : 1)
      }
    };
    patchState({ answers: { ...state.answers, [activeQuestion.id]: nextRecord } });
    setShowResult(true);
  }

  function nextQuestion() {
    const pool = selectPool(state.quizMode, filteredQuestions, dueQuestions, wrongQuestions, state);
    const index = Math.max(0, pool.findIndex((q) => q.id === activeQuestion.id));
    const next = state.quizOrder === "random"
      ? pool[Math.floor(Math.random() * Math.max(pool.length, 1))]
      : pool[(index + 1) % pool.length];
    setActiveQuestionId(next?.id || null);
    setSelected([]);
    setShowResult(false);
    patchState({
      quizProgress: {
        ...(state.quizProgress || {}),
        [poolKey(state.quizMode, state, query)]: {
          currentQuestionId: next?.id || null,
          lastOpenedAt: new Date().toISOString()
        }
      }
    });
  }

  function toggleOption(key) {
    const multiple = String(activeQuestion.correctAnswer || "").includes(";");
    if (multiple) {
      setSelected((current) => current.includes(key) ? current.filter((x) => x !== key) : [...current, key]);
    } else {
      setSelected([key]);
    }
  }

  function handleImport(text) {
    let imported = [];
    try {
      if (text.trim().startsWith("[")) {
        imported = JSON.parse(text).map((q, idx) => ({
          ...q,
          id: `IMP-${Date.now()}-${idx}`,
          source: "手动导入"
        }));
      } else {
        imported = Papa.parse(text, { header: true, skipEmptyLines: true }).data.map(normalizeImportedCsv);
      }
      patchState({ customQuestions: [...state.customQuestions, ...imported] });
      alert(`已导入 ${imported.length} 道题`);
    } catch (error) {
      alert(`导入失败：${error.message}`);
    }
  }

  function toggleSource(source) {
    const current = state.selectedSources || [];
    const next = current.includes(source) ? current.filter((item) => item !== source) : [...current, source];
    patchState({ selectedSources: next.length ? next : [source] });
  }

  function onlySource(source) {
    patchState({ selectedSources: [source] });
  }

  function toggleBookmark(questionId) {
    const exists = state.bookmarks?.includes(questionId);
    patchState({
      bookmarks: exists ? state.bookmarks.filter((id) => id !== questionId) : [...(state.bookmarks || []), questionId]
    });
  }

  function toggleMastered(questionId) {
    const exists = state.mastered?.includes(questionId);
    patchState({
      mastered: exists ? state.mastered.filter((id) => id !== questionId) : [...(state.mastered || []), questionId]
    });
  }

  function updateQuestionNote(questionId, value) {
    patchState({ questionNotes: { ...state.questionNotes, [questionId]: value } });
  }

  function saveNote(noteKey, patch) {
    if (noteKey.startsWith("custom:")) {
      patchState({
        customNotes: (state.customNotes || []).map((note) =>
          note.key === noteKey ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note
        )
      });
      return;
    }
    patchState({
      noteEdits: {
        ...state.noteEdits,
        [noteKey]: { ...(state.noteEdits?.[noteKey] || {}), ...patch, updatedAt: new Date().toISOString() }
      }
    });
  }

  function createNote() {
    const key = `custom:${Date.now()}`;
    const note = {
      key,
      id: key,
      title: "新的 CISSP 笔记",
      content: "## 新笔记\n\n- [ ] 记录一个知识点\n- [ ] 写下容易混淆的关键词\n\n==重点内容==",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    patchState({ customNotes: [note, ...(state.customNotes || [])], activeNote: key, noteMode: "edit" });
  }

  function deleteNote(noteKey) {
    if (!confirm("确定删除这份笔记？")) return;
    const nextDeleted = [...(state.deletedNotes || []), noteKey];
    patchState({
      deletedNotes: nextDeleted,
      customNotes: (state.customNotes || []).filter((note) => note.key !== noteKey),
      activeNote: "D1"
    });
  }

  return (
    <div className={`app ${state.theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={28} />
          <div>
            <strong>CISSP 本地刷题</strong>
            <span>{questions.length} 题 · {seed.notes.length} 份笔记</span>
          </div>
        </div>
        <NavItem icon={<BarChart3 />} label="仪表盘" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavItem icon={<Brain />} label="练习中心" active={view === "practice" || view === "quiz"} onClick={() => setView("practice")} />
        <NavItem icon={<Clock3 />} label="间隔复习" active={view === "review"} onClick={() => { setView("review"); startQuiz("review"); }} badge={dueQuestions.length} />
        <NavItem icon={<AlertTriangle />} label="错题本" active={view === "wrong"} onClick={() => setView("wrong")} badge={wrongQuestions.length} />
        <NavItem icon={<NotebookText />} label="笔记" active={view === "notes"} onClick={() => setView("notes")} />
        <NavItem icon={<Database />} label="题库" active={view === "bank"} onClick={() => setView("bank")} />
        <NavItem icon={<Settings />} label="设置" active={view === "settings"} onClick={() => setView("settings")} />
        <button className="themeButton" onClick={() => patchState({ theme: state.theme === "dark" ? "light" : "dark" })}>
          {state.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {state.theme === "dark" ? "浅色模式" : "黑暗模式"}
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view)}</h1>
            <p>本地题库、本地进度、按 Domain 追踪弱项。</p>
          </div>
          <div className="filters">
            <select value={state.selectedDomain} onChange={(e) => patchState({ selectedDomain: e.target.value })}>
              <option value="all">全部 Domain</option>
              {seed.domains.map((d) => <option key={d.id} value={d.id}>{d.id} {d.nameCn}</option>)}
            </select>
            <SourceSelector sources={sourceNames} selectedSources={state.selectedSources || []} toggleSource={toggleSource} />
            <div className="search">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索题干、标签、知识点" />
            </div>
          </div>
        </header>

        {view === "dashboard" && <Dashboard stats={visibleStats} questions={filteredQuestions} due={dueQuestions} wrong={wrongQuestions} startQuiz={startQuiz} sourceStats={sourceStats} selectedSources={state.selectedSources || []} onlySource={onlySource} practiceStats={practiceStats} />}
        {view === "practice" && <PracticeCenter stats={practiceStats} startQuiz={startQuiz} state={state} patchState={patchState} />}
        {view === "quiz" && activeQuestion && <Quiz question={activeQuestion} selected={selected} toggleOption={toggleOption} showResult={showResult} submitAnswer={submitAnswer} nextQuestion={nextQuestion} pendingReason={pendingReason} setPendingReason={setPendingReason} record={state.answers[activeQuestion.id]} bookmarked={state.bookmarks?.includes(activeQuestion.id)} mastered={state.mastered?.includes(activeQuestion.id)} toggleBookmark={() => toggleBookmark(activeQuestion.id)} toggleMastered={() => toggleMastered(activeQuestion.id)} questionNote={state.questionNotes?.[activeQuestion.id] || ""} updateQuestionNote={(value) => updateQuestionNote(activeQuestion.id, value)} showEnglish={state.showEnglish} pool={selectPool(state.quizMode, filteredQuestions, dueQuestions, wrongQuestions, state)} />}
        {view === "wrong" && <WrongBook questions={wrongQuestions} answers={state.answers} openQuestion={(id) => { setActiveQuestionId(id); setView("quiz"); }} startQuiz={startQuiz} wrongSort={state.wrongSort} setWrongSort={(wrongSort) => patchState({ wrongSort })} />}
        {view === "notes" && <Notes state={state} patchState={patchState} notes={notes} saveNote={saveNote} createNote={createNote} deleteNote={deleteNote} />}
        {view === "bank" && <QuestionBank questions={filteredQuestions} allQuestions={questions} sourceStats={sourceStats} selectedSources={state.selectedSources || []} onlySource={onlySource} toggleSource={toggleSource} handleImport={handleImport} />}
        {view === "settings" && <SettingsView state={state} patchState={patchState} stats={stats} />}
      </main>
    </div>
  );
}

function buildStats(questions, answers) {
  const totalAttempts = Object.values(answers).reduce((sum, r) => sum + (r.attempts || 0), 0);
  const totalCorrect = Object.values(answers).reduce((sum, r) => sum + (r.correct || 0), 0);
  const byDomain = seed.domains.map((d) => {
    const domainQuestions = questions.filter((q) => q.domainId === d.id);
    const attempts = domainQuestions.reduce((sum, q) => sum + (answers[q.id]?.attempts || 0), 0);
    const correct = domainQuestions.reduce((sum, q) => sum + (answers[q.id]?.correct || 0), 0);
    return { ...d, total: domainQuestions.length, attempts, correct, accuracy: percent(correct, attempts) };
  });
  const reasons = wrongReasons.map((reason) => ({
    ...reason,
    count: Object.values(answers).reduce((sum, r) => sum + (r.reasons?.[reason.id] || 0), 0)
  }));
  return { totalAttempts, totalCorrect, accuracy: percent(totalCorrect, totalAttempts), byDomain, reasons };
}

function NavItem({ icon, label, active, onClick, badge }) {
  return <button className={`navItem ${active ? "active" : ""}`} onClick={onClick}>{React.cloneElement(icon, { size: 19 })}<span>{label}</span>{badge ? <b>{badge}</b> : null}</button>;
}

function SourceSelector({ sources, selectedSources, toggleSource }) {
  return <div className="sourceFilters" aria-label="题库来源">
    {sources.map((source) => <button
      key={source}
      className={`sourceChip ${selectedSources.includes(source) ? "active" : ""}`}
      onClick={() => toggleSource(source)}
      title={`启用或关闭 ${source}`}
    >
      {source}
    </button>)}
  </div>;
}

function viewTitle(view) {
  return {
    dashboard: "学习仪表盘",
    practice: "练习中心",
    quiz: "沉浸刷题",
    review: "间隔复习",
    wrong: "错题本",
    notes: "学习笔记",
    bank: "题库管理",
    settings: "设置"
  }[view] || "CISSP";
}

function Dashboard({ stats, questions, due, wrong, startQuiz, sourceStats, selectedSources, onlySource, practiceStats }) {
  return <section className="grid">
    <Metric icon={<Target />} label="总题库" value={questions.length} sub="官方大纲 + Zero-to-Hero + 自定义" />
    <Metric icon={<CheckCircle2 />} label="总正确率" value={`${stats.accuracy}%`} sub={`${stats.totalCorrect}/${stats.totalAttempts || 0} 次答题`} />
    <Metric icon={<Clock3 />} label="今日待复习" value={due.length} sub="按 1/3/7 天间隔计算" />
    <Metric icon={<XCircle />} label="错题本" value={wrong.length} sub="按知识点自动归类" />
    <div className="panel wide">
      <div className="panelHead"><h2>Domain 正确率</h2><Sparkles size={18} /></div>
      <div className="domainList">
        {stats.byDomain.map((d) => <div className="domainRow" key={d.id}>
          <span>{d.id} {d.nameCn}</span>
          <div className="bar"><i style={{ width: `${d.accuracy}%` }} /></div>
          <strong>{d.attempts ? `${d.accuracy}%` : "未练"}</strong>
        </div>)}
      </div>
    </div>
    <div className="panel">
      <div className="panelHead"><h2>高频错因</h2><Flame size={18} /></div>
      {stats.reasons.map((r) => <div className="reasonRow" key={r.id}><span>{r.label}</span><strong>{r.count}</strong></div>)}
    </div>
    <div className="panel wide">
      <div className="panelHead"><h2>题库版本</h2><Database size={18} /></div>
      <div className="sourceGrid">
        {sourceStats.map((item) => <button key={item.source} className={`sourceCard ${selectedSources.includes(item.source) ? "active" : ""}`} onClick={() => onlySource(item.source)}>
          <span>{item.source}</span>
          <strong>{item.count}</strong>
          <small>点击后只练这个版本</small>
        </button>)}
      </div>
    </div>
    <div className="actions wide">
      <button onClick={() => startQuiz("smart")}><Brain size={18} />继续刷题</button>
      <button onClick={() => startQuiz("unattempted")}><BookOpen size={18} />只做未做题</button>
      <button onClick={() => startQuiz("review")}><Clock3 size={18} />复习到期题</button>
      <button onClick={() => startQuiz("wrong")}><RotateCcw size={18} />重练错题</button>
      <button onClick={() => startQuiz("bookmarks")}><Bookmark size={18} />收藏题</button>
    </div>
    <div className="panel wide">
      <div className="panelHead"><h2>刷题进度</h2><ListChecks size={18} /></div>
      <div className="progressTiles">
        <span><b>{practiceStats.unattempted}</b>未做</span>
        <span><b>{practiceStats.attempted}</b>已做</span>
        <span><b>{practiceStats.correct}</b>最近做对</span>
        <span><b>{practiceStats.wrong}</b>错题</span>
        <span><b>{practiceStats.mastered}</b>已掌握</span>
      </div>
    </div>
  </section>;
}

function PracticeCenter({ stats, startQuiz, state, patchState }) {
  const cards = [
    { mode: "smart", title: "继续刷题", desc: "跳过已掌握题，从上次位置或第一道未做题继续", count: stats.smart, icon: <Brain /> },
    { mode: "all", title: "从头开始", desc: "按当前题库筛选范围，从第一题重新练", count: stats.all, icon: <RotateCcw />, restart: true },
    { mode: "unattempted", title: "只做未做题", desc: "适合推进新题，避免重复刷熟题", count: stats.unattempted, icon: <BookOpen /> },
    { mode: "wrong", title: "只刷错题", desc: "按错题排序，集中清理薄弱点", count: stats.wrong, icon: <AlertTriangle /> },
    { mode: "review", title: "到期复习", desc: "按照 1/3/7 天间隔复习规则安排", count: stats.review, icon: <Clock3 /> },
    { mode: "correct", title: "已做对题", desc: "回看最近答对的题，巩固高频概念", count: stats.correct, icon: <CheckCircle2 /> },
    { mode: "attempted", title: "已做题", desc: "复盘所有有答题记录的题目", count: stats.attempted, icon: <ListChecks /> },
    { mode: "bookmarks", title: "收藏题", desc: "练习自己标记的重要题", count: stats.bookmarks, icon: <Bookmark /> }
  ];

  return <section className="practiceLayout">
    <div className="practiceHero">
      <div>
        <h2>选择今天的练习方式</h2>
        <p>当前筛选范围内共 {stats.all} 题，已做 {stats.attempted} 题，未做 {stats.unattempted} 题，错题 {stats.wrong} 题。</p>
      </div>
      <div className="practiceSettings">
        <label>
          <span>错题排序</span>
          <select value={state.wrongSort} onChange={(e) => patchState({ wrongSort: e.target.value })}>
            <option value="wrongCount">错得最多优先</option>
            <option value="due">复习到期优先</option>
            <option value="recent">最近做错优先</option>
            <option value="domain">按 Domain/知识点</option>
          </select>
        </label>
        <label>
          <span>下一题</span>
          <select value={state.quizOrder} onChange={(e) => patchState({ quizOrder: e.target.value })}>
            <option value="normal">顺序</option>
            <option value="random">随机</option>
          </select>
        </label>
      </div>
    </div>
    <div className="practiceCards">
      {cards.map((card) => <div className="practiceCard" key={card.mode}>
        <div className="practiceIcon">{React.cloneElement(card.icon, { size: 21 })}</div>
        <div>
          <h3>{card.title}</h3>
          <p>{card.desc}</p>
        </div>
        <strong>{card.count}</strong>
        <div className="practiceActions">
          <button disabled={!card.count} onClick={() => startQuiz(card.mode)}>继续</button>
          <button disabled={!card.count} className="ghostButton" onClick={() => startQuiz(card.mode, { restart: true })}>{card.restart ? "开始" : "重刷"}</button>
        </div>
      </div>)}
    </div>
  </section>;
}

function Metric({ icon, label, value, sub }) {
  return <div className="metric">{React.cloneElement(icon, { size: 22 })}<span>{label}</span><strong>{value}</strong><p>{sub}</p></div>;
}

function Quiz({ question, selected, toggleOption, showResult, submitAnswer, nextQuestion, pendingReason, setPendingReason, record, bookmarked, mastered, toggleBookmark, toggleMastered, questionNote, updateQuestionNote, showEnglish, pool }) {
  const correct = isCorrect(selected.join(";"), question.correctAnswer);
  const multiple = String(question.correctAnswer).includes(";");
  const currentIndex = Math.max(0, pool.findIndex((q) => q.id === question.id));
  const progress = pool.length ? percent(currentIndex + 1, pool.length) : 0;
  return <section className="quiz">
    <div className="questionCard">
      <div className="quizProgress">
        <span>{currentIndex + 1}/{pool.length || 1}</span>
        <div className="bar"><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="quizTools">
        <button className={bookmarked ? "active" : ""} onClick={toggleBookmark} title="收藏这道题"><Bookmark size={17} />{bookmarked ? "已收藏" : "收藏"}</button>
        <button className={mastered ? "active" : ""} onClick={toggleMastered} title="掌握后默认不进入智能刷题"><CheckCircle2 size={17} />{mastered ? "已掌握" : "标记掌握"}</button>
        {record?.attempts ? <span>已练 {record.attempts} 次 · 正确 {record.correct} 次 · 下次 {record.nextReview || "未安排"}</span> : <span>首次练习</span>}
      </div>
      <div className="chips">
        <span>{question.domainId} {question.domainNameCn}</span>
        <span>{question.source}</span>
        <span>{question.difficulty}</span>
        <span>{multiple ? "多选" : "单选"}</span>
        {question.topic && <span>{question.topic}</span>}
      </div>
      <h2>{question.questionCn}</h2>
      {showEnglish && question.questionEn && <p className="english">{question.questionEn}</p>}
      <div className="options">
        {question.options.map((opt) => <button key={opt.key} className={`option ${selected.includes(opt.key) ? "selected" : ""} ${showResult && answerSet(question.correctAnswer).split(";").includes(opt.key) ? "right" : ""}`} onClick={() => toggleOption(opt.key)}>
          <b>{opt.key}</b><span>{opt.text}</span>
        </button>)}
      </div>
      {!showResult && <div className="submitArea">
        <select value={pendingReason} onChange={(e) => setPendingReason(e.target.value)}>
          {wrongReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button disabled={!selected.length} onClick={() => submitAnswer()}>提交答案 <ChevronRight size={18} /></button>
      </div>}
      {showResult && <div className={`result ${correct ? "good" : "bad"}`}>
        <h3>{correct ? "答对了" : `答错了，正确答案：${question.correctAnswer}`}</h3>
        <p>{question.explanationCn}</p>
        {question.managerMindsetCn && <blockquote>{question.managerMindsetCn}</blockquote>}
        <div className="distractors">
          {Object.entries(question.distractorsCn || {}).map(([key, value]) => value ? <p key={key}><strong>{key}</strong> {value}</p> : null)}
        </div>
        <button onClick={nextQuestion}>下一题 <ChevronRight size={18} /></button>
      </div>}
      <div className="questionNote">
        <label>这道题的个人笔记</label>
        <textarea value={questionNote} onChange={(e) => updateQuestionNote(e.target.value)} placeholder="写下关键词、易错点、管理者视角提醒。内容只保存在本机。" />
      </div>
    </div>
  </section>;
}

function WrongBook({ questions, answers, openQuestion, startQuiz, wrongSort, setWrongSort }) {
  const groups = questions.reduce((acc, q) => {
    const key = q.topic || q.chapterName || q.domainNameCn || "未分类";
    acc[key] = acc[key] || [];
    acc[key].push(q);
    return acc;
  }, {});
  return <section className="panelList">
    <div className="panel wrongBookHeader">
      <div>
        <h2>错题本</h2>
        <p>共 {questions.length} 道错题，可按错题次数、复习到期或最近练习排序。</p>
      </div>
      <div className="wrongControls">
        <select value={wrongSort} onChange={(e) => setWrongSort(e.target.value)}>
          <option value="wrongCount">错得最多优先</option>
          <option value="due">复习到期优先</option>
          <option value="recent">最近做错优先</option>
          <option value="domain">按 Domain/知识点</option>
        </select>
        <button onClick={() => startQuiz("wrong")} disabled={!questions.length}><RotateCcw size={18} />继续错题</button>
        <button onClick={() => startQuiz("wrong", { restart: true })} disabled={!questions.length}><AlertTriangle size={18} />从头刷错题</button>
      </div>
    </div>
    {Object.entries(groups).map(([topic, items]) => <div className="panel" key={topic}>
      <div className="panelHead"><h2>{topic}</h2><span>{items.length} 题</span></div>
      {items.slice(0, 12).map((q) => <button className="questionLine" key={q.id} onClick={() => openQuestion(q.id)}>
        <span>{q.domainId}</span>
        <p>{q.questionCn}</p>
        <b>错 {answers[q.id]?.wrongCount || 0}</b>
        <small>{answers[q.id]?.nextReview ? `复习 ${answers[q.id].nextReview}` : ""}</small>
      </button>)}
    </div>)}
  </section>;
}

function Notes({ state, patchState, notes, saveNote, createNote, deleteNote }) {
  const editorRef = useRef(null);
  const search = state.noteSearch.toLowerCase();
  const visibleNotes = notes.filter((n) => `${n.title} ${n.content}`.toLowerCase().includes(search));
  const active = notes.find((n) => n.key === state.activeNote || n.id === state.activeNote) || visibleNotes[0] || notes[0];

  function changeActive(patch) {
    if (!active) return;
    saveNote(active.key, patch);
  }

  function wrapSelection(prefix, suffix = prefix, fallback = "重点内容") {
    const node = editorRef.current;
    if (!node || !active) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selectedText = active.content.slice(start, end) || fallback;
    const next = `${active.content.slice(0, start)}${prefix}${selectedText}${suffix}${active.content.slice(end)}`;
    changeActive({ content: next });
    setTimeout(() => {
      node.focus();
      node.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  }

  if (!active) {
    return <section className="panel"><button onClick={createNote}><Plus size={18} />新建笔记</button></section>;
  }

  return <section className="notesLayout">
    <div className="noteList">
      <div className="noteListHead">
        <div className="search noteSearch"><Search size={17} /><input value={state.noteSearch} onChange={(e) => patchState({ noteSearch: e.target.value })} placeholder="搜索笔记" /></div>
        <button className="iconButton" onClick={createNote} title="新建笔记"><Plus size={18} /></button>
      </div>
      {visibleNotes.map((n) => <button key={n.key} className={active.key === n.key ? "active" : ""} onClick={() => patchState({ activeNote: n.key })}>
        <strong>{n.title}</strong>
        <small>{n.type === "seed" ? "内置笔记" : "自建笔记"}{n.updatedAt ? " · 已编辑" : ""}</small>
      </button>)}
    </div>
    <article className="noteArticle">
      <div className="noteHeader">
        <input className="noteTitleInput" value={active.title} onChange={(e) => changeActive({ title: e.target.value })} />
        <div className="modeTabs">
          <button className={state.noteMode === "preview" ? "active" : ""} onClick={() => patchState({ noteMode: "preview" })}><Eye size={16} />预览</button>
          <button className={state.noteMode === "edit" ? "active" : ""} onClick={() => patchState({ noteMode: "edit" })}><Edit3 size={16} />编辑</button>
          <button className="dangerSoft" onClick={() => deleteNote(active.key)} title="删除笔记"><Trash2 size={16} /></button>
        </div>
      </div>
      {state.noteMode === "edit" && <div className="noteToolbar">
        <button onClick={() => wrapSelection("**", "**", "加粗内容")}><strong>B</strong></button>
        <button onClick={() => wrapSelection("==", "==", "高亮内容")}><Highlighter size={16} /></button>
        <button onClick={() => wrapSelection("- [ ] ", "", "待办事项")}><ListChecks size={16} /></button>
        <button onClick={() => wrapSelection("> ", "", "引用或考试提醒")}>”</button>
        <button onClick={() => wrapSelection("## ", "", "小标题")}>H2</button>
      </div>}
      {state.noteMode === "edit" ? <textarea
        ref={editorRef}
        className="noteEditor"
        value={active.content}
        onChange={(e) => changeActive({ content: e.target.value })}
        placeholder="支持 Markdown、==高亮==、- [ ] 待办、> 引用。"
      /> : <div className="notePreview" dangerouslySetInnerHTML={{ __html: `<p>${markdownToHtml(active.content)}</p>` }} />}
    </article>
  </section>;
}

function QuestionBank({ questions, allQuestions, sourceStats, selectedSources, onlySource, toggleSource, handleImport }) {
  const [text, setText] = useState("");
  return <section className="bank">
    <div className="panel">
      <div className="panelHead"><h2>题库版本选择</h2><Database size={18} /></div>
      <div className="sourceGrid">
        {sourceStats.map((item) => <div key={item.source} className={`sourceCard ${selectedSources.includes(item.source) ? "active" : ""}`}>
          <span>{item.source}</span>
          <strong>{item.count}</strong>
          <small>{selectedSources.includes(item.source) ? "已纳入刷题池" : "已暂时关闭"}</small>
          <div className="inlineButtons">
            <button className="smallButton" onClick={() => onlySource(item.source)}>只练这个</button>
            <button className="smallButton mutedButton" onClick={() => toggleSource(item.source)}>{selectedSources.includes(item.source) ? "关闭" : "启用"}</button>
          </div>
        </div>)}
      </div>
      <p>总题库 {allQuestions.length} 题，当前刷题池 {questions.length} 题。上方 Domain 和搜索也会同时影响刷题池。</p>
    </div>
    <div className="panel">
      <div className="panelHead"><h2>题库导入</h2><FilePlus2 size={18} /></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="粘贴 CSV 或 JSON 题库。CSV 字段可使用之前的 App 模板。" />
      <button onClick={() => handleImport(text)}><Upload size={18} />导入到本地题库</button>
    </div>
    <div className="panel">
      <div className="panelHead"><h2>当前筛选题目</h2><span>{questions.length} 题</span></div>
      <div className="table">
        {questions.slice(0, 80).map((q) => <div className="tableRow" key={q.id}><b>{q.domainId}</b><span>{q.questionCn}</span><em>{q.source}</em></div>)}
      </div>
    </div>
  </section>;
}

function SettingsView({ state, patchState, stats }) {
  return <section className="panelList">
    <div className="panel">
      <div className="panelHead"><h2>刷题偏好</h2><Settings size={18} /></div>
      <label className="settingLine">
        <span>题目顺序</span>
        <select value={state.quizOrder} onChange={(e) => patchState({ quizOrder: e.target.value })}>
          <option value="normal">按题库顺序</option>
          <option value="random">随机下一题</option>
        </select>
      </label>
      <label className="settingToggle">
        <input type="checkbox" checked={state.showEnglish} onChange={(e) => patchState({ showEnglish: e.target.checked })} />
        <span>刷题时显示英文原题</span>
      </label>
    </div>
    <div className="panel">
      <div className="panelHead"><h2>本地学习数据</h2><Database size={18} /></div>
      <p>答题记录、错题、错因和自定义题库都保存在当前浏览器的 localStorage。</p>
      <button className="danger" onClick={() => { if (confirm("确定清空所有学习进度？")) patchState({ answers: {}, bookmarks: [], mastered: [], questionNotes: {}, quizProgress: {} }); }}>清空学习进度</button>
    </div>
    <div className="panel">
      <div className="panelHead"><h2>复习规则</h2><Clock3 size={18} /></div>
      <p>答错：1 天后重练。答对错题：按错题次数进入 3 天或 7 天复习节奏。</p>
      <p>当前总正确率：{stats.accuracy}%</p>
    </div>
  </section>;
}

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
