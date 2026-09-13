// S26-B — Price per share from the SVI valuation and connected revenue.
//
// `share-structure.ts` prices a share off the legacy SVI → A$ curve alone
// (`vesting.computeSharePrice`: A$100K at SVI 100, ± A$2K / A$500 a point)
// divided by the AUTHORISED share count. Two things were missing:
//
//   1. connected revenue — S17-B / S25-A give a Stripe / Xero MRR with a
//      capture date, and the sector-multiple resolver (lib/valuation/sector-multiples.ts — approved override, else the static table; S27-C)
//      gives an ARR-multiple range per sector, but neither reached the
//      share price;
//   2. the divisor — a price per share is quoted on the FULLY DILUTED
//      count (issued shares + the ESOP pool), not the authorised ceiling.
//
// This module is the pure blend:
//
//   sviRange   = computeValuation({ sviScore, stage, sector, dimensions })
//                (lib/valuation.ts — Berkus + scorecard, the same engine the
//                valuation card uses) unless the caller passes a range
//   arrRange   = ARR × { low, mid, high } sector multiple (vcBenchmark)
//   valuation  = no ARR            → sviRange                 (method "svi")
//                ARR > 0           → 0.4 × sviRange + 0.6 × arrRange
//                                                       (method "svi+arr_multiple")
//   price      = valuation ÷ fullyDilutedShares, each of low / mid / high
//
// Weights (documented for the UI's "how is this priced" note):
//   SVI 40 % / ARR 60 %. Recurring revenue that a connector has actually
//   observed is harder evidence than a score-based estimate, so it carries
//   the majority — but not all: at seed-stage ARR a single lost customer
//   moves the multiple-implied figure by more than the SVI moves in a
//   quarter, so the SVI keeps a 40 % anchor. `computeValuation` itself
//   weights revenue at 50 % when the founder TYPES an ARR; connected ARR
//   earns 10 points more because it is dated and third-party.
//
// Guards: never NaN / Infinity — zero or negative share counts return
// `ok: false, reason: "no_shares"` with a zero price; a missing SVI and no
// ARR returns `ok: false, reason: "no_valuation"`; a non-finite ARR is
// treated as absent (SVI-only). Client-safe apart from the cfo-valuation
// import chain — call it from a route and ship the result as JSON.

import { vcBenchmark } from "@/lib/agents/cfo-valuation";
import { computeValuation } from "@/lib/valuation";
import { formatShortDate, type RevenueSourceKind } from "@/lib/revenue/sources";

export interface SharePriceRange {
  lowAud: number;
  midAud: number;
  highAud: number;
}

export type SharePriceMethod = "svi" | "svi+arr_multiple";

/** SVI 40 % / connected ARR 60 % — see the header for the reasoning. */
export const SHARE_PRICE_WEIGHTS = { svi: 0.4, arr: 0.6 } as const;

export interface SharePriceInput {
  /** Latest SVI score; null when the founder has not scored yet. */
  svi: number | null;
  /** Valuation stage the SVI engine expects: idea | validation | mvp | growth. */
  stage?: string | null;
  /** Sector key for SECTOR_MULTIPLES ("saas", "fintech", …); unknown → "default". */
  sector?: string | null;
  /** SVI dimension scores (0-100) when known — sharpens the scorecard method. */
  dimensions?: Record<string, number | undefined> | null;
  /** A pre-computed SVI-based range (e.g. the valuation card's) — skips computeValuation. */
  sviValuation?: SharePriceRange | null;
  /** Connected ARR in AUD (12 × MRR); null / 0 / non-finite → SVI-only. */
  arrAud?: number | null;
  /** Issued shares + ESOP pool. */
  fullyDilutedShares: number;
  /** Where the ARR came from, for the "from Stripe, 3 Sep" label. */
  revenueSource?: { kind: RevenueSourceKind | "stripe" | "xero"; takenAt: string | null } | null;
}

export interface SharePriceResult {
  ok: boolean;
  reason: "no_shares" | "no_valuation" | null;
  method: SharePriceMethod;
  weights: { svi: number; arr: number };
  fullyDilutedShares: number;
  /** The blended company valuation the price is derived from. */
  valuation: SharePriceRange;
  /** SVI-based leg (null when no SVI and a range was not supplied). */
  sviValuation: SharePriceRange | null;
  /** ARR × multiple leg (null when no connected revenue). */
  arrValuation: SharePriceRange | null;
  multiple: { sector: string; low: number; mid: number; high: number; source: string; sourceLabel: string; multiplesSource: "static" | "override" } | null;
  arrAud: number | null;
  /** A$ per share, 6 dp. */
  pricePerShare: SharePriceRange;
  /** "SVI score only" | "SVI + ARR multiple (from Stripe, 3 Sep)" */
  sourceLabel: string;
  /** Plain-English method line for the UI / PDF. */
  methodNote: string;
}

const ZERO: SharePriceRange = { lowAud: 0, midAud: 0, highAud: 0 };

