"""Create Sarvam cards + quizzes for the demo topics ONCE, so the demo never waits on (or pays for) them again.

    python scripts/pregenerate.py --dry-run   # show what would be generated and how many calls
    python scripts/pregenerate.py             # generate (skips anything Sarvam already wrote)

Demo topics: for each grade, the last 2 finished topics + the current one (English),
plus Kannada and Hindi for Grade 4's equivalent fractions and decimals (Ravi's story).
A deck counts as done only if Sarvam wrote it; placeholders and hand-written demo decks are replaced.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402

import ai_client  # noqa: E402
from app import models as m, services  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.planner import GRADES  # noqa: E402


def demo_targets(db) -> list[tuple[services.TopicView, str]]:
    klass = services.load_class(db, class_id=services.DEMO_CLASS_ID)
    targets: list[tuple[services.TopicView, str]] = []
    for g in GRADES:
        own = services.topics(db, klass, g)
        done = [t for t in own if t.status == "done"]
        cur = [t for t in own if t.status == "in_progress"]
        for t in done[-2:] + cur:
            targets.append((t, "en"))
    for t in services.topics(db, klass, 4):
        if any(w in t.title.lower() for w in ("equivalent", "decimal")):
            targets += [(t, "kn"), (t, "hi")]
    return targets


def written_by_sarvam(db, topic_id: str, lang: str) -> bool:
    purposes = [f"cards+quiz {topic_id} ({lang})", f"translate {topic_id} (en->{lang})"]
    deck = db.scalar(select(m.CardDeck).where(m.CardDeck.topic_id == topic_id, m.CardDeck.language == lang))
    if not deck or deck.placeholder:
        return False
    hit = db.scalar(select(m.AiCallLog.id).where(m.AiCallLog.purpose.in_(purposes), m.AiCallLog.ok.is_(True), m.AiCallLog.model == ai_client.TEXT_MODEL,
                                                 m.AiCallLog.cache_hit.is_(False), m.AiCallLog.placeholder.is_(False)).limit(1))
    return hit is not None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not ai_client.enabled():
        print("Sarvam is off (no SARVAM_API_KEY or SARVAM_DISABLED=true). Nothing to do.")
        return

    db = SessionLocal()
    try:
        todo = []
        for topic, lang in demo_targets(db):
            status = "already written by Sarvam" if written_by_sarvam(db, topic.id, lang) else "TO GENERATE"
            print(f"  G{topic.grade} {lang}  {topic.title[:70]:70}  {status}")
            if status == "TO GENERATE":
                todo.append((topic, lang))
        print(f"\n{len(todo)} deck(s) to generate, about {len(todo)} Sarvam call(s) (+1 per invalid-JSON retry).")
        if args.dry_run or not todo:
            return
        before = ai_client._running_count(db)
        for topic, lang in todo:
            full = db.get(m.Topic, topic.id)  # with source_text
            # English first, so translations come from it
            deck, _ = services.get_or_create_deck(db, full, lang, regenerate=True) if lang == "en" else (None, None)
            if lang != "en":
                en = services._deck_row(db, full.id, "en")
                if not en or not written_by_sarvam(db, full.id, "en"):
                    services.get_or_create_deck(db, full, "en", regenerate=True)
                    db.commit()
                deck, _ = services.get_or_create_deck(db, full, lang, regenerate=True)
            db.commit()
            print(f"  done: G{full.grade} {lang} {deck.topic_title!r} placeholder={deck.placeholder} cards={len(deck.cards)} quiz={len(deck.quiz.questions)}")
        print(f"\nSarvam calls used by this run: {ai_client._running_count(db) - before}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
