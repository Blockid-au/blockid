// Pure helpers for the WGEA threshold form (P1n-form).
//
// Kept isolated from the React client so the form → API mapping and the
// result → traffic-light banding can be unit-tested without a DOM.
//
// Wire shape (WGEAInput / WGEAResult) is owned by
// web/src/lib/compliance/wgea-threshold.ts. This module carries UI state as
// strings (so <input> values round-trip cleanly), coerces to a numerically-
// clean WGEAInput on submit, and picks the traffic-light band for the
// result banner.

import type {
  WGEAInput,
  WGEAResult,
} from "@/lib/compliance/wgea-threshold";

/** Form state — every number field is a string so <input> can round-trip. */
export interface WgeaFormState {
  current_headcount_au: string;
  monthly_headcount_last_12_months: string;
  has_previously_reported: boolean;
  last_report_lodged_at: string;
  reporting_periods_since_last_over_threshold: string;
}

export function makeEmptyWgeaFormState(): WgeaFormState {
  return {
    current_headcount_au: "0",
    monthly_headcount_last_12_months: "",
    has_previously_reported: false,
    last_report_lodged_at: "",
    reporting_periods_since_last_over_threshold: "",
  };
}

function num(s: string, fallback = 0): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function parseCsvNumbers(raw: string): number[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => Number.parseFloat(t))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

/** Convert form state → the WGEAInput shape POSTed to /api/compliance/wgea-threshold. */
export function toWgeaInput(state: WgeaFormState): WGEAInput {
  const history = parseCsvNumbers(state.monthly_headcount_last_12_months);
  const periods = state.reporting_periods_since_last_over_threshold.trim();
  return {
    current_headcount_au: num(state.current_headcount_au, 0),
    monthly_headcount_last_12_months: history.length > 0 ? history : undefined,
    has_previously_reported: state.has_previously_reported,
    last_report_lodged_at:
      state.last_report_lodged_at.trim().length > 0
        ? state.last_report_lodged_at.trim()
        : undefined,
    reporting_periods_since_last_over_threshold:
      periods.length > 0 ? num(periods, 0) : undefined,
  };
}

/** Rehydrate the form from a persisted WGEAInput (GET /api/compliance/wgea-threshold). */
export function fromWgeaInput(input: WGEAInput): WgeaFormState {
  const empty = makeEmptyWgeaFormState();
  return {
    ...empty,
    current_headcount_au: String(input.current_headcount_au ?? 0),
    monthly_headcount_last_12_months: Array.isArray(input.monthly_headcount_last_12_months)
      ? input.monthly_headcount_last_12_months.join(", ")
      : "",
    has_previously_reported: Boolean(input.has_previously_reported),
    last_report_lodged_at: input.last_report_lodged_at ?? "",
    reporting_periods_since_last_over_threshold:
      typeof input.reporting_periods_since_last_over_threshold === "number"
        ? String(input.reporting_periods_since_last_over_threshold)
        : "",
  };
}

export type WgeaBand = "green" | "amber" | "red";

/**
 * Traffic-light band for the result banner. The mapping mirrors the dashboard
 * compliance-panel WGEA tile so a founder sees the same colour before and
 * after they click through.
 *
 *   red   — report_required (peak headcount ≥ 100 and no report on file yet)
 *   amber — grace_period OR approaching_threshold
 *   green — already_reporting OR not_required
 */
export function pickWgeaBand(result: WGEAResult): WgeaBand {
  switch (result.action_required) {
    case "report_required":
      return "red";
    case "grace_period":
    case "approaching_threshold":
      return "amber";
    case "already_reporting":
    case "not_required":
    default:
      return "green";
  }
}
