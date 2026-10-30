"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Gauge, LogOut, Moon, RotateCcw, Sun, SunDim } from "lucide-react";
import { signOut } from "next-auth/react";
import { resetDemo } from "@/lib/api";
import { THEMES, setTheme, useTheme, type Theme } from "./theme";
import { cx } from "./ui";
import { useMeta, useSession } from "./useMeta";

const ICON: Record<Theme, typeof Sun> = { light: Sun, medium: SunDim, dark: Moon };

/** Top-bar menu: Bright / Medium / Dark theme, plus demo reset. */
export function SettingsMenu() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const meta = useMeta();
  const session = useSession();
  const DEMO_MODE = !!meta?.demoMode;
  const Current = ICON[theme];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Display: ${THEMES.find((t) => t.value === theme)!.label}. Change theme`}
        className="flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-raised hover:text-ink"
      >
        <Current className="size-5" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-line bg-card p-2 shadow-xl shadow-black/30">
          <p className="px-3 pt-1 pb-2 text-xs uppercase tracking-wider text-ink-3">Display</p>
          {THEMES.map(({ value, label }) => {
            const Icon = ICON[value];
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={theme === value}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                className={cx("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left", theme === value ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised")}
              >
                <Icon className="size-5" aria-hidden />
                <span className="flex-1">{label}</span>
                {theme === value && <Check className="size-4 text-accent" aria-hidden />}
              </button>
            );
          })}
          <div className="my-2 border-t border-line" />
          <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-ink-2 hover:bg-raised">
            <Gauge className="size-5" aria-hidden />
            AI usage
          </Link>
          {!DEMO_MODE && session?.user && (
            <>
              <div className="my-2 border-t border-line" />
              <p className="truncate px-3 pb-1 text-xs text-ink-3">Signed in as {session.user.email ?? session.user.name}</p>
              <button role="menuitem" onClick={() => signOut({ callbackUrl: "/" })} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-ink-2 hover:bg-raised">
                <LogOut className="size-5" aria-hidden />
                Sign out
              </button>
            </>
          )}
          {DEMO_MODE && (
            <>
              <button
                role="menuitem"
                disabled={resetting}
                onClick={async () => {
                  if (!confirm("Reset the demo to its starting data? Everything done in the demo is cleared.")) return;
                  setResetting(true);
                  try {
                    await resetDemo();
                    window.location.reload();
                  } catch {
                    setResetting(false);
                  }
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-ink-2 hover:bg-raised disabled:opacity-60"
              >
                <RotateCcw className={cx("size-5", resetting && "animate-spin")} aria-hidden />
                {resetting ? "Resetting… (about 30 s)" : "Reset demo data"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
