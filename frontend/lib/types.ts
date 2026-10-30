// Veda RuralClass API contract.
// Mirrored in docs/api-contract.md. Change both together.
// Dates are ISO strings: "2026-10-30" for days, full ISO for timestamps. Times are "HH:MM".

export type Grade = 3 | 4 | 5;
export const GRADES: Grade[] = [3, 4, 5];

export type Language = "en" | "kn" | "hi";

// ---------- Meta ----------

export interface Meta {
  demoMode: boolean;
  today: string; // the server's "today" (fixed to 2026-10-30 in demo mode)
  thisWeek: string; // Monday
  nextWeek: string;
  demoPin: string | null;
  sarvamEnabled: boolean;
  voiceProvider: "browser" | "sarvam"; // VOICE_PROVIDER in the root .env
  classId: string | null; // demo class in demo mode
}

export interface RosterStudent {
  student: Student;
  pin?: string | null; // 4-digit PIN for the family phone (teacher-only view)
  email?: string | null;
}

export interface ImportResult {
  added: number;
  updated: number;
  students: RosterStudent[];
  studentLink: string; // open on the family phone: /student?class=…
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  coursework: number;
  message: string;
}

export interface AiCallRow {
  id: number;
  createdAt: string;
  model: string;
  purpose: string;
  ok: boolean;
  error?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputChars: number;
  audioSeconds?: number | null;
  latencyMs?: number | null;
  estCostInr: number;
}

export interface AiUsage {
  sarvamEnabled: boolean;
  voiceProvider: string;
  totalCalls: number; // real Sarvam calls, the running count
  failedCalls: number;
  cacheHits: number;
  placeholders: number;
  estCostInr: number;
  budgetInr: number;
  byModel: { model: string; calls: number; failed: number; estCostInr: number }[];
  recent: AiCallRow[];
}

// ---------- Class setup ----------

export interface ClassroomCourse {
  id: string; // Google Classroom course id
  name: string;
  section: string;
  studentCount: number;
}

export interface LinkedCourse {
  grade: Grade;
  course: ClassroomCourse | null;
}

export interface BreakSlot {
  label: string;
  start: string;
  end: string;
}

export interface SchoolHours {
  start: string;
  end: string;
  periodMinutes: number;
  days: number[]; // 1 = Monday ... 6 = Saturday
}

export interface ClassSetup {
  id: string;
  name: string;
  teacherName: string;
  grades: Grade[];
  linkedCourses: LinkedCourse[];
  hours: SchoolHours;
  breaks: BreakSlot[];
  setupComplete: boolean;
}

// ---------- Syllabus ----------

export type TopicStatus = "not_started" | "in_progress" | "done";

export interface Topic {
  id: string;
  grade: Grade;
  chapter: string; // textbook chapter, e.g. "Fractional Numbers"
  title: string; // teachable unit inside the chapter
  order: number;
  status: TopicStatus;
  doneOn?: string;
}

export interface SyllabusProgress {
  grade: Grade;
  done: number;
  total: number;
  percent: number;
  currentTopic?: Topic;
}

// ---------- Students ----------

export interface Student {
  id: string;
  name: string;
  grade: Grade;
  avatar: string; // picture key, shown on the shared-phone profile picker
  rollNo: number;
}

// ---------- Timetable ----------

export type SlotMode = "teacher_led" | "self_work" | "peer_work" | "reading";

export interface GradeSlot {
  grade: Grade;
  mode: SlotMode;
  subject: string;
  topicId?: string;
  activity: string; // plain-language instruction for this grade in this period
}

export interface Period {
  id: string;
  day: number; // 1 = Monday
  index: number; // period number within the day, 0-based, lessons only
  start: string;
  end: string;
  slots: GradeSlot[]; // one per grade
  merged?: {
    // cross-grade session: one topic, three levels, teacher leads all grades together
    chapter: string;
    note: string;
  };
  changed?: boolean; // set by replan so the UI can highlight what moved
}

export type PlanStatus = "draft" | "approved";

export interface WeekPlan {
  weekStart: string; // Monday
  status: PlanStatus;
  periods: Period[];
  breaks: BreakSlot[];
  notes: string[]; // why the solver chose this plan, in plain language
  teacherLedMinutes: Record<Grade, number>;
}

export type ReplanReason = "rain_day" | "many_absent" | "teacher_on_duty";

export interface ReplanRequest {
  reason: ReplanReason;
  day: number;
  fromPeriodIndex?: number;
}

export interface MoveRequest {
  fromPeriodId: string;
  toPeriodId: string;
}

// ---------- Attendance ----------

