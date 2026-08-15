// Stripe pricing audit.
//
// Cross-checks every internal plan in the platform config against the Stripe
// Price object it points to. Goal: catch silent drift between the in-app
// price (rendered on /pricing, used by the dashboard) and the Stripe price
// the customer actually gets charged at checkout.
//
// Stripe Prices are IMMUTABLE — `unit_amount` cannot be edited. When the
// platform-config bumps a price, the workflow is:
//   1. audit detects drift
//   2. admin clicks "Create new Stripe Price" in /dashboard/admin/stripe-sync
//   3. UI returns the new `price_xxx` ID
//   4. admin updates STRIPE_PRICE_FOUNDING50 env var + redeploys
//   5. (optional) archive the old Price in the Stripe dashboard
//
// This file is the deterministic core. The /api route + admin UI consume it.

import type Stripe from "stripe";
import { getStripe, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getPlatformConfig } from "@/lib/platform-config";
import { GENERATED_PLANS } from "@/config/pricing/plans.generated";

export type AuditStatus = "match" | "drift" | "missing_price_id" | "stripe_not_configured" | "stripe_lookup_failed" | "archived";

export interface PlanAuditRow {
  planId: string;                  // internal plan id (founding50, growth, ...)
  label: string;                   // human-readable name
  expectedAud: number;             // from platform-config (dollars)
  expectedCents: number;           // from platform-config (cents)
  stripePriceId: string | null;
  stripeUnitAmount: number | null; // cents from Stripe
  stripeCurrency: string | null;
  stripeActive: boolean | null;
  status: AuditStatus;
  remediation: string;             // human guidance
  cadence?: "one-off" | "monthly" | "yearly" | "credit-pack";
}

export interface AuditResult {
  rows: PlanAuditRow[];
  generatedAt: string;
  hasDrift: boolean;
  hasMissingIds: boolean;
  stripeConfigured: boolean;
}

// ─── Plan registry (internal plan id → expected cents in config) ─────────────

interface PlanExpectation {
  planId: string;
  label: string;
  /** Pull cents from this field of PlatformConfig. */
  configField?: keyof Awaited<ReturnType<typeof getPlatformConfig>>;
  /** Or a static expected value (credit packs are not in config — they're tied to credits_N tier). */
  staticCents?: number;
  cadence: PlanAuditRow["cadence"];
  /**
   * Explicit env var to read the Stripe Price ID from. When set, bypasses
   * STRIPE_PRICE_MAP (used for v2 SKUs whose env var name doesn't follow the
   * `STRIPE_PRICE_${planId.toUpperCase()}` convention — e.g. accelerator_*
   * maps to STRIPE_PRICE_ACCEL_STARTER, founder_package to
   * STRIPE_PRICE_STARTUP_PACKAGE).
   */
  envVar?: string;
}

const LEGACY_PLANS: PlanExpectation[] = [
  // Headline tiers — driven by platform-config
  { planId: "founding50",    label: "Founding 100 (one-off)", configField: "founding_price_cents",      cadence: "one-off" },
  { planId: "growth",        label: "Growth — monthly",       configField: "growth_price_monthly_cents", cadence: "monthly" },
  { planId: "growth_annual", label: "Growth — annual",        configField: "growth_price_yearly_cents",  cadence: "yearly" },

  // Credit packs — static expectations matching the comments in stripe.ts
  { planId: "credits_5",   label: "5 credits pack",   staticCents: 500,  cadence: "credit-pack" },
  { planId: "credits_10",  label: "10 credits pack",  staticCents: 900,  cadence: "credit-pack" },
  { planId: "credits_25",  label: "25 credits pack",  staticCents: 2000, cadence: "credit-pack" },
  { planId: "credits_50",  label: "50 credits pack",  staticCents: 1500, cadence: "credit-pack" },
  { planId: "credits_100", label: "100 credits pack", staticCents: 2500, cadence: "credit-pack" },
];

/**
 * Derive audit rows for every active v2 SKU wired to a Stripe env var.
 *
 * Reads GENERATED_PLANS (built from plans.csv) so adding a new SKU to the CSV
 * automatically extends audit coverage — no manual PLANS[] edits needed.
 *
 * Skipped SKUs:
 *   - `interval: "free"`     — no Stripe Price exists (Free tier)
 *   - `interval: "custom"`   — enterprise / contact-sales, negotiated per-deal
 *   - `stripe_env_var: ""`   — not-yet-wired (dev placeholders)
 *   - `active: false`        — retired SKUs
 *   - `price_aud_cents: 0`   — zero-price rows (belong under 'free')
 */
function v2Plans(): PlanExpectation[] {
  return GENERATED_PLANS
    .filter((p) => p.active)
    .filter((p) => p.stripe_env_var !== "")
    .filter((p) => p.price_aud_cents > 0)
    .filter((p) => p.interval === "monthly" || p.interval === "yearly" || p.interval === "once")
    .map<PlanExpectation>((p) => ({
      planId: p.id,
      label: `${p.name} — ${p.interval}`,
      staticCents: p.price_aud_cents,
      cadence: p.interval === "monthly" ? "monthly"
             : p.interval === "yearly"  ? "yearly"
             : "one-off",
      envVar: p.stripe_env_var,
    }));
}

/** Full audit roster = legacy + auto-derived v2 (dedup by planId, legacy wins). */
function allPlans(): PlanExpectation[] {
  const seen = new Set(LEGACY_PLANS.map((p) => p.planId));
  const v2 = v2Plans().filter((p) => !seen.has(p.planId));
  return [...LEGACY_PLANS, ...v2];
}

