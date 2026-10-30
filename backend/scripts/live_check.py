"""Live check of every Sarvam feature through the running API (http://localhost:8000). Uses ~15 Sarvam calls.

    python scripts/live_check.py
"""

import base64
import sys
import time

import httpx

sys.stdout.reconfigure(encoding="utf-8")
c = httpx.Client(base_url="http://localhost:8000", timeout=300)


def count() -> int:
    return c.get("/api/admin/ai-usage").json()["totalCalls"]


def step(name: str):
    print(f"\n=== {name}")
    return count(), time.perf_counter()


def done(before: int, t: float):
    print(f"    -> {count() - before} Sarvam call(s), {time.perf_counter() - t:.1f}s")


start = count()
print("Sarvam calls before:", start)

# 5. alert wording (1 call for all open alerts, then cached)
b, t = step("Alert wording (first view)")
for a in c.get("/api/alerts").json():
    if a["status"] == "open":
        print(f"  [{a['severity']}] {a['title']}\n     summary: {a.get('aiSummary')}\n     action:  {a['suggestion']}")
done(b, t)
b, t = step("Alert wording (second view: should be cached)")
c.get("/api/alerts")
done(b, t)

# 3. Vidya tutor in three languages + an answer back (mastery)
for lang, msg in (("en", "What are equivalent fractions?"), ("kn", "ಸಮಾನ ಭಿನ್ನರಾಶಿ ಎಂದರೇನು?"), ("hi", "दशमलव क्या होता है?")):
    b, t = step(f"Vidya ({lang})")
    r = c.post("/api/tutor", json={"studentId": "s-g4-01", "language": lang, "history": [], "message": msg})
    j = r.json()
    print(f"  {r.status_code} topic={j.get('topicId')} placeholder={j.get('placeholder')}\n  reply: {j.get('text')}\n  suggestions: {j.get('suggestions')}")
    if lang == "en":
        first = j
    done(b, t)

b, t = step("Vidya follow-up: the child answers Vidya's question")
hist = [{"role": "student", "text": "What are equivalent fractions?"}, {"role": "vidya", "text": first["text"]}]
r = c.post("/api/tutor", json={"studentId": "s-g4-01", "language": "en", "history": hist, "message": "2/4 is the same as 1/2"})
j = r.json()
print(f"  assessment={j.get('assessment')} topic={j.get('topicId')}\n  reply: {j.get('text')}")
done(b, t)
ins = c.get("/api/insights/students/s-g4-01").json()
print("  Ravi tutor minutes this week:", ins["tutorMinutes"][-1]["percent"], "| mastery:", [(m["topicTitle"][:30], m["percent"]) for m in ins["mastery"] if "fraction" in m["topicTitle"].lower()])

# 4. voice: Bulbul TTS (3 languages) then Saaras STT on that audio
texts = {"en": "Well done! Two quarters make one half.", "kn": "ಶಭಾಷ್! ಎರಡು ಕಾಲು ಭಾಗಗಳು ಸೇರಿದರೆ ಅರ್ಧ ಆಗುತ್ತದೆ.", "hi": "शाबाश! दो चौथाई मिलकर आधा होता है।"}
audio: dict[str, bytes] = {}
for lang, text in texts.items():
    b, t = step(f"Text-to-speech Bulbul ({lang})")
    r = c.post("/api/voice/tts", json={"text": text, "language": lang})
    if r.status_code == 200:
        j = r.json()
        audio[lang] = base64.b64decode(j["audio"])
        print(f"  200 {j['mime']} {len(audio[lang])} bytes cached={j['cached']}")
    else:
        print(f"  {r.status_code} {r.text[:300]}")
    done(b, t)
b, t = step("Text-to-speech again (en): should be cached")
r = c.post("/api/voice/tts", json={"text": texts["en"], "language": "en"})
print("  cached:", r.json().get("cached"))
done(b, t)

for lang, data in audio.items():
    b, t = step(f"Speech-to-text Saaras ({lang}) on Bulbul's audio")
    r = c.post("/api/voice/stt", files={"file": (f"{lang}.mp3", data, "audio/mpeg")}, data={"language": lang, "seconds": "3"})
    print(f"  {r.status_code} sent:  {texts[lang]}\n      heard: {r.json().get('transcript') if r.status_code == 200 else r.text[:300]}")
    done(b, t)

# 1. Regenerate the Grade 5 deck that failed during pre-generation
topics = c.get("/api/topics", params={"grade": 5}).json()
vol = next(x for x in topics if "volume" in x["title"].lower() and "analyse" in x["title"].lower())
d = c.get("/api/decks", params={"topicId": vol["id"], "language": "en"}).json()
b, t = step(f"Regenerate deck: {vol['title']} (was placeholder={d.get('placeholder')})")
r = c.post(f"/api/decks/{d['id']}/regenerate")
j = r.json()
print(f"  {r.status_code} placeholder={j.get('placeholder')} cards={len(j.get('cards', []))}")
for q in j.get("quiz", [])[:5]:
    print(f"   Q {q['question']} {q['options']} -> {q['options'][q['answerIndex']]}")
done(b, t)
b, t = step("Open the same deck again: should be cached")
print("  cached:", c.get("/api/decks", params={"topicId": vol["id"], "language": "en"}).json()["cached"])
done(b, t)

print(f"\nTOTAL Sarvam calls used by this check: {count() - start}  (running count now {count()})")
