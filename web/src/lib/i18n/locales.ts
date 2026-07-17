/**
 * Locale registry for BlockID.au (T-1400).
 *
 * Path-based i18n on Next 16 App Router: URL prefix `/vi/*` is the
 * canonical Vietnamese surface. All other paths default to English.
 *
 * See docs/goal-5d-t1400-i18n-notes.md for the routing model and the
 * procedure for adding a new locale.
 */

export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Runtime type guard so untrusted strings (cookies, query params, headers)
 * can be narrowed to a valid `Locale` before use.
 */
export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x);
}

/**
 * Splits a pathname into `{ locale, rest }`.
 *
 * Examples:
 *   "/"            → { locale: "en", rest: "/" }
 *   "/pricing"     → { locale: "en", rest: "/pricing" }
 *   "/vi"          → { locale: "vi", rest: "/" }
 *   "/vi/"         → { locale: "vi", rest: "/" }
 *   "/vi/pricing"  → { locale: "vi", rest: "/pricing" }
 *
 * The `rest` value is the corresponding EN path — used by the locale
 * switcher to build the mirror URL for the opposite locale.
 */
export function localeFromPath(pathname: string): {
  locale: Locale;
  rest: string;
} {
  if (typeof pathname !== "string" || pathname.length === 0) {
    return { locale: DEFAULT_LOCALE, rest: "/" };
  }

  for (const code of LOCALES) {
    if (code === DEFAULT_LOCALE) continue;
    if (pathname === `/${code}`) {
      return { locale: code, rest: "/" };
    }
    if (pathname.startsWith(`/${code}/`)) {
      const rest = pathname.slice(code.length + 1); // drop "/<code>"
      return { locale: code, rest: rest.length === 0 ? "/" : rest };
    }
  }

  return { locale: DEFAULT_LOCALE, rest: pathname };
}

/**
 * Build the mirror path for a target locale, given the current EN-shape
 * `rest` (i.e. what `localeFromPath` returned).
 *
 *   toLocalePath("/pricing", "vi") → "/vi/pricing"
 *   toLocalePath("/pricing", "en") → "/pricing"
 *   toLocalePath("/",        "vi") → "/vi"
 */
export function toLocalePath(rest: string, target: Locale): string {
  const clean = rest.startsWith("/") ? rest : `/${rest}`;
  if (target === DEFAULT_LOCALE) return clean;
  if (clean === "/") return `/${target}`;
  return `/${target}${clean}`;
}

/**
 * Cookie name that overrides path detection for a session — user preference
 * beats URL prefix so a VI user landing on an EN inbound link still sees VI.
 */
export const LOCALE_COOKIE = "blockid_locale";

/**
 * Request/response header carrying the resolved locale from the proxy down
 * to server components (read via `headers()`).
 */
export const LOCALE_HEADER = "x-blockid-locale";
