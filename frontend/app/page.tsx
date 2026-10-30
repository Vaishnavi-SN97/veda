import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GraduationCap, Presentation } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-10 flex items-center gap-4">
        <Image src="/logo.png" alt="Veda logo" width={186} height={190} priority className="h-[74px] w-[72px] rounded-full" />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-3">Teacher-led feedback loop for multi-grade learning</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">
            <span className="text-accent">VEDA</span> RURALCLASS
          </h1>
        </div>
      </div>
      <p className="mb-8 max-w-xl text-lg text-ink-2">
        One room, one teacher, three grades. Veda plans the week, sends revision home the moment a topic is done, and flags who needs help early.
        <span className="text-ink"> AI suggests, the teacher decides.</span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/teacher" className="group rounded-3xl border border-line bg-card p-6 transition hover:border-accent">
          <Presentation className="mb-6 size-9 text-accent" strokeWidth={1.5} aria-hidden />
          <h2 className="text-xl">I&apos;m the teacher</h2>
          <p className="mt-1 text-ink-2">Plan the week, attendance, marks, alerts.</p>
          <span className="mt-6 inline-flex items-center gap-1 text-accent">
            Open teacher portal <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>
        <Link href="/student" className="group rounded-3xl border border-line bg-card p-6 transition hover:border-accent">
          <GraduationCap className="mb-6 size-9 text-accent" strokeWidth={1.5} aria-hidden />
          <h2 className="text-xl">I&apos;m a student</h2>
          <p className="mt-1 text-ink-2">Today&apos;s cards, quiz, and Vidya the tutor.</p>
          <span className="mt-6 inline-flex items-center gap-1 text-accent">
            Pick your picture <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>
      </div>
      <p className="mt-10 text-sm text-ink-3">Team MergeMates · Shravya, Vaishnavi, Chethana</p>
    </main>
  );
}
