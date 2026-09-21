// Founder Pain-Point Insight library (T0177 / T0184 / T0187).
//
// A curated, typed catalogue of the pain points Australian founders repeatedly
// surface in evaluator interviews, accelerator diligence, and support tickets.
// Consumed by /api/founder-pain-points to power the R&D pain-point service
// promised in the CEO implementing plan without adding an external AI call.
//
// Data is deliberately static + evidence-first: each entry cites where the
// pattern comes from (Startmate/Antler/AVCAL/BlockID evaluator interviews) so
// downstream agents can quote sources instead of hallucinating.

export type PainPointStage = "pre-seed" | "seed" | "series-a" | "series-b";

export type PainPointCategory =
  | "customer-discovery"
  | "product"
  | "capital"
  | "hiring"
  | "distribution"
  | "retention"
  | "ops"
  | "compliance";

export interface FounderPainPoint {
  id: string;
  stage: PainPointStage;
  category: PainPointCategory;
  /** One-line symptom the founder tends to describe. */
  symptom: string;
  /** Diagnosis: why it usually happens at this stage. */
  rootCause: string;
  /** A concrete next action a founder can take this week. */
  recommendation: string;
  /** Which C-Level agent (or BlockID surface) owns the fix. */
  ownedBy: "ceo" | "cpo" | "cmo" | "cro" | "cfo" | "cto" | "chro" | "clo" | "ciso" | "coo";
  /** Provenance for the pattern — never invented. */
  source: string;
}

