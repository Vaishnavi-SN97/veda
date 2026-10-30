"""Domain logic shared by the API routes and the demo seed.

The database is remote (~150 ms a round trip), so class-wide numbers are computed from a
Snapshot loaded in a handful of queries, never one query per student.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import logging

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, defer, joinedload, selectinload

import ai_client

from . import config, models as m, schemas as s
from .planner import GRADES, PlanInput, PlannedPeriod, Priority, Slot, TopicRef, plan_week
from .risk import ALERT_THRESHOLD, Signals, score, tag_for, title_and_suggestion

TERM_START = date(2026, 6, 1)
TERM_END = date(2026, 12, 15)
WEEKS = 4  # insight and risk window


# ---------- calendar ----------

def this_week() -> date:
    return config.monday_of(config.today())


def next_week() -> date:
    return this_week() + timedelta(days=7)


def window_weeks() -> list[date]:
    w = this_week()
    return [w - timedelta(days=7 * k) for k in range(WEEKS - 1, -1, -1)]


def iso(d: date | datetime | None) -> str | None:
    return d.isoformat() if d else None


# ---------- class ----------

DEMO_CLASS_ID = "class-hosahalli"


def load_class(db: Session, *, class_id: str | None = None, teacher_id: str | None = None) -> m.MultigradeClass | None:
    q = select(m.MultigradeClass).options(joinedload(m.MultigradeClass.grade_groups), joinedload(m.MultigradeClass.teacher)).order_by(m.MultigradeClass.id)
    if class_id:
        q = q.where(m.MultigradeClass.id == class_id)
    if teacher_id:
        q = q.where(m.MultigradeClass.teacher_id == teacher_id)
    return db.execute(q).unique().scalars().first()


def class_to_schema(k: m.MultigradeClass) -> s.ClassSetup:
    groups = {g.grade: g for g in k.grade_groups}
    linked = []
    for grade in sorted(groups):
        g = groups[grade]
        course = (
            s.ClassroomCourse(id=g.classroom_course_id, name=g.classroom_course_name or "", section=g.classroom_section or "", student_count=g.classroom_student_count or 0)
            if g.classroom_course_id
            else None
        )
        linked.append(s.LinkedCourse(grade=grade, course=course))
    return s.ClassSetup(
        id=k.id,
        name=k.name,
        teacher_name=k.teacher.name,
        grades=sorted(groups),
        linked_courses=linked,
        hours=s.SchoolHours(start=k.hours_start, end=k.hours_end, period_minutes=k.period_minutes, days=k.days),
        breaks=[s.BreakSlot(**b) for b in k.breaks],
        setup_complete=k.setup_complete,
    )


# ---------- topics ----------

@dataclass
class TopicView:
    """A syllabus topic with ONE class's progress on it (the syllabus is shared, progress is per class)."""

    id: str
    grade: int
    chapter: str
    chapter_order: int
    order: int
    title: str
    source_pages: str | None
    status: str = "not_started"
    done_on: date | None = None


def topic_to_schema(t: TopicView) -> s.Topic:
    return s.Topic(id=t.id, grade=t.grade, chapter=t.chapter, title=t.title, order=t.order, status=t.status, done_on=iso(t.done_on))


def topics(db: Session, klass: m.MultigradeClass | None, grade: int | None = None) -> list[TopicView]:
    # source_text (whole textbook pages) is never loaded here; only single-topic AI calls need it
    q = select(m.Topic.id, m.Topic.grade, m.Topic.chapter, m.Topic.chapter_order, m.Topic.order, m.Topic.title, m.Topic.source_pages).order_by(m.Topic.grade, m.Topic.order)
    if grade:
        q = q.where(m.Topic.grade == grade)
    views = [TopicView(*row) for row in db.execute(q)]
    if klass is not None:
        prog = {tid: (st, d) for tid, st, d in db.execute(select(m.TopicProgress.topic_id, m.TopicProgress.status, m.TopicProgress.done_on).where(m.TopicProgress.class_id == klass.id))}
        for v in views:
            if v.id in prog:
                v.status, v.done_on = prog[v.id]
    return views


