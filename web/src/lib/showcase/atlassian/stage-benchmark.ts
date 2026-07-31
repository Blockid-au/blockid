// Atlassian public-record benchmark — S0–S5 × 12-phase × 13-area mapping.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS — AND IS NOT
// ─────────────────────────────────────────────────────────────────────────────
// Atlassian is a real, publicly listed company (NASDAQ: TEAM). Everything in
// this module is a CASE STUDY ASSEMBLED FROM PUBLIC INFORMATION so a founder
// can see what a documented company looked like at each stage of its arc.
//
//   * This is MARKET-REFERENCE / BENCHMARK data.
//   * It is NOT a BlockID assessment, score, rating or Trust Score.
//   * Atlassian has not used, endorsed, reviewed or been assessed by BlockID.
//   * No figure here is BlockID's estimate. Every figure carries the public
//     source it came from, or is explicitly marked NOT_PUBLICLY_DISCLOSED.
//
// Frameworks this maps onto (all real in-repo constants — see the colocated
// test, which resolves every id against them so a rename breaks the build):
//   * 12-phase founder journey  → web/src/lib/startup-growth-phases.ts
//   * 6 unicorn stages S0–S5    → web/src/lib/unicorn/framework.ts
//   * 5-level verification ladder → web/src/lib/verification/level-engine.ts
//   * 13 SVI criteria            → web/src/lib/evaluation-criteria.ts
//   * SCN 5-lens (Startup Compass) → web/src/lib/scn-detect.ts
//   * 13 analysis areas / 4 pillars → Master Upgrade Plan §6
//     (3 L&P · 4 S&C · 4 O&P · 2 T&D; weights sum to 100)
//
// Sibling module: ./fixture.ts holds the original showcase timeline. This
// module deliberately does NOT rewrite it — it adds the sourced stage layer
// (source tier, evidence grade, S0–S5 stage, verification-ladder analogue)
// that the fixture has no fields for.

import { UNICORN_STAGE_IDS, type UnicornStageId } from "@/lib/unicorn/framework";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { GrowthPhaseId, PhaseKey } from "@/lib/journey-map";
import type { VerificationLevel } from "@/lib/verification/level-engine";

// ─── Framing constants ──────────────────────────────────────────────────────

/** Shown on every surface that renders this data. Never omit it. */
export const BENCHMARK_DISCLAIMER =
  "Market reference only. Compiled from Atlassian's public filings and newsroom. " +
  "This is a case study, not a BlockID assessment — BlockID has assessed nothing here, " +
  "and Atlassian is not a BlockID customer and does not endorse BlockID.";

/** Literal used wherever a figure genuinely is not in the public record. */
export const NOT_PUBLICLY_DISCLOSED = "not publicly disclosed" as const;

// ─── Source typing ──────────────────────────────────────────────────────────

/**
 * `primary`   — the company's own SEC filing, its own newsroom/blog, or an
 *               exchange announcement it authored.
 * `secondary` — reported coverage or a third-party write-up. Usable, but a
 *               claim resting only on `secondary` may not be stated as a
 *               hard figure.
 */
export type SourceTier = "primary" | "secondary";

export interface PublicSource {
  label: string;
  url: string;
  tier: SourceTier;
  /** ISO date the document was filed/published, when known. */
  publishedOn?: string;
}

/**
 * `documented`     — the statement is on the face of a cited public source.
 * `interpretation` — BlockID's reading of the public record. A founder should
 *                    treat it as a view, not a fact. Rendered as such.
 */
export type EvidenceGrade = "documented" | "interpretation";

// ─── Primary sources (company filings + company newsroom) ───────────────────

export const SRC_F1_2015: PublicSource = {
  label: "SEC — Atlassian Corporation Plc Form F-1 (filed 9 Nov 2015)",
  url: "https://www.sec.gov/Archives/edgar/data/0001650372/000104746915008450/a2226437zf-1.htm",
  tier: "primary",
  publishedOn: "2015-11-09",
};

export const SRC_424B4_2015: PublicSource = {
  label: "SEC — Atlassian final IPO prospectus (Rule 424(b)(4), Dec 2015)",
  url: "https://www.sec.gov/Archives/edgar/data/1650372/000104746915009143/a2226831z424b4.htm",
  tier: "primary",
  publishedOn: "2015-12-10",
};

export const SRC_IPO_PRICING_PR: PublicSource = {
  label: "Atlassian newsroom — Announces Pricing of Initial Public Offering",
  url: "https://www.atlassian.com/company/news/press-releases/atlassian-announces-pricing-of-initial-public-offering",
  tier: "primary",
  publishedOn: "2015-12-09",
};

export const SRC_ACCEL_2010_BLOG: PublicSource = {
  label: "Atlassian blog — Atlassian Closes $60 Million Investment from Accel Partners",
  url: "https://www.atlassian.com/blog/news/2010/07/atlassian_closes_60_million_investment_from_accel_partners",
  tier: "primary",
  publishedOn: "2010-07-14",
};

export const SRC_HIPCHAT_2012_BLOG: PublicSource = {
  label: "Atlassian blog — Meet HipChat, the newest member of the Atlassian family",
  url: "https://www.atlassian.com/blog/2012/03/meet-hipchat-the-newest-member-of-the-atlassian-family",
  tier: "primary",
  publishedOn: "2012-03-07",
};

export const SRC_TRELLO_PR: PublicSource = {
  label: "Atlassian newsroom — Atlassian to Acquire Trello",
  url: "https://www.atlassian.com/company/news/press-releases/atlassian-to-acquire-trello-to-expand-teamwork-platform0",
  tier: "primary",
  publishedOn: "2017-01-09",
};

export const SRC_LOOM_PR: PublicSource = {
  label: "BusinessWire — Atlassian to Acquire Loom",
  url: "https://www.businesswire.com/news/home/20231012832576/en/Atlassian-to-Acquire-Loom-to-Supercharge-Team-Collaboration",
  tier: "primary",
  publishedOn: "2023-10-12",
};

export const SRC_REDOMICILE_8K: PublicSource = {
  label: "SEC — Atlassian Announces Completion of its Redomiciliation (8-K Ex-99.1)",
  url: "https://www.sec.gov/Archives/edgar/data/1650372/000119312522256215/d583064dex991.htm",
  tier: "primary",
  publishedOn: "2022-10-03",
};

export const SRC_SERVER_EOL: PublicSource = {
  label: "Atlassian blog — Farewell Server, Hello Cloud",
  url: "https://www.atlassian.com/blog/announcements/farewell-to-server",
  tier: "primary",
  publishedOn: "2024-02-15",
};

export const SRC_10K_FY25: PublicSource = {
  label: "SEC — Atlassian Corporation Form 10-K, FY ended 30 June 2025",
  url: "https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm",
  tier: "primary",
  publishedOn: "2025-08-07",
};

export const SRC_Q4_FY25_RELEASE: PublicSource = {
  label: "SEC — Atlassian Q4/FY2025 results release (8-K Ex-99.1)",
  url: "https://www.sec.gov/Archives/edgar/data/1650372/000165037225000028/ex991q4fy25.htm",
  tier: "primary",
  publishedOn: "2025-08-07",
};

export const SRC_20_LESSONS: PublicSource = {
  label: "Atlassian blog — 20 years, 20 lessons (founders' own retrospective)",
  url: "https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons",
  tier: "primary",
  publishedOn: "2022-08-01",
};

export const SRC_COMPANY_PAGE: PublicSource = {
  label: "Atlassian — About Us",
  url: "https://www.atlassian.com/company",
  tier: "primary",
};

// ─── Secondary sources (reported coverage) ──────────────────────────────────

export const SRC_TC_ACCEL: PublicSource = {
  label: "TechCrunch — Atlassian takes $60M first round from Accel",
  url: "https://techcrunch.com/2010/07/14/atlassian-accel-60-million/",
  tier: "secondary",
  publishedOn: "2010-07-14",
};

export const SRC_TC_BITBUCKET: PublicSource = {
  label: "TechCrunch — Atlassian buys Bitbucket",
  url: "https://techcrunch.com/2010/09/29/atlassian-buys-mercurial-project-hosting-site-bitbucket/",
  tier: "secondary",
  publishedOn: "2010-09-29",
};

export const SRC_TC_TROWE: PublicSource = {
  label: "TechCrunch — Atlassian shareholders sell $150M in a secondary at a $3.3B valuation",
  url: "https://techcrunch.com/2014/04/08/atlassian-shareholders-sell-150m-of-their-equity-in-a-secondary-sale-valuing-the-firm-at-3-3b",
  tier: "secondary",
  publishedOn: "2014-04-08",
};

