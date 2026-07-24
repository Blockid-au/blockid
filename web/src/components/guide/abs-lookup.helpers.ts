// P3c — pure form + formatting helpers for the ABS TAM/SAM/SOM lookup panel
// mounted on Chapter 3 (Market Research). The panel calls the existing public
// GET /api/abs/lookup route (shipped by P3b) with the founder's keyword or
// ANZSIC 2006 class code plus optional addressable + target-share percentages.
//
// Kept in a separate module so the URL-builder, response parser, and AUD
// formatter can be unit-tested without spinning up jsdom or fetch mocks.

export type AbsLookupField = "anzsic" | "keyword" | "sector";

export interface AbsLookupFormState {
  /** Free-text keyword ("saas", "fintech", "healthtech") OR ANZSIC 2006 class
   * code ("J5810", "K6419"). We infer which from shape at submit time. */
  query: string;
  /** SAM as a share of TAM, 0..100 as the user types (%). Blank → route default. */
  addressablePct: string;
  /** SOM as a share of SAM, 0..100 as the user types (%). Blank → route default. */
  targetSharePct: string;
}

export function makeEmptyAbsLookupFormState(
  initialKeyword?: string,
): AbsLookupFormState {
  return {
    query: initialKeyword?.trim() ?? "",
    addressablePct: "",
    targetSharePct: "",
  };
}

/** ANZSIC 2006 class codes are one uppercase division letter + 4 digits.
 * We check length + shape so "J5810" and "j5810" both classify, but "saas"
 * or "fintech neobank" fall through to keyword lookup. */
export function isAnzsicCode(raw: string): boolean {
  const trimmed = raw.trim().toUpperCase();
  return /^[A-Z]\d{4}$/.test(trimmed);
}

/** Convert a user-typed percentage (0..100) to the route's expected 0..1
 * fraction. Blank / non-numeric → null so the URL builder can omit the
 * param entirely and let the route apply its default (20% / 1%). */
export function parsePctInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  // User types 20 for 20%; route wants 0.2. Clamp overshoot to [0,1] so a
  // fat-fingered 500 doesn't reach the network as ?addressablePct=5.
  const fraction = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * Build the /api/abs/lookup URL from form state. Returns null when the
 * query is blank (the submit button should stay disabled — no reason to
 * fire a request that will 400).
 */
export function buildAbsLookupUrl(state: AbsLookupFormState): string | null {
  const query = state.query.trim();
  if (!query) return null;
  const params = new URLSearchParams();
  if (isAnzsicCode(query)) {
    params.set("anzsic", query.toUpperCase());
  } else {
    params.set("keyword", query);
  }
  const addressable = parsePctInput(state.addressablePct);
  if (addressable !== null) params.set("addressablePct", String(addressable));
  const share = parsePctInput(state.targetSharePct);
  if (share !== null) params.set("targetSharePct", String(share));
  return `/api/abs/lookup?${params.toString()}`;
}

/** Response shape from GET /api/abs/lookup 200. Mirrors route.ts. */
export interface AbsLookupSuccess {
  industry: {
    anzsic_code: string;
    division: string;
    label: string;
    keywords: string[];
    cagr: number;
    business_count: number;
    sources: {
      publisher: string;
      title: string;
      url: string;
      publishedYear: number;
    }[];
    notes: string;
  };
  tam_aud: number;
  sam_aud: number;
  som_aud: number;
  addressable_pct: number;
  target_share_pct: number;
  suggestions: {
    anzsic_code: string;
    label: string;
    tam_aud: number;
  }[];
  disclaimer: string;
}

export interface AbsLookupError {
  error: string;
  message: string;
  input?: { anzsic: string | null; keyword: string | null };
}

/** Format an AUD amount using the same compact bands as the exit-readiness
 * tile — B / M / k so a TAM the size of A$6.5B doesn't render as
 * "6,500,000,000". Non-finite / negative → em-dash so the panel never
 * misleads the reader. */
export function formatAudCompact(aud: number | null | undefined): string {
  if (aud == null || !Number.isFinite(aud) || aud < 0) return "—";
  if (aud >= 1_000_000_000) {
    return `A$${(aud / 1_000_000_000).toFixed(1)}B`;
  }
  if (aud >= 1_000_000) {
    return `A$${Math.round(aud / 1_000_000).toLocaleString("en-AU")}M`;
  }
  if (aud >= 1_000) {
    return `A$${Math.round(aud / 1_000).toLocaleString("en-AU")}k`;
  }
  return `A$${Math.round(aud).toLocaleString("en-AU")}`;
}

/** Format a decimal fraction as a rounded percent ("0.108" → "10.8%").
 * Whole percents (0.1) render as "10%"; sub-1% decimals render with one
 * decimal place so 0.001 → "0.1%" survives without losing signal. */
export function formatPct(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—";
  const pct = fraction * 100;
  if (pct === 0) return "0%";
  if (Math.abs(pct) < 1) return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
  const rounded = Number.isInteger(pct) ? pct : Number(pct.toFixed(1));
  return `${rounded}%`;
}
