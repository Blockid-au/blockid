// ReportV2 fixtures — the /tbr/demo sample and the free-tier length-gate
// fixture. Deterministic (fixed generatedAt, fixed numbers) so snapshot
// tests and the page estimate are stable. "Not a real startup" — every
// number is illustrative and the demo page says so.

import type { VcValuationLike } from "@/lib/report-pipeline/valuation-chapter";
import { fromSnapshot, type MoneyOnTableInput, type SnapshotCriterionState, type SnapshotDimState, type SnapshotInput } from "./adapter";
import { GATHER_MISSING_CTAS } from "./evidence-cta";
import type { EvidenceRow, ReportTierV2, ReportV2, ScoreBreakdown, ScoreBreakdownSignal } from "./schema";

// G19-S41: every demo chapter carries a score ledger built from the engine's
// own signal labels and point values (svi-analysis.ts), so the demo shows
// "How this score was built" exactly as a real report does. Each dimension
// score is base + Σ points (the engine bases: FTV/MPC/PTD 50, TRE 30,
// CGH/IRI/LCO 40, SVM 35); the demo reads as a document-uploaded analysis
// with connected Stripe + a tech audit at evidence confidence 0.75 and
// verification L2 (×1.00). The cover carries no engine ledger on purpose:
// the demo's SVI 74 is an illustrative 0–100 composite while the engine
// ledger is the base-100 open-ended index — S46 replaces this fixture with
// BlockID's own report, where both agree.
const DEMO_CONFIDENCE = 0.75;
function demoLedger(base: number, weight: number, signals: ScoreBreakdownSignal[]): ScoreBreakdown {
  const score = Math.max(0, Math.min(100, signals.reduce((a, s) => a + s.points, base)));
  return {
    base,
    signals,
    confidenceMultiplier: DEMO_CONFIDENCE,
    verificationMultiplier: 1,
    adjustment: Math.round(((score - 50) * weight * DEMO_CONFIDENCE) / 100),
    assessed: true,
  };
}
const sig = (signal: string, points: number, source: ScoreBreakdownSignal["source"]): ScoreBreakdownSignal => ({ signal, points, source });

