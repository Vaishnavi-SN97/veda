// Mock implementation of every call in lib/api.ts. Mirrors what the FastAPI backend will do.

import type {
  Alert,
  AlertAction,
  AttendanceSheet,
  CardDeck,
  ClassSetup,
  ClassroomCourse,
  Dashboard,
  Grade,
  Language,
  MarksSheet,
  MoveRequest,
  QuizResult,
  QuizSubmission,
  ReplanRequest,
  Report,
  Student,
  StudentInsight,
  StudentProfile,
  StudentSummary,
  StudentTag,
  StudentToday,
  SyllabusProgress,
  Topic,
  TopicMastery,
  TutorReply,
  TutorRequest,
  VoiceNoteResult,
  WeekPlan,
} from "../types";
import { GRADES } from "../types";
import {
  CLASSROOM_COURSES,
  DEMO_TODAY,
  FRACTION_TOPIC_IDS,
  NEXT_WEEK_START,
  QUIZ_SCORES,
  SCHOOL_DAYS,
  STUDENTS,
  TUTOR_MINUTES,
  WEEK_LABELS,
  WEEK_STARTS,
  traitsOf,
} from "./seed";
import { db, save, type Priority } from "./store";
import { deckContent, tutorReply } from "./content";
import { dayName, generatePlan, movePeriod, replan } from "./plan";

export const DEMO_PIN = "1234";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function logSarvam(model: string, purpose: string) {
  db().sarvamCalls++;
  console.info(`[sarvam:demo] would call ${model} for ${purpose} (no real call in demo mode)`);
}

// ---------- Class setup ----------

export function getClass(): ClassSetup {
  return db().setup;
}

export function saveClass(setup: ClassSetup): ClassSetup {
  db().setup = setup;
  save();
  return setup;
}

export function listClassroomCourses(): ClassroomCourse[] {
  return CLASSROOM_COURSES;
}

// ---------- Syllabus ----------

export function getTopics(grade?: Grade): Topic[] {
  return db().topics.filter((t) => grade === undefined || t.grade === grade).sort((a, b) => a.grade - b.grade || a.order - b.order);
}

export function saveTopics(grade: Grade, titles: { chapter: string; title: string }[]): Topic[] {
  const s = db();
  const existing = s.topics.filter((t) => t.grade === grade);
  const next: Topic[] = titles.map((x, i) => {
    const old = existing.find((t) => t.title === x.title && t.chapter === x.chapter);
    return old ? { ...old, order: i + 1 } : { id: `g${grade}-n${Date.now()}-${i}`, grade, chapter: x.chapter, title: x.title, order: i + 1, status: "not_started" };
  });
  s.topics = [...s.topics.filter((t) => t.grade !== grade), ...next];
  save();
  return next;
}

export function markTopicDone(topicId: string): Topic {
  const s = db();
  const t = s.topics.find((x) => x.id === topicId)!;
  t.status = "done";
  t.doneOn = DEMO_TODAY;
  const next = s.topics.filter((x) => x.grade === t.grade && x.status === "not_started").sort((a, b) => a.order - b.order)[0];
  if (next && !s.topics.some((x) => x.grade === t.grade && x.status === "in_progress")) next.status = "in_progress";
  save();
  return t;
}

function syllabusProgress(): SyllabusProgress[] {
  return GRADES.map((grade) => {
    const own = getTopics(grade);
    const done = own.filter((t) => t.status === "done").length;
    return {
      grade,
      done,
      total: own.length,
      percent: own.length ? Math.round((done / own.length) * 100) : 0,
      currentTopic: own.find((t) => t.status === "in_progress"),
    };
  });
}

// ---------- Students ----------

export function getStudents(grade?: Grade): Student[] {
  return STUDENTS.filter((s) => grade === undefined || s.grade === grade);
}

// ---------- Timetable ----------

function priorities(): Priority[] {
  return db().priorities;
}

export function getWeekPlan(weekStart: string): WeekPlan | null {
  return db().plans[weekStart] ?? null;
}

export function generateWeek(weekStart: string): WeekPlan {
  const s = db();
  // backend: OR-Tools CP-SAT, no AI call
  const plan = generatePlan({ weekStart, topics: s.topics, breaks: s.setup.breaks, priorities: priorities() });
  s.plans[weekStart] = plan;
  save();
  return plan;
}

