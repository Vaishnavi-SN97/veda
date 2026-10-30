"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { getClass } from "@/lib/api";
import { Button, Card, Loading } from "./ui";
import { useMeta, useSession } from "./useMeta";

/** Teacher pages: demo mode needs nothing; real mode needs Google sign-in and a finished class setup. */
export function AuthGate({ children }: { children: ReactNode }) {
  const meta = useMeta();
  const session = useSession();
  const path = usePathname();
  const router = useRouter();
  const [setupChecked, setSetupChecked] = useState(false);

  const real = meta && !meta.demoMode;
  const signedIn = !!session?.user;

  useEffect(() => {
    if (!real || !signedIn || setupChecked) return;
    getClass()
      .then((c) => {
        if (!c.setupComplete && !path.startsWith("/teacher/setup")) router.replace("/teacher/setup");
      })
      .catch(() => {})
      .finally(() => setSetupChecked(true));
  }, [real, signedIn, setupChecked, path, router]);

  if (!meta) return <Loading />;
  if (meta.demoMode) return <>{children}</>;
  if (session === undefined) return <Loading label="Checking your sign-in…" />;
  if (!signedIn || session?.error) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Card className="p-6 text-center">
          <Image src="/logo.png" alt="" width={186} height={190} className="mx-auto mb-4 size-16 rounded-full" />
          <h1 className="text-2xl">Sign in to Veda</h1>
          <p className="mt-2 text-ink-2">
            {session?.error ? "Your Google sign-in has expired." : "Use your school Google account."} Veda reads your Google Classroom courses and students, and posts revision cards and quizzes for you.
          </p>
          <Button variant="primary" size="lg" className="mt-6 w-full" icon={<LogIn className="size-5" aria-hidden />} onClick={() => signIn("google")}>
            Sign in with Google
          </Button>
          <p className="mt-4 text-xs text-ink-3">Tick every Google Classroom box on the next screen so Veda can help.</p>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