const DEMO_DIMS: Record<string, SnapshotDimState> = {
  ftv: {
    status: "complete",
    score: 83,
    priority: "low",
    insights: ["Repeat founder with a prior exit; sector-domain CTO and a commercial co-founder cover the core roles.", "Advisory board of two operators; vesting agreed on a 4-year / 1-year-cliff schedule."],
    marketBenchmark: "AU seed founders: 2 co-founders median, 38 % with a prior exit.",
    scoreBreakdown: demoLedger(50, 15, [sig("Co-founder team", 15, "document_uploaded"), sig("Domain expertise in target sector", 10, "document_uploaded"), sig("Named advisors or mentors identified", 8, "document_uploaded")]),
  },
  mpc: {
    status: "complete",
    score: 75,
    priority: "medium",
    insights: ["AU SME SaaS category with a top-3 share in its niche; bottom-up SAM cross-checked against ABS industry revenue.", "Three named competitors mapped on price × differentiation; the wedge is compliance automation."],
    scoreBreakdown: demoLedger(50, 18, [sig("Validated problem with customer proof", 25, "document_uploaded")]),
  },
  ptd: {
    status: "complete",
    score: 78,
    priority: "low",
    insights: ["Multi-tenant platform with CI, tests and weekly releases; two patents pending.", "Core Web Vitals pass on mobile; security headers present."],
    scoreBreakdown: demoLedger(50, 12, [sig("Demo or prototype available", 20, "public_url"), sig("Website or landing page present", 5, "public_url"), sig("Tech audit: +3 (security, performance, stack)", 3, "audit")]),
  },
  tre: {
    status: "complete",
    score: 78,
    priority: "medium",
    insights: ["A$420k ARR growing 4.5 % MoM; 120 paying SMEs, churn 2.1 %.", "NRR 104 % on the last four cohorts; top customer is 9 % of revenue."],
    scoreBreakdown: demoLedger(30, 20, [sig("Growing revenue ($100k–$500k ARR range)", 40, "transaction_data"), sig("Customer proof present", 8, "connected_source")]),
  },
  cgh: {
    status: "complete",
    score: 75,
    priority: "medium",
    insights: ["Clean cap table after one seed round; founders hold 71 %, ESOP pool 10 %.", "Shareholders agreement drafted, not yet signed; dilution for the next round not yet modelled."],
    scoreBreakdown: demoLedger(40, 12, [sig("Equity register on file (4 holders; founders 71 %, ESOP 10 %, investors 19 %)", 20, "connected_source"), sig("ESOP pool 10 % in the register", 10, "connected_source"), sig("ESOP pool within the AU seed norm (8–20 %)", 5, "connected_source")]),
  },
  iri: {
    status: "complete",
    score: 75,
    priority: "low",
    insights: ["Data room 78 % complete across the eight standard folders; deck and one-pager current.", "ESIC self-assessment done; s708 letters drafted."],
    scoreBreakdown: demoLedger(40, 10, [sig("Pitch deck available", 25, "document_uploaded"), sig("Raise target mentioned", 10, "document_uploaded")]),
  },
  lco: {
    status: "complete",
    score: 81,
    priority: "low",
    insights: ["ACN registered, IP assigned, privacy policy live; R&D Tax Incentive claimed.", "Essential Eight ML1 reached; trademark registered in class 42."],
    scoreBreakdown: demoLedger(40, 8, [sig("ABN/ASIC registration confirmed", 20, "document_uploaded"), sig("IP protection in place (patent, trademark, copyright)", 15, "document_uploaded"), sig("Tech audit: +6 (HTTPS + security headers)", 6, "audit")]),
  },
  svm: {
    status: "complete",
    score: 65,
    priority: "medium",
    insights: ["Category moat forming through proprietary compliance data; switching cost mid.", "Exit path plausible via strategic acquirers in AU accounting software."],
    scoreBreakdown: demoLedger(35, 5, [sig("Proprietary data advantage identified", 15, "document_uploaded"), sig("Switching costs or lock-in mechanism present", 15, "document_uploaded")]),
  },
};

