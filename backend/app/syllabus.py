"""Turn a KTBS textbook PDF into chapters and topics.

- Chapters + page ranges come from the book's CONTENTS page.
- Topics come from each chapter's "After studying this chapter you can ..." learning outcomes.
- Each topic's source_text is only its own pages, so one AI call later sends one topic.
- Pages without a text layer are OCR'd with Tesseract when it's installed.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader

MAX_SOURCE_CHARS = 8000
_NOISE = re.compile(r"(©|@)\s*KTBS|not\s+to\s+be\s+republished", re.I)
_MARKER = re.compile(r"^\s*(?:[•●▪■]|l(?=\s+[a-zA-Z]))\s*")
_STOP = set(
    "find know understand identify solve write read use using given numbers number digit digits with without their the "
    "and for from into this that them they able also make form problems problem various simple daily life situations "
    "situation related based express learn compare draw construct by of in on to a an".split()
)


@dataclass
class ParsedTopic:
    title: str
    pages: tuple[int, int]  # 1-based PDF pages, inclusive
    source_text: str


@dataclass
class ParsedChapter:
    number: int
    title: str
    pages: tuple[int, int]
    topics: list[ParsedTopic] = field(default_factory=list)
    from_outcomes: bool = True


@dataclass
class ParsedBook:
    grade: int
    path: Path
    page_count: int
    page_offset: int
    chapters: list[ParsedChapter]
    ocr_pages: int = 0
    unreadable_pages: list[int] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------- page text ----------

def _ocr(page) -> str | None:
    try:
        import pytesseract  # noqa: PLC0415

        images = list(page.images)
        if not images:
            return None
        return pytesseract.image_to_string(images[0].image, lang="eng")
    except Exception:  # noqa: BLE001  (Tesseract not installed, or image not decodable)
        return None


def read_pages(path: Path) -> tuple[list[str], int, list[int]]:
    reader = PdfReader(str(path))
    texts, ocr_count, unreadable = [], 0, []
    for i, page in enumerate(reader.pages):
        t = page.extract_text() or ""
        if len(t.strip()) < 25:
            o = _ocr(page)
            if o and len(o.strip()) >= 25:
                t, ocr_count = o, ocr_count + 1
            elif i > 2:  # covers and blank pages are expected to be empty
                unreadable.append(i + 1)
        texts.append(t)
    return texts, ocr_count, unreadable


def _clean(s: str) -> str:
    s = _NOISE.sub(" ", s)
    s = s.replace("\t", " ")
    return re.sub(r"[  ]+", " ", s)


# ---------- printed page numbers ----------

def page_offset(texts: list[str]) -> int:
    """PDF page index minus printed page number (most common over pages that print a number on top)."""
    votes: Counter[int] = Counter()
    for i, t in enumerate(texts):
        first = t.strip().split(maxsplit=1)[0] if t.strip() else ""
        if not first.isdigit():
            continue
        candidates = {int(first)}
        if len(first) % 2 == 0 and first[: len(first) // 2] == first[len(first) // 2 :]:
            candidates.add(int(first[: len(first) // 2]))  # some pages print "4444" for 44
        for n in candidates:
            if 0 < n < 400:
                votes[(i + 1) - n] += 1
    return votes.most_common(1)[0][0] if votes else 0


# ---------- contents ----------

_ROW = re.compile(r"^\s*(\d{1,2})\s*[.)]?\s+(.+?)\s+(\d{1,3})\s*[-–]\s*(\d{1,3})\s*$")
_ROW_NO_NUM = re.compile(r"^\s*([A-Za-z][A-Za-z ,&'-]+?)\s+(\d{1,3})\s*[-–]\s*(\d{1,3})\s*$")


def _nice_title(t: str) -> str:
    t = re.sub(r"\s+", " ", t).strip(" .:-")
    if t.isupper():
        t = t.title()
    return t[0].upper() + t[1:] if t else t


def parse_contents(texts: list[str]) -> list[tuple[int, str, int, int]]:
    for t in texts[:16]:
        if not re.search(r"contents", t, re.I):
            continue
        rows: list[tuple[int, str, int, int]] = []
        pending_num: int | None = None
        pending_text = ""  # a chapter name that wrapped onto the next line
        for raw in _clean(t).splitlines():
            line = raw.strip()
            if re.fullmatch(r"\d{1,2}\.?", line):
                pending_num = int(line.rstrip("."))
                continue
            m = _ROW.match(line)
            if m:
                num, title, a, b = int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4))
            else:
                m = _ROW_NO_NUM.match(line)
                if not m:
                    start = re.match(r"^(\d{1,2})\.?\s+([A-Za-z].*)$", line)
                    if start and not re.search(r"\d+\s*[-–]\s*\d+", line):
                        pending_num, pending_text = int(start.group(1)), start.group(2)
                    elif pending_num is not None and re.fullmatch(r"[A-Za-z ,&'-]+", line) and not re.search(r"page|chapter|unit|contents", line, re.I):
                        pending_text = f"{pending_text} {line}".strip()
                    continue
                num = pending_num if pending_num is not None else (rows[-1][0] + 1 if rows else 1)
                title, a, b = f"{pending_text} {m.group(1)}".strip(), int(m.group(2)), int(m.group(3))
            pending_num, pending_text = None, ""
            if re.match(r"answers?\b", title.strip(), re.I) or b < a:
                continue
            rows.append((num, _nice_title(title), a, b))
        if len(rows) >= 3:
            return rows
    return []


# ---------- learning outcomes ----------

def _fix_split_words(s: str) -> str:
    # extraction sometimes splits a word after its first letter: "m ultiply" -> "multiply"
    return re.sub(r"\b([b-hj-z]) ([a-z]{3,})", r"\1\2", s)


def parse_outcomes(page_text: str) -> list[str]:
    m = re.search(r"after\s+(studying|learning|completing)[^\n]*\n", page_text, re.I)
    if not m:
        return []
    bullets: list[str] = []
    for raw in page_text[m.end():].splitlines():
        if _NOISE.search(raw):
            continue
        line = raw.strip()
        if not line:
            continue
        if _MARKER.match(line):
            bullets.append(_MARKER.sub("", line, count=1))
            continue
        if bullets and not bullets[-1].rstrip().endswith(".") and re.match(r"[a-z0-9(]", line):
            bullets[-1] += " " + line
            continue
        if bullets:
            break
    out = []
    for b in bullets:
        b = _fix_split_words(re.sub(r"\s+", " ", b)).strip(" ,.;:")
        b = re.sub(r"([a-z])- ([a-z])", r"\1\2", b)  # "thou- sands" -> "thousands"
        b = re.split(r"\.\s+[A-Z]", b)[0]  # stop at a following sentence that leaked in
        # real outcomes are short sentences; picture captions that leak in ("Zaheer 62") are not
        if 6 <= len(b) <= 160 and len(b.split()) >= 2 and not re.fullmatch(r"[A-Z]?[a-z]+ \d+", b):
            out.append(b[0].upper() + b[1:])
    # de-duplicate, keep order
    return list(dict.fromkeys(out))


# ---------- split chapter pages between topics ----------

def _keyword(title: str, chapter_pages: list[str]) -> str | None:
    words = [w for w in re.findall(r"[a-z]{4,}", title.lower()) if w not in _STOP]
    best, best_hits = None, 10**9
    for w in words:
        hits = sum(1 for p in chapter_pages if w in p.lower())
        if 0 < hits < best_hits:
            best, best_hits = w, hits
    return best


def split_pages(titles: list[str], first: int, last: int, texts: list[str]) -> list[tuple[int, int]]:
    pages = list(range(first, last + 1))
    page_texts = [texts[p - 1] for p in pages]
    anchors = [first]
    for t in titles[1:]:
        kw = _keyword(t, page_texts)
        start = anchors[-1]
        hit = next((p for p in pages if p > start and kw and kw in texts[p - 1].lower()), None) if kw else None
        anchors.append(hit if hit else start)
    if len(set(anchors)) == 1 and len(titles) > 1:  # nothing found: share pages evenly
        n = len(pages)
        anchors = [pages[min(n - 1, (k * n) // len(titles))] for k in range(len(titles))]
    ranges = []
    for k, a in enumerate(anchors):
        nxt = next((b for b in anchors[k + 1:] if b > a), None)
        ranges.append((a, max(a, nxt - 1) if nxt else last))
    # topics that ended up sharing the same pages split those pages evenly, in order
    k = 0
    while k < len(ranges):
        j = k
        while j + 1 < len(ranges) and ranges[j + 1] == ranges[k]:
            j += 1
        a, b = ranges[k]
        n, span = j - k + 1, b - a + 1
        if n > 1 and span >= n:
            for idx in range(n):
                s = a + (idx * span) // n
                e = a + ((idx + 1) * span) // n - 1
                ranges[k + idx] = (s, e)
        k = j + 1
    return ranges


# ---------- whole book ----------

def parse_book(path: Path, grade: int) -> ParsedBook:
    texts, ocr_count, unreadable = read_pages(path)
    offset = page_offset(texts)
    contents = parse_contents(texts)
    book = ParsedBook(grade, path, len(texts), offset, [], ocr_count, unreadable)
    if not contents:
        book.warnings.append("No contents page found; whole book imported as one chapter.")
        contents = [(1, "Mathematics", 1 - offset, len(texts) - offset)]

    for num, title, a, b in contents:
        first, last = max(1, a + offset), min(len(texts), b + offset)
        outcomes: list[str] = []
        for p in range(first, last + 1):
            outcomes += [o for o in parse_outcomes(texts[p - 1]) if o not in outcomes]
        ch = ParsedChapter(num, title, (first, last), from_outcomes=bool(outcomes))
        if not outcomes:
            outcomes = [title]
            book.warnings.append(f"Chapter {num} '{title}': no learning outcomes found, used the chapter as one topic.")
        for t, (pa, pb) in zip(outcomes, split_pages(outcomes, first, last, texts)):
            src = _clean("\n".join(texts[pa - 1 : pb]))
            src = re.sub(r"\n\s*\n+", "\n", src).strip()[:MAX_SOURCE_CHARS]
            ch.topics.append(ParsedTopic(t, (pa, pb), src))
        book.chapters.append(ch)
    return book
