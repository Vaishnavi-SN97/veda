// The ONLY place screens get data from. In demo mode every call is answered by lib/mock;
// otherwise it calls the FastAPI backend described in docs/api-contract.md.
// Screens never import lib/mock directly, so switching to the real backend touches only this file.

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
  StudentToday,
  Topic,
  TutorReply,
  TutorRequest,
  VoiceNoteResult,
  WeekPlan,
} from "./types";
import * as mock from "./mock";
import { resetDemo as resetMock } from "./mock/store";
import { DEMO_TODAY, NEXT_WEEK_START, WEEK_STARTS } from "./mock/seed";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Demo calendar: "today" is fixed so the seeded story always lines up.
export const TODAY = DEMO_MODE ? DEMO_TODAY : new Date().toISOString().slice(0, 10);
export const THIS_WEEK = DEMO_MODE ? WEEK_STARTS[3] : mondayOf(TODAY);
export const NEXT_WEEK = DEMO_MODE ? NEXT_WEEK_START : addDays(THIS_WEEK, 7);

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(iso: string) {
  const day = new Date(iso + "T00:00:00Z").getUTCDay() || 7;
  return addDays(iso, 1 - day);
}

// Small delay so the demo feels like a network app and loading states get exercised.
function demo<T>(fn: () => T, ms = 120): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(structuredClone(fn()));
      } catch (e) {
        reject(e);
      }
    }, ms),
  );
}

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (res.status === 404) return null as T;
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

// ---------- Class setup ----------

export const getClass = (): Promise<ClassSetup> =>
  DEMO_MODE ? demo(mock.getClass) : http("GET", "/api/class");

export const saveClass = (setup: ClassSetup): Promise<ClassSetup> =>
  DEMO_MODE ? demo(() => mock.saveClass(setup)) : http("PUT", "/api/class", setup);

export const listClassroomCourses = (): Promise<ClassroomCourse[]> =>
  DEMO_MODE ? demo(mock.listClassroomCourses, 600) : http("GET", "/api/classroom/courses");

// ---------- Syllabus ----------

export const getTopics = (grade?: Grade): Promise<Topic[]> =>
  DEMO_MODE ? demo(() => mock.getTopics(grade)) : http("GET", `/api/topics${q({ grade })}`);

export const saveTopics = (grade: Grade, topics: { chapter: string; title: string }[]): Promise<Topic[]> =>
  DEMO_MODE ? demo(() => mock.saveTopics(grade, topics)) : http("PUT", `/api/topics${q({ grade })}`, { topics });

export const markTopicDone = (topicId: string): Promise<Topic> =>
  DEMO_MODE ? demo(() => mock.markTopicDone(topicId)) : http("POST", `/api/topics/${topicId}/done`);

// ---------- Students ----------

export const getStudents = (grade?: Grade): Promise<Student[]> =>
  DEMO_MODE ? demo(() => mock.getStudents(grade)) : http("GET", `/api/students${q({ grade })}`);

// ---------- Dashboard ----------

export const getDashboard = (): Promise<Dashboard> =>
  DEMO_MODE ? demo(mock.getDashboard) : http("GET", `/api/dashboard${q({ date: TODAY })}`);

// ---------- Timetable ----------

export const getWeekPlan = (weekStart: string): Promise<WeekPlan | null> =>
  DEMO_MODE ? demo(() => mock.getWeekPlan(weekStart)) : http("GET", `/api/plans/${weekStart}`);

export const generateWeek = (weekStart: string): Promise<WeekPlan> =>
  DEMO_MODE ? demo(() => mock.generateWeek(weekStart), 900) : http("POST", `/api/plans/${weekStart}/generate`);

export const movePeriod = (weekStart: string, req: MoveRequest): Promise<WeekPlan> =>
  DEMO_MODE ? demo(() => mock.moveInWeek(weekStart, req), 60) : http("POST", `/api/plans/${weekStart}/move`, req);

export const replanWeek = (weekStart: string, req: ReplanRequest): Promise<WeekPlan> =>
  DEMO_MODE ? demo(() => mock.replanWeek(weekStart, req), 700) : http("POST", `/api/plans/${weekStart}/replan`, req);

export const approveWeek = (weekStart: string): Promise<WeekPlan> =>
  DEMO_MODE ? demo(() => mock.approveWeek(weekStart)) : http("POST", `/api/plans/${weekStart}/approve`);

