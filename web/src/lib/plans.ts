// Thin re-export layer over plans-db.ts (upgrade v2 W1).
//
// The DB-backed pricing matrix (plans.csv → plans table) is the source of
// truth for the 12-SKU catalogue. Legacy IDs (free, founding50, growth,
// growth_annual) are grandfathered via LEGACY_PLANS below and mapped to
// the new SKUs by LEGACY_PLAN_MAP.
//
// Server callers: use getPlansCached() / getPlanCached() from '@/lib/plans'.
// Client bundles: import LEGACY_PLANS (static, no DB round-trip).

// Type-only re-export (compile-time; no runtime module load).
// Server callers wanting the value-side helpers (getPlansCached, getPlanCached,
// revalidatePlans) must import directly from '@/lib/plans-db' to avoid
// pulling the server-only supabase admin client into client bundles via
// this file (billing-client.tsx is 'use client' and re-exports LegacyPlan
// values that historically lived here).
export type { Plan } from "./plans-db";

// ── Legacy plan shape (pre-upgrade) ──────────────────────────────────────────
// Kept for grandfathered subscribers and admin migration flows. Do NOT use for
// new UI — call getPlansCached() instead so DB overrides win.
export interface LegacyPlan {
  id: string;
  name: string;
  /** Price in AUD cents. Monthly for recurring plans, total for one-off. */
  price: number;
  /** Human-readable billing cadence. */
  cadence: "free" | "monthly" | "once" | "yearly";
  features: string[];
}

// Default legacy prices — kept for admin/config fallback during grandfathering.
const DEFAULT_FOUNDING_PRICE_CENTS = 500;     // A$5 (bumped from A$3 on 2026-06-21)
const DEFAULT_FOUNDING_CREDITS = 100;
const DEFAULT_GROWTH_MONTHLY_CENTS = 9900;    // A$99/mo
const DEFAULT_GROWTH_YEARLY_CENTS = 95000;    // A$950/yr

export const LEGACY_PLANS: LegacyPlan[] = [
  {
    id: "free",
    name: "Starter",
    price: 0,
    cadence: "free",
    features: [
      "2 free credits (~4 analyses)",
      "Investor-Ready Score",
      "Basic dilution calculator",
      "Shareable web link",
    ],
  },
  {
    id: "founding50",
    name: "Founder",
    price: DEFAULT_FOUNDING_PRICE_CENTS,
    cadence: "once",
    features: [
      "Everything in Starter",
      `${DEFAULT_FOUNDING_CREDITS} credits included`,
      "Founder Value Index",
      "Cap Table Starter",
      "Evidence Vault",
      "Export Packs (PDF, LinkedIn, Crunchbase-ready)",
      "30-Day Growth Plan",
      "Co-founder matching",
      "Priority support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: DEFAULT_GROWTH_MONTHLY_CENTS,
    cadence: "monthly",
    features: [
      "Everything in Founder",
      "Multi-entity cap table",
      "Investor data room",
      "One-Click Data Room",
      "Term Sheet AI (unlimited)",
      "Custom branding",
      "Dedicated account manager",
      "30-day money back",
    ],
  },
  {
    id: "growth_annual",
    name: "Growth Annual",
    price: DEFAULT_GROWTH_YEARLY_CENTS,
    cadence: "yearly",
    features: [
      "Everything in Founder",
      "Multi-entity cap table",
      "Investor data room",
      "One-Click Data Room",
      "Term Sheet AI (unlimited)",
      "Custom branding",
      "Dedicated account manager",
      "30-day money back",
    ],
  },
];

/**
 * Legacy → v2 plan id mapping. Webhook + entitlement code consults this when a
 * grandfathered subscription references an old price/product.
 *
 *   founding50    → founder_starter
 *   growth        → founder_growth
 *   growth_annual → founder_growth (billed annually)
 */
export const LEGACY_PLAN_MAP: Readonly<Record<string, { id: string; interval: "monthly" | "yearly" }>> = {
  founding50:    { id: "founder_starter", interval: "monthly" },
  growth:        { id: "founder_growth",  interval: "monthly" },
  growth_annual: { id: "founder_growth",  interval: "yearly"  },
};

/**
 * Look up a legacy plan by ID from a plans array (defaults to LEGACY_PLANS).
 * For new code, prefer getPlanCached().
 */
export function getPlan(planId: string, plans: LegacyPlan[] = LEGACY_PLANS): LegacyPlan | undefined {
  return plans.find((p) => p.id === planId);
}

/**
 * Build a config-overridden legacy plans array. Kept for admin dashboard code
 * that still reads platform_config directly; new code should use plans-db.
 */
export function buildPlansFromConfig(cfg: {
  founding_plan_name: string;
  founding_price_cents: number;
  founding_credits: number;
  growth_price_monthly_cents: number;
  growth_price_yearly_cents: number;
}): LegacyPlan[] {
  return LEGACY_PLANS.map((plan) => {
    if (plan.id === "founding50") {
      return {
        ...plan,
        name: cfg.founding_plan_name,
        price: cfg.founding_price_cents,
        features: [
          "Everything in Starter",
          `${cfg.founding_credits} credits included`,
          "Founder Value Index",
          "Cap Table Starter",
          "Evidence Vault",
          "Export Packs (PDF, LinkedIn, Crunchbase-ready)",
          "30-Day Growth Plan",
          "Co-founder matching",
          "Priority support",
        ],
      };
    }
    if (plan.id === "growth") {
      return { ...plan, price: cfg.growth_price_monthly_cents };
    }
    if (plan.id === "growth_annual") {
      return { ...plan, price: cfg.growth_price_yearly_cents };
    }
    return plan;
  });
}

/**
 * Original + discounted price for a legacy plan.
 */
export function getPlanPrice(
  planId: string,
  discountPct?: number | null,
  plans: LegacyPlan[] = LEGACY_PLANS,
): { original: number; discounted: number } | null {
  const plan = getPlan(planId, plans);
  if (!plan) return null;
  const original = plan.price;
  const pct = Math.min(Math.max(discountPct ?? 0, 0), 100);
  const discounted = Math.round(original * (1 - pct / 100));
  return { original, discounted };
}

/** Early-bird pricing deadline (AEST). After this date, SVI analysis costs $25 instead of $1. */
export const EARLY_BIRD_DEADLINE = new Date("2026-08-01T00:00:00+10:00");
export const isEarlyBird = () => new Date() < EARLY_BIRD_DEADLINE;

/** Growth plan early-bird deadline (AEST). Before this date Growth is $99/mo; after, $499/mo. */
export const GROWTH_EARLY_BIRD_DEADLINE = new Date("2026-08-01T00:00:00+10:00");
export const isGrowthEarlyBird = () => new Date() < GROWTH_EARLY_BIRD_DEADLINE;
export const GROWTH_STANDARD_PRICE = 49900; // $499/mo after deadline

/** @deprecated Use LEGACY_PLANS. Kept as alias so pre-upgrade imports keep compiling. */
export const PLANS = LEGACY_PLANS;
