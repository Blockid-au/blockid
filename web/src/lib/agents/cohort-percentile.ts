// Real-cohort percentile computation (T0102).
//
// SVIAnalysis.percentileRank is currently a band-based estimate from
// SVI_BENCHMARKS hardcoded quantiles. As the platform accumulates real
// AU-startup analyses in svi_index_snapshots, we can compute true
// percentile from peers at the same stage.
//
// Strategy (G14-S40 added the middle rung):
//   1. Query svi_index_snapshots filtered by stage (±1 for elasticity)
//   2. If cohort ≥ 20 rows → strict percentile (fraction scoring strictly
//      below) → source "real_cohort"
//   3. Else, when the caller passes `register` (the project's ABN / state /
//      entity age) and the open-register cohort (lib/signals/
//      external-signals.ts cohortFromRegisters — ABR entity age, GST,
//      grants, R&DTI) has ≥ 20 entities → the project's register-maturity
//      percentile within that cohort → source "register_cohort". This is a
//      register-derived positioning proxy, NOT an SVI rank; surfaces label
//      it as such.
//   4. Else fall back to the hardcoded benchmarks → "benchmark_fallback"
//   5. Return value + cohort metadata so the dashboard can show
//      "top 23% of 47 AU pre-seed startups in the index" — much more
//      credible than "top 25%".
//
// Anonymity: snapshots are stored without identity; only score+stage
// pairs are queried. The register cohort is public ABR / grant / R&DTI
// data keyed by ABN.

import { getSupabaseAdmin } from "@/lib/supabase";
import { cohortFromRegisters, type RegisterCohort, type RegisterCohortQuery, percentileWithinCohort } from "@/lib/signals/external-signals";

export type CohortPercentileSource = "real_cohort" | "register_cohort" | "benchmark_fallback";

export interface CohortPercentileResult {
  percentile: number;            // 0-100
  source: CohortPercentileSource;
  cohortSize: number;
  stageMatched: number;
  median?: number;
  p25?: number;
  p75?: number;
  /** register_cohort only: what the cohort is made of. */
  register?: { n: number; stateMatched: boolean; medianAgeMonths: number | null; subjectScore: number; subjectFromRegister: boolean };
}

/** Minimum peers before a cohort (snapshots or registers) beats the static table. */
export const COHORT_MIN_N = 20;

/** Test seam: the register cohort loader (defaults to cohortFromRegisters). */
export type RegisterCohortLoader = (db: unknown, q: RegisterCohortQuery) => Promise<RegisterCohort | null>;

/**
 * Compute percentile rank from the SVI Index snapshots cohort.
 *
 * @param sviScore  the user's current SVI
 * @param stage     stage code 0-7
 * @param fallback  the band-based estimate from SVI_BENCHMARKS, used when
 *                  cohort is too small
 */
export async function computeCohortPercentile(args: {
  sviScore: number;
  stage: number;
  fallbackPercentile: number;
  /** S40: enables the register cohort rung (snapshots < 20 → registers ≥ 20 → static). */
  register?: RegisterCohortQuery | null;
  /** Injected for tests. */
  loadRegisterCohort?: RegisterCohortLoader;
}): Promise<CohortPercentileResult> {
  const { sviScore, stage, fallbackPercentile } = args;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      percentile: fallbackPercentile,
      source: "benchmark_fallback",
      cohortSize: 0,
      stageMatched: stage,
    };
  }

  // Middle rung — only consulted once the snapshot cohort is too small.
  const registerFallback = async (snapshotCount: number): Promise<CohortPercentileResult> => {
    if (args.register) {
      try {
        const cohort = await (args.loadRegisterCohort ?? cohortFromRegisters)(supabase, args.register);
        if (cohort && cohort.n >= COHORT_MIN_N && cohort.subjectScore != null) {
          return {
            percentile: percentileWithinCohort(cohort.subjectScore, cohort.scores),
            source: "register_cohort",
            cohortSize: cohort.n,
            stageMatched: stage,
            register: { n: cohort.n, stateMatched: cohort.stateMatched, medianAgeMonths: cohort.medianAgeMonths, subjectScore: cohort.subjectScore, subjectFromRegister: cohort.subjectFromRegister },
          };
        }
      } catch {
        // register cohort unreadable → static
      }
    }
    return { percentile: fallbackPercentile, source: "benchmark_fallback", cohortSize: snapshotCount, stageMatched: stage };
  };

  try {
    // Snapshots within ±1 stage — gives elasticity for small cohorts at the
    // tails (Stage 0, Stage 7) without losing relevance.
    const stageLow = Math.max(0, stage - 1);
    const stageHigh = Math.min(7, stage + 1);

    // Only consider snapshots from the last 180 days (stale scores drift).
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("svi_index_snapshots")
      .select("svi, stage")
      .gte("stage", stageLow)
      .lte("stage", stageHigh)
      .gte("created_at", since)
      .limit(2000);

    if (error || !data || data.length < COHORT_MIN_N) {
      return registerFallback(data?.length ?? 0);
    }

    const scores = data
      .map((r) => Number(r.svi))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);

    if (scores.length < COHORT_MIN_N) {
      return registerFallback(scores.length);
    }

    // Strict percentile — fraction of cohort scoring strictly below the user.
    const below = scores.filter((s) => s < sviScore).length;
    const percentile = Math.round((below / scores.length) * 100);

    const mid = scores[Math.floor(scores.length / 2)];
    const p25 = scores[Math.floor(scores.length * 0.25)];
    const p75 = scores[Math.floor(scores.length * 0.75)];

    return {
      percentile,
      source: "real_cohort",
      cohortSize: scores.length,
      stageMatched: stage,
      median: Math.round(mid),
      p25: Math.round(p25),
      p75: Math.round(p75),
    };
  } catch {
    return {
      percentile: fallbackPercentile,
      source: "benchmark_fallback",
      cohortSize: 0,
      stageMatched: stage,
    };
  }
}

