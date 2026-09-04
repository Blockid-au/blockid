import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeScore, type ScoreInput } from "@/lib/score";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendScoreReady } from "@/lib/email";
import {
  buildVcValuationReport,
  type BuildVcValuationInput,
} from "@/lib/agents/cfo-valuation";

// ── Wave 29: 8-Dimension SVI Analysis ───────────────────────────────────────

export interface SviDimAnalysis {
  dim: string;
  label: string;
  score: number; // 0–100
  status: "strong" | "developing" | "gap"; // green / amber / red
  commentary: string; // 3-sentence deterministic assessment
  weight: number; // SVI weight %
}

export interface SviFullAnalysis {
  dims: SviDimAnalysis[];
  executiveSummary: string;
  topThreePriorities: string[];
}

/** Derive 8 SVI dimension scores deterministically from the 5 sub-scores + inputs.
 *  These are informed estimates — not the AI-powered SVI stream scores — but give
 *  founders a meaningful breakdown without requiring login or an AI call.
 */
function computeSviDimAnalysis(
  inputs: ScoreInput,
  subScores: Record<string, number>,
  total: number,
): SviFullAnalysis {
  const fin = subScores.financials ?? 50;
  const cap = subScores.capTable ?? 50;
  const gov = subScores.governance ?? 50;
  const fnd = subScores.founder ?? 50;
  const doc = subScores.documentation ?? 50;

  const mrr = inputs.monthlyRevenue ?? 0;
  const runway = inputs.runwayMonths ?? 0;
  const stage = inputs.stage ?? "seed";
  const sector = inputs.sector;

  // FTV — Founder & Team Value (derives from founder background + governance)
  const ftvRaw = Math.round((fnd * 0.65 + gov * 0.35));
  const ftv = Math.min(100, Math.max(0, ftvRaw));

  // MPC — Market & Problem Clarity (sector heat + stage signals)
  const sectorHeat: Record<string, number> = { saas: 72, fintech: 68, devtools: 66, marketplace: 60, other: 55 };
  const stageBoostMpc = stage === "series-a" || stage === "growth" ? 8 : stage === "seed" ? 4 : 0;
  const mpc = Math.min(100, Math.max(0, Math.round((sectorHeat[sector] ?? 60) + stageBoostMpc - (mrr === 0 ? 8 : 0))));

  // PTD — Product & Tech Depth (doc + sector dev-signals)
  const ptdBase = doc * 0.5 + (sector === "devtools" || sector === "saas" ? 20 : 10);
  const ptd = Math.min(100, Math.max(0, Math.round(ptdBase + (inputs.yearsTrading > 2 ? 8 : 0))));

  // TRE — Traction & Revenue (financials-heavy)
  const treBase = fin * 0.8 + (mrr > 50000 ? 15 : mrr > 10000 ? 8 : mrr > 0 ? 4 : 0);
  const tre = Math.min(100, Math.max(0, Math.round(treBase)));

  // CGH — Cap Table & Governance Health
  const cgh = Math.min(100, Math.max(0, Math.round((cap * 0.6 + gov * 0.4))));

  // IRI — Investor Readiness Index (doc + funding readiness signals)
  const iriBase = doc * 0.4 + cap * 0.3 + gov * 0.3;
  const iriBoost = inputs.hasShareholdersAgreement ? 5 : 0;
  const iri = Math.min(100, Math.max(0, Math.round(iriBase + iriBoost)));

  // LCO — Legal & Compliance (SHA + audit + ESOP + years)
  const lcoBase = (inputs.hasShareholdersAgreement ? 30 : 5)
    + (inputs.hasFinancialAudit ? 35 : 8)
    + (inputs.esopAllocated > 0 ? 20 : 5)
    + Math.min(10, inputs.yearsTrading * 2);
  const lco = Math.min(100, Math.max(0, Math.round(lcoBase)));

  // SVM — Strategic Vision & Moat (stage + sector premium + runway confidence)
  const svmBase = (stage === "series-a" || stage === "growth" ? 70 : stage === "seed" ? 60 : 48)
    + (runway >= 18 ? 10 : runway >= 12 ? 5 : 0)
    + (sector === "saas" || sector === "fintech" ? 5 : 0);
  const svm = Math.min(100, Math.max(0, Math.round(svmBase)));

  const scoreOf = (s: number): "strong" | "developing" | "gap" =>
    s >= 70 ? "strong" : s >= 45 ? "developing" : "gap";

  const dims: SviDimAnalysis[] = [
    {
      dim: "ftv", label: "Founder & Team Value", score: ftv, weight: 15, status: scoreOf(ftv),
      commentary: buildDimCommentary("ftv", ftv, inputs),
    },
    {
      dim: "mpc", label: "Market & Problem Clarity", score: mpc, weight: 18, status: scoreOf(mpc),
      commentary: buildDimCommentary("mpc", mpc, inputs),
    },
    {
      dim: "ptd", label: "Product & Tech Depth", score: ptd, weight: 12, status: scoreOf(ptd),
      commentary: buildDimCommentary("ptd", ptd, inputs),
    },
    {
      dim: "tre", label: "Traction & Revenue", score: tre, weight: 20, status: scoreOf(tre),
      commentary: buildDimCommentary("tre", tre, inputs),
    },
    {
      dim: "cgh", label: "Cap Table & Governance", score: cgh, weight: 12, status: scoreOf(cgh),
      commentary: buildDimCommentary("cgh", cgh, inputs),
    },
    {
      dim: "iri", label: "Investor Readiness", score: iri, weight: 10, status: scoreOf(iri),
      commentary: buildDimCommentary("iri", iri, inputs),
    },
    {
      dim: "lco", label: "Legal & Compliance", score: lco, weight: 8, status: scoreOf(lco),
      commentary: buildDimCommentary("lco", lco, inputs),
    },
    {
      dim: "svm", label: "Strategic Vision & Moat", score: svm, weight: 5, status: scoreOf(svm),
      commentary: buildDimCommentary("svm", svm, inputs),
    },
  ];

  const gaps = dims.filter((d) => d.status === "gap").sort((a, b) => a.score - b.score);
  const developing = dims.filter((d) => d.status === "developing").sort((a, b) => a.score - b.score);
  const weakest = [...gaps, ...developing].slice(0, 3);

  const topThreePriorities = weakest.map((d) => {
    const prefix = d.status === "gap" ? "Urgently strengthen" : "Improve";
    return `${prefix} ${d.label} (currently ${d.score}/100) — ${getPriorityAction(d.dim, inputs)}`;
  });

  const executiveSummary = buildExecutiveSummary(total, dims, inputs);

  return { dims, executiveSummary, topThreePriorities };
}

