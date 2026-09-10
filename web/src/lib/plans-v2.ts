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
  /** AUD per month, GST-INCLUSIVE (Stripe prices are tax_behavior=inclusive). `null` = custom / contact-sales. */
  monthly_aud: number | null;
  /** AUD per year, GST-INCLUSIVE. `null` = custom. Annual saves ~17% vs 12x monthly. */
  annual_aud: number | null;
  trial_days: number;
  features: string[];
  most_popular?: boolean;
  cta_kind: CtaKind;
  /** Optional short tagline surfaced above the price. */
  tagline?: string;
  /**
   * Whether this plan surfaces on the public /pricing ladder. Defaults to
   * `true` when omitted. `false` = hidden from the ladder but kept in the
   * catalogue for legacy renewals and contact-sales flows. Set false on
   * founder_scale (retired A$299 Pro), founder_enterprise, investor_vc_ent
   * and accelerator_* per the 2026-09-08 pricing ladder
   * (Free / Founder A$29 / Growth A$69 + A$59 equity add-on).
   *
   * 2026-09-10 (G12 / T0268): the three self-serve Evaluator rungs —
   * investor_angel "Scout" A$79, investor_advisor "Firm" A$149 and
   * investor_vc_small "Program" A$349 — are public again and render under
   * the Evaluator tab of /pricing. Their copy is synced to plans.csv
   * (`reports_per_month` 10/30/100, `profiles` 25/50/200, `seats` 1/3/5).
   */
  public?: boolean;
}

/**
 * The Equity add-on, in AUD per month, GST-inclusive.
 *
 * Sold as a flat monthly item attached to an existing paid subscription (see
 * `STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY` in lib/stripe.ts). It grants exactly
 * the four flags in `ADDON_FEATURES` — esop.manage, vesting.read,
 * vesting.write, blockchain.sync — and nothing else.
 *
 * It lives here because this module is the marketing-surface catalogue, and
 * because until 2026-09-09 the figure was typed by hand into the Growth
 * feature bullet AND into the persona pages under /solutions. A price typed
 * into a page cannot follow a price change it does not know about, which is
 * how three /for/* pages came to advertise amounts we do not charge. Every
 * marketing surface that names the add-on now reads it from here.
 */
