/**
 * /about/invest copy (G17 P2-A moved it out of page.tsx). Amounts are NOT
 * repeated here — prices live on /pricing only (D3/D5); the business-model
 * section names the ladder and links there. Every traction figure has a
 * source in the repo (see the comments). React-free; icons resolved in
 * page.tsx.
 */

export type InvestIcon =
  | "shield-check"
  | "eye"
  | "folder"
  | "bar-chart"
  | "layers"
  | "trending"
  | "users"
  | "dollar"
  | "rocket";

export interface InvestCard {
  icon: InvestIcon;
  title: string;
  body: string;
}

export const INVEST_SVI_DIMENSIONS: readonly string[] = [
  "Team & Founders",
  "Market Opportunity",
  "Product & Technology",
  "Traction & Revenue",
  "Financials & Unit Economics",
  "Legal & Compliance",
  "Intellectual Property",
  "Investor Readiness",
];

export const INVEST_INVESTOR_TOOLS: readonly InvestCard[] = [
  {
    icon: "shield-check",
    title: "Streamlined due diligence",
    body: "Access verified cap tables, financial models and compliance documents through structured data rooms. Spend less time chasing paperwork.",
  },
  {
    icon: "eye",
    title: "Portfolio visibility",
    body: "A live view of your portfolio companies' ownership structures, dilution scenarios and SVI scores — in one dashboard.",
  },
  {
    icon: "folder",
    title: "Secure data rooms",
    body: "Founders share investor-ready data room links with granular access controls, watermarking and audit trails.",
  },
  {
    icon: "bar-chart",
    title: "Compliance tracking",
    body: "Monitor ASIC filings, shareholder agreements and regulatory milestones across your portfolio without manual follow-ups.",
  },
];

export const INVEST_BUSINESS_MODEL: readonly InvestCard[] = [
  {
    icon: "layers",
    title: "SaaS + credit hybrid",
    body: "Revenue from monthly subscriptions and pay-per-use credit packs. Founders start free, then convert through usage. Full Stripe integration with automated billing.",
  },
  {
    icon: "trending",
    title: "88–99.9% gross margins",
    body: "AI-native platform with minimal marginal cost per analysis. No human analysts required. Infrastructure scales linearly with demand.",
  },
];

/**
 * The ladder, by name only — amounts are on /pricing. 2026-09-10 (T0274)
 * re-synced to the live catalogue: Free → Trusted Business Report →
 * Founder Starter / Growth; evaluators Scout / Firm / Program / Fund;
 * programs Intake link / Cohort 25 / Cohort 100; contact sales above.
 */
export const INVEST_LADDER: readonly { tier: string; detail: string }[] = [
  { tier: "Free", detail: "First SVI analysis free, no signup" },
  { tier: "Trusted Business Report", detail: "Full 8-dimension, 13-criteria report on any startup — founders and evaluators alike, one-off" },
  { tier: "Founder Starter / Growth", detail: "The workspace that keeps the score: data room, investor links, Founder Radar, cap table, term sheets, evidence vault" },
  { tier: "Evaluator — Scout / Firm / Program / Fund", detail: "Investors, advisory firms, VC teams and funds: reports included, tracked startups, seats, white-label — card-required trial" },
  { tier: "Programs — Intake link / Cohort 25 / Cohort 100", detail: "Accelerators, incubators and university programs, billed annually" },
  { tier: "Contact sales", detail: "Multi-cohort accelerators, VC enterprise, Index API, reseller / wholesale" },
];

/**
 * Traction figures with a source in the repo: /tools lists 16 free tools;
 * content/team-roster.json holds 11 C-Level agents; evaluation-criteria.ts
 * scores 13 criteria over 8 dimensions; growth/phase-taxonomy.ts has 12
 * phases.
 */
export const INVEST_TRACTION_STATS = [
  { value: "11", label: "C-Level AI agents", hint: "content/team-roster.json" },
  { value: "8 × 13", label: "Dimensions × criteria", hint: "evaluation-criteria.ts" },
  { value: "16", label: "Free tools live", hint: "/tools" },
  { value: "12", label: "Growth phases mapped", hint: "growth/phase-taxonomy.ts" },
] as const;

export const INVEST_TRACTION_POINTS: readonly string[] = [
  "Platform built and deployed with AI-native development by a solo founder and 11 C-Level agents",
  "Complete Stripe integration with the Trusted Business Report, credit packs and subscriptions",
  "16 free startup tools driving organic traffic and lead generation",
  "SVI analysis engine: 8 dimensions, 13 criteria, 12 growth phases, C-suite review with an auditor",
  "Cap table management, dilution modelling, term sheet generator, data rooms",
  "Evaluator workspace for investors, advisory firms and accelerators — Scout, Firm and Program",
];

export const INVEST_MARKET_STATS = [
  { value: "600K", label: "Australian companies in TAM" },
  { value: "0", label: "AU-native alternatives today" },
] as const;

export const INVEST_TEAM_PARAGRAPH =
  "An experienced founder who has raised capital, negotiated term sheets and built cap tables from scratch — supported by a C-suite of AI agents (CEO, COO, CTO, CFO, CPO, CMO, CRO, CLO, CHRO, CDO, CISO) for valuation, market research, R&D eligibility, financial modelling, compliance, content and more, with an auditor agent checking their claims. The scoring method is grounded in the founder's doctoral research (DBA) on startup valuation. This AI-native approach delivers the output of a 20+ person team at a fraction of the cost and time.";

export const INVEST_ASK: readonly InvestCard[] = [
  {
    icon: "users",
    title: "Strategic partners",
    body: "Accounting firms, law firms and startup service providers who serve Australian founders.",
  },
  {
    icon: "dollar",
    title: "Angel investors",
    body: "Investors who understand founder tools, SaaS metrics and the Australian startup ecosystem.",
  },
  {
    icon: "rocket",
    title: "Accelerator partnerships",
    body: "Accelerators and incubators looking for portfolio SVI tracking and cohort management tools.",
  },
];