function buildDimCommentary(dim: string, score: number, inputs: ScoreInput): string {
  const mrr = inputs.monthlyRevenue ?? 0;
  const runway = inputs.runwayMonths ?? 0;
  const stage = inputs.stage ?? "seed";
  const commentaries: Record<string, () => string> = {
    ftv: () => {
      const strength = inputs.founders > 1 ? "The co-founder structure reduces key-person risk and brings complementary skills." : "A solo-founder structure concentrates execution risk and may concern investors seeking team resilience.";
      const sectorCtx = `Operating in ${inputs.sector.toUpperCase()} adds sector credibility to the team narrative.`;
      const improvement = score < 65 ? "Bringing on an experienced advisor or co-founder in a key gap area would meaningfully lift this dimension." : "Documenting founder track records and domain wins further solidifies this strength.";
      return `${strength} ${sectorCtx} ${improvement}`;
    },
    mpc: () => {
      const marketCtx = `The ${inputs.sector.toUpperCase()} sector carries ${score >= 70 ? "strong" : score >= 50 ? "moderate" : "limited"} market clarity signals for investors at the ${stage} stage.`;
      const revenueCtx = mrr > 0 ? `Existing revenue of A$${Math.round(mrr).toLocaleString()}/month validates some market demand.` : "Pre-revenue status means the market thesis relies on qualitative evidence rather than commercial validation.";
      const action = score < 65 ? "Conducting and publishing 10+ customer discovery interviews would materially strengthen market evidence." : "Quantifying the total addressable market with bottom-up analysis will sharpen the investor pitch.";
      return `${marketCtx} ${revenueCtx} ${action}`;
    },
    ptd: () => {
      const yearsCtx = inputs.yearsTrading > 2 ? `With ${inputs.yearsTrading} years of product development, there is meaningful iteration data to reference.` : "Early-stage products have less iteration history, making customer validation evidence especially important.";
      const docCtx = inputs.hasFinancialAudit ? "A financial audit suggests structured operational discipline that typically extends to the product build." : "Unaudited operations suggest the product may benefit from more rigorous engineering documentation.";
      const action = score < 60 ? "Publishing a public roadmap and shipping a case study with measurable outcomes would lift product credibility." : "Maintaining a technical documentation standard and tracking product NPS will sustain this dimension.";
      return `${yearsCtx} ${docCtx} ${action}`;
    },
    tre: () => {
      const revCtx = mrr > 100000 ? `Monthly revenue of A$${Math.round(mrr / 1000)}k demonstrates strong commercial traction.` : mrr > 20000 ? `Monthly revenue of A$${Math.round(mrr / 1000)}k shows early commercial validation but needs scaling.` : mrr > 0 ? `Revenue of A$${Math.round(mrr).toLocaleString()}/month is early-stage; investors will want to see a clear growth trajectory.` : "Pre-revenue status is the largest drag on this dimension — even A$1k MRR changes the narrative significantly.";
      const runwayCtx = runway >= 18 ? `${runway} months runway gives the team strong negotiating leverage.` : runway >= 12 ? `${runway} months runway is adequate but tight for a fundraise process.` : `${runway} months runway creates urgency that may pressure valuation conversations.`;
      const action = score < 60 ? "Prioritise closing 1–3 paying customers and publishing their outcomes as proof points." : "Building a revenue dashboard accessible to investors during due diligence will accelerate closing.";
      return `${revCtx} ${runwayCtx} ${action}`;
    },
    cgh: () => {
      const esopCtx = inputs.esopAllocated >= 8 && inputs.esopAllocated <= 15 ? `An ESOP pool of ${inputs.esopAllocated}% sits in the ideal 8–15% range that investors expect.` : inputs.esopAllocated > 15 ? `An ESOP pool of ${inputs.esopAllocated}% is above the typical 8–15% range — investors may scrutinise dilution.` : inputs.esopAllocated > 0 ? `An ESOP pool of ${inputs.esopAllocated}% exists but is below the investor-expected 8% minimum.` : "No ESOP pool is a red flag for AU investors and limits the ability to attract key hires.";
      const shaCtx = inputs.hasShareholdersAgreement ? "A shareholders agreement is in place, which is a prerequisite for any institutional round." : "The absence of a shareholders agreement is a blocking issue for most institutional investors.";
      const action = score < 65 ? "Formalise a shareholders agreement and top-up the ESOP pool to 10% before your next investor conversation." : "Ensuring vesting schedules are documented and board consent thresholds are clearly defined will complete this dimension.";
      return `${esopCtx} ${shaCtx} ${action}`;
    },
    iri: () => {
      const readyCtx = score >= 70 ? "The overall investor-readiness posture is strong — documentation and governance signals align with institutional expectations." : score >= 50 ? "The investor-readiness posture is developing — several key signals are present but gaps remain before a serious institutional conversation." : "Significant preparation is required before approaching institutional investors — the current posture would likely result in a due-diligence pass.";
      const docCtx = inputs.hasShareholdersAgreement && inputs.hasFinancialAudit ? "Both a shareholders agreement and audited financials are in place, covering the two most common DD blockers." : "Missing either a shareholders agreement or audited financials creates friction in any due-diligence process.";
      const action = "Building a curated data room with financials, cap table, product demo, and customer evidence is the highest-leverage next step.";
      return `${readyCtx} ${docCtx} ${action}`;
    },
    lco: () => {
      const auditCtx = inputs.hasFinancialAudit ? "Audited financials establish the financial rigour that AU investors and ASIC compliance require." : "Unaudited financials limit investor confidence and may create complications with ASIC obligations as the company scales.";
      const esicCtx = inputs.hasShareholdersAgreement && inputs.esopAllocated > 0 ? "The combination of SHA and ESOP plan positions the company well for ESIC eligibility, unlocking angel tax incentives." : "ESIC eligibility is worth pursuing — it can meaningfully increase angel investor appetite at the pre-seed and seed stages.";
      const action = score < 60 ? "Completing the ESIC self-assessment and filing the working papers is a high-leverage 30-day compliance action." : "Maintaining an updated compliance register and assigning a director-level compliance owner will sustain this dimension.";
      return `${auditCtx} ${esicCtx} ${action}`;
    },
    svm: () => {
      const stageCtx = stage === "series-a" || stage === "growth" ? "At Series A and beyond, investors expect a clearly articulated strategic moat — competitive advantage that compounds." : stage === "seed" ? "At seed stage, strategic vision is about demonstrating an opinionated view of where the market is heading and why this team is best-placed." : "Early-stage strategic vision is primarily about founder conviction and a defensible wedge into a large market.";
      const runwayCtx = runway >= 18 ? `${runway} months runway allows the team to execute against a multi-year strategic plan without distraction.` : "Extending runway is a strategic priority — investors discount vision when burn concerns dominate the conversation.";
      const action = score < 60 ? "Articulating a 3-year strategic narrative with specific market-timing arguments will sharpen investor confidence in the vision." : "Documenting the moat mechanics (network effects, data advantages, switching costs, regulatory barriers) adds depth to the strategic case.";
      return `${stageCtx} ${runwayCtx} ${action}`;
    },
  };
  return commentaries[dim]?.() ?? `Score of ${score}/100 indicates ${score >= 70 ? "strong performance" : score >= 45 ? "development opportunity" : "a key gap"} in this dimension.`;
}

