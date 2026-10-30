"""Risk score: a transparent 0-100 formula, every point traceable to a reason the teacher can read.

  Quiz trend   0-35   8 points for each week the weekly quiz fell in a row (up to 3 weeks = 24),
                      +11 if the latest quiz is below 50%.
  Test marks   0-25   latest test below 40% = 25, below 60% = 12.
  Attendance   0-25   5 points for every day missed beyond the first, in the last 4 weeks.
  Tutor        0-15   only when quiz or test points are above 0 (struggling AND not practising):
                      0 minutes with Vidya last week = 15, under 10 minutes = 8.

  Severity: 60+ high, 35+ medium, 20+ low. Below 20 there is no alert.

Tag (how the student is doing at home):
  on_track              quiz not falling and latest quiz at least 50%
  studied_but_confused  falling or low, but 20+ minutes with Vidya last week -> needs re-teaching
  didnt_study           falling or low, and under 20 minutes with Vidya -> needs a nudge at home
"""

from __future__ import annotations

from dataclasses import dataclass, field

ALERT_THRESHOLD = 20


@dataclass
class Signals:
    name: str
    weekly_quiz: list[int | None]  # oldest -> newest
    latest_test_percent: float | None = None
    latest_test_name: str | None = None
    test_class_average: float | None = None
    days_missed: int = 0
    school_days: int = 0
    tutor_minutes: list[int] = field(default_factory=list)  # oldest -> newest, per week


@dataclass
class Risk:
    score: int
    quiz_points: int
    test_points: int
    attendance_points: int
    tutor_points: int
    reasons: list[str]
    severity: str | None
    tag: str
    tag_reason: str


def consecutive_drops(scores: list[int | None]) -> int:
    vals = [s for s in scores if s is not None]
    n = 0
    for a, b in zip(reversed(vals[:-1]), reversed(vals[1:])):
        if b < a:
            n += 1
        else:
            break
    return n


def tag_for(weekly_quiz: list[int | None], tutor_minutes: list[int]) -> tuple[str, str]:
    vals = [s for s in weekly_quiz if s is not None]
    last_tutor = tutor_minutes[-1] if tutor_minutes else 0
    if not vals:
        return "on_track", "No quizzes yet."
    falling = consecutive_drops(vals) >= 3
    low = vals[-1] < 50
    if not falling and not low:
        return "on_track", f"Latest quiz {vals[-1]}%, steady over {len(vals)} weeks."
    if last_tutor >= 20:
        return "studied_but_confused", f"Spent {last_tutor} min with Vidya last week, but the quiz fell to {vals[-1]}%. Needs re-teaching, not more practice."
    return "didnt_study", f"Only {last_tutor} min with Vidya last week and the quiz fell to {vals[-1]}%. Needs a nudge at home."


def score(sig: Signals) -> Risk:
    reasons: list[str] = []
    quiz = [s for s in sig.weekly_quiz if s is not None]

    drops = consecutive_drops(quiz)
    quiz_points = 8 * min(drops, 3)
    if drops >= 1:
        recent = quiz[-(min(drops, 3) + 1):]
        reasons.append(f"Weekly quiz fell {drops} week{'s' if drops > 1 else ''} in a row: {'% → '.join(map(str, recent))}%.")
    if quiz and quiz[-1] < 50:
        quiz_points += 11
        if drops == 0:
            reasons.append(f"Latest weekly quiz is {quiz[-1]}%.")

    test_points = 0
    if sig.latest_test_percent is not None:
        if sig.latest_test_percent < 40:
            test_points = 25
        elif sig.latest_test_percent < 60:
            test_points = 12
        if test_points:
            avg = f" (class average {round(sig.test_class_average)}%)" if sig.test_class_average is not None else ""
            reasons.append(f"Scored {round(sig.latest_test_percent)}% in {sig.latest_test_name or 'the latest test'}{avg}.")

    attendance_points = min(25, 5 * max(0, sig.days_missed - 1))
    if attendance_points:
        reasons.append(f"Missed {sig.days_missed} of the last {sig.school_days} school days.")

    tutor_points = 0
    last_tutor = sig.tutor_minutes[-1] if sig.tutor_minutes else 0
    if quiz_points or test_points:
        if last_tutor == 0:
            tutor_points = 15
        elif last_tutor < 10:
            tutor_points = 8
        if tutor_points:
            reasons.append(f"Only {last_tutor} minutes of practice with Vidya last week.")
    if not tutor_points and (quiz_points or test_points) and len(sig.tutor_minutes) >= 2 and sig.tutor_minutes[-1] > sig.tutor_minutes[0]:
        reasons.append(f"Is trying: time with Vidya went up from {sig.tutor_minutes[0]} to {sig.tutor_minutes[-1]} minutes a week.")

    total = quiz_points + test_points + attendance_points + tutor_points
    severity = "high" if total >= 60 else "medium" if total >= 35 else "low" if total >= ALERT_THRESHOLD else None
    tag, tag_reason = tag_for(sig.weekly_quiz, sig.tutor_minutes)
    return Risk(total, quiz_points, test_points, attendance_points, tutor_points, reasons, severity, tag, tag_reason)


def title_and_suggestion(r: Risk, name: str, weak_topic: str | None, weak_chapter: str | None, partner: str | None) -> tuple[str, str]:
    """Plain-language alert text from the score's biggest part. Template text, no AI."""
    parts = {"learning": r.quiz_points + r.test_points, "attendance": r.attendance_points}
    main = max(parts, key=parts.get)
    if main == "attendance" and r.attendance_points >= r.quiz_points + r.test_points:
        return (
            f"{name} is missing school often",
            f"Visit or call home this week. Re-send this week's topic cards so {name} can catch up.",
        )
    if r.tag == "didnt_study":
        return (
            f"{name} is not revising at home",
            f"Call {name}'s parent: ask for the family phone for 15 minutes each evening, and show {name} how to open \"New today\".",
        )
    pair = f" Pair {name} with {partner} for peer work." if partner else ""
    return (
        f"{name} is falling behind in {weak_chapter or 'maths'}",
        f"Next week, add one teacher-led maths period to re-teach \"{weak_topic or 'the last topic'}\" to {name} with a hands-on activity.{pair}",
    )
