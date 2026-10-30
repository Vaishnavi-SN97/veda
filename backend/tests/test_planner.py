from collections import Counter

import pytest

from app.planner import (
    WHOLE_CLASS,
    PlanInfeasible,
    PlanInput,
    Priority,
    TopicRef,
    find_merge_candidates,
    lesson_times,
    plan_week,
)

BREAKS = [{"label": "Short break", "start": "11:00", "end": "11:15"}, {"label": "Lunch", "start": "12:45", "end": "13:30"}]


def topics() -> list[TopicRef]:
    """Grade 3 is learning multiplication (Grades 4 and 5 already did it); Grades 4 and 5 are both on fractions/decimals."""
    t = [
        TopicRef("g3-a", 3, "Subtraction", "Subtracting with borrowing", 1, "done"),
        TopicRef("g3-b", 3, "Multiplication", "Multiplication as repeated addition", 2, "done"),
        TopicRef("g3-c", 3, "Multiplication", "Tables from 6 to 10", 3, "in_progress"),
        TopicRef("g4-a", 4, "Multiplication", "Multiply by 2-digit numbers", 1, "done"),
        TopicRef("g4-b", 4, "Fractional Numbers", "Equivalent fractions", 2, "done"),
        TopicRef("g4-c", 4, "Fractional Numbers", "Decimals 0.1 to 0.9", 3, "in_progress"),
        TopicRef("g5-a", 5, "Multiplication", "Product of two 3-digit numbers", 1, "done"),
        TopicRef("g5-b", 5, "Decimal fractions", "Express a fraction in decimal form", 2, "in_progress"),
        TopicRef("g5-c", 5, "Money", "Prepare a bill", 3, "not_started"),
    ]
    return t


def base_input(**kw) -> PlanInput:
    args = dict(days=[1, 2, 3, 4, 5], hours_start="09:30", hours_end="15:45", period_minutes=45, breaks=BREAKS, topics=topics(), time_limit_s=10)
    args.update(kw)
    return PlanInput(**args)


def lessons(result):
    return [p for p in result.periods if p.subject not in WHOLE_CLASS]


def test_lesson_times_skip_breaks():
    times = lesson_times("09:30", "15:45", 45, BREAKS)
    assert times[0] == ("09:30", "10:15")
    assert ("11:15", "12:00") in times  # resumes after the short break
    assert ("13:30", "14:15") in times  # resumes after lunch
    for s, e in times:
        for b in BREAKS:
            assert e <= b["start"] or s >= b["end"], f"{s}-{e} overlaps {b['label']}"
    assert len(times) == 7


def test_exactly_one_teaching_session_per_lesson_period():
    r = plan_week(base_input())
    for p in lessons(r):
        leaders = p.leaders()
        assert len(leaders) >= 1
        if p.merged_chapter:
            assert len(leaders) >= 2, "a merged session teaches two or three grades together"
        else:
            assert len(leaders) == 1, f"{p.day}/{p.index} has {leaders}"
        # every other grade has guided work, never idle
        for s in p.slots:
            assert s.mode in {"teacher_led", "self_work", "peer_work", "reading"}


def test_breaks_respected_in_plan():
    r = plan_week(base_input())
    for p in r.periods:
        for b in BREAKS:
            assert p.end <= b["start"] or p.start >= b["end"]


def test_teacher_minutes_are_balanced():
    r = plan_week(base_input())
    mins = r.teacher_led_minutes
    assert max(mins.values()) - min(mins.values()) <= 45, mins


def test_every_grade_taught_every_day():
    r = plan_week(base_input())
    for d in [1, 2, 3, 4, 5]:
        led = {g for p in lessons(r) if p.day == d for g in p.leaders()}
        assert led == {3, 4, 5}, f"day {d}: {led}"


