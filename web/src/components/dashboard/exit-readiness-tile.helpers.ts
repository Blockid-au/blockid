// Pure formatting + ordering helpers for <ExitReadinessTile />.
//
// P12b-tile follow-up in docs/plans/atlassian-standard-mapping-goal.md:
// the shipping tile is a server component (no client fetch — the pack
// section is computed at request time). These helpers stay pure so the
// number formatting + buyer-type label ordering are covered by vitest
// instead of Playwright.

import type { AuExitBuyerType } from "@/lib/exits/au-benchmark";

export const BUYER_TYPE_LABEL: Record<AuExitBuyerType, string> = {
  strategic: "Strategic",
  pe: "Private equity",
  ipo: "IPO",
  secondary: "Secondary",
  financial: "Financial",
};

// Stable presentation order — strategic + IPO lead because AU founders
// usually anchor on those two exit paths first. Secondary at the end
// because it is a liquidity event for existing holders, not a company
// exit per se.
export const BUYER_TYPE_ORDER: AuExitBuyerType[] = [
  "strategic",
  "ipo",
  "pe",
  "financial",
  "secondary",
];

/**
 * Format an AUD figure into a compact A$-prefixed string used across
 * the tile chips. Rounds to nearest A$M for values ≥ A$1B, retains
 * two-digit precision for A$1M–A$1B, and falls back to raw integers
 * below A$1M. Never returns "NaN" — non-finite input becomes "—".
 */
export function formatAudCompact(aud: number | null | undefined): string {
  if (aud == null || !Number.isFinite(aud)) return "—";
  const abs = Math.abs(aud);
  if (abs >= 1_000_000_000) {
    const b = aud / 1_000_000_000;
    return `A$${b.toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    const m = aud / 1_000_000;
    return `A$${m.toFixed(0)}M`;
  }
  if (abs >= 1_000) {
    const k = aud / 1_000;
    return `A$${k.toFixed(0)}k`;
  }
  return `A$${Math.round(aud)}`;
}

/**
 * Render an exit's revenue multiple as e.g. "12x" or "1.4x". Null /
 * NaN / negative values collapse to "—" so the tile never claims an
 * anchor multiple it cannot defend.
 */
export function formatMultiple(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return "—";
  if (m >= 10) return `${m.toFixed(0)}x`;
  return `${m.toFixed(1)}x`;
}

/**
 * Reorder a byBuyerType record into the tile's stable presentation
 * order. Zero-count entries are dropped so the tile never renders
 * a "0 secondary" chip.
 */
export function orderedBuyerTypeEntries(
  byBuyerType: Record<AuExitBuyerType, number>,
): Array<[AuExitBuyerType, number]> {
  return BUYER_TYPE_ORDER.filter((k) => (byBuyerType[k] ?? 0) > 0).map(
    (k) => [k, byBuyerType[k]] as [AuExitBuyerType, number],
  );
}
