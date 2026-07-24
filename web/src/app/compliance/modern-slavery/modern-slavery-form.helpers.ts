// Pure helpers for the Modern Slavery Act threshold form (P1n-form).
//
// Kept isolated from the React client so the form → API mapping and the
// result → traffic-light banding can be unit-tested without a DOM.
//
// Wire shape (ModernSlaveryInput / ModernSlaveryResult) is owned by
// web/src/lib/compliance/modern-slavery-threshold.ts. This module carries UI
// state as strings (so <input> values round-trip cleanly), coerces to a
// numerically-clean ModernSlaveryInput on submit, and picks the traffic-light
// band for the result banner.

import type {
  ModernSlaveryInput,
  ModernSlaveryResult,
} from "@/lib/compliance/modern-slavery-threshold";

/** Form state — every number field is a string so <input> can round-trip. */
export interface ModernSlaveryFormState {
  current_period_revenue_aud: string;
  projected_full_period_revenue_aud: string;
  last_full_period_revenue_aud: string;
  current_fy_end_iso: string;
  last_statement_lodged_at: string;
  is_australian_or_carrying_on_business_in_au: boolean;
}

export function makeEmptyModernSlaveryFormState(): ModernSlaveryFormState {
  return {
    current_period_revenue_aud: "0",
    projected_full_period_revenue_aud: "",
    last_full_period_revenue_aud: "",
    current_fy_end_iso: "",
    last_statement_lodged_at: "",
    is_australian_or_carrying_on_business_in_au: true,
  };
}

function num(s: string, fallback = 0): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(s: string): number | undefined {
  const t = s.trim();
  if (t.length === 0) return undefined;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

function optionalStr(s: string): string | undefined {
  const t = s.trim();
  return t.length === 0 ? undefined : t;
}

/** Convert form state → the ModernSlaveryInput shape POSTed to the API. */
export function toModernSlaveryInput(
  state: ModernSlaveryFormState,
): ModernSlaveryInput {
  return {
    current_period_revenue_aud: num(state.current_period_revenue_aud, 0),
    projected_full_period_revenue_aud: optionalNum(
      state.projected_full_period_revenue_aud,
    ),
    last_full_period_revenue_aud: optionalNum(
      state.last_full_period_revenue_aud,
    ),
    current_fy_end_iso: optionalStr(state.current_fy_end_iso),
    last_statement_lodged_at: optionalStr(state.last_statement_lodged_at),
    is_australian_or_carrying_on_business_in_au:
      state.is_australian_or_carrying_on_business_in_au,
  };
}

/** Rehydrate the form from a persisted ModernSlaveryInput. */
export function fromModernSlaveryInput(
  input: ModernSlaveryInput,
): ModernSlaveryFormState {
  const empty = makeEmptyModernSlaveryFormState();
  return {
    ...empty,
    current_period_revenue_aud: String(input.current_period_revenue_aud ?? 0),
    projected_full_period_revenue_aud:
      typeof input.projected_full_period_revenue_aud === "number"
        ? String(input.projected_full_period_revenue_aud)
        : "",
    last_full_period_revenue_aud:
      typeof input.last_full_period_revenue_aud === "number"
        ? String(input.last_full_period_revenue_aud)
        : "",
    current_fy_end_iso: input.current_fy_end_iso ?? "",
    last_statement_lodged_at: input.last_statement_lodged_at ?? "",
    is_australian_or_carrying_on_business_in_au:
      input.is_australian_or_carrying_on_business_in_au ?? true,
  };
}

export type ModernSlaveryBand = "green" | "amber" | "red";

/**
 * Traffic-light band for the result banner. The mapping mirrors the dashboard
 * compliance-panel Modern Slavery tile so a founder sees the same colour
 * before and after they click through.
 *
 *   red   — statement_overdue OR statement_due_soon within 30 days
 *   amber — statement_due_soon (>30 days) OR statement_required OR approaching_threshold
 *   green — already_lodged OR not_required
 */
export function pickModernSlaveryBand(
  result: ModernSlaveryResult,
): ModernSlaveryBand {
  switch (result.action_required) {
    case "statement_overdue":
      return "red";
    case "statement_due_soon":
      return typeof result.days_until_statement_due === "number" &&
        result.days_until_statement_due <= 30
        ? "red"
        : "amber";
    case "statement_required":
    case "approaching_threshold":
      return "amber";
    case "already_lodged":
    case "not_required":
    default:
      return "green";
  }
}