def set_progress(db: Session, klass: m.MultigradeClass, topic_id: str, status: str, done_on: date | None = None) -> None:
    row = db.scalar(select(m.TopicProgress).where(m.TopicProgress.class_id == klass.id, m.TopicProgress.topic_id == topic_id))
    if not row:
        row = m.TopicProgress(class_id=klass.id, topic_id=topic_id)
        db.add(row)
    row.status, row.done_on = status, done_on


def topic_refs(db: Session, klass: m.MultigradeClass) -> list[TopicRef]:
    return [TopicRef(t.id, t.grade, t.chapter, t.title, t.order, t.status) for t in topics(db, klass)]


def _current(own: list[TopicView]) -> TopicView | None:
    return next((t for t in own if t.status == "in_progress"), None) or next((t for t in own if t.status == "not_started"), None)


def current_topic(db: Session, klass: m.MultigradeClass, grade: int) -> TopicView | None:
    return _current(topics(db, klass, grade))


def syllabus_progress(all_topics: list[TopicView]) -> list[s.SyllabusProgress]:
    out = []
    for g in GRADES:
        own = [t for t in all_topics if t.grade == g]
        done = sum(t.status == "done" for t in own)
        cur = next((t for t in own if t.status == "in_progress"), None)
        out.append(s.SyllabusProgress(grade=g, done=done, total=len(own), percent=round(100 * done / len(own)) if own else 0, current_topic=topic_to_schema(cur) if cur else None))
    return out


def mark_topic_done(db: Session, klass: m.MultigradeClass, topic_id: str) -> TopicView:
    own = topics(db, klass, int(topic_id.split("-")[0].lstrip("g")) if topic_id.startswith("g") else None)
    t = next((x for x in own if x.id == topic_id), None)
    if not t:
        raise LookupError("Topic not found.")
    set_progress(db, klass, t.id, "done", config.today())
    t.status, t.done_on = "done", config.today()
    same = [x for x in own if x.grade == t.grade]
    if not any(x.status == "in_progress" for x in same):
        nxt = next((x for x in same if x.status == "not_started"), None)
        if nxt:
            set_progress(db, klass, nxt.id, "in_progress")
    return t


# ---------- plans ----------

def _period_to_planned(p: m.Period) -> PlannedPeriod:
    return PlannedPeriod(
        p.day, p.index, p.start, p.end, p.slots[0]["subject"],
        [Slot(x["grade"], x["mode"], x["subject"], x["activity"], x.get("topicId")) for x in p.slots],
        p.merged_chapter, p.merged_note, p.changed,
    )


def period_to_schema(p: m.Period) -> s.Period:
    return s.Period(
        id=p.id, day=p.day, index=p.index, start=p.start, end=p.end,
        slots=[s.GradeSlot(**x) for x in p.slots],
        merged=s.Merged(chapter=p.merged_chapter, note=p.merged_note or "") if p.merged_chapter else None,
        changed=p.changed,
    )


def plan_to_schema(t: m.Timetable, klass: m.MultigradeClass) -> s.WeekPlan:
    return s.WeekPlan(
        week_start=t.week_start.isoformat(),
        status=t.status,
        periods=[period_to_schema(p) for p in sorted(t.periods, key=lambda p: (p.day, p.index))],
        breaks=[s.BreakSlot(**b) for b in klass.breaks],
        notes=t.notes,
        teacher_led_minutes={str(k): v for k, v in t.teacher_led_minutes.items()},
    )


def get_timetable(db: Session, klass: m.MultigradeClass, week: date) -> m.Timetable | None:
    return db.scalar(select(m.Timetable).options(selectinload(m.Timetable.periods)).where(m.Timetable.class_id == klass.id, m.Timetable.week_start == week))


