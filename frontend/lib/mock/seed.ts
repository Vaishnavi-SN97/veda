// Seeded demo data for DEMO_MODE. Deterministic: same data on every load.
// 25 students across Grades 3-5, 4 weeks (20 school days) of attendance, quizzes,
// tutor minutes and test marks. Ravi (Grade 4) is the early-warning story:
// fraction quiz scores fall 3 weeks in a row and he missed 4 days.

import type {
  AttendanceStatus,
  BreakSlot,
  ClassSetup,
  Grade,
  Student,
  Topic,
  TopicStatus,
} from "../types";

export const DEMO_TODAY = "2026-10-30"; // Friday
export const WEEK_STARTS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
export const NEXT_WEEK_START = "2026-11-02";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261030);

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Mon-Fri for the 4 demo weeks; the last one is today.
export const SCHOOL_DAYS: string[] = WEEK_STARTS.flatMap((w) =>
  [0, 1, 2, 3, 4].map((i) => addDays(w, i)),
);

// ---------- Class ----------

export const BREAKS: BreakSlot[] = [
  { label: "Short break", start: "11:00", end: "11:15" },
  { label: "Lunch (Bisiyoota)", start: "12:45", end: "13:30" },
];

export const CLASSROOM_COURSES = [
  { id: "cr-g3-2026", name: "Class 3 – GHPS Hosahalli", section: "2026-27", studentCount: 8 },
  { id: "cr-g4-2026", name: "Class 4 – GHPS Hosahalli", section: "2026-27", studentCount: 9 },
  { id: "cr-g5-2026", name: "Class 5 – GHPS Hosahalli", section: "2026-27", studentCount: 8 },
  { id: "cr-eng-club", name: "English Reading Club", section: "All", studentCount: 14 },
];

export const CLASS_SETUP: ClassSetup = {
  id: "class-hosahalli",
  name: "Hosahalli Multi-grade Room",
  teacherName: "Lakshmi",
  grades: [3, 4, 5],
  linkedCourses: [
    { grade: 3, course: CLASSROOM_COURSES[0] },
    { grade: 4, course: CLASSROOM_COURSES[1] },
    { grade: 5, course: CLASSROOM_COURSES[2] },
  ],
  hours: { start: "09:30", end: "15:45", periodMinutes: 45, days: [1, 2, 3, 4, 5] },
  breaks: BREAKS,
  setupComplete: true,
};

// ---------- Syllabus ----------
// Grades 3 and 4 follow the KTBS Mathematics Part I contents in docs/syllabus/.
// Grade 5 is a PLACEHOLDER until docs/syllabus/grade5.pdf is added.

type TopicSeed = [chapter: string, title: string, status: TopicStatus, doneOn?: string];

const G3: TopicSeed[] = [
  ["Shapes", "Shapes around us", "done", "2026-06-20"],
  ["Shapes", "Sides and corners", "done", "2026-06-27"],
  ["Numbers", "3-digit numbers and place value", "done", "2026-07-11"],
  ["Numbers", "Comparing and ordering numbers", "done", "2026-07-25"],
  ["Addition", "Adding 3-digit numbers", "done", "2026-08-14"],
  ["Addition", "Adding with carrying", "done", "2026-08-28"],
  ["Subtraction", "Subtracting 3-digit numbers", "done", "2026-09-18"],
  ["Subtraction", "Subtracting with borrowing", "done", "2026-10-09"],
  ["Multiplication", "Multiplication as repeated addition", "done", "2026-10-23"],
  ["Multiplication", "Tables from 6 to 10", "in_progress"],
  ["Multiplication", "Multiplying 2-digit numbers", "not_started"],
  ["Multiplication", "Lattice multiplication", "not_started"],
];

