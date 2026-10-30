"""Veda RuralClass API. Implements docs/api-contract.md.

Run from backend/:  .venv/Scripts/python -m uvicorn app.main:app --port 8000
DEMO_MODE=true: seeded demo class, no Google. DEMO_MODE=false: Google sign-in + real Classroom (see app/auth.py).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

import ai_client

from . import classroom, config, models as m, schemas as s, services as svc
from .auth import AuthError, Principal, google_token_dep, klass_dep, principal, proxy_ok
from .db import get_db, warm_up
from .demo_seed import AVATARS, PIN as DEMO_PIN, pin_hash, seed
from .planner import GRADES, PlanInfeasible
from .report_pdf import build_report_pdf
from .risk import score

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("veda")
APP_URL = config.APP_URL


@asynccontextmanager
async def lifespan(_: FastAPI):
    warm_up()
    log.info("Veda API ready (demo mode: %s, sarvam: %s, voice: %s)", config.DEMO_MODE, ai_client.enabled(), config.VOICE_PROVIDER)
    yield


app = FastAPI(title="Veda RuralClass API", version="0.3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.FRONTEND_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def require_proxy_in_real_mode(request: Request, call_next):
    """Real mode: only the Next.js proxy (which holds the Google token) may call the API."""
    if not config.DEMO_MODE and request.url.path.startswith("/api/") and request.url.path not in ("/api/health", "/api/meta") and request.method != "OPTIONS":
        if not proxy_ok(request):
            return JSONResponse(status_code=401, content={"detail": "Please open Veda through the teacher app.", "code": "proxy"})
    return await call_next(request)


@app.exception_handler(LookupError)
async def not_found(_: Request, exc: LookupError):
    return JSONResponse(status_code=404, content={"detail": str(exc).strip("'")})


@app.exception_handler(PlanInfeasible)
async def infeasible(_: Request, exc: PlanInfeasible):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(AuthError)
async def auth_error(_: Request, exc: AuthError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message, "code": exc.code})


@app.exception_handler(classroom.ClassroomError)
async def classroom_error(_: Request, exc: classroom.ClassroomError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message, "code": exc.code})


def _date(v: str | None) -> date:
    return date.fromisoformat(v) if v else config.today()


def _student(st: m.Student) -> s.Student:
    return s.Student(id=st.id, name=st.name, grade=st.grade, avatar=st.avatar, roll_no=st.roll_no)


def student_link(klass: m.MultigradeClass) -> str:
    return f"{APP_URL}/student?class={klass.id}"


# ---------- meta ----------

@app.get("/api/health")
def health():
    return {"ok": True, "demoMode": config.DEMO_MODE}


@app.get("/health")
def render_health():
    return {"ok": True}


@app.get("/api/meta", response_model=s.Meta)
def meta():
    return s.Meta(demo_mode=config.DEMO_MODE, today=config.today().isoformat(), this_week=svc.this_week().isoformat(),
                  next_week=svc.next_week().isoformat(), demo_pin=DEMO_PIN if config.DEMO_MODE else None,
                  sarvam_enabled=ai_client.enabled(), voice_provider=config.VOICE_PROVIDER if ai_client.enabled() else "browser",
                  class_id=svc.DEMO_CLASS_ID if config.DEMO_MODE else None)


@app.post("/api/demo/reset")
def demo_reset(db: Session = Depends(get_db)):
    if not config.DEMO_MODE:
        raise HTTPException(403, "Demo reset is only available in DEMO_MODE.")
    return seed(db)


# ---------- class setup ----------

@app.get("/api/class", response_model=s.ClassSetup)
def get_class(p: Principal = Depends(principal)):
    if p.klass:
        return svc.class_to_schema(p.klass)
    # real mode, first sign-in: an empty setup for the wizard
    return s.ClassSetup(id="", name="My multi-grade class", teacher_name=p.teacher.name if p.teacher else "", grades=[3, 4, 5],
                        linked_courses=[s.LinkedCourse(grade=g, course=None) for g in GRADES],
                        hours=s.SchoolHours(start="09:30", end="15:45", period_minutes=45, days=[1, 2, 3, 4, 5]),
                        breaks=[s.BreakSlot(label="Short break", start="11:00", end="11:15"), s.BreakSlot(label="Lunch", start="12:45", end="13:30")],
                        setup_complete=False)


@app.put("/api/class", response_model=s.ClassSetup)
def put_class(body: s.ClassSetup, db: Session = Depends(get_db), p: Principal = Depends(principal)):
    k = p.klass
    if not k:
        if not p.teacher:
            raise LookupError("No class.")
        k = m.MultigradeClass(id=f"class-{secrets.token_hex(6)}", teacher_id=p.teacher.id, name=body.name)
        db.add(k)
        db.flush()
        db.refresh(k)
        k = svc.load_class(db, class_id=k.id)
    k.name, k.teacher.name = body.name, body.teacher_name or k.teacher.name
    k.hours_start, k.hours_end, k.period_minutes, k.days = body.hours.start, body.hours.end, body.hours.period_minutes, body.hours.days
    k.breaks = [b.model_dump() for b in body.breaks]
    k.setup_complete = body.setup_complete
    links = {lc.grade: lc.course for lc in body.linked_courses}
    for g in list(k.grade_groups):
        if g.grade not in body.grades:
            k.grade_groups.remove(g)
    have = {g.grade for g in k.grade_groups}
    for grade in body.grades:
        if grade not in have:
            k.grade_groups.append(m.GradeGroup(grade=grade))
    for g in k.grade_groups:
        c = links.get(g.grade)
        g.classroom_course_id = c.id if c else None
        g.classroom_course_name = c.name if c else None
        g.classroom_section = c.section if c else None
        g.classroom_student_count = c.student_count if c else None
    db.commit()
    return svc.class_to_schema(k)


# ---------- Google Classroom ----------

def _course(c: dict) -> s.ClassroomCourse:
    return s.ClassroomCourse(id=c["id"], name=c.get("name", ""), section=c.get("section", ""), student_count=c.get("_count", 0))


@app.get("/api/classroom/courses", response_model=list[s.ClassroomCourse])
def classroom_courses(db: Session = Depends(get_db), p: Principal = Depends(principal)):
    if config.DEMO_MODE:
        k = p.klass
        demo = [s.ClassroomCourse(id=g.classroom_course_id or f"demo-course-g{g.grade}", name=g.classroom_course_name or f"Class {g.grade}",
                                  section=g.classroom_section or "", student_count=g.classroom_student_count or 0) for g in sorted(k.grade_groups, key=lambda g: g.grade)] if k else []
        return demo + [s.ClassroomCourse(id="demo-course-reading-club", name="English Reading Club", section="All", student_count=14)]
    return [_course(c) for c in classroom.list_courses(p.google_token or "")]


@app.post("/api/classroom/courses", response_model=s.ClassroomCourse)
def create_classroom_course(body: s.CreateCourseIn, token: str = Depends(google_token_dep)):
    """Create a "Grade N" course in the teacher's Google Classroom."""
    c = classroom.create_course(token, f"Grade {body.grade}", f"Veda {config.today().year}-{str(config.today().year + 1)[-2:]}")
    return _course(c)


