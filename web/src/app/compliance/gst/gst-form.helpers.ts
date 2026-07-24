// Pure helpers for the GST threshold form (P1n-gst-form).
//
// Kept isolated from the React client so the form → API mapping and the
// result → traffic-light banding can be unit-tested without a DOM. Mirrors
// the WGEA + Modern Slavery form.helpers shape from P1n-form so all four
// compliance detail-page forms carry the same round-trip contract.
//
// Wire shape (GSTInput / GSTResult) is owned by
// web/src/lib/compliance/gst-threshold.ts. This module carries UI state as
// strings (so <input> values round-trip cleanly), coerces to a numerically-
// clean GSTInput on submit, and picks the traffic-light band for the result
// banner using the same mapping the dashboard CompliancePanel GstTile uses.

import type { GSTInput, GSTResult } from "@/lib/compliance/gst-threshold";

/** Form state — every numeric field is a string so <input> can round-trip. */
export interface GstFormState {
  monthly_turnover_last_12_months: string;
  projected_next_12_months: string;
  registered_for_gst: boolean;
  registration_date: string;
  abn: string;
}

export function makeEmptyGstFormState(): GstFormState {
  return {
    monthly_turnover_last_12_months: "",
    projected_next_12_months: "",
    registered_for_gst: false,
    registration_date: "",
    abn: "",
  };
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

/** Convert form state → the GSTInput shape POSTed to /api/compliance/gst-threshold. */
export function toGstInput(state: GstFormState): GSTInput {
  const actual = parseCsvNumbers(state.monthly_turnover_last_12_months);
  const projected = parseCsvNumbers(state.projected_next_12_months);
  const abn = state.abn.trim();
  const registrationDate = state.registration_date.trim();
  return {
    monthly_turnover_last_12_months: actual,
    projected_next_12_months: projected.length > 0 ? projected : undefined,
    registered_for_gst: state.registered_for_gst,
    registration_date: registrationDate.length > 0 ? registrationDate : undefined,
    abn: abn.length > 0 ? abn : undefined,
  };
}

/** Rehydrate the form from a persisted GSTInput (GET /api/compliance/gst-threshold). */
export function fromGstInput(input: GSTInput): GstFormState {
  const empty = makeEmptyGstFormState();
  return {
    ...empty,
    monthly_turnover_last_12_months: Array.isArray(
      input.monthly_turnover_last_12_months,
    )
      ? input.monthly_turnover_last_12_months.join(", ")
      : "",
    projected_next_12_months: Array.isArray(input.projected_next_12_months)
      ? input.projected_next_12_months.join(", ")
      : "",
    registered_for_gst: Boolean(input.registered_for_gst),
    registration_date: input.registration_date ?? "",
    abn: input.abn ?? "",
  };
}

export type GstBand = "green" | "amber" | "red";

/**
 * Traffic-light band for the result banner. Mirrors the dashboard
 * compliance-panel GstTile so a founder sees the same colour before and
 * after they click through.
 *
 *   red   — urgent_register (actual trailing-12mo ≥ A$75k, ATO 21-day window)
 *   amber — register_within_21_days (projected 12mo will cross)
 *   green — already_registered OR none (below threshold)
 */
export function pickGstBand(result: GSTResult): GstBand {
  switch (result.action_required) {
    case "urgent_register":
      return "red";
    case "register_within_21_days":
      return "amber";
    case "already_registered":
    case "none":
    default:
      return "green";
  }
}
