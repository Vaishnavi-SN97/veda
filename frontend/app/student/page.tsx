"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Delete } from "lucide-react";
import { DEMO_MODE, DEMO_PIN, listProfiles, studentLogin } from "@/lib/api";
import type { Grade, Student } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Loading, Segmented, cx } from "@/components/ui";
import { useLoad } from "@/components/useLoad";
import { setStudent } from "@/components/studentSession";

export default function StudentPicker() {
  const { data: profiles } = useLoad(listProfiles);
  const [grade, setGrade] = useState<Grade>(4);
  const [picked, setPicked] = useState<Student | null>(null);

  if (picked) return <PinPad student={picked} onBack={() => setPicked(null)} />;

  return (
    <div>
      <h1 className="text-2xl">Who is learning now?</h1>
      <p className="mt-1 mb-5 text-ink-2">Tap your picture.</p>
      <div className="mb-5">
        <Segmented label="Grade" value={grade} onChange={setGrade} options={([3, 4, 5] as Grade[]).map((g) => ({ value: g, label: `Grade ${g}` }))} />
      </div>
      {!profiles ? (
        <Loading />
      ) : (
        <ul className="grid grid-cols-3 gap-3">
          {profiles.filter((p) => p.student.grade === grade).map(({ student }) => (
            <li key={student.id}>
              <button
                onClick={() => setPicked(student)}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border border-line bg-card px-2 py-4 transition hover:border-accent active:scale-95"
              >
                <Avatar picture={student.avatar} size="lg" />
                <span className="font-medium">{student.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PinPad({ student, onBack }: { student: Student; onBack: () => void }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);

  async function press(d: string) {
    if (checking || pin.length >= 4) return;
    const next = pin + d;
    setWrong(false);
    setPin(next);
    if (next.length === 4) {
      setChecking(true);
      const ok = await studentLogin(student.id, next);
      setChecking(false);
      if (ok) {
        setStudent(student);
        router.push("/student/today");
      } else {
        setWrong(true);
        setPin("");
      }
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button onClick={onBack} className="mb-4 flex min-h-11 items-center gap-1 self-start text-accent">
        <ArrowLeft className="size-5" aria-hidden /> Back
      </button>
      <Avatar picture={student.avatar} size="lg" />
      <h1 className="mt-3 text-2xl">{student.name}</h1>
      <p className="mt-1 text-ink-2">Enter your secret number</p>

      <div className="my-6 flex gap-4" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx("size-5 rounded-full border-2", i < pin.length ? "border-accent bg-accent" : wrong ? "border-bad" : "border-line")} />
        ))}
      </div>
      <p className="mb-4 h-5 text-sm text-bad" role="alert">{wrong ? "Not quite. Try again." : ""}</p>

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} className="min-h-16 rounded-2xl border border-line bg-card font-display text-2xl font-bold active:scale-95 active:bg-raised">
            {d}
          </button>
        ))}
        <span />
        <button onClick={() => press("0")} className="min-h-16 rounded-2xl border border-line bg-card font-display text-2xl font-bold active:scale-95 active:bg-raised">0</button>
        <button onClick={() => setPin(pin.slice(0, -1))} className="flex min-h-16 items-center justify-center rounded-2xl text-ink-2 active:scale-95" aria-label="Delete">
          <Delete className="size-7" aria-hidden />
        </button>
      </div>
      {DEMO_MODE && <p className="mt-6 text-sm text-ink-3">Demo PIN for everyone: {DEMO_PIN}</p>}
    </div>
  );
}