function getPriorityAction(dim: string, inputs: ScoreInput): string {
  const actions: Record<string, string> = {
    ftv: inputs.founders <= 1 ? "consider adding a co-founder or experienced advisor with complementary skills" : "document founder track records and domain expertise for the data room",
    mpc: inputs.monthlyRevenue === 0 ? "run 10+ customer discovery interviews and publish a market-sizing analysis" : "quantify the total addressable market with a bottom-up model",
    ptd: "publish a public product roadmap and ship at least one quantified customer case study",
    tre: inputs.monthlyRevenue === 0 ? "close 1–3 paying customers to establish commercial validation" : "build a revenue dashboard and document month-on-month growth rate",
    cgh: !inputs.hasShareholdersAgreement ? "execute a shareholders agreement before any investor conversation" : "ensure ESOP pool is 8–15% with documented vesting schedules",
    iri: "build a curated data room covering financials, cap table, product demo, and 3 customer proof points",
    lco: !inputs.hasShareholdersAgreement ? "formalise the SHA and complete the ESIC self-assessment" : "complete a financial audit or review to satisfy AU investor DD requirements",
    svm: "write a 3-year strategic narrative that explains the moat mechanics and market timing",
  };
  return actions[dim] ?? "review and document key metrics for investor due diligence";
}

