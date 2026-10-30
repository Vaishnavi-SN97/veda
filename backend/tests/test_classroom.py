"""Classroom integration logic against a fake Google service (no network, no real Classroom)."""

import socket

import pytest
from googleapiclient.errors import HttpError
from httplib2 import Response

from app import classroom


class Req:
    def __init__(self, result=None, error=None):
        self.result, self.error = result, error

    def execute(self, num_retries=0):
        if self.error:
            raise self.error
        return self.result


class Collection:
    """Records calls; each method returns a queued Req."""

    def __init__(self, log, responses):
        self.log, self.responses = log, responses

    def __getattr__(self, name):
        def method(**kw):
            self.log.append((name, kw))
            return self.responses.get(name, Req({}))
        return method


class FakeService:
    def __init__(self, responses):
        self.log = []
        self.responses = responses

    def courses(self):
        svc = self

        class Courses(Collection):
            def topics(self_inner):
                return Collection(svc.log, svc.responses.get("topics", {}))

            def courseWorkMaterials(self_inner):
                return Collection(svc.log, svc.responses.get("materials", {}))

            def courseWork(self_inner):
                class CW(Collection):
                    def studentSubmissions(self_cw):
                        return Collection(svc.log, svc.responses.get("submissions", {}))
                return CW(svc.log, svc.responses.get("coursework", {}))

            def students(self_inner):
                return Collection(svc.log, svc.responses.get("students", {}))

        return Courses(self.log, self.responses.get("courses", {}))


def http_error(status, body):
    return HttpError(Response({"status": status}), body.encode())


@pytest.fixture
def fake(monkeypatch):
    def install(responses):
        svc = FakeService(responses)
        monkeypatch.setattr(classroom, "_svc", lambda token: svc)
        return svc
    return install


def test_ensure_topic_reuses_existing_chapter_topic(fake):
    svc = fake({"topics": {"list": Req({"topic": [{"topicId": "t1", "name": "Fractional Numbers"}]})}})
    assert classroom.ensure_topic("tok", "c1", "fractional numbers") == "t1"
    assert not any(name == "create" for name, _ in svc.log)


def test_ensure_topic_creates_when_missing(fake):
    svc = fake({"topics": {"list": Req({"topic": []}), "create": Req({"topicId": "t9"})}})
    assert classroom.ensure_topic("tok", "c1", "Time") == "t9"
    assert ("create", {"courseId": "c1", "body": {"name": "Time"}}) in svc.log


def test_material_and_coursework_are_published_under_the_topic(fake):
    svc = fake({"materials": {"create": Req({"id": "m1"})}, "coursework": {"create": Req({"id": "w1"})}})
    assert classroom.post_material("tok", "c1", "t1", "Cards", "text", "https://veda.example/student?class=x") == "m1"
    assert classroom.post_coursework("tok", "c1", "t1", "Quiz", "do it", "https://veda.example/student?class=x") == "w1"
    mat = next(kw["body"] for name, kw in svc.log if name == "create" and "materials" in kw["body"] and "workType" not in kw["body"])
    cw = next(kw["body"] for name, kw in svc.log if name == "create" and kw["body"].get("workType"))
    assert mat["topicId"] == "t1" and mat["state"] == "PUBLISHED" and mat["materials"][0]["link"]["url"].endswith("class=x")
    assert cw["workType"] == "ASSIGNMENT" and cw["maxPoints"] == 100 and cw["topicId"] == "t1"


def test_lists_follow_pagination(monkeypatch):
    svc = FakeService({})
    pages = iter([Req({"students": [{"userId": "1"}], "nextPageToken": "p2"}), Req({"students": [{"userId": "2"}]})])

    class Students(Collection):
        def list(self, **kw):
            svc.log.append(("list", kw))
            return next(pages)

    import types
    svc.courses = types.MethodType(lambda self: types.SimpleNamespace(students=lambda: Students(svc.log, {})), svc)
    monkeypatch.setattr(classroom, "_svc", lambda token: svc)
    assert [s["userId"] for s in classroom.list_students("tok", "c1")] == ["1", "2"]


@pytest.mark.parametrize(
    "error, code",
    [
        (http_error(401, '{"error": {"message": "Invalid Credentials"}}'), "google_expired"),
        (http_error(403, '{"error": {"message": "Google Classroom API has not been used in project 123 before or it is disabled"}}'), "api_disabled"),
        (http_error(403, '{"error": {"message": "Request had insufficient authentication scopes."}}'), "google_permission"),
        (http_error(404, '{"error": {"message": "Requested entity was not found."}}'), "not_found"),
        (socket.gaierror("no internet"), "offline"),
    ],
)
def test_google_errors_become_kind_messages(fake, error, code):
    fake({"courses": {"list": Req(error=error)}})
    with pytest.raises(classroom.ClassroomError) as e:
        classroom.list_courses("tok")
    assert e.value.code == code
    assert e.value.message and "Traceback" not in e.value.message


def test_no_token_means_sign_in():
    with pytest.raises(classroom.ClassroomError) as e:
        classroom._svc("")
    assert e.value.code == "signed_out"