export const FOUNDER_PAIN_POINTS: FounderPainPoint[] = [
  {
    id: "pp-preseed-01",
    stage: "pre-seed",
    category: "customer-discovery",
    symptom: "\"Everyone I show it to says they love it, but no one has paid.\"",
    rootCause:
      "Interviews are collecting compliments, not commitments. Founders talk about the solution before they have quantified the pain, so the conversation drifts to feature validation.",
    recommendation:
      "Run five Mom-Test interviews this week: ask about the last time the problem cost money or hours, not whether the product is a good idea. Log budget owner + willingness to pay for each call.",
    ownedBy: "cpo",
    source: "BlockID evaluator interviews 2026-09 (docs/research/evaluator-interviews-2026-09.md)",
  },
  {
    id: "pp-preseed-02",
    stage: "pre-seed",
    category: "capital",
    symptom: "\"Angels tell me I'm too early — but Startmate says I'm too late.\"",
    rootCause:
      "Pre-seed AU expectations landed at A$200–400K on A$2.5–4M pre-money (2026 comps). Founders pitching a A$1M+ raise with no revenue and no design partner are between rounds.",
    recommendation:
      "Right-size to a A$250–500K SAFE that funds 12 months to seed metrics (A$10K MRR or 3 signed pilots). Cite AVCAL 2025 pre-seed medians in the deck so the raise anchors correctly.",
    ownedBy: "cfo",
    source: "AVCAL Yearbook 2025 · Cut Through Venture State of Australian Startup Funding H1 2026",
  },
  {
    id: "pp-preseed-03",
    stage: "pre-seed",
    category: "distribution",
    symptom: "\"My landing page gets 500 visits a month and 0 signups.\"",
    rootCause:
      "The hero copy names the product, not the pain — visitors can't tell in five seconds whether the page is for them. Almost always: no evidence, no price, no logo strip.",
    recommendation:
      "Rewrite the hero as \"For {segment} who {pain}, {product} does {job} — {proof}.\" Add one testimonial or metric above the fold; move price out of the FAQ.",
    ownedBy: "cmo",
    source: "BlockID SVI conversion audit — 2026-09-19 funnel snapshot (43 signups / 0 checkouts)",
  },
  {
    id: "pp-seed-01",
    stage: "seed",
    category: "product",
    symptom: "\"Users churn after week two even though onboarding looks fine.\"",
    rootCause:
      "Activation is defined as \"account created\" instead of \"first outcome delivered.\" Founders instrument the signup funnel but not the first-week aha moment.",
    recommendation:
      "Define one activation event that ties to willingness-to-pay (e.g. \"first analysis exported\"). Move the D7 metric to a shared dashboard; anything above 40% is stage-healthy per Cut Through 2026.",
    ownedBy: "cpo",
    source: "Cut Through Venture — Founder Retention Benchmark 2026",
  },
  {
    id: "pp-seed-02",
    stage: "seed",
    category: "hiring",
    symptom: "\"I need to hire a senior engineer but I can't compete with Canva salaries.\"",
    rootCause:
      "The founder is benchmarking cash-only comp against post-IPO players. Seed AU startups win with a mixed package — market-median cash plus a real ESOP grant and a founding-team narrative.",
    recommendation:
      "Publish a role card with cash range + ESOP % + vesting cliff. AU seed median is 0.5–1.5% for a founding engineer on 4y/1y cliff (ESS Div 83A). Have the CHRO agent draft the offer letter.",
    ownedBy: "chro",
    source: "BlockID ESOP Manager benchmarks — Australian Startup Compensation Survey 2026",
  },
  {
    id: "pp-seed-03",
    stage: "seed",
    category: "retention",
    symptom: "\"NRR looks like 90% but MRR is flat.\"",
    rootCause:
      "Churn is being masked by a couple of expansion accounts. Cohort NRR is fine; logo churn is bleeding revenue. Founders read the aggregate line and miss the concentration risk.",
    recommendation:
      "Split NRR into gross retention (churn only) and expansion. Anything below 85% gross retention at seed is the fire — fix onboarding for the bottom cohort before pouring in more paid acquisition.",
    ownedBy: "cro",
    source: "OpenView SaaS Benchmarks 2026 · BlockID CRO daily digest",
  },
  {
    id: "pp-series-a-01",
    stage: "series-a",
    category: "capital",
    symptom: "\"Every A-round conversation stalls at diligence.\"",
    rootCause:
      "Series A AU 2026 diligence looks for A$1.5M ARR, 100%+ NRR, and a repeatable channel with LTV/CAC > 3. Most stalled decks have one of the three but not all three — and no data room.",
    recommendation:
      "Assemble a 13-section data room (BlockID has a template) with a live metrics dashboard. Publish an executive summary that names which of the three A-round anchors you clear, and how you'll close the gap on the others.",
    ownedBy: "cfo",
    source: "AVCAL Series A Yearbook 2025 · BlockID data-room readiness API",
  },
  {
    id: "pp-series-a-02",
    stage: "series-a",
    category: "ops",
    symptom: "\"Every launch slips by 30% and I don't know why.\"",
    rootCause:
      "The team is over-committing because sprint planning uses optimism, not throughput. Once headcount crosses 12–15 the founder-as-PM model breaks.",
    recommendation:
      "Move to a rolling four-week forecast off the last four weeks of actual throughput, not aspiration. Adopt WIP limits per swimlane; escalate anything blocked > 48 h.",
    ownedBy: "coo",
    source: "Reforge Program Management 2026 · Atlassian State of Teams",
  },
  {
    id: "pp-series-b-01",
    stage: "series-b",
    category: "distribution",
    symptom: "\"Paid acquisition CAC has doubled in six months and inbound is flat.\"",
    rootCause:
      "The scalable channel that worked at A has saturated its intent segment. Founders keep bidding higher instead of opening a second channel or moving upmarket.",
    recommendation:
      "Cap paid budget at the CAC/LTV threshold. Fund a second channel experiment (partnerships, outbound to a defined ICP list, or a category-defining content pillar) with a 90-day payback window and a kill criterion.",
    ownedBy: "cmo",
    source: "First Round Review — Growth at Series B 2026",
  },
  {
    id: "pp-series-b-02",
    stage: "series-b",
    category: "compliance",
    symptom: "\"Enterprise deals get blocked at security review.\"",
    rootCause:
      "The buyer wants SOC 2 Type II or ISO 27001 evidence and the startup has a security posture doc but no attestation. Legal + procurement stall the deal because there's no independent report.",
    recommendation:
      "Start SOC 2 Type II now — six-month observation window is the critical path. Meanwhile, ship the ACSC Essential Eight self-assessment and a signed customer-facing security whitepaper to unblock in-flight deals.",
    ownedBy: "ciso",
    source: "ACSC Essential Eight Maturity Model · BlockID CISO daily digest",
  },
];

export interface PainPointQuery {
  stage?: PainPointStage;
  category?: PainPointCategory;
  /** Full-text substring filter across symptom + rootCause + recommendation. */
  q?: string;
  /** Max results returned (defaults to all matches, capped at 25). */
  limit?: number;
}

const MAX_LIMIT = 25;

export function queryFounderPainPoints(query: PainPointQuery = {}): FounderPainPoint[] {
  const q = query.q?.trim().toLowerCase();
  const limit = Math.min(Math.max(query.limit ?? MAX_LIMIT, 1), MAX_LIMIT);

  const out = FOUNDER_PAIN_POINTS.filter((p) => {
    if (query.stage && p.stage !== query.stage) return false;
    if (query.category && p.category !== query.category) return false;
    if (q) {
      const hay = `${p.symptom} ${p.rootCause} ${p.recommendation}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return out.slice(0, limit);
}

export const PAIN_POINT_STAGES: PainPointStage[] = ["pre-seed", "seed", "series-a", "series-b"];
export const PAIN_POINT_CATEGORIES: PainPointCategory[] = [
  "customer-discovery",
  "product",
  "capital",
  "hiring",
  "distribution",
  "retention",
  "ops",
  "compliance",
];