def _edits(db: Session, klass: m.MultigradeClass, week: date) -> list[m.PlanEdit]:
    return list(db.scalars(select(m.PlanEdit).where(m.PlanEdit.class_id == klass.id, m.PlanEdit.week_start == week).order_by(m.PlanEdit.id)))


def _plan_input(db: Session, klass: m.MultigradeClass, week: date, **extra) -> PlanInput:
    edits = _edits(db, klass, week)
    priorities = [Priority(e.payload["grade"], e.payload["reason"], e.payload["activity"]) for e in edits if e.kind == "alert_action"]
    unavailable: set[tuple[int, int]] = set()
    no_new: set[int] = set()
    for e in edits:
        if e.kind != "replan":
            continue
        p = e.payload
        if p["reason"] == "teacher_on_duty":
            unavailable |= {(p["day"], i) for i in range(p.get("fromPeriodIndex") or 0, 12)}
        else:
            no_new.add(p["day"])
    base = dict(
        days=klass.days, hours_start=klass.hours_start, hours_end=klass.hours_end, period_minutes=klass.period_minutes,
        breaks=klass.breaks, topics=topic_refs(db, klass), priorities=priorities, teacher_unavailable=unavailable, no_new_topic_days=no_new,
    )
    base.update(extra)
    return PlanInput(**base)


def save_plan(db: Session, klass: m.MultigradeClass, week: date, periods: list[PlannedPeriod], notes: list[str], minutes: dict, status: str = "draft") -> m.Timetable:
    t = get_timetable(db, klass, week)
    if t:
        t.periods.clear()
        db.flush()
    else:
        t = m.Timetable(class_id=klass.id, week_start=week)
        db.add(t)
    t.status, t.notes, t.teacher_led_minutes = status, notes, {str(k): v for k, v in minutes.items()}
    t.approved_at = datetime.now(timezone.utc) if status == "approved" else None
    for p in periods:
        t.periods.append(m.Period(
            id=f"{week.isoformat()}-d{p.day}-p{p.index}", day=p.day, index=p.index, start=p.start, end=p.end,
            slots=[{"grade": x.grade, "mode": x.mode, "subject": x.subject, "topicId": x.topic_id, "activity": x.activity} for x in p.slots],
            merged_chapter=p.merged_chapter, merged_note=p.merged_note, changed=p.changed,
        ))
    db.flush()
    return t


def apply_ai_activities(db: Session, periods: list[PlannedPeriod]) -> None:
    """After OR-Tools: replace template maths activity text with Sarvam's short, low-cost activity lines.
    Lines are cached per topic (and per merged session), so this is usually 0 calls, at most 1."""
    topic_ids = {s.topic_id for p in periods if p.subject == "Maths" for s in p.slots if s.topic_id}
    tmap = {t.id: t for t in db.scalars(select(m.Topic).where(m.Topic.id.in_(topic_ids)))}  # with source_text
    merges = {}
    for p in periods:
        if p.merged_chapter and p.merged_chapter != "Revision":
            led = [s for s in p.slots if s.mode == "teacher_led"]
            key = f"{'-'.join(str(s.grade) for s in led)}:{p.merged_chapter}:{'|'.join(s.topic_id or '' for s in led)}"
            merges[key] = {"key": key, "grades": ", ".join(str(s.grade) for s in led), "chapter": p.merged_chapter, "activity": {s.grade: s.activity for s in led}}
    lines, merge_lines = ai_client.activity_lines(db, list(tmap.values()), list(merges.values()))
    for p in periods:
        if p.subject != "Maths":
            continue
        if p.merged_chapter and p.merged_chapter != "Revision":
            led = [s for s in p.slots if s.mode == "teacher_led"]
            key = f"{'-'.join(str(s.grade) for s in led)}:{p.merged_chapter}:{'|'.join(s.topic_id or '' for s in led)}"
            if key in merge_lines:
                p.merged_note = merge_lines[key]["together"]
        if p.merged_chapter:
            continue  # merged slots keep their Learn/Revise labels; the shared activity went into the note
        for s in p.slots:
            line = lines.get(s.topic_id or "")
            if not line:
                continue
            if s.mode == "teacher_led" and s.activity.startswith("Teach: "):  # alert actions ("Re-teach …") stay as accepted
                s.activity = line["teach"]
            elif s.mode == "self_work":
                s.activity = line["self_work"]
            elif s.mode == "peer_work":
                s.activity = line["peer_game"]


