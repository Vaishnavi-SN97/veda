"""API shapes. Mirror frontend/lib/types.ts and docs/api-contract.md; JSON is camelCase."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Grade = Literal[3, 4, 5]
Language = Literal["en", "kn", "hi"]
SlotMode = Literal["teacher_led", "self_work", "peer_work", "reading"]
StudentTag = Literal["on_track", "didnt_study", "studied_but_confused"]


class Api(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- meta ----------

class Meta(Api):
    demo_mode: bool
    today: str
    this_week: str
    next_week: str
    demo_pin: str | None = None
    sarvam_enabled: bool = False
    voice_provider: Literal["browser", "sarvam"] = "browser"
    class_id: str | None = None  # demo class in demo mode, else the signed-in teacher's class


class CreateCourseIn(Api):
    grade: Grade


class RosterStudent(Api):
    student: "Student"
    pin: str | None = None  # shown to the teacher so children can sign in on the family phone
    email: str | None = None


class ImportResult(Api):
    added: int
    updated: int
    students: list[RosterStudent]
    student_link: str  # open this on the family phone (or share as QR) to reach this class's student page


class SyncResult(Api):
    pushed: int  # Veda quiz scores written to Classroom as grades
    pulled: int  # Classroom grades brought into Veda marks + mastery
    coursework: int
    message: str


class TtsIn(Api):
    text: str
    language: Language


class TtsOut(Api):
    audio: str  # base64
    mime: str
    cached: bool


class SttOut(Api):
    transcript: str
    language_code: str | None = None


class AiCallRow(Api):
    id: int
    created_at: str
    model: str
    purpose: str
    ok: bool
    error: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    input_chars: int = 0
    audio_seconds: float | None = None
    latency_ms: int | None = None
    est_cost_inr: float = 0


class AiModelUsage(Api):
    model: str
    calls: int
    failed: int
    est_cost_inr: float


class AiUsage(Api):
    sarvam_enabled: bool
    voice_provider: str
    total_calls: int  # real Sarvam calls (incl. failed), the running count
    failed_calls: int
    cache_hits: int
    placeholders: int
    est_cost_inr: float
    budget_inr: float
    by_model: list[AiModelUsage]
    recent: list[AiCallRow]


# ---------- class setup ----------

class ClassroomCourse(Api):
    id: str
    name: str
    section: str
    student_count: int


class LinkedCourse(Api):
    grade: Grade
    course: ClassroomCourse | None


class BreakSlot(Api):
    label: str
    start: str
    end: str


class SchoolHours(Api):
    start: str
    end: str
    period_minutes: int
    days: list[int]


class ClassSetup(Api):
    id: str
    name: str
    teacher_name: str
    grades: list[Grade]
    linked_courses: list[LinkedCourse]
    hours: SchoolHours
    breaks: list[BreakSlot]
    setup_complete: bool


# ---------- syllabus ----------

class Topic(Api):
    id: str
    grade: Grade
    chapter: str
    title: str
    order: int
    status: Literal["not_started", "in_progress", "done"]
    done_on: str | None = None


class TopicIn(Api):
    chapter: str
    title: str


class TopicsIn(Api):
    topics: list[TopicIn]


class SyllabusProgress(Api):
    grade: Grade
    done: int
    total: int
    percent: int
    current_topic: Topic | None = None


# ---------- students ----------

class Student(Api):
    id: str
    name: str
    grade: Grade
    avatar: str
    roll_no: int


# ---------- timetable ----------

class GradeSlot(Api):
    grade: Grade
    mode: SlotMode
    subject: str
    topic_id: str | None = None
    activity: str


class Merged(Api):
    chapter: str
    note: str


class Period(Api):
    id: str
    day: int
    index: int
    start: str
    end: str
    slots: list[GradeSlot]
    merged: Merged | None = None
    changed: bool = False


class WeekPlan(Api):
    week_start: str
    status: Literal["draft", "approved"]
    periods: list[Period]
    breaks: list[BreakSlot]
    notes: list[str]
    teacher_led_minutes: dict[str, int]


class ReplanRequest(Api):
    reason: Literal["rain_day", "many_absent", "teacher_on_duty"]
    day: int
    from_period_index: int | None = None


class MoveRequest(Api):
    from_period_id: str
    to_period_id: str


# ---------- attendance ----------

class AttendanceSheet(Api):
    date: str
    grade: Grade
    marks: dict[str, Literal["present", "absent"]]
    submitted: bool = False


class AttendanceSummary(Api):
    grade: Grade
    taken: bool
    present: int
    total: int


class VoiceNoteIn(Api):
    grade: Grade
    transcript: str


class VoiceNoteResult(Api):
    transcript: str
    absent_student_ids: list[str]


# ---------- marks ----------

class MarkEntry(Api):
    student_id: str
    topic_id: str
    score: float | None
    max_score: float


class MarksSheet(Api):
    grade: Grade
    topic_id: str
    test_name: str
    date: str
    max_score: float
    entries: list[MarkEntry]


# ---------- cards + quiz ----------

class TopicCard(Api):
    id: str
    title: str
    body: str
    example: str | None = None


class QuizQuestion(Api):
    id: str
    question: str
    options: list[str]
    answer_index: int
    explanation: str | None = None


class CardDeck(Api):
    id: str
    topic_id: str
    topic_title: str
    grade: Grade
    language: Language
    cards: list[TopicCard]
    quiz: list[QuizQuestion]
    status: Literal["draft", "sent"]
    cached: bool
    sent_at: str | None = None
    placeholder: bool = False


# ---------- insights ----------

class TopicMastery(Api):
    topic_id: str
    topic_title: str
    chapter: str
    percent: int


class WeeklyScore(Api):
    week_label: str
    percent: int


class TestMark(Api):
    test_name: str
    score: float
    max_score: float
    date: str


class StudentInsight(Api):
    student: Student
    attendance_percent: int
    days_missed: int
    mastery: list[TopicMastery]
    quiz_scores: list[WeeklyScore]
    tutor_minutes: list[WeeklyScore]
    test_marks: list[TestMark]
    tag: StudentTag
    tag_reason: str
    risk_score: int = 0


class StudentSummary(Api):
    student: Student
    tag: StudentTag
    last_quiz_percent: int | None
    attendance_percent: int


# ---------- alerts ----------

class Alert(Api):
    id: str
    grade: Grade
    student_id: str | None = None
    student_name: str | None = None
    title: str
    reasons: list[str]
    suggestion: str
    severity: Literal["high", "medium", "low"]
    status: Literal["open", "accepted", "dismissed"]
    created_at: str
    risk_score: int | None = None
    changes_plan: bool = False  # accepting adds an action to next week's plan
    ai_summary: str | None = None  # Sarvam's one friendly sentence about the reasons


class AlertAction(Api):
    action: Literal["accept", "edit", "dismiss"]
    suggestion: str | None = None


# ---------- dashboard / reports ----------

class Dashboard(Api):
    date: str
    day_label: str
    today_periods: list[Period]
    breaks: list[BreakSlot]
    plan_status: Literal["draft", "approved", "none"]
    attendance: list[AttendanceSummary]
    syllabus: list[SyllabusProgress]
    alerts: list[Alert]


class ReportRow(Api):
    student: Student
    attendance_percent: int
    average_quiz_percent: int
    average_test_percent: int
    tag: StudentTag


class GradePercent(Api):
    grade: Grade
    percent: int


class Report(Api):
    from_: str = Field(alias="from")
    to: str
    school_days: int
    attendance_by_grade: list[GradePercent]
    syllabus: list[SyllabusProgress]
    rows: list[ReportRow]


# ---------- student side ----------

class StudentProfile(Api):
    student: Student
    has_pin: bool


class LoginIn(Api):
    student_id: str
    pin: str


class LoginOut(Api):
    ok: bool
    token: str | None = None


class StudentToday(Api):
    student: Student
    decks: list[CardDeck]
    completed_deck_ids: list[str]


class QuizSubmission(Api):
    deck_id: str
    answers: list[int]


class QuizResult(Api):
    correct: int
    total: int
    percent: int


class TutorMessage(Api):
    role: Literal["student", "vidya"]
    text: str


class TutorRequest(Api):
    student_id: str
    topic_id: str | None = None
    language: Language
    history: list[TutorMessage]
    message: str


class TutorReply(Api):
    text: str
    suggestions: list[str]
    topic_id: str | None = None
    assessment: Literal["correct", "incorrect", "none"] = "none"
    placeholder: bool = False