export const SRC_VB_IPO_CLOSE: PublicSource = {
  label: "VentureBeat — Atlassian closes at $27.78, up 32% from its IPO price",
  url: "https://venturebeat.com/2015/12/10/atlassian-closes-at-27-78-per-share-up-32-from-its-ipo-price/",
  tier: "secondary",
  publishedOn: "2015-12-10",
};

// ─── Figures ────────────────────────────────────────────────────────────────

/**
 * A single quantitative claim. `source` is REQUIRED — a figure without a
 * citation cannot be constructed, and the colocated test enforces it.
 * Set `value` to {@link NOT_PUBLICLY_DISCLOSED} when the number is genuinely
 * absent from the record; the `source` then documents where you looked.
 */
export interface BenchmarkFigure {
  label: string;
  value: string;
  source: PublicSource;
}

// ─── Milestones ─────────────────────────────────────────────────────────────

export interface BenchmarkMilestone {
  id: string;
  /** ISO date, or a bare year when only the year is on the record. */
  date: string;
  headline: string;
  /** 1–3 sentences. Never states a number that is not also in `figures`. */
  detail: string;
  /**
   * The 12-phase founder-journey id (from GROWTH_PHASES) whose lesson this
   * milestone illustrates. NOT a chronology claim: GROWTH_PHASES is a
   * checklist ordering, so `product_dev` sits at position 8 even though a
   * real company ships product in year one.
   */
  phase: GrowthPhaseId;
  /** 1..12 position of `phase` within GROWTH_PHASES. Kept in lock-step by the test. */
  phaseOrdinal: PhaseKey;
  /**
   * Where in the S0–S5 arc the event actually sits. Independent of `phase`
   * on purpose — a company revisits phases, but only moves forward through
   * stages. Stage placement is an interpretation; see STAGE_CALIBRATION_NOTE.
   */
  stage: UnicornStageId;
  /** Whether the milestone itself is documented or is our reading. */
  evidence: EvidenceGrade;
  figures: BenchmarkFigure[];
  sources: PublicSource[];
}

export const ATLASSIAN_BENCHMARK_MILESTONES: readonly BenchmarkMilestone[] = [
  {
    id: "2002-founded",
    date: "2002",
    headline: "Founded in Sydney by Mike Cannon-Brookes and Scott Farquhar",
    detail:
      "Two University of New South Wales graduates start the company in Sydney. Atlassian's own retrospective describes the pair funding the start themselves rather than raising capital.",
    phase: "vision",
    phaseOrdinal: 1,
    stage: "S0",
    evidence: "documented",
    figures: [
      {
        label: "Founding capital",
        // The A$10k-credit-card figure is founder-retold and repeated widely,
        // but it does not appear in any filing. See FOLKLORE_CHECKS.
        value: NOT_PUBLICLY_DISCLOSED,
        source: SRC_F1_2015,
      },
    ],
    sources: [SRC_F1_2015, SRC_20_LESSONS, SRC_COMPANY_PAGE],
  },
  {
    id: "2002-jira",
    date: "2002",
    headline: "Jira ships as the first product",
    detail:
      "Issue- and project-tracking for software teams, sold online. The product, not a salesperson, is the distribution channel from day one.",
    phase: "product_dev",
    phaseOrdinal: 8,
    stage: "S1",
    evidence: "documented",
    figures: [],
    sources: [SRC_F1_2015, SRC_COMPANY_PAGE],
  },
  {
    id: "2004-confluence",
    date: "2004",
    headline: "Confluence ships — second product, same channel",
    detail:
      "A second product runs down the same self-serve pipe. The multi-product motion that later carries Bitbucket, Trello and Loom starts here.",
    phase: "product_dev",
    phaseOrdinal: 8,
    stage: "S1",
    evidence: "documented",
    figures: [],
    sources: [SRC_F1_2015, SRC_COMPANY_PAGE],
  },
  {
    id: "2002-2010-profitable",
    date: "2010-07-14",
    headline: "Profitable from inception, no outside financing for eight years",
    detail:
      "Atlassian's own 2010 announcement states the company was self-funded and profitable since inception, and had taken no outside financing before that round. This is the single best-sourced statement about the bootstrapped years.",
    phase: "revenue_model",
    phaseOrdinal: 3,
    stage: "S2",
    evidence: "documented",
    figures: [
      {
        label: "Revenue 2002–2009",
        value: NOT_PUBLICLY_DISCLOSED,
        source: SRC_F1_2015,
      },
    ],
    sources: [SRC_ACCEL_2010_BLOG],
  },
  {
    id: "2010-accel",
    date: "2010-07-14",
    headline: "Accel Partners invests US$60M for a minority position",
    detail:
      "Atlassian announced the close of a US$60M investment from Accel for a minority equity position, with Accel's Rich Wong joining the board and the founders continuing as co-CEOs. Atlassian said the funds would fund expansion, M&A, and employee liquidity. Reported coverage describes the bulk of the money reaching existing shareholders and employees rather than the company's balance sheet.",
    phase: "funding",
    phaseOrdinal: 12,
    stage: "S3",
    evidence: "documented",
    figures: [
      {
        label: "Investment",
        value: "US$60,000,000",
        source: SRC_ACCEL_2010_BLOG,
      },
      {
        label: "Split between primary (new shares) and secondary (existing shares)",
        value: NOT_PUBLICLY_DISCLOSED,
        source: SRC_ACCEL_2010_BLOG,
      },
      {
        label: "Post-money valuation",
        value: NOT_PUBLICLY_DISCLOSED,
        source: SRC_ACCEL_2010_BLOG,
      },
    ],
    sources: [SRC_ACCEL_2010_BLOG, SRC_TC_ACCEL],
  },
  {
    id: "2010-bitbucket",
    date: "2010-09-29",
    headline: "Bitbucket acquired",
    detail:
      "Source hosting joins the portfolio, the first of the roughly twenty acquisitions that follow.",
    phase: "growth",
    phaseOrdinal: 11,
    stage: "S3",
    evidence: "documented",
    figures: [
      {
        label: "Consideration",
        value: NOT_PUBLICLY_DISCLOSED,
        source: SRC_TC_BITBUCKET,
      },
    ],
    sources: [SRC_TC_BITBUCKET],
  },
  {
    id: "2012-hipchat",
    date: "2012-03-07",
    headline: "HipChat acquired",
    detail:
      "Team chat is folded in; HipChat's three co-founders join Atlassian. The product line is later wound down and its IP sold to Slack in 2018 — a reminder that acquisitions in a public benchmark are not all successes.",
    phase: "growth",
    phaseOrdinal: 11,
    stage: "S3",
    evidence: "documented",
    figures: [
      {
        label: "Consideration",
        value: NOT_PUBLICLY_DISCLOSED,
        source: SRC_HIPCHAT_2012_BLOG,
      },
    ],
    sources: [SRC_HIPCHAT_2012_BLOG],
  },
  {
    id: "2014-trowe-secondary",
    date: "2014-04-08",
    headline: "Reported US$150M secondary at a reported US$3.3B valuation",
    detail:
      "Existing shareholders sold approximately US$150M of stock in a reported secondary. Atlassian did not publish a company announcement for this round, so it rests on reported coverage only.",
    phase: "funding",
    phaseOrdinal: 12,
    stage: "S4",
    evidence: "documented",
    figures: [
      {
        label: "Secondary sale size (reported)",
        value: "≈US$150,000,000",
        source: SRC_TC_TROWE,
      },
      {
        label: "Implied valuation (reported)",
        value: "≈US$3,300,000,000",
        source: SRC_TC_TROWE,
      },
    ],
    sources: [SRC_TC_TROWE],
  },
  {
    id: "2013-2015-financials",
    date: "2015-11-09",
    headline: "Pre-IPO financials become public for the first time",
    detail:
      "The registration statement is the first moment anyone outside the company can check the numbers. Thirteen years of trading, and the record starts here.",
    phase: "investor_review",
    phaseOrdinal: 9,
    stage: "S4",
    evidence: "documented",
    figures: [
      { label: "Revenue, fiscal 2013", value: "US$148.5M", source: SRC_424B4_2015 },
      { label: "Revenue, fiscal 2014", value: "US$215.1M", source: SRC_424B4_2015 },
      { label: "Revenue, fiscal 2015", value: "US$319.5M", source: SRC_424B4_2015 },
      { label: "Net income, fiscal 2015", value: "US$6.8M", source: SRC_424B4_2015 },
      { label: "R&D spend, fiscal 2015", value: "US$140.9M (≈44% of revenue)", source: SRC_424B4_2015 },
      { label: "Marketing & sales, fiscal 2015", value: "US$68.0M (≈21% of revenue)", source: SRC_424B4_2015 },
      { label: "Employees at 30 Jun 2013", value: "533", source: SRC_424B4_2015 },
      { label: "Employees at 30 Jun 2014", value: "769", source: SRC_424B4_2015 },
      { label: "Employees at 30 Jun 2015", value: "1,259", source: SRC_424B4_2015 },
      { label: "Customers at IPO", value: "more than 51,000", source: SRC_424B4_2015 },
    ],
    sources: [SRC_F1_2015, SRC_424B4_2015],
  },
  {
    id: "2015-f1-filed",
    date: "2015-11-09",
    headline: "Registration statement filed — on Form F-1, not Form S-1",
    detail:
      "Because the listing entity was Atlassian Corporation Plc, a UK company, Atlassian registered as a foreign private issuer on Form F-1. The prospectus states plainly that the company distributes and sells online without traditional sales infrastructure and does not have a direct salesforce or quota-carrying sales personnel.",
    phase: "investor_review",
    phaseOrdinal: 9,
    stage: "S4",
    evidence: "documented",
    figures: [],
    sources: [SRC_F1_2015, SRC_424B4_2015],
  },
  {
    id: "2015-ipo",
    date: "2015-12-10",
    headline: "IPO on NASDAQ under the ticker TEAM",
    detail:
      "Atlassian priced 22,000,000 Class A ordinary shares at US$21.00, above the marketed range, and began trading on 10 December 2015.",
    phase: "funding",
    phaseOrdinal: 12,
    stage: "S5",
    evidence: "documented",
    figures: [
      { label: "Shares offered", value: "22,000,000 Class A ordinary shares", source: SRC_IPO_PRICING_PR },
      { label: "Offer price", value: "US$21.00 per share", source: SRC_IPO_PRICING_PR },
      { label: "Gross proceeds at offer price", value: "US$462,000,000", source: SRC_IPO_PRICING_PR },
      { label: "First-day close", value: "US$27.78", source: SRC_VB_IPO_CLOSE },
    ],
    sources: [SRC_IPO_PRICING_PR, SRC_424B4_2015, SRC_VB_IPO_CLOSE],
  },
  {
    id: "2017-trello",
    date: "2017-01-09",
    headline: "Trello acquired",
    detail:
      "The first large post-IPO acquisition, and the first whose terms are disclosed because a listed company has to disclose them.",
    phase: "growth",
    phaseOrdinal: 11,
    stage: "S5",
    evidence: "documented",
    figures: [
      { label: "Consideration (announced)", value: "US$425,000,000", source: SRC_TRELLO_PR },
    ],
    sources: [SRC_TRELLO_PR],
  },
  {
    id: "2022-redomicile",
    date: "2022-10-03",
    headline: "Redomiciled from a UK plc to a Delaware corporation",
    detail:
      "The scheme became effective on 30 September 2022; Class A common stock of the new Delaware parent began trading on 3 October 2022 under the same ticker. Atlassian cited broader investor access, index inclusion, peer comparability and a simpler structure.",
    phase: "legal_equity",
    phaseOrdinal: 6,
    stage: "S5",
    evidence: "documented",
    figures: [],
    sources: [SRC_REDOMICILE_8K],
  },
  {
    id: "2023-loom",
    date: "2023-10-12",
    headline: "Loom acquired",
    detail: "Async video joins the platform.",
    phase: "growth",
    phaseOrdinal: 11,
    stage: "S5",
    evidence: "documented",
    figures: [
      { label: "Consideration (announced)", value: "US$975,000,000", source: SRC_LOOM_PR },
    ],
    sources: [SRC_LOOM_PR],
  },
  {
    id: "2024-server-eol",
    date: "2024-02-15",
    headline: "Server end of support — the cloud transition lands",
    detail:
      "Support for self-managed Server products ended, completing a transition Atlassian announced in 2020. Customers not moving to Cloud were pointed at Data Center.",
    phase: "product_dev",
    phaseOrdinal: 8,
    stage: "S5",
    evidence: "documented",
    figures: [],
    sources: [SRC_SERVER_EOL],
  },
  {
    id: "2025-fy25",
    date: "2025-06-30",
    headline: "Fiscal 2025 — US$5.2B revenue, and still a GAAP net loss",
    detail:
      "Twenty-three years in, revenue passes US$5B and free cash flow passes US$1.4B, while the company still reports a GAAP net loss. Growth-stage benchmarks that quote only revenue miss this.",
    phase: "growth",
    phaseOrdinal: 11,
    stage: "S5",
    evidence: "documented",
    figures: [
      { label: "Total revenue, FY2025", value: "US$5,215.3M", source: SRC_Q4_FY25_RELEASE },
      { label: "Cloud revenue, FY2025", value: "US$3,447.4M", source: SRC_Q4_FY25_RELEASE },
      { label: "Subscription revenue, FY2025", value: "US$4,930.6M", source: SRC_Q4_FY25_RELEASE },
      { label: "GAAP net loss, FY2025", value: "US$256.7M loss", source: SRC_Q4_FY25_RELEASE },
      { label: "Free cash flow, FY2025", value: "US$1,415.5M", source: SRC_Q4_FY25_RELEASE },
      {
        label: "Customers with >US$10k Cloud ARR",
        value: "51,978 (+13% YoY)",
        source: SRC_Q4_FY25_RELEASE,
      },
    ],
    sources: [SRC_Q4_FY25_RELEASE, SRC_10K_FY25],
  },
] as const;

