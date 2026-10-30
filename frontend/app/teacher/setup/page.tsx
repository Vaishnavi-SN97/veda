"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Link2, Plus, Trash2, Users } from "lucide-react";
import { createClassroomCourse, getClass, getTopics, importRosters, listClassroomCourses, saveClass, saveTopics } from "@/lib/api";
import type { BreakSlot, ClassSetup, ClassroomCourse, Grade, ImportResult } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Button, Card, GradeChip, GradePicker, Loading, Notice, PageHeader, cx } from "@/components/ui";
import { useMeta } from "@/components/useMeta";

const STEPS = ["Class", "Google Classroom", "School hours", "Breaks", "Syllabus", "Students"];
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
  const [creating, setCreating] = useState<Grade | null>(null);
  const [importing, setImporting] = useState(false);
  const [roster, setRoster] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const meta = useMeta();

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
    try {
      setCourses(await listClassroomCourses());
    } catch {
      // the banner explains (signed out, Classroom API off, no internet)
    } finally {
      setConnecting(false);
    }
  }

  function linkCourse(g: Grade, course: ClassroomCourse | null) {
    if (!setup) return;
    update({ linkedCourses: [...setup.linkedCourses.filter((l) => l.grade !== g), { grade: g, course }] });
  }

  async function createCourse(g: Grade) {
    setCreating(g);
    try {
      const c = await createClassroomCourse(g);
      setCourses((cs) => [...(cs ?? []), c]);
      linkCourse(g, c);
    } catch {
      // banner explains
    } finally {
      setCreating(null);
    }
  }

  async function importStudents() {
    if (!setup) return;
    setImporting(true);
    try {
      setSetup(await saveClass(setup)); // the class (and its course links) must exist before importing
      setRoster(await importRosters());
    } catch {
      // banner explains
    } finally {
      setImporting(false);
    }
  }

  async function finish() {
    if (!setup || !topics) return;
    setSaving(true);
    try {
      await saveClass({ ...setup, setupComplete: true });
      for (const g of setup.grades) await saveTopics(g, topics[g].filter((t) => t.title.trim()));
      router.push("/teacher");
    } catch {
      setSaving(false);
    }
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
                <Notice tone="good">
                  {meta?.demoMode ? "Connected (demo account)." : "Connected to your Google Classroom."} Found {courses.length} course{courses.length === 1 ? "" : "s"}.
                </Notice>
                {setup.grades.map((g) => {
                  const link = setup.linkedCourses.find((l) => l.grade === g);
                  const known = courses.some((c) => c.id === link?.course?.id);
                  return (
                    <div key={g} className="flex flex-wrap items-center gap-2">
                      <GradeChip grade={g} />
                      <select
                        className={cx(field, "min-w-0 flex-1")}
                        value={link?.course?.id ?? ""}
                        onChange={(e) => linkCourse(g, courses.find((c) => c.id === e.target.value) ?? null)}
                        aria-label={`Classroom course for Grade ${g}`}
                      >
                        <option value="">Not linked</option>
                        {!known && link?.course && <option value={link.course.id}>{link.course.name}</option>}
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}{c.section ? ` · ${c.section}` : ""}</option>
                        ))}
                      </select>
                      {!meta?.demoMode && !link?.course && (
                        <Button icon={<Plus className="size-5" aria-hidden />} loading={creating === g} onClick={() => createCourse(g)}>
                          Create &quot;Grade {g}&quot;
                        </Button>
                      )}
                    </div>
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

        {step === 5 && (
          <>
            <p className="text-ink-2">
              Bring each linked course&apos;s students into Veda. Every child gets a picture and a 4-digit PIN for the family phone.
            </p>
            <Button variant="primary" size="lg" icon={<Users className="size-5" aria-hidden />} loading={importing} onClick={importStudents}>
              {roster ? "Import again" : "Import students from Classroom"}
            </Button>
            {roster && (
              <>
                <Notice tone="good">
                  {meta?.demoMode ? "Demo class:" : `${roster.added} new, ${roster.updated} updated.`} {roster.students.length} students in Veda.
                </Notice>
                <div>
                  <p className="mb-1 text-sm text-ink-2">Student link (open it on the family phone once; it remembers the class)</p>
                  <div className="flex gap-2">
                    <input readOnly value={roster.studentLink} className={cx(field, "font-mono text-sm")} aria-label="Student link" />
                    <Button
                      icon={copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
                      onClick={() => navigator.clipboard?.writeText(roster.studentLink).then(() => setCopied(true)).catch(() => {})}
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <ul className="max-h-96 space-y-1.5 overflow-y-auto">
                  {roster.students.map((r) => (
                    <li key={r.student.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                      <Avatar picture={r.student.avatar} size="sm" />
                      <span className="flex-1 truncate">{r.student.name}</span>
                      <GradeChip grade={r.student.grade} />
                      <span className="w-16 text-right font-mono text-lg tracking-widest" aria-label={`PIN ${r.pin ?? "none"}`}>{r.pin ?? "—"}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-3">Write each child&apos;s PIN in their notebook. You can see this list again on the Students page.</p>
              </>
            )}
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
