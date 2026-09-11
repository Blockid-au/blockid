// S17-B — Connected-revenue → valuation bridge.
//
// `api/integrations/stripe/callback` writes `mrr_aud` into `svi_signals` and
// the Xero callback writes a `xero_revenue` evidence row (3-month P&L income),
// but until S17-B neither engine (`lib/valuation.ts` computeValuation,
// `lib/agents/cfo-valuation.ts` buildVcValuationReport) ever read them — the
// valuation range was built from SVI dimensions + the manual
// `startup_metrics` row only.
//
// This module is the single pure function that reconciles an SVI-derived
// range with the ARR-multiple range implied by connected revenue:
//
//   arr            = mrr × 12
//   arrRange       = [arr × multiple.low, arr × multiple.high]
//                    (sector multiples from SECTOR_MULTIPLES via vcBenchmark —
//                    the same table the CFO agent already uses)
//   overlap        → narrow the SVI range to the overlap
//   disjoint       → widen to cover both ranges + flag `methodNote`
//   stale (> 90d)  → ignore the signal + note
//   mrr ≤ 0        → unchanged (method stays "svi")
//
// The DB loader lives in `./connected-revenue.ts` so this file stays pure
// and testable without Supabase.

import { vcBenchmark } from "@/lib/agents/cfo-valuation";
import { formatAudCompact } from "@/lib/format-aud";

export { formatAudCompact };

export type ConnectedRevenueProvider = "stripe" | "xero";

export interface ConnectedRevenueSignal {
  provider: ConnectedRevenueProvider;
  /** Monthly recurring revenue in AUD as reported by the connector. */
  mrrAud: number;
  /** ISO timestamp the connector captured the figure. */
  capturedAt: string;
}

export interface ValuationRange {
  lowAud: number;
  midAud: number;
  highAud: number;
}

export type ValuationMethod = "svi" | "svi+arr_multiple";

export type BridgeRelation = "overlap" | "disjoint";

export interface ConnectedRevenueDetail {
  provider: ConnectedRevenueProvider;
  mrrAud: number;
  arrAud: number;
  capturedAt: string;
  /** Sector key the multiples were looked up under ("default" when unknown). */
  sector: string;
  multipleLow: number;
  multipleHigh: number;
  /** Citation for the multiple range (SECTOR_MULTIPLES[sector].source). */
  multipleSource: string;
  arrRangeLowAud: number;
  arrRangeHighAud: number;
  relation: BridgeRelation;
  /** Human copy for the UI: "Includes connected revenue (A$8.2K MRR from Stripe)". */
  label: string;
}

export interface IgnoredSignal {
  provider: ConnectedRevenueProvider;
  capturedAt: string;
  reason: "stale" | "non_positive";
  ageDays: number | null;
}

export interface BridgeResult extends ValuationRange {
  valuationMethod: ValuationMethod;
  /** Set when the bridge widened (disagreement) or ignored a stale signal. */
  methodNote: string | null;
  connectedRevenue: ConnectedRevenueDetail | null;
  ignoredSignals: IgnoredSignal[];
}

export const CONNECTED_REVENUE_MAX_AGE_DAYS = 90;

export const DISAGREEMENT_NOTE = "connected revenue disagrees with SVI-implied range";

