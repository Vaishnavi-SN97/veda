"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import type { Student } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Loading, cx } from "./ui";
import { setStudent, useStudent } from "./studentSession";

/** Wraps signed-in student screens: sends anyone without a profile back to the picker. */
export function StudentShell({ children }: { children: (s: Student) => ReactNode }) {
  const student = useStudent();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (student === null) router.replace("/student");
  }, [student, router]);

  if (!student) return <Loading />;

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <Avatar picture={student.avatar} />
        <div className="flex-1">
          <p className="font-display text-xl font-bold">Hi, {student.name}!</p>
          <p className="text-sm text-ink-3">Grade {student.grade}</p>
        </div>
        <button
          onClick={() => {
            setStudent(null);
            router.push("/student");
          }}
          className="min-h-11 rounded-xl border border-line px-3 text-sm text-ink-2"
        >
          Not you?
        </button>
      </div>
      {children(student)}
      <nav aria-label="Student" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-2">
          {[
            { href: "/student/today", label: "New today", icon: Sparkles },
            { href: "/student/vidya", label: "Ask Vidya", icon: MessageCircle },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cx("flex min-h-16 flex-col items-center justify-center gap-1 text-sm", path === href ? "text-accent" : "text-ink-3")}>
              <Icon className="size-6" strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
