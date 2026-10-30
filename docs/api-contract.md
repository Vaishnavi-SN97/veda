# Veda RuralClass: API contract

The FastAPI backend implements exactly this. The frontend calls it only through
`frontend/lib/api.ts`, and the exact field types are in `frontend/lib/types.ts`.
**Change all three together.**

- The frontend calls the same-origin proxy at `/api/backend`; the proxy forwards to the Render API
  base URL in `NEXT_PUBLIC_API_URL`. Backend endpoint paths all start with `/api`.
- JSON everywhere, **camelCase** field names (use Pydantic `alias_generator=to_camel`, `populate_by_name=True`).
- Dates are `"YYYY-MM-DD"`, times are `"HH:MM"`, timestamps are ISO 8601 with offset.
- `Grade` = `3 | 4 | 5`. `Language` = `"en" | "kn" | "hi"`. Days: `1` = Monday … `6` = Saturday.
- Auth: teacher via Google (NextAuth session → backend verifies the Google ID token).
  Student routes use the short-lived token from `/api/student/login`.
- "Not found" returns **404** (the frontend treats it as `null`, e.g. no plan for that week).
  Errors carry a plain-language `{"detail": "..."}` the frontend shows as-is; an impossible
  timetable returns **422**.
- With `DEMO_MODE=true` the backend serves seeded data and skips Google auth. "Today" is fixed
  to 2026-10-30; the frontend reads it from `GET /api/meta`, never from its own clock.
- Interactive docs of the running API: the backend host's `/docs` path.

## Rules the backend must keep

- **AI suggests, the teacher decides.** Plans start as `draft`; decks start as `draft`; alerts
  start as `open`. Nothing reaches students or Classroom until the teacher's approve/send/accept call.
- **Sarvam budget:** cache every generated deck by `(topicId, language)`; return the cached
  copy with `cached: true` and never regenerate it. Send ONE topic's textbook text per call.
  Log every call (model, purpose, sizes, cost estimate, cache hit/miss). All calls live in
  `backend/ai_client.py`.
- **Planner:** OR-Tools CP-SAT. No LLM in the solver; an LLM may only phrase `notes`.

