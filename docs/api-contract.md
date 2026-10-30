# Veda RuralClass: API contract

The FastAPI backend implements exactly this. The frontend calls it only through
`frontend/lib/api.ts`, and the exact field types are in `frontend/lib/types.ts`.
**Change all three together.**

- Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). All paths start with `/api`.
- JSON everywhere, **camelCase** field names (use Pydantic `alias_generator=to_camel`, `populate_by_name=True`).
- Dates are `"YYYY-MM-DD"`, times are `"HH:MM"`, timestamps are ISO 8601 with offset.
- `Grade` = `3 | 4 | 5`. `Language` = `"en" | "kn" | "hi"`. Days: `1` = Monday … `6` = Saturday.
- Auth: teacher via Google (NextAuth session → backend verifies the Google ID token).
  Student routes use the short-lived token from `/api/student/login`.
- "Not found" returns **404** (the frontend treats it as `null`, e.g. no plan for that week).
- With `DEMO_MODE=true` the backend serves seeded data and skips Google auth.

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
| GET | `/api/class` | | `ClassSetup` | |
| PUT | `/api/class` | `ClassSetup` | `ClassSetup` | setup wizard "Save and finish" |
| GET | `/api/classroom/courses` | | `ClassroomCourse[]` | teacher's Google Classroom courses |
| GET | `/api/topics?grade=` | | `Topic[]` | grade optional, sorted by grade, order |
| PUT | `/api/topics?grade=` | `{ topics: {chapter, title}[] }` | `Topic[]` | replaces that grade's list, keeps ids/status of unchanged topics |
| POST | `/api/topics/{id}/done` | | `Topic` | sets `done`, `doneOn`; next topic becomes `in_progress` |
| GET | `/api/students?grade=` | | `Student[]` | roster synced from Classroom |
| GET | `/api/dashboard?date=` | | `Dashboard` | |
| GET | `/api/plans/{weekStart}` | | `WeekPlan` or 404 | `weekStart` is a Monday |
| POST | `/api/plans/{weekStart}/generate` | | `WeekPlan` | CP-SAT; uses accepted-alert priorities; status `draft` |
| POST | `/api/plans/{weekStart}/move` | `MoveRequest` | `WeekPlan` | swaps two periods' content; status back to `draft` |
| POST | `/api/plans/{weekStart}/replan` | `ReplanRequest` | `WeekPlan` | marks changed periods `changed: true`, appends a note |
| POST | `/api/plans/{weekStart}/approve` | | `WeekPlan` | status `approved`, clears `changed` |
| GET | `/api/attendance?date=&grade=` | | `AttendanceSheet` | unmarked students default to `present` |
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
                  status: "draft"|"sent", cached, sentAt? }
TopicCard       { id, title, body, example? }
QuizQuestion    { id, question, options: string[4], answerIndex, explanation? }

StudentSummary  { student, tag, lastQuizPercent|null, attendancePercent }
StudentInsight  { student, attendancePercent, daysMissed, mastery: {topicId, topicTitle, chapter, percent}[],
                  quizScores: {weekLabel, percent}[], tutorMinutes: {weekLabel, percent(=minutes)}[],
                  testMarks: {testName, score, maxScore, date}[], tag, tagReason }
  tag = "on_track" | "didnt_study" | "studied_but_confused"
  rule: quiz falling 3 weeks or latest < 50% → confused if tutor minutes last week ≥ 20, else didnt_study

Alert           { id, grade, studentId?, studentName?, title, reasons: string[], suggestion,
                  severity: "high"|"medium"|"low", status: "open"|"accepted"|"dismissed", createdAt }
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
TutorReply      { text, suggestions: string[] }
```

## Demo seed (DEMO_MODE) the backend must reproduce

Same story as `frontend/lib/mock/seed.ts`: 25 students (G3: 8, G4: 9, G5: 8), school days
Mon–Fri 5–30 Oct 2026 (today = Fri 30 Oct, attendance not yet taken), weekly quizzes,
tutor minutes and unit tests. **Ravi (Grade 4)**: fraction quizzes 78 → 62 → 45 → 30%,
absent 13, 14, 20, 21 Oct, 6/20 in the Fractions class test, tutor minutes rising 20 → 42
(tag "studied but confused"). Also Kiran (G3, didn't study), Meena (G5, often absent),
and a Grade 5 syllabus-behind alert.
