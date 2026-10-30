"""DEMO_MODE seed: 25 students, 4 weeks (5-30 Oct 2026) of attendance, quizzes, tutor time and tests.

Runs on top of the imported textbook topics (scripts/import_syllabus.py). The story:
- Ravi (Grade 4): fraction quizzes 78 -> 62 -> 45 -> 30%, absent 13, 14, 20, 21 Oct,
  6/20 in the fractions class test, but his time with Vidya rises 20 -> 42 min/week.
- Kiran (Grade 3): scores slipping and 0 minutes with Vidya ("didn't study").
- Meena (Grade 5): absent often.
- Grade 5 is behind the term plan.
Today (Fri 30 Oct) attendance is not taken yet. Deterministic: same data every run.
"""

from __future__ import annotations

import hashlib
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config, models as m, services
from .planner import GRADES, plan_week

PIN = "1234"
WEEKS = [date(2026, 10, 5), date(2026, 10, 12), date(2026, 10, 19), date(2026, 10, 26)]
SCHOOL_DAYS = [w + timedelta(days=i) for w in WEEKS for i in range(5)]
RAVI_ABSENT = {date(2026, 10, 13), date(2026, 10, 14), date(2026, 10, 20), date(2026, 10, 21)}
BREAKS = [{"label": "Short break", "start": "11:00", "end": "11:15"}, {"label": "Lunch (Bisiyoota)", "start": "12:45", "end": "13:30"}]

NAMES = {
    3: ["Kiran", "Pooja", "Vishal", "Ramya", "Bharath", "Sneha", "Manju", "Divya"],
    4: ["Ravi", "Ananya", "Mohan", "Kavya", "Arjun", "Lakshmi", "Suresh", "Deepa", "Imran"],
    5: ["Shreya", "Ganesh", "Meena", "Rahul", "Asha", "Naveen", "Fathima", "Prakash"],
}
AVATARS = ["parrot", "elephant", "peacock", "tiger", "mango", "lotus", "rabbit", "fish", "star", "sun", "kite", "boat", "tree",
           "cow", "butterfly", "moon", "drum", "flower", "owl", "deer", "bus", "ball", "umbrella", "apple", "cat"]

# Where each grade is in its book today: (chapter keyword, topics done inside that chapter).
CURRENT = {3: ("multiplication", 1), 4: ("fraction", 3), 5: ("time", 1)}


def pin_hash(student_id: str, pin: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), student_id.encode(), 50_000).hex()


