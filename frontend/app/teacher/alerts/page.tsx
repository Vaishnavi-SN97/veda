"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Lightbulb, Pencil, X } from "lucide-react";
import { actOnAlert, getAlerts } from "@/lib/api";
import type { Alert } from "@/lib/types";
import { Button, Card, GradeChip, Loading, Notice, PageHeader, Segmented, cx } from "@/components/ui";
import { useLoad } from "@/components/useLoad";

// alerts whose suggestion asks the planner for extra teacher time
const PLAN_ALERTS = ["alert-ravi-fractions", "alert-g5-syllabus"];

export default function AlertsPage() {
  const { data: alerts, setData } = useLoad(getAlerts);
  const [tab, setTab] = useState<"open" | "handled">("open");
  const [done, setDone] = useState<Alert | null>(null);

  const shown = alerts?.filter((a) => (tab === "open" ? a.status === "open" : a.status !== "open")) ?? [];

  function replace(a: Alert) {
    setData((list) => list?.map((x) => (x.id === a.id ? a : x)) ?? null);
    if (a.status !== "open") setDone(a);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Alerts" subtitle="Early warnings with the reason and a next step. Nothing changes until you accept." />

      <div className="mb-5">
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: "open", label: `Open · ${alerts?.filter((a) => a.status === "open").length ?? 0}` },
            { value: "handled", label: "Handled" },
          ]}
        />
      </div>

      {done && (
        <div className="mb-5">
          <Notice tone={done.status === "accepted" ? "good" : "info"}>
            {done.status === "accepted" ? "Accepted" : "Dismissed"}: {done.title}.{" "}
            {done.status === "accepted" && PLAN_ALERTS.includes(done.id) && (
              <Link href="/teacher/planner?next=1" className="font-medium underline underline-offset-4">
                Next week&apos;s plan will include it.
              </Link>
            )}
          </Notice>
        </div>
      )}

      {!alerts ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Card className="text-center">
          <CheckCircle2 className="mx-auto mb-2 size-8 text-good" strokeWidth={1.5} aria-hidden />
          <p className="text-ink-2">{tab === "open" ? "All clear. No open alerts." : "Nothing handled yet."}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {shown.map((a) => <AlertCard key={a.id} alert={a} onChange={replace} />)}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert: a, onChange }: { alert: Alert; onChange: (a: Alert) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a.suggestion);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(kind: "accept" | "dismiss" | "edit") {
    setBusy(kind);
    const next = await actOnAlert(a.id, kind === "edit" ? { action: "edit", suggestion: draft } : { action: kind });
    onChange(next);
    setBusy(null);
    setEditing(false);
  }

  const changesPlan = PLAN_ALERTS.includes(a.id);

  return (
    <Card className={cx(a.status === "dismissed" && "opacity-60")}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={cx("mt-1 size-6 shrink-0", a.severity === "high" ? "text-bad" : a.severity === "medium" ? "text-warn" : "text-ink-3")} strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg leading-snug">{a.title}</h2>
            <GradeChip grade={a.grade} />
          </div>
          <p className="mt-1 text-xs uppercase tracking-wider text-ink-3">{a.severity} priority</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-ink-2">Why Veda noticed</p>
        <ul className="space-y-1.5 text-[15px] text-ink-2">
          {a.reasons.map((r, i) => (
            <li key={i} className="flex gap-2"><span className="text-ink-3">•</span><span>{r}</span></li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-accent"><Lightbulb className="size-4" aria-hidden /> Suggested next step</p>
        {editing ? (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-ink" aria-label="Edit suggestion" />
        ) : (
          <p className="text-[15px]">{a.suggestion}</p>
        )}
        {changesPlan && a.status === "open" && !editing && <p className="mt-2 text-xs text-ink-3">Accepting adds this to next week&apos;s plan.</p>}
      </div>

      {a.status === "open" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="primary" icon={<Check className="size-5" aria-hidden />} loading={busy === "edit"} onClick={() => act("edit")}>Save change</Button>
              <Button variant="ghost" onClick={() => { setEditing(false); setDraft(a.suggestion); }}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="primary" icon={<Check className="size-5" aria-hidden />} loading={busy === "accept"} onClick={() => act("accept")}>Accept</Button>
              <Button icon={<Pencil className="size-5" aria-hidden />} onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="ghost" icon={<X className="size-5" aria-hidden />} loading={busy === "dismiss"} onClick={() => act("dismiss")}>Dismiss</Button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={a.status === "accepted" ? "text-good" : "text-ink-3"}>{a.status === "accepted" ? "Accepted" : "Dismissed"}</span>
          {a.status === "accepted" && changesPlan && (
            <Link href="/teacher/planner?next=1" className="flex min-h-11 items-center gap-1 text-accent">
              See it in next week&apos;s plan <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
