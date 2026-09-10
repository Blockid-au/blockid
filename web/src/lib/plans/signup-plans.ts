// Signup plan allow-lists + account-type → segment mapping (T0269, G12 §3c-3).
//
// Single source of truth for BOTH `/signup` (server page) and
// `POST /api/auth/register-with-card` so the two allow-lists can never drift
// again (they did — G12-6). Dependency-light (trial-copy + segments +
// pricing-data are all plain data modules) so client and server bundles can
// import it.
//
// Two signup segments:
//   founder   → founder_starter / founder_growth / founder_enterprise
//   evaluator → investor_angel (Scout) / investor_advisor (Firm) /
//               investor_vc_small (Program) — re-used SKU ids per D2
//               (docs/plans/evaluator-traction-2026-09-10.md §3b).
//
// Every plan on either list is a card-required Stripe trial
// (`payment_method_collection:"always"`, `trial_period_days` from the plan
// row — founder decision D1 2026-09-10).

import { NEW_SIGNUP_TIER_IDS } from "@/lib/pricing-data";
import { TRIAL_DAYS } from "./trial-copy";
import type { Segment } from "@/lib/segments";

export type SignupSegment = "founder" | "evaluator";

export const FOUNDER_TRIAL_PLAN_IDS = [
  "founder_starter",
  "founder_growth",
  "founder_enterprise",
] as const;

export const EVALUATOR_TRIAL_PLAN_IDS = [
  "investor_angel",
  "investor_advisor",
  "investor_vc_small",
] as const;

export type FounderTrialPlanId = (typeof FOUNDER_TRIAL_PLAN_IDS)[number];
export type EvaluatorTrialPlanId = (typeof EVALUATOR_TRIAL_PLAN_IDS)[number];
export type SignupTrialPlanId = FounderTrialPlanId | EvaluatorTrialPlanId;

export const DEFAULT_PLAN_BY_SEGMENT: Record<SignupSegment, SignupTrialPlanId> = {
  founder: "founder_starter",
  evaluator: "investor_angel",
};

/**
 * Plan ids `register-with-card` accepts. Superset of the legacy new-signup
 * tiers (kept so old referrers keep working) + both trial ladders.
 * founder_scale (Pro, A$299) stays excluded — retired 2026-09-08.
 */
export const SIGNUP_ALLOWED_PLAN_IDS: ReadonlySet<string> = new Set<string>([
  ...NEW_SIGNUP_TIER_IDS,
  ...FOUNDER_TRIAL_PLAN_IDS,
  ...EVALUATOR_TRIAL_PLAN_IDS,
]);

export function isSignupPlanAllowed(planId: string | null | undefined): boolean {
  return typeof planId === "string" && SIGNUP_ALLOWED_PLAN_IDS.has(planId);
}

/**
 * Can this plan ROW be bought self-serve? A negotiated tier
 * (`plans.interval = 'custom'`, e.g. founder_enterprise — invoiced offline,
 * never minted as a Stripe Price) or a row without a positive price must
 * answer "contact sales", never start a card-required trial (review
 * 2026-09-10 #17: the id allow-list alone let founder_enterprise through and
 * only an unprovisioned env key kept it from self-serve). Used by both the
 * `/signup` picker and `register-with-card`.
 */