const DEMO_CRITERIA: SnapshotCriterionState[] = [
  { key: "idea", title: "Idea & Innovation", primary_dimension: "mpc", weight: 8, score: 76, verdict: "Clear problem-solution fit in SME compliance; novelty is in the workflow, not the model.", strengths: ["Problem quantified: SMEs spend 6 h/week on compliance admin", "Pilot customers renewed"], gaps: ["Adjacent-market optionality not evidenced"], next_action: "Publish the category thesis on the website." },
  { key: "market", title: "Market Opportunity", primary_dimension: "mpc", weight: 8, score: 74, verdict: "Bottom-up SAM of A$310M cross-checks with the ABS top-down anchor.", strengths: ["SAM built from 41k eligible SMEs × A$7.5k ACV", "Timing tailwind: payday super reform"], gaps: ["SOM trajectory not shown beyond 24 months"], next_action: "Add the 3-year share-of-SOM curve to the deck." },
  { key: "founder_profile", title: "Founder Profile", primary_dimension: "ftv", weight: 8, score: 84, verdict: "Founder-market fit is strong: 8 years in the domain and a prior exit.", strengths: ["Prior exit (trade sale, 2021)", "Domain network with 3 industry bodies"], gaps: ["Key-person risk on the CEO"], next_action: "Document the succession plan in the data room." },
  { key: "code_git", title: "Code & Git Repository", primary_dimension: "ptd", weight: 8, score: 79, verdict: "Healthy repo: 210 commits in 90 days, 71 % test coverage, CI on every PR.", strengths: ["CI green for 12 weeks", "Dependency freshness 92 %"], gaps: ["Bus factor 2 on the billing service"], next_action: "Pair a second engineer on billing." },
  { key: "website", title: "Website & Digital Presence", primary_dimension: "ptd", weight: 6, score: 77, verdict: "Site passes Core Web Vitals; conversion tracking in place.", strengths: ["LCP 1.9 s mobile", "GA4 conversions wired"], gaps: ["No pricing page experiments"], next_action: "Run one pricing-page A/B test." },
  { key: "team", title: "Team Composition", primary_dimension: "ftv", weight: 8, score: 80, verdict: "Hacker / hustler / finance covered; product design is contracted.", strengths: ["Complementary trio full-time", "Advisory board of two operators"], gaps: ["Product design not in-house"], next_action: "Hire a product designer in the next 60 days." },
  { key: "customer_size", title: "Customer Base & Traction", primary_dimension: "tre", weight: 10, score: 72, verdict: "120 paying SMEs, +9 net new per month, churn 2.1 %.", strengths: ["Cohort retention M6 = 88 %", "Two anchor logos on 12-month terms"], gaps: ["Pipeline coverage 2.1× (target 3×)"], next_action: "Lock two more anchor logos into annual contracts." },
  { key: "gtm_strategy", title: "Go-to-Market Strategy", primary_dimension: "mpc", weight: 8, score: 70, verdict: "Partner-led channel through accountants drives 60 % of new logos.", strengths: ["Accountant partner program: 34 firms", "CAC payback 11 months"], gaps: ["Direct channel CAC not broken out"], next_action: "Report CAC by channel in the monthly update." },
  { key: "documents", title: "Key Documents", primary_dimension: "iri", weight: 8, score: 78, verdict: "Deck, model and one-pager current; DD checklist 80 % complete.", strengths: ["Model shows actual-vs-plan", "Privacy policy and terms reviewed"], gaps: ["Board minutes missing for two quarters"], next_action: "Upload the missing board minutes." },
  { key: "dataroom", title: "Data Room", primary_dimension: "iri", weight: 6, score: 74, verdict: "Eight folders present; contracts and IP folders partially stale.", strengths: ["Corporate and cap-table folders complete"], gaps: ["Contracts folder last updated 5 months ago"], next_action: "Refresh the contracts folder before the raise." },
  { key: "team_structure", title: "Team Structure & Governance", primary_dimension: "ftv", weight: 6, score: 69, verdict: "Board of three with one independent seat; information rights defined.", strengths: ["SHA with 4y / 1y vesting", "Monthly board cadence"], gaps: ["No D&O insurance yet"], next_action: "Quote D&O cover before the next round." },
  { key: "roadmap", title: "Product Roadmap", primary_dimension: "svm", weight: 8, score: 66, verdict: "12-month roadmap ties to the category thesis; moat factors partially evidenced.", strengths: ["Proprietary compliance dataset growing 12 %/month"], gaps: ["Network effects not yet demonstrated"], next_action: "Publish the moat / switching-cost analysis for the Series A deck." },
  { key: "revenue", title: "Revenue & Unit Economics", primary_dimension: "tre", weight: 8, score: 70, verdict: "A$420k ARR, gross margin 74 %, LTV/CAC 3.4×, payback 11 months.", strengths: ["Rule of 40 = 52", "Burn multiple 1.4"], gaps: ["Expansion revenue only 6 % of NRR"], next_action: "Introduce a usage-based add-on to lift expansion revenue." },
];

export const DEMO_GENERATED_AT = "2026-09-15T00:00:00.000Z";

/**
 * G19-S43 — the demo's evidence rows, as GATHER + the Evidence Hub would mint
 * them: Stripe revenue (TRE), the cap-table register (CGH), a tech audit
 * (PTD) and a reviewer-verified hub upload (LCO) — plus two `missing` rows
 * with linked CTAs (no GitHub token on PTD / FTV; no LinkedIn export on FTV)
 * so /tbr/demo shows CTA rows exactly as a real report does.
 */