const G4: TopicSeed[] = [
  ["Perimeter and Area", "Perimeter of simple figures", "done", "2026-06-19"],
  ["Perimeter and Area", "Area by counting squares", "done", "2026-06-26"],
  ["Numbers", "4-digit numbers and place value", "done", "2026-07-10"],
  ["Addition", "Adding 4-digit numbers", "done", "2026-07-24"],
  ["Subtraction", "Subtracting 4-digit numbers", "done", "2026-08-07"],
  ["Multiplication", "Multiplying by 2-digit numbers", "done", "2026-08-21"],
  ["Division", "Division as equal sharing", "done", "2026-09-04"],
  ["Division", "Long division by 1-digit numbers", "done", "2026-09-18"],
  ["Circles", "Centre, radius and diameter", "done", "2026-09-25"],
  ["Mental Arithmetic", "Quick sums and differences", "done", "2026-10-02"],
  ["Fractional Numbers", "Meaning of a fraction", "done", "2026-10-09"],
  ["Fractional Numbers", "Numerator and denominator", "done", "2026-10-16"],
  ["Fractional Numbers", "Equivalent fractions", "done", "2026-10-23"],
  ["Fractional Numbers", "Decimals 0.1 to 0.9", "in_progress"],
];

const G5: TopicSeed[] = [
  ["Numbers", "Numbers up to lakhs", "done", "2026-06-26"],
  ["Numbers", "Roman numerals", "done", "2026-07-10"],
  ["Addition and Subtraction", "Large-number sums", "done", "2026-07-31"],
  ["Multiplication", "Multiplying 3-digit numbers", "done", "2026-08-21"],
  ["Division", "Dividing by 2-digit numbers", "done", "2026-09-11"],
  ["Factors and Multiples", "Factors and multiples", "done", "2026-10-02"],
  ["Fractions", "Like and unlike fractions", "done", "2026-10-16"],
  ["Fractions", "Adding like fractions", "in_progress"],
  ["Fractions", "Subtracting like fractions", "not_started"],
  ["Decimals", "Decimals and money", "not_started"],
  ["Geometry", "Angles", "not_started"],
  ["Measurement", "Length, weight and capacity", "not_started"],
];

function buildTopics(grade: Grade, seeds: TopicSeed[]): Topic[] {
  return seeds.map(([chapter, title, status, doneOn], i) => ({
    id: `g${grade}-t${String(i + 1).padStart(2, "0")}`,
    grade,
    chapter,
    title,
    order: i + 1,
    status,
    doneOn,
  }));
}

export const TOPICS: Topic[] = [
  ...buildTopics(3, G3),
  ...buildTopics(4, G4),
  ...buildTopics(5, G5),
];

export const RAVI_ID = "s-g4-01";
export const FRACTION_TOPIC_IDS = ["g4-t11", "g4-t12", "g4-t13", "g4-t14"]; // one per demo week

// ---------- Students ----------

const AVATARS = [
  "parrot", "elephant", "peacock", "tiger", "mango", "lotus", "rabbit", "fish", "star",
  "sun", "kite", "boat", "tree", "cow", "butterfly", "moon", "drum", "flower",
  "owl", "deer", "bus", "ball", "umbrella", "apple", "cat",
];

const NAMES: Record<Grade, string[]> = {
  3: ["Kiran", "Pooja", "Vishal", "Ramya", "Bharath", "Sneha", "Manju", "Divya"],
  4: ["Ravi", "Ananya", "Mohan", "Kavya", "Arjun", "Lakshmi", "Suresh", "Deepa", "Imran"],
  5: ["Shreya", "Ganesh", "Meena", "Rahul", "Asha", "Naveen", "Fathima", "Prakash"],
};

let avatarIdx = 0;
export const STUDENTS: Student[] = ([3, 4, 5] as Grade[]).flatMap((grade) =>
  NAMES[grade].map((name, i) => ({
    id: `s-g${grade}-${String(i + 1).padStart(2, "0")}`,
    name,
    grade,
    avatar: AVATARS[avatarIdx++],
    rollNo: i + 1,
  })),
);

// Per-student traits drive every generated number so the story is consistent.
interface Traits {
  ability: number; // typical quiz %
  absenceRate: number;
  tutorMinutes: number; // typical minutes per week
}

