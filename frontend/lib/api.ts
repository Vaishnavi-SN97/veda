// The ONLY place screens get data from: the FastAPI backend described in docs/api-contract.md.
// Base URL: NEXT_PUBLIC_API_URL (default http://localhost:8000).

import type {
  AiUsage,
  Alert,
  AlertAction,
  AttendanceSheet,
  CardDeck,
  ClassSetup,
  ClassroomCourse,
  Dashboard,
  Grade,
  ImportResult,
  Language,
  MarksSheet,
  Meta,
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
  SyncResult,
  Topic,
  TutorReply,
  TutorRequest,
  VoiceNoteResult,
  WeekPlan,
} from "./types";

// Same-origin proxy (frontend/app/api/backend) -> FastAPI. The proxy adds the Google token server-side.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

export const API_ERROR_EVENT = "veda-api-error";
export const OFFLINE_EVENT = "veda-offline";

export type ApiErrorCode = "google_expired" | "signed_out" | "google_permission" | "api_disabled" | "offline" | "proxy" | string;

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ApiErrorCode) {
    super(message);
  }
}

function report(message: string, code?: ApiErrorCode) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: { message, code } }));
}

function notifyOffline(on: boolean) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OFFLINE_EVENT, { detail: on }));
}

// Last good copy of every GET, so screens still work with no internet (and the student's cards work offline).
const CACHE_PREFIX = "veda-cache:";
function cacheGet<T>(path: string): T | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + path);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function cachePut(path: string, data: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(data));
  } catch {
    // storage full or blocked: offline copy just isn't kept
  }
}

async function http<T>(method: string, path: string, body?: unknown, opts: { allow404?: boolean; quiet?: boolean } = {}): Promise<T> {
  const isGet = method === "GET";
  const offlineFallback = (): T => {
    const cached = isGet ? cacheGet<T>(path) : undefined;
    if (cached !== undefined) {
      notifyOffline(true);
      return cached;
    }
    const msg = "No connection to Veda right now, and nothing saved for this screen yet. Try again when you're online.";
    if (!opts.quiet) report(msg, "offline");
    throw new ApiError(msg, 0, "offline");
  };

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return offlineFallback();
  }
  if (res.status === 404 && opts.allow404) return null as T;
  if (!res.ok) {
    let detail = `${method} ${path} failed (${res.status})`;
    let code: ApiErrorCode | undefined;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") detail = j.detail;
      code = j.code;
    } catch {
      // not JSON
    }
    if (code === "offline" || res.status === 503) return offlineFallback();
    if (!opts.quiet) report(detail, code);
    throw new ApiError(detail, res.status, code);
  }
  const data = (await res.json()) as T;
  if (isGet) {
    cachePut(path, data);
    notifyOffline(false);
  }
  return data;
}

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

// ---------- meta (today, weeks, demo) ----------

let metaPromise: Promise<Meta> | null = null;
export const getMeta = (): Promise<Meta> => {
  metaPromise ??= http<Meta>("GET", "/api/meta").catch((e) => {
    metaPromise = null;
    throw e;
  });
  return metaPromise;
};

// ---------- class setup ----------

export const getClass = (): Promise<ClassSetup> => http("GET", "/api/class");
export const saveClass = (setup: ClassSetup): Promise<ClassSetup> => http("PUT", "/api/class", setup);
export const listClassroomCourses = (): Promise<ClassroomCourse[]> => http("GET", "/api/classroom/courses");

// ---------- syllabus ----------

export const getTopics = (grade?: Grade): Promise<Topic[]> => http("GET", `/api/topics${q({ grade })}`);
export const saveTopics = (grade: Grade, topics: { chapter: string; title: string }[]): Promise<Topic[]> =>
  http("PUT", `/api/topics${q({ grade })}`, { topics });
export const markTopicDone = (topicId: string): Promise<Topic> => http("POST", `/api/topics/${topicId}/done`);

// ---------- students ----------

export const getStudents = (grade?: Grade): Promise<Student[]> => http("GET", `/api/students${q({ grade })}`);

