"use client";

import { useEffect, useState } from "react";
import { Check, Mic, MicOff, Save } from "lucide-react";
import { TODAY, getAttendance, getStudents, readVoiceNote, saveAttendance } from "@/lib/api";
import type { AttendanceSheet, Grade, Student } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Button, Card, GradePicker, Loading, Notice, PageHeader, cx } from "@/components/ui";
import { useSpeechInput } from "@/components/speech";

export default function AttendancePage() {
  const [grade, setGrade] = useState<Grade>(3);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  function changeGrade(g: Grade) {
    setGrade(g);
    setStudents(null);
    setSheet(null);
    setMessage(null);
  }

  useEffect(() => {
    Promise.all([getStudents(grade), getAttendance(TODAY, grade)]).then(([s, a]) => {
      setStudents(s);
      setSheet(a);
    });
  }, [grade]);

  async function applyVoice(text: string) {
    const res = await readVoiceNote(grade, text);
    if (!sheet || !students) return;
    const marks = { ...sheet.marks };
    res.absentStudentIds.forEach((id) => (marks[id] = "absent"));
    setSheet({ ...sheet, marks, submitted: false });
    const names = students.filter((s) => res.absentStudentIds.includes(s.id)).map((s) => s.name);
    setMessage(names.length ? `Heard “${text}”. Marked absent: ${names.join(", ")}. Check and save.` : `Heard “${text}”, but no names from Grade ${grade} matched.`);
  }

  const voice = useSpeechInput("en", applyVoice);

  function toggle(id: string) {
    if (!sheet) return;
    setSheet({ ...sheet, submitted: false, marks: { ...sheet.marks, [id]: sheet.marks[id] === "present" ? "absent" : "present" } });
  }

  async function save() {
    if (!sheet) return;
    setSaving(true);
    setSheet(await saveAttendance(sheet));
    setSaving(false);
    setMessage(`Grade ${grade} attendance saved.`);
  }

  const present = sheet ? Object.values(sheet.marks).filter((m) => m === "present").length : 0;
  const total = sheet ? Object.keys(sheet.marks).length : 0;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Attendance" subtitle="Everyone starts present. Tap a child to mark them absent." />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <GradePicker value={grade} onChange={changeGrade} />
        <p className="text-ink-2">
          <span className="font-display text-2xl font-bold text-ink">{present}</span>/{total} present
        </p>
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          {voice.supported ? (
            <Button
              variant={voice.listening ? "primary" : "secondary"}
              icon={voice.listening ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
              onClick={voice.listening ? voice.stop : voice.start}
            >
              {voice.listening ? "Listening… tap to stop" : "Voice note"}
            </Button>
          ) : (
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) applyVoice(typed.trim());
                setTyped("");
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type absent names, e.g. Kiran, Divya"
                className="min-h-12 flex-1 rounded-xl border border-line bg-bg px-3 text-ink placeholder:text-ink-3"
                aria-label="Absent names"
              />
              <Button type="submit">Apply</Button>
            </form>
          )}
          <p className="text-sm text-ink-3">Say: “Absent today: Kiran and Divya”.</p>
        </div>
        {voice.error && <p className="mt-2 text-sm text-bad">{voice.error}</p>}
      </Card>

      {message && <div className="mb-5"><Notice tone={sheet?.submitted ? "good" : "info"}>{message}</Notice></div>}

      {!students || !sheet ? (
        <Loading />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {students.map((s) => {
            const absent = sheet.marks[s.id] === "absent";
            return (
              <li key={s.id}>
                <button
                  onClick={() => toggle(s.id)}
                  aria-pressed={!absent}
                  aria-label={`${s.name}: ${absent ? "absent" : "present"}`}
                  className={cx(
                    "flex min-h-20 w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]",
                    absent ? "border-bad/60 bg-bad/10" : "border-line bg-card",
                  )}
                >
                  <Avatar picture={s.avatar} className={absent ? "opacity-40" : ""} />
                  <span className="min-w-0">
                    <span className={cx("block truncate font-medium", absent && "text-ink-3 line-through")}>{s.name}</span>
                    <span className={cx("text-sm", absent ? "text-bad" : "text-good")}>{absent ? "Absent" : "Present"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-20 z-20 mt-6 lg:bottom-4">
        <Button variant="primary" size="lg" className="w-full shadow-lg shadow-black/50" icon={sheet?.submitted ? <Check className="size-5" aria-hidden /> : <Save className="size-5" aria-hidden />} loading={saving} disabled={!sheet} onClick={save}>
          {sheet?.submitted ? `Saved · Grade ${grade}` : `Save Grade ${grade} attendance`}
        </Button>
      </div>
    </div>
  );
}