// ─── 13 analysis areas / 4 pillars (Master Upgrade Plan §6) ─────────────────
// Split: Leadership & People 3 · Strategy & Commercial 4 · Operations & Performance 4
// · Technology & Digital 2. The last-added dimension is `website_digital_presence`
// (T&D), which pairs with `technology_architecture` and maps to the SVI `website`
// criterion — a public digital-presence signal that Master Plan §17.3 S4 calls out
// as distinct from code/architecture. Pinned by the colocated area-count drift
// guard: see stage-benchmark.test.ts › "13-area drift guard".

export const ANALYSIS_PILLAR_IDS = [
  "leadership_people",
  "strategy_commercial",
  "operations_performance",
  "technology_digital",
] as const;
export type AnalysisPillarId = (typeof ANALYSIS_PILLAR_IDS)[number];

export const ANALYSIS_PILLAR_LABELS: Record<AnalysisPillarId, string> = {
  leadership_people: "Leadership & People",
  strategy_commercial: "Strategy & Commercial",
  operations_performance: "Operations & Performance",
  technology_digital: "Technology & Digital",
};

export const ANALYSIS_AREA_IDS = [
  "founder_leadership",
  "team_culture",
  "hr_organisation",
  "gtm_strategy",
  "revenue_model_sales",
  "marketing_brand",
  "competitive_positioning",
  "operations_process",
  "business_performance_kpis",
  "financial_health",
  "governance_risk_compliance",
  "technology_architecture",
  "website_digital_presence",
] as const;
export type AnalysisAreaId = (typeof ANALYSIS_AREA_IDS)[number];

export interface AnalysisArea {
  id: AnalysisAreaId;
  label: string;
  pillar: AnalysisPillarId;
  /** Weight from Master Plan §6. Weights across all areas sum to 100. */
  weight: number;
  /**
   * The SVI criterion this area lines up with, where the alignment is honest.
   * `null` where no criterion covers it — forcing a bijection would be a
   * fabricated mapping.
   */
  criterion: CriterionKey | null;
}