def generate_plan(db: Session, klass: m.MultigradeClass, week: date) -> m.Timetable:
    result = plan_week(_plan_input(db, klass, week))
    apply_ai_activities(db, result.periods)
    t = save_plan(db, klass, week, result.periods, result.notes, result.teacher_led_minutes)
    db.add(m.PlanEdit(class_id=klass.id, week_start=week, kind="generate", payload={"solver": result.status}))
    return t


DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def replan(db: Session, klass: m.MultigradeClass, week: date, req: s.ReplanRequest) -> m.Timetable:
    t = get_timetable(db, klass, week)
    if not t:
        raise LookupError("Generate the week first.")
    previous = [_period_to_planned(p) for p in t.periods]
    db.add(m.PlanEdit(class_id=klass.id, week_start=week, kind="replan", payload=req.model_dump(by_alias=True)))
    db.flush()
    fixed = (req.day, req.from_period_index or 0) if req.reason == "teacher_on_duty" else (req.day, 0)
    result = plan_week(_plan_input(db, klass, week, previous=previous, fixed_before=fixed))
    apply_ai_activities(db, result.periods)
    labels = {"rain_day": "Rain day", "many_absent": "Many absent", "teacher_on_duty": "Teacher on duty"}
    moved = ""
    if req.reason == "teacher_on_duty":
        moved = " Teacher time was shared out on the remaining periods."
    notes = result.notes + [f"Replanned: {labels[req.reason]} on {DAY[req.day]}.{moved}"]
    return save_plan(db, klass, week, result.periods, notes, result.teacher_led_minutes)


def move_periods(db: Session, klass: m.MultigradeClass, week: date, req: s.MoveRequest) -> m.Timetable:
    t = get_timetable(db, klass, week)
    if not t:
        raise LookupError("No plan for this week.")
    a = next((p for p in t.periods if p.id == req.from_period_id), None)
    b = next((p for p in t.periods if p.id == req.to_period_id), None)
    if not a or not b:
        raise LookupError("Period not found.")
    if a is not b:
        a.slots, b.slots = b.slots, a.slots
        a.merged_chapter, b.merged_chapter = b.merged_chapter, a.merged_chapter
        a.merged_note, b.merged_note = b.merged_note, a.merged_note
        a.changed = b.changed = True
        t.status = "draft"
        db.add(m.PlanEdit(class_id=klass.id, week_start=week, kind="move", payload=req.model_dump(by_alias=True)))
    return t


def approve_plan(db: Session, klass: m.MultigradeClass, week: date) -> m.Timetable:
    t = get_timetable(db, klass, week)
    if not t:
        raise LookupError("No plan for this week.")
    t.status, t.approved_at = "approved", datetime.now(timezone.utc)
    for p in t.periods:
        p.changed = False
    db.add(m.PlanEdit(class_id=klass.id, week_start=week, kind="approve", payload={}))
    return t


# ---------- class snapshot (few queries, then pure Python) ----------