## Endpoints

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/api/meta` | | `Meta` | `{demoMode, today, thisWeek, nextWeek, demoPin, sarvamEnabled, voiceProvider}` |
| POST | `/api/decks/{id}/regenerate` | | `CardDeck` | the ONLY way a saved deck is rewritten (1 Sarvam call) |
| POST | `/api/voice/stt` | multipart `file` (WAV preferred, ≤30 s), `language` (en/kn/hi/unknown), `seconds` | `{transcript, languageCode}` | Saaras; 409 unless `VOICE_PROVIDER=sarvam` |
| POST | `/api/voice/tts` | `{text, language}` | `{audio (base64), mime, cached}` | Bulbul; cached by exact text; 409 unless `VOICE_PROVIDER=sarvam` |
| GET | `/api/admin/ai-usage` | | `AiUsage` | running Sarvam call count, estimated ₹, by model, recent calls |
| POST | `/api/demo/reset` | | summary | demo only: re-runs the seed (~30 s) |
| GET | `/api/class` | | `ClassSetup` | |
| PUT | `/api/class` | `ClassSetup` | `ClassSetup` | setup wizard "Save and finish" |
| GET | `/api/classroom/courses` | | `ClassroomCourse[]` | teacher's Google Classroom courses |
| GET | `/api/topics?grade=` | | `Topic[]` | grade optional, sorted by grade, order |
| PUT | `/api/topics?grade=` | `{ topics: {chapter, title}[] }` | `Topic[]` | replaces that grade's list, keeps ids/status of unchanged topics |
| POST | `/api/topics/{id}/done` | | `Topic` | sets `done`, `doneOn`; next topic becomes `in_progress` |
| GET | `/api/students?grade=` | | `Student[]` | roster synced from Classroom |
| GET | `/api/dashboard?date=` | | `Dashboard` | |
| GET | `/api/plans/{weekStart}` | | `WeekPlan` or `null` | `weekStart` is a Monday; `null` = no plan yet |
| POST | `/api/plans/{weekStart}/generate` | | `WeekPlan` | CP-SAT; uses accepted-alert priorities; status `draft` |
| POST | `/api/plans/{weekStart}/move` | `MoveRequest` | `WeekPlan` | swaps two periods' content; status back to `draft` |
| POST | `/api/plans/{weekStart}/replan` | `ReplanRequest` | `WeekPlan` | marks changed periods `changed: true`, appends a note |
| POST | `/api/plans/{weekStart}/approve` | | `WeekPlan` | status `approved`, clears `changed` |
| GET | `/api/attendance?grade=&date=` | | `AttendanceSheet` | date optional (server's today); unmarked students default to `present` |
| PUT | `/api/attendance` | `AttendanceSheet` | `AttendanceSheet` | `submitted: true` |
| POST | `/api/attendance/voice` | `{ grade, transcript }` | `VoiceNoteResult` | later: multipart audio → Saaras → transcript |
| GET | `/api/marks?grade=&topicId=` | | `MarksSheet` | `score: null` = not entered |
| PUT | `/api/marks` | `MarksSheet` | `MarksSheet` | |
| GET | `/api/decks?topicId=&language=` | | `CardDeck` | cached or generated once (sarvam-105b); 4 cards + 5 questions |
| PUT | `/api/decks/{id}` | `CardDeck` | `CardDeck` | teacher edits |
| POST | `/api/decks/{id}/send` | `CardDeck` | `CardDeck` | posts cards as Classroom **material**, quiz as **coursework**; `status: sent` |
| GET | `/api/insights/students?grade=` | | `StudentSummary[]` | |
| GET | `/api/insights/students/{id}` | | `StudentInsight` | |
| GET | `/api/alerts` | | `Alert[]` | |
| POST | `/api/alerts/{id}` | `AlertAction` | `Alert` | `accept` on a learning alert adds a planner priority for next week |
| GET | `/api/reports` | | `Report` | (later `GET /api/reports/pdf` → `application/pdf`) |
| GET | `/api/student/profiles` | | `StudentProfile[]` | pictures for the shared-phone picker |
| POST | `/api/student/login` | `{ studentId, pin }` | `{ ok, token? }` | 4-digit PIN |
| GET | `/api/student/{id}/today` | | `StudentToday` | sent decks for the student's grade not yet completed |
| POST | `/api/student/{id}/quiz` | `QuizSubmission` | `QuizResult` | marks the deck completed, feeds mastery |
| POST | `/api/tutor` | `TutorRequest` | `TutorReply` | sarvam-105b-conversations, grounded in the topic text; later Bulbul TTS audio |

## Types (summary; exact definitions in `frontend/lib/types.ts`)

```ts
ClassSetup      { id, name, teacherName, grades: Grade[], linkedCourses: {grade, course: ClassroomCourse|null}[],
                  hours: {start, end, periodMinutes, days: number[]}, breaks: BreakSlot[], setupComplete }
ClassroomCourse { id, name, section, studentCount }
BreakSlot       { label, start, end }
Topic           { id, grade, chapter, title, order, status: "not_started"|"in_progress"|"done", doneOn? }
Student         { id, name, grade, avatar, rollNo }

WeekPlan        { weekStart, status: "draft"|"approved", periods: Period[], breaks: BreakSlot[], notes: string[],
                  teacherLedMinutes: {3: n, 4: n, 5: n} }
Period          { id, day, index, start, end, slots: GradeSlot[], merged?: {chapter, note}, changed? }
GradeSlot       { grade, mode: "teacher_led"|"self_work"|"peer_work"|"reading", subject, topicId?, activity }
MoveRequest     { fromPeriodId, toPeriodId }
ReplanRequest   { reason: "rain_day"|"many_absent"|"teacher_on_duty", day, fromPeriodIndex? }

AttendanceSheet { date, grade, marks: {studentId: "present"|"absent"}, submitted }
VoiceNoteResult { transcript, absentStudentIds: string[] }
MarksSheet      { grade, topicId, testName, date, maxScore, entries: {studentId, topicId, score|null, maxScore}[] }