export function isSelfServePlan(
  plan: { interval?: string | null; price_aud_cents?: number | null } | null | undefined,
): boolean {
  if (!plan) return false;
  if (plan.interval === "custom") return false;
  const price = plan.price_aud_cents;
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

export function isEvaluatorPlanId(
  planId: string | null | undefined,
): planId is EvaluatorTrialPlanId {
  return (
    typeof planId === "string" &&
    (EVALUATOR_TRIAL_PLAN_IDS as readonly string[]).includes(planId)
  );
}

export function isFounderPlanId(
  planId: string | null | undefined,
): planId is FounderTrialPlanId {
  return (
    typeof planId === "string" &&
    (FOUNDER_TRIAL_PLAN_IDS as readonly string[]).includes(planId)
  );
}

/** Plan ids the `/signup` picker shows for a given segment. */
export function trialPlanIdsForSegment(
  segment: SignupSegment,
): readonly SignupTrialPlanId[] {
  return segment === "evaluator" ? EVALUATOR_TRIAL_PLAN_IDS : FOUNDER_TRIAL_PLAN_IDS;
}

/**
 * Resolve the signup segment from `?segment=` + `?plan=`. An explicit
 * `segment=evaluator` wins; otherwise an evaluator plan id implies the
 * evaluator segment; everything else is founder.
 */
export function resolveSignupSegment(
  segmentParam: string | string[] | undefined,
  planParam: string | string[] | undefined,
): SignupSegment {
  const seg = typeof segmentParam === "string" ? segmentParam.trim().toLowerCase() : "";
  if (seg === "evaluator") return "evaluator";
  if (seg === "founder") return "founder";
  if (typeof planParam === "string" && isEvaluatorPlanId(planParam)) return "evaluator";
  return "founder";
}

/**
 * Pick the plan the picker should pre-select: `?plan=` when it belongs to
 * the segment's ladder, else the segment default (Starter / Scout).
 */
export function resolvePreferredPlan(
  segment: SignupSegment,
  planParam: string | string[] | undefined,
): SignupTrialPlanId {
  const ids = trialPlanIdsForSegment(segment) as readonly string[];
  if (typeof planParam === "string" && ids.includes(planParam)) {
    return planParam as SignupTrialPlanId;
  }
  return DEFAULT_PLAN_BY_SEGMENT[segment];
}

// ---------------------------------------------------------------------------
// Account types offered on the signup form + their `app_users.segment`.
// ---------------------------------------------------------------------------

/**
 * `account_type` values `register-with-card` accepts. Mirrors the zod enum in
 * the route and the `app_users_account_type_check` CHECK (migration 0310).
 */
export const SIGNUP_ACCOUNT_TYPES = [
  "founder",
  "investor",
  "accelerator",
  "incubator",
  "advisor",
  "service_provider",
  "journalist",
] as const;

export type SignupAccountType = (typeof SIGNUP_ACCOUNT_TYPES)[number];

export function isSignupAccountType(v: unknown): v is SignupAccountType {
  return typeof v === "string" && (SIGNUP_ACCOUNT_TYPES as readonly string[]).includes(v);
}

export interface AccountTypeOption {
  value: SignupAccountType;
  label: string;
}

/** Account-type choices shown on the evaluator variant of `/signup`. */
export const EVALUATOR_ACCOUNT_TYPE_OPTIONS: readonly AccountTypeOption[] = [
  { value: "investor", label: "Investor" },
  { value: "accelerator", label: "Accelerator or incubator" },
  { value: "advisor", label: "Advisor or consulting firm" },
  { value: "service_provider", label: "Service provider" },
];

/** Account-type choices shown on the founder variant of `/signup`. */
export const FOUNDER_ACCOUNT_TYPE_OPTIONS: readonly AccountTypeOption[] = [
  { value: "founder", label: "Founder" },
  { value: "investor", label: "Investor" },
  { value: "journalist", label: "Journalist" },
];

export function accountTypeOptionsForSegment(
  segment: SignupSegment,
): readonly AccountTypeOption[] {
  return segment === "evaluator"
    ? EVALUATOR_ACCOUNT_TYPE_OPTIONS
    : FOUNDER_ACCOUNT_TYPE_OPTIONS;
}

/**
 * Map the chosen account_type (+ plan) to the `app_users.segment` bucket so
 * segment-filtered jobs (`investor-weekly-digest` filters
 * `segment in (investor_angel, investor_vc)`) pick self-serve evaluators up.
 *
 * The segment enum deliberately stays at its 0073 shape — `incubator` and
 * `service_provider` are *account types*, not segments (see migration 0310):
 *   investor          → investor_angel (investor_vc when plan = Program / VC Ent)
 *   advisor           → advisor
 *   service_provider  → advisor
 *   accelerator       → accelerator
 *   incubator         → accelerator
 *   founder           → founder
 *   journalist        → founder (no press segment exists; keeps the 0073 default)
 */
export function segmentForAccountType(
  accountType: string | null | undefined,
  planId?: string | null,
): Segment {
  switch (accountType) {
    case "investor":
      return planId === "investor_vc_small" || planId === "investor_vc_ent"
        ? "investor_vc"
        : "investor_angel";
    case "advisor":
    case "service_provider":
      return "advisor";
    case "accelerator":
    case "incubator":
      return "accelerator";
    case "founder":
    case "journalist":
    default:
      return "founder";
  }
}

// ---------------------------------------------------------------------------
// Trial length
// ---------------------------------------------------------------------------

/**
 * Trial length for a resolved plan row. Reads `plans.trial_days`
 * (plans.csv → plans table → `getPlanCached`) and falls back to the canonical
 * TRIAL_DAYS (7) when the row is missing or carries 0 / a non-integer.
 */
export function resolveTrialDays(
  plan: { trial_days?: number | null } | null | undefined,
): number {
  const raw = plan?.trial_days;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  return TRIAL_DAYS;
}

// ---------------------------------------------------------------------------
// Evaluator display labels (public rung names per D2). plans-v2.ts / plans.csv
// still carry the internal names (Angel / Advisor / VC Small); the public
// ladder sells them as Scout / Firm / Program.
// ---------------------------------------------------------------------------

export const EVALUATOR_PLAN_LABELS: Record<EvaluatorTrialPlanId, string> = {
  investor_angel: "Scout",
  investor_advisor: "Firm",
  investor_vc_small: "Program",
};

export function evaluatorPlanLabel(planId: string | null | undefined): string | null {
  return isEvaluatorPlanId(planId) ? EVALUATOR_PLAN_LABELS[planId] : null;
}
