// P5-cohort-svi — form-state helpers for the /dashboard/svi cohort retention tile.
//
// Runs the pure `computeWeeklyCohortRetention` + `renderCohortRetentionSvg`
// helpers from web/src/lib/traction/cohort-chart.ts on founder-pasted CSV
// input. This module owns the string-shaped UI state + CSV parsers so the
// client component stays render-only.
//
// Follows the P11-acquisition-wizard.helpers.ts posture: form-state fields
// are strings so <textarea>/<input> values round-trip cleanly, and blank
// input collapses to an empty array so the pure helper's empty-state SVG
// branch fires instead of throwing.

import type {
  ActivityEvent,
  CohortMatrix,
  SignupEvent,
} from "@/lib/traction/cohort-chart";
import { MIN_COHORT_BUCKETS } from "@/lib/traction/cohort-chart";

/** Every field is a string so pasted CSV round-trips cleanly. */
export interface CohortRetentionFormState {
  signups_csv: string;
  activities_csv: string;
  reference_date_iso: string;
}

export function makeEmptyCohortRetentionFormState(): CohortRetentionFormState {
  return {
    signups_csv: "",
    activities_csv: "",
    reference_date_iso: "",
  };
}

function splitLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function splitRow(line: string): string[] {
  return line.split(/[,\t]/).map((cell) => cell.trim());
}

const ISO_DATE_OR_TS_RE = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;

function isValidIsoDateLike(raw: string): boolean {
  if (!ISO_DATE_OR_TS_RE.test(raw)) return false;
  return Number.isFinite(Date.parse(raw));
}

/**
 * Parse a signups CSV. Two-column format: `user_id, signup_iso`. Header row
 * ("user_id,signup_iso") is silently dropped. Malformed rows (missing
 * user_id, malformed date) are silently skipped so a naïve paste from a
 * spreadsheet is safe — the pure helper's empty-state branch will surface
 * the miss visually rather than throwing.
 */
export function parseSignupsCsv(raw: string): SignupEvent[] {
  const rows: SignupEvent[] = [];
  for (const line of splitLines(raw)) {
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    const userId = cells[0];
    const iso = cells[1];
    if (!userId) continue;
    if (!isValidIsoDateLike(iso)) continue;
    rows.push({ user_id: userId, signup_iso: iso });
  }
  return rows;
}

/**
 * Parse an activities CSV. Two-column format: `user_id, activity_iso`.
 * Same header-drop + silent-skip semantics as `parseSignupsCsv`.
 */
export function parseActivitiesCsv(raw: string): ActivityEvent[] {
  const rows: ActivityEvent[] = [];
  for (const line of splitLines(raw)) {
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    const userId = cells[0];
    const iso = cells[1];
    if (!userId) continue;
    if (!isValidIsoDateLike(iso)) continue;
    rows.push({ user_id: userId, activity_iso: iso });
  }
  return rows;
}

/**
 * Coerce a reference_date_iso field into a `Date`. Blank / malformed inputs
 * return `undefined` so the pure helper defaults to `new Date()` — matches
 * the P1n-form pattern where blank optionals collapse to undefined rather
 * than a synthetic default.
 */
export function parseReferenceDate(raw: string): Date | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const ts = Date.parse(trimmed);
  if (!Number.isFinite(ts)) return undefined;
  return new Date(ts);
}

export type CohortSignalBand = "green" | "amber" | "grey";

/**
 * Traffic-light band for the tile header. Mirrors the pure helper's
 * `meets_min_buckets` flag + a "grey" empty-state so the tile can display
 * the same visual language the InvestorReadinessTile uses.
 */
export function pickCohortBand(matrix: CohortMatrix): CohortSignalBand {
  if (matrix.cohort_count === 0) return "grey";
  if (!matrix.meets_min_buckets) return "amber";
  // Investor-grade signal = ≥ MIN_COHORT_BUCKETS cohorts AND best W1 ≥ 0.4
  // (Sean Ellis / Rahul Vohra weekly-active PMF convention — matches the
  // investor-pack traction-cohort-section INVESTOR_GRADE_WEEK1_MIN=0.4).
  let bestWeek1: number | null = null;
  for (const row of matrix.cohorts) {
    const w1 = row.retention[1];
    if (typeof w1 === "number" && Number.isFinite(w1)) {
      if (bestWeek1 === null || w1 > bestWeek1) bestWeek1 = w1;
    }
  }
  if (bestWeek1 === null || bestWeek1 < 0.4) return "amber";
  return "green";
}

/** Headline copy per band — colocated so tile + tests read the same source. */
export const COHORT_HEADLINE: Record<CohortSignalBand, string> = {
  green: "Investor-grade retention signal",
  amber: `Signal below investor threshold — needs ${MIN_COHORT_BUCKETS}+ cohorts with W1 ≥ 40%`,
  grey: "Paste weekly signups + activities to draw your cohort chart",
};
