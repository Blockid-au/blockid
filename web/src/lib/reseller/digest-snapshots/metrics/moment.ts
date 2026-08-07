// Moment-family metric functions for the digest-snapshots registry (P1).
//
// Pure functions only — no I/O, no dates, no formatting. Each function
// takes a readonly number[] and returns a single scalar. Empty inputs
// return 0 by family convention (the caller enforces the "quiet-when-
// empty" suppression at the row level).
//
// This file is ADDITIVE — the legacy `digest-snapshot-per-*.ts` stubs
// remain the source of truth for wired consumers until P2 migrates them
// to registry-driven re-exports.

export function sum(values: readonly number[]): number {
  let acc = 0;
  for (const v of values) acc += v;
  return acc;
}

export function count(values: readonly number[]): number {
  return values.length;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

export function min(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let m = values[0];
  for (let i = 1; i < values.length; i++) if (values[i] < m) m = values[i];
  return m;
}

export function max(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let m = values[0];
  for (let i = 1; i < values.length; i++) if (values[i] > m) m = values[i];
  return m;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mode(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  let bestValue = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount || (c === bestCount && v < bestValue)) {
      bestCount = c;
      bestValue = v;
    }
  }
  return bestValue;
}

export function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) {
    const d = v - m;
    acc += d * d;
  }
  return acc / values.length;
}

export function stdev(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

/** Coefficient of variation — stdev / |mean|. Returns 0 when mean is 0. */
export function cv(values: readonly number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return stdev(values) / Math.abs(m);
}

export function geomean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  // Guard: geomean is only defined for positive reals. Any non-positive
  // value collapses the result to 0 so a caller cannot accidentally take
  // log(<=0) and see NaN downstream.
  let logSum = 0;
  for (const v of values) {
    if (v <= 0) return 0;
    logSum += Math.log(v);
  }
  return Math.exp(logSum / values.length);
}

export function harmean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let acc = 0;
  for (const v of values) {
    if (v === 0) return 0;
    acc += 1 / v;
  }
  return values.length / acc;
}
