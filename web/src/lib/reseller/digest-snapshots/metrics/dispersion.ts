// Dispersion-family metric functions for the digest-snapshots registry (P1).
//
// Covers the classical spread metrics (range, IQR, MAD) plus the
// peak-to-N-mean family (PT*NM) that dominates the legacy 412-file
// footprint under `web/src/lib/reseller/digest-snapshot-per-transition-
// magnitude-top3-pool-peak-to-*-mean.ts`.
//
// Peak-to-N-mean design: `peakToNMean(values, N)` returns
//   peak(values) / mean(top-N values)
// where `peak = max(values)` and the "top-N" cohort is the N largest
// values in `values` (or all values if N >= length). This mirrors the
// posture used in the loop-generated PT*NM stubs — a scalar in [1, ∞)
// that rises when the peak is an outlier relative to the pool it sits
// atop.
//
// The named helpers (`peakToCubicMean`, `peakToDecicMean`, ...) fix N
// to the Latin numeral encoded in the loop's naming convention:
//   cubic=3, quadric=4, quintic=5, sextic=6, septic=7, octic=8,
//   nonic=9, decic=10, undecic=11, duodecic=12, tridecic=13,
//   quattuordecic=14, quindecic=15, sexdecic=16, septdecic=17,
//   octodecic=18, novemdecic=19, vigintic=20, trigintic=30,
//   quadragintic=40, quinquagintic=50, sexagintic=60, septuagintic=70,
//   octogintic=80, nonagintic=90, centic=100.
// These are the P1 seed; the full 100+ named variants land in P2 when
// the loop is retired.

import { mean as arithmeticMean, max, min } from "./moment";
import { p25, p75 } from "./percentile";

export function range(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return max(values) - min(values);
}

/** Interquartile range: p75 − p25. */
export function iqr(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return p75(values) - p25(values);
}

/**
 * Mean absolute deviation from the arithmetic mean.
 * Empty inputs return 0 by family convention.
 */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = arithmeticMean(values);
  let acc = 0;
  for (const v of values) acc += Math.abs(v - m);
  return acc / values.length;
}

/** Midhinge = (p25 + p75) / 2. */
export function midhinge(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return (p25(values) + p75(values)) / 2;
}

/**
 * Peak-to-N-mean ratio (PT*NM family).
 *   peak(values) / mean(top-N values)
 *
 * Returns 0 for empty inputs. When the top-N mean is 0 (all top values
 * are 0) the ratio is 0 rather than Infinity — the caller downstream
 * treats "no pool" the same as "no peak".
 */
export function peakToNMean(values: readonly number[], n: number): number {
  if (values.length === 0) return 0;
  const capped = Math.max(1, Math.min(Math.floor(n), values.length));
  const peak = max(values);
  const topN = values.slice().sort((a, b) => b - a).slice(0, capped);
  const denom = arithmeticMean(topN);
  if (denom === 0) return 0;
  return peak / denom;
}

// --- Named PT*NM helpers (P1 seed subset) --------------------------------
// The full ~100-variant set migrates in P2 by table lookup; the ones
// listed here are the shapes referenced by wired dashboards today.
// (The registry re-exports a wider set via the parameterised
// `peakToNMean` — see registry.ts.)

export const peakToCubicMean = (v: readonly number[]): number => peakToNMean(v, 3);
export const peakToQuadricMean = (v: readonly number[]): number => peakToNMean(v, 4);
export const peakToQuinticMean = (v: readonly number[]): number => peakToNMean(v, 5);
export const peakToSexticMean = (v: readonly number[]): number => peakToNMean(v, 6);
export const peakToSepticMean = (v: readonly number[]): number => peakToNMean(v, 7);
export const peakToOcticMean = (v: readonly number[]): number => peakToNMean(v, 8);
export const peakToNonicMean = (v: readonly number[]): number => peakToNMean(v, 9);
export const peakToDecicMean = (v: readonly number[]): number => peakToNMean(v, 10);
export const peakToUndecicMean = (v: readonly number[]): number => peakToNMean(v, 11);
export const peakToDuodecicMean = (v: readonly number[]): number => peakToNMean(v, 12);
export const peakToTridecicMean = (v: readonly number[]): number => peakToNMean(v, 13);
export const peakToQuattuordecicMean = (v: readonly number[]): number => peakToNMean(v, 14);
export const peakToQuindecicMean = (v: readonly number[]): number => peakToNMean(v, 15);
export const peakToSexdecicMean = (v: readonly number[]): number => peakToNMean(v, 16);
export const peakToSeptdecicMean = (v: readonly number[]): number => peakToNMean(v, 17);
export const peakToOctodecicMean = (v: readonly number[]): number => peakToNMean(v, 18);
export const peakToNovemdecicMean = (v: readonly number[]): number => peakToNMean(v, 19);
export const peakToVigenticMean = (v: readonly number[]): number => peakToNMean(v, 20);
export const peakToTrigenticMean = (v: readonly number[]): number => peakToNMean(v, 30);
export const peakToQuadragenticMean = (v: readonly number[]): number => peakToNMean(v, 40);
export const peakToQuinquagenticMean = (v: readonly number[]): number => peakToNMean(v, 50);
export const peakToSexagenticMean = (v: readonly number[]): number => peakToNMean(v, 60);
export const peakToSeptuagenticMean = (v: readonly number[]): number => peakToNMean(v, 70);
export const peakToOctogenticMean = (v: readonly number[]): number => peakToNMean(v, 80);
export const peakToNonagenticMean = (v: readonly number[]): number => peakToNMean(v, 90);
export const peakToCenticMean = (v: readonly number[]): number => peakToNMean(v, 100);