export function demoEvidenceRows(): EvidenceRow[] {
  return [
    { evidence_id: "ev-connected-revenue-stripe", source: "stripe", label: "Stripe revenue (last sync)", status: "evidenced", observedAt: "2026-09-10T00:00:00.000Z", value: "mrr_aud = 100000; prior_mrr_aud = 95700; churn_90d_pct = 2.1", dims: ["tre", "iri", "cgh"], confidence: "transaction_data" },
    { evidence_id: "ev-cap-table-demo", source: "upload", label: "Cap-table register (shareholders + ESOP pool)", status: "evidenced", observedAt: "2026-09-12T00:00:00.000Z", value: "holders = 4; founders_pct = 71; esop_pct = 10; investors_pct = 19; vesting = true", dims: ["cgh", "iri", "lco"], confidence: "connected_source" },
    { evidence_id: "ev-tech-audit-demo", source: "url", label: "Technical audit: https://demo.example.com", status: "evidenced", observedAt: "2026-09-14T00:00:00.000Z", value: "grade B; TTFB 310 ms; security A", dims: ["ptd", "svm", "lco"], confidence: "public_url" },
    { evidence_id: "ev-hub-lco-ip-assignment", source: "upload", label: "IP assignment agreement — Evidence Hub, reviewer-verified", status: "evidenced", observedAt: "2026-09-08T00:00:00.000Z", dims: ["lco"], confidence: "third_party_verified" },
    { evidence_id: "ev-missing-repo-audit", source: "github", label: "GitHub repository demo/compliance-saas", status: "missing", observedAt: DEMO_GENERATED_AT, value: "Connect GitHub (Evidence → Connectors) to audit the repository — link only, not audited", dims: ["ptd", "ftv"], cta: GATHER_MISSING_CTAS.repo_audit },
    { evidence_id: "ev-missing-founder-signals", source: "linkedin", label: "Founder profile (LinkedIn export / URL)", status: "missing", observedAt: DEMO_GENERATED_AT, value: "No founder profile yet — upload the LinkedIn PDF export", dims: ["ftv"], cta: GATHER_MISSING_CTAS.founder_signals },
  ];
}

/** G19-S43 — two grant matches + one program, as grant-advisor returns them for a NSW SaaS at seed. */
export function demoMoneyOnTable(): MoneyOnTableInput {
  return {
    grants: [
      { id: "rdti", name: "R&D Tax Incentive (refundable offset)", amountAud: 87_000, fit: 84, url: "https://business.gov.au/grants-and-programs/research-and-development-tax-incentive" },
      { id: "mvp-nsw", name: "NSW MVP Ventures", amountAud: 200_000, deadline: "2026-11-30", fit: 71, url: "https://www.investment.nsw.gov.au/grants-and-rebates/mvp-ventures/" },
    ],
    programs: [{ id: "startmate", name: "Startmate Accelerator", amountAud: 120_000, deadline: "2026-10-15", fit: 58, url: "https://www.startmate.com/accelerator" }],
  };
}

const DEMO_SOURCE_LABEL = "BlockID static table (2026-06) · Bessemer Venture Partners";
const DEMO_BASELINE_SOURCE = "Cut Through Venture — State of Australian Startup Funding 2024/25 medians";

/** A fixed SVI backtest slice (the published shape, numbers illustrative) so the demo shows the quartile cross-check. */
const DEMO_BACKTEST: NonNullable<VcValuationLike["backtest"]> = {
  generated_at: "2026-09-13T00:00:00.000Z",
  n: 49,
  n_with_round: 41,
  buckets: [
    { quartile: 1, label: "Q1 (lowest SVI)", n: 10, svi_min: 100, svi_max: 116, median_round_aud: 8_250_000, p25_round_aud: 5_000_000, p75_round_aud: 10_500_000, n_valuation: 3, median_valuation_aud: 36_000_000 },
    { quartile: 2, label: "Q2", n: 11, svi_min: 118, svi_max: 128, median_round_aud: 50_000_000, p25_round_aud: 30_000_000, p75_round_aud: 79_500_000, n_valuation: 1, median_valuation_aud: 250_000_000 },
    { quartile: 3, label: "Q3", n: 10, svi_min: 129, svi_max: 141, median_round_aud: 47_500_000, p25_round_aud: 22_500_000, p75_round_aud: 90_000_000, n_valuation: 1, median_valuation_aud: 1_000_000_000 },
    { quartile: 4, label: "Q4 (highest SVI)", n: 10, svi_min: 142, svi_max: 156, median_round_aud: 147_500_000, p25_round_aud: 114_750_000, p75_round_aud: 210_250_000, n_valuation: 8, median_valuation_aud: 1_550_000_000 },
  ],
};

