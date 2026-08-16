// Per-dimension peer benchmarking for SVI v2.0 (T0110).
//
// Static benchmarks derived from AU startup research. Each dimension is scored
// 0-100 and referenced against stage-matched percentile bands so users know
// where they stand relative to AU-stage peers rather than a generic average.

export interface DimensionBenchmarks {
  p25: number;
  p50: number; // median
  p75: number;
}

export interface DimensionPercentileResult {
  dimension: string;
  score: number;
  cohortP25: number;
  cohortP50: number;
  cohortP75: number;
  vsMedianPts: number;       // score - p50 (negative = below median)
  percentileEstimate: number; // 0-100 estimate based on where score falls
  band: "top_quartile" | "above_median" | "below_median" | "bottom_quartile";
}

// Anchor points from AU startup research: idea (0), seed (2), series-a (4).
// Intermediate stages are linearly interpolated.
// TRE gets a wider spread (±15) because revenue variance is high.
// All others use ±12.
//
// Stage 0=idea, 1=pre-seed, 2=seed, 3=post-seed, 4=series-a, 5=series-b,
//        6=series-c, 7=late

const ANCHORS: Record<string, Record<0 | 2 | 4 | 7, number>> = {
  ftv: { 0: 52, 2: 60, 4: 72, 7: 82 },
  mpc: { 0: 50, 2: 58, 4: 70, 7: 80 },
  ptd: { 0: 45, 2: 62, 4: 75, 7: 85 },
  tre: { 0: 30, 2: 52, 4: 78, 7: 88 },
  cgh: { 0: 50, 2: 58, 4: 68, 7: 78 },
  iri: { 0: 40, 2: 55, 4: 72, 7: 82 },
  lco: { 0: 48, 2: 58, 4: 65, 7: 75 },
  svm: { 0: 45, 2: 55, 4: 65, 7: 75 },
};

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function buildMedians(dim: string): Record<number, number> {
  const a = ANCHORS[dim];
  return {
    0: a[0],
    1: lerp(a[0], a[2], 0.5),
    2: a[2],
    3: lerp(a[2], a[4], 0.5),
    4: a[4],
    5: lerp(a[4], a[7], 1 / 3),
    6: lerp(a[4], a[7], 2 / 3),
    7: a[7],
  };
}

function spread(dim: string): number {
  // TRE has wider spread because revenue variance is high across the cohort.
  return dim === "tre" ? 15 : 12;
}

function buildBenchmarks(dim: string): Record<number, DimensionBenchmarks> {
  const medians = buildMedians(dim);
  const s = spread(dim);
  const result: Record<number, DimensionBenchmarks> = {};
  for (let stage = 0; stage <= 7; stage++) {
    const p50 = medians[stage];
    result[stage] = {
      p25: Math.max(0, p50 - s),
      p50,
      p75: Math.min(100, p50 + s),
    };
  }
  return result;
}

export const DIMENSION_BENCHMARKS_BY_STAGE: Record<
  string,
  Record<number, DimensionBenchmarks>
> = Object.fromEntries(
  Object.keys(ANCHORS).map((dim) => [dim, buildBenchmarks(dim)]),
);

function lerpPercentile(
  score: number,
  lo: number,
  hi: number,
  pLo: number,
  pHi: number,
): number {
  if (hi === lo) return pLo;
  const t = Math.max(0, Math.min(1, (score - lo) / (hi - lo)));
  return Math.round(pLo + t * (pHi - pLo));
}

export function computeDimensionPercentiles(
  dimensionScores: Record<string, number>,
  stage: number,
): DimensionPercentileResult[] {
  // Clamp stage to valid range — caller may pass 8+ if schema evolves.
  const clampedStage = Math.min(7, Math.max(0, Math.round(stage)));

  return Object.entries(dimensionScores).map(([dimension, score]) => {
    const benchmarks =
      DIMENSION_BENCHMARKS_BY_STAGE[dimension.toLowerCase()]?.[clampedStage];

    if (!benchmarks) {
      // Unknown dimension — return neutral result rather than throw.
      return {
        dimension,
        score,
        cohortP25: 0,
        cohortP50: 50,
        cohortP75: 100,
        vsMedianPts: score - 50,
        percentileEstimate: 50,
        band: "below_median" as const,
      };
    }

    const { p25, p50, p75 } = benchmarks;
    const vsMedianPts = score - p50;

    let percentileEstimate: number;
    let band: DimensionPercentileResult["band"];

    if (score >= p75) {
      percentileEstimate = lerpPercentile(score, p75, 100, 75, 100);
      band = "top_quartile";
    } else if (score >= p50) {
      percentileEstimate = lerpPercentile(score, p50, p75, 50, 75);
      band = "above_median";
    } else if (score >= p25) {
      percentileEstimate = lerpPercentile(score, p25, p50, 25, 50);
      band = "below_median";
    } else {
      percentileEstimate = lerpPercentile(score, 0, p25, 0, 25);
      band = "bottom_quartile";
    }

    return {
      dimension,
      score,
      cohortP25: p25,
      cohortP50: p50,
      cohortP75: p75,
      vsMedianPts,
      percentileEstimate,
      band,
    };
  });
}
