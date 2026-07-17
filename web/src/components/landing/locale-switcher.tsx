"use client";

/**
 * LocaleSwitcher — compact "EN | VI" toggle rendered in the primary nav.
 *
 * Behaviour:
 *   - Clicking a code sets the `blockid_locale` cookie (365 days, Lax,
 *     Secure, path=/) so the proxy pins the choice on every subsequent
 *     request.
 *   - Then navigates to the mirror path — `/pricing` becomes `/vi/pricing`
 *     and vice versa — preserving query string + hash.
 *   - The currently-active locale renders as a non-interactive `<span>` so
 *     screen readers announce the selected state via `aria-current`.
 *   - No client-side i18n framework; label strings are inlined ASCII
 *     (EN/VI) so the component is safe to render before catalogs load.
 *
 * Mount point (T-1400): `NavV2`, right of the Docs dropdown, left of
 * "Sign in".
 */

import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  LOCALES,
  LOCALE_COOKIE,
  localeFromPath,
  toLocalePath,
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

export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { locale: current, rest } = localeFromPath(pathname);

  const onPick = useCallback(
    (target: Locale) => {
      setLocaleCookie(target);
      if (target === current) {
        // Cookie updated but no navigation needed.
        router.refresh();
        return;
      }
      router.push(toLocalePath(rest, target));
    },
    [current, rest, router],
  );

  return (
    <div
      role="group"
      aria-label="Language"
      className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1 py-0.5 text-xs font-semibold text-brand-ink-muted md:inline-flex"
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
