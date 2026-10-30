"""Who is calling?

DEMO_MODE=true : everyone is the demo teacher of the demo class; no Google.
DEMO_MODE=false: requests must come through the Next.js proxy (frontend/app/api/backend), which
  - proves it with X-Veda-Proxy (derived from NEXTAUTH_SECRET, never sent to browsers), and
  - for a signed-in teacher, adds "Authorization: Bearer <Google access token>" from the
    encrypted NextAuth session cookie (the token never reaches browser JavaScript).
The backend checks the token with Google (cached a few minutes) and maps it to a Teacher.
Student devices (shared family phones) have no Google login; their routes only need the proxy key.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from urllib.parse import unquote

import httpx
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from . import config, models as m, services as svc
from .db import get_db

PROXY_KEY = hashlib.sha256(("veda-proxy:" + os.environ.get("NEXTAUTH_SECRET", "")).encode()).hexdigest()
_token_cache: dict[str, tuple[float, dict]] = {}


class AuthError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass
class Principal:
    teacher: m.Teacher | None
    klass: m.MultigradeClass | None
    google_token: str | None


def proxy_ok(request: Request) -> bool:
    return hmac.compare_digest(request.headers.get("x-veda-proxy", ""), PROXY_KEY)


def verify_google_token(token: str) -> dict:
    """Ask Google who this access token belongs to. Cached for 5 minutes by token hash."""
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _token_cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        r = httpx.get("https://oauth2.googleapis.com/tokeninfo", params={"access_token": token}, timeout=15)
    except httpx.HTTPError as e:
        raise AuthError(503, "offline", "Can't reach Google to check your sign-in (no internet?). Showing saved data where possible.") from e
    if r.status_code != 200:
        raise AuthError(401, "google_expired", "Your Google sign-in has expired. Please sign in again.")
    info = r.json()
    if not info.get("sub"):
        raise AuthError(401, "google_expired", "Your Google sign-in is not valid. Please sign in again.")
    _token_cache[key] = (time.time() + min(300, int(info.get("expires_in", 300))), info)
    return info


def principal(request: Request, db: Session = Depends(get_db)) -> Principal:
    if config.DEMO_MODE:
        return Principal(teacher=None, klass=svc.load_class(db, class_id=svc.DEMO_CLASS_ID), google_token=None)
    if not proxy_ok(request):
        raise AuthError(401, "proxy", "Please open Veda through the app (http://localhost:3000).")
    authz = request.headers.get("authorization", "")
    if not authz.lower().startswith("bearer "):
        raise AuthError(401, "signed_out", "Please sign in with Google to use the teacher pages.")
    token = authz.split(" ", 1)[1].strip()
    info = verify_google_token(token)
    teacher = db.get(m.Teacher, f"t-{info['sub']}")
    if not teacher:
        name = unquote(request.headers.get("x-veda-user-name") or "") or (info.get("email") or "Teacher").split("@")[0]
        teacher = m.Teacher(id=f"t-{info['sub']}", google_sub=info["sub"], email=info.get("email"), name=name[:120])
        db.add(teacher)
        db.commit()
    return Principal(teacher=teacher, klass=svc.load_class(db, teacher_id=teacher.id), google_token=token)


def klass_dep(p: Principal = Depends(principal)) -> m.MultigradeClass:
    if not p.klass:
        raise LookupError("Finish class setup first (Class setup in the menu).")
    return p.klass


def google_token_dep(p: Principal = Depends(principal)) -> str:
    if config.DEMO_MODE:
        raise HTTPException(409, "Demo mode uses sample Classroom data.")
    return p.google_token or ""
