/**
 * Marketing pricing catalogue for Homepage v2 / /pricing.
 *
 * Source of truth for prices and limits: `web/src/config/pricing/plans.csv`
 * (→ `plans.generated.ts` via `scripts/build-plans.ts`). This file carries
 * the public copy for each SKU — bullets, taglines, ribbon, visibility —
 * and its colocated test pins every number back to the csv.
 *
 * Pricing v4 (evaluator-first, 2026-09-16, plan §3.2 — 15 tier SKUs +
 * Startup Package):
 *   Founder    founder_free / founder_starter A$29 / founder_growth A$69
 *              (+ retired founder_scale, contact-sales founder_enterprise)
 *   Evaluator  investor_angel "Scout" A$79 / investor_advisor "Firm" A$149 /
 *              investor_vc_small "Program" A$349 / investor_fund "Fund"
 *              A$999 (+ contact-sales investor_vc_ent, hidden index_api
 *              A$299 sold from /startup-index, /developers and the
 *              contact-sales row)
 *   Programs   accelerator_intake "Intake link" A$249 / accelerator_starter
 *              "Cohort 25" A$500 / accelerator_growth "Cohort 100" A$1,500
 *              (annual-first, 14-day trial; + contact-sales
 *              accelerator_enterprise "Cohort Enterprise")
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
   * Optional chip rendered next to the plan name on the card. Used for the
   * "Founder Radar" bundle on Starter (G11 D10, 2026-09-10): the founder
   * kept the label "Starter" — the chip is how the card says the A$29 rung
   * now carries the grant & program radar without renaming the SKU.
   */
  badge?: string;
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
  /**
   * Which cadence the card should pre-select / link when the page toggle
   * is untouched. Defaults to `"monthly"`. The three Programs rungs are
   * sold annual-first (plan §3.2, 2026-09-16) — a cohort is a yearly
   * budget line, not a monthly one.
   */
  billing_default?: "monthly" | "annual";
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

/**
 * Founder Radar — the Money Finder subscription benefits bundled into
 * Starter A$29 (G11 §4h D10, decided 2026-09-10; feature flag `money_radar`
 * on plans.csv / migration 0316). One string, read by the Starter card, the
 * A$3 report upsell (`radar-upsell-card.tsx`) and the /funding paywall so
 * the four surfaces cannot describe four different products.
 */
export const FOUNDER_RADAR_BADGE = "Founder Radar";
export const FOUNDER_RADAR_FEATURE_LINE =
  "Founder Radar — grant & program deadline alerts, monthly re-match, weekly next step, capital map";

/**
 * Startup Package (founder_package, A$149 one-off — plans.csv row, not a
 * ladder card). Besides the 25 seed credits it includes one Money Finder
 * report (`grant_finder` flag, 0316) and a time-boxed Founder Radar grant:
 * the Stripe webhook stamps `app_users.money_radar_until = now() + 90 days`
 * (migration 0319) and `can(user, "money_radar")` honours that stamp.
 */
export const STARTUP_PACKAGE_RADAR_DAYS = 90;
export const STARTUP_PACKAGE_MONEY_FINDER_LINE =
  "1 Money Finder report + 3 months Founder Radar included";

/**
 * S25-A — connected revenue. Shown on the Growth rung only once the weekly
 * resync shipped (api/cron/connector-resync): Stripe Connect + Xero re-pull
 * every Monday, the SVI prices MRR by magnitude/growth/churn and the P&L
 * page labels each figure with its source. Keep it ≤ 2 sentences.
 */