function finite(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

function roundAud(v: number): number {
  return Math.max(0, Math.round(v));
}

function clean(r: SharePriceRange): SharePriceRange {
  const low = roundAud(finite(r.lowAud) ?? 0);
  const high = Math.max(low, roundAud(finite(r.highAud) ?? 0));
  const midRaw = roundAud(finite(r.midAud) ?? (low + high) / 2);
  const mid = Math.min(high, Math.max(low, midRaw));
  return { lowAud: low, midAud: mid, highAud: high };
}

function providerLabel(kind: string): string {
  switch (kind) {
    case "stripe":
    case "stripe_connect":
      return "Stripe";
    case "xero":
      return "Xero";
    case "startup_metrics":
      return "your metrics";
    case "manual":
      return "manual entries";
    default:
      return kind;
  }
}

/** "from Stripe, 3 Sep" — mirrors lib/revenue/sources.ts `sourceLabel`. */
export function revenueSourceLabel(src: SharePriceInput["revenueSource"]): string | null {
  if (!src) return null;
  const when = formatShortDate(src.takenAt);
  const who = providerLabel(src.kind);
  return when ? `from ${who}, ${when}` : `from ${who}`;
}

/** SVI leg: the caller's range, else the valuation engine on the score. */
export function sviValuationRange(input: Pick<SharePriceInput, "svi" | "stage" | "sector" | "dimensions" | "sviValuation">): SharePriceRange | null {
  if (input.sviValuation) return clean(input.sviValuation);
  const svi = finite(input.svi);
  if (svi === null) return null;
  const v = computeValuation({
    sviScore: svi,
    stage: input.stage ?? "idea",
    sector: input.sector ?? undefined,
    dimensions: input.dimensions ? (input.dimensions as Record<string, number>) : undefined,
  });
  return clean({ lowAud: v.lowAud, midAud: v.midAud, highAud: v.highAud });
}

export function computeSharePrice(input: SharePriceInput): SharePriceResult {
  const shares = finite(input.fullyDilutedShares) ?? 0;
  const sviRange = sviValuationRange(input);
  const arr = finite(input.arrAud);
  const hasArr = arr !== null && arr > 0;

  let multiple: SharePriceResult["multiple"] = null;
  let arrRange: SharePriceRange | null = null;
  if (hasArr) {
    const bm = vcBenchmark((input.sector ?? "default").toLowerCase());
    multiple = { sector: bm.sector, low: bm.arrMultiple.low, mid: bm.arrMultiple.mid, high: bm.arrMultiple.high, source: bm.source, sourceLabel: bm.sourceLabel, multiplesSource: bm.multiplesSource };
    arrRange = clean({ lowAud: arr * multiple.low, midAud: arr * multiple.mid, highAud: arr * multiple.high });
  }

  let method: SharePriceMethod = "svi";
  let valuation: SharePriceRange;
  if (sviRange && arrRange) {
    method = "svi+arr_multiple";
    const w = SHARE_PRICE_WEIGHTS;
    valuation = clean({
      lowAud: w.svi * sviRange.lowAud + w.arr * arrRange.lowAud,
      midAud: w.svi * sviRange.midAud + w.arr * arrRange.midAud,
      highAud: w.svi * sviRange.highAud + w.arr * arrRange.highAud,
    });
  } else if (arrRange) {
    // No SVI yet but connected revenue exists: the ARR leg alone (weights
    // collapse to 0 / 100 so the UI's note stays honest).
    method = "svi+arr_multiple";
    valuation = arrRange;
  } else if (sviRange) {
    valuation = sviRange;
  } else {
    valuation = ZERO;
  }

  const weights = sviRange && arrRange ? { svi: SHARE_PRICE_WEIGHTS.svi, arr: SHARE_PRICE_WEIGHTS.arr } : arrRange ? { svi: 0, arr: 1 } : { svi: 1, arr: 0 };
  const srcLabel = hasArr ? revenueSourceLabel(input.revenueSource) : null;
  const sourceLabel = method === "svi+arr_multiple" ? `SVI + ARR multiple${srcLabel ? ` (${srcLabel})` : ""}` : "SVI score only";

  const base = {
    method,
    weights,
    fullyDilutedShares: Math.max(0, Math.floor(shares)),
    valuation,
    sviValuation: sviRange,
    arrValuation: arrRange,
    multiple,
    arrAud: hasArr ? Math.round(arr) : null,
    sourceLabel,
  };

  if (!sviRange && !arrRange) {
    return { ...base, ok: false, reason: "no_valuation", pricePerShare: ZERO, methodNote: "No SVI score and no connected revenue yet — score your startup or connect Stripe / Xero to price a share." };
  }
  if (!(shares > 0)) {
    return { ...base, ok: false, reason: "no_shares", pricePerShare: ZERO, methodNote: "Add issued shares (and an ESOP pool) to the cap table to price a share — the divisor is the fully diluted count." };
  }

  const pricePerShare: SharePriceRange = {
    lowAud: round6(valuation.lowAud / shares),
    midAud: round6(valuation.midAud / shares),
    highAud: round6(valuation.highAud / shares),
  };
  const methodNote =
    method === "svi+arr_multiple" && sviRange && arrRange && multiple
      ? `Blended ${Math.round(weights.svi * 100)}% SVI valuation + ${Math.round(weights.arr * 100)}% ARR × ${multiple.low}–${multiple.high}× ${multiple.sector} multiple (${multiple.source}), divided by ${base.fullyDilutedShares.toLocaleString("en-AU")} fully diluted shares.`
      : method === "svi+arr_multiple" && multiple
        ? `ARR × ${multiple.low}–${multiple.high}× ${multiple.sector} multiple (${multiple.source}) — no SVI score yet — divided by ${base.fullyDilutedShares.toLocaleString("en-AU")} fully diluted shares.`
        : `SVI valuation only (no connected revenue), divided by ${base.fullyDilutedShares.toLocaleString("en-AU")} fully diluted shares.`;

  return { ...base, ok: true, reason: null, pricePerShare, methodNote };
}

export { formatSharePrice, formatSharePriceRange } from "@/lib/share-price-format";