export const ANALYSIS_AREAS: readonly AnalysisArea[] = [
  { id: "founder_leadership", label: "Founder & Leadership", pillar: "leadership_people", weight: 12, criterion: "founder_profile" },
  { id: "team_culture", label: "Team & Culture", pillar: "leadership_people", weight: 6, criterion: "team" },
  { id: "hr_organisation", label: "HR & Organisation", pillar: "leadership_people", weight: 4, criterion: "team_structure" },
  { id: "gtm_strategy", label: "Go-to-Market Strategy", pillar: "strategy_commercial", weight: 10, criterion: "gtm_strategy" },
  { id: "revenue_model_sales", label: "Revenue Model & Sales", pillar: "strategy_commercial", weight: 12, criterion: "revenue" },
  { id: "marketing_brand", label: "Marketing & Brand", pillar: "strategy_commercial", weight: 5, criterion: null },
  { id: "competitive_positioning", label: "Competitive Positioning", pillar: "strategy_commercial", weight: 5, criterion: "market" },
  { id: "operations_process", label: "Operations & Process", pillar: "operations_performance", weight: 6, criterion: null },
  { id: "business_performance_kpis", label: "Business Performance & KPIs", pillar: "operations_performance", weight: 8, criterion: null },
  { id: "financial_health", label: "Financial Health", pillar: "operations_performance", weight: 12, criterion: null },
  { id: "governance_risk_compliance", label: "Governance, Risk & Compliance", pillar: "operations_performance", weight: 10, criterion: "documents" },
  { id: "technology_architecture", label: "Technology & Architecture", pillar: "technology_digital", weight: 6, criterion: "code_git" },
  { id: "website_digital_presence", label: "Website & Digital Presence", pillar: "technology_digital", weight: 4, criterion: "website" },
] as const;

/**
 * How the public record reads for an area at a point in time.
 *
 * `not_public` is a first-class answer and is the honest reading for most
 * areas before 2015 — a private, self-funded company publishes almost
 * nothing. Absence of evidence is recorded as absence of evidence, never
 * downgraded to "weak".
 */
export type AreaSignal = "strong" | "mixed" | "weak" | "not_public";

export interface AreaReading {
  signal: AreaSignal;
  note: string;
  evidence: EvidenceGrade;
}

// ─── SCN 5-lens ─────────────────────────────────────────────────────────────

export const SCN_LENS_IDS = ["validation", "position", "value", "direction", "capital"] as const;
export type ScnLensId = (typeof SCN_LENS_IDS)[number];

// ─── Per-stage benchmark ────────────────────────────────────────────────────

export interface StageBenchmark {
  stage: UnicornStageId;
  /** Stage label mirrored from UNICORN_STAGES for display convenience. */
  label: string;
  /** The years of Atlassian's arc this stage's exit criteria best describe. */
  period: string;
  /** 12-phase ordinals this stage spans in the mapping. */
  phaseOrdinals: readonly PhaseKey[];
  /** What a company sitting here looked like, per the public record. */
  whatItLookedLike: string;
  /**
   * Where Atlassian would have sat on the 5-level verification ladder, judged
   * by what the ladder actually asks for (independent audit, continuous
   * monitoring). Always an interpretation — the ladder is a BlockID construct.
   */
  verificationAnalogue: { level: VerificationLevel; why: string; evidence: EvidenceGrade };
  /** Artefacts a company at this stage would be expected to hold. */
  expectedArtefacts: readonly string[];
  /** Which of those artefacts are actually visible in the public record. */
  publiclyVisibleArtefacts: readonly string[];
  areaReadings: Record<AnalysisAreaId, AreaReading>;
  scnReadings: Record<ScnLensId, { read: string; evidence: EvidenceGrade }>;
  /** Overall grade for the stage placement itself. */
  stagePlacementEvidence: EvidenceGrade;
  sources: readonly PublicSource[];
}

const NOT_PUBLIC_PRE_IPO = (what: string): AreaReading => ({
  signal: "not_public",
  note: `${what} was not published while the company was private — the record starts with the 2015 registration statement.`,
  evidence: "documented",
});