@app.post("/api/classroom/import-rosters", response_model=s.ImportResult)
def import_rosters(db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep), p: Principal = Depends(principal)):
    """Bring each linked course's students into Veda (new children get a picture and a 4-digit PIN)."""
    if config.DEMO_MODE:
        sts = db.scalars(select(m.Student).where(m.Student.class_id == k.id).order_by(m.Student.grade, m.Student.roll_no))
        return s.ImportResult(added=0, updated=0, students=[s.RosterStudent(student=_student(x), pin=x.pin) for x in sts], student_link=student_link(k))
    existing = {x.classroom_user_id: x for x in db.scalars(select(m.Student).where(m.Student.class_id == k.id))}
    added = updated = 0
    used_avatars = len(existing)
    for g in sorted(k.grade_groups, key=lambda g: g.grade):
        if not g.classroom_course_id:
            continue
        roster = classroom.list_students(p.google_token or "", g.classroom_course_id)
        g.classroom_student_count = len(roster)
        for i, r in enumerate(sorted(roster, key=lambda r: r.get("profile", {}).get("name", {}).get("fullName", "")), start=1):
            uid = r["userId"]
            prof = r.get("profile", {})
            name = prof.get("name", {}).get("givenName") or prof.get("name", {}).get("fullName") or "Student"
            st = existing.get(uid)
            if st:
                st.name, st.grade, st.email = name, g.grade, prof.get("emailAddress")
                updated += 1
            else:
                pin = f"{secrets.randbelow(10000):04d}"
                sid = f"s-{k.id[-6:]}-{uid[-8:]}"
                st = m.Student(id=sid, class_id=k.id, grade=g.grade, name=name, avatar=AVATARS[used_avatars % len(AVATARS)], roll_no=i,
                               pin=pin, pin_hash=pin_hash(sid, pin), classroom_user_id=uid, email=prof.get("emailAddress"))
                used_avatars += 1
                db.add(st)
                existing[uid] = st
                added += 1
    db.commit()
    sts = db.scalars(select(m.Student).where(m.Student.class_id == k.id).order_by(m.Student.grade, m.Student.name))
    return s.ImportResult(added=added, updated=updated, students=[s.RosterStudent(student=_student(x), pin=x.pin, email=x.email) for x in sts], student_link=student_link(k))


