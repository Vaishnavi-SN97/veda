"""Make a spoken test question (WAV) with Bulbul, for the browser microphone test. 1 Sarvam call (logged).

    python scripts/make_test_wav.py kn "ದಶಮಾಂಶ ಎಂದರೇನು?" out.wav
"""

import base64
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ai_client  # noqa: E402
from app.db import SessionLocal  # noqa: E402

lang, text, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
body = {"text": text, "language_code": ai_client.LANG_CODE[lang], "model": ai_client.TTS_MODEL, "speaker": ai_client.TTS_SPEAKER,
        "speech_sample_rate": 16000, "output_audio_codec": "wav"}
t = time.perf_counter()
r = ai_client._post(f"{ai_client.BASE_URL}/text-to-speech", json=body)
with SessionLocal() as db:
    ai_client._log(db, model=ai_client.TTS_MODEL, purpose=f"test audio for mic test ({lang})", ok=r.status_code == 200, input_chars=len(text),
                   latency_ms=int((time.perf_counter() - t) * 1000), cost=len(text) * ai_client.PRICE_TTS_CHAR, error=None if r.status_code == 200 else r.text[:200])
r.raise_for_status()
out.write_bytes(base64.b64decode("".join(r.json()["audios"])))
print(f"wrote {out} ({out.stat().st_size} bytes)")