export type AttendanceStatus = "present" | "absent";

export interface AttendanceSheet {
  date: string;
  grade: Grade;
  marks: Record<string, AttendanceStatus>; // studentId -> status
  submitted: boolean;
}

export interface AttendanceSummary {
  grade: Grade;
  taken: boolean;
  present: number;
  total: number;
}

export interface VoiceNoteResult {
  transcript: string;
  absentStudentIds: string[]; // names the teacher read out, matched to the roster
}

// ---------- Marks ----------

export interface MarkEntry {
  studentId: string;
  topicId: string;
  score: number | null; // null = not entered
  maxScore: number;
}

export interface MarksSheet {
  grade: Grade;
  topicId: string;
  testName: string;
  date: string;
  maxScore: number;
  entries: MarkEntry[];
}

// ---------- Cards + quiz ----------

export interface TopicCard {
  id: string;
  title: string;
  body: string;
  example?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[]; // always 4
  answerIndex: number;
  explanation?: string;
}

export interface CardDeck {
  id: string;
  topicId: string;
  topicTitle: string;
  grade: Grade;
  language: Language;
  cards: TopicCard[];
  quiz: QuizQuestion[]; // always 5
  status: "draft" | "sent";
  cached: boolean; // true = no AI call was made to produce this
  sentAt?: string;
  placeholder?: boolean; // true = stand-in text until Sarvam writes the real cards
}

// ---------- Insights ----------

export type StudentTag = "on_track" | "didnt_study" | "studied_but_confused";

export interface TopicMastery {
  topicId: string;
  topicTitle: string;
  chapter: string;
  percent: number; // 0-100
}

export interface WeeklyScore {
  weekLabel: string; // "Week 1"
  percent: number;
}

export interface StudentInsight {
  student: Student;
  attendancePercent: number;
  daysMissed: number;
  mastery: TopicMastery[];
  quizScores: WeeklyScore[];
  tutorMinutes: WeeklyScore[]; // percent field holds minutes
  testMarks: { testName: string; score: number; maxScore: number; date: string }[];
  tag: StudentTag;
  tagReason: string;
  riskScore?: number; // 0-100, see backend/app/risk.py
}

export interface StudentSummary {
  student: Student;
  tag: StudentTag;
  lastQuizPercent: number | null;
  attendancePercent: number;
}

// ---------- Alerts ----------

export type AlertStatus = "open" | "accepted" | "dismissed";

export interface Alert {
  id: string;
  grade: Grade;
  studentId?: string;
  studentName?: string;
  title: string; // plain language: "Ravi is falling behind in fractions"
  reasons: string[];
  suggestion: string; // the next step the teacher can accept or edit
  severity: "high" | "medium" | "low";
  status: AlertStatus;
  createdAt: string;
  riskScore?: number | null;
  changesPlan?: boolean; // accepting adds an action to next week's plan
  aiSummary?: string | null; // Sarvam's one friendly sentence about the reasons
}

export type AlertAction =
  | { action: "accept" }
  | { action: "edit"; suggestion: string }
  | { action: "dismiss" };

// ---------- Dashboard ----------

export interface Dashboard {
  date: string;
  dayLabel: string;
  todayPeriods: Period[];
  breaks: BreakSlot[];
  planStatus: PlanStatus | "none";
  attendance: AttendanceSummary[];
  syllabus: SyllabusProgress[];
  alerts: Alert[];
}

// ---------- Reports ----------

export interface ReportRow {
  student: Student;
  attendancePercent: number;
  averageQuizPercent: number;
  averageTestPercent: number;
  tag: StudentTag;
}

export interface Report {
  from: string;
  to: string;
  schoolDays: number;
  attendanceByGrade: { grade: Grade; percent: number }[];
  syllabus: SyllabusProgress[];
  rows: ReportRow[];
}

// ---------- Student side ----------

export interface StudentProfile {
  student: Student;
  hasPin: boolean;
}

export interface StudentToday {
  student: Student;
  decks: CardDeck[]; // decks sent by the teacher that the student hasn't finished
  completedDeckIds: string[];
}

export interface QuizSubmission {
  deckId: string;
  answers: number[];
}

export interface QuizResult {
  correct: number;
  total: number;
  percent: number;
}

export interface TutorMessage {
  role: "student" | "vidya";
  text: string;
}

export interface TutorRequest {
  studentId: string;
  topicId?: string;
  language: Language;
  history: TutorMessage[];
  message: string;
}

export interface TutorReply {
  text: string;
  suggestions: string[];
  topicId?: string | null;
  assessment?: "correct" | "incorrect" | "none";
  placeholder?: boolean;
}
