"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  BookCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  Menu,
  Settings,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { cx } from "./ui";

const ITEMS = [
  { href: "/teacher", label: "Today", icon: Home },
  { href: "/teacher/planner", label: "Week plan", icon: CalendarDays },
  { href: "/teacher/attendance", label: "Attendance", icon: UserCheck },
  { href: "/teacher/topic-done", label: "Topic done", icon: BookCheck },
  { href: "/teacher/marks", label: "Marks", icon: ClipboardList },
  { href: "/teacher/students", label: "Students", icon: Users },
  { href: "/teacher/alerts", label: "Alerts", icon: Bell },
  { href: "/teacher/reports", label: "Reports", icon: FileText },
  { href: "/teacher/setup", label: "Class setup", icon: Settings },
];

const BOTTOM = ["/teacher", "/teacher/planner", "/teacher/attendance", "/teacher/alerts"];

function isActive(path: string, href: string) {
  return href === "/teacher" ? path === href : path.startsWith(href);
}

export function TeacherNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* desktop sidebar */}
      <aside className="no-print hidden w-60 shrink-0 border-r border-line lg:block">
        <div className="sticky top-14 p-4">
          <Link href="/teacher" className="mb-6 flex items-center gap-3 px-2">
            <Image src="/logo.png" alt="" width={186} height={190} className="size-11 rounded-full" />
            <span className="font-display text-lg font-bold">
              <span className="text-accent">VEDA</span> RuralClass
            </span>
          </Link>
          <nav aria-label="Teacher" className="flex flex-col gap-1">
            {ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] transition",
                  isActive(path, href) ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
                )}
              >
                <Icon className={cx("size-5", isActive(path, href) && "text-accent")} strokeWidth={1.75} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      {/* mobile bottom bar */}
      <nav aria-label="Teacher" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {ITEMS.filter((i) => BOTTOM.includes(i.href)).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cx("flex min-h-16 flex-col items-center justify-center gap-1 text-xs", isActive(path, href) ? "text-accent" : "text-ink-3")}
            >
              <Icon className="size-6" strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          ))}
          <button onClick={() => setOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs text-ink-3" aria-haspopup="dialog">
            <Menu className="size-6" strokeWidth={1.75} aria-hidden />
            More
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg">All screens</h2>
              <button onClick={() => setOpen(false)} className="flex size-12 items-center justify-center rounded-xl text-ink-2" aria-label="Close">
                <X className="size-6" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-sm",
                    isActive(path, href) ? "border-accent text-accent" : "border-line text-ink-2",
                  )}
                >
                  <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
