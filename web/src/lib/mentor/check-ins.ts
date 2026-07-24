// Mentor weekly check-in — pure lib (no DB, no IO).
//
// Structured 3-field check-in (wins / blockers / next-focus) + optional mood.
// Freshness is measured against a 7-day window; nudgeRequired computes whether
// the mentor should be prompted based on mentor prefs + last submission.

export type CheckInMood = "up" | "flat" | "down" | null;

export interface CheckInRecord {
  id: string;
  mentor_user_id: string;
  subject_user_id: string;
  iso_week: string; // e.g. "2026-W30"
  wins: string;
  blockers: string;
  next_focus: string;
  mood: CheckInMood;
  created_at: string;
  updated_at: string;
}

export interface CheckInInput {
  wins?: unknown;
  blockers?: unknown;
  next_focus?: unknown;
  mood?: unknown;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const FRESH_WINDOW_DAYS = 7;

/**
 * ISO-8601 week string ("YYYY-Www"). Uses UTC to avoid DST off-by-one and
 * to give the digest cron a stable, timezone-independent grouping key.
 */
export function currentIsoWeek(now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Thursday of the same ISO week determines the year.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * True when the last check-in is within FRESH_WINDOW_DAYS days of `now`
 * (inclusive at the boundary — a check-in submitted exactly 7d ago is still
 * counted as fresh so a Monday nudge doesn't chase a Monday submission).
 */
export function isFresh(lastAtIso: string | null, now: Date): boolean {
  if (!lastAtIso) return false;
  const last = new Date(lastAtIso).getTime();
  if (!Number.isFinite(last)) return false;
  const ageMs = now.getTime() - last;
  if (ageMs < 0) return true; // clock skew — treat future as fresh
  return ageMs <= FRESH_WINDOW_DAYS * MS_PER_DAY;
}

/**
 * Completeness score 0..1 for a check-in payload. Weights:
 *   wins       0.35
 *   blockers   0.35
 *   next_focus 0.25
 *   mood       0.05
 * A field counts as filled when it's a non-empty trimmed string (or a valid
 * mood value); no length threshold beyond the empty check.
 */
export function completeness(input: CheckInInput | Partial<CheckInRecord>): number {
  const has = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 ? 1 : 0;
  const moodOk =
    input.mood === "up" || input.mood === "flat" || input.mood === "down" ? 1 : 0;
  return (
    has((input as CheckInInput).wins) * 0.35 +
    has((input as CheckInInput).blockers) * 0.35 +
    (has((input as CheckInInput).next_focus) ||
      has((input as { next?: unknown }).next)) *
      0.25 +
    moodOk * 0.05
  );
}

export interface NudgePrefs {
  /** Mentor opted out entirely from check-in nudges. */
  paused?: boolean;
  /** Weekly cadence day-of-week (0=Sun..6=Sat). Defaults to Monday. */
  nudge_dow?: number;
}

/**
 * Whether to send a check-in nudge for a mentee. Rules:
 *  - Paused prefs → never nudge.
 *  - Never checked-in → nudge on the configured dow.
 *  - Last check-in stale (>=7d) and today is the nudge dow → nudge.
 */
export function nudgeRequired(
  lastAtIso: string | null,
  prefs: NudgePrefs,
  now: Date,
): boolean {
  if (prefs.paused) return false;
  const dow = typeof prefs.nudge_dow === "number" ? prefs.nudge_dow : 1;
  if (now.getUTCDay() !== dow) return false;
  return !isFresh(lastAtIso, now);
}
