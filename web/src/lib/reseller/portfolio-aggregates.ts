// Reseller portfolio-aggregate builders — k>=5 anonymity + ISO-week
// quantisation, per docs/plans/reseller-module-plan.md § U.15.3.
//
// The reseller dashboard renders portfolio-level counters (how many attributed
// startups, how many active this week, SVI score distribution, weekly signup
// timeline). None of these can point at an individual startup — U.15.3 fixes
// two rules for that:
//
//   1. Any bucket count below K (default 5) is replaced with `null` on the
//      wire and rendered as "<5" client-side. The raw count never leaves the
//      server.
//   2. Timestamps quantise to ISO week (YYYY-Www) — never day precision.
//
// A companion `applyComplementarySuppression` handles the edge case where a
// series with a known total suppresses exactly one bucket: the suppressed
// value could be inferred by subtraction, so the smallest surviving bucket is
// also blanked. This lifts the k-anonymity guarantee to at least two
// simultaneous suppressions per series.
//
// Pure functions — no DB, no IO — so vitest can exercise the suppression and
// bucketing decisions without a live database, mirroring commission.ts +
// customer-drawer.ts + customer-reveal.ts.

export const K_ANONYMITY_THRESHOLD = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface KAnonBucket {
  count: number | null;
  suppressed: boolean;
}

export interface WeeklyBucket extends KAnonBucket {
  iso_week: string; // e.g. "2026-W29"
}

export interface SviBandBucket extends KAnonBucket {
  band: string; // "0-20" | "21-40" | ...
}

export interface PortfolioSummary {
  attributed_total: KAnonBucket;
  active_last_week: KAnonBucket;
  onboarded: KAnonBucket;
}

/**
 * ISO-8601 week label ("YYYY-Www") for a Date. Uses UTC to match how
 * revenue_events + app_users timestamps are stored.
 */
export function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function applyK(count: number, k = K_ANONYMITY_THRESHOLD): KAnonBucket {
  return count < k ? { count: null, suppressed: true } : { count, suppressed: false };
}

/**
 * Weekly signup timeline. Buckets `created_at` timestamps into ISO weeks and
 * applies k-anonymity per bucket. Returned array is sorted ascending by week
 * (chronological); empty weeks between the first and last signup are NOT
 * synthesised — callers can zero-fill on the client if they need a dense axis.
 */
export function buildSignupWeekly(
  customers: { created_at: string }[],
  k = K_ANONYMITY_THRESHOLD,
): WeeklyBucket[] {
  const counts = new Map<string, number>();
  for (const c of customers) {
    const d = new Date(c.created_at);
    if (!Number.isFinite(d.getTime())) continue;
    const w = isoWeek(d);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iso_week, n]) => ({ iso_week, ...applyK(n, k) }));
}

/**
 * Top-line portfolio counters: total attributed, active in the last 7 days,
 * completed onboarding. Each counter is k-anonymised individually — a reseller
 * with fewer than K attributed customers sees "<5" for every counter.
 */
export function buildPortfolioSummary(input: {
  customers: { created_at: string; last_login_at: string | null; onboarding_completed?: boolean | null }[];
  now: Date;
  k?: number;
}): PortfolioSummary {
  const k = input.k ?? K_ANONYMITY_THRESHOLD;
  const activeCutoff = input.now.getTime() - 7 * MS_PER_DAY;
  let active = 0;
  let onboarded = 0;
  for (const c of input.customers) {
    if (c.last_login_at) {
      const t = new Date(c.last_login_at).getTime();
      if (Number.isFinite(t) && t >= activeCutoff) active += 1;
    }
    if (c.onboarding_completed) onboarded += 1;
  }
  return {
    attributed_total: applyK(input.customers.length, k),
    active_last_week: applyK(active, k),
    onboarded: applyK(onboarded, k),
  };
}

const SVI_BANDS: readonly [label: string, lo: number, hi: number][] = [
  ["0-20", 0, 20],
  ["21-40", 21, 40],
  ["41-60", 41, 60],
  ["61-80", 61, 80],
  ["81-100", 81, 100],
];

/**
 * SVI score-band distribution. Takes the latest SVI score per project (not per
 * analysis run — repeated re-scores of the same startup would otherwise
 * dominate the histogram), then buckets into five bands. Scores outside 0–100
 * or with a non-numeric total_svi are ignored.
 */
export function buildSviBands(
  svi: { project_id: string; score: number | null; created_at: string }[],
  k = K_ANONYMITY_THRESHOLD,
): SviBandBucket[] {
  const latest = new Map<string, { score: number; ts: number }>();
  for (const row of svi) {
    if (typeof row.score !== "number" || !row.project_id) continue;
    const ts = new Date(row.created_at).getTime();
    if (!Number.isFinite(ts)) continue;
    const cur = latest.get(row.project_id);
    if (!cur || ts > cur.ts) latest.set(row.project_id, { score: row.score, ts });
  }
  const counts = new Map<string, number>(SVI_BANDS.map(([label]) => [label, 0]));
  for (const { score } of latest.values()) {
    for (const [label, lo, hi] of SVI_BANDS) {
      if (score >= lo && score <= hi) {
        counts.set(label, (counts.get(label) ?? 0) + 1);
        break;
      }
    }
  }
  return SVI_BANDS.map(([label]) => ({ band: label, ...applyK(counts.get(label) ?? 0, k) }));
}

/**
 * Complementary suppression. When a series exposes a total elsewhere (e.g.
 * total customers = 12) and exactly one bucket is k-suppressed, subtracting
 * the visible buckets from the total leaks the suppressed count. Guard by
 * suppressing the smallest remaining bucket too, ensuring at least two
 * simultaneous holes.
 *
 * When zero or two-plus buckets are already suppressed, the input is returned
 * unchanged (already safe or already unrecoverable via subtraction).
 */
export function applyComplementarySuppression<T extends KAnonBucket>(buckets: T[]): T[] {
  const suppressedCount = buckets.filter((b) => b.suppressed).length;
  if (suppressedCount !== 1) return buckets;

  let smallestIdx = -1;
  let smallestVal = Infinity;
  buckets.forEach((b, i) => {
    if (b.suppressed || b.count === null) return;
    if (b.count < smallestVal) {
      smallestVal = b.count;
      smallestIdx = i;
    }
  });
  if (smallestIdx < 0) return buckets;
  const clone = buckets.slice();
  clone[smallestIdx] = { ...clone[smallestIdx], count: null, suppressed: true };
  return clone;
}