const PROVIDER_LABEL: Record<ConnectedRevenueProvider, string> = {
  stripe: "Stripe",
  xero: "Xero",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ageInDays(capturedAt: string, now: Date): number | null {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / DAY_MS;
}

/**
 * Pick the freshest usable connected-revenue signal. Signals older than
 * `maxAgeDays` or with a non-positive MRR are dropped and reported in
 * `ignored` so the caller can surface a note.
 */
export function selectConnectedRevenue(
  signals: ConnectedRevenueSignal[],
  opts: { now?: Date; maxAgeDays?: number } = {},
): { signal: ConnectedRevenueSignal | null; ignored: IgnoredSignal[] } {
  const now = opts.now ?? new Date();
  const maxAge = opts.maxAgeDays ?? CONNECTED_REVENUE_MAX_AGE_DAYS;
  const ignored: IgnoredSignal[] = [];
  let best: ConnectedRevenueSignal | null = null;

  for (const s of signals) {
    const age = ageInDays(s.capturedAt, now);
    if (!(s.mrrAud > 0) || !Number.isFinite(s.mrrAud)) {
      ignored.push({ provider: s.provider, capturedAt: s.capturedAt, reason: "non_positive", ageDays: age });
      continue;
    }
    if (age === null || age > maxAge) {
      ignored.push({ provider: s.provider, capturedAt: s.capturedAt, reason: "stale", ageDays: age });
      continue;
    }
    if (!best || new Date(s.capturedAt).getTime() > new Date(best.capturedAt).getTime()) {
      best = s;
    }
  }

  return { signal: best, ignored };
}

function staleNote(ignored: IgnoredSignal[]): string | null {
  const stale = ignored.filter((i) => i.reason === "stale");
  if (stale.length === 0) return null;
  const names = Array.from(new Set(stale.map((s) => PROVIDER_LABEL[s.provider]))).join("/");
  return `connected revenue from ${names} is older than ${CONNECTED_REVENUE_MAX_AGE_DAYS} days and was ignored — reconnect to refresh`;
}

/**
 * Reconcile an SVI-derived valuation range with the ARR-multiple range implied
 * by the latest connected MRR. Pure; never returns a negative bound.
 */
export function applyConnectedRevenueBridge(
  range: ValuationRange,
  signals: ConnectedRevenueSignal[],
  opts: { sector?: string | null; now?: Date; maxAgeDays?: number } = {},
): BridgeResult {
  const base: ValuationRange = {
    lowAud: Math.max(0, Math.round(range.lowAud)),
    midAud: Math.max(0, Math.round(range.midAud)),
    highAud: Math.max(0, Math.round(range.highAud)),
  };

  const { signal, ignored } = selectConnectedRevenue(signals, opts);

  if (!signal) {
    return {
      ...base,
      valuationMethod: "svi",
      methodNote: staleNote(ignored),
      connectedRevenue: null,
      ignoredSignals: ignored,
    };
  }

  const sectorKey = (opts.sector ?? "default").toLowerCase();
  const bm = vcBenchmark(sectorKey);
  const multipleLow = bm.arrMultiple.low;
  const multipleHigh = bm.arrMultiple.high;
  const arrAud = Math.round(signal.mrrAud * 12);
  const arrRangeLowAud = Math.max(0, Math.round(arrAud * multipleLow));
  const arrRangeHighAud = Math.max(0, Math.round(arrAud * multipleHigh));

  const overlapLow = Math.max(base.lowAud, arrRangeLowAud);
  const overlapHigh = Math.min(base.highAud, arrRangeHighAud);
  const overlaps = overlapLow <= overlapHigh;

  let lowAud: number;
  let highAud: number;
  let relation: BridgeRelation;
  let methodNote: string | null;

  if (overlaps) {
    lowAud = overlapLow;
    highAud = overlapHigh;
    relation = "overlap";
    methodNote = staleNote(ignored);
  } else {
    lowAud = Math.min(base.lowAud, arrRangeLowAud);
    highAud = Math.max(base.highAud, arrRangeHighAud);
    relation = "disjoint";
    const stale = staleNote(ignored);
    methodNote = stale ? `${DISAGREEMENT_NOTE}; ${stale}` : DISAGREEMENT_NOTE;
  }

  lowAud = Math.max(0, lowAud);
  highAud = Math.max(lowAud, highAud);
  const midAud =
    base.midAud >= lowAud && base.midAud <= highAud
      ? base.midAud
      : Math.round((lowAud + highAud) / 2);

  const label = `Includes connected revenue (${formatAudCompact(signal.mrrAud)} MRR from ${PROVIDER_LABEL[signal.provider]})`;

  return {
    lowAud,
    midAud,
    highAud,
    valuationMethod: "svi+arr_multiple",
    methodNote,
    connectedRevenue: {
      provider: signal.provider,
      mrrAud: signal.mrrAud,
      arrAud,
      capturedAt: signal.capturedAt,
      sector: bm.sector,
      multipleLow,
      multipleHigh,
      multipleSource: bm.source,
      arrRangeLowAud,
      arrRangeHighAud,
      relation,
      label,
    },
    ignoredSignals: ignored,
  };
}
