/**
 * Placeholder pricing catalogue for Homepage v2.
 *
 * Source of truth: `knowledge-base/upgrade-plan-2026-07-16/cfo-spec.md` §3.2
 * (12-SKU canonical matrix). This literal file will be replaced by the
 * codegen output of `web/scripts/build-plans.ts` → `plans.generated.ts`
 * once the W1 CFO/CTO track lands (see `plans.csv`).
 *
 * DO NOT wire this to Stripe. This is purely a marketing-surface catalogue
 * consumed by `<PricingMatrix />`. Real entitlements + prices flow through
 * `web/src/lib/plans.ts` (server) which will re-export from the generated
 * file. Keep `id` values identical so the swap is a one-line import change.
 */

export type Segment = "founder" | "investor" | "advisor" | "accelerator";
export type CtaKind = "trial" | "contact";

export interface Plan {
  id: string;
  segment: Segment;
  name: string;
  /** AUD per month, GST-exclusive. `null` = custom / contact-sales. */
  monthly_aud: number | null;
  /** AUD per year, GST-exclusive. `null` = custom. Annual saves ~17% vs 12x monthly. */
  annual_aud: number | null;
  trial_days: number;
  features: string[];
  most_popular?: boolean;
  cta_kind: CtaKind;
  /** Optional short tagline surfaced above the price. */
  tagline?: string;
}

// ─── Founder ──────────────────────────────────────────────────────────────
const FOUNDER: Plan[] = [
  {
    id: "founder_free",
    segment: "founder",
    name: "Free",
    monthly_aud: 0,
    annual_aud: 0,
    trial_days: 0,
    cta_kind: "trial",
    tagline: "Kick the tyres",
    features: [
      "SVI basic score (1 startup)",
      "10-page valuation report",
      "Community Slack access",
      "Watermarked PDF export",
      "Idea validation checklist",
    ],
  },
  {
    id: "founder_starter",
    segment: "founder",
    name: "Starter",
    monthly_aud: 29,
    annual_aud: 290,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "Solo founder",
    // NOTE: Founder accounts are limited to 1 startup per
    // web/src/lib/plans/startup-limit.ts (`ACCOUNT_TYPES_WITH_MULTI_STARTUP`).
    // The `usage_limits.profiles` on the plans.csv row is a maximum enforced
    // for non-founder account_types on this SKU; for the founder segment the
    // marketing copy must always say "1 startup workspace". Users who need
    // multiple startups upgrade to the Accelerator segment
    // (see /pricing?tab=accelerator).
    features: [
      "Full SVI 13-criteria score",
      "1 startup workspace",
      "Unlimited DOCX + PDF export",
      "50 AI credits / month",
      "Email support (48h)",
    ],
  },
  {
    id: "founder_growth",
    segment: "founder",
    name: "Growth",
    monthly_aud: 99,
    annual_aud: 990,
    trial_days: 7,
    cta_kind: "trial",
    most_popular: true,
    tagline: "Raising a round",
    features: [
      "Everything in Starter",
      "Cap-table sync + vesting engine",
      "Dividend simulator",
      "200 AI credits / month",
      "Term Sheet AI drafter",
      "Priority support (24h)",
    ],
  },
  {
    id: "founder_scale",
    segment: "founder",
    name: "Scale",
    monthly_aud: 299,
    annual_aud: 2990,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "Series A ready",
    features: [
      "Everything in Growth",
      "Tokenization requests (on-chain)",
      "Investor data room access",
      "Read-only API keys",
      "3,000 AI credits / month",
      "Named customer success manager",
    ],
  },
  {
    id: "founder_enterprise",
    segment: "founder",
    name: "Enterprise",
    monthly_aud: null,
    annual_aud: null,
    trial_days: 7,
    cta_kind: "contact",
    tagline: "Multi-entity groups",
    features: [
      "SSO / SAML + audit log",
      "Dedicated CSM + SLA 99.9%",
      "Unlimited AI credits",
      "Custom on-chain deployment",
      "Legal + compliance review add-on",
      "Volume pricing",
    ],
  },
];

// ─── Investor ─────────────────────────────────────────────────────────────
const INVESTOR: Plan[] = [
  {
    id: "investor_angel",
    segment: "investor",
    name: "Angel",
    monthly_aud: 79,
    annual_aud: 790,
    trial_days: 7,
    cta_kind: "trial",
    most_popular: true,
    tagline: "Solo angel",
    features: [
      "Curated deal flow feed",
      "5-startup watchlist",
      "SVI Pro comparison view",
      "400 AI credits / month",
      "Weekly market digest",
    ],
  },
  {
    id: "investor_advisor",
    segment: "investor",
    name: "Advisor",
    monthly_aud: 149,
    annual_aud: 1490,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "Angel + syndicate lead",
    features: [
      "Everything in Angel",
      "10-startup portfolio tracking",
      "Warm intro engine",
      "1,000 AI credits / month",
      "Advisor equity calculator",
    ],
  },
  {
    id: "investor_vc_sm",
    segment: "investor",
    name: "VC Small",
    monthly_aud: 349,
    annual_aud: 3490,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "5 seats included",
    features: [
      "Everything in Advisor",
      "50-startup portfolio",
      "Read-only API access",
      "3,500 AI credits / month",
      "Team seats + shared notes",
      "Priority DD reports",
    ],
  },
  {
    id: "investor_vc_ent",
    segment: "investor",
    name: "VC Enterprise",
    monthly_aud: null,
    annual_aud: null,
    trial_days: 7,
    cta_kind: "contact",
    tagline: "Fund-grade",
    features: [
      "Everything in VC Small",
      "LP reporting suite",
      "Full data room access",
      "SSO / SAML + audit log",
      "Dedicated success manager",
      "Custom seat count",
    ],
  },
];