// G20-F1 (2026-09-20): the S25-A "Connect Stripe or Xero" bullet came out.
// Neither OAuth app is provisioned on production (STRIPE_CLIENT_ID /
// XERO_CLIENT_ID unset — docs/ops/feature-inventory.md § Connectors), so the
// connector rows are hidden and the promise would be untrue. Growth's real
// differentiators that had a flag but no bullet take its place: `investor_pack`
// (api/investor-pack/generate) and `secondary_market.view` (/workspace/equity/secondary).
export const INVESTOR_PACK_FEATURE_LINE =
  "Investor Pack — one-click PDF pack for your raise, plus the secondary-offer simulator";

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
    //   • "Watermarked PDF export" — at the time no renderer watermarked
    //     anything. S21-A (2026-09-12) shipped a real one — `lib/pdf/
    //     watermark.tsx` stamps "Prepared for <investor> · <date> · BlockID.au"
    //     on every page of a data-room PDF served through an investor link —
    //     but it is a Starter+ feature (`investor_links.premium`, migration
    //     0131) and is sold on that rung, not here. Free rooms render clean.
    //   • "Idea validation checklist" — the phrase appears nowhere but here.
    // "10-page valuation report" also went: `usage_limits.report_pages` has no
    // reader in src/, and what a free run actually delivers is the five-page
    // summary that FREE_SUMMARY_PAGE_COUNT pins and svi-summary-pdf renders.
    features: [
      "Your SVI score across all eight dimensions",
      "1 startup workspace",
      "A five-page written summary, emailed as a PDF",
      "Valuation range with its low and high",
      // G11 (2026-09-10, T0247): the Money Finder ladder starts here — the
      // free preview (counts + top-3 names) and the A$3 one-off report.
      "Money Finder preview — how many grants and programs you match, top 3 named",
      "Trusted Business Report A$3 pay-as-you-go",
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
    badge: FOUNDER_RADAR_BADGE,
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
      // S21-A (2026-09-12): both live behind `investor_links.premium` —
      // NDA click-wrap gate on /s/dr/[token] (api/data-room/nda, migration
      // 0339) and the per-investor watermark layer (lib/pdf/watermark.tsx)
      // applied to PDFs served through api/data-room/share/[token]/pdf.
      "NDA click-wrap before an investor sees a document, and PDFs watermarked with their name",
      "See which sections each investor read, and for how long",
      // G11 D10 (2026-09-10, T0247): Founder Radar is bundled here, not sold
      // as a 4th tier or an add-on. Flag `money_radar` (plans.csv, 0316).
      FOUNDER_RADAR_FEATURE_LINE,
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
      // G11 §4h Growth rung — shipped in T0251 (S5): investor reverse-match
      // ("Investors who match" + Request intro), unlimited per-grant
      // application drafts, quarterly expert analysis refresh. Wording is
      // mirrored by FUNDING_COPY.pricing.growth (lib/funding/copy.ts).
      "+ investor matching, unlimited application drafts, quarterly expert update",
      INVESTOR_PACK_FEATURE_LINE,
      "Priority support (24h)",
      // The add-on grants exactly four flags — esop.manage, vesting.read,
      // vesting.write, blockchain.sync (see entitlements/user-grants.ts
      // ADDON_FEATURES). It does NOT grant dividends or a shareholder portal;
      // those have no feature gate in the product at all, and inventing one to
      // make this bullet true would take access away from Growth subscribers
      // who use /workspace/finance/dividends today. So the bullet loses the two claims
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
    // G18-A (2026-09-19): contact-sales rows carry no trial — plans.csv / DB
    // trial_days = 0. This said 7.
    trial_days: 0,
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
/**
 * Every evaluator rung carries `grant_finder` + `money_radar` (0316): a
 * Scout / Firm / Program user runs the Money Finder for the startups they
 * evaluate and gets the same deadline signals through the Progress Radar
 * (G12 §3b, T0273).
 */
export const EVALUATOR_RADAR_LINE = "Money Finder & Progress Radar included";

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
      "10 Trusted Business Reports a month included (A$30 value)",
      "25 tracked startups, 1 seat",
      "Weekly Progress Radar — score deltas, stage changes, new evidence",
      "Deal-flow feed + watchlist",
      // G20-F1: "share-link tracking" had no evaluator-side surface (only the
      // founder data-room engagement view exists) — the bullet keeps the part
      // that ships (api/funding/calendar.ics behind money_radar).
      "ICS calendar of every grant and program deadline",
      EVALUATOR_RADAR_LINE,
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
      "30 Trusted Business Reports a month included",
      "50 tracked startups, 3 seats",
      // G20-F1 (2026-09-20): the three Firm bullets below were rewritten to
      // what ships. "White-label PDF reports" — white-label is hidden
      // (lib/features/hidden.ts) and Firm holds no pdf_branding flag.
      // "Full mentor access to each client's workspace" — the mentor routes
      // are gated on reseller.console, which Firm does not carry; what exists
      // is the roster (advisor.cohort) + engagement notes. "R&DTI / ESIC /
      // s708 checks per client" — there is no per-client surface; the
      // checkers are the public tools, linked from each client's row.
      "Client roster + engagement notes on every client",
      "Intake link — score every applicant on one rubric",
      "ESIC, R&DTI and s708 eligibility checkers",
      EVALUATOR_RADAR_LINE,
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
      "100 Trusted Business Reports a month included",
      "200 tracked startups, 5 seats",
      "Batch scoring — one rubric across a whole application round",
      "Cohort dashboard + quarterly LP / sponsor report export",
      "Read-only API access",
      EVALUATOR_RADAR_LINE,
    ],
  },
  {
    id: "investor_fund",
    segment: "investor",
    name: "Fund",
    monthly_aud: 999,
    annual_aud: 9990,
    trial_days: 7,
    cta_kind: "trial",
    tagline: "VC funds and family offices",
    public: true,
    // Pricing v4 (2026-09-16, plan §3.2). Every bullet is a shipped
    // surface: usage_limits from plans.csv (seats 10, reports -1 =
    // unlimited, profiles 500), the quarterly LP / sponsor report
    // (api/reports/quarterly, `lp_report`), the weekly Progress Radar,
    // the read-only API (`api.access`) and the rubric weights every batch
    // accepts (api/evaluations/batch `rubric_weights`). The csv row also
    // carries `custom_benchmark` / `multi_fund` / `weekly_delta` but no page
    // gates on them yet, so the copy sells the weights, not a "benchmark
    // set". Slack / Affinity / Airtable destinations are NOT listed — they
    // ship with G14 S38 and must not be sold before.
    features: [
      "Everything in Program",
      "Unlimited Trusted Business Reports a month",
      "500 tracked startups, 10 seats",
      "Your own rubric weights across the 8 dimensions on every batch and cohort table",
      "Weekly Progress Radar across the whole portfolio",
      "Quarterly LP / sponsor report export",
      "Read-only API access",
      EVALUATOR_RADAR_LINE,
    ],
  },
  {
    id: "investor_vc_ent",
    segment: "investor",
    name: "VC Enterprise",
    monthly_aud: null,
    annual_aud: null,
    // G18-A (2026-09-19): contact-sales — plans.csv / DB trial_days = 0.
    trial_days: 0,
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
  {
    id: "index_api",
    segment: "investor",
    name: "Index API",
    monthly_aud: 299,
    annual_aud: 2990,
    trial_days: 0,
    cta_kind: "contact",
    tagline: "Programmatic access to the Startup Value Index",
    // Pricing v4 (2026-09-16). Data-only SKU: no workspace, no reports
    // (`usage_limits.profiles` 0, `reports_per_month` 0, `seats` 2,
    // `api_daily_calls` 1000). Sold from /startup-index, /developers and the
    // contact-sales row on /pricing — never as a ladder card, hence hidden.
    public: false,
    features: [
      "Read-only Startup Value Index feed — GET /api/v1/svi, svi_live_ keys",
      "1,000 API calls a day, 2 keys",
      "Listings by sector, sorted by score, plus single-ticker detail",
      "No workspace or reports — data access only",
    ],
  },
];