@dataclass
class Snapshot:
    students: list[m.Student]
    topics: dict[str, TopicView]
    weekly_quiz: dict[str, list[int | None]] = field(default_factory=dict)
    tutor: dict[str, list[int]] = field(default_factory=dict)
    missed: dict[str, int] = field(default_factory=dict)
    school_days: int = 0
    marks: dict[str, list[m.Mark]] = field(default_factory=dict)  # newest first
    topic_avg: dict[str, float] = field(default_factory=dict)  # class average % per tested topic
    mastery: dict[str, dict[str, int]] = field(default_factory=dict)

    def by_id(self) -> dict[str, m.Student]:
        return {x.id: x for x in self.students}

    def signals(self, st: m.Student) -> Signals:
        mk = (self.marks.get(st.id) or [None])[0]
        return Signals(
            name=st.name,
            weekly_quiz=self.weekly_quiz.get(st.id, [None] * WEEKS),
            latest_test_percent=(mk.score / mk.max_score * 100) if mk else None,
            latest_test_name=mk.test_name if mk else None,
            test_class_average=self.topic_avg.get(mk.topic_id) if mk else None,
            days_missed=self.missed.get(st.id, 0),
            school_days=self.school_days,
            tutor_minutes=self.tutor.get(st.id, [0] * WEEKS),
        )

    def tag(self, st: m.Student) -> tuple[str, str]:
        return tag_for(self.weekly_quiz.get(st.id, []), self.tutor.get(st.id, []))

    def attendance_percent(self, st: m.Student) -> int:
        if not self.school_days:
            return 100
        return round(100 * (self.school_days - self.missed.get(st.id, 0)) / self.school_days)

    def weakest_done_topic(self, st: m.Student) -> m.Topic | None:
        done = [(pct, -self.topics[tid].order, tid) for tid, pct in self.mastery.get(st.id, {}).items() if tid in self.topics and self.topics[tid].status == "done"]
        return self.topics[min(done)[2]] if done else None

    def best_peer(self, st: m.Student, topic: m.Topic | None) -> str | None:
        if not topic:
            return None
        peers = [(self.mastery.get(x.id, {}).get(topic.id, -1), x.name) for x in self.students if x.grade == st.grade and x.id != st.id]
        best = max(peers, default=None)
        return best[1] if best and best[0] >= 0 else None


