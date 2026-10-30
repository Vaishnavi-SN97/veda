"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getStudentInsight, listStudentSummaries } from "@/lib/api";
import type { Grade, StudentInsight, StudentSummary, WeeklyScore } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Card, GradeChip, Loading, PageHeader, Progress, SectionTitle, Segmented, TagChip, cx } from "@/components/ui";

export default function StudentsPage() {
  const [grade, setGrade] = useState<Grade | 0>(0);
  const [list, setList] = useState<StudentSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [insight, setInsight] = useState<StudentInsight | null>(null);

  function changeGrade(g: Grade | 0) {
    setGrade(g);
    setList(null);
  }

  function select(id: string | null) {
    setSelected(id);
    setInsight(null);
  }

  useEffect(() => {
    listStudentSummaries(grade || undefined).then((l) => {
      setList(l);
      // on wide screens, open the first student who needs help
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setSelected((cur) => cur ?? (l.find((s) => s.tag !== "on_track") ?? l[0])?.student.id ?? null);
      }
    });
  }, [grade]);

  useEffect(() => {
    if (selected) getStudentInsight(selected).then(setInsight);
  }, [selected]);

  return (
    <div>
      <PageHeader title="Student insights" subtitle="Who understood, who didn't study, and who studied but is still confused." />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className={cx(selected && "hidden lg:block")}>
          <div className="no-scrollbar mb-4 overflow-x-auto">
            <Segmented
              label="Grade"
              value={grade}
              onChange={changeGrade}
              options={[{ value: 0 as const, label: "All" }, ...([3, 4, 5] as Grade[]).map((g) => ({ value: g, label: `G${g}` }))]}
            />
          </div>
          {!list ? (
            <Loading />
          ) : (
            <ul className="space-y-2">
              {[...list]
                .sort((a, b) => Number(a.tag === "on_track") - Number(b.tag === "on_track"))
                .map((s) => (
                  <li key={s.student.id}>
                    <button
                      onClick={() => select(s.student.id)}
                      className={cx(
                        "flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left transition",
                        selected === s.student.id ? "border-accent" : "border-line hover:border-ink-3",
                      )}
                    >
                      <Avatar picture={s.student.avatar} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-medium">
                          {s.student.name} <span className="text-xs text-ink-3">G{s.student.grade}</span>
                        </span>
                        <span className="mt-1 block"><TagChip tag={s.tag} /></span>
                      </span>
                      <span className="text-right text-sm text-ink-3">
                        <span className="block font-display text-base font-bold text-ink">{s.lastQuizPercent}%</span>
                        last quiz
                      </span>
                      <ChevronRight className="size-5 text-ink-3 lg:hidden" aria-hidden />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className={cx(!selected && "hidden lg:block")}>
          {selected && (
            <button onClick={() => select(null)} className="mb-3 flex min-h-11 items-center gap-1 text-accent lg:hidden">
              <ArrowLeft className="size-5" aria-hidden /> All students
            </button>
          )}
          {!selected ? null : !insight ? <Loading /> : <InsightView i={insight} />}
        </section>
      </div>
    </div>
  );
}

function InsightView({ i }: { i: StudentInsight }) {
  const chapters = [...new Set(i.mastery.map((m) => m.chapter))];
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar picture={i.student.avatar} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl">{i.student.name}</h2>
            <GradeChip grade={i.student.grade} />
          </div>
          <div className="mt-2"><TagChip tag={i.tag} /></div>
          <p className="mt-2 text-sm text-ink-2">{i.tagReason}</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Attendance" value={`${i.attendancePercent}%`} />
        <Stat label="Days missed" value={String(i.daysMissed)} />
        <Stat label="Last quiz" value={`${i.quizScores[3].percent}%`} />
        <Stat label="Vidya time this week" value={`${i.tutorMinutes[3].percent} min`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <SectionTitle>Weekly quiz score</SectionTitle>
          <Bars data={i.quizScores} max={100} unit="%" />
        </Card>
        <Card>
          <SectionTitle>Minutes with Vidya</SectionTitle>
          <Bars data={i.tutorMinutes} max={60} unit=" min" />
        </Card>
      </div>

      <Card>
        <SectionTitle>Mastery by topic</SectionTitle>
        <div className="space-y-5">
          {chapters.map((ch) => (
            <div key={ch}>
              <p className="mb-2 text-sm text-ink-3">{ch}</p>
              <ul className="space-y-3">
                {i.mastery.filter((m) => m.chapter === ch).map((m) => (
                  <li key={m.topicId}>
                    <div className="mb-1 flex justify-between gap-3 text-sm">
                      <span className="text-ink-2">{m.topicTitle}</span>
                      <span className={cx("font-display font-bold", m.percent < 50 ? "text-bad" : "text-ink")}>{m.percent}%</span>
                    </div>
                    <Progress value={m.percent} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Test marks</SectionTitle>
        {i.testMarks.length === 0 ? (
          <p className="text-ink-3">No tests yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-ink-3">
              <tr><th className="py-2 font-normal">Test</th><th className="py-2 font-normal">Date</th><th className="py-2 text-right font-normal">Marks</th></tr>
            </thead>
            <tbody>
              {i.testMarks.map((t) => (
                <tr key={t.testName} className="border-t border-line">
                  <td className="py-3 text-ink-2">{t.testName}</td>
                  <td className="py-3 text-ink-3">{t.date}</td>
                  <td className={cx("py-3 text-right font-display font-bold", t.score / t.maxScore < 0.4 ? "text-bad" : "text-ink")}>{t.score}/{t.maxScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-ink-3">{label}</p>
    </Card>
  );
}

/** Single-series weekly bars: value label on each bar, hover title, baseline-anchored rounded tops. */
function Bars({ data, max, unit }: { data: WeeklyScore[]; max: number; unit: string }) {
  return (
    <div>
      <div className="flex h-36 items-end gap-3 border-b border-line">
        {data.map((d) => (
          <div key={d.weekLabel} className="flex h-full flex-1 flex-col items-center justify-end" title={`${d.weekLabel}: ${d.percent}${unit}`}>
            <span className="mb-1 text-xs tabular-nums text-ink-2">{d.percent}{unit}</span>
            <div className="w-full max-w-10 rounded-t-[4px] bg-accent" style={{ height: `${Math.max(2, Math.min(80, (d.percent / max) * 80))}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3">
        {data.map((d) => (
          <span key={d.weekLabel} className="flex-1 text-center text-xs text-ink-3">{d.weekLabel}</span>
        ))}
      </div>
    </div>
  );
}
