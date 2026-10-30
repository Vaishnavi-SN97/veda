"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { Grade, SlotMode, StudentTag } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("print-card rounded-2xl border border-line bg-card p-4 sm:p-5", className)} {...p} />;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 border-transparent",
  secondary: "bg-raised text-ink border-line hover:border-ink-3",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-raised",
  danger: "bg-transparent text-bad border-line hover:border-bad",
};

interface BtnProps extends ComponentProps<"button"> {
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
  size?: "md" | "lg";
}

export function Button({ variant = "secondary", icon, loading, size = "md", className, children, disabled, ...p }: BtnProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]",
        size === "lg" ? "min-h-14 px-5 text-base" : "min-h-12 px-4 text-[15px]",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...p}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "secondary", icon, className, children, ...p }: ComponentProps<typeof Link> & { variant?: Variant; icon?: ReactNode }) {
  return (
    <Link
      className={cx(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-[15px] font-medium transition active:scale-[0.98]",
        variants[variant],
        className,
      )}
      {...p}
    >
      {icon}
      {children}
    </Link>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm uppercase tracking-[0.14em] text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

export function GradeChip({ grade, className }: { grade: Grade; className?: string }) {
  return (
    <span className={cx("inline-flex h-7 min-w-11 items-center justify-center rounded-lg border border-line px-2 font-display text-sm font-bold text-ink", className)}>
      G{grade}
    </span>
  );
}

/** Segmented control; every option is a full tap target. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-card p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-11 min-w-12 rounded-lg px-3 text-[15px] font-medium transition",
            o.value === value ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GradePicker({ value, onChange }: { value: Grade; onChange: (g: Grade) => void }) {
  return (
    <Segmented
      label="Grade"
      value={value}
      onChange={onChange}
      options={[3, 4, 5].map((g) => ({ value: g as Grade, label: `Grade ${g}` }))}
    />
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-raised", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-ink-2" role="status">
      <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-raised", className)} />;
}

const TAGS: Record<StudentTag, { label: string; className: string }> = {
  on_track: { label: "On track", className: "text-good border-good/40" },
  didnt_study: { label: "Didn't study", className: "text-warn border-warn/40" },
  studied_but_confused: { label: "Studied but confused", className: "text-bad border-bad/40" },
};

export function TagChip({ tag }: { tag: StudentTag }) {
  const t = TAGS[tag];
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", t.className)}>{t.label}</span>;
}

export const MODE_LABEL: Record<SlotMode, string> = {
  teacher_led: "Teacher-led",
  self_work: "Self work",
  peer_work: "Peer work",
  reading: "Reading",
};

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "good" }) {
  return (
    <div
      role="status"
      className={cx(
        "rounded-xl border px-4 py-3 text-[15px]",
        tone === "good" ? "border-good/40 bg-good/10 text-good" : "border-accent/40 bg-accent/10 text-ink",
      )}
    >
      {children}
    </div>
  );
}
