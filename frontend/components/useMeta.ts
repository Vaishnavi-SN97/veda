"use client";

import { useEffect, useState } from "react";
import { getMeta } from "@/lib/api";
import type { Meta } from "@/lib/types";

/** Server facts (demo mode, today, voice provider). null until loaded. */
export function useMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    getMeta().then(setMeta).catch(() => {});
  }, []);
  return meta;
}

export interface SessionInfo {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  error?: string;
}

/** NextAuth session (name/email only; tokens never reach the browser). undefined while loading. */
export function useSession(): SessionInfo | null | undefined {
  const [s, setS] = useState<SessionInfo | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: SessionInfo | null) => setS(j && j.user ? j : null))
      .catch(() => setS(null));
  }, []);
  return s;
}
