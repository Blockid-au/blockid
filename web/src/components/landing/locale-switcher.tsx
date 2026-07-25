"use client";

/**
 * LocaleSwitcher — compact "EN | VI" toggle rendered in the primary nav.
 *
 * Behaviour (T-1403 update — runtime DOM translation):
 *   - Clicking a code sets the `blockid_locale` cookie (365 days, Lax,
 *     Secure, path=/) so the proxy pins the choice on every subsequent
 *     request.
 *   - Then calls `router.refresh()` — the URL stays put and the
 *     `TranslationProvider` in the root layout picks up the new locale
 *     header from the proxy and translates the DOM in place. This
 *     avoids 404s on the 253 pages that don't have a `/vi/*` mirror.
 *   - Legacy: `/vi/*` mirror pages still exist for the two SEO-priority
 *     surfaces (home + pricing) and remain reachable by direct link.
 *   - The currently-active locale renders as a non-interactive `<span>` so
 *     screen readers announce the selected state via `aria-current`.
 *   - Rendered at every viewport so mobile users can toggle too — the
 *     previous `hidden md:inline-flex` hid the control on phones.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  LOCALES,
  LOCALE_COOKIE,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
} from "@/lib/i18n/locales";

const LABELS: Readonly<Record<Locale, string>> = {
  en: "EN",
  vi: "VI",
};

function setLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

function readCookieLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const cookie = document.cookie.split(";").find((c) =>
    c.trim().startsWith(`${LOCALE_COOKIE}=`),
  );
  if (!cookie) return DEFAULT_LOCALE;
  const value = cookie.split("=")[1]?.trim() ?? "";
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function LocaleSwitcher() {
  const router = useRouter();
  const [current, setCurrent] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setCurrent(readCookieLocale());
  }, []);

  const onPick = useCallback(
    (target: Locale) => {
      setLocaleCookie(target);
      setCurrent(target);
      // T-1403.11: signed-in users also persist to founder_profiles so
      // the choice survives cookie clears + follows them across devices.
      // Anonymous callers get a soft 204 — cookie already handles them.
      void fetch("/api/founder-profile/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: target }),
        cache: "no-store",
        credentials: "same-origin",
      }).catch(() => {});
      // Runtime DOM walker in <TranslationProvider> reads the locale
      // header on the next render — refresh (not push) so we don't
      // 404 on pages that lack a `/vi/*` mirror.
      router.refresh();
    },
    [router],
  );

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1 py-0.5 text-xs font-semibold text-brand-ink-muted"
      data-i18n-skip
    >
      {LOCALES.map((code, i) => {
        const active = code === current;
        const cls = active
          ? "rounded-full bg-brand-cyan px-2 py-1 text-brand-navy"
          : "rounded-full px-2 py-1 hover:text-brand-ink";
        return (
          <span key={code} className="contents">
            {active ? (
              <span
                aria-current="true"
                className={cls}
              >
                {LABELS[code]}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onPick(code)}
                className={`${cls} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan`}
              >
                {LABELS[code]}
              </button>
            )}
            {i === 0 ? (
              <span aria-hidden="true" className="text-white/20">
                |
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export default LocaleSwitcher;