def snapshot(db: Session, klass: m.MultigradeClass, grade: int | None = None) -> Snapshot:
    q = select(m.Student).where(m.Student.class_id == klass.id).order_by(m.Student.grade, m.Student.roll_no)
    if grade:
        q = q.where(m.Student.grade == grade)
    students = list(db.scalars(q))
    ids = [x.id for x in students]
    snap = Snapshot(students=students, topics={t.id: t for t in topics(db, klass)})
    weeks = window_weeks()
    start = weeks[0]

    def bucket(d: date) -> int:
        return max(0, min(len(weeks) - 1, (d - start).days // 7))

    qz: dict[str, list[list[int]]] = defaultdict(lambda: [[] for _ in weeks])
    for sid, d, pct in db.execute(select(m.QuizAttempt.student_id, m.QuizAttempt.taken_on, m.QuizAttempt.percent).where(m.QuizAttempt.student_id.in_(ids), m.QuizAttempt.taken_on >= start)):
        qz[sid][bucket(d)].append(pct)
    snap.weekly_quiz = {sid: [round(sum(b) / len(b)) if b else None for b in qz[sid]] for sid in ids}

    tut: dict[str, list[int]] = defaultdict(lambda: [0] * len(weeks))
    for sid, d, mins in db.execute(select(m.TutorSession.student_id, m.TutorSession.started_on, m.TutorSession.minutes).where(m.TutorSession.student_id.in_(ids), m.TutorSession.started_on >= start)):
        tut[sid][bucket(d)] += mins
    snap.tutor = {sid: tut[sid] for sid in ids}

    days: set[date] = set()
    missed: dict[str, int] = defaultdict(int)
    for sid, d, status in db.execute(select(m.Attendance.student_id, m.Attendance.date, m.Attendance.status).where(m.Attendance.student_id.in_(ids), m.Attendance.date >= start)):
        days.add(d)
        if status == "absent":
            missed[sid] += 1
    snap.missed, snap.school_days = dict(missed), len(days)

    marks = list(db.scalars(select(m.Mark).where(m.Mark.student_id.in_(ids)).order_by(m.Mark.date.desc(), m.Mark.id.desc())))
    per_topic: dict[str, list[float]] = defaultdict(list)
    for mk in marks:
        snap.marks.setdefault(mk.student_id, []).append(mk)
        per_topic[mk.topic_id].append(mk.score / mk.max_score * 100)
    snap.topic_avg = {tid: sum(v) / len(v) for tid, v in per_topic.items()}

    for sid, tid, pct in db.execute(select(m.Mastery.student_id, m.Mastery.topic_id, m.Mastery.percent).where(m.Mastery.student_id.in_(ids))):
        snap.mastery.setdefault(sid, {})[tid] = pct
    return snap


# ---------- alerts ----------

def refresh_alerts(db: Session, klass: m.MultigradeClass) -> None:
    """Recompute risk for every student and the syllabus pace for every grade.
    Open alerts are updated; accepted or dismissed ones are left as the teacher decided."""
    snap = snapshot(db, klass)
    existing = {a.id: a for a in db.scalars(select(m.Alert).where(m.Alert.class_id == klass.id))}
    live: set[str] = set()

    for st in snap.students:
        r = score(snap.signals(st))
        if r.score < ALERT_THRESHOLD or not r.severity:
            continue
        aid = f"risk-{st.id}"
        live.add(aid)
        a = existing.get(aid)
        if a and a.status != "open":
            continue
        weak = snap.weakest_done_topic(st)
        title, suggestion = title_and_suggestion(r, st.name, weak.title if weak else None, weak.chapter if weak else None, snap.best_peer(st, weak))
        reasons = r.reasons + [f"Risk score {r.score}/100 (quiz {r.quiz_points} + test {r.test_points} + attendance {r.attendance_points} + tutor {r.tutor_points})."]
        if not a:
            a = m.Alert(id=aid, class_id=klass.id, grade=st.grade, student_id=st.id, kind="student", suggestion=suggestion)
            db.add(a)
        elif a.title != title and not a.suggestion_edited:
            a.suggestion = suggestion  # the situation changed; the old suggestion no longer fits
        a.title, a.reasons, a.severity, a.risk_score = title, reasons, r.severity, r.score

    # syllabus pace: topics expected done by today if the term were taught evenly
    frac = max(0.0, min(1.0, (config.today() - TERM_START).days / (TERM_END - TERM_START).days))
    for g in GRADES:
        own = sorted((t for t in snap.topics.values() if t.grade == g), key=lambda t: t.order)
        if not own:
            continue
        done = sum(t.status == "done" for t in own)
        expected = round(len(own) * frac)
        behind = expected - done
        if behind < 3:
            continue
        aid = f"syllabus-g{g}"
        live.add(aid)
        a = existing.get(aid)
        if a and a.status != "open":
            continue
        nxt = _current(own)
        if not a:
            a = m.Alert(id=aid, class_id=klass.id, grade=g, kind="syllabus",
                        suggestion=f"Add one extra teacher-led maths period for Grade {g} next week to teach \"{nxt.title if nxt else 'the next topic'}\".")
            db.add(a)
        a.title = f"Grade {g} is {behind} topics behind the term plan"
        a.reasons = [
            f"{done} of {len(own)} topics done ({round(100 * done / len(own))}%). Teaching evenly from {TERM_START:%d %b} to {TERM_END:%d %b}, about {expected} would be done by now.",
            "A merged session with another grade on a shared chapter saves a period.",
        ]
        a.severity, a.risk_score = ("medium" if behind >= 6 else "low"), None

    for aid, a in existing.items():
        if aid not in live and a.status == "open":
            db.delete(a)  # no longer applies


def alert_to_schema(a: m.Alert, names: dict[str, str]) -> s.Alert:
    return s.Alert(
        id=a.id, grade=a.grade, student_id=a.student_id, student_name=names.get(a.student_id or ""),
        title=a.title, reasons=a.reasons, suggestion=a.suggestion, severity=a.severity, status=a.status,
        created_at=a.created_at.isoformat(), risk_score=a.risk_score, changes_plan=plan_changing_alert(a), ai_summary=a.ai_summary,
    )


def _alert_ai_key(a: m.Alert) -> str:
    # wording only changes when the situation does: same title, severity and risk band -> same words
    band = (a.risk_score or 0) // 10
    return hashlib.sha1(f"{a.title}|{a.severity}|{band}|v{ai_client.ALERT_PROMPT_VERSION}".encode()).hexdigest()[:16]


def ensure_alert_wording(db: Session, alerts: list[m.Alert]) -> None:
    """Friendly one-sentence summary + suggested action from Sarvam for open alerts. Cached; one call for all missing."""
    todo = [a for a in alerts if a.status == "open" and a.ai_key != _alert_ai_key(a)]
    if not todo:
        return
    items = [{"id": a.id, "cache_key": _alert_ai_key(a), "title": a.title, "reasons": [r for r in a.reasons if not r.startswith("Risk score")], "suggestion": a.suggestion} for a in todo]
    words = ai_client.alert_wording(db, items)
    for a in todo:
        w = words.get(a.id)
        if not w:
            continue
        a.ai_summary, a.ai_key = w["summary"], _alert_ai_key(a)
        if not a.suggestion_edited:
            a.suggestion = w["action"]
    db.commit()


def plan_changing_alert(a: m.Alert) -> bool:
    return a.kind == "syllabus" or "falling behind" in a.title


def accept_alert(db: Session, klass: m.MultigradeClass, a: m.Alert) -> None:
    """Accepted learning and pace alerts become an action in next week's plan."""
    a.status = "accepted"
    if not plan_changing_alert(a):
        return
    week = next_week()
    if a.kind == "syllabus":
        nxt = current_topic(db, klass, a.grade)
        activity = f"Teach: {nxt.title}" if nxt else "Catch-up lesson"
    else:
        snap = snapshot(db, klass, a.grade)
        st = snap.by_id().get(a.student_id or "")
        weak = snap.weakest_done_topic(st) if st else None
        activity = f"Re-teach: {weak.title if weak else 'the last topic'} ({st.name if st else 'small group'} in front)"
    db.add(m.PlanEdit(class_id=klass.id, week_start=week, kind="alert_action", payload={"grade": a.grade, "reason": f"You accepted the alert \"{a.title}\".", "activity": activity, "alertId": a.id}))
    db.flush()
    if get_timetable(db, klass, week):
        generate_plan(db, klass, week)


# ---------- decks ----------

def deck_send(db: Session, klass: m.MultigradeClass, deck_id: str) -> m.DeckSend | None:
    return db.scalar(select(m.DeckSend).where(m.DeckSend.class_id == klass.id, m.DeckSend.deck_id == deck_id))


def deck_to_schema(d: m.CardDeck, cached: bool, grade: int, send: m.DeckSend | None = None) -> s.CardDeck:
    """Decks are shared AI content; 'sent' is per class (DeckSend)."""
    return s.CardDeck(
        id=d.id, topic_id=d.topic_id, topic_title=d.topic_title, grade=grade, language=d.language,
        cards=[s.TopicCard(**c) for c in d.cards],
        quiz=[s.QuizQuestion(**q) for q in (d.quiz.questions if d.quiz else [])],
        status="sent" if send else "draft", cached=cached, sent_at=iso(send.sent_at) if send else None, placeholder=d.placeholder,
    )


def _deck_row(db: Session, topic_id: str, language: str) -> m.CardDeck | None:
    return db.scalar(select(m.CardDeck).options(selectinload(m.CardDeck.quiz)).where(m.CardDeck.topic_id == topic_id, m.CardDeck.language == language))


def get_or_create_deck(db: Session, topic: m.Topic, language: str, regenerate: bool = False) -> tuple[m.CardDeck, bool]:
    """Returns (deck, cached). A saved deck is never regenerated unless regenerate=True (the teacher's button).
    Kannada/Hindi are translated from the saved English deck (creating it first if needed)."""
    d = _deck_row(db, topic.id, language)
    if d and not regenerate:
        ai_client.log_cache_hit(db, f"cards+quiz {topic.id} ({language})")
        return d, True

    title = cards = quiz = None
    placeholder = False
    if ai_client.enabled():
        try:
            if language == "en":
                title, cards, quiz = ai_client.generate_deck_english(db, topic)
            else:
                en, _ = get_or_create_deck(db, topic, "en")
                if en.placeholder:
                    raise ai_client.SarvamError("English deck is a placeholder; regenerate it first.")
                title, cards, quiz = ai_client.translate_deck(db, topic, language, en.topic_title, en.cards, en.quiz.questions if en.quiz else [])
        except ai_client.SarvamError as e:
            logging.getLogger("veda.ai").warning("deck for %s (%s) falls back: %s", topic.id, language, e)
    if cards is None:
        title, cards, quiz, placeholder = ai_client.demo_or_placeholder_deck(db, topic, language)

    if not d:
        d = m.CardDeck(id=f"deck-{topic.id}-{language}", topic_id=topic.id, language=language)
        db.add(d)
    d.topic_title, d.placeholder = title, placeholder
    d.cards = [{**c, "id": f"{topic.id}-{language}-c{i}"} for i, c in enumerate(cards)]
    questions = [{**q, "id": f"{topic.id}-{language}-q{i}"} for i, q in enumerate(quiz)]
    if d.quiz:
        d.quiz.questions = questions
    else:
        d.quiz = m.Quiz(id=f"quiz-{topic.id}-{language}", topic_id=topic.id, grade=topic.grade, week_start=this_week(), questions=questions)
    db.flush()
    return d, False


def update_mastery(db: Session, student_id: str, topic_id: str, percent: int) -> None:
    row = db.scalar(select(m.Mastery).where(m.Mastery.student_id == student_id, m.Mastery.topic_id == topic_id))
    if row:
        row.percent = round((row.percent + percent) / 2)
    else:
        db.add(m.Mastery(student_id=student_id, topic_id=topic_id, percent=percent))


def clear_demo_data(db: Session) -> None:
    """Wipe ONLY the demo class's data. Real classes in the same database are never touched, and
    AI work (decks, ai_cache, ai_call_log) is kept because it was paid for once."""
    demo_students = select(m.Student.id).where(m.Student.class_id == DEMO_CLASS_ID)
    for model in (m.QuizAttempt, m.Mastery, m.TutorSession, m.Mark, m.Attendance):
        db.execute(delete(model).where(model.student_id.in_(demo_students)))
    for model in (m.Alert, m.PlanEdit, m.TopicProgress, m.DeckSend):
        db.execute(delete(model).where(model.class_id == DEMO_CLASS_ID))
    demo_tts = select(m.Timetable.id).where(m.Timetable.class_id == DEMO_CLASS_ID)
    db.execute(delete(m.Period).where(m.Period.timetable_id.in_(demo_tts)))
    db.execute(delete(m.Timetable).where(m.Timetable.class_id == DEMO_CLASS_ID))
    db.execute(delete(m.Quiz).where(m.Quiz.id.like("weekly-%")))  # the seed's weekly class quizzes
    db.execute(delete(m.Student).where(m.Student.class_id == DEMO_CLASS_ID))
    db.execute(delete(m.GradeGroup).where(m.GradeGroup.class_id == DEMO_CLASS_ID))
    db.execute(delete(m.MultigradeClass).where(m.MultigradeClass.id == DEMO_CLASS_ID))
    db.execute(delete(m.Teacher).where(m.Teacher.id == "teacher-lakshmi"))
    db.flush()