export function moveInWeek(weekStart: string, req: MoveRequest): WeekPlan {
  const s = db();
  s.plans[weekStart] = movePeriod(s.plans[weekStart], req.fromPeriodId, req.toPeriodId);
  save();
  return s.plans[weekStart];
}

export function replanWeek(weekStart: string, req: ReplanRequest): WeekPlan {
  const s = db();
  s.plans[weekStart] = replan(s.plans[weekStart], req, s.topics);
  save();
  return s.plans[weekStart];
}

export function approveWeek(weekStart: string): WeekPlan {
  const s = db();
  s.plans[weekStart] = { ...s.plans[weekStart], status: "approved", periods: s.plans[weekStart].periods.map((p) => ({ ...p, changed: false })) };
  save();
  return s.plans[weekStart];
}

// ---------- Attendance ----------

export function getAttendance(date: string, grade: Grade): AttendanceSheet {
  const s = db();
  const day = s.attendance[date] ?? {};
  const marks: AttendanceSheet["marks"] = {};
  for (const st of getStudents(grade)) marks[st.id] = day[st.id] ?? "present";
  return { date, grade, marks, submitted: !!s.attendanceSubmitted[`${date}|${grade}`] || (date !== DEMO_TODAY && !!s.attendance[date]) };
}

export function saveAttendance(sheet: AttendanceSheet): AttendanceSheet {
  const s = db();
  s.attendance[sheet.date] = { ...(s.attendance[sheet.date] ?? {}), ...sheet.marks };
  s.attendanceSubmitted[`${sheet.date}|${sheet.grade}`] = true;
  save();
  return { ...sheet, submitted: true };
}

export function readVoiceNote(grade: Grade, transcript: string): VoiceNoteResult {
  // Backend: Saaras speech-to-text, then roster name matching. Demo: match names in the transcript.
  const text = transcript.toLowerCase();
  const absent = getStudents(grade).filter((s) => text.includes(s.name.toLowerCase()));
  return { transcript, absentStudentIds: absent.map((s) => s.id) };
}

// ---------- Marks ----------

export function getMarks(grade: Grade, topicId: string): MarksSheet {
  const s = db();
  const topic = s.topics.find((t) => t.id === topicId)!;
  const test = s.tests.find((t) => t.topicId === topicId);
  const maxScore = test?.maxScore ?? 20;
  return {
    grade,
    topicId,
    testName: test?.testName ?? `${topic.title} test`,
    date: test?.date ?? DEMO_TODAY,
    maxScore,
    entries: getStudents(grade).map((st) => ({ studentId: st.id, topicId, score: test?.scores[st.id] ?? null, maxScore })),
  };
}

export function saveMarks(sheet: MarksSheet): MarksSheet {
  const s = db();
  let test = s.tests.find((t) => t.topicId === sheet.topicId);
  if (!test) {
    test = { id: `test-${sheet.topicId}`, grade: sheet.grade, topicId: sheet.topicId, testName: sheet.testName, date: sheet.date, maxScore: sheet.maxScore, scores: {} };
    s.tests.push(test);
  }
  test.testName = sheet.testName;
  test.maxScore = sheet.maxScore;
  for (const e of sheet.entries) if (e.score !== null) test.scores[e.studentId] = e.score;
  save();
  return getMarks(sheet.grade, sheet.topicId);
}

// ---------- Cards + quiz ----------

export function getDeck(topicId: string, language: Language): CardDeck {
  const s = db();
  const key = `${topicId}|${language}`;
  if (s.decks[key]) return { ...s.decks[key], cached: true };
  const topic = s.topics.find((t) => t.id === topicId)!;
  logSarvam("sarvam-105b", `cards + quiz for ${topic.title} (${language})`);
  const c = deckContent(topic, language);
  const deck: CardDeck = {
    id: `deck-${topicId}-${language}`,
    topicId,
    topicTitle: c.title,
    grade: topic.grade,
    language,
    cards: c.cards.map((card, i) => ({ ...card, id: `${topicId}-${language}-c${i}` })),
    quiz: c.quiz.map((q, i) => ({ ...q, id: `${topicId}-${language}-q${i}` })),
    status: "draft",
    cached: false,
  };
  s.decks[key] = deck;
  save();
  return deck;
}