export const EQUITY_ADDON_MONTHLY_AUD = 59;

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
    // 2026-09-09 reconciliation. Three of the five bullets named things the
    // product does not have:
    //   • "Community Slack access" — there is no Slack community, and no
    //     invite link anywhere in the codebase.
    //   • "Watermarked PDF export" — no renderer watermarks anything. The only
    //     `watermark` style in lib/pdf is the static "Not financial or legal
    //     advice." line on the cover, which every tier gets.
    //   • "Idea validation checklist" — the phrase appears nowhere but here.
    // "10-page valuation report" also went: `usage_limits.report_pages` has no
    // reader in src/, and what a free run actually delivers is the five-page
    // summary that FREE_SUMMARY_PAGE_COUNT pins and svi-summary-pdf renders.
    features: [
      "Your SVI score across all eight dimensions",
      "1 startup workspace",
      "A five-page written summary, emailed as a PDF",
      "Valuation range with its low and high",
      "No card, no expiry",
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
    // 2026-09-08: back on the public ladder. The 2026-09-07 3-rung decision
    // (Free / Growth A$99 / Pro A$299) hid this tier; the new ladder is
    // Free / Founder A$29 / Growth A$69, so A$29 is the entry rung again.
    // A$29 is 1.44x the A$20.09 discretionary-tool benchmark median and sits
    // below Xero (A$37) — the defensible floor for an unproven product.
    // NOTE: Founder accounts are limited to 1 startup per
    // web/src/lib/plans/startup-limit.ts (`ACCOUNT_TYPES_WITH_MULTI_STARTUP`).
    // The `usage_limits.profiles` on the plans.csv row is a maximum enforced
    // for non-founder account_types on this SKU; for the founder segment the
    // marketing copy must always say "1 startup workspace". Users who need
    // multiple startups upgrade to the Accelerator segment
    // (see /pricing?tab=accelerator).
    // 2026-09-09: "Unlimited DOCX + PDF export" was not true — `docx_export`
    // costs 0.50 credits in lib/credits.ts FEATURE_COSTS, so exports are
    // metered against the same 20-credit monthly grant as everything else.
    // The data room and the live investor link replace it: those are the two
    // flags founder_starter actually holds over Free (`data_room.access`,
    // `investor_links.premium`) and the two the homepage's A$29 rung sells.
    features: [
      "Everything in Free, kept on your account",
      "1 startup workspace",
      "Your data room, filling up in the order investors ask",
      "Share a live link with an investor instead of a PDF",
      "20 AI credits / month",
      "Email support (48h)",
    ],
  },
  {
    id: "founder_growth",
    segment: "founder",
    name: "Growth",
    monthly_aud: 69,
    annual_aud: 690,
    trial_days: 7,
    cta_kind: "trial",
    most_popular: true,
    tagline: "Raising a round",
    features: [
      "Everything in Starter",
      "Cap-table sync + data room",
      "45 AI credits / month",
      "Term Sheet AI drafter",
      "Priority support (24h)",
      // The add-on grants exactly four flags — esop.manage, vesting.read,
      // vesting.write, blockchain.sync (see entitlements/user-grants.ts
      // ADDON_FEATURES). It does NOT grant dividends or a shareholder portal;
      // those have no feature gate in the product at all, and inventing one to
      // make this bullet true would take access away from Growth subscribers
      // who use /workspace/dividends today. So the bullet loses the two claims
      // instead.
      `Equity add-on +A$${EQUITY_ADDON_MONTHLY_AUD}/mo — ESOP, vesting schedules, and on-chain sync`,
      "Unlimited shareholders + employees on the add-on — never per head",
    ],
  },
  {
    id: "founder_scale",
    segment: "founder",
    name: "Pro",
    monthly_aud: 299,
    annual_aud: 2990,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "Series A ready",
    // RETIRED 2026-09-08. A$299 exceeded JPMorgan Workplace Solutions
    // (A$277 for 100 stakeholders) — indefensible for an unproven product.
    // Its capabilities now sell as the A$59/mo equity add-on on top of
    // Growth (A$128 combined, under the A$138.53 registry median). The
    // Stripe price is archived (never deleted) and plans.csv marks the row
    // active=false; the catalogue entry stays so a grandfathered subscriber
    // still renders.
    public: false,
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
    // Moved to the contact-sales row below the public 3-rung ladder.
    public: false,
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

// ─── Investor / Evaluator ─────────────────────────────────────────────────
//
// 2026-09-10 (G12 §3b, T0268): the investor catalogue is sold as the
// "Evaluator" ladder — Scout / Firm / Program — to angels, syndicates,
// advisory firms, VC teams, accelerators, incubators and university
// programs. The plan ids are unchanged (plans.csv rows 7–9, migration 0309,
// Stripe env vars STRIPE_PRICE_INVESTOR_ANGEL|ADVISOR|VC_SMALL); only the
// labels and the feature copy moved. Numbers below are read off plans.csv
// `usage_limits` (reports_per_month / profiles / seats) and `feature_flags`
// — keep them in lock-step, plans-v2.test.ts pins the anchors.
const INVESTOR: Plan[] = [
  {
    id: "investor_angel",
    segment: "investor",
    name: "Scout",
    monthly_aud: 79,
    annual_aud: 790,
    trial_days: 7,
    cta_kind: "trial",
    most_popular: true,
    tagline: "Angels, syndicate members, mentors",
    public: true,
    features: [
      "10 Trust BizReports a month included (A$30 value)",
      "25 tracked startups, 1 seat",
      "Weekly Progress Radar — score deltas, stage changes, new evidence",
      "Deal-flow feed + watchlist",
      "ICS calendar and share-link tracking",
    ],
  },
  {
    id: "investor_advisor",
    segment: "investor",
    name: "Firm",
    monthly_aud: 149,
    annual_aud: 1490,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "Advisory, accounting and legal firms",
    public: true,
    features: [
      "Everything in Scout",
      "30 Trust BizReports a month included",
      "50 tracked startups, 3 seats",
      "White-label PDF reports + client roster",
      "Full mentor access to each client's workspace (founder-approved)",
      "R&DTI / ESIC / s708 checks per client",
    ],
  },
  {
    id: "investor_vc_small",
    segment: "investor",
    name: "Program",
    monthly_aud: 349,
    annual_aud: 3490,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "VC teams, accelerators, incubators, university programs",
    public: true,
    features: [
      "Everything in Firm",
      "100 Trust BizReports a month included",
      "200 tracked startups, 5 seats",
      "Batch scoring — one rubric across a whole application round",
      "Cohort dashboard + quarterly LP / sponsor report export",
      "Read-only API access",
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
    public: false,
    features: [
      "Everything in Program",
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
    public: false,
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
    public: false,
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
    public: false,
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
 * Advisor segment reuses the investor (Evaluator) catalogue with the Firm
 * SKU highlighted. When the dedicated advisor SKU family lands, replace
 * this map.
 *
 * NOTE: Full catalogue for entitlements resolution + admin surfaces. Public
 * marketing pricing surfaces MUST route through `publicPlansForSegment()`
 * below — which drops every SKU marked `public: false`.
 */
export function plansForSegment(segment: Segment): Plan[] {
  if (segment === "advisor") {
    // Highlight the Firm (investor_advisor) SKU for the advisor segment.
    return INVESTOR.map((p) => ({
      ...p,
      most_popular: p.id === "investor_advisor",
    }));
  }
  return PLANS_V2.filter((p) => p.segment === segment);
}

/**
 * Plan IDs that must NEVER render on a public / new-signup pricing surface.
 * Derived from `plan.public === false` on the catalogue itself so a new
 * hidden SKU is a one-line change in the plan definition.
 *
 * Post-2026-09-10 ladder (G12): two public ladders, one per /pricing tab.
 *   Founder   — founder_free (Free) + founder_starter (Founder A$29) +
 *               founder_growth (Growth A$69), A$59/mo Equity add-on on top.
 *   Evaluator — investor_angel (Scout A$79) + investor_advisor (Firm A$149)
 *               + investor_vc_small (Program A$349).
 * Everything else (retired Pro, founder_enterprise, investor_vc_ent, the
 * accelerator_* cohort SKUs) is contact-sales / legacy-renewal only.
 */
export const PUBLIC_HIDDEN_PLAN_IDS: readonly string[] = PLANS_V2
  .filter((p) => p.public === false)
  .map((p) => p.id);

/**
 * Public / marketing variant of `plansForSegment()` — filters out any SKU
 * marked `public: false`. Every marketing pricing surface (landing pricing
 * matrix, /pricing, onboarding tier picker) MUST consume this — hitting the
 * raw `plansForSegment()` will leak hidden SKUs back onto the pricing page.
 */
export function publicPlansForSegment(segment: Segment): Plan[] {
  return plansForSegment(segment).filter((p) => p.public !== false);
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
