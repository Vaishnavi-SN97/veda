"""Google Classroom (real mode only), using the signed-in teacher's access token.

Scopes the frontend asks for (see frontend/lib/auth.ts and CLAUDE.md):
  classroom.courses, classroom.rosters.readonly, classroom.profile.emails,
  classroom.coursework.students, classroom.courseworkmaterials, classroom.topics
Every Google error becomes a ClassroomError with a kind, plain-language message.
"""

from __future__ import annotations

import socket
import warnings

# google.api_core warns about Python 3.11's end of life (2027); it is not an error for us
warnings.filterwarnings("ignore", category=FutureWarning, module=r"google\..*")

from google.auth.exceptions import TransportError  # noqa: E402
from google.oauth2.credentials import Credentials  # noqa: E402
from googleapiclient.discovery import build  # noqa: E402
from googleapiclient.errors import HttpError  # noqa: E402


class ClassroomError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _svc(token: str):
    if not token:
        raise ClassroomError(401, "signed_out", "Please sign in with Google first.")
    return build("classroom", "v1", credentials=Credentials(token=token), cache_discovery=False, static_discovery=True)


def _run(request):
    try:
        return request.execute(num_retries=1)
    except HttpError as e:
        status = e.resp.status
        text = str(e).lower()
        if status == 401:
            raise ClassroomError(401, "google_expired", "Your Google sign-in has expired. Please sign in again.") from e
        if status == 403 and ("has not been used" in text or "is disabled" in text or "service_disabled" in text):
            raise ClassroomError(403, "api_disabled", "Turn on the Google Classroom API in your Google Cloud project, then try again.") from e
        if status == 403 and ("insufficient" in text or "scope" in text):
            raise ClassroomError(403, "google_permission", "Veda needs permission to use Google Classroom. Sign out, sign in again and tick every Classroom box.") from e
        if status == 403:
            raise ClassroomError(403, "google_permission", f"Google Classroom refused this ({e.reason or 'permission denied'}). Are you a teacher of this course?") from e
        if status == 404:
            raise ClassroomError(404, "not_found", "That course or post was not found in Google Classroom.") from e
        raise ClassroomError(502, "google_error", f"Google Classroom had a problem ({status}). Please try again.") from e
    except (TransportError, socket.gaierror, TimeoutError, ConnectionError, OSError) as e:
        raise ClassroomError(503, "offline", "Can't reach Google Classroom (no internet?). Showing saved data.") from e


def _pages(method, key: str, **kw) -> list[dict]:
    out, token = [], None
    while True:
        res = _run(method(pageToken=token, **kw))
        out += res.get(key, [])
        token = res.get("nextPageToken")
        if not token:
            return out


# ---------- courses + rosters ----------

def list_courses(token: str) -> list[dict]:
    c = _svc(token).courses()
    return _pages(c.list, "courses", teacherId="me", courseStates=["ACTIVE", "PROVISIONED"], pageSize=50)


def create_course(token: str, name: str, section: str) -> dict:
    c = _svc(token).courses()
    try:
        return _run(c.create(body={"name": name, "section": section, "ownerId": "me", "courseState": "ACTIVE"}))
    except ClassroomError as e:
        if e.status != 403:
            raise
        return _run(c.create(body={"name": name, "section": section, "ownerId": "me"}))  # some accounts must accept it in Classroom first


def list_students(token: str, course_id: str) -> list[dict]:
    st = _svc(token).courses().students()
    return _pages(st.list, "students", courseId=course_id, pageSize=100)


# ---------- posting ----------

def ensure_topic(token: str, course_id: str, name: str) -> str:
    """The Classroom topic named after the chapter (created once)."""
    t = _svc(token).courses().topics()
    for topic in _pages(t.list, "topic", courseId=course_id, pageSize=100):
        if topic.get("name", "").strip().lower() == name.strip().lower():
            return topic["topicId"]
    return _run(t.create(courseId=course_id, body={"name": name[:100]}))["topicId"]


def post_material(token: str, course_id: str, topic_id: str, title: str, description: str, link: str) -> str:
    body = {"title": title[:300], "description": description[:30000], "topicId": topic_id, "state": "PUBLISHED", "materials": [{"link": {"url": link}}]}
    return _run(_svc(token).courses().courseWorkMaterials().create(courseId=course_id, body=body))["id"]


def post_coursework(token: str, course_id: str, topic_id: str, title: str, description: str, link: str, max_points: int = 100) -> str:
    body = {"title": title[:300], "description": description[:30000], "topicId": topic_id, "workType": "ASSIGNMENT", "state": "PUBLISHED",
            "maxPoints": max_points, "materials": [{"link": {"url": link}}]}
    return _run(_svc(token).courses().courseWork().create(courseId=course_id, body=body))["id"]


# ---------- grades ----------

def list_submissions(token: str, course_id: str, coursework_id: str) -> list[dict]:
    s = _svc(token).courses().courseWork().studentSubmissions()
    return _pages(s.list, "studentSubmissions", courseId=course_id, courseWorkId=coursework_id, pageSize=100)


def set_grade(token: str, course_id: str, coursework_id: str, submission_id: str, grade: float) -> None:
    s = _svc(token).courses().courseWork().studentSubmissions()
    _run(s.patch(courseId=course_id, courseWorkId=coursework_id, id=submission_id, updateMask="draftGrade,assignedGrade",
                 body={"draftGrade": grade, "assignedGrade": grade}))