export function saveDeck(deck: CardDeck): CardDeck {
  db().decks[`${deck.topicId}|${deck.language}`] = deck;
  save();
  return deck;
}

export function sendDeck(deck: CardDeck): CardDeck {
  // Backend: posts cards as a Classroom material and the quiz as coursework.
  const sent: CardDeck = { ...deck, status: "sent", sentAt: new Date().toISOString() };
  saveDeck(sent);
  return sent;
}

// ---------- Insights ----------

function attendanceOf(studentId: string) {
  const s = db();
  const days = SCHOOL_DAYS.filter((d) => s.attendance[d]?.[studentId]);
  const missed = days.filter((d) => s.attendance[d][studentId] === "absent").length;
  return { percent: days.length ? Math.round(((days.length - missed) / days.length) * 100) : 100, missed };
}

function tagFor(studentId: string): { tag: StudentTag; reason: string } {
  const q = QUIZ_SCORES[studentId];
  const tm = TUTOR_MINUTES[studentId];
  const falling = q[3] < q[2] && q[2] < q[1] && q[1] < q[0];
  const low = q[3] < 50;
  if (!falling && !low) return { tag: "on_track", reason: `Latest quiz ${q[3]}%, steady over 4 weeks.` };
  if (tm[3] >= 20)
    return { tag: "studied_but_confused", reason: `Spent ${tm[3]} min with Vidya last week, but quiz fell to ${q[3]}%. Needs re-teaching, not more practice.` };
  return { tag: "didnt_study", reason: `Only ${tm[3]} min with Vidya last week and quiz fell to ${q[3]}%. Needs a nudge at home.` };
}

function masteryOf(student: Student): TopicMastery[] {
  const done = getTopics(student.grade).filter((t) => t.status !== "not_started");
  return done.map((t) => {
    const weekIdx = FRACTION_TOPIC_IDS.indexOf(t.id);
    const percent =
      student.grade === 4 && weekIdx >= 0
        ? QUIZ_SCORES[student.id][weekIdx]
        : Math.max(25, Math.min(100, Math.round(traitsOf(student.id).ability + (hash(student.id + t.id) - 0.5) * 24)));
    return { topicId: t.id, topicTitle: t.title, chapter: t.chapter, percent };
  });
}

export function listStudentSummaries(grade?: Grade): StudentSummary[] {
  return getStudents(grade).map((student) => ({
    student,
    tag: tagFor(student.id).tag,
    lastQuizPercent: QUIZ_SCORES[student.id][3],
    attendancePercent: attendanceOf(student.id).percent,
  }));
}

export function getStudentInsight(studentId: string): StudentInsight {
  const s = db();
  const student = STUDENTS.find((x) => x.id === studentId)!;
  const att = attendanceOf(studentId);
  const { tag, reason } = tagFor(studentId);
  return {
    student,
    attendancePercent: att.percent,
    daysMissed: att.missed,
    mastery: masteryOf(student),
    quizScores: WEEK_LABELS.map((weekLabel, i) => ({ weekLabel, percent: QUIZ_SCORES[studentId][i] })),
    tutorMinutes: WEEK_LABELS.map((weekLabel, i) => ({ weekLabel, percent: TUTOR_MINUTES[studentId][i] })),
    testMarks: s.tests
      .filter((t) => t.grade === student.grade && t.scores[studentId] !== undefined)
      .map((t) => ({ testName: t.testName, score: t.scores[studentId], maxScore: t.maxScore, date: t.date })),
    tag,
    tagReason: reason,
  };
}

// ---------- Alerts ----------

export function getAlerts(): Alert[] {
  return db().alerts;
}

export function actOnAlert(id: string, act: AlertAction): Alert {
  const s = db();
  const alert = s.alerts.find((a) => a.id === id)!;
  if (act.action === "dismiss") alert.status = "dismissed";
  if (act.action === "edit") alert.suggestion = act.suggestion;
  if (act.action === "accept") {
    alert.status = "accepted";
    // "Plan adjusts": an accepted Grade 4/5 learning alert asks the planner for extra teacher time
    if (alert.id === "alert-ravi-fractions" || alert.id === "alert-g5-syllabus") {
      s.priorities.push({
        grade: alert.grade,
        reason: `You accepted the alert "${alert.title}".`,
        activity: alert.id === "alert-ravi-fractions" ? "Re-teach equivalent fractions with paper folding (Ravi in front, Ananya as partner)" : "Teach: Adding like fractions",
      });
      if (s.plans[NEXT_WEEK_START]) {
        s.plans[NEXT_WEEK_START] = generatePlan({ weekStart: NEXT_WEEK_START, topics: s.topics, breaks: s.setup.breaks, priorities: s.priorities });
      }
    }
  }
  save();
  return alert;
}

