// ReportV2 fixtures — the /tbr/demo sample and the free-tier length-gate
// fixture. Deterministic (fixed generatedAt, fixed numbers) so snapshot
// tests and the page estimate are stable. "Not a real startup" — every
// number is illustrative and the demo page says so.

import { fromSnapshot, type SnapshotCriterionState, type SnapshotDimState, type SnapshotInput } from "./adapter";
import type { ReportTierV2, ReportV2 } from "./schema";

const DEMO_DIMS: Record<string, SnapshotDimState> = {
  ftv: { status: "complete", score: 82, priority: "low", insights: ["Repeat founder with a prior exit; sector-domain CTO and a commercial co-founder cover the core roles.", "Advisory board of two operators; vesting agreed on a 4-year / 1-year-cliff schedule."], marketBenchmark: "AU seed founders: 2 co-founders median, 38 % with a prior exit." },
  mpc: { status: "complete", score: 74, priority: "medium", insights: ["AU SME SaaS category with a top-3 share in its niche; bottom-up SAM cross-checked against ABS industry revenue.", "Three named competitors mapped on price × differentiation; the wedge is compliance automation."] },
  ptd: { status: "complete", score: 78, priority: "low", insights: ["Multi-tenant platform with CI, tests and weekly releases; two patents pending.", "Core Web Vitals pass on mobile; security headers present."] },
  tre: { status: "complete", score: 71, priority: "medium", insights: ["A$1.2M ARR growing 4.5 % MoM; 120 paying SMEs, churn 2.1 %.", "NRR 104 % on the last four cohorts; top customer is 9 % of revenue."] },
  cgh: { status: "complete", score: 68, priority: "medium", insights: ["Clean cap table after one seed round; founders hold 71 %, ESOP pool 10 %.", "Shareholders agreement in place; dilution for the next round not yet modelled."] },
  iri: { status: "complete", score: 76, priority: "low", insights: ["Data room 78 % complete across the eight standard folders; deck and one-pager current.", "ESIC self-assessment done; s708 letters drafted."] },
  lco: { status: "complete", score: 81, priority: "low", insights: ["ACN registered, IP assigned, privacy policy live; R&D Tax Incentive claimed.", "Essential Eight ML1 reached; trademark registered in class 42."] },
  svm: { status: "complete", score: 65, priority: "medium", insights: ["Category moat forming through proprietary compliance data; switching cost mid.", "Exit path plausible via strategic acquirers in AU accounting software."] },
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
  { key: "revenue", title: "Revenue & Unit Economics", primary_dimension: "tre", weight: 8, score: 70, verdict: "A$1.2M ARR, gross margin 74 %, LTV/CAC 3.4×, payback 11 months.", strengths: ["Rule of 40 = 52", "Burn multiple 1.4"], gaps: ["Expansion revenue only 6 % of NRR"], next_action: "Introduce a usage-based add-on to lift expansion revenue." },
];

export const DEMO_GENERATED_AT = "2026-09-15T00:00:00.000Z";

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
