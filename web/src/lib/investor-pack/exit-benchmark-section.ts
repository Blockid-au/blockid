// AU comparable-exits section for the ch09+ investor-readiness pack.
//
// Closes the P12b follow-up in
// docs/plans/atlassian-standard-mapping-goal.md §P12: the AU exit-benchmark
// fixture shipped by P12a (`web/src/lib/exits/au-benchmark.ts`) needs to
// surface in an investor-facing pack alongside the AU comparable-raises
// panel so a founder at Chapter 12 (Exit / Beyond) — and every earlier
// phase reading the pack — sees a defensible exit-valuation anchor.
//
// Pure — takes the assembler's project/sector context, calls the fixture
// helpers, and returns the JSON shape the pack renders. Never hits
// Supabase / network. The assembler stays responsible for passing sector.
//
// Legal: identical AFSL disclaimer surface as the AU comparable-raises
// panel. General information only, not personal financial product advice
// under s766B Corporations Act 2001 (Cth). Consumers MUST render the
// disclaimer alongside the exit rows.

import {
  AU_EXIT_DISCLAIMER,
  getAuComparableExits,
  summariseAuExits,
  type AuExit,
  type AuExitBuyerType,
  type AuExitSector,
} from "@/lib/exits/au-benchmark";

export interface ExitBenchmarkRow {
  company: string;
  buyer: string | null;
  buyerType: AuExitBuyerType;
  valuationAud: number;
  revenueMultiple: number | null;
  year: number;
  sourceUrl: string;
  sourceNote: string;
}

export interface ExitBenchmarkSummary {
  count: number;
  medianValuationAud: number | null;
  medianRevenueMultiple: number | null;
  byBuyerType: Record<AuExitBuyerType, number>;
  latestYear: number | null;
}

export interface ExitBenchmarkSection {
  /** Requested sector filter (null when the founder has no sector on file). */
  sector: string | null;
  /** True when we fell back to the all-sector fixture because the sector filter returned nothing. */
  usedFallback: boolean;
  /** Top-N exits (newest-first, then largest-first) trimmed to the pack. */
  topExits: ExitBenchmarkRow[];
  /** Aggregate over the un-trimmed slice — the pack shows medians as anchors. */
  summary: ExitBenchmarkSummary;
  /** Fixed AFSL / accuracy hedge — every render surface must include it. */
  disclaimer: string;
}

export interface BuildExitBenchmarkSectionOptions {
  sector?: string | null;
  /** Filter to deals in year >= minYear. Defaults to 2010 so pre-GFC exits are excluded. */
  minYear?: number;
  /** Max rows returned in `topExits`. Defaults to 6, matching the AU-comparable-raises panel. */
  limit?: number;
}

const DEFAULT_MIN_YEAR = 2010;
const DEFAULT_LIMIT = 6;

/**
 * Project the AU exit-benchmark fixture into a pack-ready section.
 *
 * Sector-scoped when the founder has one on file; falls back to the full
 * fixture when the sector filter matches zero rows (rare + niche sectors)
 * so the pack never renders an empty exit panel. `usedFallback: true`
 * lets downstream copy explain the widening.
 */
export function buildExitBenchmarkSection(
  opts: BuildExitBenchmarkSectionOptions = {},
): ExitBenchmarkSection {
  const requestedSector = normaliseSector(opts.sector);
  const minYear = typeof opts.minYear === "number" ? opts.minYear : DEFAULT_MIN_YEAR;
  const limit = Math.max(1, typeof opts.limit === "number" ? opts.limit : DEFAULT_LIMIT);

  const sectorScoped = requestedSector
    ? getAuComparableExits({ sector: requestedSector as AuExitSector, minYear })
    : [];

  const usedFallback = !!requestedSector && sectorScoped.length === 0;
  const slice = requestedSector && !usedFallback
    ? sectorScoped
    : getAuComparableExits({ minYear });

  const topExits = slice.slice(0, limit).map(toRow);
  const summary = toSummary(summariseAuExits(slice));

  return {
    sector: requestedSector ?? null,
    usedFallback,
    topExits,
    summary,
    disclaimer: AU_EXIT_DISCLAIMER,
  };
}

function toRow(e: AuExit): ExitBenchmarkRow {
  return {
    company: e.company,
    buyer: e.buyer,
    buyerType: e.buyerType,
    valuationAud: e.valuationAud,
    revenueMultiple: e.revenueMultiple,
    year: e.year,
    sourceUrl: e.sourceUrl,
    sourceNote: e.sourceNote,
  };
}

function toSummary(s: ReturnType<typeof summariseAuExits>): ExitBenchmarkSummary {
  return {
    count: s.count,
    medianValuationAud: s.medianValuationAud,
    medianRevenueMultiple: s.medianRevenueMultiple,
    byBuyerType: s.byBuyerType,
    latestYear: s.latestYear,
  };
}

function normaliseSector(sector: string | null | undefined): string | null {
  if (!sector) return null;
  const trimmed = sector.trim();
  return trimmed.length === 0 ? null : trimmed;
}
