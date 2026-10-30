"use client";

import { BookOpen, Layers, PencilLine, Presentation, Users } from "lucide-react";
import type { GradeSlot, Period, SlotMode } from "@/lib/types";
import { MODE_LABEL, cx } from "./ui";

export const MODE_ICON: Record<SlotMode, typeof Presentation> = {
  teacher_led: Presentation,
  self_work: PencilLine,
  peer_work: Users,
  reading: BookOpen,
};

export function SlotPill({ slot, compact }: { slot: GradeSlot; compact?: boolean }) {
  const Icon = MODE_ICON[slot.mode];
  const led = slot.mode === "teacher_led";
  return (
    <div
      className={cx(
        "flex min-w-0 items-start gap-2 rounded-xl border px-2.5 py-2",
        led ? "border-accent/60 bg-accent/10" : "border-line bg-bg/40",
      )}
      title={slot.activity}
    >
      <span className="mt-0.5 font-display text-xs font-bold text-ink-3">G{slot.grade}</span>
      <div className="min-w-0">
        <div className={cx("flex items-center gap-1 text-[13px] font-medium", led ? "text-accent" : "text-ink-2")}>
          <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {MODE_LABEL[slot.mode]}
        </div>
        {!compact && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{slot.activity}</p>}
      </div>
    </div>
  );
}

export function PeriodRow({ period }: { period: Period }) {
  const subject = period.slots[0]?.subject;
  return (
    <div className={cx("rounded-2xl border p-3", period.merged ? "border-accent/70 bg-accent/5" : "border-line bg-card")}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-sm font-bold tabular-nums text-ink-2">
          {period.start}–{period.end}
        </span>
        <span className="font-medium">{subject}</span>
        {period.merged && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/60 px-2 py-0.5 text-xs text-accent">
            <Layers className="size-3.5" aria-hidden /> Merged: {period.merged.chapter}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {period.slots.map((s) => (
          <SlotPill key={s.grade} slot={s} />
        ))}
      </div>
    </div>
  );
}