const TRAITS: Record<string, Traits> = {};
for (const s of STUDENTS) {
  TRAITS[s.id] = {
    ability: 62 + Math.round(rand() * 30),
    absenceRate: 0.03 + rand() * 0.06,
    tutorMinutes: 15 + Math.round(rand() * 45),
  };
}
// Kiran (Grade 3): doesn't open the app, scores slipping => "Didn't study"
TRAITS["s-g3-01"] = { ability: 48, absenceRate: 0.05, tutorMinutes: 0 };
// Ananya (Grade 4): strong in fractions, a good peer partner for Ravi
TRAITS["s-g4-02"] = { ability: 92, absenceRate: 0.0, tutorMinutes: 40 };
// Meena (Grade 5): absent often
TRAITS["s-g5-03"] = { ability: 70, absenceRate: 0.25, tutorMinutes: 20 };

// ---------- Attendance history (20 days, today not yet taken) ----------

const RAVI_ABSENT = new Set(["2026-10-13", "2026-10-14", "2026-10-20", "2026-10-21"]);

export const ATTENDANCE_HISTORY: Record<string, Record<string, AttendanceStatus>> = {};
for (const date of SCHOOL_DAYS) {
  if (date === DEMO_TODAY) continue;
  const day: Record<string, AttendanceStatus> = {};
  for (const s of STUDENTS) {
    let absent = rand() < TRAITS[s.id].absenceRate;
    if (s.id === RAVI_ID) absent = RAVI_ABSENT.has(date);
    day[s.id] = absent ? "absent" : "present";
  }
  ATTENDANCE_HISTORY[date] = day;
}

// ---------- Weekly quiz scores and tutor minutes ----------

export const WEEK_LABELS = ["Week 1", "Week 2", "Week 3", "Week 4"];

export const QUIZ_SCORES: Record<string, number[]> = {};
export const TUTOR_MINUTES: Record<string, number[]> = {};
for (const s of STUDENTS) {
  const t = TRAITS[s.id];
  QUIZ_SCORES[s.id] = [0, 1, 2, 3].map((w) =>
    Math.max(20, Math.min(100, Math.round(t.ability + (rand() - 0.5) * 16 + w))),
  );
  TUTOR_MINUTES[s.id] = [0, 1, 2, 3].map((w) =>
    t.tutorMinutes === 0 ? (w === 0 ? 5 : 0) : Math.round(t.tutorMinutes + (rand() - 0.5) * 12),
  );
}
// Ravi: fraction quizzes fall 3 weeks in a row while he keeps trying with Vidya
QUIZ_SCORES[RAVI_ID] = [78, 62, 45, 30];
TUTOR_MINUTES[RAVI_ID] = [20, 28, 35, 42];
// Kiran: falling and not studying
QUIZ_SCORES["s-g3-01"] = [58, 50, 44, 38];

// ---------- Unit test marks ----------

export interface SeedTest {
  id: string;
  grade: Grade;
  topicId: string;
  testName: string;
  date: string;
  maxScore: number;
  scores: Record<string, number>;
}

function makeTest(grade: Grade, topicId: string, testName: string, date: string, maxScore: number): SeedTest {
  const scores: Record<string, number> = {};
  for (const s of STUDENTS.filter((x) => x.grade === grade)) {
    const pct = TRAITS[s.id].ability + (rand() - 0.5) * 20;
    scores[s.id] = Math.max(2, Math.min(maxScore, Math.round((pct / 100) * maxScore)));
  }
  return { id: `test-${topicId}`, grade, topicId, testName, date, maxScore, scores };
}

export const TESTS: SeedTest[] = [
  makeTest(3, "g3-t08", "Subtraction unit test", "2026-10-09", 20),
  makeTest(4, "g4-t10", "Mental Arithmetic test", "2026-10-02", 20),
  makeTest(4, "g4-t13", "Fractions class test", "2026-10-23", 20),
  makeTest(5, "g5-t06", "Factors and Multiples test", "2026-10-02", 25),
];
TESTS[2].scores[RAVI_ID] = 6;
TESTS[2].scores["s-g4-02"] = 19;

export function traitsOf(studentId: string): Traits {
  return TRAITS[studentId];
}
