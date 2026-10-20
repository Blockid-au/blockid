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
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { PAYG_SKUS, PAYG_SKU_LIST, displayPriceCents, isPaygSkuId, type PaygSkuId } from "@/lib/pricing/v5-payg";

// `cadence_drift` (QA-3 P1-5, 2026-09-12): the amount and currency match but
// the Stripe Price is recurring where the plan is one-off (or the interval
// differs). The Startup Package env var pointed at the A$149/**month** Advisor
// price for weeks — same cents, so the audit said "match" while
// `mode:"payment"` checkout 500'd. Treated as drift by `hasDrift`.
export type AuditStatus = "match" | "drift" | "cadence_drift" | "missing_price_id" | "stripe_not_configured" | "stripe_lookup_failed" | "archived";

export interface PlanAuditRow {
  planId: string;                  // internal plan id (founding50, growth, ...)
  label: string;                   // human-readable name
  expectedAud: number;             // from platform-config (dollars)
  expectedCents: number;           // from platform-config (cents)
  stripePriceId: string | null;
  stripeUnitAmount: number | null; // cents from Stripe
  stripeCurrency: string | null;
  stripeActive: boolean | null;
  /** Stripe `type` — "one_time" | "recurring" — when the Price was fetched. */
  stripeType: "one_time" | "recurring" | null;
  /** Stripe `recurring.interval` when the Price is recurring. */
  stripeInterval: string | null;
  status: AuditStatus;
  remediation: string;             // human guidance
  cadence?: "one-off" | "monthly" | "yearly" | "credit-pack";
  /** G35 P1: "v5" on the six Pricing v5 PAYG rows (lib/pricing/v5-payg.ts). */
  pricingVersion?: "v5";
  /** v5 only: the price pages SHOW (platform_config payg_*_cents), cents GST-inclusive. */
  displayCents?: number;
  /** v5 only: display price ≠ what Stripe charges (Stripe amount when fetched, else the catalogue). */
  displayDrift?: boolean;
  /** v5 only: Price not minted yet while `payg_enabled` is off — expected, not an incident. */
  pendingMint?: boolean;
}

export interface AuditResult {
  rows: PlanAuditRow[];
  generatedAt: string;
  hasDrift: boolean;
  hasMissingIds: boolean;
  /** G35 P1: a v5 display price (platform_config) differs from the Stripe Price. */
  hasDisplayDrift: boolean;
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
  /** G35 P1: the Pricing v5 PAYG SKU this row audits (display drift + mint-via-script). */
  paygSku?: PaygSkuId;
}

