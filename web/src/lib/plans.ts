// Plan definitions and pricing helpers (server + client safe).
//
// All prices are in AUD cents. Billing periods and semantics vary by plan:
//   - free         : $0
//   - founding50   : $49 one-off (Founder plan)
//   - growth       : $499/mo

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
    price: 4900, // AUD $49 one-off
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
    price: 49900, // $499/mo
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
];

/** Early-bird pricing deadline (AEST). After this date, SVI analysis costs $25 instead of $1. */
export const EARLY_BIRD_DEADLINE = new Date("2026-06-15T00:00:00+10:00");
export const isEarlyBird = () => new Date() < EARLY_BIRD_DEADLINE;

/** Look up a plan by ID. Returns undefined for unknown IDs. */
export function getPlan(planId: string): Plan | undefined {
  return PLANS.find((p) => p.id === planId);
}

/**
 * Calculate original and discounted price for a plan.
 *
 * @param planId   – one of the PLANS[].id values
 * @param discountPct – 0-100 discount percentage (e.g. 50 = 50% off)
 * @returns { original, discounted } both in AUD cents, or null if plan not found
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
