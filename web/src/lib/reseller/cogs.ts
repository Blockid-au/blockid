// AI-credit cost-of-goods-sold model for the reseller module.
//
// Per docs/plans/reseller-module-plan.md § U.15.13, H.18.
// Starting value A$0.05 per credit; auto-adjust monthly from actual AI
// provider bills (out of scope for this file — set via env override).
//
// Read via `getCogsPerCreditAud()`; never import the raw constant in
// business logic so a monthly env update propagates without redeploy.

import "server-only";

const DEFAULT_COGS_PER_CREDIT_AUD = 0.05;

export function getCogsPerCreditAud(): number {
  const envRaw = process.env.COGS_PER_CREDIT_AUD;
  if (!envRaw) return DEFAULT_COGS_PER_CREDIT_AUD;
  const parsed = Number(envRaw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    // Silent fallback prevents a bad env from breaking billing math.
    return DEFAULT_COGS_PER_CREDIT_AUD;
  }
  return parsed;
}

/** AUD cost to BlockID for granting `credits` to a customer or sandbox. */
export function estimateBudgetCostAud(credits: number): number {
  if (!Number.isFinite(credits) || credits < 0) return 0;
  return credits * getCogsPerCreditAud();
}

/** AUD cost of a reseller's full monthly customer-grant budget at the current rate. */
export function monthlyCustomerBudgetCostAud(monthlyCreditBudget: number): number {
  return estimateBudgetCostAud(monthlyCreditBudget);
}

/** AUD cost of a reseller's monthly sandbox ceiling. */
export function monthlySandboxBudgetCostAud(monthlySandboxCredits: number): number {
  return estimateBudgetCostAud(monthlySandboxCredits);
}