function buildExecutiveSummary(total: number, dims: SviDimAnalysis[], inputs: ScoreInput): string {
  const band = total >= 80 ? "strong" : total >= 65 ? "solid" : total >= 50 ? "developing" : total >= 35 ? "early-stage" : "nascent";
  const strongDims = dims.filter((d) => d.status === "strong").map((d) => d.label);
  const gapDims = dims.filter((d) => d.status === "gap").map((d) => d.label);
  const stage = inputs.stage ?? "seed";
  const sector = inputs.sector.toUpperCase();

  const sentence1 = `This ${stage} ${sector} startup presents a ${band} overall investment profile with a composite score of ${total}/100.`;
  const sentence2 = strongDims.length > 0
    ? `Key strengths are concentrated in ${strongDims.slice(0, 2).join(" and ")}, which provide a credible foundation for investor conversations.`
    : `No dimensions yet register as strong — the focus should be on establishing a few high-confidence proof points before approaching investors.`;
  const sentence3 = gapDims.length > 0
    ? `The most significant gaps are in ${gapDims.slice(0, 2).join(" and ")}, which carry the highest downside risk in a due-diligence process.`
    : `All dimensions are at developing or above — the priority is depth of evidence, not breadth of coverage.`;
  const sentence4 = `Addressing the priority actions below could meaningfully lift the score by the next funding conversation.`;

  return `${sentence1} ${sentence2} ${sentence3} ${sentence4}`;
}

