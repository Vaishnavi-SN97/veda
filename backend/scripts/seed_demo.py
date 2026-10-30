"""Load the DEMO_MODE data (wipes demo tables first; keeps the imported topics).

    python scripts/seed_demo.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

from app.db import SessionLocal  # noqa: E402
from app.demo_seed import seed  # noqa: E402

if __name__ == "__main__":
    db = SessionLocal()
    try:
        summary = seed(db)
    finally:
        db.close()
    print(f"Seeded {summary['students']} students, {summary['attendance_rows']} attendance rows.")
    for g, t in summary["current"].items():
        print(f"  Grade {g} is now on: {t}")
    print("Alerts:")
    for a in summary["alerts"]:
        print("  -", a)
