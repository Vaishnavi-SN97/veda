// In-browser demo state. Starts from the seed, then remembers what the teacher does
// (attendance, marks, approvals, sent decks...) in localStorage so the demo survives a reload.

import type { Alert, AttendanceStatus, CardDeck, ClassSetup, Grade, QuizResult, Topic, WeekPlan } from "../types";
import {
  ATTENDANCE_HISTORY,
  CLASS_SETUP,
  DEMO_TODAY,
  QUIZ_SCORES,
  RAVI_ID,
  SCHOOL_DAYS,
  STUDENTS,
  TESTS,
  TOPICS,
  TUTOR_MINUTES,
  WEEK_STARTS,
  type SeedTest,
} from "./seed";
import { deckContent } from "./content";
import { generatePlan } from "./plan";

export interface Priority {
  grade: Grade;
  reason: string;
  activity: string;
}

export interface DemoState {
  version: number;
  setup: ClassSetup;
  topics: Topic[];
  attendance: Record<string, Record<string, AttendanceStatus>>; // date -> studentId -> status
  attendanceSubmitted: Record<string, boolean>; // `${date}|${grade}`
  tests: SeedTest[];
  plans: Record<string, WeekPlan>;
  alerts: Alert[];
  decks: Record<string, CardDeck>; // `${topicId}|${lang}`
  completed: Record<string, string[]>; // studentId -> deckIds
  quizResults: Record<string, QuizResult>; // `${studentId}|${deckId}`
  priorities: Priority[];
  sarvamCalls: number; // how many AI generations the demo would have paid for
}

const KEY = "veda-demo-state";
const VERSION = 3;

function seedDeck(topicId: string, sentAt: string): CardDeck {
  const topic = TOPICS.find((t) => t.id === topicId)!;
  const c = deckContent(topic, "en");
  return {
    id: `deck-${topicId}-en`,
    topicId,
    topicTitle: c.title,
    grade: topic.grade,
    language: "en",
    cards: c.cards.map((card, i) => ({ ...card, id: `${topicId}-c${i}` })),
    quiz: c.quiz.map((q, i) => ({ ...q, id: `${topicId}-q${i}` })),
    status: "sent",
    cached: true,
    sentAt,
  };
}

function absentDays(studentId: string, attendance: DemoState["attendance"]): string[] {
  return Object.keys(attendance).filter((d) => attendance[d][studentId] === "absent");
}

function seedAlerts(attendance: DemoState["attendance"]): Alert[] {
  const meenaAbsent = absentDays("s-g5-03", attendance).length;
  const g4Test = TESTS.find((t) => t.topicId === "g4-t13")!;
  const g4Scores = Object.values(g4Test.scores);
  const g4Avg = Math.round(g4Scores.reduce((a, b) => a + b, 0) / g4Scores.length);
  const q = QUIZ_SCORES[RAVI_ID];
  const tm = TUTOR_MINUTES[RAVI_ID];
  const created = `${DEMO_TODAY}T07:30:00+05:30`;
  return [
    {
      id: "alert-ravi-fractions",
      grade: 4,
      studentId: RAVI_ID,
      studentName: "Ravi",
      title: "Ravi is falling behind in fractions",
      reasons: [
        `Fraction quiz scores fell 3 weeks in a row: ${q.join("% → ")}%.`,
        "Missed 4 school days (13, 14, 20 and 21 Oct), the same days fractions were taught.",
        `Scored ${g4Test.scores[RAVI_ID]}/20 in the Fractions class test (Grade 4 average ${g4Avg}/20).`,
        `He is trying: time with Vidya went up from ${tm[0]} to ${tm[3]} minutes a week. Tag: "Studied but confused".`,
      ],
      suggestion:
        "Next week, add one teacher-led maths period for Grade 4 to re-teach equivalent fractions with paper folding. Pair Ravi with Ananya for peer work.",
      severity: "high",
      status: "open",
      createdAt: created,
    },
    {
      id: "alert-kiran-revision",
      grade: 3,
      studentId: "s-g3-01",
      studentName: "Kiran",
      title: "Kiran is not revising at home",
      reasons: [
        `Quiz scores are slipping: ${QUIZ_SCORES["s-g3-01"].join("% → ")}%.`,
        "0 minutes with Vidya in the last 3 weeks, and no topic cards opened.",
        "Attendance is fine, so this looks like no practice at home. Tag: \"Didn't study\".",
      ],
      suggestion:
        "Call Kiran's parent: ask for the family phone for 15 minutes each evening, and show Kiran how to open \"New today\".",
      severity: "medium",
      status: "open",
      createdAt: created,
    },
    {
      id: "alert-meena-attendance",
      grade: 5,
      studentId: "s-g5-03",
      studentName: "Meena",
      title: "Meena is missing school often",
      reasons: [
        `Absent ${meenaAbsent} of the last ${SCHOOL_DAYS.length - 1} school days.`,
        "Her quiz scores are still OK, so she can catch up if she comes regularly.",
      ],
      suggestion: "Visit or call home this week. Re-send this week's Grade 5 topic cards so she can catch up.",
      severity: "medium",
      status: "open",
      createdAt: created,
    },
    {
      id: "alert-g5-syllabus",
      grade: 5,
      title: "Grade 5 is 2 topics behind the term plan",
      reasons: [
        "7 of 12 Part I topics are done (58%). By end of October the plan expected 9.",
        "Fractions is the shared chapter with Grade 4, so a merged session saves time.",
      ],
      suggestion: "Use next week's merged Fractions session to cover \"Adding like fractions\" for Grade 5.",
      severity: "low",
      status: "open",
      createdAt: created,
    },
  ];
}

export function freshState(): DemoState {
  const attendance = structuredClone(ATTENDANCE_HISTORY);
  const topics = structuredClone(TOPICS);
  const current = generatePlan({ weekStart: WEEK_STARTS[3], topics, breaks: CLASS_SETUP.breaks, priorities: [] });
  current.status = "approved";
  const decks: Record<string, CardDeck> = {};
  for (const [topicId, sentAt] of [
    ["g3-t09", "2026-10-23T15:50:00+05:30"],
    ["g4-t13", "2026-10-23T15:50:00+05:30"],
    ["g5-t07", "2026-10-16T15:50:00+05:30"],
  ]) {
    decks[`${topicId}|en`] = seedDeck(topicId, sentAt);
  }
  // most students already finished last week's deck; Ravi and Kiran didn't
  const completed: Record<string, string[]> = {};
  for (const s of STUDENTS) {
    const deckId = s.grade === 3 ? "deck-g3-t09-en" : s.grade === 4 ? "deck-g4-t13-en" : "deck-g5-t07-en";
    completed[s.id] = ["s-g3-01", RAVI_ID, "s-g3-04", "s-g5-02"].includes(s.id) ? [] : [deckId];
  }
  return {
    version: VERSION,
    setup: structuredClone(CLASS_SETUP),
    topics,
    attendance,
    attendanceSubmitted: {},
    tests: structuredClone(TESTS),
    plans: { [WEEK_STARTS[3]]: current },
    alerts: seedAlerts(attendance),
    decks,
    completed,
    quizResults: {},
    priorities: [],
    sarvamCalls: 0,
  };
}

let state: DemoState | null = null;

export function db(): DemoState {
  if (state) return state;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as DemoState) : null;
    state = parsed && parsed.version === VERSION ? parsed : freshState();
  } catch {
    state = freshState();
  }
  return state;
}

export function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private mode or storage full: the demo still works, it just won't survive a reload
  }
}

export function resetDemo(): void {
  state = freshState();
  save();
}