// ─── Accelerator ──────────────────────────────────────────────────────────
const ACCELERATOR: Plan[] = [
  {
    id: "accelerator_starter",
    segment: "accelerator",
    name: "Cohort Starter",
    monthly_aud: 500,
    annual_aud: 5000,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "Up to 10 seats",
    features: [
      "10 founder seats included",
      "Cohort dashboard + rankings",
      "5,000 AI credits / month",
      "Batched SVI reports",
      "Program brand kit",
    ],
  },
  {
    id: "accelerator_growth",
    segment: "accelerator",
    name: "Cohort Growth",
    monthly_aud: 1500,
    annual_aud: 15000,
    trial_days: 7,
    cta_kind: "trial",
    most_popular: true,
    tagline: "Up to 30 seats",
    features: [
      "Everything in Cohort Starter",
      "30 founder seats included",
      "Demo Day kit (pitch, deck, video)",
      "Mentor pool marketplace",
      "20,000 AI credits / month",
    ],
  },
  {
    id: "accelerator_enterprise",
    segment: "accelerator",
    name: "Cohort Enterprise",
    monthly_aud: 3500,
    annual_aud: 35000,
    trial_days: 7,
    cta_kind: "contact",
    tagline: "100+ seats, white-label",
    features: [
      "Everything in Cohort Growth",
      "100 founder seats included",
      "White-label domain + branding",
      "Read + write API access",
      "80,000 AI credits / month",
      "Dedicated program manager",
    ],
  },
];

export const PLANS_V2: Plan[] = [...FOUNDER, ...INVESTOR, ...ACCELERATOR];

/**
 * Advisor tab reuses the investor catalogue with the Advisor SKU highlighted.
 * When the dedicated advisor SKU family lands (post-W1), replace this map.
 *
 * NOTE: This function preserves `founder_free` in the founder-segment list
 * because it's still the source of truth for entitlements resolution and
 * grandfathered legacy users. Public-facing pricing surfaces MUST route
 * through `publicPlansForSegment()` below — which strips `founder_free`
 * per the 2026-07-24 founder directive ("no indefinite free tier for new
 * signups").
 */
export function plansForSegment(segment: Segment): Plan[] {
  if (segment === "advisor") {
    // Highlight the Advisor SKU on this tab.
    return INVESTOR.map((p) => ({
      ...p,
      most_popular: p.id === "investor_advisor",
    }));
  }
  return PLANS_V2.filter((p) => p.segment === segment);
}

/**
 * Plan IDs that must NEVER render on a public / new-signup pricing surface.
 * Kept in sync with `NEW_SIGNUP_TIER_IDS` in `pricing-data.ts` (which does
 * the same job for the legacy `PRICING_TIERS` catalogue).
 */
export const PUBLIC_HIDDEN_PLAN_IDS: readonly string[] = ["founder_free"];

/**
 * Public / marketing variant of `plansForSegment()` — filters out any SKU
 * we no longer offer to new signups (currently just `founder_free`, per
 * Round 5.11 "no indefinite free tier" directive). Every marketing pricing
 * surface (landing pricing matrix, /pricing, onboarding tier picker) MUST
 * consume this — hitting the raw `plansForSegment()` will leak the Free
 * tier back onto the pricing page.
 */
export function publicPlansForSegment(segment: Segment): Plan[] {
  return plansForSegment(segment).filter(
    (p) => !PUBLIC_HIDDEN_PLAN_IDS.includes(p.id),
  );
}

/** Format AUD price. Returns "Custom" for null (contact-sales SKUs). */
export function formatAud(amount: number | null): string {
  if (amount === null) return "Custom";
  if (amount === 0) return "A$0";
  return `A$${amount.toLocaleString("en-AU")}`;
}

/** Annual saving vs 12× monthly, as a percent (0–100). Null if custom. */
export function annualSavingPct(plan: Plan): number | null {
  if (plan.monthly_aud === null || plan.annual_aud === null) return null;
  if (plan.monthly_aud === 0) return null;
  const full = plan.monthly_aud * 12;
  if (full === 0) return null;
  return Math.round(((full - plan.annual_aud) / full) * 100);
}