// ---------- Dashboard ----------

export function getDashboard(): Dashboard {
  const s = db();
  const plan = s.plans[WEEK_STARTS[3]];
  const dayNum = new Date(DEMO_TODAY + "T00:00:00Z").getUTCDay();
  return {
    date: DEMO_TODAY,
    dayLabel: `${dayName(dayNum)}, 30 October`,
    todayPeriods: plan ? plan.periods.filter((p) => p.day === dayNum) : [],
    breaks: s.setup.breaks,
    planStatus: plan?.status ?? "none",
    attendance: GRADES.map((grade) => {
      const sheet = getAttendance(DEMO_TODAY, grade);
      const values = Object.values(sheet.marks);
      return { grade, taken: sheet.submitted, present: values.filter((v) => v === "present").length, total: values.length };
    }),
    syllabus: syllabusProgress(),
    alerts: s.alerts.filter((a) => a.status === "open"),
  };
}

// ---------- Reports ----------

export function getReport(): Report {
  const s = db();
  const taken = SCHOOL_DAYS.filter((d) => s.attendance[d]);
  return {
    from: SCHOOL_DAYS[0],
    to: DEMO_TODAY,
    schoolDays: taken.length,
    attendanceByGrade: GRADES.map((grade) => {
      const ids = getStudents(grade).map((x) => x.id);
      let present = 0;
      let total = 0;
      for (const d of taken) for (const id of ids) if (s.attendance[d][id]) { total++; if (s.attendance[d][id] === "present") present++; }
      return { grade, percent: total ? Math.round((present / total) * 100) : 0 };
    }),
    syllabus: syllabusProgress(),
    rows: STUDENTS.map((student) => {
      const tests = s.tests.filter((t) => t.scores[student.id] !== undefined);
      const testPct = tests.length ? Math.round(tests.reduce((a, t) => a + (t.scores[student.id] / t.maxScore) * 100, 0) / tests.length) : 0;
      const q = QUIZ_SCORES[student.id];
      return {
        student,
        attendancePercent: attendanceOf(student.id).percent,
        averageQuizPercent: Math.round(q.reduce((a, b) => a + b, 0) / q.length),
        averageTestPercent: testPct,
        tag: tagFor(student.id).tag,
      };
    }),
  };
}

// ---------- Student side ----------

export function listProfiles(): StudentProfile[] {
  return STUDENTS.map((student) => ({ student, hasPin: true }));
}

export function studentLogin(studentId: string, pin: string): boolean {
  return pin === DEMO_PIN && STUDENTS.some((s) => s.id === studentId);
}

export function getStudentToday(studentId: string): StudentToday {
  const s = db();
  const student = STUDENTS.find((x) => x.id === studentId)!;
  const completedDeckIds = s.completed[studentId] ?? [];
  const decks = Object.values(s.decks)
    .filter((d) => d.grade === student.grade && d.status === "sent" && !completedDeckIds.includes(d.id))
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
  return { student, decks, completedDeckIds };
}

export function submitQuiz(studentId: string, sub: QuizSubmission): QuizResult {
  const s = db();
  const deck = Object.values(s.decks).find((d) => d.id === sub.deckId)!;
  const correct = deck.quiz.filter((q, i) => sub.answers[i] === q.answerIndex).length;
  const result = { correct, total: deck.quiz.length, percent: Math.round((correct / deck.quiz.length) * 100) };
  s.quizResults[`${studentId}|${sub.deckId}`] = result;
  s.completed[studentId] = [...new Set([...(s.completed[studentId] ?? []), sub.deckId])];
  save();
  return result;
}

export function askTutor(req: TutorRequest): TutorReply {
  logSarvam("sarvam-105b-conversations", `tutor turn for ${req.studentId}`);
  save();
  return tutorReply(req.message, req.language);
}

export function sarvamCallCount(): number {
  return db().sarvamCalls;
}
