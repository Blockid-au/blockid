"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

/** localStorage key — `"dark"` is the ONLY value that changes anything. */
export const THEME_STORAGE_KEY = "blockid_theme";

/**
 * Apply / clear the explicit dark opt-in on <html>. Both the legacy `.dark`
 * class and `data-theme="dark"` are set so the globals.css dark scope, the
 * report theme contract and the `dark:` variant agree.
 */
export function applyExplicitTheme(dark: boolean): void {
  const el = document.documentElement;
  if (dark) {
    el.classList.add("dark");
    el.setAttribute("data-theme", "dark");
  } else {
    el.classList.remove("dark");
    el.removeAttribute("data-theme");
  }
}

/**
 * G26: light is the only default. The server renders light, the first paint
 * is light (no inline script, no OS-preference sniffing), and the stored
 * preference is applied after hydration ONLY when the user explicitly chose
 * dark. Choosing light again clears the opt-in rather than storing a value.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (saved === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration read of localStorage theme; a lazy initialiser would mismatch the server render
      setDark(true);
      applyExplicitTheme(true);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    applyExplicitTheme(next);
    try {
      if (next) localStorage.setItem(THEME_STORAGE_KEY, "dark");
      else localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* private mode — the choice lasts for the session only */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
    >
      {dark ? (
        <Sun strokeWidth={1.75} className="h-4 w-4" />
      ) : (
        <Moon strokeWidth={1.75} className="h-4 w-4" />
      )}
    </button>
  );
}
