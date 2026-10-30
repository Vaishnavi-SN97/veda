import type { ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { TeacherNav } from "@/components/TeacherNav";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1">
      <TeacherNav />
      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}
