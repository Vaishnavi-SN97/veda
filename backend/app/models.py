"""Database tables. One teacher runs one multi-grade class; each grade links one Classroom course."""

from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, false, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Teacher(Base):
    __tablename__ = "teacher"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200), unique=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MultigradeClass(Base):
    __tablename__ = "multigrade_class"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teacher.id"))
    name: Mapped[str] = mapped_column(String(200))
    hours_start: Mapped[str] = mapped_column(String(5), default="09:30")
    hours_end: Mapped[str] = mapped_column(String(5), default="15:45")
    period_minutes: Mapped[int] = mapped_column(Integer, default=45)
    days: Mapped[list] = mapped_column(JSON, default=lambda: [1, 2, 3, 4, 5])
    breaks: Mapped[list] = mapped_column(JSON, default=list)  # [{label, start, end}]
    setup_complete: Mapped[bool] = mapped_column(Boolean, default=False)

    teacher: Mapped[Teacher] = relationship()
    grade_groups: Mapped[list["GradeGroup"]] = relationship(back_populates="klass", cascade="all, delete-orphan")


class GradeGroup(Base):
    """One grade inside the multi-grade class, linked to its own Google Classroom course."""

    __tablename__ = "grade_group"
    __table_args__ = (UniqueConstraint("class_id", "grade"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("multigrade_class.id"))
    grade: Mapped[int] = mapped_column(Integer)
    classroom_course_id: Mapped[str | None] = mapped_column(String(64))
    classroom_course_name: Mapped[str | None] = mapped_column(String(200))
    classroom_section: Mapped[str | None] = mapped_column(String(100))
    classroom_student_count: Mapped[int | None] = mapped_column(Integer)

    klass: Mapped[MultigradeClass] = relationship(back_populates="grade_groups")


class Student(Base):
    __tablename__ = "student"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("multigrade_class.id"))
    grade: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(120))
    avatar: Mapped[str] = mapped_column(String(32))
    roll_no: Mapped[int] = mapped_column(Integer)
    pin_hash: Mapped[str | None] = mapped_column(String(128))
    # 4-digit PIN for the shared family phone, shown to the teacher (low-stakes, child-friendly login)
    pin: Mapped[str | None] = mapped_column(String(8))
    classroom_user_id: Mapped[str | None] = mapped_column(String(64))
    email: Mapped[str | None] = mapped_column(String(200))


class Topic(Base):
    """A teachable unit from the textbook. Status is the class's progress (one class per deployment)."""

    __tablename__ = "topic"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    grade: Mapped[int] = mapped_column(Integer, index=True)
    chapter: Mapped[str] = mapped_column(String(200))
    chapter_order: Mapped[int] = mapped_column(Integer, default=0)
    order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300))
    source_text: Mapped[str | None] = mapped_column(Text)  # this topic's textbook pages, sent to AI one topic at a time
    source_pages: Mapped[str | None] = mapped_column(String(40))  # e.g. "149-152" (PDF pages)
    status: Mapped[str] = mapped_column(String(16), default="not_started")
    done_on: Mapped[date | None] = mapped_column(Date)


