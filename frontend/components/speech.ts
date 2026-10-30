"use client";

// Free browser Web Speech API for now. Later: Saaras (speech-to-text) and Bulbul (text-to-speech)
// through the backend, keeping the same shape.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Language } from "@/lib/types";

export const SPEECH_LANG: Record<Language, string> = { en: "en-IN", kn: "kn-IN", hi: "hi-IN" };

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

export function useSpeechInput(lang: Language, onText: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, () => !!recognitionCtor(), () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<RecognitionLike | null>(null);
  const cb = useRef(onText);

  useEffect(() => {
    cb.current = onText;
  });

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[lang];
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0].transcript).join(" ");
      cb.current(text);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission was blocked." : "Couldn't hear that. Try again.");
    r.onend = () => setListening(false);
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }, [lang]);

  const stop = useCallback(() => rec.current?.stop(), []);

  return { supported, listening, error, start, stop };
}

export function speak(text: string, lang: Language, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === u.lang) ?? window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang));
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
