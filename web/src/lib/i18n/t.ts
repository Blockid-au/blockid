/**
 * Translation helpers for BlockID.au i18n (T-1400).
 *
 * Two entry points:
 *   - `getMessages(locale)` — async, server-side. Reads the JSON catalog for
 *     `locale` and returns a flat `Record<string, string>`.
 *   - `t(messages, key, fallback?)` — sync lookup. Returns the mapped string,
 *     the explicit fallback, or the key itself (never `undefined`) so a
 *     missing translation degrades to a visible token rather than a crash.
 *
 * We intentionally use static imports (not `fs.readFile`) so the catalog
 * ships in the Server Component bundle without any runtime file I/O — the
 * JSON is tree-shaken per-locale at build time.
 */

import type { Locale } from "./locales";
import { DEFAULT_LOCALE, isLocale } from "./locales";
import { fillEntityTokens } from "@/lib/site/legal-entity";
import en from "./messages/en.json";
import vi from "./messages/vi.json";

export type Messages = Record<string, string>;

const CATALOG: Readonly<Record<Locale, Messages>> = {
  en: en as Messages,
  vi: vi as Messages,
};

/**
 * Async so callers can `await getMessages(locale)` from an async Server
 * Component; the promise resolves synchronously because the catalog is
 * imported statically.
 */
export async function getMessages(locale: Locale): Promise<Messages> {
  const code: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return CATALOG[code];
}

/**
 * Lookup a key. Fallback order:
 *   1. `messages[key]`
 *   2. explicit `fallback` argument
 *   3. EN catalog value at the same key
 *   4. the key itself (never `undefined`)
 *
 * Every hit is passed through `fillEntityTokens` (G21 P0-A): the catalogues
 * never carry the operator name, ACN or ABN as literals — they carry
 * `{entityOperator}` / `{entityAbnLabel}` / `{entityStatutoryLine}` tokens
 * that resolve from `lib/site/legal-entity`, so both languages render the
 * same legal identity by construction.
 */
export function t(
  messages: Messages,
  key: string,
  fallback?: string,
): string {
  const local = messages[key];
  if (typeof local === "string" && local.length > 0) return fillEntityTokens(local);
  if (typeof fallback === "string" && fallback.length > 0) return fillEntityTokens(fallback);
  const enFallback = CATALOG.en[key];
  if (typeof enFallback === "string" && enFallback.length > 0) return fillEntityTokens(enFallback);
  return key;
}
