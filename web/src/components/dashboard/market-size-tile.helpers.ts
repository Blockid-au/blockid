// Pure formatting + selection helpers for <MarketSizeTile />.
//
// Chapter 3 (Market Research) consumer for the P3a/P3b ABS lookup module.
// The tile itself is a server component that projects an
// AuMarketSnapshotSection into static markup, so branch coverage lives on
// these helpers.

import type { AuIndustrySnapshot } from "@/lib/market/au-market-lookup";

/**
 * Format an AUD figure into a compact A$-prefixed string used across
 * the tile chips. Mirrors the exit-readiness-tile.helpers formatter so
 * numbers render identically across dashboard surfaces. Non-finite input
 * collapses to "—" so the tile never renders "NaN".
 */
export function formatAudCompact(aud: number | null | undefined): string {
  if (aud == null || !Number.isFinite(aud)) return "—";
  const abs = Math.abs(aud);
  if (abs >= 1_000_000_000) {
    return `A$${(aud / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `A$${(aud / 1_000_000).toFixed(0)}M`;
  }
  if (abs >= 1_000) {
    return `A$${(aud / 1_000).toFixed(0)}k`;
  }
  return `A$${Math.round(aud)}`;
}

/**
 * Format a CAGR decimal (0.108 → "10.8%"). null / NaN → "—". Anchors on
 * one decimal place because industry-growth anchors past that precision
 * are false confidence for a static ABS seed.
 */
export function formatCagrPct(cagr: number | null | undefined): string {
  if (cagr == null || !Number.isFinite(cagr)) return "—";
  return `${(cagr * 100).toFixed(1)}%`;
}

/**
 * Format a business-count anchor with thousands-separators (AU locale).
 * null / NaN → "—". Rounds to the nearest whole business — decimals here
 * would be nonsense.
 */
export function formatBusinessCount(count: number | null | undefined): string {
  if (count == null || !Number.isFinite(count)) return "—";
  return Math.round(count).toLocaleString("en-AU");
}

/**
 * Format a fraction as an integer percentage ("0.2" → "20%"). Handles the
 * addressablePct / targetSharePct fields returned by estimateTamSamSom.
 * null / non-finite → "—".
 */
export function formatFractionPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const clamped = Math.min(1, Math.max(0, pct));
  return `${Math.round(clamped * 100)}%`;
}

/**
 * Best-effort mapping from the founder's free-text project.industry field
 * onto the ANZSIC keyword vocabulary the lookup module understands. Falls
 * back to the raw string when we can't improve on it; the underlying
 * searchByKeyword() already tolerates near-matches (SaaS, software,
 * platform all land on J5810 for example).
 *
 * Returns null when the input is empty / whitespace only so the caller
 * can render the "all-sectors" state without a spurious query.
 */
export function normaliseIndustryKeyword(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (trimmed === "") return null;
  return trimmed;
}

/**
 * Pick a defensible source URL for the tile "Verify at source" link. Prefer
 * the ABS release when present (that's the anchor investors reach for
 * first), then IBISWorld, then the first source in the list. Returns null
 * when the snapshot carries no sources at all.
 */
export function pickPrimarySource(
  industry: AuIndustrySnapshot,
): { url: string; label: string } | null {
  const sources = industry.sources ?? [];
  if (sources.length === 0) return null;
  const abs = sources.find((s) => s.publisher === "ABS");
  if (abs) return { url: abs.url, label: `${abs.publisher} · ${abs.title}` };
  const ibis = sources.find((s) => s.publisher === "IBISWorld");
  if (ibis) return { url: ibis.url, label: `${ibis.publisher} · ${ibis.title}` };
  const first = sources[0];
  return { url: first.url, label: `${first.publisher} · ${first.title}` };
}