/**
 * G19-S42 — the demo company's CFO valuation, as `buildVcValuationReport`
 * emits it for A$100K MRR (Stripe-evidenced), 4.5 %/mo observed growth, 5/5
 * Berkus pillars, RDTI A$87K, seed / SVI stage 3, saas multiples 6–7.5×.
 * Literal (not computed) so the fixture stays deterministic and client-safe.
 */
export function demoVcValuation(): VcValuationLike {
  return {
    blended: { lowAud: 5_997_288, midAud: 7_628_050, highAud: 9_774_520, confidence: 85 },
    methods: [
      { method: "revenue_multiple", lowAud: 7_200_000, midAud: 8_100_000, highAud: 9_000_000, weight: 0.35, applicable: true, rationale: `AU saas revenue multiples 6–7.5x ARR for seed stage. Multiples: ${DEMO_SOURCE_LABEL}.` },
      { method: "berkus", lowAud: 1_750_000, midAud: 2_500_000, highAud: 3_250_000, weight: 0.1, applicable: true, rationale: "Berkus milestone-based valuation (A$500K per pillar, AU-adjusted): 5 of 5 pillars evidenced." },
      { method: "dcf_proxy", lowAud: 5_880_000, midAud: 8_400_000, highAud: 11_760_000, weight: 0.25, applicable: true, rationale: "Simplified DCF using sector growth rate and AU exit comparables." },
      { method: "comparables", lowAud: 6_075_000, midAud: 8_100_000, highAud: 10_935_000, weight: 0.15, applicable: true, rationale: "Comparable AU saas transactions — growth tier: standard (54% YoY, Bessemer Cloud Index 2025 adjustment: 1x)." },
      { method: "risk_factor_summation", lowAud: 6_140_250, midAud: 8_187_000, highAud: 11_461_800, weight: 0.15, applicable: true, rationale: "Risk Factor Summation; au-tax: 1%; Refundable RDTI est. A$87K (+1.1% proportional lift)." },
      { method: "scorecard", lowAud: 4_935_000, midAud: 7_050_000, highAud: 9_870_000, weight: 0, applicable: false, rationale: "Bill Payne Scorecard Method anchored to AU seed median A$6M (AVCAL / Cut Through Venture 2024). Composite multiplier: 1.18x. Reference only (weight 0) once revenue multiples apply." },
      { method: "stage_baseline", lowAud: 6_000_000, midAud: 10_000_000, highAud: 15_000_000, weight: 0, applicable: false, rationale: "AU pre-money baseline for SVI stage 3 (Traction / seed) — shown as a cross-check, not blended." },
    ],
    scenarios: { bear: 4_198_101, base: 7_628_050, bull: 12_706_876 },
    unitEconomics: { cacAud: 900, ltvAud: 3_060, ltvCacRatio: 3.4, grossMarginPct: 74, ruleOf40: 52, cacPaybackMonths: 11, verdict: "healthy" },
    injection: { raiseAud: 0, raiseStated: false, preMoneyAud: 7_628_050 },
    sectorMultiples: { sector: "saas", low: 6, median: 6.75, high: 7.5, sourceLabel: DEMO_SOURCE_LABEL, sourceDate: "2026-06" },
    inputs: { mrrAud: 100_000, arrAud: 1_200_000, monthlyGrowthRatePct: 4.5, sector: "saas", stage: "seed", sviStage: 3, esicQualifies: false, estimatedRdtiRefundAud: 87_000, revenueSource: "stripe (last sync 2026-09-10)" },
    valuationInputs: {
      mrrAud: 100_000,
      arrAud: 1_200_000,
      revenueSource: "connector",
      monthlyGrowthRatePct: 4.5,
      growthAssumed: false,
      esicQualifies: false,
      rdtiRefundAud: 87_000,
      berkusPillars: { soundIdea: true, prototype: true, qualityTeam: true, strategicRelationships: true, productRollout: true },
      stage: "seed",
      sviStage: 3,
      sector: "saas",
      sectorMultipleLow: 6,
      sectorMultipleHigh: 7.5,
      sectorMultipleMedian: 6.75,
      raiseStated: false,
    },
    derivation: {
      revenue_multiple: `ARR A$1.2M × 6–7.5 (sector p25–p75, ${DEMO_SOURCE_LABEL})`,
      berkus: "5 of 5 pillars × A$500K (sound idea, prototype, quality team, strategic relationships, product rollout) = A$2.5M",
      dcf_proxy: "ARR A$1.2M × (6 + 1) growth-adjusted proxy",
      comparables: "ARR A$1.2M × median 6.75 × growth tier 1 (standard)",
      risk_factor_summation: "ARR A$1.2M × median 6.75 × (1 + AU tax 1 %)",
      scorecard: "AU seed median A$6M (AVCAL / Cut Through Venture 2024). Composite multiplier: 1.18x — reference",
      stage_baseline: "SVI stage 3 (Traction / seed) median A$10M — cross-check",
    },
    stageBaseline: { sviStage: 3, stageLabel: "Traction / seed", lowAud: 6_000_000, midAud: 10_000_000, highAud: 15_000_000, source: DEMO_BASELINE_SOURCE },
    backtest: DEMO_BACKTEST,
  };
}