// ---------- dashboard ----------

export const getDashboard = (): Promise<Dashboard> => http("GET", "/api/dashboard");

// ---------- timetable ----------

export const getWeekPlan = (weekStart: string): Promise<WeekPlan | null> => http("GET", `/api/plans/${weekStart}`, undefined, { allow404: true });
export const generateWeek = (weekStart: string): Promise<WeekPlan> => http("POST", `/api/plans/${weekStart}/generate`);
export const movePeriod = (weekStart: string, req: MoveRequest): Promise<WeekPlan> => http("POST", `/api/plans/${weekStart}/move`, req);
export const replanWeek = (weekStart: string, req: ReplanRequest): Promise<WeekPlan> => http("POST", `/api/plans/${weekStart}/replan`, req);
export const approveWeek = (weekStart: string): Promise<WeekPlan> => http("POST", `/api/plans/${weekStart}/approve`);

// ---------- attendance ----------

/** date defaults to the server's today */
export const getAttendance = (grade: Grade, date?: string): Promise<AttendanceSheet> => http("GET", `/api/attendance${q({ grade, date })}`);
export const saveAttendance = (sheet: AttendanceSheet): Promise<AttendanceSheet> => http("PUT", "/api/attendance", sheet);
export const readVoiceNote = (grade: Grade, transcript: string): Promise<VoiceNoteResult> =>
  http("POST", "/api/attendance/voice", { grade, transcript });

// ---------- marks ----------

export const getMarks = (grade: Grade, topicId: string): Promise<MarksSheet> => http("GET", `/api/marks${q({ grade, topicId })}`);
export const saveMarks = (sheet: MarksSheet): Promise<MarksSheet> => http("PUT", "/api/marks", sheet);

// ---------- cards + quiz ----------

export const getDeck = (topicId: string, language: Language): Promise<CardDeck> => http("GET", `/api/decks${q({ topicId, language })}`);
export const saveDeck = (deck: CardDeck): Promise<CardDeck> => http("PUT", `/api/decks/${deck.id}`, deck);
export const sendDeck = (deck: CardDeck): Promise<CardDeck> => http("POST", `/api/decks/${deck.id}/send`, deck);
/** The only way a saved deck is written again (one Sarvam call). */
export const regenerateDeck = (deckId: string): Promise<CardDeck> => http("POST", `/api/decks/${deckId}/regenerate`);

// ---------- insights ----------

export const listStudentSummaries = (grade?: Grade): Promise<StudentSummary[]> => http("GET", `/api/insights/students${q({ grade })}`);
export const getStudentInsight = (studentId: string): Promise<StudentInsight> => http("GET", `/api/insights/students/${studentId}`);

// ---------- alerts ----------

export const getAlerts = (): Promise<Alert[]> => http("GET", "/api/alerts");
export const actOnAlert = (id: string, act: AlertAction): Promise<Alert> => http("POST", `/api/alerts/${id}`, act);

// ---------- reports ----------

export const getReport = (): Promise<Report> => http("GET", "/api/reports");

/** Download the school-office report as a PDF file. */
export async function downloadReportPdf(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/reports/pdf`);
  } catch {
    const msg = "No connection: the PDF needs the Veda server. Try again when you're online.";
    report(msg, "offline");
    throw new ApiError(msg, 0, "offline");
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    report(j.detail ?? `Couldn't make the PDF (${res.status}).`, j.code);
    throw new ApiError(j.detail ?? "PDF failed", res.status, j.code);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "veda-report.pdf";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ---------- Google Classroom (real mode) ----------

export const createClassroomCourse = (grade: Grade): Promise<ClassroomCourse> => http("POST", "/api/classroom/courses", { grade });
export const importRosters = (): Promise<ImportResult> => http("POST", "/api/classroom/import-rosters");
export const getRoster = (): Promise<ImportResult> => http("GET", "/api/students/roster");
export const syncClassroomGrades = (): Promise<SyncResult> => http("POST", "/api/classroom/sync");

// ---------- student side (shared family phone) ----------

const CLASS_KEY = "veda-class-id";
/** The class this phone belongs to: from the teacher's link (?class=…) or remembered from last time. */
export function studentClassId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const fromUrl = new URLSearchParams(window.location.search).get("class");
  try {
    if (fromUrl) localStorage.setItem(CLASS_KEY, fromUrl);
    return fromUrl ?? localStorage.getItem(CLASS_KEY) ?? undefined;
  } catch {
    return fromUrl ?? undefined;
  }
}