// ─── Audit a single plan ──────────────────────────────────────────────────────

async function auditPlan(plan: PlanExpectation, cfg: Awaited<ReturnType<typeof getPlatformConfig>>): Promise<PlanAuditRow> {
  const expectedCents: number = plan.configField
    ? (cfg[plan.configField] as number)
    : (plan.staticCents ?? 0);
  const envVar = plan.envVar ?? `STRIPE_PRICE_${plan.planId.toUpperCase()}`;
  const stripePriceId = plan.envVar
    ? (process.env[plan.envVar] ?? null)
    : (STRIPE_PRICE_MAP[plan.planId] ?? null);

  // Base row, refined below
  const base: PlanAuditRow = {
    planId: plan.planId,
    label: plan.label,
    expectedAud: expectedCents / 100,
    expectedCents,
    stripePriceId,
    stripeUnitAmount: null,
    stripeCurrency: null,
    stripeActive: null,
    status: "missing_price_id",
    remediation: "",
    cadence: plan.cadence,
  };

  if (!stripePriceId) {
    base.remediation = `Set env var ${envVar} to the Stripe Price ID for this plan.`;
    return base;
  }

  const stripe = getStripe();
  if (!stripe) {
    return {
      ...base,
      status: "stripe_not_configured",
      remediation: "Stripe secret key not configured — set STRIPE_SECRET_KEY env var.",
    };
  }

  try {
    const price = await stripe.prices.retrieve(stripePriceId);
    const stripeUnitAmount = price.unit_amount ?? null;
    const stripeCurrency = price.currency ?? null;
    const stripeActive = price.active ?? null;

    if (!stripeActive) {
      return {
        ...base,
        stripeUnitAmount,
        stripeCurrency,
        stripeActive,
        status: "archived",
        remediation: `Stripe Price ${stripePriceId} is archived. Create a new Price at A$${expectedCents / 100} and update the env var.`,
      };
    }

    if (stripeUnitAmount === expectedCents && stripeCurrency?.toLowerCase() === "aud") {
      return {
        ...base,
        stripeUnitAmount,
        stripeCurrency,
        stripeActive,
        status: "match",
        remediation: "OK — Stripe matches platform-config.",
      };
    }

    // Drift
    return {
      ...base,
      stripeUnitAmount,
      stripeCurrency,
      stripeActive,
      status: "drift",
      remediation: `Drift: platform-config expects A$${expectedCents / 100} (${expectedCents}¢), Stripe has ${stripeCurrency?.toUpperCase()} ${stripeUnitAmount}¢. Stripe Prices are immutable — create a new Price at A$${expectedCents / 100}, paste new ID into env var, redeploy. Then archive the old Price.`,
    };
  } catch (err) {
    return {
      ...base,
      status: "stripe_lookup_failed",
      remediation: `Failed to fetch Stripe Price ${stripePriceId}: ${(err as Error).message}. Confirm the ID exists in the same Stripe account (test vs live).`,
    };
  }
}

// ─── Public entry ────────────────────────────────────────────────────────────

export async function runStripePricingAudit(): Promise<AuditResult> {
  const cfg = await getPlatformConfig();
  const rows = await Promise.all(allPlans().map((p) => auditPlan(p, cfg)));
  return {
    rows,
    generatedAt: new Date().toISOString(),
    hasDrift: rows.some((r) => r.status === "drift" || r.status === "archived"),
    hasMissingIds: rows.some((r) => r.status === "missing_price_id"),
    stripeConfigured: rows.every((r) => r.status !== "stripe_not_configured"),
  };
}

// ─── Helper: create a fresh Stripe Price matching platform-config ────────────

export interface CreatePriceResult {
  ok: boolean;
  newPriceId?: string;
  envVarName?: string;
  error?: string;
}

export async function createFreshStripePrice(planId: string, opts: { productName?: string } = {}): Promise<CreatePriceResult> {
  const plan = allPlans().find((p) => p.planId === planId);
  if (!plan) return { ok: false, error: `Unknown plan: ${planId}` };

  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe not configured." };

  const cfg = await getPlatformConfig();
  const expectedCents: number = plan.configField
    ? (cfg[plan.configField] as number)
    : (plan.staticCents ?? 0);

  // Find or create the parent Product. We attach to an existing product if one
  // matches the plan id; otherwise create a new product.
  let productId: string | null = null;
  try {
    const existing = await stripe.products.search({
      query: `metadata["blockid_plan_id"]:"${planId}"`,
      limit: 1,
    });
    if (existing.data[0]) productId = existing.data[0].id;
  } catch {
    // search may not be available in older Stripe accounts; fall through to create
  }

  if (!productId) {
    const product = await stripe.products.create({
      name: opts.productName ?? plan.label,
      metadata: { blockid_plan_id: planId },
    });
    productId = product.id;
  }

  const cadenceMap: Record<NonNullable<PlanAuditRow["cadence"]>, Stripe.PriceCreateParams["recurring"] | undefined> = {
    "one-off": undefined,
    "credit-pack": undefined,
    "monthly": { interval: "month" },
    "yearly": { interval: "year" },
  };

  try {
    const price = await stripe.prices.create({
      product: productId,
      currency: "aud",
      unit_amount: expectedCents,
      recurring: cadenceMap[plan.cadence ?? "one-off"],
      metadata: { blockid_plan_id: planId, created_by: "stripe-pricing-audit" },
    });
    return {
      ok: true,
      newPriceId: price.id,
      envVarName: plan.envVar ?? `STRIPE_PRICE_${planId.toUpperCase()}`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

