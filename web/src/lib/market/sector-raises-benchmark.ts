// Chapter 3 (Market Research) sector-benchmark wrapper on top of the
// already-shipped `web/src/lib/au-comparable-raises.ts` dataset.
//
// Closes docs/plans/atlassian-standard-mapping-goal.md §1 phase 3 P1 gap
// ("au-comparable-raises benchmark exists conceptually in guide copy but
// no dedicated data source module"). The dataset module has been in
// place since 2026-07-20 (39 rows across fintech / saas / marketplace /
// healthtech / deeptech / edtech / preseed accelerator programs); this
// helper is the sector-first surface the guide copy actually promised:
//
//   `au-comparable-raises.md — public AU rounds in your segment,
//    last 24 months.`
//   (web/src/lib/guide/startup-journey.ts:243)
//
// Callers get a single call that yields the founder-ready shape:
//   - count (across all stages within the sector + freshness window)
//   - byStage histogram (preseed / seed / seriesA / seriesB)
//   - medianRoundAud + medianValuationAud (nulls when the sample is empty
//     or every row has a null valuation)
//   - top5 (chronologically freshest first, then largest round)
//   - freshnessBand ("last-24-months" | "older" | "empty")
//
// Boundary: the underlying dataset is press-reported, not audited.
// Consumers surfacing these numbers in a founder-facing report should
// attach `SECTOR_RAISES_BENCHMARK_DISCLAIMER` so the reader knows the
// figures are anchor context, not investment advice under s766B
// Corporations Act 2001 (Cth).

import {
  getComparableRaises,
  type ComparableRaise,
} from "@/lib/au-comparable-raises";

export const SECTOR_RAISES_BENCHMARK_DISCLAIMER =
  "Round sizes and valuations are drawn from public press coverage of AU " +
  "venture rounds and are treated as reported, not audited. Anchor context " +
  "for Chapter 3 market research and Chapter 9/10 investor-pack framing " +
  "only — not personal financial product advice under s766B Corporations " +
  "Act 2001 (Cth).";

export type SectorRaisesStage = ComparableRaise["stage"];

export const SECTOR_RAISES_STAGES: readonly SectorRaisesStage[] = [
  "preseed",
  "seed",
  "seriesA",
  "seriesB",
] as const;

export type SectorRaisesBenchmark = {
  sector: string;
  windowSinceYear: number | null;
  count: number;
  byStage: Record<SectorRaisesStage, number>;
  medianRoundAud: number | null;
  medianValuationAud: number | null;
  top5: ComparableRaise[];
  freshnessBand: "last-24-months" | "older" | "empty";
  disclaimer: string;
};

export type BenchmarkSectorRaisesInput = {
  sector: string;
  sinceYear?: number;
  stages?: readonly SectorRaisesStage[];
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function pickFreshnessBand(
  raises: ComparableRaise[],
  currentYear: number,
): SectorRaisesBenchmark["freshnessBand"] {
  if (raises.length === 0) return "empty";
  const cutoff = currentYear - 2;
  return raises.some((r) => r.year >= cutoff) ? "last-24-months" : "older";
}

export function benchmarkSectorRaises(
  input: BenchmarkSectorRaisesInput,
  now: Date = new Date(),
): SectorRaisesBenchmark {
  const sectorKey = input.sector.trim().toLowerCase();
  const stages = input.stages ?? SECTOR_RAISES_STAGES;

  // Pull each stage's slice from the underlying dataset then merge — the
  // upstream helper requires a stage per call and returns sorted-by-year
  // descending, which we preserve.
  const merged: ComparableRaise[] = [];
  for (const stage of stages) {
    const slice = getComparableRaises({ sector: sectorKey, stage });
    for (const row of slice) {
      if (typeof input.sinceYear === "number" && row.year < input.sinceYear) {
        continue;
      }
      merged.push(row);
    }
  }

  merged.sort((a, b) => b.year - a.year || b.roundAud - a.roundAud);

  const byStage: SectorRaisesBenchmark["byStage"] = {
    preseed: 0,
    seed: 0,
    seriesA: 0,
    seriesB: 0,
  };
  for (const r of merged) byStage[r.stage] += 1;

  const rounds = merged.map((r) => r.roundAud);
  const valuations = merged
    .map((r) => r.valuationAud)
    .filter((v): v is number => v !== null);

  return {
    sector: sectorKey,
    windowSinceYear: input.sinceYear ?? null,
    count: merged.length,
    byStage,
    medianRoundAud: median(rounds),
    medianValuationAud: median(valuations),
    top5: merged.slice(0, 5),
    freshnessBand: pickFreshnessBand(merged, now.getUTCFullYear()),
    disclaimer: SECTOR_RAISES_BENCHMARK_DISCLAIMER,
  };
}
