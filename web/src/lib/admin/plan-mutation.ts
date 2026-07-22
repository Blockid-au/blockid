// Pure helpers for the P12.7 plan-change endpoint.
//
// POST /api/admin/users/[id]/plan carries { plan, reconcile_credits? }; the
// route calls validatePlanBody + decidePlanChange here so the branch stays
// Supabase-free and unit-testable. Mirrors the P12.5 create + P12.6
// permissions pattern (validate* + decide*/apply* pure lib + thin route).

// Plan slug shape — lowercase alpha/digit/underscore, must start with a
// letter. Matches the plans.csv id column (founder_free, investor_vc_small,
// etc.) and the legacy pre-v2 SKUs (free, founding50, growth, growth_annual)
// so an admin can flip a user onto either the v2 catalogue or a grandfathered
// legacy row that entitlements.LEGACY_PLAN_MAP still resolves.
const PLAN_SLUG = /^[a-z][a-z0-9_]{0,63}$/;

export interface RawPlanBody {
  plan?: unknown;
  reconcile_credits?: unknown;
}

export interface NormalisedPlanBody {
  plan: string;
  reconcile_credits: boolean;
}

export type PlanValidationError =
  | "invalid_body"
  | "plan_invalid"
  | "plan_slug_invalid"
  | "reconcile_credits_invalid";

export type PlanValidation =
  | { ok: true; value: NormalisedPlanBody }
  | { ok: false; reason: PlanValidationError };

/**
 * Coerce the raw request body into a NormalisedPlanBody or return the
 * specific validation error code the route surfaces as 400.
 *
 * Gates enforced (in order — first failing gate wins):
 *   1. body is an object
 *   2. plan is a non-empty string matching PLAN_SLUG
 *   3. reconcile_credits, when provided, is a boolean
 */
export function validatePlanBody(raw: unknown): PlanValidation {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_body" };
  const body = raw as RawPlanBody;

  if (typeof body.plan !== "string" || body.plan.trim().length === 0) {
    return { ok: false, reason: "plan_invalid" };
  }
  const plan = body.plan.trim();
  if (!PLAN_SLUG.test(plan)) {
    return { ok: false, reason: "plan_slug_invalid" };
  }

  let reconcile_credits = false;
  if (body.reconcile_credits !== undefined && body.reconcile_credits !== null) {
    if (typeof body.reconcile_credits !== "boolean") {
      return { ok: false, reason: "reconcile_credits_invalid" };
    }
    reconcile_credits = body.reconcile_credits;
  }

  return { ok: true, value: { plan, reconcile_credits } };
}

export interface PlanDecision {
  changed: boolean;
  grant_credits: number;
}

/**
 * Decide the net effect of the plan mutation given the target's current plan
 * and the destination plan's monthly_credits. Kept pure so the test can lock
 * down the no-op / no-grant / grant paths without touching Supabase or
 * grantCredits().
 *
 * Rules:
 *   - changed=false when the target already sits on the requested plan (the
 *     route short-circuits and skips both the UPDATE and the audit write).
 *   - grant_credits > 0 only when the caller asked for reconciliation AND the
 *     destination plan advertises a positive monthly_credits allowance. A
 *     zero or negative allowance (free tier, unlimited sentinel -1) does
 *     NOT trigger a grant so the admin does not accidentally hand out a
 *     signed-integer overflow's worth of credits.
 */
export function decidePlanChange(
  currentPlan: string,
  nextPlan: string,
  reconcileCredits: boolean,
  monthlyCredits: number | null | undefined,
): PlanDecision {
  if (currentPlan === nextPlan) {
    return { changed: false, grant_credits: 0 };
  }
  let grant = 0;
  if (reconcileCredits && typeof monthlyCredits === "number" && monthlyCredits > 0) {
    grant = Math.floor(monthlyCredits);
  }
  return { changed: true, grant_credits: grant };
}
