// Plan definitions and pricing helpers (server + client safe).
//
// All prices are in AUD cents. Billing periods and semantics vary by plan:
//   - free         : $0
//   - founder      : $99/mo
//   - growth       : $499/mo
//   - pilot        : $5 000 one-off
//   - accelerator  : $20 000–60 000/yr (tiered; base price = $20 000/yr)

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
    name: "Free",
    price: 0,
    cadence: "free",
    features: [
      "Idea Evaluation (3 free runs)",
      "Equity Split Calculator",
      "Funding Plan Generator",
      "Shareable Investor-Ready Score",
    ],
  },
  {
    id: "founder",
    name: "Founder",
    price: 9900, // $99/mo
    cadence: "monthly",
    features: [
      "Everything in Free",
      "Unlimited idea evaluations",
      "Founder Pack PDF export",
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
      "Custom branding",
      "API access",
    ],
  },
  {
    id: "pilot",
    name: "Pilot",
    price: 500000, // $5 000 once
    cadence: "once",
    features: [
      "Everything in Growth",
      "Dedicated onboarding",
      "Custom integrations",
      "White-glove support (90 days)",
    ],
  },
  {
    id: "accelerator",
    name: "Accelerator",
    price: 2000000, // $20 000/yr base
    cadence: "yearly",
    features: [
      "Everything in Pilot",
      "Portfolio-wide dashboard",
      "Bulk founder onboarding",
      "Custom reporting & analytics",
      "Dedicated account manager",
    ],
  },
];

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
