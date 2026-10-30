"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Presentation } from "lucide-react";
import { SettingsMenu } from "./SettingsMenu";
import { cx } from "./ui";
import { useMeta } from "./useMeta";

/** Top bar: demo badge + teacher/student switch (demo only), and the display menu (always). */
export function DemoBanner() {
  const path = usePathname();
  const meta = useMeta();
  const DEMO_MODE = !!meta?.demoMode;
  const role = path.startsWith("/student") ? "student" : path.startsWith("/teacher") ? "teacher" : null;

  return (
    <div className="no-print sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
        {DEMO_MODE && (
          <>
            <span className="rounded-md border border-accent/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Demo</span>
            <nav aria-label="Switch demo view" className="ml-auto flex rounded-xl border border-line p-0.5">
              <Link
                href="/teacher"
                className={cx("flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", role === "teacher" ? "bg-accent text-accent-ink" : "text-ink-2")}
              >
                <Presentation className="size-4" aria-hidden /> Teacher
              </Link>
              <Link
                href="/student"
                className={cx("flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", role === "student" ? "bg-accent text-accent-ink" : "text-ink-2")}
              >
                <GraduationCap className="size-4" aria-hidden /> Student
              </Link>
            </nav>
          </>
        )}
        <div className={cx(!DEMO_MODE && "ml-auto")}>
          <SettingsMenu />
        </div>
      </div>
    </div>
  );
}
