"use client";

// Which child is using the shared family phone right now. Session-only on purpose:
// closing the tab "logs out", so the next sibling picks their own picture.

import { useMemo, useSyncExternalStore } from "react";
import type { Student } from "@/lib/types";

const KEY = "veda-student";
const EVENT = "veda-student-change";
const ON_SERVER = "\u0000server";

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function setStudent(s: Student | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: the child will just pick their picture again
  }
  window.dispatchEvent(new Event(EVENT));
}

/** undefined until the browser has been read, null when nobody is signed in. */
export function useStudent(): Student | null | undefined {
  const raw = useSyncExternalStore(subscribe, read, () => ON_SERVER);
  return useMemo(() => {
    if (raw === ON_SERVER) return undefined;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Student;
    } catch {
      return null;
    }
  }, [raw]);
}