export const ATLASSIAN_STAGE_BENCHMARKS: readonly StageBenchmark[] = [
  {
    stage: "S0",
    label: "Genesis",
    period: "2002",
    phaseOrdinals: [1, 2],
    whatItLookedLike:
      "Two founders, one city, no outside capital and no public record. Everything known about this period comes from the founders' later retrospectives, not from a contemporaneous document.",
    verificationAnalogue: {
      level: 1,
      why: "Identity and ownership self-declared only. Nothing about the 2002 company was independently evidenced in public.",
      evidence: "interpretation",
    },
    expectedArtefacts: [
      "Certificate of registration / incorporation",
      "Founder shareholding record",
      "Founders' agreement covering vesting and IP assignment",
      "One-page vision statement",
    ],
    publiclyVisibleArtefacts: [],
    areaReadings: {
      founder_leadership: {
        signal: "mixed",
        note: "Two technical co-founders with no prior exits and no operating history. Strong on domain fit, unproven on everything else — which is what a genuine day-zero founder profile looks like.",
        evidence: "interpretation",
      },
      team_culture: NOT_PUBLIC_PRE_IPO("Team composition"),
      hr_organisation: NOT_PUBLIC_PRE_IPO("Employment and equity structure"),
      gtm_strategy: {
        signal: "mixed",
        note: "The online, no-salesperson channel is visible in hindsight from the 2015 prospectus, but there is no 2002 document showing it was a deliberate strategy at the time.",
        evidence: "interpretation",
      },
      revenue_model_sales: NOT_PUBLIC_PRE_IPO("Revenue"),
      marketing_brand: NOT_PUBLIC_PRE_IPO("Marketing activity"),
      competitive_positioning: NOT_PUBLIC_PRE_IPO("Competitive analysis"),
      operations_process: NOT_PUBLIC_PRE_IPO("Operating process"),
      business_performance_kpis: NOT_PUBLIC_PRE_IPO("KPIs"),
      financial_health: NOT_PUBLIC_PRE_IPO("Financial position"),
      governance_risk_compliance: NOT_PUBLIC_PRE_IPO("Governance"),
      technology_architecture: NOT_PUBLIC_PRE_IPO("Architecture"),
      website_digital_presence: NOT_PUBLIC_PRE_IPO("Web presence"),
    },
    scnReadings: {
      validation: { read: "No published evidence of validation work preceding the first product.", evidence: "documented" },
      position: { read: "Entering an existing category (issue tracking) against incumbent tools rather than creating one.", evidence: "interpretation" },
      value: { read: "No revenue on the public record for this year.", evidence: "documented" },
      direction: { read: "Direction is retold by the founders years later; no contemporaneous artefact exists.", evidence: "documented" },
      capital: { read: "No outside capital. Atlassian's own 2010 statement confirms no outside financing until then.", evidence: "documented" },
    },
    stagePlacementEvidence: "interpretation",
    sources: [SRC_F1_2015, SRC_20_LESSONS, SRC_ACCEL_2010_BLOG],
  },
  {
    stage: "S1",
    label: "Foundation",
    period: "2002–2004",
    phaseOrdinals: [3, 4],
    whatItLookedLike:
      "Jira in 2002, Confluence in 2004 — two shipped products sold online. The company is trading and, per its own later statement, profitable, but nothing is externally verifiable yet.",
    verificationAnalogue: {
      level: 1,
      why: "A shipped product and a live domain do not by themselves satisfy the ladder's L2 predicate, which asks for confirmed registry status plus verified domain control alongside identity.",
      evidence: "interpretation",
    },
    expectedArtefacts: [
      "Product release notes / changelog",
      "Standard end-user licence terms",
      "Cap table with any option pool reserved",
      "Bookkeeping baseline and first management accounts",
    ],
    publiclyVisibleArtefacts: ["Product release history", "Public licence terms"],
    areaReadings: {
      founder_leadership: {
        signal: "mixed",
        note: "Founders operating as co-CEOs. The co-CEO structure held until 2020 and is documented in filings, but not for this period.",
        evidence: "interpretation",
      },
      team_culture: NOT_PUBLIC_PRE_IPO("Team composition"),
      hr_organisation: NOT_PUBLIC_PRE_IPO("Employment and equity structure"),
      gtm_strategy: {
        signal: "strong",
        note: "Two products both distributed through the same online, self-serve channel. The 2015 prospectus states the company distributes and sells online without traditional sales infrastructure.",
        evidence: "interpretation",
      },
      revenue_model_sales: {
        signal: "strong",
        note: "Paid licences from launch rather than a free-then-monetise sequence; Atlassian's 2010 statement describes the company as profitable since inception.",
        evidence: "documented",
      },
      marketing_brand: NOT_PUBLIC_PRE_IPO("Marketing activity"),
      competitive_positioning: NOT_PUBLIC_PRE_IPO("Competitive analysis"),
      operations_process: NOT_PUBLIC_PRE_IPO("Operating process"),
      business_performance_kpis: NOT_PUBLIC_PRE_IPO("KPIs"),
      financial_health: {
        signal: "mixed",
        note: "Described by the company as self-funded and profitable since inception, but no figure for these years is on the public record.",
        evidence: "documented",
      },
      governance_risk_compliance: NOT_PUBLIC_PRE_IPO("Governance"),
      technology_architecture: {
        signal: "mixed",
        note: "Two shipped server products; no public architecture or security disclosure until the 2015 filing.",
        evidence: "interpretation",
      },
      website_digital_presence: {
        signal: "strong",
        note: "The website is the sales channel, not a brochure — the prospectus's whole distribution claim depends on it.",
        evidence: "interpretation",
      },
    },
    scnReadings: {
      validation: { read: "Validated by paid purchase rather than by survey — customers bought without a conversation.", evidence: "interpretation" },
      position: { read: "Priced below the enterprise incumbents and sold without a procurement cycle.", evidence: "interpretation" },
      value: { read: "Revenue exists; no figure is public for these years.", evidence: "documented" },
      direction: { read: "Second product on the same channel — the platform direction is visible in the sequencing.", evidence: "interpretation" },
      capital: { read: "Still no outside capital.", evidence: "documented" },
    },
    stagePlacementEvidence: "interpretation",
    sources: [SRC_F1_2015, SRC_424B4_2015, SRC_ACCEL_2010_BLOG, SRC_COMPANY_PAGE],
  },
  {
    stage: "S2",
    label: "Traction",
    period: "2005–2009",
    phaseOrdinals: [5, 6, 7],
    whatItLookedLike:
      "A profitable, growing, entirely private software company with a customer base it never called. Internal rituals that later became famous — ShipIt, Pledge 1%, the written values — date from this window, but the company published no financials.",
    verificationAnalogue: {
      level: 2,
      why: "Registry existence and domain control are externally checkable by this point; nothing financial is attested to a third party, which is the ladder's L3 predicate.",
      evidence: "interpretation",
    },
    expectedArtefacts: [
      "Cohort retention and churn analysis",
      "Unit economics model (acquisition cost against lifetime value)",
      "Documented go-to-market motion",
      "Employment contracts and an option plan",
      "Written company values",
    ],
    publiclyVisibleArtefacts: ["Written company values", "Pledge 1% commitment", "ShipIt programme"],
    areaReadings: {
      founder_leadership: { signal: "mixed", note: "Co-CEO structure persists; no external board yet.", evidence: "interpretation" },
      team_culture: {
        signal: "strong",
        note: "Values, the ShipIt hackathon and the Pledge 1% commitment are all published by the company and date from this window.",
        evidence: "documented",
      },
      hr_organisation: NOT_PUBLIC_PRE_IPO("Employment and equity structure"),
      gtm_strategy: { signal: "strong", note: "Self-serve at scale, later confirmed in the prospectus's description of the sales model.", evidence: "interpretation" },
      revenue_model_sales: { signal: "strong", note: "Recurring licence revenue, profitable, no salesforce cost base.", evidence: "interpretation" },
      marketing_brand: { signal: "mixed", note: "Developer-word-of-mouth brand; no marketing spend figure is public before fiscal 2013.", evidence: "documented" },
      competitive_positioning: NOT_PUBLIC_PRE_IPO("Competitive analysis"),
      operations_process: NOT_PUBLIC_PRE_IPO("Operating process"),
      business_performance_kpis: NOT_PUBLIC_PRE_IPO("KPIs"),
      financial_health: { signal: "mixed", note: "Company-stated profitability, no published figures for these years.", evidence: "documented" },
      governance_risk_compliance: {
        signal: "weak",
        note: "No independent directors until 2012, on reported accounts. A company that later needed to build a board specifically to get IPO-ready is, by its own account, thin here.",
        evidence: "interpretation",
      },
      technology_architecture: { signal: "mixed", note: "Self-managed server products; nothing published on architecture or security posture.", evidence: "interpretation" },
      website_digital_presence: { signal: "strong", note: "The site remains the entire distribution channel.", evidence: "interpretation" },
    },
    scnReadings: {
      validation: { read: "Repeat paid purchase across a broad customer base, without a sales conversation.", evidence: "interpretation" },
      position: { read: "Bottom-up adoption inside organisations that had top-down incumbents.", evidence: "interpretation" },
      value: { read: "Profitable but unquantified in public.", evidence: "documented" },
      direction: { read: "Culture and giving commitments codified before the capital structure was.", evidence: "documented" },
      capital: { read: "No outside capital through the whole window.", evidence: "documented" },
    },
    stagePlacementEvidence: "interpretation",
    sources: [SRC_20_LESSONS, SRC_COMPANY_PAGE, SRC_ACCEL_2010_BLOG],
  },
  {
    stage: "S3",
    label: "Scale",
    period: "2010–2012",
    phaseOrdinals: [8],
    whatItLookedLike:
      "The year the company stopped being purely private in character. Accel's US$60M lands, a partner joins the board, acquisitions begin (Bitbucket 2010, HipChat 2012), and the board is broadened.",
    verificationAnalogue: {
      level: 2,
      why: "An institutional investor performed diligence and took a board seat, which is real third-party scrutiny — but nothing was attested publicly, so the ladder's L3 predicate is still not met on public evidence.",
      evidence: "interpretation",
    },
    expectedArtefacts: [
      "Board charter and meeting minutes",
      "Shareholders' agreement reflecting the new investor",
      "Acquisition diligence packs and share purchase agreements",
      "IP register",
      "Reviewed or audited financial statements",
    ],
    publiclyVisibleArtefacts: ["Investment announcement naming the new board member", "Acquisition announcements"],
    areaReadings: {
      founder_leadership: { signal: "strong", note: "Founders stayed as co-CEOs through an institutional investment — stated in Atlassian's own announcement.", evidence: "documented" },
      team_culture: { signal: "strong", note: "Culture programmes established in the prior window continue and are publicly documented.", evidence: "documented" },
      hr_organisation: {
        signal: "mixed",
        note: "Atlassian said part of the Accel money would facilitate employee liquidity, implying an employee equity base — but the plan's terms are not public for this period.",
        evidence: "documented",
      },
      gtm_strategy: { signal: "strong", note: "Announcement cites expansion into Europe and Asia off the same model.", evidence: "documented" },
      revenue_model_sales: { signal: "strong", note: "Profitable and self-funded up to the raise, per the company's own statement.", evidence: "documented" },
      marketing_brand: { signal: "mixed", note: "No marketing spend disclosure before fiscal 2013.", evidence: "documented" },
      competitive_positioning: { signal: "mixed", note: "Acquisitions signal a platform play; no competitive analysis is public.", evidence: "interpretation" },
      operations_process: NOT_PUBLIC_PRE_IPO("Operating process"),
      business_performance_kpis: NOT_PUBLIC_PRE_IPO("KPIs"),
      financial_health: {
        signal: "mixed",
        note: "Company-stated profitability plus an institutional investor's willingness to buy in; no published statements.",
        evidence: "interpretation",
      },
      governance_risk_compliance: {
        signal: "mixed",
        note: "First institutional board seat in 2010, board broadened around 2012 on reported accounts. Improving from a low base.",
        evidence: "interpretation",
      },
      technology_architecture: { signal: "mixed", note: "Bitbucket brings source hosting in-house; no public architecture disclosure.", evidence: "interpretation" },
      website_digital_presence: { signal: "strong", note: "Unchanged as the primary channel.", evidence: "interpretation" },
    },
    scnReadings: {
      validation: { read: "Validated to an institutional standard for the first time, through Accel's diligence.", evidence: "interpretation" },
      position: { read: "Moving from a product to a portfolio.", evidence: "documented" },
      value: { read: "A valuation existed but was not disclosed.", evidence: "documented" },
      direction: { read: "Atlassian named M&A explicitly as a use of funds.", evidence: "documented" },
      capital: {
        read: "US$60M from Accel for a minority position. Whether that money reached the balance sheet or the shareholders is not split out in any company statement.",
        evidence: "documented",
      },
    },
    stagePlacementEvidence: "interpretation",
    sources: [SRC_ACCEL_2010_BLOG, SRC_TC_ACCEL, SRC_TC_BITBUCKET, SRC_HIPCHAT_2012_BLOG],
  },
  {
    stage: "S4",
    label: "Growth",
    period: "2013–2015 (pre-listing)",
    phaseOrdinals: [9, 10],
    whatItLookedLike:
      "IPO preparation. A reported US$150M secondary at a reported US$3.3B valuation in 2014, a holding-company reorganisation, and three years of audited financials being assembled for the registration statement.",
    verificationAnalogue: {
      level: 3,
      why: "Financial statements were being prepared to a standard an underwriter and auditor would sign, which is the substance of the ladder's L3 attestation predicate — but they were not yet public.",
      evidence: "interpretation",
    },
    expectedArtefacts: [
      "Three years of audited financial statements",
      "Data room organised for underwriter diligence",
      "Cap table with share classes resolved",
      "Related-party and material-contract schedules",
      "Risk-factor register",
    ],
    publiclyVisibleArtefacts: [
      "Everything in the registration statement, once filed",
      "Reported secondary coverage",
    ],
    areaReadings: {
      founder_leadership: { signal: "strong", note: "Co-founders still co-CEOs going into the listing, retaining control through the dual-class structure described in the prospectus.", evidence: "documented" },
      team_culture: { signal: "strong", note: "Headcount grew from 533 to 1,259 between 30 June 2013 and 30 June 2015 per the prospectus.", evidence: "documented" },
      hr_organisation: { signal: "mixed", note: "Share incentive arrangements exist and are filed as prospectus exhibits; the pre-IPO plan history is not narrated.", evidence: "documented" },
      gtm_strategy: {
        signal: "strong",
        note: "Marketing and sales was ≈21% of fiscal 2015 revenue against ≈44% for R&D — the inverse of a typical enterprise software cost base, and the clearest quantitative proof of the distribution model.",
        evidence: "documented",
      },
      revenue_model_sales: {
        signal: "strong",
        note: "Revenue US$148.5M → US$215.1M → US$319.5M across fiscal 2013–2015, all in the prospectus.",
        evidence: "documented",
      },
      marketing_brand: { signal: "strong", note: "US$68.0M marketing and sales spend in fiscal 2015 producing more than 51,000 customers.", evidence: "documented" },
      competitive_positioning: { signal: "mixed", note: "The prospectus names competitors in its risk factors; it is a legal disclosure, not a positioning analysis.", evidence: "interpretation" },
      operations_process: { signal: "mixed", note: "Internal-control disclosures appear in the risk factors; no operating detail beyond that.", evidence: "documented" },
      business_performance_kpis: { signal: "strong", note: "Customer counts and revenue by period are disclosed for the first time.", evidence: "documented" },
      financial_health: { signal: "mixed", note: "Profitable but thinly — US$6.8M net income on US$319.5M of fiscal 2015 revenue.", evidence: "documented" },
      governance_risk_compliance: {
        signal: "mixed",
        note: "A full risk-factor register and board exist, but the listing vehicle was a UK plc claiming foreign-private-issuer accommodations, which carry lighter ongoing obligations than a domestic filer.",
        evidence: "documented",
      },
      technology_architecture: { signal: "mixed", note: "Cloud and server products both in market; the cloud transition is still ahead.", evidence: "interpretation" },
      website_digital_presence: { signal: "strong", note: "The prospectus rests its whole distribution claim on the online channel.", evidence: "documented" },
    },
    scnReadings: {
      validation: { read: "More than 51,000 paying customers at the time of the offering.", evidence: "documented" },
      position: { read: "Positioned as a team-collaboration platform rather than a developer tool.", evidence: "interpretation" },
      value: { read: "A reported US$3.3B secondary valuation in 2014, then a US$21.00 offer price in December 2015.", evidence: "documented" },
      direction: { read: "Holding-company reorganisation and share-class work point squarely at a US listing.", evidence: "interpretation" },
      capital: { read: "Secondary liquidity for existing holders, not new money into the business.", evidence: "documented" },
    },
    stagePlacementEvidence: "interpretation",
    sources: [SRC_424B4_2015, SRC_F1_2015, SRC_TC_TROWE],
  },
  {
    stage: "S5",
    label: "Unicorn-track",
    period: "2015-12-10 onwards",
    phaseOrdinals: [11, 12],
    whatItLookedLike:
      "A listed company under continuous disclosure. Every quarter is audited, filed and checkable; acquisitions carry announced prices; and the whole 2002–2015 information vacuum is replaced by a public record.",
    verificationAnalogue: {
      level: 5,
      why: "Independent audit plus continuous periodic reporting is the closest real-world analogue to the ladder's top rung. Note the direction of travel: a company reaches this by submitting to outside scrutiny, not by growing.",
      evidence: "interpretation",
    },
    expectedArtefacts: [
      "Annual report and audited financial statements",
      "Quarterly results releases",
      "Material-event disclosures",
      "Board and committee charters",
      "Share incentive plan documents",
      "Acquisition agreements with disclosed consideration",
    ],
    publiclyVisibleArtefacts: [
      "Form 10-K (FY2025)",
      "Quarterly results releases",
      "8-K material-event filings",
      "Acquisition announcements with disclosed prices",
    ],
    areaReadings: {
      founder_leadership: { signal: "strong", note: "Founder-led through and beyond the listing; leadership changes are disclosed as they happen.", evidence: "documented" },
      team_culture: { signal: "strong", note: "Distributed-first working and culture programmes are publicly documented by the company.", evidence: "documented" },
      hr_organisation: { signal: "strong", note: "Share incentive plans are filed exhibits; compensation is disclosed annually.", evidence: "documented" },
      gtm_strategy: { signal: "strong", note: "The self-serve model scaled to 51,978 customers above US$10k of Cloud annual recurring revenue in FY2025.", evidence: "documented" },
      revenue_model_sales: { signal: "strong", note: "FY2025 revenue US$5,215.3M, of which US$4,930.6M subscription.", evidence: "documented" },
      marketing_brand: { signal: "strong", note: "Spend and segment results are disclosed each quarter.", evidence: "documented" },
      competitive_positioning: { signal: "mixed", note: "Competitive risk is disclosed in the risk factors; the record does not contain a positioning judgement.", evidence: "documented" },
      operations_process: { signal: "strong", note: "Internal control over financial reporting is audited and reported annually.", evidence: "documented" },
      business_performance_kpis: { signal: "strong", note: "Revenue, cloud revenue, free cash flow and customer cohorts are all disclosed.", evidence: "documented" },
      financial_health: {
        signal: "mixed",
        note: "US$1,415.5M free cash flow in FY2025 alongside a US$256.7M GAAP net loss. Cash-generative and accounting-loss-making at the same time — worth reading carefully before using as a benchmark.",
        evidence: "documented",
      },
      governance_risk_compliance: { signal: "strong", note: "Continuous disclosure obligations, audited controls, and a 2022 move to a Delaware domestic-filer structure.", evidence: "documented" },
      technology_architecture: { signal: "strong", note: "Server end of support in February 2024 completed a cloud transition announced in 2020.", evidence: "documented" },
      website_digital_presence: { signal: "strong", note: "Still the primary channel, now at multi-billion-dollar scale.", evidence: "interpretation" },
    },
    scnReadings: {
      validation: { read: "51,978 customers above US$10k of Cloud annual recurring revenue at the end of FY2025.", evidence: "documented" },
      position: { read: "Platform across planning, code, chat, video and AI, assembled partly by acquisition.", evidence: "documented" },
      value: { read: "FY2025 revenue US$5,215.3M with US$1,415.5M free cash flow and a US$256.7M GAAP net loss.", evidence: "documented" },
      direction: { read: "Cloud-first, AI-attached, with self-managed Server retired in February 2024.", evidence: "documented" },
      capital: { read: "Public equity markets. US$462M raised at the IPO; capital allocation disclosed each period thereafter.", evidence: "documented" },
    },
    stagePlacementEvidence: "documented",
    sources: [SRC_10K_FY25, SRC_Q4_FY25_RELEASE, SRC_REDOMICILE_8K, SRC_SERVER_EOL, SRC_IPO_PRICING_PR],
  },
] as const;

