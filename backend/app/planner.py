"""Weekly planner: Google OR-Tools CP-SAT. No LLM anywhere in here.

Rules (hard):
  1. Every lesson period has exactly ONE teaching session: either one grade is teacher-led, or the
     grades of one merge candidate (overlapping chapters) are taught together in a merged session.
     The other grades get guided work (self work, peer work or reading).
  2. Breaks are never scheduled (periods are built around them).
  3. While the teacher is unavailable (on duty), nobody is teacher-led; all grades do self work.
  4. If many students of a grade are absent on a day, that grade gets no new teaching that day
     (it can still join a merged revision session).
  5. On a "no new topic" day (rain, many absent) every maths period is a merged revision session.
  6. Each grade gets at least one teacher-led period every full teaching day.
  7. A grade with an accepted alert gets at least one more teacher-led maths period than each other grade.
  8. At most one merged maths session per day, each merge candidate at most once a week.
  9. Periods fixed by a replan (before the change) keep their previous assignment.

Goals (soft, in priority order): balanced teacher minutes across grades, use merge candidates,
stay close to the previous plan when replanning, avoid teaching the same grade in back-to-back periods.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

GRADES = (3, 4, 5)

# Default weekly subject pattern per lesson period (cycled if a day has more periods).
DEFAULT_SUBJECTS: dict[int, list[str]] = {
    1: ["Kannada", "Maths", "English", "EVS", "Maths", "Kannada", "Games"],
    2: ["Maths", "Kannada", "EVS", "English", "Maths", "Art", "Reading"],
    3: ["Kannada", "Maths", "English", "Maths", "EVS", "English", "Games"],
    4: ["Maths", "English", "Kannada", "EVS", "Maths", "Kannada", "Reading"],
    5: ["English", "Maths", "Kannada", "Maths", "EVS", "Art", "Games"],
    6: ["Kannada", "Maths", "English", "Games"],
}
# Activity periods where all grades do the same thing together; not lessons, no teaching session.
WHOLE_CLASS = {"Games", "Art"}

GUIDED = ("self_work", "peer_work", "reading")


@dataclass
class TopicRef:
    id: str
    grade: int
    chapter: str
    title: str
    order: int
    status: str  # not_started | in_progress | done


@dataclass
class MergeCandidate:
    concept: str  # e.g. "multiplication"
    chapter: str  # display name
    grades: tuple[int, ...]
    activity: dict[int, str]  # per grade


@dataclass
class Priority:
    grade: int
    reason: str
    activity: str


@dataclass
class Slot:
    grade: int
    mode: str
    subject: str
    activity: str
    topic_id: str | None = None


@dataclass
class PlannedPeriod:
    day: int
    index: int
    start: str
    end: str
    subject: str
    slots: list[Slot]
    merged_chapter: str | None = None
    merged_note: str | None = None
    changed: bool = False

    def leaders(self) -> tuple[int, ...]:
        return tuple(s.grade for s in self.slots if s.mode == "teacher_led")


@dataclass
class PlanInput:
    days: list[int]
    hours_start: str
    hours_end: str
    period_minutes: int
    breaks: list[dict]
    topics: list[TopicRef]
    priorities: list[Priority] = field(default_factory=list)
    teacher_unavailable: set[tuple[int, int]] = field(default_factory=set)  # (day, index)
    no_new_topic_days: set[int] = field(default_factory=set)
    grade_absent: set[tuple[int, int]] = field(default_factory=set)  # (day, grade) with many absent
    previous: list[PlannedPeriod] | None = None
    fixed_before: tuple[int, int] | None = None  # keep previous plan for periods before (day, index)
    subjects: dict[int, list[str]] = field(default_factory=lambda: DEFAULT_SUBJECTS)
    time_limit_s: float = 5.0


@dataclass
class PlanResult:
    periods: list[PlannedPeriod]
    notes: list[str]
    teacher_led_minutes: dict[int, int]
    status: str  # OPTIMAL | FEASIBLE


class PlanInfeasible(Exception):
    pass


# ---------- time grid ----------

def _m(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _t(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def lesson_times(start: str, end: str, period_minutes: int, breaks: list[dict]) -> list[tuple[str, str]]:
    """Lesson periods between start and end, jumping over breaks."""
    out: list[tuple[str, str]] = []
    cur, stop = _m(start), _m(end)
    spans = sorted((_m(b["start"]), _m(b["end"])) for b in breaks)
    while cur + period_minutes <= stop:
        clash = next(((bs, be) for bs, be in spans if cur < be and cur + period_minutes > bs), None)
        if clash:
            cur = clash[1]
            continue
        out.append((_t(cur), _t(cur + period_minutes)))
        cur += period_minutes
    return out


# ---------- syllabus overlap ----------

_STOP = {"and", "of", "the", "simple", "numbers", "number", "figures", "geometrical", "in"}


def _concepts(chapter: str) -> set[str]:
    words = re.findall(r"[a-z]+", chapter.lower())
    out = set()
    for w in words:
        if w in _STOP or len(w) < 4:
            continue
        w = re.sub(r"(al|s)$", "", w)  # fractional -> fraction, fractions -> fraction, decimals -> decimal
        out.add(w)
    if "decimal" in out:
        out.add("fraction")  # decimals are fractions of ten: same paper-folding session works
    return out


def current_topic(topics: list[TopicRef], grade: int) -> TopicRef | None:
    own = sorted((t for t in topics if t.grade == grade), key=lambda t: t.order)
    return next((t for t in own if t.status == "in_progress"), None) or next((t for t in own if t.status == "not_started"), None) or (own[-1] if own else None)


def find_merge_candidates(topics: list[TopicRef]) -> list[MergeCandidate]:
    """Concepts that two or three grades meet this week: current for at least one grade,
    and current or already done (so it becomes revision) for the others."""
    current = {g: current_topic(topics, g) for g in GRADES}
    cur_concepts = {g: _concepts(current[g].chapter) if current[g] else set() for g in GRADES}
    seen_concepts: dict[int, set[str]] = {g: set() for g in GRADES}
    for t in topics:
        if t.status != "not_started" or t is current[t.grade]:
            seen_concepts[t.grade] |= _concepts(t.chapter)

    candidates: dict[str, MergeCandidate] = {}
    for concept in set().union(*cur_concepts.values()):
        grades = tuple(g for g in GRADES if concept in cur_concepts[g] or concept in seen_concepts[g])
        if len(grades) < 2 or not any(concept in cur_concepts[g] for g in grades):
            continue
        activity: dict[int, str] = {}
        chapter = ""
        for g in grades:
            if concept in cur_concepts[g] and current[g]:
                activity[g] = f"Learn: {current[g].title}"
                chapter = chapter or current[g].chapter
            else:
                done = [t for t in topics if t.grade == g and t.status == "done" and concept in _concepts(t.chapter)]
                last = max(done, key=lambda t: t.order) if done else None
                activity[g] = f"Revise: {last.title}" if last else "Revise with the group"
        key = ",".join(map(str, grades)) + chapter
        if key not in candidates:
            candidates[key] = MergeCandidate(concept=concept, chapter=chapter.title() if chapter.isupper() else chapter, grades=grades, activity=activity)
    # prefer sessions that cover more grades
    return sorted(candidates.values(), key=lambda c: (-len(c.grades), c.chapter))[:2]


# ---------- solver ----------

def _activity(subject: str, mode: str, topic: TopicRef | None) -> str:
    if subject == "Maths" and topic:
        return {
            "teacher_led": f"Teach: {topic.title}",
            "self_work": f"Workbook practice: {topic.title}",
            "peer_work": f"Pair practice: {topic.title} (older child checks)",
            "reading": "Re-read the last topic cards",
        }[mode]
    table = {
        "Kannada": {"teacher_led": "Lesson and reading aloud", "self_work": "Copy writing", "peer_work": "Read to a partner", "reading": "Library story book"},
        "English": {"teacher_led": "Lesson, new words and rhymes", "self_work": "Copy writing and spelling", "peer_work": "Picture talk with a partner", "reading": "Graded reader"},
        "EVS": {"teacher_led": "Lesson and discussion", "self_work": "Draw and label", "peer_work": "Group activity", "reading": "Read the EVS chapter"},
        "Reading": {"teacher_led": "Guided reading with the teacher", "self_work": "Silent reading", "peer_work": "Paired reading", "reading": "Reading corner: any story book"},
    }
    return table.get(subject, {}).get(mode, subject)


def day_name(day: int) -> str:
    return ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]


def plan_week(inp: PlanInput) -> PlanResult:
    times = lesson_times(inp.hours_start, inp.hours_end, inp.period_minutes, inp.breaks)
    if not times:
        raise PlanInfeasible("School hours leave no room for a single period.")
    grid = [(d, i, s, e, inp.subjects.get(d, DEFAULT_SUBJECTS[1])[i % len(inp.subjects.get(d, DEFAULT_SUBJECTS[1]))]) for d in inp.days for i, (s, e) in enumerate(times)]
    lessons = [p for p in grid if p[4] not in WHOLE_CLASS]
    candidates = find_merge_candidates(inp.topics)
    topic_of = {g: current_topic(inp.topics, g) for g in GRADES}
    prev = {(p.day, p.index): p for p in (inp.previous or [])}

    def is_fixed(d: int, i: int) -> bool:
        return inp.fixed_before is not None and (d, i) < inp.fixed_before and (d, i) in prev

    m = cp_model.CpModel()
    # options per lesson period: ("single", g) or ("merge", k) or ("revision",) or ("none",)
    y: dict[tuple, cp_model.IntVar] = {}
    x: dict[tuple[int, int, int], cp_model.LinearExpr] = {}
    merged_vars: dict[tuple[int, int], list[cp_model.IntVar]] = {}

    for d, i, _s, _e, subject in lessons:
        opts: list[cp_model.IntVar] = []
        if (d, i) in inp.teacher_unavailable:
            y[(d, i, "none")] = m.NewConstant(1)
            for g in GRADES:
                x[(d, i, g)] = 0
            continue
        if subject == "Maths" and d in inp.no_new_topic_days:
            # forced merged revision for all grades
            y[(d, i, "revision")] = m.NewConstant(1)
            for g in GRADES:
                x[(d, i, g)] = 1
            continue
        for g in GRADES:
            v = m.NewBoolVar(f"lead_{d}_{i}_{g}")
            if (d, g) in inp.grade_absent:
                m.Add(v == 0)
            y[(d, i, "single", g)] = v
            opts.append(v)
        mv = []
        if subject == "Maths":
            for k, _c in enumerate(candidates):
                v = m.NewBoolVar(f"merge_{d}_{i}_{k}")
                y[(d, i, "merge", k)] = v
                opts.append(v)
                mv.append(v)
        merged_vars[(d, i)] = mv
        m.AddExactlyOne(opts)  # rule 1
        for g in GRADES:
            x[(d, i, g)] = y[(d, i, "single", g)] + sum(y[(d, i, "merge", k)] for k, c in enumerate(candidates) if subject == "Maths" and g in c.grades)

        if is_fixed(d, i):  # rule 9
            p = prev[(d, i)]
            leaders = p.leaders()
            if len(leaders) == 1:
                m.Add(y[(d, i, "single", leaders[0])] == 1)
            elif len(leaders) > 1:
                ks = [k for k, c in enumerate(candidates) if set(c.grades) == set(leaders)]
                if ks and subject == "Maths":
                    m.Add(y[(d, i, "merge", ks[0])] == 1)

    # rule 8: at most one merged maths session a day, each candidate at most once a week
    for d in inp.days:
        day_merges = [v for (dd, _i), vs in merged_vars.items() if dd == d for v in vs]
        if day_merges:
            m.Add(sum(day_merges) <= 1)
    for k in range(len(candidates)):
        uses = [y[key] for key in y if len(key) == 4 and key[2] == "merge" and key[3] == k]
        if uses:
            m.Add(sum(uses) <= 1)

    # rule 6: every grade taught at least once on each FULL teaching day
    # (a day the teacher is partly away, or a revision day, is not a full day)
    for d in inp.days:
        day_lessons = [(dd, i) for dd, i, *_ in lessons if dd == d]
        available = [(dd, i) for dd, i in day_lessons if (dd, i) not in inp.teacher_unavailable]
        if len(available) < len(day_lessons) or d in inp.no_new_topic_days:
            continue
        for g in GRADES:
            if (d, g) in inp.grade_absent:
                continue
            m.Add(sum(x[(dd, i, g)] for dd, i in available) >= 1)

    # rule 7: accepted alerts -> extra teacher-led maths for that grade
    maths = [(d, i) for d, i, _s, _e, subj in lessons if subj == "Maths"]
    maths_led = {g: sum(x[(d, i, g)] for d, i in maths) for g in GRADES}
    priority_grades = {p.grade for p in inp.priorities}
    for g in priority_grades:
        for h in GRADES:
            if h not in priority_grades:
                m.Add(maths_led[g] >= maths_led[h] + 1)

    # goals
    total = {g: sum(x[(d, i, g)] for d, i, *_ in lessons) for g in GRADES}
    hi = m.NewIntVar(0, len(lessons), "hi")
    lo = m.NewIntVar(0, len(lessons), "lo")
    for g in GRADES:
        m.Add(hi >= total[g])
        m.Add(lo <= total[g])
    merge_uses = [v for vs in merged_vars.values() for v in vs]

    back_to_back = []
    for d in inp.days:
        day_lessons = sorted(i for dd, i, *_ in lessons if dd == d)
        for a, b in zip(day_lessons, day_lessons[1:]):
            if b != a + 1:
                continue
            for g in GRADES:
                sa, sb = y.get((d, a, "single", g)), y.get((d, b, "single", g))
                if sa is None or sb is None:
                    continue
                c = m.NewBoolVar(f"b2b_{d}_{a}_{g}")
                m.Add(c >= sa + sb - 1)
                back_to_back.append(c)

    stay_close = []
    if inp.previous:
        for d, i, *_ in lessons:
            p = prev.get((d, i))
            if not p or is_fixed(d, i):
                continue
            leaders = p.leaders()
            if len(leaders) == 1 and (d, i, "single", leaders[0]) in y:
                stay_close.append(1 - y[(d, i, "single", leaders[0])])

    m.Minimize(20 * (hi - lo) - 12 * sum(merge_uses) + 4 * sum(stay_close) + 3 * sum(back_to_back))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = inp.time_limit_s
    solver.parameters.num_search_workers = 4
    solver.parameters.random_seed = 7
    status = solver.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise PlanInfeasible("No timetable satisfies all the rules. Try removing an accepted alert or a replan.")

    def val(e) -> int:
        return e if isinstance(e, int) else int(solver.Value(e))

    # ---------- build the plan ----------
    periods: list[PlannedPeriod] = []
    led_minutes = {g: 0 for g in GRADES}
    guided_turn = 0
    used_priority: set[int] = set()
    notes: list[str] = [
        "Each lesson period has one teaching session: you teach one grade (or a merged group) while the others do guided work.",
    ]
    merged_days: list[str] = []

    for d, i, s, e, subject in grid:
        if subject in WHOLE_CLASS:
            activity = "Outdoor games, mixed-grade teams" if subject == "Games" else "Art and craft, all grades together"
            periods.append(PlannedPeriod(d, i, s, e, subject, [Slot(g, "peer_work", subject, activity) for g in GRADES]))
            continue
        if (d, i) in inp.teacher_unavailable:
            slots = [Slot(g, "self_work", subject, f"Self work with class monitor: {'workbook practice' if subject == 'Maths' else 'copy writing / reading'}", topic_of[g].id if subject == "Maths" and topic_of[g] else None) for g in GRADES]
            periods.append(PlannedPeriod(d, i, s, e, subject, slots))
            continue
        if (d, i, "revision") in y:
            slots = []
            for g in GRADES:
                done = sorted((t for t in inp.topics if t.grade == g and t.status == "done"), key=lambda t: t.order)
                slots.append(Slot(g, "teacher_led", subject, f"Revise: {done[-1].title if done else 'last topic'}", done[-1].id if done else None))
            periods.append(PlannedPeriod(d, i, s, e, subject, slots, "Revision", "No new topic today so absent children don't miss it. All grades revise together."))
            continue

        k_used = next((k for k in range(len(candidates)) if (d, i, "merge", k) in y and val(y[(d, i, "merge", k)])), None)
        if k_used is not None:
            c = candidates[k_used]
            slots = []
            for g in GRADES:
                if g in c.grades:
                    slots.append(Slot(g, "teacher_led", subject, c.activity[g], topic_of[g].id if topic_of[g] else None))
                    led_minutes[g] += inp.period_minutes
                else:
                    mode = GUIDED[(guided_turn + g) % 3]
                    slots.append(Slot(g, mode, subject, _activity(subject, mode, topic_of[g]), topic_of[g].id if topic_of[g] else None))
            guided_turn += 1
            periods.append(PlannedPeriod(d, i, s, e, subject, slots, c.chapter, f"One session, {len(c.grades)} levels: the same activity with different questions for Grades {', '.join(map(str, c.grades))}."))
            merged_days.append(f"{c.chapter} on {day_name(d)} (Grades {', '.join(map(str, c.grades))})")
            continue

        leader = next(g for g in GRADES if val(y[(d, i, "single", g)]))
        led_minutes[leader] += inp.period_minutes
        slots = []
        changed = False
        for g in GRADES:
            topic = topic_of[g] if subject == "Maths" else None
            if g == leader:
                activity = _activity(subject, "teacher_led", topic)
                pr = next((p for p in inp.priorities if p.grade == g), None)
                if pr and subject == "Maths" and g not in used_priority and d >= min(inp.days) + 1:
                    activity = pr.activity
                    used_priority.add(g)
                    changed = True
                    notes.append(f"{day_name(d)} period {i + 1}: extra teacher time for Grade {g}. {pr.reason}")
                slots.append(Slot(g, "teacher_led", subject, activity, topic.id if topic else None))
            else:
                mode = GUIDED[(guided_turn + g) % 3]
                slots.append(Slot(g, mode, subject, _activity(subject, mode, topic), topic.id if topic else None))
        guided_turn += 1
        periods.append(PlannedPeriod(d, i, s, e, subject, slots, changed=changed))

    if merged_days:
        notes.insert(1, "Merged sessions: " + "; ".join(merged_days) + ", where grades meet the same idea at their own level.")
    if inp.teacher_unavailable:
        notes.append("While you are on duty, all grades do self work with a class monitor; your teaching time is shared out on the other days.")
    for d in sorted(inp.no_new_topic_days):
        notes.append(f"{day_name(d)}: no new topics. Maths periods are merged revision so absent children don't fall behind.")
    for d, g in sorted(inp.grade_absent):
        notes.append(f"{day_name(d)}: many Grade {g} children absent, so no new teaching for Grade {g} that day.")

    if inp.previous:
        for p in periods:
            old = prev.get((p.day, p.index))
            if old and ([(s.grade, s.mode) for s in old.slots] != [(s.grade, s.mode) for s in p.slots] or old.merged_chapter != p.merged_chapter):
                p.changed = True

    return PlanResult(periods, notes, led_minutes, "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE")
