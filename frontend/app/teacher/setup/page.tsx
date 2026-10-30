"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Link2, Plus, Trash2 } from "lucide-react";
import { getClass, getTopics, listClassroomCourses, saveClass, saveTopics } from "@/lib/api";
import type { BreakSlot, ClassSetup, ClassroomCourse, Grade } from "@/lib/types";
import { Button, Card, GradeChip, GradePicker, Loading, Notice, PageHeader, cx } from "@/components/ui";

const STEPS = ["Class", "Google Classroom", "School hours", "Breaks", "Syllabus"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const field = "min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-ink placeholder:text-ink-3";

type TopicRow = { chapter: string; title: string };

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<ClassSetup | null>(null);
  const [courses, setCourses] = useState<ClassroomCourse[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [topics, setTopics] = useState<Record<Grade, TopicRow[]> | null>(null);
  const [topicGrade, setTopicGrade] = useState<Grade>(3);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getClass(), getTopics()]).then(([c, t]) => {
      setSetup(c);
      setTopics({
        3: t.filter((x) => x.grade === 3).map(({ chapter, title }) => ({ chapter, title })),
        4: t.filter((x) => x.grade === 4).map(({ chapter, title }) => ({ chapter, title })),
        5: t.filter((x) => x.grade === 5).map(({ chapter, title }) => ({ chapter, title })),
      });
    });
  }, []);

  if (!setup || !topics) return <Loading />;

  const update = (patch: Partial<ClassSetup>) => setSetup({ ...setup, ...patch });

  async function connect() {
    setConnecting(true);
    setCourses(await listClassroomCourses());
    setConnecting(false);
  }

  async function finish() {
    if (!setup || !topics) return;
    setSaving(true);
    await saveClass({ ...setup, setupComplete: true });
    for (const g of setup.grades) await saveTopics(g, topics[g].filter((t) => t.title.trim()));
    router.push("/teacher");
  }

  const setBreak = (i: number, patch: Partial<BreakSlot>) => update({ breaks: setup.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setTopic = (i: number, patch: Partial<TopicRow>) =>
    setTopics({ ...topics, [topicGrade]: topics[topicGrade].map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Class setup" subtitle="Set this up once. You can change it any time." />

      {/* stepper */}
      <ol className="no-scrollbar mb-6 flex gap-2 overflow-x-auto">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => setStep(i)}
              className={cx(
                "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm",
                i === step ? "border-accent text-accent" : i < step ? "border-line text-ink-2" : "border-line text-ink-3",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              <span className={cx("flex size-6 items-center justify-center rounded-full text-xs font-bold", i < step ? "bg-accent text-accent-ink" : "bg-raised")}>
                {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <Card className="space-y-5">
        {step === 0 && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm text-ink-2">Class name</span>
              <input className={field} value={setup.name} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-ink-2">Your name</span>
              <input className={field} value={setup.teacherName} onChange={(e) => update({ teacherName: e.target.value })} />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm text-ink-2">Grades in this room</legend>
              <div className="flex gap-2">
                {([3, 4, 5] as Grade[]).map((g) => {
                  const on = setup.grades.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => update({ grades: on ? setup.grades.filter((x) => x !== g) : [...setup.grades, g].sort() })}
                      aria-pressed={on}
                      className={cx("flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border font-display text-lg font-bold", on ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-3")}
                    >
                      {on && <Check className="size-5" aria-hidden />} Grade {g}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-ink-2">Each grade links to its own Google Classroom course. Rosters come from Classroom; topic cards go there as materials and quizzes as coursework.</p>
            {!courses ? (
              <Button variant="primary" size="lg" icon={<Link2 className="size-5" aria-hidden />} loading={connecting} onClick={connect}>
                Connect Google Classroom
              </Button>
            ) : (
              <>
                <Notice tone="good">Connected (demo account). Found {courses.length} courses.</Notice>
                {setup.grades.map((g) => {
                  const link = setup.linkedCourses.find((l) => l.grade === g);
                  return (
                    <label key={g} className="flex items-center gap-3">
                      <GradeChip grade={g} />
                      <select
                        className={field}
                        value={link?.course?.id ?? ""}
                        onChange={(e) =>
                          update({
                            linkedCourses: [
                              ...setup.linkedCourses.filter((l) => l.grade !== g),
                              { grade: g, course: courses.find((c) => c.id === e.target.value) ?? null },
                            ],
                          })
                        }
                        aria-label={`Classroom course for Grade ${g}`}
                      >
                        <option value="">Not linked</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.studentCount} students)</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm text-ink-2">School starts</span>
                <input type="time" className={field} value={setup.hours.start} onChange={(e) => update({ hours: { ...setup.hours, start: e.target.value } })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-ink-2">School ends</span>
                <input type="time" className={field} value={setup.hours.end} onChange={(e) => update({ hours: { ...setup.hours, end: e.target.value } })} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm text-ink-2">Period length (minutes)</span>
              <input type="number" inputMode="numeric" className={field} value={setup.hours.periodMinutes} onChange={(e) => update({ hours: { ...setup.hours, periodMinutes: Number(e.target.value) || 45 } })} />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm text-ink-2">School days</legend>
              <div className="grid grid-cols-6 gap-2">
                {DAY_NAMES.map((d, i) => {
                  const day = i + 1;
                  const on = setup.hours.days.includes(day);
                  return (
                    <button
                      key={d}
                      onClick={() => update({ hours: { ...setup.hours, days: on ? setup.hours.days.filter((x) => x !== day) : [...setup.hours.days, day].sort() } })}
                      aria-pressed={on}
                      className={cx("min-h-12 rounded-xl border text-sm font-medium", on ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-3")}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}

        {step === 3 && (
          <>
            {setup.breaks.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-3">
                <input className={field} value={b.label} onChange={(e) => setBreak(i, { label: e.target.value })} aria-label="Break name" />
                <Button variant="ghost" aria-label="Remove break" onClick={() => update({ breaks: setup.breaks.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-5" aria-hidden />
                </Button>
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <input type="time" className={field} value={b.start} onChange={(e) => setBreak(i, { start: e.target.value })} aria-label="Break starts" />
                  <input type="time" className={field} value={b.end} onChange={(e) => setBreak(i, { end: e.target.value })} aria-label="Break ends" />
                </div>
              </div>
            ))}
            <Button icon={<Plus className="size-5" aria-hidden />} onClick={() => update({ breaks: [...setup.breaks, { label: "Break", start: "15:00", end: "15:10" }] })}>
              Add break
            </Button>
          </>
        )}

        {step === 4 && (
          <>
            <GradePicker value={topicGrade} onChange={setTopicGrade} />
            <p className="text-sm text-ink-3">
              {topicGrade === 5
                ? "Grade 5 topics are placeholders until the Grade 5 textbook PDF is added."
                : `Filled in from the KTBS Grade ${topicGrade} Mathematics textbook (Part I). Edit the order or wording to match how you teach.`}
            </p>
            <ol className="space-y-2">
              {topics[topicGrade].map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6 text-right text-sm text-ink-3">{i + 1}</span>
                  <input className={cx(field, "w-36 shrink-0 sm:w-44")} value={t.chapter} onChange={(e) => setTopic(i, { chapter: e.target.value })} aria-label="Chapter" />
                  <input className={field} value={t.title} onChange={(e) => setTopic(i, { title: e.target.value })} aria-label="Topic" />
                  <button
                    onClick={() => setTopics({ ...topics, [topicGrade]: topics[topicGrade].filter((_, j) => j !== i) })}
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-3 hover:text-bad"
                    aria-label={`Remove ${t.title}`}
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
            <Button icon={<Plus className="size-5" aria-hidden />} onClick={() => setTopics({ ...topics, [topicGrade]: [...topics[topicGrade], { chapter: topics[topicGrade].at(-1)?.chapter ?? "", title: "" }] })}>
              Add topic
            </Button>
          </>
        )}
      </Card>

      <div className="mt-5 flex gap-3">
        <Button variant="ghost" icon={<ArrowLeft className="size-5" aria-hidden />} disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" className="ml-auto" onClick={() => setStep(step + 1)}>
            Next <ArrowRight className="size-5" aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" className="ml-auto" icon={<Check className="size-5" aria-hidden />} loading={saving} onClick={finish}>
            Save and finish
          </Button>
        )}
      </div>
    </div>
  );
}
