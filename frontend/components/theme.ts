"use client";

import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_STORAGE_KEY } from "./themeScript";

export type Theme = keyof typeof THEME_COLORS;

export const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Bright" },
  { value: "medium", label: "Medium" },
  { value: "dark", label: "Dark" },
];

const EVENT = "veda-theme-change";

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[t]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    // storage blocked: theme still applies for this visit
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme as Theme) ?? "dark",
    () => "dark",
  );
}