/**
 * G19-S42 — a pre-revenue CFO valuation (A$0 MRR, 12 pilot users, founder
 * vesting, SVI stage 2): Berkus 0.5 + scorecard 0.3 + stage baseline 0.2,
 * the four revenue methods non-applicable, no raise stated, growth not assumed.
 */
export function preRevenueVcValuation(): VcValuationLike {
  const needsRevenue = "Needs revenue: connect Stripe/Xero or state MRR.";
  return {
    blended: { lowAud: 2_322_000, midAud: 3_460_000, highAud: 4_969_000, confidence: 35 },
    methods: [
      { method: "revenue_multiple", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: needsRevenue },
      { method: "berkus", lowAud: 1_050_000, midAud: 1_500_000, highAud: 1_950_000, weight: 0.5, applicable: true, rationale: "Berkus milestone-based valuation (A$500K per pillar, AU-adjusted): 3 of 5 pillars evidenced." },
      { method: "dcf_proxy", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: needsRevenue },
      { method: "comparables", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: needsRevenue },
      { method: "risk_factor_summation", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: needsRevenue },
      { method: "scorecard", lowAud: 3_990_000, midAud: 5_700_000, highAud: 7_980_000, weight: 0.3, applicable: true, rationale: "Bill Payne Scorecard Method anchored to AU seed median A$6M (AVCAL / Cut Through Venture 2024). Composite multiplier: 0.95x." },
      { method: "stage_baseline", lowAud: 3_000_000, midAud: 5_000_000, highAud: 8_000_000, weight: 0.2, applicable: true, rationale: `AU pre-money baseline for SVI stage 2 (MVP / pre-seed) — ${DEMO_BASELINE_SOURCE}.` },
    ],
    scenarios: { bear: 1_625_400, base: 3_460_000, bull: 6_459_700 },
    unitEconomics: { cacAud: 500, ltvAud: 0, ltvCacRatio: 0, grossMarginPct: 72, ruleOf40: 44, cacPaybackMonths: null, verdict: "weak" },
    injection: { raiseAud: 0, raiseStated: false, preMoneyAud: 3_460_000 },
    sectorMultiples: { sector: "saas", low: 6, median: 6.75, high: 7.5, sourceLabel: DEMO_SOURCE_LABEL, sourceDate: "2026-06" },
    inputs: { mrrAud: 0, arrAud: 0, sector: "saas", stage: "pre-seed", sviStage: 2, esicQualifies: false, estimatedRdtiRefundAud: 0, revenueSource: null },
    valuationInputs: {
      mrrAud: 0,
      arrAud: 0,
      revenueSource: "none",
      growthAssumed: false,
      esicQualifies: false,
      rdtiRefundAud: 0,
      berkusPillars: { soundIdea: true, prototype: true, qualityTeam: true, strategicRelationships: false, productRollout: false },
      stage: "pre-seed",
      sviStage: 2,
      sector: "saas",
      sectorMultipleLow: 6,
      sectorMultipleHigh: 7.5,
      sectorMultipleMedian: 6.75,
      raiseStated: false,
    },
    derivation: {
      berkus: "3 of 5 pillars × A$500K (sound idea, prototype, quality team) = A$1.5M",
      scorecard: "AU seed median A$6M (AVCAL / Cut Through Venture 2024). Composite multiplier: 0.95x",
      stage_baseline: "SVI stage 2 (MVP / pre-seed) median A$5M (A$3M–A$8M), CTV 2024/25",
      revenue_multiple: needsRevenue,
      dcf_proxy: needsRevenue,
      comparables: needsRevenue,
      risk_factor_summation: needsRevenue,
    },
    stageBaseline: { sviStage: 2, stageLabel: "MVP / pre-seed", lowAud: 3_000_000, midAud: 5_000_000, highAud: 8_000_000, source: DEMO_BASELINE_SOURCE },
    backtest: DEMO_BACKTEST,
  };
}

