// Rank statistics for the SVI backtest (G14-S39). Dependency-free and
// deterministic: Spearman ρ with average ranks for ties (so it equals
// Pearson on the ranks, the textbook definition when ties exist), a seeded
// percentile bootstrap for the 95 % CI, and the quantile helpers the
// bucket table uses. Pure functions — no I/O.

/** mulberry32 — small seeded PRNG, good enough for a reproducible bootstrap. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Average ranks (1-based); tied values share the mean of the ranks they span. */
export function averageRanks(values: readonly number[]): number[] {
  const idx = values.map((v, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
    const mean = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) ranks[idx[k]] = mean;
    i = j + 1;
  }
  return ranks;
}

function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null; // a constant series has no rank order
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Spearman rank correlation. `null` when n < 3, lengths differ, either
 * series is constant, or any value is non-finite (the caller filters, but
 * a NaN must never leak into the published JSON as a number).
 */
export function spearman(x: readonly number[], y: readonly number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) return null;
  }
  const r = pearson(averageRanks(x), averageRanks(y));
  return r === null ? null : Math.max(-1, Math.min(1, r));
}

export interface BootstrapCI {
  low: number;
  high: number;
  resamples: number;
  /** Resamples that produced a defined ρ (a degenerate resample — all ties — is skipped). */
  effective: number;
}

/**
 * Percentile bootstrap 95 % CI of Spearman ρ: resample pairs with
 * replacement `resamples` times (seeded), take the 2.5 / 97.5 percentiles.
 * `null` when the point estimate itself is undefined or fewer than half the
 * resamples produce a value.
 */
export function bootstrapSpearmanCI(
  x: readonly number[],
  y: readonly number[],
  opts: { resamples?: number; seed?: number; level?: number } = {},
): BootstrapCI | null {
  const resamples = Math.max(1, Math.floor(opts.resamples ?? 1000));
  const level = opts.level ?? 0.95;
  const n = x.length;
  if (spearman(x, y) === null) return null;
  const rnd = mulberry32(opts.seed ?? 20260916);
  const rhos: number[] = [];
  const bx = new Array<number>(n);
  const by = new Array<number>(n);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rnd() * n);
      bx[i] = x[k];
      by[i] = y[k];
    }
    const rho = spearman(bx, by);
    if (rho !== null) rhos.push(rho);
  }
  if (rhos.length < resamples / 2) return null;
  rhos.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  return {
    low: quantileSorted(rhos, alpha),
    high: quantileSorted(rhos, 1 - alpha),
    resamples,
    effective: rhos.length,
  };
}

/** Linear-interpolated quantile of an ASCENDING array (q in [0, 1]). */
export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function quantile(values: readonly number[], q: number): number {
  return quantileSorted([...values].sort((a, b) => a - b), q);
}

export function median(values: readonly number[]): number | null {
  return values.length ? quantile(values, 0.5) : null;
}

/** 1..k bucket index for each value by its average rank (quartiles when k = 4); tied values share a bucket. */
export function rankBuckets(values: readonly number[], k = 4): number[] {
  const n = values.length;
  if (n === 0) return [];
  const ranks = averageRanks(values);
  return ranks.map((r) => Math.min(k, Math.max(1, Math.ceil((r / n) * k))));
}