// ─── Per-phase benchmark (12-phase founder journey) ─────────────────────────

export interface PhaseBenchmark {
  ordinal: PhaseKey;
  /** GROWTH_PHASES id — resolved against the real constant by the test. */
  phase: GrowthPhaseId;
  stage: UnicornStageId;
  /** What Atlassian looked like at this phase, per the public record. */
  atlassianAtThisPhase: string;
  /** Areas the public record shows as a strength here. */
  strongAreas: readonly AnalysisAreaId[];
  /** Areas the public record shows as thin, or shows nothing at all. */
  weakOrUnevidencedAreas: readonly AnalysisAreaId[];
  /** Artefacts a company at this phase would be expected to hold. */
  expectedArtefacts: readonly string[];
  evidence: EvidenceGrade;
  sources: readonly PublicSource[];
}

export const ATLASSIAN_PHASE_BENCHMARKS: readonly PhaseBenchmark[] = [
  {
    ordinal: 1,
    phase: "vision",
    stage: "S0",
    atlassianAtThisPhase:
      "2002, Sydney, two founders. No contemporaneous vision document is public; what exists is the founders' own retelling twenty years later.",
    strongAreas: ["founder_leadership"],
    weakOrUnevidencedAreas: ["governance_risk_compliance", "financial_health", "business_performance_kpis"],
    expectedArtefacts: ["Vision statement", "Founders' agreement", "Registration certificate"],
    evidence: "interpretation",
    sources: [SRC_20_LESSONS, SRC_COMPANY_PAGE],
  },
  {
    ordinal: 2,
    phase: "customer_dev",
    stage: "S0",
    atlassianAtThisPhase:
      "No published customer-development artefacts. The validation signal that exists is commercial: people paid, online, without being sold to.",
    strongAreas: [],
    weakOrUnevidencedAreas: ["competitive_positioning", "business_performance_kpis", "marketing_brand"],
    expectedArtefacts: ["Customer interview notes", "Problem statement", "Ideal customer profile"],
    evidence: "interpretation",
    sources: [SRC_424B4_2015],
  },
  {
    ordinal: 3,
    phase: "revenue_model",
    stage: "S1",
    atlassianAtThisPhase:
      "Paid licences from launch. Atlassian's own 2010 statement describes the company as self-funded and profitable since inception.",
    strongAreas: ["revenue_model_sales"],
    weakOrUnevidencedAreas: ["financial_health", "business_performance_kpis"],
    expectedArtefacts: ["Pricing model", "Unit economics", "12-month P&L projection"],
    evidence: "documented",
    sources: [SRC_ACCEL_2010_BLOG],
  },
  {
    ordinal: 4,
    phase: "pitch",
    stage: "S1",
    atlassianAtThisPhase:
      "There is no pitch phase on the public record. The company did not raise, so it never had to produce one — an outlier worth naming rather than copying.",
    strongAreas: [],
    weakOrUnevidencedAreas: ["governance_risk_compliance"],
    expectedArtefacts: ["Pitch deck", "Elevator pitch", "Competitive landscape"],
    evidence: "interpretation",
    sources: [SRC_ACCEL_2010_BLOG],
  },
  {
    ordinal: 5,
    phase: "mentor_review",
    stage: "S2",
    atlassianAtThisPhase:
      "No external board or formal advisory structure is on the record before 2010. Atlassian's own account of the Accel round frames board-building as the thing it needed.",
    strongAreas: [],
    weakOrUnevidencedAreas: ["governance_risk_compliance", "operations_process"],
    expectedArtefacts: ["Advisory board list", "Mentor feedback log"],
    evidence: "interpretation",
    sources: [SRC_ACCEL_2010_BLOG],
  },
  {
    ordinal: 6,
    phase: "legal_equity",
    stage: "S2",
    atlassianAtThisPhase:
      "Employee equity clearly existed by 2010 — Atlassian said part of the Accel round would facilitate employee liquidity — but no plan document from this period is public.",
    strongAreas: [],
    weakOrUnevidencedAreas: ["hr_organisation", "governance_risk_compliance"],
    expectedArtefacts: ["Shareholders' agreement", "Option plan", "IP assignment deeds", "Cap table"],
    evidence: "documented",
    sources: [SRC_ACCEL_2010_BLOG],
  },
  {
    ordinal: 7,
    phase: "go_to_market",
    stage: "S2",
    atlassianAtThisPhase:
      "The defining phase. The prospectus states the company distributes and sells online without traditional sales infrastructure, and has no direct salesforce or quota-carrying sales personnel.",
    strongAreas: ["gtm_strategy", "website_digital_presence", "revenue_model_sales"],
    weakOrUnevidencedAreas: ["business_performance_kpis"],
    expectedArtefacts: ["GTM strategy", "Channel plan", "First-100-customers plan"],
    evidence: "documented",
    sources: [SRC_424B4_2015, SRC_F1_2015],
  },
  {
    ordinal: 8,
    phase: "product_dev",
    stage: "S3",
    atlassianAtThisPhase:
      "Multi-product by acquisition as well as by build: Bitbucket in 2010, HipChat in 2012. R&D ran at roughly 44% of revenue in fiscal 2015 — more than double the marketing and sales line.",
    strongAreas: ["technology_architecture", "revenue_model_sales"],
    weakOrUnevidencedAreas: ["operations_process"],
    expectedArtefacts: ["Product roadmap", "Architecture document", "Security and compliance plan"],
    evidence: "documented",
    sources: [SRC_424B4_2015, SRC_TC_BITBUCKET, SRC_HIPCHAT_2012_BLOG],
  },
  {
    ordinal: 9,
    phase: "investor_review",
    stage: "S4",
    atlassianAtThisPhase:
      "The registration statement filed 9 November 2015 is the first fully evidenced view of the company: three years of audited revenue, headcount, customer counts and risk factors.",
    strongAreas: ["business_performance_kpis", "revenue_model_sales", "governance_risk_compliance"],
    weakOrUnevidencedAreas: ["competitive_positioning"],
    expectedArtefacts: ["Audited financial statements", "Traction dashboard", "Valuation basis", "Investor Q&A"],
    evidence: "documented",
    sources: [SRC_F1_2015, SRC_424B4_2015],
  },
  {
    ordinal: 10,
    phase: "team",
    stage: "S4",
    atlassianAtThisPhase:
      "Headcount 533 → 769 → 1,259 across the three fiscal years to 30 June 2015, with the co-founders remaining co-CEOs through the listing.",
    strongAreas: ["team_culture", "founder_leadership"],
    weakOrUnevidencedAreas: ["hr_organisation"],
    expectedArtefacts: ["Org chart", "Key-hire roadmap", "Equity split review", "Values statement"],
    evidence: "documented",
    sources: [SRC_424B4_2015],
  },
  {
    ordinal: 11,
    phase: "growth",
    stage: "S5",
    atlassianAtThisPhase:
      "Post-listing scale: Trello in 2017, Loom in 2023, Server retired in February 2024, FY2025 revenue of US$5,215.3M with a US$256.7M GAAP net loss.",
    strongAreas: ["gtm_strategy", "business_performance_kpis", "technology_architecture", "operations_process"],
    weakOrUnevidencedAreas: ["financial_health"],
    expectedArtefacts: ["Growth metrics dashboard", "Cohort retention analysis", "Scaling plan"],
    evidence: "documented",
    sources: [SRC_TRELLO_PR, SRC_LOOM_PR, SRC_SERVER_EOL, SRC_Q4_FY25_RELEASE],
  },
  {
    ordinal: 12,
    phase: "funding",
    stage: "S5",
    atlassianAtThisPhase:
      "IPO in December 2015 at US$21.00 per share raising US$462M gross, then a 2022 redomiciliation from a UK plc to a Delaware corporation.",
    strongAreas: ["governance_risk_compliance", "financial_health"],
    weakOrUnevidencedAreas: [],
    expectedArtefacts: ["Data room", "Term-sheet analysis", "Due-diligence checklist", "Investor target list"],
    evidence: "documented",
    sources: [SRC_IPO_PRICING_PR, SRC_424B4_2015, SRC_REDOMICILE_8K],
  },
] as const;

