"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, LogIn, WifiOff, X } from "lucide-react";
import { signIn } from "next-auth/react";
import { API_ERROR_EVENT, OFFLINE_EVENT, flushQuizOutbox } from "@/lib/api";
import { Button } from "./ui";

const SIGN_IN_CODES = new Set(["google_expired", "signed_out", "google_permission"]);

/** Kind error banner for failed API calls + a small "offline" pill when showing saved data. */
export function ApiStatus() {
  const [err, setErr] = useState<{ message: string; code?: string } | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const onError = (e: Event) => setErr((e as CustomEvent<{ message: string; code?: string }>).detail);
    const onOffline = (e: Event) => setOffline((e as CustomEvent<boolean>).detail);
    const goneOffline = () => setOffline(true);
    const backOnline = () => {
      setOffline(false);
      void flushQuizOutbox(); // quizzes finished offline go now
    };
    window.addEventListener(API_ERROR_EVENT, onError);
    window.addEventListener(OFFLINE_EVENT, onOffline);
    window.addEventListener("offline", goneOffline);
    window.addEventListener("online", backOnline);
    if (navigator.onLine) void flushQuizOutbox();
    return () => {
      window.removeEventListener(API_ERROR_EVENT, onError);
      window.removeEventListener(OFFLINE_EVENT, onOffline);
      window.removeEventListener("offline", goneOffline);
      window.removeEventListener("online", backOnline);
    };
  }, []);

  return (
    <>
      {offline && (
        <div role="status" className="no-print fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-warn/60 bg-card px-4 py-2 text-sm shadow-lg shadow-black/30">
          <WifiOff className="size-4 text-warn" aria-hidden /> Offline: showing saved data
        </div>
      )}
      {err && (
        <div role="alert" className="no-print fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-bad/60 bg-card p-4 shadow-xl shadow-black/40 lg:bottom-6">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />
          <div className="flex-1">
            <p className="text-[15px]">{err.message}</p>
            {err.code && SIGN_IN_CODES.has(err.code) && (
              <Button variant="primary" className="mt-3" icon={<LogIn className="size-5" aria-hidden />} onClick={() => signIn("google")}>
                Sign in again
              </Button>
            )}
          </div>
          <button onClick={() => setErr(null)} className="-m-2 flex size-11 items-center justify-center rounded-xl text-ink-3" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
