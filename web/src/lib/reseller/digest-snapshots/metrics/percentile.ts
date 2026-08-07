// Percentile-family metric functions for the digest-snapshots registry (P1).
//
// Linear-interpolation percentile matching NumPy's default `linear`
// method: q ∈ [0, 100], sorted values ascending, interpolate between
// the two neighbouring positions when the rank is fractional. Matches
// the posture the legacy `digest-snapshot-per-*-percentiles.ts` stubs
// use so a P2 migration is byte-compatible for the common cases.

function sortedAsc(values: readonly number[]): number[] {
  return values.slice().sort((a, b) => a - b);
}

/**
 * Linear-interpolated percentile. `q` is a percentage in [0, 100].
 * Empty inputs return 0 by family convention.
 */
export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const clamped = Math.max(0, Math.min(100, q));
  const sorted = sortedAsc(values);
  const rank = (clamped / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export function p10(values: readonly number[]): number {
  return percentile(values, 10);
}
export function p25(values: readonly number[]): number {
  return percentile(values, 25);
}
export function p50(values: readonly number[]): number {
  return percentile(values, 50);
}
export function p75(values: readonly number[]): number {
  return percentile(values, 75);
}
export function p90(values: readonly number[]): number {
  return percentile(values, 90);
}
export function p95(values: readonly number[]): number {
  return percentile(values, 95);
}
export function p99(values: readonly number[]): number {
  return percentile(values, 99);
}