// ─── Folklore checks ────────────────────────────────────────────────────────

export interface FolkloreCheck {
  id: string;
  /** The claim as it is usually retold. */
  popularClaim: string;
  /** What the primary record actually supports. */
  whatTheRecordShows: string;
  verdict: "accurate" | "needs_nuance" | "unsupported";
  sources: readonly PublicSource[];
}

export const ATLASSIAN_FOLKLORE_CHECKS: readonly FolkloreCheck[] = [
  {
    id: "never-took-vc",
    popularClaim: "Atlassian never took venture capital.",
    whatTheRecordShows:
      "Atlassian itself announced the close of a US$60M investment from Accel Partners in July 2010, with Accel taking a minority equity position and Accel partner Rich Wong joining the board. The accurate version is that Atlassian took no outside financing for its first eight years, and that the 2010 round was substantially about liquidity and board-building rather than funding operations — Atlassian's own statement lists employee liquidity among the uses. A reported US$150M secondary followed in 2014. 'Never took VC' is wrong; 'took no outside financing until year eight, then took capital it did not need for cash' is defensible.",
    verdict: "needs_nuance",
    sources: [SRC_ACCEL_2010_BLOG, SRC_TC_ACCEL, SRC_TC_TROWE],
  },
  {
    id: "s1-vs-f1",
    popularClaim: "Atlassian filed an S-1 for its 2015 IPO.",
    whatTheRecordShows:
      "The listing entity was Atlassian Corporation Plc, a UK company, so it registered as a foreign private issuer on Form F-1, filed 9 November 2015 — not Form S-1. This matters for anyone using the filing as a template: an F-1 filer carries different ongoing reporting obligations from a domestic S-1 filer. Atlassian only became a domestic filer after the 2022 Delaware redomiciliation.",
    verdict: "unsupported",
    sources: [SRC_F1_2015, SRC_REDOMICILE_8K],
  },
  {
    id: "zero-founder-dilution",
    popularClaim: "The founders reached the IPO with zero dilution.",
    whatTheRecordShows:
      "No company issues employee equity, completes an institutional round and lists on an exchange without the founders' percentage falling. What is defensible is that the founders retained voting control through a dual-class structure disclosed in the prospectus, and that the pre-IPO transactions in 2010 and 2014 were substantially secondary sales rather than new-share issues. 'Zero dilution' overstates it; 'retained control' is the supportable claim.",
    verdict: "needs_nuance",
    sources: [SRC_424B4_2015, SRC_ACCEL_2010_BLOG, SRC_TC_TROWE],
  },
  {
    id: "no-sales-team",
    popularClaim: "Atlassian has no sales team.",
    whatTheRecordShows:
      "The 2015 prospectus states the company distributes and sells online without traditional sales infrastructure and does not have a direct salesforce or quota-carrying sales personnel. That is a precise claim about quota-carrying reps, not a claim that nobody works on revenue — marketing and sales expense was US$68.0M in fiscal 2015. The structural fact worth taking is the ratio: R&D at roughly 44% of revenue against marketing and sales at roughly 21%.",
    verdict: "needs_nuance",
    sources: [SRC_424B4_2015, SRC_F1_2015],
  },
  {
    id: "ten-thousand-credit-card",
    popularClaim: "Atlassian was started on A$10,000 of credit card debt.",
    whatTheRecordShows:
      "This figure is retold widely and is attributed to the founders in interviews, but it does not appear in any Atlassian filing or in the company's own published retrospective in a form that can be cited as a figure. It is recorded here as not publicly disclosed. Founding capital is genuinely absent from the record.",
    verdict: "unsupported",
    sources: [SRC_F1_2015, SRC_20_LESSONS],
  },
  {
    id: "profitable-since-inception",
    popularClaim: "Atlassian was profitable from day one and still is.",
    whatTheRecordShows:
      "The first half is Atlassian's own claim: its July 2010 announcement says the self-funded company had been profitable since inception. The second half is wrong. Fiscal 2015 net income was US$6.8M on US$319.5M of revenue, and in FY2025 Atlassian reported a US$256.7M GAAP net loss alongside US$1,415.5M of free cash flow.",
    verdict: "needs_nuance",
    sources: [SRC_ACCEL_2010_BLOG, SRC_424B4_2015, SRC_Q4_FY25_RELEASE],
  },
];

