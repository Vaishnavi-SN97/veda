"use client";

import { use, useEffect, useState } from "react";
import { ArrowLeftRight, CalendarPlus, Check, CloudRain, Info, Layers, ShieldAlert, UserX, Wand2, X } from "lucide-react";
import { approveWeek, generateWeek, getMeta, getWeekPlan, movePeriod, replanWeek } from "@/lib/api";
import type { Meta, Period, ReplanReason, WeekPlan } from "@/lib/types";
import { MODE_ICON, PeriodRow } from "@/components/PeriodView";
import { Button, Card, GradeChip, Loading, Notice, PageHeader, Segmented, cx } from "@/components/ui";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
];

function fmtWeek(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function Planner({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = use(searchParams);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [plan, setPlan] = useState<WeekPlan | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [day, setDay] = useState(1);
  const [moving, setMoving] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [replanOpen, setReplanOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // the dashboard's "Generate my week" links here with ?next=1
  useEffect(() => {
    getMeta().then((m) => {
      setMeta(m);
      setWeek(params.next ? m.nextWeek : m.thisWeek);
    });
  }, [params.next]);

  useEffect(() => {
    if (week) getWeekPlan(week).then(setPlan);
  }, [week]);

  async function run(label: string, fn: () => Promise<WeekPlan>, message?: string) {
    setBusy(label);
    setFlash(null);
    try {
      setPlan(await fn());
      if (message) setFlash(message);
    } catch {
      // the error banner shows the server's reason (e.g. the rules can't all be met)
    } finally {
      setBusy(null);
    }
  }

  async function swap(from: string, to: string) {
    if (from === to || !week) return;
    setPicked(null);
    await run("move", () => movePeriod(week, { fromPeriodId: from, toPeriodId: to }), "Periods swapped. Approve the plan again when you're happy.");
  }

  function onCell(p: Period) {
    if (!moving) {
      setDay(p.day);
      return;
    }
    if (!picked) setPicked(p.id);
    else swap(picked, p.id);
  }

  const dayPeriods = plan?.periods.filter((p) => p.day === day) ?? [];

  return (
    <div>
      <PageHeader
        title="Week plan"
        subtitle="One grade taught directly each period, the others do guided work. You decide the final plan."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {meta && week && (
          <Segmented
            label="Week"
            value={week}
            onChange={(w) => { setWeek(w); setPlan(undefined); setFlash(null); setMoving(false); setPicked(null); }}
            options={[
              { value: meta.thisWeek, label: `This week · ${fmtWeek(meta.thisWeek)}` },
              { value: meta.nextWeek, label: `Next week · ${fmtWeek(meta.nextWeek)}` },
            ]}
          />
        )}
        {plan && (
          <span className={cx("rounded-full border px-3 py-1 text-sm", plan.status === "approved" ? "border-good/50 text-good" : "border-warn/50 text-warn")}>
            {plan.status === "approved" ? "Approved" : "Draft: not approved yet"}
          </span>
        )}
      </div>

      {plan === undefined && <Loading label="Loading plan…" />}

      {plan === null && (
        <Card className="max-w-xl">
          <CalendarPlus className="mb-3 size-8 text-accent" strokeWidth={1.5} aria-hidden />
          <h2 className="text-xl">No plan for this week yet</h2>
          <p className="mt-2 text-ink-2">
            Veda will build a draft from your syllabus, school hours and any alerts you accepted. Every lesson period, you teach one grade while the other two get clear self work, peer work or reading.
          </p>
          <Button variant="primary" size="lg" className="mt-5 w-full sm:w-auto" icon={<Wand2 className="size-5" aria-hidden />} loading={busy === "gen"} onClick={() => run("gen", () => generateWeek(week!), "Draft ready. Check it, move anything you like, then approve.")}>
            Generate my week
          </Button>
        </Card>
      )}

      {plan && (
        <>
          <div className="no-print mb-4 flex flex-wrap gap-2">
            <Button icon={<Wand2 className="size-5" aria-hidden />} loading={busy === "gen"} onClick={() => run("gen", () => generateWeek(week!), "New draft generated.")}>
              Generate my week
            </Button>
            <Button
              variant={moving ? "primary" : "secondary"}
              icon={<ArrowLeftRight className="size-5" aria-hidden />}
              onClick={() => { setMoving(!moving); setPicked(null); }}
            >
              {moving ? "Done moving" : "Move periods"}
            </Button>
            <Button icon={<CloudRain className="size-5" aria-hidden />} onClick={() => setReplanOpen(true)}>
              Replan
            </Button>
            <Button
              variant="primary"
              icon={<Check className="size-5" aria-hidden />}
              disabled={plan.status === "approved"}
              loading={busy === "approve"}
              onClick={() => run("approve", () => approveWeek(week!), "Plan approved. Today's screen now follows it.")}
              className="sm:ml-auto"
            >
              {plan.status === "approved" ? "Approved" : "Approve"}
            </Button>
          </div>

          {moving && (
            <div className="mb-4">
              <Notice>{picked ? "Now tap the period to swap it with." : "Tap a period, then tap another to swap them. On a computer you can also drag."}</Notice>
            </div>
          )}
          {flash && (
            <div className="mb-4">
              <Notice tone="good">{flash}</Notice>
            </div>
          )}

          {/* teacher time + why */}
          <div className="mb-6 grid gap-3 md:grid-cols-[auto_1fr]">
            <Card className="flex items-center gap-4">
              {([3, 4, 5] as const).map((g) => (
                <div key={g} className="text-center">
                  <GradeChip grade={g} />
                  <p className="mt-2 font-display text-xl font-bold">{Math.round(plan.teacherLedMinutes[g] / 60 * 10) / 10}h</p>
                  <p className="text-xs text-ink-3">with you</p>
                </div>
              ))}
            </Card>
            <Card>
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-2"><Info className="size-4 text-accent" aria-hidden /> Why this plan</p>
              <ul className="space-y-1 text-sm text-ink-3">
                {plan.notes.map((n, i) => <li key={i}>• {n}</li>)}
              </ul>
            </Card>
          </div>

          {/* legend */}
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-3">
            {(["teacher_led", "self_work", "peer_work", "reading"] as const).map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <span key={m} className={cx("flex items-center gap-1.5", m === "teacher_led" && "text-accent")}>
                  <Icon className="size-4" aria-hidden /> {m === "teacher_led" ? "Teacher-led" : m === "self_work" ? "Self work" : m === "peer_work" ? "Peer work" : "Reading"}
                </span>
              );
            })}
            <span className="flex items-center gap-1.5 text-accent"><Layers className="size-4" aria-hidden /> Merged cross-grade session</span>
          </div>

          {/* desktop: week grid */}
          <div className="hidden overflow-x-auto lg:block">
            <div className="grid min-w-[760px] grid-cols-[64px_repeat(5,1fr)] gap-2">
              <div />
              {DAYS.map((d) => (
                <div key={d.value} className="pb-1 text-center font-display text-sm font-bold text-ink-2">{d.label}</div>
              ))}
              {Array.from({ length: 7 }).map((_, idx) => (
                <WeekRow key={idx} idx={idx} plan={plan} picked={picked} dragId={dragId} setDragId={setDragId} onCell={onCell} onDrop={swap} />
              ))}
            </div>
          </div>

          {/* mobile: one day at a time */}
          <div className="lg:hidden">
            <div className="no-scrollbar mb-3 overflow-x-auto">
              <Segmented label="Day" value={day} onChange={setDay} options={DAYS} />
            </div>
            <div className="space-y-3">
              {dayPeriods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onCell(p)}
                  className={cx("block w-full rounded-2xl text-left", picked === p.id && "ring-2 ring-accent", moving && "cursor-pointer")}
                  aria-pressed={picked === p.id}
                >
                  <div className="relative">
                    {p.changed && <span className="absolute -top-1 right-3 z-10 rounded-full bg-accent px-2 text-[11px] font-semibold text-accent-ink">changed</span>}
                    <PeriodRow period={p} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {replanOpen && plan && (
        <ReplanDialog
          onClose={() => setReplanOpen(false)}
          onSubmit={async (reason, d, from) => {
            setReplanOpen(false);
            setDay(d);
            await run("replan", () => replanWeek(week!, { reason, day: d, fromPeriodIndex: from }), "Plan adjusted. Changed periods are marked. Approve when ready.");
          }}
        />
      )}
      {busy === "replan" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><Loading label="Replanning…" /></div>}
    </div>
  );
}

function WeekRow({
  idx, plan, picked, dragId, setDragId, onCell, onDrop,
}: {
  idx: number;
  plan: WeekPlan;
  picked: string | null;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onCell: (p: Period) => void;
  onDrop: (from: string, to: string) => void;
}) {
  const row = DAYS.map((d) => plan.periods.find((p) => p.day === d.value && p.index === idx));
  const first = row.find(Boolean);
  const brk = plan.breaks.find((b) => b.start === first?.end);
  return (
    <>
      <div className="pt-2 text-right text-xs tabular-nums text-ink-3">{first?.start}</div>
      {row.map((p, i) =>
        p ? (
          <button
            key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) onDrop(dragId, p.id); setDragId(null); }}
            onClick={() => onCell(p)}
            className={cx(
              "relative min-h-28 rounded-xl border p-2 text-left transition hover:border-ink-3",
              p.merged ? "border-accent/70 bg-accent/5" : "border-line bg-card",
              picked === p.id && "ring-2 ring-accent",
              dragId === p.id && "opacity-50",
            )}
            title={p.merged?.note}
          >
            {p.changed && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" aria-label="changed" />}
            <p className="mb-1.5 flex items-center gap-1 text-[13px] font-medium">
              {p.merged && <Layers className="size-3.5 text-accent" aria-hidden />}
              {p.slots[0].subject}
            </p>
            <div className="space-y-1">
              {p.slots.map((s) => {
                const Icon = MODE_ICON[s.mode];
                return (
                  <p key={s.grade} className={cx("flex items-center gap-1.5 text-xs", s.mode === "teacher_led" ? "text-accent" : "text-ink-3")} title={s.activity}>
                    <span className="w-5 font-display font-bold">G{s.grade}</span>
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{s.mode === "teacher_led" ? "Teacher" : s.mode === "self_work" ? "Self" : s.mode === "peer_work" ? "Peer" : "Reading"}</span>
                  </p>
                );
              })}
            </div>
          </button>
        ) : (
          <div key={i} />
        ),
      )}
      {brk && (
        <div className="col-span-6 py-1 text-center text-[11px] uppercase tracking-widest text-ink-3">
          {brk.label} · {brk.start}–{brk.end}
        </div>
      )}
    </>
  );
}