class TopicProgress(Base):
    """How far ONE class has got with a topic. Topics (the syllabus) are shared; progress is per class."""

    __tablename__ = "topic_progress"
    __table_args__ = (UniqueConstraint("class_id", "topic_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("multigrade_class.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topic.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="not_started")
    done_on: Mapped[date | None] = mapped_column(Date)


class DeckSend(Base):
    """A card deck sent to one class (decks are shared AI content; sending is per class)."""

    __tablename__ = "deck_send"
    __table_args__ = (UniqueConstraint("class_id", "deck_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("multigrade_class.id", ondelete="CASCADE"), index=True)
    deck_id: Mapped[str] = mapped_column(ForeignKey("card_deck.id", ondelete="CASCADE"))
    grade: Mapped[int] = mapped_column(Integer)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    classroom_course_id: Mapped[str | None] = mapped_column(String(64))
    classroom_topic_id: Mapped[str | None] = mapped_column(String(64))
    classroom_material_id: Mapped[str | None] = mapped_column(String(64))
    classroom_coursework_id: Mapped[str | None] = mapped_column(String(64))


class Timetable(Base):
    __tablename__ = "timetable"
    __table_args__ = (UniqueConstraint("class_id", "week_start"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("multigrade_class.id"))
    week_start: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    notes: Mapped[list] = mapped_column(JSON, default=list)
    teacher_led_minutes: Mapped[dict] = mapped_column(JSON, default=dict)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    periods: Mapped[list["Period"]] = relationship(back_populates="timetable", cascade="all, delete-orphan", order_by="(Period.day, Period.index)")


class Period(Base):
    __tablename__ = "period"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    timetable_id: Mapped[int] = mapped_column(ForeignKey("timetable.id", ondelete="CASCADE"))
    day: Mapped[int] = mapped_column(Integer)
    index: Mapped[int] = mapped_column(Integer)
    start: Mapped[str] = mapped_column(String(5))
    end: Mapped[str] = mapped_column(String(5))
    slots: Mapped[list] = mapped_column(JSON)  # [{grade, mode, subject, topicId, activity}]
    merged_chapter: Mapped[str | None] = mapped_column(String(200))
    merged_note: Mapped[str | None] = mapped_column(Text)
    changed: Mapped[bool] = mapped_column(Boolean, default=False)

    timetable: Mapped[Timetable] = relationship(back_populates="periods")


class PlanEdit(Base):
    """Audit trail of plan changes, and actions queued for a future week (from accepted alerts)."""

    __tablename__ = "plan_edit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("multigrade_class.id"))
    week_start: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(24))  # generate | move | replan | approve | alert_action
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("student_id", "date"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("student.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(8))  # present | absent


class Mark(Base):
    __tablename__ = "marks"
    __table_args__ = (UniqueConstraint("student_id", "topic_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("student.id"), index=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topic.id"), index=True)
    test_name: Mapped[str] = mapped_column(String(200))
    date: Mapped[date] = mapped_column(Date)
    score: Mapped[float] = mapped_column(Float)
    max_score: Mapped[float] = mapped_column(Float)


class CardDeck(Base):
    __tablename__ = "card_deck"
    __table_args__ = (UniqueConstraint("topic_id", "language"),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topic.id"), index=True)
    language: Mapped[str] = mapped_column(String(2))
    topic_title: Mapped[str] = mapped_column(String(300))
    cards: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(8), default="draft")
    placeholder: Mapped[bool] = mapped_column(Boolean, default=False)  # true until Sarvam writes real content
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    classroom_material_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    quiz: Mapped["Quiz | None"] = relationship(back_populates="deck", uselist=False, cascade="all, delete-orphan")


class Quiz(Base):
    """A 5-question quiz. Weekly class quizzes (seed) have no deck; topic quizzes belong to a deck."""

    __tablename__ = "quiz"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    deck_id: Mapped[str | None] = mapped_column(ForeignKey("card_deck.id", ondelete="CASCADE"), unique=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topic.id"), index=True)
    grade: Mapped[int] = mapped_column(Integer)
    week_start: Mapped[date] = mapped_column(Date)
    questions: Mapped[list] = mapped_column(JSON)  # [{id, question, options[4], answerIndex, explanation}]
    classroom_coursework_id: Mapped[str | None] = mapped_column(String(64))

    deck: Mapped[CardDeck | None] = relationship(back_populates="quiz")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempt"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    quiz_id: Mapped[str] = mapped_column(ForeignKey("quiz.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("student.id"), index=True)
    taken_on: Mapped[date] = mapped_column(Date)
    answers: Mapped[list] = mapped_column(JSON, default=list)
    correct: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    percent: Mapped[int] = mapped_column(Integer)


class Mastery(Base):
    __tablename__ = "mastery"
    __table_args__ = (UniqueConstraint("student_id", "topic_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("student.id"), index=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topic.id"))
    percent: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class TutorSession(Base):
    __tablename__ = "tutor_session"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("student.id"), index=True)
    topic_id: Mapped[str | None] = mapped_column(ForeignKey("topic.id"))
    language: Mapped[str] = mapped_column(String(2), default="en")
    started_on: Mapped[date] = mapped_column(Date, index=True)
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    messages: Mapped[list] = mapped_column(JSON, default=list)


class Alert(Base):
    __tablename__ = "alert"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("multigrade_class.id"))
    grade: Mapped[int] = mapped_column(Integer)
    student_id: Mapped[str | None] = mapped_column(ForeignKey("student.id"))
    kind: Mapped[str] = mapped_column(String(16))  # student | syllabus
    title: Mapped[str] = mapped_column(String(300))
    reasons: Mapped[list] = mapped_column(JSON)
    suggestion: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(8))
    risk_score: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Sarvam's friendly wording of the reasons; regenerated only when ai_key (title/severity/score band) changes
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_key: Mapped[str | None] = mapped_column(String(64))
    suggestion_edited: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())  # teacher's own words win


class AiCache(Base):
    """Small cache for AI results that aren't decks: planner activity lines, alert wording, TTS audio."""

    __tablename__ = "ai_cache"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)  # activities | alert | tts
    value: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AiCallLog(Base):
    """Every AI call (or placeholder standing in for one), so the ₹100 Sarvam budget is visible."""

    __tablename__ = "ai_call_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    model: Mapped[str] = mapped_column(String(60))
    purpose: Mapped[str] = mapped_column(String(200))
    input_chars: Mapped[int] = mapped_column(Integer, default=0)
    output_chars: Mapped[int] = mapped_column(Integer, default=0)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
    est_cost_inr: Mapped[float] = mapped_column(Float, default=0.0)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    audio_seconds: Mapped[float | None] = mapped_column(Float)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    ok: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    error: Mapped[str | None] = mapped_column(String(300))
