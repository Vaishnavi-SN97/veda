"""ai_client checks that need no network and spend no Sarvam credit."""

import json

import pytest
from pydantic import ValidationError

import ai_client
from ai_client import DeckJSON, QuestionJSON, chat_json, parse_json


def q(question="What is 2 + 2?", options=("4", "3", "5", "6"), answer="4", **kw):
    return {"question": question, "options": list(options), "answer": answer, "explanation": "Count on.", **kw}


def deck(questions=None, cards=None):
    return {
        "title": "Adding",
        "cards": cards or [{"title": f"Idea {c}", "body": "Some simple words about adding numbers."} for c in "ABCDE"],
        "quiz": questions or [q(f"What is {i} + 1?", (str(i + 1), str(i + 2), str(i + 3), str(i + 4)) if i % 2 else (str(i + 2), str(i + 1), str(i + 3), str(i + 4)), str(i + 1)) for i in range(5)],
    }


def test_parse_json_tolerates_fences_and_chatter():
    assert parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json('Here you go: {"a": {"b": 2}} hope it helps') == {"a": {"b": 2}}
    with pytest.raises(json.JSONDecodeError):
        parse_json("no json here")


def test_answer_text_sets_the_index():
    assert QuestionJSON.model_validate(q(options=("3", "4", "5", "6"), answer="4")).answerIndex == 1
    assert QuestionJSON.model_validate(q(options=("3", "5", "6", " 4 "), answer="4")).answerIndex == 3  # whitespace-insensitive


def test_answer_must_be_one_of_the_options():
    with pytest.raises(ValidationError):
        QuestionJSON.model_validate(q(answer="7"))


def test_equal_valued_options_are_rejected():
    with pytest.raises(ValidationError, match="equal in value"):
        QuestionJSON.model_validate(q("3 mangoes out of 6?", ("3/6", "1/2", "2/3", "6/3"), "1/2"))
    with pytest.raises(ValidationError, match="equal in value"):
        QuestionJSON.model_validate(q("Half as a decimal?", ("0.5", "1/2", "0.2", "2"), "0.5"))


def test_all_of_the_above_may_have_equal_values():
    ok = QuestionJSON.model_validate(q("Which equal 3?", ("12/4", "9/3", "6/2", "All of the above"), "All of the above"))
    assert ok.answerIndex == 3


def test_options_must_be_four_and_different():
    with pytest.raises(ValidationError):
        QuestionJSON.model_validate(q(options=("4", "4", "5", "6")))
    with pytest.raises(ValidationError):
        QuestionJSON.model_validate(q(options=("4", "5", "6")))


def test_deck_shape_rules():
    DeckJSON.model_validate(deck())
    with pytest.raises(ValidationError):  # too few cards
        DeckJSON.model_validate(deck(cards=[{"title": "One", "body": "Some simple words here."}] * 3))
    with pytest.raises(ValidationError, match="different idea"):  # padded cards ("Fill in 2", "Fill in 3")
        DeckJSON.model_validate(deck(cards=[{"title": f"Fill in {i}", "body": "Find the missing numbers here."} for i in range(5)]))



def test_options_are_shuffled_in_code_and_answer_follows():
    first = [q(f"What is {i} + 1?", (str(i + 1), "x", "y", "z"), str(i + 1)) for i in range(5)]  # model put every answer first
    _, _, quiz = ai_client._deck_from_json(DeckJSON.model_validate(deck(questions=first)))
    for item in quiz:
        assert item["options"][item["answerIndex"]] == item["question"].split()[2].replace("+", "") or item["options"][item["answerIndex"]] not in ("x", "y", "z")
    assert len({item["answerIndex"] for item in quiz}) > 1, "answers end up in different positions"
    again = ai_client._deck_from_json(DeckJSON.model_validate(deck(questions=first)))[2]
    assert again == quiz, "same question, same shuffle"


class FakeDB:
    def add(self, _):
        pass

    def flush(self):
        pass

    def scalar(self, *_):
        return 0


def test_chat_json_retries_once_with_the_error(monkeypatch):
    replies = iter(['{"title": "x"}', json.dumps(deck())])
    seen = []

    def fake_chat(db, *, messages, purpose, **kw):
        seen.append((purpose, messages[-1]["content"]))
        return next(replies)

    monkeypatch.setattr(ai_client, "chat", fake_chat)
    d = chat_json(FakeDB(), model="m", system="s", user="u", purpose="cards", validate=DeckJSON.model_validate)
    assert len(d.cards) == 5
    assert [p for p, _ in seen] == ["cards", "cards (retry)"]
    assert "not valid" in seen[1][1]


def test_chat_json_gives_up_after_one_retry(monkeypatch):
    monkeypatch.setattr(ai_client, "chat", lambda *a, **k: "not json")
    with pytest.raises(ai_client.SarvamError):
        chat_json(FakeDB(), model="m", system="s", user="u", purpose="cards", validate=DeckJSON.model_validate)


def test_translation_keeps_the_right_answer(monkeypatch):
    src = deck()
    translated = json.loads(json.dumps(src))
    for item in translated["quiz"]:
        item["answer"] = item["options"][3]  # a translation that "moves" the answer must be ignored
    monkeypatch.setattr(ai_client, "chat", lambda *a, **k: json.dumps(translated, ensure_ascii=False))

    class T:
        id, grade = "g4-x", 4

    parsed = DeckJSON.model_validate(src)
    title, cards, quiz = ai_client._deck_from_json(parsed)
    _, _, tq = ai_client.translate_deck(FakeDB(), T, "kn", title, cards, quiz)
    assert [x["answerIndex"] for x in tq] == [x["answerIndex"] for x in quiz]
