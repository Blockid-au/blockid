"use client";

import { useSyncExternalStore, useCallback } from "react";

export type Locale = "en" | "vi";

function readCookie(): Locale {
  if (typeof document === "undefined") return "en";
  return document.cookie.match(/blockid_lang=(\w+)/)?.[1] === "vi" ? "vi" : "en";
}

function subscribe(cb: () => void) {
  // Re-check on storage/cookie changes
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getSnapshot(): Locale {
  return readCookie();
}

function getServerSnapshot(): Locale {
  return "en";
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((l: Locale) => {
    document.cookie = `blockid_lang=${l};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
    // Force re-render by dispatching storage event
    window.dispatchEvent(new Event("storage"));
  }, []);

  return [locale, setLocale];
}
