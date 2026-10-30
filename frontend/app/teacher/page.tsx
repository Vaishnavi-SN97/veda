"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, BookCheck, CalendarPlus, ClipboardList, UserCheck } from "lucide-react";
import { getDashboard } from "@/lib/api";
import { Card, GradeChip, LinkButton, Progress, SectionTitle, Skeleton, cx } from "@/components/ui";
import { PeriodRow } from "@/components/PeriodView";
import { useLoad } from "@/components/useLoad";

export default function DashboardPage() {
  const { data: d } = useLoad(getDashboard);

  const attendanceDone = d?.attendance.every((a) => a.taken);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-ink-3">{d?.dayLabel ?? "Today"}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl">Good morning, Lakshmi</h1>
      </header>

      {/* quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LinkButton href="/teacher/attendance" variant={attendanceDone ? "secondary" : "primary"} icon={<UserCheck className="size-5" aria-hidden />} className="min-h-16 justify-start">
          Take attendance
        </LinkButton>
        <LinkButton href="/teacher/planner?next=1" icon={<CalendarPlus className="size-5" aria-hidden />} className="min-h-16 justify-start">
          Generate my week
        </LinkButton>
        <LinkButton href="/teacher/topic-done" icon={<BookCheck className="size-5" aria-hidden />} className="min-h-16 justify-start">
          Mark topic done
        </LinkButton>
        <LinkButton href="/teacher/marks" icon={<ClipboardList className="size-5" aria-hidden />} className="min-h-16 justify-start">
          Add marks
        </LinkButton>
      </div>

      {/* alerts first: they are the reason to open the app */}
      {d && d.alerts.length > 0 && (
        <section>
          <SectionTitle action={<Link href="/teacher/alerts" className="flex min-h-11 items-center gap-1 text-sm text-accent">All alerts <ArrowRight className="size-4" aria-hidden /></Link>}>
            Needs your attention · {d.alerts.length}
          </SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {d.alerts.slice(0, 2).map((a) => (
              <Link key={a.id} href="/teacher/alerts" className="rounded-2xl border border-line bg-card p-4 transition hover:border-accent">
                <div className="flex items-start gap-3">
                  <AlertTriangle className={cx("mt-0.5 size-5 shrink-0", a.severity === "high" ? "text-bad" : "text-warn")} strokeWidth={1.75} aria-hidden />
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-3">{a.reasons[0]}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <section>
          <SectionTitle action={<Link href="/teacher/planner" className="flex min-h-11 items-center gap-1 text-sm text-accent">Week plan <ArrowRight className="size-4" aria-hidden /></Link>}>
            Today&apos;s timetable
          </SectionTitle>
          {!d ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          ) : d.todayPeriods.length === 0 ? (
            <Card>
              <p className="text-ink-2">No plan for this week yet.</p>
              <LinkButton href="/teacher/planner" variant="primary" className="mt-3">Generate my week</LinkButton>
            </Card>
          ) : (
            <div className="space-y-3">
              {d.todayPeriods.map((p, i) => (
                <div key={p.id}>
                  {d.breaks.filter((b) => b.start === d.todayPeriods[i - 1]?.end).map((b) => (
                    <p key={b.label} className="mb-3 text-center text-xs uppercase tracking-widest text-ink-3">
                      {b.label} · {b.start}–{b.end}
                    </p>
                  ))}
                  <PeriodRow period={p} />
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section>
            <SectionTitle>Attendance today</SectionTitle>
            <Card className="space-y-3">
              {d ? (
                d.attendance.map((a) => (
                  <div key={a.grade} className="flex items-center justify-between gap-3">
                    <GradeChip grade={a.grade} />
                    {a.taken ? (
                      <span className="text-ink-2">
                        <span className="font-display text-lg font-bold text-ink">{a.present}</span>/{a.total} present
                      </span>
                    ) : (
                      <span className="text-warn">Not taken</span>
                    )}
                  </div>
                ))
              ) : (
                <Skeleton className="h-24" />
              )}
              {d && !attendanceDone && (
                <LinkButton href="/teacher/attendance" variant="primary" className="w-full">
                  Take attendance
                </LinkButton>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle>Syllabus covered</SectionTitle>
            <Card className="space-y-5">
              {d ? (
                d.syllabus.map((s) => (
                  <div key={s.grade}>
                    <div className="mb-2 flex items-center justify-between">
                      <GradeChip grade={s.grade} />
                      <span className="font-display text-lg font-bold">{s.percent}%</span>
                    </div>
                    <Progress value={s.percent} />
                    <p className="mt-2 text-sm text-ink-3">
                      {s.done} of {s.total} topics{s.currentTopic && <> · now: <span className="text-ink-2">{s.currentTopic.title}</span></>}
                    </p>
                  </div>
                ))
              ) : (
                <Skeleton className="h-40" />
              )}
            </Card>
          </section>
        </aside>
      </div>
    </div>
  );
}
