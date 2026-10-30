"use client";

// Voice in and out. VOICE_PROVIDER (backend setting, read via /api/meta) picks the engine:
//   browser: free Web Speech API (speech recognition + speechSynthesis)
//   sarvam:  record -> 16 kHz WAV -> Saaras speech-to-text; Bulbul text-to-speech played as audio
// If a Sarvam voice call fails, speaking falls back to the browser voice.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getMeta, speechToText, textToSpeech } from "@/lib/api";
import type { Language } from "@/lib/types";

export const SPEECH_LANG: Record<Language, string> = { en: "en-IN", kn: "kn-IN", hi: "hi-IN" };
const MAX_RECORD_SECONDS = 25; // Saaras REST accepts up to 30 s

type Provider = "browser" | "sarvam";

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

function useProvider(): Provider {
  const [p, setP] = useState<Provider>("browser");
  useEffect(() => {
    getMeta()
      .then((m) => setP(m.voiceProvider))
      .catch(() => {});
  }, []);
  return p;
}

// ---------- recording -> WAV ----------

/** Decode any recorded audio and re-encode as 16 kHz mono 16-bit WAV (Sarvam's preferred input). */
async function toWav16k(blob: Blob): Promise<{ wav: Blob; seconds: number }> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return { wav: new Blob([buf], { type: "audio/wav" }), seconds: decoded.duration };
}

// ---------- speech input ----------

export function useSpeechInput(lang: Language, onText: (text: string) => void) {
  const provider = useProvider();
  const browserOk = useSyncExternalStore(noSubscribe, () => !!recognitionCtor(), () => false);
  const recorderOk = useSyncExternalStore(noSubscribe, () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia, () => false);
  const supported = provider === "sarvam" ? recorderOk : browserOk;
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false); // sending audio to Sarvam
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<RecognitionLike | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onText);

  useEffect(() => {
    cb.current = onText;
  });

  const startBrowser = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[lang];
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => cb.current(Array.from(e.results).map((res) => res[0].transcript).join(" "));
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission was blocked." : "Couldn't hear that. Try again.");
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, [lang]);

  const startSarvam = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission was blocked.");
      return;
    }
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
      setListening(false);
      setWorking(true);
      try {
        const { wav, seconds } = await toWav16k(new Blob(chunks, { type: mr.mimeType }));
        if (seconds < 0.4) throw new Error("short");
        const { transcript } = await speechToText(wav, lang, seconds);
        if (transcript.trim()) cb.current(transcript.trim());
        else setError("Couldn't hear that. Try again.");
      } catch (e) {
        if ((e as Error).message === "short") setError("That was too short. Hold the button and speak.");
      } finally {
        setWorking(false);
      }
    };
    recorder.current = mr;
    mr.start();
    setListening(true);
    timer.current = setTimeout(() => mr.state === "recording" && mr.stop(), MAX_RECORD_SECONDS * 1000);
  }, [lang]);

  const start = useCallback(() => {
    setError(null);
    if (provider === "sarvam") void startSarvam();
    else startBrowser();
  }, [provider, startSarvam, startBrowser]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    rec.current?.stop();
  }, []);

  return { supported, listening, working, error, start, stop, provider };
}

// ---------- speech output ----------

let currentAudio: HTMLAudioElement | null = null;
let speakToken = 0;

function browserSpeak(text: string, lang: Language, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  const u = new SpeechSynthesisUtterance(text.replace(/\[[^\]]*\]/g, ""));
  u.lang = SPEECH_LANG[lang];
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === u.lang) ?? voices.find((v) => v.lang.startsWith(lang));
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

/** Speak text. onStart/onEnd drive Vidya's mouth animation. */
export function speak(text: string, lang: Language, onStart?: () => void, onEnd?: () => void) {
  stopSpeaking();
  const token = ++speakToken;
  getMeta()
    .then(async (m) => {
      if (m.voiceProvider !== "sarvam") return browserSpeak(text, lang, onStart, onEnd);
      try {
        const { audio, mime } = await textToSpeech(text, lang);
        if (token !== speakToken) return; // something newer started speaking meanwhile
        const a = new Audio(`data:${mime};base64,${audio}`);
        currentAudio = a;
        a.onplaying = () => onStart?.();
        a.onended = () => onEnd?.();
        a.onpause = () => onEnd?.();
        a.onerror = () => onEnd?.();
        await a.play();
      } catch {
        if (token === speakToken) browserSpeak(text, lang, onStart, onEnd); // free fallback
      }
    })
    .catch(() => browserSpeak(text, lang, onStart, onEnd));
}

export function stopSpeaking() {
  speakToken++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