def test_overlapping_chapters_become_merged_sessions():
    cands = find_merge_candidates(topics())
    groups = {c.grades for c in cands}
    assert (3, 4, 5) in groups  # multiplication: Grade 3 learns, 4 and 5 revise
    assert (4, 5) in groups  # fractions and decimals
    r = plan_week(base_input())
    merged = [p for p in lessons(r) if p.merged_chapter]
    assert len(merged) == 2
    assert all(p.subject == "Maths" for p in merged)
    assert len({p.day for p in merged}) == 2, "at most one merged session per day"
    mult = next(p for p in merged if "Multiplication" in p.merged_chapter)
    assert {s.grade: s.activity for s in mult.slots}[3].startswith("Learn")
    assert {s.grade: s.activity for s in mult.slots}[5].startswith("Revise")


def test_no_merge_without_overlap():
    t = [
        TopicRef("a", 3, "Shapes", "Tangram", 1, "in_progress"),
        TopicRef("b", 4, "Circles", "Radius", 1, "in_progress"),
        TopicRef("c", 5, "Time", "24 hour clock", 1, "in_progress"),
    ]
    assert find_merge_candidates(t) == []
    r = plan_week(base_input(topics=t))
    assert not any(p.merged_chapter for p in r.periods)


def test_priority_grade_gets_extra_maths_time():
    pr = Priority(4, "You accepted the alert about Ravi.", "Re-teach equivalent fractions (Ravi in front)")
    r = plan_week(base_input(priorities=[pr]))
    maths = Counter(g for p in lessons(r) if p.subject == "Maths" for g in p.leaders())
    assert maths[4] >= maths[3] + 1 and maths[4] >= maths[5] + 1, maths
    marked = [p for p in r.periods if any(s.activity == pr.activity for s in p.slots)]
    assert len(marked) == 1 and marked[0].changed
    assert any("Ravi" in n for n in r.notes)


def test_teacher_on_duty_means_no_teaching_and_time_moves_elsewhere():
    first = plan_week(base_input())
    duty = {(3, i) for i in range(4, 7)}  # Wednesday afternoon
    r = plan_week(base_input(teacher_unavailable=duty, previous=first.periods, fixed_before=(3, 4)))
    for p in lessons(r):
        if (p.day, p.index) in duty:
            assert p.leaders() == ()
            assert all(s.mode == "self_work" for s in p.slots)
    # earlier periods are untouched
    before = {(p.day, p.index): p.leaders() for p in first.periods if (p.day, p.index) < (3, 4)}
    after = {(p.day, p.index): p.leaders() for p in r.periods if (p.day, p.index) < (3, 4)}
    assert before == after
    assert any(p.changed for p in r.periods)
    mins = r.teacher_led_minutes
    assert max(mins.values()) - min(mins.values()) <= 45


def test_duty_replan_stays_feasible_with_a_priority_and_a_locked_morning():
    """Regression: the morning of the duty day is locked to the old plan, which may not have
    taught every grade yet; the 'every grade every day' rule must not apply to that day."""
    pr = Priority(4, "You accepted the alert about Ravi.", "Re-teach equivalent fractions")
    first = plan_week(base_input(priorities=[pr]))
    for start in range(1, 7):
        duty = {(3, i) for i in range(start, 7)}
        r = plan_week(base_input(priorities=[pr], teacher_unavailable=duty, previous=first.periods, fixed_before=(3, start)))
        assert all(p.leaders() == () for p in lessons(r) if (p.day, p.index) in duty)


def test_rain_day_turns_maths_into_merged_revision():
    r = plan_week(base_input(no_new_topic_days={2}))
    for p in r.periods:
        if p.day == 2 and p.subject == "Maths":
            assert p.merged_chapter == "Revision"
            assert set(p.leaders()) == {3, 4, 5}
            assert all(s.activity.startswith("Revise") for s in p.slots)


def test_absent_grade_gets_no_new_teaching_that_day():
    r = plan_week(base_input(grade_absent={(1, 5)}))
    for p in lessons(r):
        if p.day == 1 and not p.merged_chapter:
            assert 5 not in p.leaders()


def test_impossible_rules_raise():
    # teacher away all week but a grade has a priority: no way to give extra maths time
    away = {(d, i) for d in range(1, 6) for i in range(7)}
    with pytest.raises(PlanInfeasible):
        plan_week(base_input(teacher_unavailable=away, priorities=[Priority(4, "x", "y")]))