// ─── Accelerator / Programs ──────────────────────────────────────────────
//
// Pricing v4 (2026-09-16, plan §3.2): the cohort SKUs are public again and
// sold annual-first on the Programs tab of /pricing — Intake link A$249 /
// Cohort 25 A$500 / Cohort 100 A$1,500 (14-day card-required trial) with
// Cohort Enterprise on the contact-sales row. Numbers below are plans.csv
// `usage_limits` (profiles / reports_per_month / seats / monthly_credits);
// plans-v2.test.ts pins them.
const ACCELERATOR: Plan[] = [
  {
    id: "accelerator_intake",
    segment: "accelerator",
    name: "Intake link",
    monthly_aud: 249,
    annual_aud: 2490,
    trial_days: 14,
    cta_kind: "trial",
    tagline: "One application round, scored on intake",
    public: true,
    billing_default: "annual",
    features: [
      "40 Trusted Business Reports a month included",
      "60 tracked startups, 3 seats",
      "Batch scoring — one rubric across a whole application round",
      "Cohort table with CSV export + quarterly sponsor / LP report",
      "Deal-flow feed + watchlist",
      EVALUATOR_RADAR_LINE,
    ],
  },
  {
    id: "accelerator_starter",
    segment: "accelerator",
    name: "Cohort 25",
    monthly_aud: 500,
    annual_aud: 5000,
    trial_days: 14,
    cta_kind: "trial",
    tagline: "One cohort of up to 25 startups",
    public: true,
    billing_default: "annual",
    features: [
      "Everything in Intake link",
      "50 Trusted Business Reports a month included",
      "25 tracked startups, 5 seats",
      "200 AI credits / month for re-scores and drafts",
      // G20-F1: no scheduled per-cohort re-score exists; the weekly movement
      // comes from Progress Radar (api/cron/evaluator-progress-weekly).
      "Cohort dashboard with weekly progress deltas on every startup",
      EVALUATOR_RADAR_LINE,
    ],
  },
  {
    id: "accelerator_growth",
    segment: "accelerator",
    name: "Cohort 100",
    monthly_aud: 1500,
    annual_aud: 15000,
    trial_days: 14,
    cta_kind: "trial",
    most_popular: true,
    tagline: "Multi-cohort programs and universities",
    public: true,
    billing_default: "annual",
    features: [
      "Everything in Cohort 25",
      "200 Trusted Business Reports a month included",
      "100 tracked startups, 15 seats",
      "800 AI credits / month",
      // G20-F1: mentor check-ins / notes are reseller-console tooling
      // (feature reseller.console) — no accelerator row grants them. What
      // Cohort 100 adds over Cohort 25 is the LP report composer
      // (/workspace/lp-report, minPlan accel_growth).
      "LP report composer — anonymised cohort performance for your limited partners",
      EVALUATOR_RADAR_LINE,
    ],
  },
  {
    id: "accelerator_enterprise",
    segment: "accelerator",
    name: "Cohort Enterprise",
    monthly_aud: 3500,
    annual_aud: 35000,
    // G18-A (2026-09-19): contact-sales, no self-serve trial (plans.csv /
    // migration 0413). Said 14 while the row was wrongly `monthly`.
    trial_days: 0,
    cta_kind: "contact",
    tagline: "Unlimited startups, white-label",
    public: false,
    features: [
      "Everything in Cohort 100",
      "Unlimited startups, seats and reports",
      "White-label reports + program branding",
      "Read-only API access + SSO / SAML",
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
 * Pricing v4 ladder (2026-09-16): three public ladders, one per /pricing tab.
 *   Founder   — founder_free (Free) + founder_starter (Founder A$29) +
 *               founder_growth (Growth A$69), A$59/mo Equity add-on on top.
 *   Evaluator — investor_angel (Scout A$79) + investor_advisor (Firm A$149)
 *               + investor_vc_small (Program A$349) + investor_fund (Fund A$999).
 *   Programs  — accelerator_intake (Intake link A$249) + accelerator_starter
 *               (Cohort 25 A$500) + accelerator_growth (Cohort 100 A$1,500).
 * Everything else (retired Pro, founder_enterprise, investor_vc_ent,
 * index_api, accelerator_enterprise) is contact-sales / legacy-renewal only.
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

/**
 * GST display rule (G18-A, 2026-09-19 — one rule for every surface).
 *
 * Every price on the site is GST-INCLUSIVE (Stripe prices are minted with
 * `tax_behavior: "inclusive"`; the 14 legacy/evaluator/credit prices still
 * carrying `unspecified` are a founder dashboard fix — docs/ops/pricing-truth.md).
 * Two spellings only:
 *   • after an amount, the suffix `inc. GST` — "A$3 inc. GST" (`withGst()`);
 *   • as a policy sentence, the adjective `GST-inclusive` — the /pricing
 *     footer line `GST_POLICY_LINE`, stated once per surface.
 * Never the hyphenated, unpunctuated, "incl." / "-incl." / "included" /
 * unhyphenated-"inclusive" variants — pricing/gst-wording.test.ts greps for them.
 */
export const GST_SUFFIX = "inc. GST";
export const GST_POLICY_LINE = "AUD pricing, GST-inclusive. Every charge produces an ATO tax invoice.";

/** "A$3 inc. GST" — the long form for confirm steps, receipts and e-mails. */
export function withGst(label: string): string {
  return `${label} ${GST_SUFFIX}`;
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