// ─── Calibration + human-review posture ─────────────────────────────────────

/**
 * The single most important caveat on this whole module.
 *
 * The S0–S5 windows in web/src/lib/unicorn/framework.ts are day-count targets
 * for a business onboarded digitally on day zero (S0 = D0–14 … S5 = Y2+).
 * Atlassian's real arc does not fit those windows and was never going to: it
 * took roughly thirteen years from founding to the point where the S5 exit
 * predicates (independent audit, continuous monitoring) were genuinely met.
 *
 * Stage placement here is therefore done by EXIT CRITERIA SATISFIED, not by
 * elapsed days. Reading the two as the same thing would produce the false
 * conclusion that Atlassian was "behind schedule" for a decade.
 */
export const STAGE_CALIBRATION_NOTE =
  "Stages are assigned by which exit criteria the public record shows were met, not by the " +
  "S0–S5 day-count windows. Atlassian took roughly thirteen years to reach the S5 criteria; " +
  "the framework's day windows are a target cadence for a digitally onboarded business, not a " +
  "claim about how fast real companies move.";

export interface HumanReviewFlag {
  id: string;
  what: string;
  why: string;
  /** Where the contested judgement lives, so a reviewer can find it. */
  surface: string;
}

/**
 * Contested mappings, flagged rather than self-certified — honouring the
 * `human_blocked` posture in docs/plans/atlassian-standard-mapping-goal.md
 * ("mapping accuracy is a domain call; auto-loop cannot self-verify").
 */
export const ATLASSIAN_HUMAN_REVIEW_FLAGS: readonly HumanReviewFlag[] = [
  {
    id: "stage-window-mismatch",
    what: "S0–S5 placement against a framework whose stages are defined by day windows.",
    why: STAGE_CALIBRATION_NOTE,
    surface: "ATLASSIAN_STAGE_BENCHMARKS[].stage",
  },
  {
    id: "verification-ladder-analogue",
    what: "Mapping Atlassian onto the 5-level verification ladder.",
    why:
      "The ladder's predicates (ABR confirmation, domain verification, attested financials, independent audit, continuous monitoring) are BlockID constructs built for Australian private companies. Applying them to a UK-then-US listed issuer is an analogy, not a measurement. Every level here is marked as an interpretation.",
    surface: "ATLASSIAN_STAGE_BENCHMARKS[].verificationAnalogue",
  },
  {
    id: "area-criterion-linkage",
    what: "Linking Master Plan §6 analysis areas to the 13 SVI criteria.",
    why:
      "Nine of the thirteen areas line up cleanly with a criterion; four do not and are left null rather than forced. Whether Marketing & Brand, Operations & Process, Business Performance & KPIs and Financial Health should have criteria of their own is a product decision, not something this mapping can settle.",
    surface: "ANALYSIS_AREAS[].criterion",
  },
  {
    id: "pre-2015-area-readings",
    what: "Any 'strong' or 'weak' area reading for the years before 2015.",
    why:
      "There is almost no primary evidence about Atlassian before the registration statement. Readings for those years lean on the founders' own retrospectives and on reported coverage. Most areas are recorded as not_public for exactly this reason; the handful that are not should be re-checked by a human before being presented as benchmark strength.",
    surface: "ATLASSIAN_STAGE_BENCHMARKS[S0..S3].areaReadings",
  },
  {
    id: "phase-ordinal-assignment",
    what: "Which of the 12 phases each milestone belongs to.",
    why:
      "A real company runs several phases at once. Assigning the 2010 Accel round to phase 10 (Fundraise) rather than phase 9 (Funding-Ready) or phase 11 (Post-Funding) is a judgement call about what the event most illustrates for a founder.",
    surface: "ATLASSIAN_BENCHMARK_MILESTONES[].phaseOrdinal",
  },
];

// ─── Lookups ────────────────────────────────────────────────────────────────

export function getStageBenchmark(stage: UnicornStageId): StageBenchmark {
  const found = ATLASSIAN_STAGE_BENCHMARKS.find((s) => s.stage === stage);
  if (!found) throw new Error(`No Atlassian benchmark for stage ${stage}`);
  return found;
}

export function getPhaseBenchmark(ordinal: PhaseKey): PhaseBenchmark {
  const found = ATLASSIAN_PHASE_BENCHMARKS.find((p) => p.ordinal === ordinal);
  if (!found) throw new Error(`No Atlassian benchmark for phase ${ordinal}`);
  return found;
}

export function milestonesForStage(stage: UnicornStageId): BenchmarkMilestone[] {
  return ATLASSIAN_BENCHMARK_MILESTONES.filter((m) => m.stage === stage);
}

export function milestonesForPhase(ordinal: PhaseKey): BenchmarkMilestone[] {
  return ATLASSIAN_BENCHMARK_MILESTONES.filter((m) => m.phaseOrdinal === ordinal);
}

export function getAnalysisArea(id: AnalysisAreaId): AnalysisArea {
  const found = ANALYSIS_AREAS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown analysis area ${id}`);
  return found;
}

/** Every stage id in declaration order — convenience for renderers. */
export const BENCHMARK_STAGE_ORDER: readonly UnicornStageId[] = UNICORN_STAGE_IDS;

/** Count of figures whose value is {@link NOT_PUBLICLY_DISCLOSED}. */
export function countUndisclosedFigures(): number {
  return ATLASSIAN_BENCHMARK_MILESTONES.reduce(
    (acc, m) => acc + m.figures.filter((f) => f.value === NOT_PUBLICLY_DISCLOSED).length,
    0,
  );
}
