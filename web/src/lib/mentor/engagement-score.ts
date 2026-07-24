// Mentor engagement score — pure lib (no DB, no IO).
//
// Blended 0-100 score per mentee, mentor-only (never surfaced to the
// mentee, removing the incentive to game it):
//
//   score = 100 * (
//     0.35 * freshness   // recency of the last mentor check-in
//   + 0.30 * login       // recency of the mentee's last login
//   + 0.25 * svi         // 30-day SVI delta, clipped to +-10
//   + 0.10 * reports     // recency of the mentee's most recent report
//   )
//
// Tier thresholds: >=75 hot, >=50 warm, >=25 cool, else cold.
// Missing components contribute 0 (never crash on null); the returned
// `formula` string mirrors the exact math shown in the badge tooltip so
// mentors can audit the number without opening a doc.

export type EngagementTier = "hot" | "warm" | "cool" | "cold";

export interface EngagementInputs {
  now: Date;
  /** Last mentor check-in against this mentee (ISO). */
  last_check_in_at: string | null;
  /** Last time the mentee logged in (ISO). */
  last_login_at: string | null;
  /** Current SVI score minus SVI score ~30 days ago. Null = unknown. */
  svi_delta_30d: number | null;
  /** ISO timestamp of the mentee's most recent report/artefact. */
  last_report_at: string | null;
}

export interface EngagementComponents {
  freshness: number; // 0..1
  login: number; // 0..1
  svi: number; // 0..1
  reports: number; // 0..1
}

export interface EngagementResult {
  score: number; // 0..100 integer
  tier: EngagementTier;
  components: EngagementComponents;
  formula: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Weights — keep in sync with the badge tooltip + weekly digest copy.
export const WEIGHTS = Object.freeze({
  freshness: 0.35,
  login: 0.3,
  svi: 0.25,
  reports: 0.1,
});

export const TIER_THRESHOLDS = Object.freeze({
  hot: 75,
  warm: 50,
  cool: 25,
});

/** Days-since helper. Missing / bad values → null (never NaN). */
function daysSince(nowMs: number, iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const ms = nowMs - t;
  if (ms < 0) return 0; // clock skew — treat as brand new
  return ms / MS_PER_DAY;
}

/** Linear decay: 1.0 at 0d → 0.0 at `windowDays`, clamped. */
function decay(days: number | null, windowDays: number): number {
  if (days === null) return 0;
  if (days <= 0) return 1;
  if (days >= windowDays) return 0;
  return 1 - days / windowDays;
}

/** SVI delta → 0..1. -10 or worse → 0; +10 or better → 1; linear between. */
function sviComponent(delta: number | null): number {
  if (delta === null || !Number.isFinite(delta)) return 0;
  const clipped = Math.max(-10, Math.min(10, delta));
  return (clipped + 10) / 20;
}

export function tierOf(score: number): EngagementTier {
  if (score >= TIER_THRESHOLDS.hot) return "hot";
  if (score >= TIER_THRESHOLDS.warm) return "warm";
  if (score >= TIER_THRESHOLDS.cool) return "cool";
  return "cold";
}

export function computeEngagement(inputs: EngagementInputs): EngagementResult {
  const nowMs = inputs.now.getTime();
  const freshness = decay(daysSince(nowMs, inputs.last_check_in_at), 14);
  const login = decay(daysSince(nowMs, inputs.last_login_at), 14);
  const svi = sviComponent(inputs.svi_delta_30d);
  const reports = decay(daysSince(nowMs, inputs.last_report_at), 30);

  const raw =
    WEIGHTS.freshness * freshness +
    WEIGHTS.login * login +
    WEIGHTS.svi * svi +
    WEIGHTS.reports * reports;
  const score = Math.round(raw * 100);

  const formula =
    `score = 100 * (` +
    `${WEIGHTS.freshness} * freshness(${freshness.toFixed(2)}) + ` +
    `${WEIGHTS.login} * login(${login.toFixed(2)}) + ` +
    `${WEIGHTS.svi} * svi(${svi.toFixed(2)}) + ` +
    `${WEIGHTS.reports} * reports(${reports.toFixed(2)})` +
    `) = ${score}`;

  return {
    score,
    tier: tierOf(score),
    components: { freshness, login, svi, reports },
    formula,
  };
}
