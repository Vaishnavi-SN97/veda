"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { askTutor } from "@/lib/api";
import type { Language, Student, TutorMessage } from "@/lib/types";
import { StudentShell } from "@/components/StudentShell";
import { VidyaAvatar } from "@/components/VidyaAvatar";
import { Segmented, cx } from "@/components/ui";
import { speak, stopSpeaking, useSpeechInput } from "@/components/speech";

const VIDYA_GREETING: Record<Language, string> = {
  en: "Hi! I'm Vidya. What shall we revise today?",
  kn: "ನಮಸ್ಕಾರ! ನಾನು ವಿದ್ಯಾ. ಇಂದು ಏನು ಪುನರಾವರ್ತನೆ ಮಾಡೋಣ?",
  hi: "नमस्ते! मैं विद्या हूँ। आज क्या दोहराएँ?",
};

const STARTERS: Record<Language, string[]> = {
  en: ["What are equivalent fractions?", "What is a decimal?", "Give me a quiz question"],
  kn: ["ಸಮಾನ ಭಿನ್ನರಾಶಿ ಎಂದರೇನು?", "ದಶಮಾಂಶ ಎಂದರೇನು?", "ಒಂದು ಪ್ರಶ್ನೆ ಕೊಡು"],
  hi: ["तुल्य भिन्न क्या है?", "दशमलव क्या है?", "एक सवाल दो"],
};

export default function VidyaPage() {
  return <StudentShell>{(s) => <Chat student={s} />}</StudentShell>;
}

function Chat({ student }: { student: Student }) {
  const [lang, setLang] = useState<Language>("en");
  const [messages, setMessages] = useState<TutorMessage[]>([{ role: "vidya", text: VIDYA_GREETING.en }]);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS.en);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const end = useRef<HTMLDivElement>(null);

  const mic = useSpeechInput(lang, (heard) => send(heard));

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);
  useEffect(() => () => stopSpeaking(), []);

  function changeLang(l: Language) {
    stopSpeaking();
    setSpeaking(false);
    setLang(l);
    setMessages((m) => [...m, { role: "vidya", text: VIDYA_GREETING[l] }]);
    setSuggestions(STARTERS[l]);
  }

  async function send(message: string) {
    const msg = message.trim();
    if (!msg || thinking) return;
    setText("");
    setSuggestions([]);
    const history = [...messages, { role: "student" as const, text: msg }];
    setMessages(history);
    setThinking(true);
    const reply = await askTutor({ studentId: student.id, language: lang, history: messages, message: msg });
    setThinking(false);
    setMessages([...history, { role: "vidya", text: reply.text }]);
    setSuggestions(reply.suggestions);
    if (voiceOn) speak(reply.text, lang, () => setSpeaking(true), () => setSpeaking(false));
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-col items-center">
        <VidyaAvatar speaking={speaking} listening={mic.listening} />
        <p className="mt-2 font-display text-lg font-bold">Vidya</p>
        <p className="text-sm text-ink-3" aria-live="polite">
          {mic.listening ? "Listening… tap the mic to stop" : mic.working ? "Understanding…" : thinking ? "Thinking…" : speaking ? "Speaking…" : "Your study friend"}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Segmented
            label="Language"
            value={lang}
            onChange={changeLang}
            options={[
              { value: "en", label: "English" },
              { value: "kn", label: "ಕನ್ನಡ" },
              { value: "hi", label: "हिंदी" },
            ]}
          />
          <button
            onClick={() => { if (voiceOn) { stopSpeaking(); setSpeaking(false); } setVoiceOn(!voiceOn); }}
            className="flex size-12 items-center justify-center rounded-xl border border-line text-ink-2"
            aria-label={voiceOn ? "Turn Vidya's voice off" : "Turn Vidya's voice on"}
            aria-pressed={voiceOn}
          >
            {voiceOn ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "student" ? "justify-end" : "justify-start")}>
            <p className={cx("max-w-[85%] rounded-2xl px-4 py-3 text-[16px] leading-relaxed", m.role === "student" ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md border border-line bg-card")}>
              {m.text}
            </p>
          </div>
        ))}
        {thinking && (
          <div className="flex">
            <p className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-card px-4 py-4" aria-label="Vidya is thinking">
              {[0, 1, 2].map((d) => <span key={d} className="size-2 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${d * 150}ms` }} />)}
            </p>
          </div>
        )}
        <div ref={end} />
      </div>

      {suggestions.length > 0 && (
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="min-h-11 shrink-0 rounded-full border border-accent/50 px-4 text-sm text-accent">
              {s}
            </button>
          ))}
        </div>
      )}

      {mic.error && <p className="mt-3 text-sm text-bad">{mic.error}</p>}

      <form
        className="sticky bottom-20 mt-4 flex items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-lg shadow-black/40"
        onSubmit={(e) => { e.preventDefault(); send(text); }}
      >
        {mic.supported && (
          <button
            type="button"
            disabled={mic.working}
            onClick={mic.listening ? mic.stop : () => { stopSpeaking(); setSpeaking(false); mic.start(); }}
            className={cx("flex size-12 shrink-0 items-center justify-center rounded-xl", mic.listening ? "bg-accent text-accent-ink" : "bg-raised text-ink")}
            aria-label={mic.listening ? "Stop listening" : "Speak to Vidya"}
          >
            {mic.listening ? <MicOff className="size-6" aria-hidden /> : <Mic className="size-6" aria-hidden />}
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={lang === "kn" ? "ಇಲ್ಲಿ ಬರೆ…" : lang === "hi" ? "यहाँ लिखो…" : "Type your question…"}
          className="min-h-12 min-w-0 flex-1 bg-transparent px-2 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
          aria-label="Your question"
        />
        <button type="submit" disabled={!text.trim() || thinking} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink disabled:opacity-40" aria-label="Send">
          <Send className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
