// Plan definitions and pricing helpers (server + client safe).
//
// All prices are in AUD cents. Billing periods and semantics vary by plan:
//   - free         : $0
//   - founding50   : $1 one-off (Founding 100 plan, price from platform config)
//   - growth       : configurable monthly price (default $99/mo early-bird)
//
// Static PLANS below are the client-safe fallback. Server components should call
// buildPlansFromConfig(cfg) after fetching platform config to get live prices.

export interface Plan {
  id: string;
  name: string;
  /** Price in AUD cents. Monthly for recurring plans, total for one-off. */
  price: number;
  /** Human-readable billing cadence. */
  cadence: "free" | "monthly" | "once" | "yearly";
  features: string[];
}

// Default prices — overridden at runtime by platform config (via buildPlansFromConfig).
const DEFAULT_FOUNDING_PRICE_CENTS = 100;     // A$1
const DEFAULT_FOUNDING_CREDITS = 100;
const DEFAULT_GROWTH_MONTHLY_CENTS = 9900;    // A$99/mo
const DEFAULT_GROWTH_YEARLY_CENTS = 95000;    // A$950/yr

export const PLANS: Plan[] = [
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
 * Build a config-overridden plans array for server components.
 * Pass the result from getPlatformConfig() so prices are always in sync with admin settings.
 */
export function buildPlansFromConfig(cfg: {
  founding_plan_name: string;
  founding_price_cents: number;
  founding_credits: number;
  growth_price_monthly_cents: number;
  growth_price_yearly_cents: number;
}): Plan[] {
  return PLANS.map((plan) => {
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

/** Early-bird pricing deadline (AEST). After this date, SVI analysis costs $25 instead of $1. */
export const EARLY_BIRD_DEADLINE = new Date("2026-08-01T00:00:00+10:00");
export const isEarlyBird = () => new Date() < EARLY_BIRD_DEADLINE;

/** Growth plan early-bird deadline (AEST). Before this date Growth is $99/mo; after, $499/mo. */
export const GROWTH_EARLY_BIRD_DEADLINE = new Date("2026-08-01T00:00:00+10:00");
export const isGrowthEarlyBird = () => new Date() < GROWTH_EARLY_BIRD_DEADLINE;
export const GROWTH_STANDARD_PRICE = 49900; // $499/mo after deadline

/** Look up a plan by ID from a plans array (defaults to static PLANS). */
export function getPlan(planId: string, plans: Plan[] = PLANS): Plan | undefined {
  return plans.find((p) => p.id === planId);
}

/**
 * Calculate original and discounted price for a plan.
 *
 * @param planId   – one of the plan IDs
 * @param discountPct – 0-100 discount percentage (e.g. 50 = 50% off)
 * @param plans – optional config-derived plans (defaults to static PLANS)
 */
export function getPlanPrice(
  planId: string,
  discountPct?: number | null,
  plans: Plan[] = PLANS,
): { original: number; discounted: number } | null {
  const plan = getPlan(planId, plans);
  if (!plan) return null;

  const original = plan.price;
  const pct = Math.min(Math.max(discountPct ?? 0, 0), 100);
  const discounted = Math.round(original * (1 - pct / 100));

  return { original, discounted };
}
