"""Check the database connections. Prints only OK/FAILED and the error type, never the URL."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app import config  # noqa: E402
from app.db import make_engine  # noqa: E402

print("DEMO_MODE =", config.DEMO_MODE)
for label, url in [("DATABASE_URL (app, pooler)", config.DATABASE_URL), ("DIRECT_URL (migrations)", config.MIGRATION_URL)]:
    try:
        with make_engine(url).connect() as c:
            version = c.execute(text("select version()")).scalar()
            tables = c.execute(text("select count(*) from information_schema.tables where table_schema = 'public'")).scalar()
        print(f"{label}: OK  {version.split(',')[0]}  | public tables: {tables}")
    except Exception as e:  # noqa: BLE001
        msg = str(e).split("\n")[0][:200]
        if url:
            msg = msg.replace(url, "<url>")
        print(f"{label}: FAILED  {type(e).__name__}: {msg}")
