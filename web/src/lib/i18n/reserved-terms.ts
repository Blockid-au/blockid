/**
 * Reserved-terms guard for machine translation (T-1403).
 *
 * Any bulk MT run on VI (or future locales) MUST preserve these tokens
 * verbatim. They are statutory references, brand names, or units of
 * account that lose meaning — or worse, mislead — if translated.
 *
 * The list is used two ways:
 *   1. Prompt-injected into the Gemini system message so the model is
 *      instructed to keep them as-is.
 *   2. Post-check: `containsReservedDrift(en, translated)` returns the
 *      terms that appeared in EN but disappeared in the translation, so
 *      the caller can refuse the translation and fall back to EN.
 *
 * See docs/goal-5d-t1400-i18n-notes.md §2 for the house rule.
 */

export const RESERVED_TERMS: readonly string[] = [
  // AU statutory shorthand
  "s708",
  "s766B",
  "ACN",
  "ABN",
  "GST",
  "AFSL",
  "ESIC",
  "ESVCLP",
  "AUD",
  "ASIC",
  "APRA",
  "AUSTRAC",
  "ATO",
  "ACL",
  "SOC2",
  // Brand
  "Auschain PTY LTD",
  "BlockID",
  "BlockID.au",
  // Product surface names kept in English
  "SVI",
  "SCN",
  "ESOP",
];

const RESERVED_LOWER = new Set(RESERVED_TERMS.map((t) => t.toLowerCase()));

/**
 * Returns the subset of RESERVED_TERMS that appear in `en` but are
 * missing from `translated`. Empty array = translation is safe to use.
 *
 * Word-boundary aware and case-insensitive on the presence check, but
 * the RESERVED_TERMS themselves are compared case-sensitively against
 * the translation (the model MUST keep case for statutory references).
 */
export function containsReservedDrift(
  en: string,
  translated: string,
): string[] {
  const missing: string[] = [];
  for (const term of RESERVED_TERMS) {
    const rx = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    if (rx.test(en) && !translated.includes(term)) {
      missing.push(term);
    }
  }
  return missing;
}

/**
 * Quick check without the case-sensitivity constraint — used by the
 * client DOM walker to skip translation of nodes that are already
 * mostly reserved tokens (e.g. legal footers).
 */
export function isMostlyReserved(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const reserved = words.filter((w) =>
    RESERVED_LOWER.has(w.toLowerCase().replace(/[.,;:()]/g, "")),
  );
  return reserved.length / words.length > 0.5;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