const LEGACY_PLANS: PlanExpectation[] = [
  // Legacy headline tiers — NOT sold since the 2026-09-01 cutover. They stay
  // on the admin audit so the dashboard shows the Stripe prices grandfathered
  // renewals still bill against, but they are read straight from their env
  // vars: G18-A (2026-09-19) removed them from STRIPE_PRICE_MAP so no
  // checkout path can book them. `docs/ops/pricing-truth.md` lists them as
  // safe to archive in Stripe once no subscription references them.
  { planId: "founding50",    label: "Founding 100 (one-off) — legacy", configField: "founding_price_cents",      cadence: "one-off", envVar: "STRIPE_PRICE_FOUNDING50" },
  { planId: "growth",        label: "Growth — monthly — legacy",       configField: "growth_price_monthly_cents", cadence: "monthly", envVar: "STRIPE_PRICE_GROWTH" },
  { planId: "growth_annual", label: "Growth — annual — legacy",        configField: "growth_price_yearly_cents",  cadence: "yearly",  envVar: "STRIPE_PRICE_GROWTH_ANNUAL" },

  // Credit packs — derived from CREDIT_PACKS (src/lib/credit-packs.ts), the
  // single source of truth, so the audit can never drift from the ladder the
  // billing page sells (T0249: this list previously said A$15/A$25 for the
  // 50/100 packs after B8 moved them to A$35/A$60).
  ...CREDIT_PACKS.map<PlanExpectation>((p) => ({
    planId: `credits_${p.credits}`,
    label: `${p.credits} credits pack`,
    staticCents: p.priceAudCents,
    cadence: "credit-pack",
  })),
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

/**
 * G35 P1 — the six Pricing v5 PAYG Prices. `staticCents` is the catalogue
 * amount (what the Stripe Price must hold); the display price from
 * platform_config is compared separately (`displayDrift`).
 */
function v5Plans(): PlanExpectation[] {
  return PAYG_SKU_LIST.map<PlanExpectation>((s) => ({
    planId: s.id,
    label: `${s.label} — PAYG v5`,
    staticCents: s.amountCents,
    cadence: "one-off",
    envVar: s.envVar,
    paygSku: s.id,
  }));
}

/** Full audit roster = legacy + auto-derived v2 + Pricing v5 PAYG (dedup by planId, earlier wins). */
function allPlans(): PlanExpectation[] {
  const seen = new Set(LEGACY_PLANS.map((p) => p.planId));
  const v2 = v2Plans().filter((p) => !seen.has(p.planId));
  for (const p of v2) seen.add(p.planId);
  const v5 = v5Plans().filter((p) => !seen.has(p.planId));
  return [...LEGACY_PLANS, ...v2, ...v5];
}

/** Annotate a v5 row with display-vs-Stripe drift and the pending-mint state. */
function decoratePayg(row: PlanAuditRow, sku: PaygSkuId, cfg: Awaited<ReturnType<typeof getPlatformConfig>>): PlanAuditRow {
  const displayCents = displayPriceCents(sku, cfg);
  const chargedCents = row.stripeUnitAmount ?? row.expectedCents;
  const displayDrift = displayCents !== chargedCents;
  const pendingMint = row.status === "missing_price_id" && cfg.payg_enabled !== true;
  let remediation = row.remediation;
  if (row.status === "missing_price_id") {
    remediation = `${pendingMint ? "Not minted yet (payg_enabled is off). " : "payg_enabled is ON but the Price is missing — PAYG checkout cannot work. "}Mint with \`node scripts/stripe/mint-payg-v5.mjs\` (test mode first; founder runs --mode live --confirm-live), then set ${PAYG_SKUS[sku].envVar}.`;
  }
  if (displayDrift) {
    remediation += ` Display drift: pages show A$${displayCents / 100} (platform_config) but Stripe charges A$${chargedCents / 100}. Fix the display price in Admin › System Config, or mint a new Price with the mint script — never edit the Price.`;
  }
  return { ...row, pricingVersion: "v5", displayCents, displayDrift, pendingMint, remediation };
}

// ─── Cadence (one-off vs recurring) ──────────────────────────────────────────

interface StripeCadence {
  type: "one_time" | "recurring" | null;
  interval: string | null;
}

/** The Stripe `type` / `recurring.interval` a plan cadence must map to. */
export function expectedStripeCadence(cadence: PlanAuditRow["cadence"]): StripeCadence | null {
  switch (cadence) {
    case "one-off":
    case "credit-pack":
      return { type: "one_time", interval: null };
    case "monthly":
      return { type: "recurring", interval: "month" };
    case "yearly":
      return { type: "recurring", interval: "year" };
    default:
      return null;
  }
}

export function cadenceMatches(
  expected: StripeCadence,
  stripeType: string | null,
  stripeInterval: string | null,
): boolean {
  // Older fixtures / partial Stripe objects may omit `type`; only judge when
  // Stripe told us something.
  if (stripeType === null) return true;
  if (expected.type === "one_time") return stripeType === "one_time";
  return stripeType === "recurring" && stripeInterval === expected.interval;
}

function describeCadence(c: StripeCadence): string {
  if (c.type === "recurring") return `recurring/${c.interval ?? "?"}`;
  if (c.type === "one_time") return "one-off";
  return "unknown";
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
    stripeType: null,
    stripeInterval: null,
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
    const stripeType = price.type ?? null;
    const stripeInterval = price.recurring?.interval ?? null;

    if (!stripeActive) {
      return {
        ...base,
        stripeUnitAmount,
        stripeCurrency,
        stripeActive,
        stripeType,
        stripeInterval,
        status: "archived",
        remediation: `Stripe Price ${stripePriceId} is archived. Create a new Price at A$${expectedCents / 100} and update the env var.`,
      };
    }

    if (stripeUnitAmount === expectedCents && stripeCurrency?.toLowerCase() === "aud") {
      const expectedCadence = expectedStripeCadence(plan.cadence);
      if (expectedCadence && !cadenceMatches(expectedCadence, stripeType, stripeInterval)) {
        return {
          ...base,
          stripeUnitAmount,
          stripeCurrency,
          stripeActive,
          stripeType,
          stripeInterval,
          status: "cadence_drift",
          remediation: `Cadence drift: plan is ${plan.cadence} (Stripe should be ${describeCadence(expectedCadence)}) but Price ${stripePriceId} is ${describeCadence({ type: stripeType, interval: stripeInterval })}. Checkout mode will not match the Price. Create a ${describeCadence(expectedCadence)} Price at A$${expectedCents / 100}, paste new ID into ${envVar}, redeploy.`,
        };
      }
      return {
        ...base,
        stripeUnitAmount,
        stripeCurrency,
        stripeActive,
        stripeType,
        stripeInterval,
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
      stripeType,
      stripeInterval,
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
  const rows = await Promise.all(
    allPlans().map(async (p) => {
      const row = await auditPlan(p, cfg);
      return p.paygSku ? decoratePayg(row, p.paygSku, cfg) : row;
    }),
  );
  return {
    rows,
    generatedAt: new Date().toISOString(),
    hasDrift: rows.some((r) => r.status === "drift" || r.status === "cadence_drift" || r.status === "archived"),
    // An unminted v5 Price while payg_enabled is off is expected, not a missing id.
    hasMissingIds: rows.some((r) => r.status === "missing_price_id" && !r.pendingMint),
    hasDisplayDrift: rows.some((r) => r.displayDrift === true),
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

/** Retired SKUs: audited for drift (renewals still bill them) but never re-minted (G18 review). */
export const RETIRED_STRIPE_PLAN_IDS = new Set(["founding50", "growth", "growth_annual"]);

export async function createFreshStripePrice(planId: string, opts: { productName?: string } = {}): Promise<CreatePriceResult> {
  // G35 P1: v5 Products are keyed by metadata.sku and carry tax_behavior
  // inclusive — only scripts/stripe/mint-payg-v5.mjs mints them.
  if (isPaygSkuId(planId)) {
    return { ok: false, error: `${planId} is a Pricing v5 SKU — mint it with node scripts/stripe/mint-payg-v5.mjs, not from this page.` };
  }
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