// POST /api/score
// Body: { email, companyName?, inputs: ScoreInput }
// Behaviour:
//   - Always computes the deterministic score.
//   - Enriches with VC-scorecard valuation (via cfo-valuation) + funding
//     readiness gates + evidence gaps so the returned payload is
//     "investor-ready" not just a headline number.
//   - Persists to Supabase if configured.
//   - Fires the score-ready email (with score PDF attachment) fire-and-forget
//     for EVERY submission — even demo-mode (Supabase absent) — so founders
//     always get something in their inbox.
//   - Falls back to a `demo-XXXX` slug when Supabase is missing so the dev
//     UX (share link + PDF) still works locally.
//
// Returns: { slug, totalScore, subScores, valuation, fundingReadiness, evidenceGaps, ... }

interface FundingGate {
  pass: boolean;
  missing: string[];
}

interface FundingReadinessBlock {
  seed: FundingGate;
  seriesA: FundingGate;
}

function computeSimpleFundingReadiness(
  inputs: ScoreInput,
  subScoresMap: Record<string, number>,
): FundingReadinessBlock {
  const mrr = inputs.monthlyRevenue ?? 0;
  const runway = inputs.runwayMonths ?? 0;
  const arrBand = inputs.arrBand ?? "pre-revenue";
  const seedMissing: string[] = [];
  const seriesAMissing: string[] = [];

  // Seed gates
  if (mrr < 8000) seedMissing.push("Reach at least A$8k MRR");
  if (runway < 12) seedMissing.push("Extend runway to 12+ months");
  if (!inputs.hasShareholdersAgreement) seedMissing.push("Shareholders agreement signed");
  if ((subScoresMap.governance ?? 0) < 55) seedMissing.push("Lift governance score above 55");
  if ((subScoresMap.capTable ?? 0) < 55) seedMissing.push("Tidy cap-table hygiene (ESOP + SHA)");
  if (inputs.esopAllocated < 8) seedMissing.push("Allocate an 8-15% ESOP pool");

  // Series A gates
  if (mrr < 83000) seriesAMissing.push("Reach A$83k MRR (~A$1M ARR)");
  if (!["250k-1m", "1m-3m", "3m-plus"].includes(arrBand)) {
    seriesAMissing.push("Reach A$250k+ ARR band");
  }
  if (runway < 15) seriesAMissing.push("Runway of 15+ months for Series A pitch");
  if (!inputs.hasFinancialAudit) seriesAMissing.push("Complete a financial audit or review");
  if (!inputs.hasBoardMeetings) seriesAMissing.push("Establish regular board cadence");
  if ((subScoresMap.governance ?? 0) < 70) seriesAMissing.push("Governance score of 70+");
  if ((subScoresMap.financials ?? 0) < 65) seriesAMissing.push("Financials score of 65+");

  return {
    seed: { pass: seedMissing.length === 0, missing: seedMissing },
    seriesA: { pass: seriesAMissing.length === 0, missing: seriesAMissing },
  };
}