def _set_progress(db: Session, klass: m.MultigradeClass) -> dict[int, list[services.TopicView]]:
    """Mark the DEMO class's topics done up to each grade's current chapter.
    Returns topics taught recently per grade (oldest first)."""
    recent: dict[int, list[services.TopicView]] = {}
    for g in GRADES:
        own = services.topics(db, None, g)
        if not own:
            raise RuntimeError(f"No Grade {g} topics. Run scripts/import_syllabus.py first.")
        kw, done_in_chapter = CURRENT[g]
        chapter_topics = [t for t in own if kw in t.chapter.lower()]
        first_cur = chapter_topics[0].order if chapter_topics else own[len(own) // 2].order
        cur_order = first_cur + done_in_chapter
        taught = [t for t in own if t.order < cur_order]
        # spread "done" dates over the term, the last few in the demo weeks
        for k, t in enumerate(taught):
            back = len(taught) - k
            t.status = "done"
            t.done_on = config.DEMO_TODAY - timedelta(days=7 * back - 1) if back <= 4 else date(2026, 6, 15) + timedelta(days=int(k * 110 / max(1, len(taught))))
            db.add(m.TopicProgress(class_id=klass.id, topic_id=t.id, status="done", done_on=t.done_on))
        cur = [t for t in own if t.order == cur_order]
        for t in cur:
            t.status = "in_progress"
            db.add(m.TopicProgress(class_id=klass.id, topic_id=t.id, status="in_progress"))
        recent[g] = (taught[-3:] + cur)[-4:]
    db.flush()
    return recent


def seed(db: Session) -> dict:
    rnd = random.Random(20261030)
    services.clear_demo_data(db)

    teacher = m.Teacher(id="teacher-lakshmi", name="Lakshmi", email=None)
    klass = m.MultigradeClass(id="class-hosahalli", teacher=teacher, name="Hosahalli Multi-grade Room", hours_start="09:30", hours_end="15:45",
                              period_minutes=45, days=[1, 2, 3, 4, 5], breaks=BREAKS, setup_complete=True)
    db.add(klass)
    for g, n in zip(GRADES, (8, 9, 8)):
        klass.grade_groups.append(m.GradeGroup(grade=g, classroom_course_id=f"demo-course-g{g}", classroom_course_name=f"Class {g} – GHPS Hosahalli",
                                               classroom_section="2026-27", classroom_student_count=n))
    db.flush()

    recent = _set_progress(db, klass)

    # ---------- students and their traits ----------
    students: list[m.Student] = []
    traits: dict[str, dict] = {}
    a = 0
    for g in GRADES:
        for i, name in enumerate(NAMES[g]):
            sid = f"s-g{g}-{i + 1:02d}"
            st = m.Student(id=sid, class_id=klass.id, grade=g, name=name, avatar=AVATARS[a], roll_no=i + 1, pin=PIN, pin_hash=pin_hash(sid, PIN))
            a += 1
            students.append(st)
            traits[sid] = {"ability": 66 + rnd.randint(0, 26), "absence": 0.02 + rnd.random() * 0.04, "tutor": 15 + rnd.randint(0, 40)}
    traits["s-g3-01"] = {"ability": 48, "absence": 0.03, "tutor": 0}  # Kiran
    traits["s-g4-02"] = {"ability": 92, "absence": 0.0, "tutor": 40}  # Ananya, strong in fractions
    traits["s-g5-03"] = {"ability": 72, "absence": 0.28, "tutor": 20}  # Meena
    db.add_all(students)
    db.flush()
    ravi = "s-g4-01"

    # ---------- attendance (today not taken) ----------
    for d in SCHOOL_DAYS:
        if d == config.DEMO_TODAY:
            continue
        for st in students:
            absent = d in RAVI_ABSENT if st.id == ravi else rnd.random() < traits[st.id]["absence"]
            db.add(m.Attendance(student_id=st.id, date=d, status="absent" if absent else "present"))
    # Meena: make sure the pattern is visible
    for d in (date(2026, 10, 7), date(2026, 10, 15), date(2026, 10, 22), date(2026, 10, 27), date(2026, 10, 28)):
        row = db.scalar(select(m.Attendance).where(m.Attendance.student_id == "s-g5-03", m.Attendance.date == d))
        if row:
            row.status = "absent"

    # ---------- weekly class quizzes ----------
    weekly: dict[str, list[int]] = {}
    for st in students:
        t = traits[st.id]
        weekly[st.id] = [max(20, min(100, round(t["ability"] + rnd.uniform(-7, 7) + w))) for w in range(4)]
    weekly[ravi] = [78, 62, 45, 30]
    weekly["s-g3-01"] = [58, 50, 44, 38]
    for g in GRADES:
        for w, week in enumerate(WEEKS):
            topic = recent[g][min(w, len(recent[g]) - 1)]
            qz = m.Quiz(id=f"weekly-g{g}-{week.isoformat()}", topic_id=topic.id, grade=g, week_start=week,
                        questions=[{"id": f"wq{k}", "question": f"Weekly check {k + 1}", "options": ["A", "B", "C", "D"], "answerIndex": 0} for k in range(5)])
            db.add(qz)
            for st in (x for x in students if x.grade == g):
                pct = weekly[st.id][w]
                db.add(m.QuizAttempt(quiz_id=qz.id, student_id=st.id, taken_on=week + timedelta(days=4), correct=round(pct / 20), total=5, percent=pct))
    db.flush()

    # ---------- tutor time ----------
    for st in students:
        t = traits[st.id]
        mins = [0 if t["tutor"] == 0 and w > 0 else max(0, t["tutor"] + rnd.randint(-6, 6)) for w in range(4)]
        if st.id == ravi:
            mins = [20, 28, 35, 42]
        if st.id == "s-g3-01":
            mins = [5, 0, 0, 0]
        for w, week in enumerate(WEEKS):
            if mins[w]:
                db.add(m.TutorSession(student_id=st.id, topic_id=recent[st.grade][min(w, 3)].id, started_on=week + timedelta(days=2), minutes=mins[w], messages=[]))

    # ---------- unit tests ----------
    def test(g: int, topic: m.Topic, name: str, when: date, max_score: int, fixed: dict[str, int] | None = None):
        for st in (x for x in students if x.grade == g):
            pct = traits[st.id]["ability"] + rnd.uniform(-10, 10)
            sc = (fixed or {}).get(st.id, max(2, min(max_score, round(pct / 100 * max_score))))
            db.add(m.Mark(student_id=st.id, topic_id=topic.id, test_name=name, date=when, score=sc, max_score=max_score))

    def last_of_chapter(g: int, kw: str) -> m.Topic | None:
        ts = [t for t in services.topics(db, klass, g) if kw in t.chapter.lower() and t.status == "done"]
        return ts[-1] if ts else None

    for g, kw, name, when, mx in ((3, "subtraction", "Subtraction unit test", date(2026, 10, 9), 20),
                                  (4, "mental", "Mental Arithmetic test", date(2026, 10, 2), 20),
                                  (5, "weight", "Weight and Volume test", date(2026, 10, 16), 25)):
        t = last_of_chapter(g, kw)
        if t:
            test(g, t, name, when, mx)
    frac_topic = recent[4][2]  # equivalent fractions
    test(4, frac_topic, "Fractions class test", date(2026, 10, 23), 20, {ravi: 6, "s-g4-02": 19})

    # ---------- mastery ----------
    taught_by_grade = {g: [t for t in services.topics(db, klass, g) if t.status != "not_started"] for g in GRADES}
    for st in students:
        recent_ids = [t.id for t in recent[st.grade]]
        for t in taught_by_grade[st.grade]:
            if t.id in recent_ids:
                pct = weekly[st.id][min(recent_ids.index(t.id), 3)]
            else:
                pct = max(25, min(100, round(traits[st.id]["ability"] + rnd.uniform(-12, 12))))
            db.add(m.Mastery(student_id=st.id, topic_id=t.id, percent=pct))
    db.flush()

    # ---------- last week's topic cards (sent), most students finished them ----------
    sent_at = datetime.combine(date(2026, 10, 23), time(15, 50), tzinfo=timezone.utc)
    not_finished = {"s-g3-01", ravi, "s-g3-04", "s-g5-02"}
    for g in GRADES:
        topic = db.get(m.Topic, (recent[g][-2] if len(recent[g]) >= 2 else recent[g][-1]).id)
        deck, _ = services.get_or_create_deck(db, topic, "en")  # reuses the saved deck: no AI call after the first time
        db.add(m.DeckSend(class_id=klass.id, deck_id=deck.id, grade=g, sent_at=sent_at,
                          classroom_material_id=f"demo-material-{deck.id}", classroom_coursework_id=f"demo-coursework-{deck.id}"))
        deck.quiz.week_start = WEEKS[2]
        db.flush()
        for st in (x for x in students if x.grade == g and x.id not in not_finished):
            pct = weekly[st.id][2]
            db.add(m.QuizAttempt(quiz_id=deck.quiz.id, student_id=st.id, taken_on=date(2026, 10, 24), correct=round(pct / 20), total=5, percent=pct))

    # ---------- this week's plan, approved ----------
    result = plan_week(services._plan_input(db, klass, WEEKS[3]))
    services.apply_ai_activities(db, result.periods)
    services.save_plan(db, klass, WEEKS[3], result.periods, result.notes, result.teacher_led_minutes, status="approved")

    db.flush()
    services.refresh_alerts(db, klass)
    db.commit()

    return {
        "students": len(students),
        "attendance_rows": len(students) * (len(SCHOOL_DAYS) - 1),
        "current": {g: (c.title if (c := services.current_topic(db, klass, g)) else None) for g in GRADES},
        "alerts": [a.title for a in db.scalars(select(m.Alert).where(m.Alert.class_id == klass.id).order_by(m.Alert.severity))],
    }