export {
  computeDimensionPercentiles,
  type DimensionPercentileResult,
} from "@/lib/svi-dimension-benchmarks";

// ─── Positioning label (T0254) ────────────────────────────────────────────────
// Translates a percentile + cohort context into a founder-friendly
// "Top X% of AU ${stage} startups" phrase for dashboards, reports, and share
// links. Pure function — no I/O, safe to call on any surface.

export type PositioningTier =
  | "elite"
  | "top"
  | "above_median"
  | "approaching_median"
  | "early";

export interface StartupPositioning {
  tier: PositioningTier;
  /** Short label suitable for a dashboard chip. */
  headline: string;
  /** Long-form phrase with cohort context. */
  detail: string;
}

/**
 * Map a percentile + cohort context to a founder-friendly positioning phrase.
 *
 * Tiers:
 *   • elite               (≥95): top 1–5 %
 *   • top                 (75–94): top 6–25 %
 *   • above_median        (50–74)
 *   • approaching_median  (25–49)
 *   • early               (0–24): priority upgrade zone
 *
 * The detail suffix distinguishes a real-cohort result ("based on N AU peers")
 * from a benchmark fallback ("benchmark estimate") so surfaces can label the
 * claim honestly.
 */
export function startupPositioning(input: {
  percentile: number;
  cohortSize: number;
  source: CohortPercentileSource;
  stageLabel?: string;
}): StartupPositioning {
  const { cohortSize, source, stageLabel } = input;
  const p = Math.max(0, Math.min(100, Math.round(input.percentile)));
  const stageBit = stageLabel ? `${stageLabel} ` : "";
  const cohortBit =
    source === "real_cohort" && cohortSize > 0
      ? ` (based on ${cohortSize} AU peers)`
      : source === "register_cohort" && cohortSize > 0
        ? ` (register cohort — ${cohortSize} AU entities on the ABR / grant / R&DTI registers)`
        : " (benchmark estimate)";

  let tier: PositioningTier;
  let headline: string;
  if (p >= 95) {
    tier = "elite";
    headline = `Elite — top ${Math.max(1, 100 - p)}% of AU ${stageBit}startups`;
  } else if (p >= 75) {
    tier = "top";
    headline = `Top ${100 - p}% of AU ${stageBit}startups`;
  } else if (p >= 50) {
    tier = "above_median";
    headline = `Above median for AU ${stageBit}startups`;
  } else if (p >= 25) {
    tier = "approaching_median";
    headline = `Approaching median for AU ${stageBit}startups`;
  } else {
    tier = "early";
    headline = "Early-stage development — priority upgrade zone";
  }

  return {
    tier,
    headline,
    detail: `${headline}${cohortBit}`,
  };
}

// ─── T0192 next-tier gap ──────────────────────────────────────────────────────
// Pairs with startupPositioning: given a percentile, tell the founder how many
// percentile points separate them from the next tier up. Returns null for
// `elite` (nothing above) so surfaces can render "at the top" instead of a
// gap number. Pure function; input is clamped to [0, 100] before comparison.

export interface NextTierGap {
  /** The next tier up, or null when already `elite`. */
  nextTier: PositioningTier | null;
  /** Percentile points needed to reach `nextTier`, or null when already `elite`. */
  percentilePointsToNext: number | null;
}

/** Lower bound of each tier, inclusive — matches the bands in `startupPositioning`. */
const TIER_FLOORS: ReadonlyArray<{ tier: PositioningTier; floor: number }> = [
  { tier: "elite", floor: 95 },
  { tier: "top", floor: 75 },
  { tier: "above_median", floor: 50 },
  { tier: "approaching_median", floor: 25 },
  { tier: "early", floor: 0 },
];

export function nextTierGap(percentile: number): NextTierGap {
  const p = Math.max(0, Math.min(100, Math.round(percentile)));
  // Find the lowest floor strictly greater than the input — that is the next
  // tier the founder has to clear.
  const above = TIER_FLOORS.filter((t) => t.floor > p).sort((a, b) => a.floor - b.floor)[0];
  if (!above) return { nextTier: null, percentilePointsToNext: null };
  return { nextTier: above.tier, percentilePointsToNext: above.floor - p };
}