function computeValuation(inputs: ScoreInput): {
  lowAud: number;
  midAud: number;
  highAud: number;
  method: "vc_scorecard_blend";
} | null {
  try {
    const arg: BuildVcValuationInput = {
      sector: inputs.sector,
      stage: inputs.stage,
      mrrAud: inputs.monthlyRevenue,
      monthlyOpexAud: inputs.monthlyBurn,
      raiseAud: inputs.targetRaiseAud,
      hasShareholdersAgreement: inputs.hasShareholdersAgreement,
      hasFounderVesting: inputs.hasShareholdersAgreement,
      hasEsopPool: inputs.esopAllocated > 0,
      hasDataRoom: inputs.hasFinancialAudit,
    };
    const rep = buildVcValuationReport(arg);
    return {
      lowAud: rep.blended.lowAud,
      midAud: rep.blended.midAud,
      highAud: rep.blended.highAud,
      method: "vc_scorecard_blend",
    };
  } catch (err) {
    console.error("[blockid:score] valuation failed", err);
    return null;
  }
}

// Best-effort read of first-touch / last-touch attribution cookies dropped
// by <UtmCapture />. Returns null on parse failure so the pipeline never
// blocks a submit if the cookie is malformed. The scores table does NOT
// currently carry attribution columns (checked 2026-08-23 against
// migrations/0001_init.sql) — we return the payload to the client so
// score_form_submitted can include it in GA4 without a schema change.
interface AttributionSnapshot {
  ts?: string;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  landing_path?: string | null;
}

