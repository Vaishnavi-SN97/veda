"""Every AI call in Veda goes through this file (CLAUDE.md rule). Sarvam AI only.

Endpoints (docs.sarvam.ai, checked Oct 2026):
  POST https://api.sarvam.ai/v1/chat/completions   sarvam-105b, sarvam-105b-conversations
  POST https://api.sarvam.ai/speech-to-text         saaras:v4 (multipart, <= 30 s audio)
  POST https://api.sarvam.ai/text-to-speech         bulbul:v3 (JSON, <= 2500 chars, base64 audio back)
  Auth header: api-subscription-key

Budget rules (₹100 total):
  - reasoning is switched off (reasoning_effort: null): its hidden tokens are billed as output;
  - decks are generated once per topic+language and stored; Kannada/Hindi are ONE translation call
    from the stored English deck; only "Regenerate" makes a new one;
  - only ONE topic's source_text is ever sent, trimmed to MAX_SOURCE_CHARS;
  - planner activity lines and alert wording are batched (one call for all missing items) and cached;
  - text-to-speech audio is cached by exact text (TTS is the most expensive call);
  - every call, success or failure, writes an AiCallLog row and logs a running count.
  - SARVAM_DISABLED=true in .env switches everything back to the free placeholders.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import random
import re
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from pathlib import Path

import httpx
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app.models import AiCache, AiCallLog, Topic

log = logging.getLogger("veda.ai")

BASE_URL = "https://api.sarvam.ai"
TEXT_MODEL = "sarvam-105b"
TUTOR_MODEL = "sarvam-105b-conversations"
STT_MODEL = "saaras:v4"
TTS_MODEL = "bulbul:v3"
TTS_SPEAKER = "priya"  # warm female voice for Vidya; bulbul:v3 speakers speak all supported languages
MAX_SOURCE_CHARS = 5000
TIMEOUT = httpx.Timeout(90.0, connect=15.0)

# Pay-as-you-go prices (sarvam.ai/api-pricing): used only to estimate spend on the admin page.
PRICE_LLM_IN = 15.0 / 1_000_000  # ₹ per input token
PRICE_LLM_OUT = 60.0 / 1_000_000  # ₹ per output token
PRICE_TTS_CHAR = 30.0 / 10_000  # ₹ per character
PRICE_STT_SEC = 0.49 / 60  # ₹ per second of audio

LANG_NAME = {"en": "simple English", "kn": "Kannada", "hi": "Hindi"}
LANG_CODE = {"en": "en-IN", "kn": "kn-IN", "hi": "hi-IN"}

_DEMO_DECKS = json.loads((Path(__file__).parent / "app" / "demo_decks.json").read_text(encoding="utf-8"))


class SarvamError(Exception):
    pass


def enabled() -> bool:
    return config.SARVAM_ENABLED


# ---------- logging + running count ----------

_count: int | None = None


def _running_count(db: Session) -> int:
    global _count
    if _count is None:
        _count = db.scalar(select(func.count()).select_from(AiCallLog).where(AiCallLog.placeholder.is_(False), AiCallLog.cache_hit.is_(False), AiCallLog.model != "demo-content")) or 0
    return _count


def _log(db: Session, *, model: str, purpose: str, ok: bool = True, error: str | None = None, input_tokens: int | None = None, output_tokens: int | None = None,
         input_chars: int = 0, output_chars: int = 0, audio_seconds: float | None = None, latency_ms: int | None = None, cost: float = 0.0,
         placeholder: bool = False, cache_hit: bool = False) -> None:
    global _count
    real = not placeholder and not cache_hit and model != "demo-content"
    if real:
        _count = _running_count(db) + 1
    row = AiCallLog(model=model, purpose=purpose[:200], ok=ok, error=(error or "")[:300] or None, input_tokens=input_tokens, output_tokens=output_tokens,
                    input_chars=input_chars, output_chars=output_chars, audio_seconds=audio_seconds, latency_ms=latency_ms, est_cost_inr=round(cost, 5),
                    placeholder=placeholder, cache_hit=cache_hit)
    if real or not ok:
        # Paid calls are written on their own connection and committed at once, so the budget count
        # survives even if the caller's transaction later fails (e.g. Supabase drops an idle connection).
        from app.db import SessionLocal  # noqa: PLC0415

        with SessionLocal() as s2:
            s2.add(row)
            s2.commit()
    else:
        db.add(row)
        db.flush()
    if real:
        log.info("[sarvam #%d] %s %s ok=%s tokens=%s/%s chars=%s/%s ~₹%.4f %sms%s", _count, model, purpose, ok, input_tokens, output_tokens,
                 input_chars, output_chars, cost, latency_ms, f" error={error}" if error else "")
    else:
        log.info("[ai] %s %s (%s)", model, purpose, "cache hit" if cache_hit else "placeholder")


def log_cache_hit(db: Session, purpose: str) -> None:
    _log(db, model=TEXT_MODEL, purpose=purpose, cache_hit=True)


# ---------- HTTP ----------

DEADLINE_S = 120  # whole-call limit; httpx's timeout only limits the gap between chunks
_pool = ThreadPoolExecutor(max_workers=4)


def _post(url: str, **kw) -> httpx.Response:
    """httpx.post with a hard deadline for the whole call (a slow, trickling reply once took 19 minutes)."""
    fut = _pool.submit(httpx.post, url, headers=_headers(), timeout=TIMEOUT, **kw)
    try:
        return fut.result(timeout=DEADLINE_S)
    except FutureTimeout as e:
        raise httpx.TimeoutException(f"no complete answer within {DEADLINE_S}s") from e


def _headers() -> dict:
    return {"api-subscription-key": config.SARVAM_API_KEY}


def _error_text(r: httpx.Response) -> str:
    try:
        j = r.json()
        e = j.get("error") or j.get("detail") or j
        return (e.get("message") if isinstance(e, dict) else str(e))[:280]
    except Exception:  # noqa: BLE001
        return r.text[:280]


def chat(db: Session, *, model: str, messages: list[dict], purpose: str, max_tokens: int = 1200, temperature: float = 0.3, json_mode: bool = False,
         reasoning: str | None = None) -> str:
    """One chat completion. reasoning=None switches thinking off (cheapest). Retries once without optional params if rejected."""
    if not enabled():
        raise SarvamError("Sarvam is not enabled (no SARVAM_API_KEY or SARVAM_DISABLED=true).")
    payload: dict = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature, "reasoning_effort": reasoning}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    in_chars = sum(len(m["content"]) for m in messages)
    for attempt in range(2):
        t = time.perf_counter()
        try:
            r = _post(f"{BASE_URL}/v1/chat/completions", json=payload)
        except httpx.HTTPError as e:
            _log(db, model=model, purpose=purpose, ok=False, error=f"network: {e}", input_chars=in_chars, latency_ms=int((time.perf_counter() - t) * 1000))
            raise SarvamError(f"Couldn't reach Sarvam ({type(e).__name__}).") from e
        ms = int((time.perf_counter() - t) * 1000)
        if r.status_code in (400, 422) and attempt == 0 and re.search(r"reasoning|response_format|json", r.text, re.I):
            _log(db, model=model, purpose=purpose + " (param rejected)", ok=False, error=_error_text(r), input_chars=in_chars, latency_ms=ms)
            payload.pop("reasoning_effort", None)
            payload.pop("response_format", None)
            continue
        if r.status_code >= 400:
            _log(db, model=model, purpose=purpose, ok=False, error=f"{r.status_code}: {_error_text(r)}", input_chars=in_chars, latency_ms=ms)
            raise SarvamError(f"Sarvam returned {r.status_code}: {_error_text(r)}")
        j = r.json()
        usage = j.get("usage") or {}
        pin, pout = usage.get("prompt_tokens"), usage.get("completion_tokens")
        content = (j["choices"][0]["message"].get("content") or "").strip()
        cost = (pin or in_chars / 3) * PRICE_LLM_IN + (pout or len(content) / 3) * PRICE_LLM_OUT
        _log(db, model=model, purpose=purpose, input_tokens=pin, output_tokens=pout, input_chars=in_chars, output_chars=len(content), latency_ms=ms, cost=cost)
        if j["choices"][0].get("finish_reason") == "length":
            log.warning("[sarvam] %s hit max_tokens=%d", purpose, max_tokens)
        return content
    raise SarvamError("Sarvam rejected the request parameters.")


def parse_json(text: str) -> dict:
    """Parse a JSON object from a model reply (tolerates ```json fences and text around it)."""
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.S)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        a, b = t.find("{"), t.rfind("}")
        if a >= 0 and b > a:
            return json.loads(t[a : b + 1])
        raise


def chat_json(db: Session, *, model: str, system: str, user: str, purpose: str, validate, max_tokens: int = 1500, temperature: float = 0.3, reasoning: str | None = None):
    """Ask for strict JSON, validate it, and retry ONCE with the error if it's invalid."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    last_error = ""
    for attempt in range(2):
        text = chat(db, model=model, messages=messages, purpose=purpose if attempt == 0 else purpose + " (retry)", max_tokens=max_tokens,
                    temperature=temperature, json_mode=True, reasoning=reasoning)
        try:
            return validate(parse_json(text))
        except (json.JSONDecodeError, ValidationError, ValueError, KeyError, TypeError) as e:
            last_error = str(e).split("\n")[0][:300] if not isinstance(e, ValidationError) else "; ".join(f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors()[:6])
            log.warning("[sarvam] invalid JSON for %s: %s", purpose, last_error)
            messages = messages + [
                {"role": "assistant", "content": text[:6000]},
                {"role": "user", "content": f"That was not valid. Problem: {last_error}. Reply again with ONLY the corrected JSON object, nothing else."},
            ]
    raise SarvamError(f"Sarvam's answer was not valid JSON twice ({last_error}).")


# ---------- 1. topic cards + quiz ----------

class CardJSON(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=10, max_length=600)
    example: str | None = Field(default=None, max_length=300)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s)).strip().lower()


def _value(option: str) -> float | None:
    """Numeric value of an option like '3/6', '0.5', '12' (None if it isn't just a number)."""
    o = option.strip().replace("₹", "").replace("Rs.", "").strip()
    m = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", o)
    if m and float(m.group(2)) != 0:
        return round(float(m.group(1)) / float(m.group(2)), 9)
    if re.fullmatch(r"-?\d+(?:\.\d+)?", o):
        return round(float(o), 9)
    return None


class QuestionJSON(BaseModel):
    question: str = Field(min_length=5, max_length=300)
    options: list[str]
    working: str | None = Field(default=None, max_length=600)  # the model's visible step-by-step check; not shown to children
    answer: str | None = None  # the correct option's exact text: models pick text more reliably than an index
    answerIndex: int | None = Field(default=None, ge=0, le=3)
    explanation: str = Field(min_length=3, max_length=300)

    @field_validator("options")
    @classmethod
    def four_distinct(cls, v: list[str]) -> list[str]:
        v = [str(o).strip() for o in v]
        if len(v) != 4 or any(not o for o in v) or len({_norm(o) for o in v}) != 4:
            raise ValueError("options must be exactly 4 different non-empty strings")
        return v

    @model_validator(mode="after")
    def resolve_answer(self):
        if self.answer is not None:
            matches = [i for i, o in enumerate(self.options) if _norm(o) == _norm(self.answer)]
            if len(matches) != 1:
                raise ValueError(f"answer {self.answer!r} must be exactly one of the 4 options")
            self.answerIndex = matches[0]
        if self.answerIndex is None:
            raise ValueError("give the correct option's text in \"answer\"")
        # two options with the same value (3/6 and 1/2) means two right answers, unless the answer is "All of the above"
        nums = [x for x in (_value(o) for o in self.options) if x is not None]
        is_all = re.search(r"\b(all|both)\b", self.options[self.answerIndex], re.I)
        if len(nums) != len(set(nums)) and not is_all:
            raise ValueError(f"two options are equal in value ({self.options}), so more than one would be correct")
        return self


class DeckJSON(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    cards: list[CardJSON] = Field(min_length=5, max_length=6)
    quiz: list[QuestionJSON] = Field(min_length=5, max_length=5)

    @model_validator(mode="after")
    def quality(self):
        titles = [_norm(re.sub(r"\s*\d+$", "", c.title)) for c in self.cards]
        if len(set(titles)) != len(titles):
            raise ValueError("every card must teach a different idea with a different title")
        if len({_norm(q.question) for q in self.quiz}) != 5:
            raise ValueError("the 5 questions must all be different")
        return self


DECK_SYSTEM = """You write revision material for Grade {grade} children in a village school in Karnataka, India.
Use ONLY facts, numbers and examples found in the SOURCE textbook pages. Do not add outside knowledge.
Write in simple English: short sentences, everyday words, under 30 words per card body.
Return ONLY a JSON object with exactly this shape:
{{"title": "short topic name",
  "cards": [5 or 6 items of {{"title": "...", "body": "...", "example": "a worked example or null"}}],
  "quiz": [exactly 5 items of {{"question": "...", "options": ["...","...","...","..."], "working": "solve it step by step here",
            "answer": "the correct option, copied exactly", "explanation": "one short sentence why"}}]}}
Cards: each card teaches a DIFFERENT idea, in this order: what it means; how to do it step by step; a worked example;
a common mistake to avoid; a real-life example from village life (rotis, mangoes, bus tickets, a market); a quick tip (optional 6th).
Quiz: 5 different multiple-choice questions, exactly 4 options each, and EXACTLY ONE option may be correct:
no two options may have the same value (for example never put both 3/6 and 1/2). Ask clear questions with one possible answer.
For every question, first solve it in "working", then copy the matching option into "answer".
Put the correct option in different positions across questions. No markdown, no text outside the JSON."""


def shuffle_options(question: str, options: list[str], answer_index: int) -> tuple[list[str], int]:
    """Models tend to put the right answer first; shuffle in code, the same way every time for the same question."""
    rnd = random.Random(int(hashlib.sha1(question.encode()).hexdigest()[:8], 16))
    order = list(range(len(options)))
    rnd.shuffle(order)
    return [options[i] for i in order], order.index(answer_index)


def _deck_from_json(d: DeckJSON, shuffle: bool = True) -> tuple[str, list[dict], list[dict]]:
    cards = [{"title": c.title, "body": c.body, **({"example": c.example} if c.example and c.example.lower() != "null" else {})} for c in d.cards]
    quiz = []
    for q in d.quiz:
        options, idx = shuffle_options(q.question, q.options, q.answerIndex) if shuffle else (q.options, q.answerIndex)
        quiz.append({"question": q.question, "options": options, "answerIndex": idx, "explanation": q.explanation})
    return d.title, cards, quiz


def generate_deck_english(db: Session, topic: Topic) -> tuple[str, list[dict], list[dict]]:
    source = (topic.source_text or "")[:MAX_SOURCE_CHARS]
    user = f"TOPIC: {topic.title}\nCHAPTER: {topic.chapter}\nSOURCE (textbook pages {topic.source_pages}):\n{source}"
    # Reasoning stays off: with it on, hidden thinking used the whole token budget and the answer came back empty.
    # Answer correctness comes from asking for the answer TEXT and matching it to an option (see QuestionJSON).
    d = chat_json(db, model=TEXT_MODEL, system=DECK_SYSTEM.format(grade=topic.grade), user=user, purpose=f"cards+quiz {topic.id} (en)",
                  validate=DeckJSON.model_validate, max_tokens=2000)
    return _deck_from_json(d)


TRANSLATE_SYSTEM = """Translate the values of this JSON from English into {language} for Grade {grade} children.
Use simple everyday {language} words a village child uses. Keep the same keys and structure.
Keep numbers, digits, fractions (like 1/2, 0.3), symbols and "answerIndex" values exactly as they are.
Every "options" list must still have 4 different items in the same order. Return ONLY the JSON."""


def translate_deck(db: Session, topic: Topic, language: str, title: str, cards: list[dict], quiz: list[dict]) -> tuple[str, list[dict], list[dict]]:
    src = {"title": title, "cards": [{k: c.get(k) for k in ("title", "body", "example")} for c in cards],
           "quiz": [{k: q.get(k) for k in ("question", "options", "answerIndex", "explanation")} for q in quiz]}

    def validate(j: dict) -> DeckJSON:
        for q_new, q_old in zip(j.get("quiz", []), src["quiz"]):  # options keep their order, so the right answer must not move
            q_new.pop("answer", None)
            q_new["answerIndex"] = q_old["answerIndex"]
        return DeckJSON.model_validate(j)

    d = chat_json(db, model=TEXT_MODEL, system=TRANSLATE_SYSTEM.format(language=LANG_NAME[language], grade=topic.grade),
                  user=json.dumps(src, ensure_ascii=False), purpose=f"translate {topic.id} (en->{language})", validate=validate, max_tokens=3500, temperature=0.2)
    return _deck_from_json(d, shuffle=False)  # keep the English order so the same answer letter is right in every language


def demo_or_placeholder_deck(db: Session, topic: Topic, language: str) -> tuple[str, list[dict], list[dict], bool]:
    """Used when Sarvam is off or failed. Returns (title, cards, quiz, is_placeholder)."""
    key = None
    if topic.grade == 4 and "equivalent" in topic.title.lower():
        key = "equivalent"
    elif topic.grade == 4 and "decimal" in topic.title.lower():
        key = "decimals"
    if key and config.DEMO_MODE:
        d = _DEMO_DECKS[key][language]
        _log(db, model="demo-content", purpose=f"cards+quiz {topic.id} ({language})", output_chars=len(json.dumps(d)))
        quiz = [{**q, "explanation": q.get("explanation") or ""} for q in d["quiz"]]
        return d["title"], d["cards"], quiz, False
    _log(db, model=TEXT_MODEL, purpose=f"cards+quiz {topic.id} ({language})", placeholder=True)
    return (*_placeholder_deck(topic, language), True)


_LANG_NOTE = {"en": "", "kn": "(ಕನ್ನಡ ಅನುವಾದ ಇನ್ನೂ ಸಿದ್ಧವಿಲ್ಲ) ", "hi": "(हिंदी अनुवाद अभी तैयार नहीं) "}


def _squash(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _sentences(text: str, n: int) -> list[str]:
    text = re.sub(r"\s+", " ", text or "")
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if 25 <= len(p.strip()) <= 220 and re.search(r"[a-z]{3}", p) and not re.search(r"exercise|^\d", p, re.I)][:n]


def _placeholder_deck(topic: Topic, language: str) -> tuple[str, list[dict], list[dict]]:
    note = _LANG_NOTE[language]
    facts = _sentences(topic.source_text or "", 6)
    cards = [
        {"title": topic.title, "body": f"{note}From your textbook chapter \"{topic.chapter}\": {facts[0] if facts else 'read pages ' + (topic.source_pages or '') + ' again.'}"},
        {"title": "What the book says", "body": f"{note}{' '.join(facts[1:3]) if len(facts) > 1 else 'Read the worked example in your textbook and say each step aloud.'}"},
        {"title": "Try it yourself", "body": f"{note}Make one question like the example in the book. Solve it, then check it with a friend."},
        {"title": "Remember", "body": f"{note}Go slowly. If you get stuck, ask Vidya or your teacher. [Placeholder: press Regenerate when Sarvam is on.]"},
    ]
    g, n = topic.grade, topic.grade * 10 + topic.order % 10
    quiz = [
        {"question": f"What is {n} + {g}?", "options": [f"{n + g}", f"{n}", f"{n + g + 1}", f"{n - g}"], "answerIndex": 0, "explanation": "Add the ones, then the tens."},
        {"question": "Which number is the biggest?", "options": [f"{n * 3}", f"{n * 3 + 9}", f"{n * 2}", f"{n}"], "answerIndex": 1, "explanation": "Compare the tens first."},
        {"question": "Which is correct?", "options": [f"{g} × 2 = {g + 2}", f"{g} × 3 = {g * 3 + 1}", f"{g} × 4 = {g * 4}", f"{g} × 5 = {g * 4}"], "answerIndex": 2, "explanation": "Multiplication is repeated addition."},
        {"question": f"How many tens are in {n * 10}?", "options": [f"{n + 1}", f"{n - 1}", f"{n * 10}", f"{n}"], "answerIndex": 3, "explanation": "Each ten is 10 ones."},
        {"question": f"What comes next: {g}, {g * 2}, {g * 3}, ?", "options": [f"{g * 5}", f"{g * 4}", f"{g * 3 + 1}", f"{g * 6}"], "answerIndex": 1, "explanation": f"Add {g} each time."},
    ]
    return topic.title, cards, quiz


# ---------- 2. planner activity lines ----------

class ActivityJSON(BaseModel):
    teach: str = Field(min_length=5, max_length=160)
    self_work: str = Field(min_length=5, max_length=160)
    peer_game: str = Field(min_length=5, max_length=160)


class MergeJSON(BaseModel):
    together: str = Field(min_length=5, max_length=200)


ACTIVITY_SYSTEM = """You help one teacher who teaches Grades 3, 4 and 5 together in one room in a village school with almost no materials.
For each TOPIC write three activity lines, each under 15 words, practical and low-cost (stones, sticks, seeds, paper, chalk, bottle caps):
 "teach": what the teacher does with this grade, "self_work": what the grade does alone from the textbook, "peer_game": a short pair/group game.
For each MERGED session write "together": one shared activity under 20 words that works for all the listed grades at their own level.
Return ONLY JSON: {"topics": {"<id>": {"teach": "...", "self_work": "...", "peer_game": "..."}}, "merges": {"<key>": {"together": "..."}}}"""


def activity_lines(db: Session, topics: list[Topic], merges: list[dict]) -> tuple[dict[str, dict], dict[str, dict]]:
    """Cached by topic id (and by merge key). One Sarvam call for everything not cached yet."""
    keys = {f"act:{t.id}": t for t in topics}
    mkeys = {f"act:merge:{m['key']}": m for m in merges}
    cached = {c.key: c.value for c in db.scalars(select(AiCache).where(AiCache.key.in_(list(keys) + list(mkeys))))}
    missing_t = [t for k, t in keys.items() if k not in cached]
    missing_m = [m for k, m in mkeys.items() if k not in cached]
    if (missing_t or missing_m) and enabled():
        lines = [f'TOPIC id="{t.id}" Grade {t.grade}, chapter "{t.chapter}": {t.title}. Book: {_squash(t.source_text)[:300]}' for t in missing_t]
        lines += [f'MERGED key="{m["key"]}" Grades {m["grades"]}, chapter "{m["chapter"]}": ' + "; ".join(f"G{g}: {a}" for g, a in m["activity"].items()) for m in missing_m]

        def validate(j: dict) -> dict:
            out_t = {tid: ActivityJSON.model_validate(v).model_dump() for tid, v in (j.get("topics") or {}).items() if tid in {t.id for t in missing_t}}
            out_m = {k: MergeJSON.model_validate(v).model_dump() for k, v in (j.get("merges") or {}).items() if k in {m["key"] for m in missing_m}}
            if len(out_t) < len(missing_t) or len(out_m) < len(missing_m):
                raise ValueError("include every TOPIC id and MERGED key given")
            return {"topics": out_t, "merges": out_m}

        try:
            res = chat_json(db, model=TEXT_MODEL, system=ACTIVITY_SYSTEM, user="\n".join(lines), purpose=f"planner activities ({len(missing_t)} topics, {len(missing_m)} merges)",
                            validate=validate, max_tokens=900, temperature=0.5)
            for tid, v in res["topics"].items():
                db.merge(AiCache(key=f"act:{tid}", kind="activities", value=v))
                cached[f"act:{tid}"] = v
            for k, v in res["merges"].items():
                db.merge(AiCache(key=f"act:merge:{k}", kind="activities", value=v))
                cached[f"act:merge:{k}"] = v
            db.flush()
        except SarvamError as e:
            log.warning("[sarvam] activities kept as templates: %s", e)
    return ({t.id: cached[k] for k, t in keys.items() if k in cached}, {m["key"]: cached[k] for k, m in mkeys.items() if k in cached})


# ---------- 3. Vidya tutor ----------

class TutorJSON(BaseModel):
    reply: str = Field(min_length=2, max_length=700)
    question: str = ""  # the question Vidya asks back; appended to the reply so every turn ends with one
    topic_id: str | None = None
    assessment: str = "none"
    suggestions: list[str] = Field(default_factory=list)

    @field_validator("assessment")
    @classmethod
    def norm(cls, v: str) -> str:
        v = (v or "none").lower()
        return v if v in ("correct", "incorrect", "none") else "none"


TUTOR_SYSTEM = """You are Vidya, a kind and patient study friend for a Grade {grade} child in a village school in Karnataka.
Always reply in {language}. Talk like a friendly older sister: simple words, everyday examples (rotis, mangoes, marbles, bus tickets).
Use ONLY this class's syllabus below. If the child asks about something outside it, say kindly that you help with this class's lessons and bring them back to a topic.
Keep "reply" SHORT: at most 3 short sentences (under 45 words) that explain. Then put ONE simple question for the child in "question"
(for example "What is 1/3 doubled?"). Do not use markdown, lists or emojis.

SYLLABUS (id: topic [status]):
{syllabus}

LESSON TEXT for "{focus_title}":
{lesson}

Reply with ONLY JSON: {{"reply": "...", "question": "one question for the child, in {language}",
 "topic_id": "<id from the syllabus this is about, or null>",
 "assessment": "correct" | "incorrect" | "none"  (did the child's LATEST message correctly answer your previous question?),
 "suggestions": ["two very short ANSWERS or replies the CHILD might say next, in {language} (not questions for the child)"]}}"""


def tutor_turn(db: Session, *, grade: int, language: str, syllabus: list[Topic], focus: Topic | None, history: list[dict], message: str) -> TutorJSON:
    lines = "\n".join(f"{t.id}: {t.title} [{'learning now' if t.status == 'in_progress' else 'done'}]" for t in syllabus)
    lesson = _squash(focus.source_text)[:1800] if focus else ""
    system = TUTOR_SYSTEM.format(grade=grade, language=LANG_NAME[language].replace("simple ", ""), syllabus=lines, focus_title=focus.title if focus else "", lesson=lesson)
    msgs = [{"role": "system", "content": system}]
    for h in history[-6:]:
        msgs.append({"role": "user" if h["role"] == "student" else "assistant", "content": h["text"][:500]})
    msgs.append({"role": "user", "content": message[:500]})
    text = chat(db, model=TUTOR_MODEL, messages=msgs, purpose=f"tutor G{grade} ({language})", max_tokens=400, temperature=0.4, json_mode=True)
    try:
        out = TutorJSON.model_validate(parse_json(text))
    except (json.JSONDecodeError, ValidationError, ValueError):
        out = TutorJSON(reply=re.sub(r"[{}\"]", "", text)[:600] or "…")  # model answered in plain text: still usable
    valid_ids = {t.id for t in syllabus}
    if out.topic_id not in valid_ids:
        out.topic_id = focus.id if focus else None
    q = out.question.strip()
    if q and q not in out.reply:
        out.reply = f"{out.reply.rstrip()} {q}"
    out.suggestions = [s[:60] for s in out.suggestions[:2]]
    return out


def placeholder_tutor(topic: Topic | None, language: str, message: str) -> tuple[str, list[str]]:
    facts = _sentences(topic.source_text or "", 1) if topic else []
    quote = f' Your textbook says: "{facts[0]}"' if facts else ""
    text = {
        "en": f"[Vidya placeholder: Sarvam is off] You asked: \"{message}\".{quote} Try one example from the book and tell me your answer.",
        "kn": f"[ವಿದ್ಯಾ (ತಾತ್ಕಾಲಿಕ): Sarvam ಆಫ್ ಆಗಿದೆ] ನೀನು ಕೇಳಿದ್ದು: \"{message}\".{quote}",
        "hi": f"[विद्या (अस्थायी): Sarvam बंद है] तुमने पूछा: \"{message}\".{quote}",
    }[language]
    return text, {"en": ["Explain again", "Give me a question"], "kn": ["ಮತ್ತೆ ವಿವರಿಸು"], "hi": ["फिर से समझाओ"]}[language]


# ---------- 4. voice ----------

def transcribe(db: Session, audio: bytes, filename: str, content_type: str, language: str | None, seconds: float | None) -> dict:
    """Saaras speech-to-text. language None/'auto' -> auto-detect. Returns {transcript, languageCode}."""
    if not enabled():
        raise SarvamError("Sarvam is not enabled.")
    lang = LANG_CODE.get(language or "", "unknown")
    data = {"model": STT_MODEL, "language_code": lang}
    t = time.perf_counter()
    try:
        r = _post(f"{BASE_URL}/speech-to-text", data=data, files={"file": (filename, audio, content_type)})
    except httpx.HTTPError as e:
        _log(db, model=STT_MODEL, purpose=f"speech-to-text ({lang})", ok=False, error=f"network: {e}")
        raise SarvamError("Couldn't reach Sarvam.") from e
    ms = int((time.perf_counter() - t) * 1000)
    secs = seconds or max(1.0, len(audio) / 16000)  # rough if the browser didn't say
    if r.status_code >= 400:
        _log(db, model=STT_MODEL, purpose=f"speech-to-text ({lang})", ok=False, error=f"{r.status_code}: {_error_text(r)}", latency_ms=ms, audio_seconds=secs)
        raise SarvamError(f"Speech-to-text failed ({r.status_code}): {_error_text(r)}")
    j = r.json()
    _log(db, model=STT_MODEL, purpose=f"speech-to-text ({lang})", output_chars=len(j.get("transcript") or ""), latency_ms=ms, audio_seconds=secs, cost=secs * PRICE_STT_SEC)
    return {"transcript": j.get("transcript") or "", "languageCode": j.get("language_code")}


def synthesize(db: Session, text: str, language: str) -> dict:
    """Bulbul text-to-speech, cached by exact text. Returns {audio (base64 mp3), mime, cached}."""
    text = re.sub(r"\[[^\]]*\]", "", text).strip()[:2000]  # never speak placeholder notes
    key = "tts:" + hashlib.sha256(f"{TTS_MODEL}|{TTS_SPEAKER}|{language}|{text}".encode()).hexdigest()[:40]
    hit = db.get(AiCache, key)
    if hit:
        _log(db, model=TTS_MODEL, purpose=f"text-to-speech ({language})", cache_hit=True)
        return {**hit.value, "cached": True}
    if not enabled():
        raise SarvamError("Sarvam is not enabled.")
    body = {"text": text, "language_code": LANG_CODE[language], "model": TTS_MODEL, "speaker": TTS_SPEAKER, "pace": 0.95,
            "speech_sample_rate": 22050, "output_audio_codec": "mp3"}
    t = time.perf_counter()
    try:
        r = _post(f"{BASE_URL}/text-to-speech", json=body)
    except httpx.HTTPError as e:
        _log(db, model=TTS_MODEL, purpose=f"text-to-speech ({language})", ok=False, error=f"network: {e}", input_chars=len(text))
        raise SarvamError("Couldn't reach Sarvam.") from e
    ms = int((time.perf_counter() - t) * 1000)
    if r.status_code >= 400:
        _log(db, model=TTS_MODEL, purpose=f"text-to-speech ({language})", ok=False, error=f"{r.status_code}: {_error_text(r)}", input_chars=len(text), latency_ms=ms)
        raise SarvamError(f"Text-to-speech failed ({r.status_code}): {_error_text(r)}")
    audio = "".join(r.json().get("audios") or [])
    _log(db, model=TTS_MODEL, purpose=f"text-to-speech ({language})", input_chars=len(text), output_chars=len(audio), latency_ms=ms, cost=len(text) * PRICE_TTS_CHAR)
    value = {"audio": audio, "mime": "audio/mpeg"}
    db.merge(AiCache(key=key, kind="tts", value=value))
    db.flush()
    return {**value, "cached": False}


def audio_bytes(b64: str) -> bytes:
    return base64.b64decode(b64)


# ---------- 5. alert wording ----------

ALERT_PROMPT_VERSION = "2"  # bump when ALERT_SYSTEM changes so cached wording is rewritten once


class AlertWordingJSON(BaseModel):
    summary: str = Field(min_length=10, max_length=260)
    action: str = Field(min_length=10, max_length=320)


ALERT_SYSTEM = """You help a busy village school teacher who teaches Grades 3-5 in one room.
For each ALERT, turn the computed reasons into:
 "summary": ONE warm, plain-English sentence (under 25 words) saying what is happening and why it matters,
 "action": ONE concrete next step for this week (under 30 words) using the suggested action; low-cost, doable in class or with the family.
Do not invent facts or numbers that are not in the reasons. Do not blame the child or family.
Refer to the child by name only: never use he, she, him, her, his (names like Kiran are used for boys and girls).
Return ONLY JSON: {"alerts": {"<id>": {"summary": "...", "action": "..."}}}"""


def alert_wording(db: Session, items: list[dict]) -> dict[str, dict]:
    """items: [{id, cache_key, title, reasons, suggestion}]. Cached by cache_key. One call for all missing."""
    keys = {f"alert:{i['id']}:{i['cache_key']}": i for i in items}
    cached = {c.key: c.value for c in db.scalars(select(AiCache).where(AiCache.key.in_(list(keys))))}
    missing = [i for k, i in keys.items() if k not in cached]
    if missing and enabled():
        user = "\n\n".join(f'ALERT id="{i["id"]}": {i["title"]}\nReasons: ' + " ".join(i["reasons"]) + f"\nSuggested action: {i['suggestion']}" for i in missing)

        def validate(j: dict) -> dict:
            out = {k: AlertWordingJSON.model_validate(v).model_dump() for k, v in (j.get("alerts") or {}).items() if k in {i["id"] for i in missing}}
            if len(out) < len(missing):
                raise ValueError("include every ALERT id given")
            return out

        try:
            res = chat_json(db, model=TEXT_MODEL, system=ALERT_SYSTEM, user=user, purpose=f"alert wording ({len(missing)} alerts)", validate=validate, max_tokens=700, temperature=0.3)
            for i in missing:
                k = f"alert:{i['id']}:{i['cache_key']}"
                db.merge(AiCache(key=k, kind="alert", value=res[i["id"]]))
                cached[k] = res[i["id"]]
            db.flush()
        except SarvamError as e:
            log.warning("[sarvam] alert wording kept as computed text: %s", e)
    return {i["id"]: cached[k] for k, i in keys.items() if k in cached}