@app.post("/api/classroom/sync", response_model=s.SyncResult)
def sync_grades(db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep), p: Principal = Depends(principal)):
    """Two-way grade sync for quizzes Veda posted: Veda scores -> Classroom grades; Classroom grades -> Veda marks + mastery."""
    if config.DEMO_MODE:
        return s.SyncResult(pushed=0, pulled=0, coursework=0, message="Demo mode: grades are already in Veda.")
    sends = list(db.scalars(select(m.DeckSend).where(m.DeckSend.class_id == k.id, m.DeckSend.classroom_coursework_id.is_not(None))))
    students = {x.classroom_user_id: x for x in db.scalars(select(m.Student).where(m.Student.class_id == k.id)) if x.classroom_user_id}
    pushed = pulled = 0
    for send in sends:
        deck = db.scalar(select(m.CardDeck).options(selectinload(m.CardDeck.quiz)).where(m.CardDeck.id == send.deck_id))
        if not deck or not deck.quiz:
            continue
        veda = {a.student_id: a for a in db.scalars(select(m.QuizAttempt).where(m.QuizAttempt.quiz_id == deck.quiz.id).order_by(m.QuizAttempt.id))}
        for sub in classroom.list_submissions(p.google_token or "", send.classroom_course_id, send.classroom_coursework_id):
            st = students.get(sub.get("userId"))
            if not st:
                continue
            graded = sub.get("assignedGrade", sub.get("draftGrade"))
            attempt = veda.get(st.id)
            if attempt and graded is None:
                classroom.set_grade(p.google_token or "", send.classroom_course_id, send.classroom_coursework_id, sub["id"], attempt.percent)
                pushed += 1
            elif graded is not None and not attempt:
                pct = max(0, min(100, round(float(graded))))
                db.add(m.QuizAttempt(quiz_id=deck.quiz.id, student_id=st.id, taken_on=config.today(), answers=[], correct=round(pct / 20), total=5, percent=pct))
                svc.update_mastery(db, st.id, deck.topic_id, pct)
                mark = db.scalar(select(m.Mark).where(m.Mark.student_id == st.id, m.Mark.topic_id == deck.topic_id))
                if not mark or mark.test_name.startswith("Classroom:"):
                    if not mark:
                        mark = m.Mark(student_id=st.id, topic_id=deck.topic_id)
                        db.add(mark)
                    mark.test_name, mark.date, mark.score, mark.max_score = f"Classroom: {deck.topic_title}", config.today(), pct, 100
                pulled += 1
    db.flush()
    svc.refresh_alerts(db, k)
    db.commit()
    return s.SyncResult(pushed=pushed, pulled=pulled, coursework=len(sends),
                        message=f"Synced {len(sends)} quiz{'zes' if len(sends) != 1 else ''}: {pushed} Veda score(s) sent to Classroom, {pulled} Classroom grade(s) brought into Veda.")


# ---------- syllabus ----------

def _optional_class(p: Principal = Depends(principal)) -> m.MultigradeClass | None:
    return p.klass


@app.get("/api/topics", response_model=list[s.Topic])
def list_topics(grade: int | None = None, db: Session = Depends(get_db), k: m.MultigradeClass | None = Depends(_optional_class)):
    return [svc.topic_to_schema(t) for t in svc.topics(db, k, grade)]


@app.put("/api/topics", response_model=list[s.Topic])
def put_topics(body: s.TopicsIn, grade: int = Query(...), db: Session = Depends(get_db), k: m.MultigradeClass | None = Depends(_optional_class)):
    """Edit a grade's syllabus (shared by all classes). Keeps ids of unchanged topics; never deletes topics in use."""
    existing = db.scalars(select(m.Topic).where(m.Topic.grade == grade)).all()
    by_key = {(t.chapter, t.title): t for t in existing}
    used = set()
    for model in (m.Mark, m.CardDeck, m.Mastery, m.Quiz, m.TopicProgress):
        used |= {tid for (tid,) in db.execute(select(model.topic_id).distinct())}
    keep: set[str] = set()
    chapters: dict[str, int] = {}
    stamp = datetime.now(timezone.utc).strftime("%H%M%S")
    for i, row in enumerate(body.topics, start=1):
        chapters.setdefault(row.chapter, len(chapters) + 1)
        t = by_key.get((row.chapter, row.title))
        if not t:
            t = m.Topic(id=f"g{grade}-u{stamp}-{i:02d}", grade=grade, chapter=row.chapter, title=row.title, status="not_started")
            db.add(t)
        t.order, t.chapter_order = i, chapters[row.chapter]
        keep.add(t.id)
    for t in existing:
        if t.id not in keep:
            if t.id in used:
                t.order = 1000 + t.order  # still referenced; parked at the end
            else:
                db.delete(t)
    db.commit()
    return [svc.topic_to_schema(t) for t in svc.topics(db, k, grade)]


