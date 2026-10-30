"""Check Sarvam text-to-speech (bulbul:v4-flash, streaming) and speech-to-text (saaras:v4) with the same
settings as Sarvam's own JS examples. 2-3 small calls, each logged to ai_call_log. Prints no secrets.

    python scripts/check_sarvam_voice.py [path/to/16khz.wav]
"""

import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

import httpx  # noqa: E402

import ai_client  # noqa: E402
from app import config  # noqa: E402
from app.db import SessionLocal  # noqa: E402

if not config.SARVAM_API_KEY:
    raise SystemExit("SARVAM_API_KEY is not set in backend/.env")
H = {"api-subscription-key": config.SARVAM_API_KEY}
OUT = Path(tempfile.gettempdir()) / "veda-voice-check"  # test audio never lands in the repo
OUT.mkdir(exist_ok=True)
TEXT = "नमस्ते! Sarvam AI में आपका स्वागत है।"  # short excerpt of the sample text (TTS is billed per character)


def log(model, purpose, ok, ms, err=None, chars=0, secs=None, cost=0.0):
    with SessionLocal() as db:
        ai_client._log(db, model=model, purpose=purpose, ok=ok, error=err, input_chars=chars, latency_ms=ms, audio_seconds=secs, cost=cost)


# 1. text-to-speech, streaming, as in client.textToSpeech.convertStream(...)
body = {"text": TEXT, "target_language_code": "hi-IN", "speaker": "shubh_enhi_ads", "model": "bulbul:v4-flash", "pace": 1, "speech_sample_rate": 24000}
t = time.perf_counter()
r = httpx.post("https://api.sarvam.ai/text-to-speech/stream", headers=H, json=body, timeout=60)
ms = int((time.perf_counter() - t) * 1000)
ok = r.status_code == 200 and len(r.content) > 1000
log("bulbul:v4-flash", "voice check: TTS stream (hi-IN, shubh_enhi_ads)", ok, ms, None if ok else f"{r.status_code}: {r.text[:200]}", len(TEXT), cost=len(TEXT) * ai_client.PRICE_TTS_CHAR)
print(f"1. TTS bulbul:v4-flash stream  HTTP {r.status_code}  {r.headers.get('content-type')}  {len(r.content)} bytes  {ms} ms")
if not ok:
    print("   error:", r.text[:300])
    raise SystemExit(1)
mp3 = OUT / "speech.mp3"
mp3.write_bytes(r.content)
print(f"   saved {mp3}")


def stt(path: Path, mime: str, lang: str):
    data = {"model": "saaras:v4", "language_code": lang, "mode": "transcribe", "sample_rate": "16000"}
    t0 = time.perf_counter()
    rr = httpx.post("https://api.sarvam.ai/speech-to-text", headers=H, data=data, files={"file": (path.name, path.read_bytes(), mime)}, timeout=60)
    ms0 = int((time.perf_counter() - t0) * 1000)
    good = rr.status_code == 200
    log("saaras:v4", f"voice check: STT {path.suffix} ({lang}, mode=transcribe)", good, ms0, None if good else f"{rr.status_code}: {rr.text[:200]}",
        secs=4, cost=4 * ai_client.PRICE_STT_SEC)
    j = rr.json() if good else {}
    print(f"   HTTP {rr.status_code}  {ms0} ms  language={j.get('language_code')}  transcript: {j.get('transcript') if good else rr.text[:300]}")
    return good


# 2. speech-to-text on that audio, as in client.speechToText.transcribe(file, {model, language_code, mode, sample_rate})
print("2. STT saaras:v4 on the Bulbul mp3 (hi-IN)")
ok2 = stt(mp3, "audio/mpeg", "hi-IN")

# 3. the same on a 16 kHz WAV, like the sample's audio.wav
ok3 = True
if len(sys.argv) > 1 and Path(sys.argv[1]).exists():
    print(f"3. STT saaras:v4 on a 16 kHz WAV ({Path(sys.argv[1]).name})")
    ok3 = stt(Path(sys.argv[1]), "audio/wav", "unknown")
print("\nALL OK" if ok2 and ok3 else "\nSOME CHECKS FAILED")