export function demoSnapshotInput(tier: ReportTierV2 = "standard"): SnapshotInput {
  return {
    snapshotId: "demo-snapshot",
    reportId: "rv2-demo",
    projectId: "demo",
    accountId: "demo",
    createdAt: DEMO_GENERATED_AT,
    generatedAt: DEMO_GENERATED_AT,
    startupName: "Sample SME Compliance SaaS (demo)",
    industry: "SaaS",
    stageLabel: "Seed",
    sviTotal: 74,
    deltaVsLast: 3,
    dimStates: DEMO_DIMS,
    criterionStates: DEMO_CRITERIA,
    phaseId: "investor_review",
    // G14-S36: the demo company is ABR-confirmed (L2) so /tbr/demo shows the "Verified ABN" badge.
    verificationLevel: 2,
    tier,
    locale: "en",
    // G19-S42: the demo carries the CFO valuation so /tbr/demo shows inputs,
    // derivation and cross-checks (Stripe-evidenced revenue, no ask stated).
    vc: demoVcValuation(),
    revenueEvidenceIds: ["ev-connected-revenue-stripe"],
    // G19-S43: evidence rows (with two linked CTA rows), the engine's P0 / P1
    // gaps, two grants + one program, three co-founders, and the cover's
    // "Evidence: connected sources (×0.75)" line.
    evidenceRows: demoEvidenceRows(),
    evidenceGaps: [
      { priority: "P1", label: "Link source code repository", action: "Connect GitHub or GitLab to verify product progress", impact: 6, evidenceType: "connected_source", code: "github_repo" },
      { priority: "P2", label: "Add named advisors", action: "Engage 1–2 industry advisors and list them in your materials", impact: 4, evidenceType: "self_declared", code: "advisor_bios" },
    ],
    coFounders: 3,
    evidenceLevel: { level: "connected_source", confidenceMultiplier: DEMO_CONFIDENCE },
    moneyOnTable: demoMoneyOnTable(),
    source: "fixture",
  };
}

/** The /tbr/demo report — standard tier, every chapter in full. */
export function demoReportV2(): ReportV2 {
  return fromSnapshot(demoSnapshotInput("standard"));
}

/** The free-tier fixture the 10-page length gate is tested against. */
export function freeFixtureReportV2(): ReportV2 {
  return fromSnapshot(demoSnapshotInput("free"));
}

/**
 * G19-S42 — a pre-revenue sample (SVI stage 2 "MVP / Prototype", A$0 MRR):
 * exactly Berkus + scorecard + stage_baseline applicable, weights 0.5 / 0.3 /
 * 0.2, no ask. Used by the schema, render and twin tests.
 */
export function preRevenueFixtureReportV2(tier: ReportTierV2 = "standard"): ReportV2 {
  return fromSnapshot({
    ...demoSnapshotInput(tier),
    snapshotId: "demo-pre-revenue",
    reportId: "rv2-demo-pre-revenue",
    startupName: "Sample pre-revenue climate-data startup (demo)",
    stageLabel: "MVP / Prototype",
    stage: 2,
    sviTotal: 104,
    dimStates: { ...DEMO_DIMS, tre: { status: "complete", score: 31, priority: "high", insights: ["No revenue yet; 12 pilot users on a free tier.", "Two LOIs signed, none converted."] } },
    vc: preRevenueVcValuation(),
    revenueEvidenceIds: [],
    valuationAsk: null,
  });
}
