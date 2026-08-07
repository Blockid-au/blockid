// Streak-family metric functions for the digest-snapshots registry (P1).
//
// Operates on point-to-point transitions in a numeric series. A
// "transition" is the sign of `values[i+1] - values[i]`:
//   +1 for up, −1 for down, 0 for flat.
//
// `directionStreak` returns the length of the current same-direction
// run ending at the last transition. `longestRun` returns the longest
// same-direction run anywhere in the series. `momentum` returns
// (sum of last N sign values) — a signed integer in [-N, +N] that
// captures net recent direction.

function signs(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    out.push(d > 0 ? 1 : d < 0 ? -1 : 0);
  }
  return out;
}

/**
 * Length of the current same-direction run at the tail of the series.
 * Flat transitions (0) break the run. Returns 0 for empty or single-
 * element inputs and 0 if the last transition is flat.
 */
export function directionStreak(values: readonly number[]): number {
  const s = signs(values);
  if (s.length === 0) return 0;
  const last = s[s.length - 1];
  if (last === 0) return 0;
  let n = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === last) n++;
    else break;
  }
  return n;
}

/**
 * Longest same-direction run anywhere in the series (ignoring flat
 * transitions which reset the counter).
 */
export function longestRun(values: readonly number[]): number {
  const s = signs(values);
  let best = 0;
  let cur = 0;
  let curSign = 0;
  for (const sign of s) {
    if (sign === 0) {
      cur = 0;
      curSign = 0;
      continue;
    }
    if (sign === curSign) cur++;
    else {
      cur = 1;
      curSign = sign;
    }
    if (cur > best) best = cur;
  }
  return best;
}

/**
 * Signed net direction of the last N transitions. Positive = mostly up,
 * negative = mostly down, 0 = balanced or flat. When N > available
 * transitions, sums whatever exists.
 */
export function momentum(values: readonly number[], window: number): number {
  const s = signs(values);
  if (s.length === 0) return 0;
  const w = Math.max(1, Math.min(Math.floor(window), s.length));
  let acc = 0;
  for (let i = s.length - w; i < s.length; i++) acc += s[i];
  return acc;
}

/**
 * Coverage: fraction of non-flat transitions in [0, 1]. Empty inputs
 * return 0 by family convention.
 */
export function coverage(values: readonly number[]): number {
  const s = signs(values);
  if (s.length === 0) return 0;
  let n = 0;
  for (const sign of s) if (sign !== 0) n++;
  return n / s.length;
}
