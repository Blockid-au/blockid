// Plan definitions and pricing helpers.
//
// All prices are in AUD cents. Billing periods and semantics vary by plan:
//   - free         : $0
//   - founding50   : $1 one-off (Founding 100 plan)
//   - growth       : $99/mo early-bird (normally $499/mo)

export interface Plan {
  id: string;
  name: string;
  /** Price in AUD cents. Monthly for recurring plans, total for one-off. */
  price: number;
  /** Human-readable billing cadence. */
  cadence: "free" | "monthly" | "once" | "yearly";
  features: string[];
}

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
    price: 100,
    cadence: "once",
    features: [
      "Everything in Starter",
      "100 credits included",
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
    price: 9900,
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
    price: 95000,
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

/** Early-bird pricing deadline (AEST). After this date, SVI analysis costs $25 instead of $1. */
export const EARLY_BIRD_DEADLINE = new Date("2026-06-15T00:00:00+10:00");
export const isEarlyBird = (): boolean => new Date() < EARLY_BIRD_DEADLINE;

/** Growth plan early-bird deadline (AEST). Before this date Growth is $99/mo; after, $499/mo. */
export const GROWTH_EARLY_BIRD_DEADLINE = new Date("2026-07-01T00:00:00+10:00");
export const isGrowthEarlyBird = (): boolean => new Date() < GROWTH_EARLY_BIRD_DEADLINE;
export const GROWTH_STANDARD_PRICE = 49900; // $499/mo after deadline

/** Look up a plan by ID. Returns undefined for unknown IDs. */
export function getPlan(planId: string): Plan | undefined {
  return PLANS.find((p) => p.id === planId);
}

/**
 * Calculate original and discounted price for a plan.
 */
export function getPlanPrice(
  planId: string,
  discountPct?: number | null,
): { original: number; discounted: number } | null {
  const plan = getPlan(planId);
  if (!plan) return null;

  const original = plan.price;
  const pct = Math.min(Math.max(discountPct ?? 0, 0), 100);
  const discounted = Math.round(original * (1 - pct / 100));

  return { original, discounted };
}
