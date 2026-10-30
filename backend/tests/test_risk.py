from app.risk import Signals, consecutive_drops, score, tag_for


def ravi() -> Signals:
    return Signals(
        name="Ravi",
        weekly_quiz=[78, 62, 45, 30],
        latest_test_percent=30,
        latest_test_name="Fractions class test",
        test_class_average=70,
        days_missed=4,
        school_days=19,
        tutor_minutes=[20, 28, 35, 42],
    )


def test_consecutive_drops():
    assert consecutive_drops([78, 62, 45, 30]) == 3
    assert consecutive_drops([60, 70, 65]) == 1
    assert consecutive_drops([50, 60, 70]) == 0
    assert consecutive_drops([None, 80, 70]) == 1
    assert consecutive_drops([]) == 0


def test_ravi_is_high_risk_with_every_reason_listed():
    r = score(ravi())
    assert (r.quiz_points, r.test_points, r.attendance_points, r.tutor_points) == (35, 25, 15, 0)
    assert r.score == 75
    assert r.severity == "high"
    assert r.tag == "studied_but_confused"
    text = " ".join(r.reasons)
    assert "fell 3 weeks in a row" in text and "78% → 62% → 45% → 30%" in text
    assert "Scored 30% in Fractions class test" in text
    assert "Missed 4 of the last 19" in text
    assert "went up from 20 to 42" in text  # trying, so no tutor points


def test_score_is_the_sum_of_its_parts():
    r = score(ravi())
    assert r.score == r.quiz_points + r.test_points + r.attendance_points + r.tutor_points


def test_steady_student_gets_no_alert():
    r = score(Signals(name="Ananya", weekly_quiz=[88, 90, 91, 93], latest_test_percent=95, days_missed=0, school_days=19, tutor_minutes=[30, 35, 40, 38]))
    assert r.score == 0
    assert r.severity is None
    assert r.reasons == []
    assert r.tag == "on_track"


def test_tutor_points_only_when_struggling():
    good_but_no_tutor = score(Signals(name="A", weekly_quiz=[80, 82, 85, 88], latest_test_percent=90, tutor_minutes=[0, 0, 0, 0]))
    assert good_but_no_tutor.tutor_points == 0
    struggling_no_tutor = score(Signals(name="Kiran", weekly_quiz=[58, 50, 44, 38], latest_test_percent=45, tutor_minutes=[5, 0, 0, 0]))
    assert struggling_no_tutor.tutor_points == 15
    assert struggling_no_tutor.tag == "didnt_study"
    assert struggling_no_tutor.severity == "high"  # 24+11 quiz, 12 test, 15 tutor = 62


def test_attendance_alone_can_raise_a_low_alert():
    r = score(Signals(name="Meena", weekly_quiz=[70, 72, 68, 71], latest_test_percent=75, days_missed=5, school_days=19))
    assert r.attendance_points == 20
    assert r.score == 20
    assert r.severity == "low"
    assert r.reasons == ["Missed 5 of the last 19 school days."]


def test_attendance_points_are_capped():
    assert score(Signals(name="X", weekly_quiz=[], days_missed=12, school_days=19)).attendance_points == 25


def test_test_mark_bands():
    assert score(Signals(name="X", weekly_quiz=[], latest_test_percent=39.9)).test_points == 25
    assert score(Signals(name="X", weekly_quiz=[], latest_test_percent=40)).test_points == 12
    assert score(Signals(name="X", weekly_quiz=[], latest_test_percent=60)).test_points == 0


def test_severity_bands():
    # 24 quiz (3 drops, latest 50) + 12 test = 36 -> medium
    r = score(Signals(name="X", weekly_quiz=[90, 80, 70, 50], latest_test_percent=55, tutor_minutes=[30]))
    assert r.score == 36 and r.severity == "medium"


def test_tag_rules():
    assert tag_for([80, 70, 60, 40], [25])[0] == "studied_but_confused"
    assert tag_for([80, 70, 60, 40], [5])[0] == "didnt_study"
    assert tag_for([60, 65, 70, 72], [0])[0] == "on_track"