const REASONS: { value: ReplanReason; label: string; hint: string; icon: typeof CloudRain }[] = [
  { value: "rain_day", label: "Rain day", hint: "Children from far hamlets may not come. Revise instead of new topics.", icon: CloudRain },
  { value: "many_absent", label: "Many absent", hint: "Don't teach new topics today. Merge grades for revision.", icon: UserX },
  { value: "teacher_on_duty", label: "I'm on duty", hint: "Election, meeting or office work. Periods become self work; your teaching time moves to later days.", icon: ShieldAlert },
];

function ReplanDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (r: ReplanReason, day: number, from?: number) => void }) {
  const [reason, setReason] = useState<ReplanReason>("rain_day");
  const [day, setDay] = useState(3);
  const [from, setFrom] = useState(4);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Replan">
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-3xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl">What changed?</h2>
          <button onClick={onClose} className="flex size-12 items-center justify-center rounded-xl text-ink-2" aria-label="Close"><X className="size-6" aria-hidden /></button>
        </div>
        <div className="space-y-2">
          {REASONS.map(({ value, label, hint, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setReason(value)}
              aria-pressed={reason === value}
              className={cx("flex w-full items-start gap-3 rounded-2xl border p-3 text-left", reason === value ? "border-accent bg-accent/10" : "border-line")}
            >
              <Icon className={cx("mt-0.5 size-6 shrink-0", reason === value ? "text-accent" : "text-ink-3")} strokeWidth={1.75} aria-hidden />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-ink-3">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-5 mb-2 text-sm text-ink-2">Which day?</p>
        <Segmented label="Day" value={day} onChange={setDay} options={DAYS} />
        {reason === "teacher_on_duty" && (
          <>
            <p className="mt-5 mb-2 text-sm text-ink-2">From which period?</p>
            <Segmented label="From period" value={from} onChange={setFrom} options={[0, 1, 2, 3, 4, 5, 6].map((i) => ({ value: i, label: `P${i + 1}` }))} />
          </>
        )}
        <Button variant="primary" size="lg" className="mt-6 w-full" icon={<Wand2 className="size-5" aria-hidden />} onClick={() => onSubmit(reason, day, reason === "teacher_on_duty" ? from : undefined)}>
          Replan this week
        </Button>
      </div>
    </div>
  );
}