@app.post("/api/topics/{topic_id}/done", response_model=s.Topic)
def topic_done(topic_id: str, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    t = svc.mark_topic_done(db, k, topic_id)
    db.commit()
    return svc.topic_to_schema(t)


# ---------- students ----------

@app.get("/api/students", response_model=list[s.Student])
def list_students(grade: int | None = None, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    q = select(m.Student).where(m.Student.class_id == k.id).order_by(m.Student.grade, m.Student.roll_no)
    if grade:
        q = q.where(m.Student.grade == grade)
    return [_student(x) for x in db.scalars(q)]


@app.get("/api/students/roster", response_model=s.ImportResult)
def roster(db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    """Students with their PINs, for the teacher (to give each child their PIN)."""
    sts = db.scalars(select(m.Student).where(m.Student.class_id == k.id).order_by(m.Student.grade, m.Student.roll_no))
    return s.ImportResult(added=0, updated=0, students=[s.RosterStudent(student=_student(x), pin=x.pin, email=x.email) for x in sts], student_link=student_link(k))


# ---------- dashboard ----------

@app.get("/api/dashboard", response_model=s.Dashboard)
def dashboard(date_: str | None = Query(None, alias="date"), db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    day = _date(date_)
    t = svc.get_timetable(db, k, config.monday_of(day))
    students = list(db.scalars(select(m.Student).where(m.Student.class_id == k.id)))
    ids = [x.id for x in students]
    today_rows = dict(db.execute(select(m.Attendance.student_id, m.Attendance.status).where(m.Attendance.date == day, m.Attendance.student_id.in_(ids))).all())
    attendance = []
    for g in GRADES:
        gids = [x.id for x in students if x.grade == g]
        taken = bool(gids) and all(i in today_rows for i in gids)
        attendance.append(s.AttendanceSummary(grade=g, taken=taken, present=sum(today_rows.get(i, "present") == "present" for i in gids), total=len(gids)))
    names = {x.id: x.name for x in students}
    alerts = list(db.scalars(select(m.Alert).where(m.Alert.class_id == k.id, m.Alert.status == "open")))
    svc.ensure_alert_wording(db, alerts)
    order = {"high": 0, "medium": 1, "low": 2}
    weekday = day.isoweekday()
    return s.Dashboard(
        date=day.isoformat(),
        day_label=day.strftime("%A, %d %B").replace(" 0", " "),
        today_periods=[svc.period_to_schema(p) for p in sorted(t.periods, key=lambda p: p.index) if p.day == weekday] if t else [],
        breaks=[s.BreakSlot(**b) for b in k.breaks],
        plan_status=t.status if t else "none",
        attendance=attendance,
        syllabus=svc.syllabus_progress(svc.topics(db, k)),
        alerts=sorted((svc.alert_to_schema(a, names) for a in alerts), key=lambda a: order[a.severity]),
    )


# ---------- timetable ----------

def _week(week_start: str) -> date:
    return config.monday_of(date.fromisoformat(week_start))


@app.get("/api/plans/{week_start}", response_model=s.WeekPlan | None)
def get_plan(week_start: str, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    """null when the week has no plan yet (not a 404: "no plan" is a normal state, not an error)."""
    t = svc.get_timetable(db, k, _week(week_start))
    return svc.plan_to_schema(t, k) if t else None


@app.post("/api/plans/{week_start}/generate", response_model=s.WeekPlan)
def generate(week_start: str, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    t = svc.generate_plan(db, k, _week(week_start))
    db.commit()
    return svc.plan_to_schema(t, k)


@app.post("/api/plans/{week_start}/move", response_model=s.WeekPlan)
def move(week_start: str, body: s.MoveRequest, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    t = svc.move_periods(db, k, _week(week_start), body)
    db.commit()
    return svc.plan_to_schema(t, k)


@app.post("/api/plans/{week_start}/replan", response_model=s.WeekPlan)
def replan(week_start: str, body: s.ReplanRequest, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    t = svc.replan(db, k, _week(week_start), body)
    db.commit()
    return svc.plan_to_schema(t, k)


@app.post("/api/plans/{week_start}/approve", response_model=s.WeekPlan)
def approve(week_start: str, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    t = svc.approve_plan(db, k, _week(week_start))
    db.commit()
    return svc.plan_to_schema(t, k)


# ---------- attendance ----------

@app.get("/api/attendance", response_model=s.AttendanceSheet)
def get_attendance(grade: int, date_: str | None = Query(None, alias="date"), db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    day = _date(date_)
    ids = [x for (x,) in db.execute(select(m.Student.id).where(m.Student.class_id == k.id, m.Student.grade == grade).order_by(m.Student.roll_no))]
    rows = dict(db.execute(select(m.Attendance.student_id, m.Attendance.status).where(m.Attendance.date == day, m.Attendance.student_id.in_(ids))).all())
    return s.AttendanceSheet(date=day.isoformat(), grade=grade, marks={i: rows.get(i, "present") for i in ids}, submitted=bool(ids) and len(rows) == len(ids))


@app.put("/api/attendance", response_model=s.AttendanceSheet)
def put_attendance(body: s.AttendanceSheet, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    day = date.fromisoformat(body.date)
    mine = {x for (x,) in db.execute(select(m.Student.id).where(m.Student.class_id == k.id))}
    marks = {sid: st for sid, st in body.marks.items() if sid in mine}
    existing = {a.student_id: a for a in db.scalars(select(m.Attendance).where(m.Attendance.date == day, m.Attendance.student_id.in_(list(marks))))}
    for sid, status in marks.items():
        if sid in existing:
            existing[sid].status = status
        else:
            db.add(m.Attendance(student_id=sid, date=day, status=status))
    db.flush()
    svc.refresh_alerts(db, k)
    db.commit()
    return s.AttendanceSheet(date=body.date, grade=body.grade, marks=marks, submitted=True)


@app.post("/api/attendance/voice", response_model=s.VoiceNoteResult)
def voice_note(body: s.VoiceNoteIn, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    text = body.transcript.lower()
    roster_rows = db.scalars(select(m.Student).where(m.Student.class_id == k.id, m.Student.grade == body.grade))
    return s.VoiceNoteResult(transcript=body.transcript, absent_student_ids=[x.id for x in roster_rows if x.name.lower() in text])


# ---------- marks ----------

@app.get("/api/marks", response_model=s.MarksSheet)
def get_marks(grade: int, topic_id: str = Query(..., alias="topicId"), db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    topic = db.get(m.Topic, topic_id)
    if not topic:
        raise LookupError("Topic not found.")
    students = list(db.scalars(select(m.Student).where(m.Student.class_id == k.id, m.Student.grade == grade).order_by(m.Student.roll_no)))
    rows = {mk.student_id: mk for mk in db.scalars(select(m.Mark).where(m.Mark.topic_id == topic_id, m.Mark.student_id.in_([x.id for x in students])))}
    first = next(iter(rows.values()), None)
    mx = first.max_score if first else 20
    return s.MarksSheet(
        grade=grade, topic_id=topic_id, test_name=first.test_name if first else f"{topic.chapter} test",
        date=(first.date if first else config.today()).isoformat(), max_score=mx,
        entries=[s.MarkEntry(student_id=x.id, topic_id=topic_id, score=rows[x.id].score if x.id in rows else None, max_score=mx) for x in students],
    )


@app.put("/api/marks", response_model=s.MarksSheet)
def put_marks(body: s.MarksSheet, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    mine = {x for (x,) in db.execute(select(m.Student.id).where(m.Student.class_id == k.id))}
    rows = {mk.student_id: mk for mk in db.scalars(select(m.Mark).where(m.Mark.topic_id == body.topic_id, m.Mark.student_id.in_(mine)))}
    day = date.fromisoformat(body.date)
    for e in body.entries:
        if e.score is None or e.student_id not in mine:
            continue
        mk = rows.get(e.student_id)
        if not mk:
            mk = m.Mark(student_id=e.student_id, topic_id=body.topic_id)
            db.add(mk)
        mk.test_name, mk.date, mk.score, mk.max_score = body.test_name, day, e.score, body.max_score
    for mk in rows.values():
        mk.test_name, mk.max_score = body.test_name, body.max_score
    db.flush()
    svc.refresh_alerts(db, k)
    db.commit()
    return get_marks(body.grade, body.topic_id, db, k)


# ---------- cards + quiz ----------

def _load_deck(db: Session, deck_id: str) -> m.CardDeck:
    d = db.scalar(select(m.CardDeck).options(selectinload(m.CardDeck.quiz)).where(m.CardDeck.id == deck_id))
    if not d:
        raise LookupError("Deck not found.")
    return d


@app.get("/api/decks", response_model=s.CardDeck)
def get_deck(topic_id: str = Query(..., alias="topicId"), language: s.Language = "en", db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    """Saved deck, or generate it once (Sarvam). Kannada/Hindi are translated from the English deck."""
    topic = db.get(m.Topic, topic_id)
    if not topic:
        raise LookupError("Topic not found.")
    d, cached = svc.get_or_create_deck(db, topic, language)
    db.commit()
    return svc.deck_to_schema(d, cached=cached, grade=topic.grade, send=svc.deck_send(db, k, d.id))


@app.post("/api/decks/{deck_id}/regenerate", response_model=s.CardDeck)
def regenerate_deck(deck_id: str, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    """The teacher's "Regenerate" button: the only way a saved deck is written again (1 Sarvam call)."""
    d = _load_deck(db, deck_id)
    topic = db.get(m.Topic, d.topic_id)
    d, _ = svc.get_or_create_deck(db, topic, d.language, regenerate=True)
    db.commit()
    return svc.deck_to_schema(d, cached=False, grade=topic.grade, send=svc.deck_send(db, k, d.id))


def _apply_edits(d: m.CardDeck, body: s.CardDeck) -> None:
    d.cards = [c.model_dump(exclude_none=True) for c in body.cards]
    if d.quiz:
        d.quiz.questions = [q.model_dump(by_alias=True, exclude_none=True) for q in body.quiz]


@app.put("/api/decks/{deck_id}", response_model=s.CardDeck)
def put_deck(deck_id: str, body: s.CardDeck, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    d = _load_deck(db, deck_id)
    _apply_edits(d, body)
    db.commit()
    return svc.deck_to_schema(d, cached=True, grade=body.grade, send=svc.deck_send(db, k, d.id))


def _deck_text(d: m.CardDeck) -> str:
    lines = []
    for c in d.cards:
        lines.append(f"• {c['title']}: {c['body']}" + (f"\n  Example: {c['example']}" if c.get("example") else ""))
    return "\n\n".join(lines)


@app.post("/api/decks/{deck_id}/send", response_model=s.CardDeck)
def send_deck(deck_id: str, body: s.CardDeck, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep), p: Principal = Depends(principal)):
    """Send to the grade: saves edits, then (real mode) posts the cards as a Classroom material and the quiz as
    Classroom coursework in that grade's course, under a Classroom topic named after the chapter."""
    d = _load_deck(db, deck_id)
    topic = db.get(m.Topic, d.topic_id)
    _apply_edits(d, body)
    send = svc.deck_send(db, k, d.id) or m.DeckSend(class_id=k.id, deck_id=d.id, grade=topic.grade)
    group = next((g for g in k.grade_groups if g.grade == topic.grade), None)
    link = f"{student_link(k)}"
    if config.DEMO_MODE:
        send.classroom_material_id, send.classroom_coursework_id = f"demo-material-{deck_id}", f"demo-coursework-{deck_id}"
    elif group and group.classroom_course_id:
        token = p.google_token or ""
        send.classroom_course_id = group.classroom_course_id
        send.classroom_topic_id = send.classroom_topic_id or classroom.ensure_topic(token, group.classroom_course_id, topic.chapter)
        send.classroom_material_id = classroom.post_material(
            token, group.classroom_course_id, send.classroom_topic_id, f"{d.topic_title}: revision cards",
            f"Revision cards for \"{topic.title}\". Open Veda on the family phone to read them aloud.\n\n{_deck_text(d)}", link)
        send.classroom_coursework_id = classroom.post_coursework(
            token, group.classroom_course_id, send.classroom_topic_id, f"Quiz: {d.topic_title}",
            "5 quick questions in Veda. Open the link, pick your picture, enter your PIN, then tap \"New today\".", link)
    send.sent_at = datetime.now(timezone.utc)
    if not send.id:
        db.add(send)
    if d.quiz:
        d.quiz.week_start = svc.this_week()
    db.commit()
    return svc.deck_to_schema(d, cached=True, grade=topic.grade, send=send)


# ---------- insights ----------

@app.get("/api/insights/students", response_model=list[s.StudentSummary])
def student_summaries(grade: int | None = None, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    snap = svc.snapshot(db, k, grade)
    out = []
    for st in snap.students:
        quiz = [q for q in snap.weekly_quiz.get(st.id, []) if q is not None]
        out.append(s.StudentSummary(student=_student(st), tag=snap.tag(st)[0], last_quiz_percent=quiz[-1] if quiz else None, attendance_percent=snap.attendance_percent(st)))
    return out


@app.get("/api/insights/students/{student_id}", response_model=s.StudentInsight)
def student_insight(student_id: str, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    st = db.get(m.Student, student_id)
    if not st or st.class_id != k.id:
        raise LookupError("Student not found.")
    snap = svc.snapshot(db, k, st.grade)
    st = snap.by_id()[student_id]
    tag, reason = snap.tag(st)
    labels = [w.strftime("%d %b").lstrip("0") for w in svc.window_weeks()]
    mastery = sorted(((snap.topics[tid], pct) for tid, pct in snap.mastery.get(st.id, {}).items() if tid in snap.topics), key=lambda x: x[0].order)
    return s.StudentInsight(
        student=_student(st),
        attendance_percent=snap.attendance_percent(st),
        days_missed=snap.missed.get(st.id, 0),
        mastery=[s.TopicMastery(topic_id=t.id, topic_title=t.title, chapter=t.chapter, percent=pc) for t, pc in mastery],
        quiz_scores=[s.WeeklyScore(week_label=lbl, percent=q or 0) for lbl, q in zip(labels, snap.weekly_quiz.get(st.id, []))],
        tutor_minutes=[s.WeeklyScore(week_label=lbl, percent=v) for lbl, v in zip(labels, snap.tutor.get(st.id, []))],
        test_marks=[s.TestMark(test_name=mk.test_name, score=mk.score, max_score=mk.max_score, date=mk.date.isoformat()) for mk in snap.marks.get(st.id, [])],
        tag=tag, tag_reason=reason, risk_score=score(snap.signals(st)).score,
    )


# ---------- alerts ----------

@app.get("/api/alerts", response_model=list[s.Alert])
def list_alerts(db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    names = dict(db.execute(select(m.Student.id, m.Student.name).where(m.Student.class_id == k.id)).all())
    order = {"high": 0, "medium": 1, "low": 2}
    alerts = list(db.scalars(select(m.Alert).where(m.Alert.class_id == k.id)))
    svc.ensure_alert_wording(db, alerts)
    return sorted((svc.alert_to_schema(a, names) for a in alerts), key=lambda a: (a.status != "open", order[a.severity]))


@app.post("/api/alerts/{alert_id}", response_model=s.Alert)
def act_on_alert(alert_id: str, body: s.AlertAction, db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    a = db.get(m.Alert, alert_id)
    if not a or a.class_id != k.id:
        raise LookupError("Alert not found.")
    if body.action == "dismiss":
        a.status = "dismissed"
    elif body.action == "edit":
        a.suggestion = body.suggestion or a.suggestion
        a.suggestion_edited = True  # Sarvam won't overwrite the teacher's words
    else:
        svc.accept_alert(db, k, a)
    db.commit()
    names = dict(db.execute(select(m.Student.id, m.Student.name).where(m.Student.class_id == k.id)).all())
    return svc.alert_to_schema(a, names)


# ---------- reports ----------

def _report(db: Session, k: m.MultigradeClass) -> s.Report:
    snap = svc.snapshot(db, k)
    rows = []
    by_grade: dict[int, list[int]] = {g: [] for g in GRADES}
    for st in snap.students:
        quiz = [q for q in snap.weekly_quiz.get(st.id, []) if q is not None]
        marks = snap.marks.get(st.id, [])
        att = snap.attendance_percent(st)
        by_grade[st.grade].append(att)
        rows.append(s.ReportRow(
            student=_student(st), attendance_percent=att,
            average_quiz_percent=round(sum(quiz) / len(quiz)) if quiz else 0,
            average_test_percent=round(sum(mk.score / mk.max_score * 100 for mk in marks) / len(marks)) if marks else 0,
            tag=snap.tag(st)[0],
        ))
    return s.Report(
        from_=svc.window_weeks()[0].isoformat(), to=config.today().isoformat(), school_days=snap.school_days,
        attendance_by_grade=[s.GradePercent(grade=g, percent=round(sum(v) / len(v)) if v else 0) for g, v in by_grade.items()],
        syllabus=svc.syllabus_progress(list(snap.topics.values())), rows=rows,
    )


@app.get("/api/reports", response_model=s.Report)
def report(db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    return _report(db, k)


@app.get("/api/reports/pdf")
def report_pdf(db: Session = Depends(get_db), k: m.MultigradeClass = Depends(klass_dep)):
    pdf = build_report_pdf(_report(db, k), k.name, k.teacher.name)
    fname = f"veda-report-{config.today().isoformat()}.pdf"
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ---------- student side (shared family phone; no Google login) ----------

TOKEN_KEY = hashlib.sha256(b"veda-student-token").digest()


@app.get("/api/student/profiles", response_model=list[s.StudentProfile])
def profiles(class_id: str | None = Query(None, alias="classId"), db: Session = Depends(get_db)):
    cid = class_id or (svc.DEMO_CLASS_ID if config.DEMO_MODE else None)
    if not cid:
        raise LookupError("Open the class link your teacher shared (it ends with ?class=…).")
    sts = db.scalars(select(m.Student).where(m.Student.class_id == cid).order_by(m.Student.grade, m.Student.roll_no))
    return [s.StudentProfile(student=_student(x), has_pin=bool(x.pin_hash)) for x in sts]


@app.post("/api/student/login", response_model=s.LoginOut)
def student_login(body: s.LoginIn, db: Session = Depends(get_db)):
    st = db.get(m.Student, body.student_id)
    if not st or not st.pin_hash or not hmac.compare_digest(st.pin_hash, pin_hash(st.id, body.pin)):
        return s.LoginOut(ok=False)
    return s.LoginOut(ok=True, token=hmac.new(TOKEN_KEY, st.id.encode(), "sha256").hexdigest())


@app.get("/api/student/{student_id}/today", response_model=s.StudentToday)
def student_today(student_id: str, db: Session = Depends(get_db)):
    st = db.get(m.Student, student_id)
    if not st:
        raise LookupError("Student not found.")
    rows = db.execute(
        select(m.CardDeck, m.DeckSend).options(selectinload(m.CardDeck.quiz)).join(m.DeckSend, m.DeckSend.deck_id == m.CardDeck.id)
        .where(m.DeckSend.class_id == st.class_id, m.DeckSend.grade == st.grade).order_by(m.DeckSend.sent_at.desc())
    ).all()
    done_quiz = {q for (q,) in db.execute(select(m.QuizAttempt.quiz_id).where(m.QuizAttempt.student_id == st.id))}
    completed = [d.id for d, _ in rows if d.quiz and d.quiz.id in done_quiz]
    latest: dict[str, tuple[m.CardDeck, m.DeckSend]] = {}
    for d, send in rows:
        latest.setdefault(d.topic_id, (d, send))  # one language per topic: the latest sent
    pending = [(d, send) for d, send in latest.values() if d.id not in completed]
    return s.StudentToday(student=_student(st), decks=[svc.deck_to_schema(d, True, st.grade, send) for d, send in pending], completed_deck_ids=completed)


@app.post("/api/student/{student_id}/quiz", response_model=s.QuizResult)
def submit_quiz(student_id: str, body: s.QuizSubmission, db: Session = Depends(get_db)):
    st = db.get(m.Student, student_id)
    if not st:
        raise LookupError("Student not found.")
    d = _load_deck(db, body.deck_id)
    if not d.quiz:
        raise LookupError("This deck has no quiz.")
    qs = d.quiz.questions
    correct = sum(1 for q, a in zip(qs, body.answers) if q["answerIndex"] == a)
    pct = round(100 * correct / len(qs)) if qs else 0
    db.add(m.QuizAttempt(quiz_id=d.quiz.id, student_id=student_id, taken_on=config.today(), answers=body.answers, correct=correct, total=len(qs), percent=pct))
    svc.update_mastery(db, student_id, d.topic_id, pct)
    db.flush()
    klass = svc.load_class(db, class_id=st.class_id)
    if klass:
        svc.refresh_alerts(db, klass)
    db.commit()
    return s.QuizResult(correct=correct, total=len(qs), percent=pct)


@app.post("/api/tutor", response_model=s.TutorReply)
def tutor(body: s.TutorRequest, db: Session = Depends(get_db)):
    st = db.get(m.Student, body.student_id)
    if not st:
        raise LookupError("Student not found.")
    klass = svc.load_class(db, class_id=st.class_id)
    # grounded ONLY in this grade's topics the class has reached (done + learning now)
    syllabus = [t for t in svc.topics(db, klass, st.grade) if t.status != "not_started"]
    by_id = {t.id: t for t in syllabus}
    view = by_id.get(body.topic_id or "") or next((t for t in syllabus if t.status == "in_progress"), None) or (syllabus[-1] if syllabus else None)
    focus = db.get(m.Topic, view.id) if view else None  # with source_text
    history = [h.model_dump() for h in body.history]
    placeholder = False
    try:
        out = ai_client.tutor_turn(db, grade=st.grade, language=body.language, syllabus=syllabus, focus=focus, history=history, message=body.message)
        text, suggestions, topic_id, assessment = out.reply, out.suggestions, out.topic_id, out.assessment
    except ai_client.SarvamError:
        text, suggestions = ai_client.placeholder_tutor(focus, body.language, body.message)
        topic_id, assessment, placeholder = focus.id if focus else None, "none", True

    if topic_id and assessment != "none":
        svc.update_mastery(db, st.id, topic_id, 90 if assessment == "correct" else 30)
    today = config.today()
    sess = db.scalar(select(m.TutorSession).where(m.TutorSession.student_id == st.id, m.TutorSession.started_on == today))
    if not sess:
        sess = m.TutorSession(student_id=st.id, topic_id=topic_id, language=body.language, started_on=today, minutes=0, messages=[])
        db.add(sess)
    sess.minutes += 1
    sess.topic_id = topic_id or sess.topic_id
    sess.messages = (sess.messages or []) + [
        {"role": "student", "text": body.message},
        {"role": "vidya", "text": text, "topicId": topic_id, "assessment": assessment},
    ]
    db.commit()
    return s.TutorReply(text=text, suggestions=suggestions, topic_id=topic_id, assessment=assessment, placeholder=placeholder)


# ---------- voice (VOICE_PROVIDER=sarvam) ----------

def _voice_on() -> None:
    if config.VOICE_PROVIDER != "sarvam" or not ai_client.enabled():
        raise HTTPException(409, "Sarvam voice is off. Set VOICE_PROVIDER=sarvam in .env (the app uses the browser's voice meanwhile).")


@app.post("/api/voice/stt", response_model=s.SttOut)
async def speech_to_text(file: UploadFile = File(...), language: str = Form("unknown"), seconds: float | None = Form(None), db: Session = Depends(get_db)):
    _voice_on()
    audio = await file.read()
    if len(audio) > 4_000_000:
        raise HTTPException(413, "Recording too long. Keep it under 30 seconds.")
    try:
        out = ai_client.transcribe(db, audio, file.filename or "audio.wav", file.content_type or "audio/wav", language, seconds)
    except ai_client.SarvamError as e:
        db.commit()
        raise HTTPException(502, str(e)) from e
    db.commit()
    return s.SttOut(transcript=out["transcript"], language_code=out["languageCode"])


@app.post("/api/voice/tts", response_model=s.TtsOut)
def text_to_speech(body: s.TtsIn, db: Session = Depends(get_db)):
    _voice_on()
    try:
        out = ai_client.synthesize(db, body.text, body.language)
    except ai_client.SarvamError as e:
        db.commit()
        raise HTTPException(502, str(e)) from e
    db.commit()
    return s.TtsOut(**out)


# ---------- admin: AI usage ----------

@app.get("/api/admin/ai-usage", response_model=s.AiUsage)
def ai_usage(db: Session = Depends(get_db)):
    real = (m.AiCallLog.placeholder.is_(False), m.AiCallLog.cache_hit.is_(False), m.AiCallLog.model != "demo-content")
    total, failed, cost = db.execute(
        select(func.count(), func.count().filter(m.AiCallLog.ok.is_(False)), func.coalesce(func.sum(m.AiCallLog.est_cost_inr), 0.0)).where(*real)
    ).one()
    hits = db.scalar(select(func.count()).where(m.AiCallLog.cache_hit.is_(True))) or 0
    ph = db.scalar(select(func.count()).where(m.AiCallLog.placeholder.is_(True))) or 0
    by_model = db.execute(
        select(m.AiCallLog.model, func.count(), func.count().filter(m.AiCallLog.ok.is_(False)), func.coalesce(func.sum(m.AiCallLog.est_cost_inr), 0.0))
        .where(*real).group_by(m.AiCallLog.model).order_by(func.count().desc())
    ).all()
    recent = db.scalars(select(m.AiCallLog).where(*real).order_by(m.AiCallLog.id.desc()).limit(40))
    return s.AiUsage(
        sarvam_enabled=ai_client.enabled(), voice_provider=config.VOICE_PROVIDER, total_calls=total, failed_calls=failed, cache_hits=hits, placeholders=ph,
        est_cost_inr=round(float(cost), 3), budget_inr=config.AI_BUDGET_INR,
        by_model=[s.AiModelUsage(model=mo, calls=c, failed=f, est_cost_inr=round(float(co), 3)) for mo, c, f, co in by_model],
        recent=[s.AiCallRow(id=r.id, created_at=r.created_at.isoformat(), model=r.model, purpose=r.purpose, ok=r.ok, error=r.error, input_tokens=r.input_tokens,
                            output_tokens=r.output_tokens, input_chars=r.input_chars, audio_seconds=r.audio_seconds, latency_ms=r.latency_ms, est_cost_inr=r.est_cost_inr) for r in recent],
    )