CardDeck        { id, topicId, topicTitle, grade, language, cards: TopicCard[], quiz: QuizQuestion[],
                  status: "draft"|"sent", cached, sentAt?, placeholder? (true until Sarvam writes it) }
TopicCard       { id, title, body, example? }
QuizQuestion    { id, question, options: string[4], answerIndex, explanation? }

StudentSummary  { student, tag, lastQuizPercent|null, attendancePercent }
StudentInsight  { student, attendancePercent, daysMissed, mastery: {topicId, topicTitle, chapter, percent}[],
                  quizScores: {weekLabel, percent}[], tutorMinutes: {weekLabel, percent(=minutes)}[],
                  testMarks: {testName, score, maxScore, date}[], tag, tagReason, riskScore }
  tag = "on_track" | "didnt_study" | "studied_but_confused"
  rule: quiz falling 3 weeks or latest < 50% → confused if tutor minutes last week ≥ 20, else didnt_study
  weekLabel is the week's Monday, e.g. "5 Oct"

Alert           { id, grade, studentId?, studentName?, title, reasons: string[], suggestion,
                  severity: "high"|"medium"|"low", status: "open"|"accepted"|"dismissed", createdAt,
                  riskScore?, changesPlan (accepting adds an action to next week's plan) }
AlertAction     { action: "accept" } | { action: "edit", suggestion } | { action: "dismiss" }

Dashboard       { date, dayLabel, todayPeriods: Period[], breaks, planStatus: "draft"|"approved"|"none",
                  attendance: {grade, taken, present, total}[], syllabus: SyllabusProgress[], alerts: Alert[] (open only) }
SyllabusProgress{ grade, done, total, percent, currentTopic? }
Report          { from, to, schoolDays, attendanceByGrade: {grade, percent}[], syllabus: SyllabusProgress[],
                  rows: {student, attendancePercent, averageQuizPercent, averageTestPercent, tag}[] }

StudentProfile  { student, hasPin }
StudentToday    { student, decks: CardDeck[], completedDeckIds: string[] }
QuizSubmission  { deckId, answers: number[] }      QuizResult { correct, total, percent }
TutorRequest    { studentId, topicId?, language, history: {role: "student"|"vidya", text}[], message }
TutorReply      { text, suggestions: string[], topicId?, assessment?: "correct"|"incorrect"|"none", placeholder? }
                  (a "correct"/"incorrect" assessment of the child's answer updates mastery for topicId)
Alert also has  aiSummary? (Sarvam's one friendly sentence; suggestion becomes Sarvam's action unless the teacher edited it)
```

## Risk score (backend/app/risk.py)

0–100, the sum of four parts, each shown to the teacher as a reason:

| Part | Points |
|---|---|
| Quiz trend | 8 per consecutive weekly drop (max 3 → 24), +11 if latest quiz < 50% |
| Test marks | latest test < 40% → 25, < 60% → 12 |
| Attendance | 5 per day missed beyond the first, last 4 weeks, max 25 |
| Tutor | only while quiz or test points > 0: 0 min with Vidya last week → 15, < 10 min → 8 |

Severity: 60+ high, 35+ medium, 20+ low; under 20 no alert. A separate syllabus-pace alert fires
when a grade is 3+ topics behind an even pace from 1 Jun to 15 Dec.

## Demo seed (DEMO_MODE) the backend must reproduce

Implemented in `backend/app/demo_seed.py` on top of the imported textbook topics: 25 students (G3: 8, G4: 9, G5: 8), school days
Mon–Fri 5–30 Oct 2026 (today = Fri 30 Oct, attendance not yet taken), weekly quizzes,
tutor minutes and unit tests. **Ravi (Grade 4)**: fraction quizzes 78 → 62 → 45 → 30%,
absent 13, 14, 20, 21 Oct, 6/20 in the Fractions class test, tutor minutes rising 20 → 42
(tag "studied but confused"). Also Kiran (G3, didn't study), Meena (G5, often absent),
and a Grade 5 syllabus-behind alert.
