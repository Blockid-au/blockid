// Pure helpers for reseller_credit_grants — grants to attributed customers
// and sandbox spend by the reseller org itself.
//
// Kept dependency-free so budget maths, month-key formatting, and
// rate-limit decisions can be unit tested without a live DB. Mirrors the
// pattern used by web/src/lib/reseller/webhook-helpers.ts.
//
// See docs/plans/reseller-module-plan.md § D.3 (data model), § U.4
// (sandbox mechanics), § U.15.2 (sandbox caps + rate limit), and
// migration web/supabase/migrations/0096_reseller_credit_grants.sql.

export type ResellerCreditGrantKind = "grant" | "sandbox_spend";

/**
 * Persistence shape mirrored from migration 0096. Kept minimal so tests can
 * construct fixtures inline.
 */
export interface ResellerCreditGrantRow {
  reseller_id: string;
  kind: ResellerCreditGrantKind;
  amount: number; // grant > 0; sandbox_spend < 0
  month_key: string; // 'YYYY-MM'
  over_budget: boolean;
  created_at: string; // ISO 8601
  sandbox_project_id?: string | null;
  target_user_id?: string | null;
}

/**
 * UTC-based month key. Matches currentMonthKey() in
 * web/src/app/api/cron/credit-reset/route.ts:27 so budget rollups do not
 * drift when the server host lives in AEST.
 */
export function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Roll grants + sandbox spend up into a single month view. Amounts are
 * summed as absolute credits so callers can compare directly against
 * resellers.monthly_credit_budget and monthly_sandbox_credits.
 */
export function computeMonthlyUsage(
  grants: readonly ResellerCreditGrantRow[],
  key: string,
): {
  grant_credits_used: number;
  sandbox_credits_used: number;
  over_budget_grant_count: number;
} {
  let grantUsed = 0;
  let sandboxUsed = 0;
  let overCount = 0;
  for (const g of grants) {
    if (g.month_key !== key) continue;
    if (g.kind === "grant") {
      grantUsed += g.amount;
      if (g.over_budget) overCount += 1;
    } else if (g.kind === "sandbox_spend") {
      sandboxUsed += Math.abs(g.amount);
    }
  }
  return {
    grant_credits_used: grantUsed,
    sandbox_credits_used: sandboxUsed,
    over_budget_grant_count: overCount,
  };
}

export interface GrantDecisionInput {
  /** Credits the reseller is trying to grant this call. Must be > 0. */
  requested_amount: number;
  /** Reseller's monthly_credit_budget (from resellers row). */
  monthly_credit_budget: number;
  /** Credits already granted this month (from computeMonthlyUsage.grant_credits_used). */
  already_granted_this_month: number;
  /** Reseller org capability flag; false means the row shouldn't exist. */
  can_grant_credits: boolean;
  /** True when an admin has approved this specific over-budget grant. */
  admin_over_budget_approved?: boolean;
}

export type GrantDecision =
  | { ok: true; over_budget: false }
  | { ok: true; over_budget: true } // approved by admin
  | { ok: false; reason: GrantDeniedReason };

export type GrantDeniedReason =
  | "invalid_amount"
  | "capability_disabled"
  | "over_budget_requires_approval";

/**
 * Decide whether a proposed grant is legal without touching the DB.
 *
 * Rules (per plan § R8):
 *   1. requested_amount must be a positive integer.
 *   2. reseller.can_grant_credits must be true (capability gate).
 *   3. If the grant fits within the remaining monthly_credit_budget, allow
 *      and record over_budget=false.
 *   4. If the grant breaks the budget, require admin_over_budget_approved.
 *      Approved → allow with over_budget=true. Not approved → deny.
 *   5. monthly_credit_budget=0 with can_grant_credits=true means "grants
 *      allowed but nothing pre-approved" — every grant needs approval.
 */
export function decideGrant(input: GrantDecisionInput): GrantDecision {
  const {
    requested_amount,
    monthly_credit_budget,
    already_granted_this_month,
    can_grant_credits,
    admin_over_budget_approved = false,
  } = input;

  if (!Number.isFinite(requested_amount) || requested_amount <= 0 || !Number.isInteger(requested_amount)) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (!can_grant_credits) {
    return { ok: false, reason: "capability_disabled" };
  }
  const projected = already_granted_this_month + requested_amount;
  if (projected <= monthly_credit_budget) {
    return { ok: true, over_budget: false };
  }
  if (admin_over_budget_approved) {
    return { ok: true, over_budget: true };
  }
  return { ok: false, reason: "over_budget_requires_approval" };
}

export interface SandboxSpendInput {
  /** Credits the caller wants to spend (positive integer). */
  requested_amount: number;
  /** resellers.monthly_sandbox_credits (default 500 per U.15.2). */
  monthly_sandbox_credits: number;
  /** All grants for this reseller — helper filters by kind + window. */
  grants: readonly ResellerCreditGrantRow[];
  /** Sandbox project id being debited. */
  sandbox_project_id: string;
  /** Current time — injected so tests can pin the window. */
  now: Date;
  /** Hourly rate limit (default 50 per U.15.2). */
  hourly_limit?: number;
}

export type SandboxSpendDecision =
  | { ok: true }
  | { ok: false; reason: SandboxDeniedReason; remaining_month?: number; remaining_hour?: number };

export type SandboxDeniedReason =
  | "invalid_amount"
  | "monthly_cap_reached"
  | "hourly_rate_limit";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Decide whether a sandbox spend is legal per U.15.2:
 *   - monthly cap: sum of sandbox_spend rows in the current month_key must
 *     not exceed monthly_sandbox_credits.
 *   - hourly rate: sum of sandbox_spend rows in the last 60 minutes for
 *     this specific sandbox_project_id must not exceed hourly_limit (50).
 *
 * The function is a pure predicate — the caller is responsible for
 * inserting the row on ok:true.
 */
export function decideSandboxSpend(input: SandboxSpendInput): SandboxSpendDecision {
  const {
    requested_amount,
    monthly_sandbox_credits,
    grants,
    sandbox_project_id,
    now,
    hourly_limit = 50,
  } = input;

  if (!Number.isFinite(requested_amount) || requested_amount <= 0 || !Number.isInteger(requested_amount)) {
    return { ok: false, reason: "invalid_amount" };
  }

  const key = monthKey(now);
  const usage = computeMonthlyUsage(grants, key);
  const remainingMonth = monthly_sandbox_credits - usage.sandbox_credits_used;
  if (requested_amount > remainingMonth) {
    return {
      ok: false,
      reason: "monthly_cap_reached",
      remaining_month: Math.max(0, remainingMonth),
    };
  }

  const hourStart = now.getTime() - HOUR_MS;
  let hourSpent = 0;
  for (const g of grants) {
    if (g.kind !== "sandbox_spend") continue;
    if (g.sandbox_project_id !== sandbox_project_id) continue;
    const t = Date.parse(g.created_at);
    if (Number.isFinite(t) && t >= hourStart) {
      hourSpent += Math.abs(g.amount);
    }
  }
  const remainingHour = hourly_limit - hourSpent;
  if (requested_amount > remainingHour) {
    return {
      ok: false,
      reason: "hourly_rate_limit",
      remaining_hour: Math.max(0, remainingHour),
    };
  }

  return { ok: true };
}
