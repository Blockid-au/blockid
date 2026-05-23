"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("blockid_theme");
    const prefersDark =
      saved === "dark" ||
      (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (prefersDark) {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("blockid_theme", next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 dark:text-ink-400 dark:hover:text-ink-200 dark:hover:bg-ink-800 transition-colors cursor-pointer"
    >
      {dark ? (
        <Sun strokeWidth={1.75} className="h-4 w-4" />
      ) : (
        <Moon strokeWidth={1.75} className="h-4 w-4" />
      )}
    </button>
  );
}