// ---------- Attendance ----------

export const getAttendance = (date: string, grade: Grade): Promise<AttendanceSheet> =>
  DEMO_MODE ? demo(() => mock.getAttendance(date, grade)) : http("GET", `/api/attendance${q({ date, grade })}`);

export const saveAttendance = (sheet: AttendanceSheet): Promise<AttendanceSheet> =>
  DEMO_MODE ? demo(() => mock.saveAttendance(sheet)) : http("PUT", "/api/attendance", sheet);

export const readVoiceNote = (grade: Grade, transcript: string): Promise<VoiceNoteResult> =>
  DEMO_MODE ? demo(() => mock.readVoiceNote(grade, transcript), 400) : http("POST", "/api/attendance/voice", { grade, transcript });

// ---------- Marks ----------

export const getMarks = (grade: Grade, topicId: string): Promise<MarksSheet> =>
  DEMO_MODE ? demo(() => mock.getMarks(grade, topicId)) : http("GET", `/api/marks${q({ grade, topicId })}`);

export const saveMarks = (sheet: MarksSheet): Promise<MarksSheet> =>
  DEMO_MODE ? demo(() => mock.saveMarks(sheet)) : http("PUT", "/api/marks", sheet);

// ---------- Cards + quiz ----------

export const getDeck = (topicId: string, language: Language): Promise<CardDeck> =>
  DEMO_MODE ? demo(() => mock.getDeck(topicId, language), 800) : http("GET", `/api/decks${q({ topicId, language })}`);

export const saveDeck = (deck: CardDeck): Promise<CardDeck> =>
  DEMO_MODE ? demo(() => mock.saveDeck(deck)) : http("PUT", `/api/decks/${deck.id}`, deck);

export const sendDeck = (deck: CardDeck): Promise<CardDeck> =>
  DEMO_MODE ? demo(() => mock.sendDeck(deck), 700) : http("POST", `/api/decks/${deck.id}/send`, deck);

// ---------- Insights ----------

export const listStudentSummaries = (grade?: Grade): Promise<StudentSummary[]> =>
  DEMO_MODE ? demo(() => mock.listStudentSummaries(grade)) : http("GET", `/api/insights/students${q({ grade })}`);

export const getStudentInsight = (studentId: string): Promise<StudentInsight> =>
  DEMO_MODE ? demo(() => mock.getStudentInsight(studentId)) : http("GET", `/api/insights/students/${studentId}`);

// ---------- Alerts ----------

export const getAlerts = (): Promise<Alert[]> =>
  DEMO_MODE ? demo(mock.getAlerts) : http("GET", "/api/alerts");

export const actOnAlert = (id: string, act: AlertAction): Promise<Alert> =>
  DEMO_MODE ? demo(() => mock.actOnAlert(id, act)) : http("POST", `/api/alerts/${id}`, act);

// ---------- Reports ----------

export const getReport = (): Promise<Report> =>
  DEMO_MODE ? demo(mock.getReport) : http("GET", "/api/reports");

// ---------- Student side ----------

export const listProfiles = (): Promise<StudentProfile[]> =>
  DEMO_MODE ? demo(mock.listProfiles) : http("GET", "/api/student/profiles");

export const studentLogin = (studentId: string, pin: string): Promise<boolean> =>
  DEMO_MODE
    ? demo(() => mock.studentLogin(studentId, pin), 300)
    : http<{ ok: boolean }>("POST", "/api/student/login", { studentId, pin }).then((r) => r.ok);

export const getStudentToday = (studentId: string): Promise<StudentToday> =>
  DEMO_MODE ? demo(() => mock.getStudentToday(studentId)) : http("GET", `/api/student/${studentId}/today`);

export const submitQuiz = (studentId: string, sub: QuizSubmission): Promise<QuizResult> =>
  DEMO_MODE ? demo(() => mock.submitQuiz(studentId, sub)) : http("POST", `/api/student/${studentId}/quiz`, sub);

export const askTutor = (req: TutorRequest): Promise<TutorReply> =>
  DEMO_MODE ? demo(() => mock.askTutor(req), 900) : http("POST", "/api/tutor", req);

// ---------- Demo only ----------

export const DEMO_PIN = mock.DEMO_PIN;
export const resetDemo = (): void => resetMock();
