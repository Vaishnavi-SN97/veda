// Plain module (no "use client") so the server layout can inline the string.
export const THEME_STORAGE_KEY = "veda-theme";

export const THEME_COLORS = { light: "#F7F5F1", medium: "#26252C", dark: "#0B0A0C" } as const;

// Runs in <head> before first paint so the saved theme never flashes the wrong colours.
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="medium"||t==="dark"){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(THEME_COLORS)}[t])}}catch(e){}`;
