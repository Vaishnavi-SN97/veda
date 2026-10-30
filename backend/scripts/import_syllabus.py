"""Import docs/syllabus/grade{3,4,5}.pdf into the topic table and print what was found.

    python scripts/import_syllabus.py            # parse and save
    python scripts/import_syllabus.py --dry-run  # parse and print only

Re-running is safe: topics keep their ids (g{grade}-c{chapter}-t{n}) and their progress status.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402

from app import config  # noqa: E402
from app.syllabus import ParsedBook, parse_book  # noqa: E402


def topic_rows(book: ParsedBook) -> list[dict]:
    rows, order = [], 0
    for ch in book.chapters:
        for k, t in enumerate(ch.topics, start=1):
            order += 1
            rows.append(
                {
                    "id": f"g{book.grade}-c{ch.number:02d}-t{k:02d}",
                    "grade": book.grade,
                    "chapter": ch.title,
                    "chapter_order": ch.number,
                    "order": order,
                    "title": t.title,
                    "source_text": t.source_text,
                    "source_pages": f"{t.pages[0]}-{t.pages[1]}" if t.pages[0] != t.pages[1] else str(t.pages[0]),
                }
            )
    return rows


def save(rows: list[dict], grade: int) -> tuple[int, int, list[str]]:
    from app.db import SessionLocal  # noqa: PLC0415
    from app.models import CardDeck, Mark, Mastery, Quiz, Topic  # noqa: PLC0415

    db = SessionLocal()
    added = updated = 0
    kept: list[str] = []
    try:
        ids = {r["id"] for r in rows}
        for r in rows:
            t = db.get(Topic, r["id"])
            if t:
                for k, v in r.items():
                    setattr(t, k, v)
                updated += 1
            else:
                db.add(Topic(**r, status="not_started"))
                added += 1
        stale = db.scalars(select(Topic).where(Topic.grade == grade, Topic.id.not_in(ids))).all()
        for t in stale:
            used = any(db.scalar(select(m.id).where(m.topic_id == t.id).limit(1)) for m in (Mark, CardDeck, Mastery, Quiz))
            if used:
                kept.append(t.id)
            else:
                db.delete(t)
        db.commit()
    finally:
        db.close()
    return added, updated, kept


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for grade in (3, 4, 5):
        path = config.SYLLABUS_DIR / f"grade{grade}.pdf"
        print("=" * 72)
        if not path.exists():
            print(f"Grade {grade}: {path.name} not found, skipped")
            continue
        book = parse_book(path, grade)
        rows = topic_rows(book)
        print(f"Grade {grade}: {path.name}  {book.page_count} pages  printed-page offset {book.page_offset}  "
              f"OCR pages {book.ocr_pages}  unreadable pages {len(book.unreadable_pages)}")
        if book.unreadable_pages:
            print(f"  ! pages with no text and no OCR (install Tesseract to read them): {book.unreadable_pages[:20]}")
        for w in book.warnings:
            print("  !", w)
        for ch in book.chapters:
            print(f"\n  Chapter {ch.number}: {ch.title}   (PDF pages {ch.pages[0]}-{ch.pages[1]})")
            for t in ch.topics:
                print(f"     - {t.title}   [p{t.pages[0]}-{t.pages[1]}, {len(t.source_text)} chars]")
        print(f"\n  => {len(book.chapters)} chapters, {len(rows)} topics")
        if not args.dry_run:
            added, updated, kept = save(rows, grade)
            print(f"  saved: {added} new, {updated} updated" + (f", {len(kept)} old topics kept (in use)" if kept else ""))


if __name__ == "__main__":
    main()