async function readAttributionCookies(): Promise<{
  firstTouch: AttributionSnapshot | null;
  lastTouch: AttributionSnapshot | null;
}> {
  try {
    const store = await cookies();
    const ft = store.get("bid_ft")?.value ?? null;
    const lt = store.get("bid_lt")?.value ?? null;
    const parse = (raw: string | null): AttributionSnapshot | null => {
      if (!raw) return null;
      try {
        return JSON.parse(decodeURIComponent(raw)) as AttributionSnapshot;
      } catch {
        try {
          return JSON.parse(raw) as AttributionSnapshot;
        } catch {
          return null;
        }
      }
    };
    return { firstTouch: parse(ft), lastTouch: parse(lt) };
  } catch {
    return { firstTouch: null, lastTouch: null };
  }
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = body as {
    email?: string;
    companyName?: string;
    inputs?: Partial<ScoreInput>;
  } | null;

  if (
    !parsed ||
    !parsed.email ||
    typeof parsed.email !== "string" ||
    !parsed.email.includes("@")
  ) {
    return NextResponse.json(
      { ok: false, error: "Valid email is required" },
      { status: 400 },
    );
  }
  if (!parsed.inputs || typeof parsed.inputs !== "object") {
    return NextResponse.json(
      { ok: false, error: "inputs object is required" },
      { status: 400 },
    );
  }

  // Validate required fields exist
  // companyName can come from top-level OR inputs — fallback to "My Startup"
  if (!parsed.inputs.companyName && parsed.companyName) {
    parsed.inputs.companyName = parsed.companyName;
  }
  if (!parsed.inputs.companyName) {
    parsed.inputs.companyName = "My Startup";
  }
  if (!parsed.inputs.sector) {
    return NextResponse.json(
      { ok: false, reason: "Sector is required" },
      { status: 400 },
    );
  }

  // Reject negative numbers for numeric fields
  const numericFields: (keyof ScoreInput)[] = [
    "monthlyRevenue",
    "monthlyBurn",
    "runwayMonths",
    "yearsTrading",
    "founders",
    "esopAllocated",
    "targetRaiseAud",
    "valuationCapAud",
  ];
  for (const field of numericFields) {
    const val = parsed.inputs[field];
    if (val !== undefined && typeof val === "number" && val < 0) {
      return NextResponse.json(
        { ok: false, reason: `${field} must not be negative` },
        { status: 400 },
      );
    }
  }

  const inputs = parsed.inputs as ScoreInput;
  const breakdown = computeScore(inputs);

  // Map sub-scores into a stable keyed shape for storage.
  const subScoresMap: Record<string, number> = {
    financials: 0,
    capTable: 0,
    governance: 0,
    founder: 0,
    documentation: 0,
  };
  const keyForLabel = (label: string): keyof typeof subScoresMap => {
    if (/^cap/i.test(label)) return "capTable";
    if (/^gov/i.test(label)) return "governance";
    if (/^founder/i.test(label)) return "founder";
    if (/^doc/i.test(label)) return "documentation";
    return "financials";
  };
  for (const s of breakdown.subs) {
    subScoresMap[keyForLabel(s.label)] = Math.round(s.value);
  }
  const benchmark = breakdown.benchmark;

  // ---- Enrichment: valuation + funding readiness + evidence gaps ----------
  const valuation = computeValuation(inputs);
  const fundingReadiness = computeSimpleFundingReadiness(inputs, subScoresMap);
  const evidenceGaps = breakdown.missingInputs.slice(0, 10);

  // Wave 29 — full 8-dim SVI analysis for the public score results page.
  const sviAnalysis = computeSviDimAnalysis(inputs, subScoresMap, breakdown.total);

  // Attribution (best-effort, never blocks). See readAttributionCookies()
  // for the schema-check note — scores table has no attribution columns
  // today, so we echo the payload back to the client for GA4 emission
  // instead of a silent DB insert.
  const { firstTouch, lastTouch } = await readAttributionCookies();

  const supabase = getSupabaseAdmin();
  let slug = newSlug();
  let persisted = false;

  if (!supabase) {
    slug = `demo-${slug.slice(0, 6)}`;
    console.warn(
      "[blockid:score] Supabase not configured — returning demo slug",
      { slug, email: parsed.email },
    );
  } else {
    const { error } = await supabase.from("scores").insert({
      id: slug,
      email: parsed.email,
      company_name: parsed.companyName ?? inputs.companyName ?? null,
      total_score: breakdown.total,
      sub_scores: subScoresMap,
      inputs,
      score_version: breakdown.version,
      confidence_score: breakdown.confidence,
      missing_inputs: breakdown.missingInputs,
      action_plan: breakdown.actionPlan,
      benchmark,
    });
    if (error) {
      console.error("[blockid:score] Supabase insert failed", error);
      // Degrade: return a demo slug so the UI still has somewhere to land.
      slug = `demo-${slug.slice(0, 6)}`;
    } else {
      persisted = true;
    }
  }

  // Fire-and-forget email — always attempt, even in demo mode.
  void sendScoreReady({
    to: parsed.email,
    slug,
    totalScore: breakdown.total,
    companyName: parsed.companyName ?? inputs.companyName ?? null,
    subScores: subScoresMap,
    actionPlan: breakdown.actionPlan,
    valuation,
    fundingReadiness,
    evidenceGaps,
    benchmark,
    breakdown,
  }).catch((err) => {
    console.error("[blockid:score] sendScoreReady failed", err);
  });

  return NextResponse.json({
    ok: true,
    slug,
    totalScore: breakdown.total,
    subScores: subScoresMap,
    scoreVersion: breakdown.version,
    confidenceScore: breakdown.confidence,
    missingInputs: breakdown.missingInputs,
    actionPlan: breakdown.actionPlan,
    benchmark,
    breakdown,
    valuation,
    fundingReadiness,
    evidenceGaps,
    sviAnalysis,
    persisted: persisted && isSupabaseConfigured() && !slug.startsWith("demo-"),
    attribution: {
      firstTouch,
      lastTouch,
    },
  });
}

export const dynamic = "force-dynamic";