export const listProfiles = (classId?: string): Promise<StudentProfile[]> => http("GET", `/api/student/profiles${q({ classId })}`);
export const studentLogin = (studentId: string, pin: string): Promise<boolean> =>
  http<{ ok: boolean }>("POST", "/api/student/login", { studentId, pin }).then((r) => r.ok);
export const getStudentToday = (studentId: string): Promise<StudentToday> => http("GET", `/api/student/${studentId}/today`);
export const askTutor = (req: TutorRequest): Promise<TutorReply> => http("POST", "/api/tutor", req);

// Quizzes finished offline wait here and are sent when the phone is back online.
const OUTBOX = "veda-quiz-outbox";
type Pending = { studentId: string; sub: QuizSubmission };
function outbox(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]");
  } catch {
    return [];
  }
}
function setOutbox(items: Pending[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(items));
  } catch {
    // ignore
  }
}

/** Submit a quiz; offline, the score is worked out on the phone and the answers are sent later. */
export async function submitQuiz(studentId: string, sub: QuizSubmission, deck?: CardDeck): Promise<QuizResult & { queued?: boolean }> {
  try {
    return await http<QuizResult>("POST", `/api/student/${studentId}/quiz`, sub, { quiet: true });
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "offline" || !deck) throw e;
    setOutbox([...outbox(), { studentId, sub }]);
    const correct = deck.quiz.filter((qq, i) => sub.answers[i] === qq.answerIndex).length;
    return { correct, total: deck.quiz.length, percent: Math.round((100 * correct) / deck.quiz.length), queued: true };
  }
}

/** Send quizzes that were finished offline. Returns how many were sent. */
export async function flushQuizOutbox(): Promise<number> {
  const items = outbox();
  let sent = 0;
  const left: Pending[] = [];
  for (const it of items) {
    try {
      await http("POST", `/api/student/${it.studentId}/quiz`, it.sub, { quiet: true });
      sent++;
    } catch {
      left.push(it);
    }
  }
  setOutbox(left);
  return sent;
}

// ---------- voice (VOICE_PROVIDER=sarvam) ----------

/** Saaras speech-to-text. Audio must be under 30 seconds. */
export async function speechToText(audio: Blob, language: Language | "unknown", seconds: number): Promise<{ transcript: string; languageCode?: string | null }> {
  const form = new FormData();
  const ext = audio.type.includes("wav") ? "wav" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("file", audio, `speech.${ext}`);
  form.append("language", language);
  form.append("seconds", String(Math.round(seconds * 10) / 10));
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/voice/stt`, { method: "POST", body: form });
  } catch {
    const msg = "No connection: speaking needs the internet. You can type instead.";
    report(msg, "offline");
    throw new ApiError(msg, 0, "offline");
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const detail = (j.detail as string) ?? `Speech-to-text failed (${res.status})`;
    report(detail, j.code);
    throw new ApiError(detail, res.status, j.code);
  }
  return res.json();
}

/** Bulbul text-to-speech (cached on the server by exact text). */
export const textToSpeech = (text: string, language: Language): Promise<{ audio: string; mime: string; cached: boolean }> =>
  http("POST", "/api/voice/tts", { text, language });

// ---------- admin ----------

export const getAiUsage = (): Promise<AiUsage> => http("GET", "/api/admin/ai-usage");

// ---------- demo only ----------

export const resetDemo = (): Promise<unknown> => http("POST", "/api/demo/reset");
