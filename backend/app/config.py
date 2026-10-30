"""Settings from the root .env. Values are never printed or logged."""

import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _sqlalchemy_url(url: str | None) -> str | None:
    """Turn a Supabase connection string into a SQLAlchemy URL.

    Tolerates the two common copy-paste mistakes: the password left inside Supabase's
    [YOUR-PASSWORD] brackets, and special characters (like @) in the password not URL-encoded.
    The last @ always separates the password from the host.
    """
    if not url:
        return None
    url = url.strip()
    if not url.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
        return url  # e.g. sqlite for tests
    from urllib.parse import parse_qsl, unquote, urlsplit

    from sqlalchemy.engine import URL

    rest = url.split("://", 1)[1]
    userinfo, hostpart = rest.rsplit("@", 1)
    user, _, password = userinfo.partition(":")
    if password.startswith("[") and password.endswith("]"):
        password = password[1:-1]
    if password.upper() in ("YOUR-PASSWORD", "PASSWORD"):
        raise RuntimeError("The database password in .env is still Supabase's placeholder text. Paste your real password.")
    hp = urlsplit("//" + hostpart)
    return URL.create(
        "postgresql+psycopg",
        username=unquote(user),
        password=unquote(password),
        host=hp.hostname,
        port=hp.port,
        database=(hp.path or "/postgres").lstrip("/") or "postgres",
        # drop Prisma-only options (pgbouncer=true, connection_limit) that libpq rejects
        query={k: v for k, v in parse_qsl(hp.query) if k not in ("pgbouncer", "connection_limit", "schema", "pool_timeout")},
    ).render_as_string(hide_password=False)


DATABASE_URL = _sqlalchemy_url(os.environ.get("DATABASE_URL"))
# migrations prefer the direct (session) connection; the app uses the transaction pooler
MIGRATION_URL = _sqlalchemy_url(os.environ.get("DIRECT_URL")) or DATABASE_URL

DEMO_MODE = os.environ.get("DEMO_MODE", "true").strip().lower() in ("1", "true", "yes", "on")
DEMO_TODAY = date(2026, 10, 30)  # Friday; the seeded story is anchored here

FRONTEND_ORIGINS = [o.strip() for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")]

SYLLABUS_DIR = ROOT / "docs" / "syllabus"
APP_URL = (os.environ.get("NEXTAUTH_URL") or "http://localhost:3000").strip().rstrip("/")  # where the frontend runs

# Sarvam. The key is only ever read here and sent in a request header; never logged.
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "").strip()
SARVAM_DISABLED = os.environ.get("SARVAM_DISABLED", "false").strip().lower() in ("1", "true", "yes", "on")  # kill switch
SARVAM_ENABLED = bool(SARVAM_API_KEY) and not SARVAM_DISABLED
VOICE_PROVIDER = os.environ.get("VOICE_PROVIDER", "browser").strip().lower()
if VOICE_PROVIDER not in ("browser", "sarvam"):
    VOICE_PROVIDER = "browser"
AI_BUDGET_INR = float(os.environ.get("AI_BUDGET_INR", "100"))


def today() -> date:
    return DEMO_TODAY if DEMO_MODE else date.today()


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())
