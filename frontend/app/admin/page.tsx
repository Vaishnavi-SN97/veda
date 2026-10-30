"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getAiUsage } from "@/lib/api";
import { Button, Card, Loading, Progress, SectionTitle, cx } from "@/components/ui";
import { useLoad } from "@/components/useLoad";

function time(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminPage() {
  const { data: u, reload } = useLoad(getAiUsage);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-16 sm:px-6">
      <Link href="/teacher" className="mb-4 inline-flex min-h-11 items-center gap-1 text-accent">
        <ArrowLeft className="size-5" aria-hidden /> Back to Veda
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">AI usage</h1>
          <p className="mt-1 text-ink-2">Every Sarvam call is logged with an estimated cost. Cached results are free.</p>
        </div>
        <Button icon={<RefreshCw className="size-5" aria-hidden />} onClick={reload}>Refresh</Button>
      </div>

      {!u ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <p className="font-display text-4xl font-bold text-accent">{u.totalCalls}</p>
              <p className="mt-1 text-sm text-ink-3">Sarvam calls so far</p>
            </Card>
            <Card>
              <p className="font-display text-3xl font-bold">₹{u.estCostInr.toFixed(2)}</p>
              <p className="mt-1 text-sm text-ink-3">estimated spend</p>
            </Card>
            <Card>
              <p className="font-display text-3xl font-bold">{u.cacheHits}</p>
              <p className="mt-1 text-sm text-ink-3">served from cache (free)</p>
            </Card>
            <Card>
              <p className={cx("font-display text-3xl font-bold", u.failedCalls ? "text-warn" : "")}>{u.failedCalls}</p>
              <p className="mt-1 text-sm text-ink-3">failed calls</p>
            </Card>
          </div>

          <Card>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-ink-2">Budget</span>
              <span>
                ₹{u.estCostInr.toFixed(2)} of ₹{u.budgetInr} · <span className="text-ink-3">{Math.max(0, u.budgetInr - u.estCostInr).toFixed(2)} left</span>
              </span>
            </div>
            <Progress value={(u.estCostInr / u.budgetInr) * 100} />
            <p className="mt-3 text-sm text-ink-3">
              Sarvam is <b className={u.sarvamEnabled ? "text-good" : "text-warn"}>{u.sarvamEnabled ? "on" : "off"}</b> · voice:{" "}
              <b className="text-ink-2">{u.voiceProvider}</b> · {u.placeholders} placeholder answers used instead of AI. Estimates use pay-as-you-go prices; check the Sarvam dashboard for the exact bill.
            </p>
          </Card>

          <Card className="overflow-x-auto">
            <SectionTitle>By model</SectionTitle>
            <table className="w-full text-left text-sm">
              <thead className="text-ink-3">
                <tr><th className="py-2 font-normal">Model</th><th className="py-2 text-right font-normal">Calls</th><th className="py-2 text-right font-normal">Failed</th><th className="py-2 text-right font-normal">Est. ₹</th></tr>
              </thead>
              <tbody>
                {u.byModel.map((r) => (
                  <tr key={r.model} className="border-t border-line">
                    <td className="py-2.5 font-mono text-[13px]">{r.model}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.calls}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink-3">{r.failed}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.estCostInr.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto p-0 sm:p-0">
            <div className="px-4 pt-4 sm:px-5"><SectionTitle>Recent calls</SectionTitle></div>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-ink-3">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-normal sm:px-5">When</th>
                  <th className="px-2 py-2 font-normal">What</th>
                  <th className="px-2 py-2 text-right font-normal">Tokens / chars</th>
                  <th className="px-2 py-2 text-right font-normal">Time</th>
                  <th className="px-4 py-2 text-right font-normal sm:px-5">Est. ₹</th>
                </tr>
              </thead>
              <tbody>
                {u.recent.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-3 sm:px-5">{time(r.createdAt)}</td>
                    <td className="px-2 py-2.5">
                      <span className="font-mono text-[12px] text-ink-3">{r.model}</span>
                      <br />
                      {r.purpose}
                      {!r.ok && <span className="block text-xs text-bad">{r.error}</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-ink-2">
                      {r.inputTokens != null ? `${r.inputTokens} → ${r.outputTokens}` : r.audioSeconds ? `${r.audioSeconds}s audio` : `${r.inputChars} chars`}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-ink-3">{r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : ""}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">{r.estCostInr.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </main>
  );
}
