// Startup Value Index (SVI) — Score Computation Engine v2.0
//
// Pure deterministic computation. No AI calls.
// Base starts at 100 and adjusts up/down based on evidence signals.
// 0+ open-ended index — like a stock market index, grows without limit.
// NOT a legal valuation. An indicator of startup progress and evidence quality.

import {
  SVI_VERSION,
  SVI_STAGE_LABELS,
  STAGE_BONUSES,
  SVI_BENCHMARKS,
  EVIDENCE_CONFIDENCE,
  type SVIExtractedSignals,
  type SVISubScore,
  type RiskPenalty,
  type SVIEvidenceGap,
  type SVIAnalysis,
  type StartupMetricsInput,
} from "./types.js";
import { getSVIConfig } from "./svi-config.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (v: number, min = 0, max = Infinity) => Math.max(min, Math.min(max, v));

function calcPercentileRank(svi: number, stage: number): number {
  const band = SVI_BENCHMARKS[stage];
  if (!band) return 50;
  if (svi >= band.p90) return 90;
  if (svi >= band.p75) return 75;
  if (svi >= band.p50) return 50;
  if (svi >= band.p25) return 25;
  return 10;
}

// ─── Metrics bonus: 0-N pts from real startup_metrics data ───────────────────
export function computeMetricsBonus(metrics: StartupMetricsInput): number {
  const cfg = getSVIConfig().metrics;
  let bonus = 0;

  const mrr = metrics.mrr ?? 0;
  if (mrr > cfg.mrr_high) bonus += 15;
  else if (mrr > cfg.mrr_mid) bonus += 10;
  else if (mrr > cfg.mrr_low) bonus += 5;

  const users = metrics.users_total ?? 0;
  if (users > cfg.users_high) bonus += 15;
  else if (users > cfg.users_mid) bonus += 10;
  else if (users > cfg.users_low) bonus += 5;

  const churn = metrics.churn_rate;
  if (churn !== undefined && churn !== null) {
    if (churn < cfg.churn_good) bonus += 10;
    else if (churn < cfg.churn_ok) bonus += 5;
  }

  const nps = metrics.nps ?? 0;
  if (nps > cfg.nps_good) bonus += 10;
  else if (nps > cfg.nps_ok) bonus += 5;

  return Math.min(bonus, cfg.metrics_bonus_cap);
}

// ─── Stage detection ──────────────────────────────────────────────────────────
export function detectStage(signals: SVIExtractedSignals): number {
  // Stage 7: Corporation (audit + ASIC + board)
  if (signals.hasFinancialAudit && signals.hasABN && signals.hasBoardCadence) {
    return 7;
  }
  // Stage 6: Scale ($1M+ ARR + cap table + data room)
  if (signals.revenueBand === "scaling" && signals.hasCapTable && signals.hasDataRoom) {
    return 6;
  }
  // Stage 5: Growth ($100k+ ARR + team signals)
  if (
    (signals.revenueBand === "growing" || signals.revenueBand === "scaling") &&
    (signals.hasCoFounder || signals.founderExperience !== "first-time")
  ) {
    return 5;
  }
  // Stage 4: Revenue (early band)
  if (signals.revenueBand === "early" || signals.hasRevenue) {
    return 4;
  }
  // Stage 3: Early Traction (customers / analytics / social)
  if (signals.hasCustomers || signals.hasAnalytics || signals.hasSocialProof) {
    return 3;
  }
  // Stage 2: MVP / Prototype (has product / demo / website / source code)
  if (signals.hasProduct || signals.hasDemo || signals.hasWebsite || signals.hasSourceCode) {
    return 2;
  }
  // Stage 1: Validated Idea (validated problem / market research)
  if (signals.problemClarity === "validated" || signals.problemClarity === "clear") {
    return 1;
  }
  // Stage 0: Concept
  return 0;
}

// ─── SVI v2 computation ───────────────────────────────────────────────────────
export function computeSVI(
  signals: SVIExtractedSignals,
  weeklyDelta?: number,
  metricsBonus?: number,
): SVIAnalysis {
  const cfg = getSVIConfig();
  const w = cfg.weights;
  const b = cfg.bases;
  const p = cfg.penalties;
  const ei = cfg.evidence_impacts;

  const confidence = EVIDENCE_CONFIDENCE[signals.evidenceLevel] ?? 0.20;

  // ── Dimension 1: FTV — Founder & Team Value ────────────────────────────────
  let ftvRaw = b.ftv_base;
  const ftvEvidence: string[] = [];
  const ftvGaps: string[] = [];

  if (signals.founderExperience === "serial") {
    ftvRaw += 35; ftvEvidence.push("Serial founder with exits");
  } else if (signals.founderExperience === "experienced") {
    ftvRaw += 20; ftvEvidence.push("Experienced founder (10+ years)");
  } else {
    ftvGaps.push("Add founder background and track record");
  }
  if (signals.hasCoFounder) { ftvRaw += 15; ftvEvidence.push("Co-founder team"); }
  else { ftvGaps.push("Consider adding a co-founder for complementary skills"); }

  if (signals.founderSectorFit) { ftvRaw += 10; ftvEvidence.push("Domain expertise in target sector"); }
  else { ftvGaps.push("Highlight relevant domain experience"); }

  if (signals.hasAdvisors) { ftvRaw += 8; ftvEvidence.push("Named advisors or mentors identified"); }
  else { ftvGaps.push("Add named advisors or industry mentors to strengthen credibility"); }

  const ftvScore = clamp(ftvRaw, 0, 100);
  const ftvAdj = Math.round((ftvScore - 50) * w.ftv * confidence);

  // ── Dimension 2: MPC — Market & Problem Clarity ────────────────────────────
  let mpcRaw = b.mpc_base;
  const mpcEvidence: string[] = [];
  const mpcGaps: string[] = [];

  if (signals.problemClarity === "validated") {
    mpcRaw += 25; mpcEvidence.push("Validated problem with customer proof");
  } else if (signals.problemClarity === "clear") {
    mpcRaw += 10; mpcEvidence.push("Clear problem statement");
    mpcGaps.push("Add customer validation proof (interviews, LOIs, surveys)");
  } else {
    mpcGaps.push("Clarify the problem being solved");
  }

  if (signals.marketSize === "large") {
    mpcRaw += 20; mpcEvidence.push("Large addressable market (billion+)");
  } else if (signals.marketSize === "medium") {
    mpcRaw += 12; mpcEvidence.push("Medium addressable market (hundreds of millions)");
  } else if (signals.marketSize === "small") {
    mpcRaw += 5; mpcEvidence.push("Small / niche addressable market");
  } else {
    mpcGaps.push("Define total addressable market size (TAM/SAM/SOM)");
  }

  if (signals.hasCustomerInterviews) { mpcRaw += 8; mpcEvidence.push("Customer interviews documented"); }
  else { mpcGaps.push("Document at least 5 customer discovery interviews"); }

  const mpcScore = clamp(mpcRaw, 0, 100);
  const mpcAdj = Math.round((mpcScore - 50) * w.mpc * confidence);

  // ── Dimension 3: PTD — Product & Technical Depth ──────────────────────────
  let ptdRaw = b.ptd_base;
  const ptdEvidence: string[] = [];
  const ptdGaps: string[] = [];

  if (signals.hasDemo) { ptdRaw += 20; ptdEvidence.push("Demo or prototype available"); }
  else { ptdGaps.push("Create a live demo or prototype"); }

  if (signals.hasSourceCode) { ptdRaw += 15; ptdEvidence.push("Source code repository linked"); }
  else { ptdGaps.push("Link GitHub/GitLab repository"); }

  if (signals.hasApp) { ptdRaw += 10; ptdEvidence.push("Mobile app present"); }

  if (signals.hasWebsite) { ptdRaw += 5; ptdEvidence.push("Website or landing page present"); }
  else { ptdGaps.push("Create a public website or landing page"); }

  if (signals.hasProduct) { ptdRaw += 10; ptdEvidence.push("Product described or referenced"); }

  const ptdScore = clamp(ptdRaw, 0, 100);
  const ptdAdj = Math.round((ptdScore - 50) * w.ptd * confidence);

  // ── Dimension 4: TRE — Traction & Revenue Evidence ────────────────────────
  let treRaw = b.tre_base;
  const treEvidence: string[] = [];
  const treGaps: string[] = [];

  if (signals.revenueBand === "scaling") {
    treRaw = 90; treEvidence.push("Scaling revenue ($1M+ ARR range)");
  } else if (signals.revenueBand === "growing") {
    treRaw = 70; treEvidence.push("Growing revenue ($100k-$500k ARR range)");
  } else if (signals.revenueBand === "early") {
    treRaw = 50; treEvidence.push("Early revenue traction");
    treGaps.push("Scale to $100k ARR to lift Traction & Revenue score");
  } else {
    treGaps.push("Get first paying customer to significantly lift Traction & Revenue score");
  }

  if (signals.hasCustomers) { treRaw = Math.min(100, treRaw + 8); treEvidence.push("Customer proof present"); }
  if (signals.hasAnalytics) { treRaw = Math.min(100, treRaw + 8); treEvidence.push("Analytics connected"); }
  else { treGaps.push("Connect Google Analytics or Search Console"); }

  if (signals.hasSocialProof) { treRaw = Math.min(100, treRaw + 5); treEvidence.push("Social proof / community present"); }

  const treScore = clamp(treRaw, 0, 100);
  const treAdj = Math.round((treScore - 50) * w.tre * confidence);

  // ── Dimension 5: CGH — Cap Table & Governance Health ─────────────────────
  let cghRaw = b.cgh_base;
  const cghEvidence: string[] = [];
  const cghGaps: string[] = [];

  if (signals.hasCapTable) { cghRaw += 20; cghEvidence.push("Cap table referenced"); }
  else { cghGaps.push("Create a cap table with founder equity split"); }

  if (signals.hasVesting) { cghRaw += 15; cghEvidence.push("Vesting schedule in place"); }
  else { cghGaps.push("Add founder vesting (standard: 4 years, 1 year cliff)"); }

  if (signals.hasShareholdersAgreement) { cghRaw += 15; cghEvidence.push("Shareholders agreement referenced"); }
  else { cghGaps.push("Create a shareholders agreement (SHA)"); }

  if (signals.esopAllocated) { cghRaw += 10; cghEvidence.push("ESOP/option pool allocated"); }
  else { cghGaps.push("Allocate ESOP pool (8-15% is standard AU seed)"); }

  if (signals.hasBoardCadence) { cghRaw += 10; cghEvidence.push("Regular board cadence established"); }
  else { cghGaps.push("Establish quarterly board meetings with minutes"); }

  if (signals.hasFinancialAudit) { cghRaw += 15; cghEvidence.push("Financial audit completed"); }

  const cghScore = clamp(cghRaw, 0, 100);
  const cghAdj = Math.round((cghScore - 50) * w.cgh * confidence);

  // ── Dimension 6: IRI — Investor Readiness Index ───────────────────────────
  let iriRaw = b.iri_base;
  const iriEvidence: string[] = [];
  const iriGaps: string[] = [];

  if (signals.hasPitchDeck) { iriRaw += 25; iriEvidence.push("Pitch deck available"); }
  else { iriGaps.push("Upload a pitch deck to the Evidence Vault"); }

  if (signals.hasFinancialModel) { iriRaw += 20; iriEvidence.push("Financial model uploaded"); }
  else { iriGaps.push("Add a financial model or revenue forecast"); }

  if (signals.hasDataRoom) { iriRaw += 25; iriEvidence.push("Data room prepared"); }
  else { iriGaps.push("Create a data room / due diligence folder"); }

  if (signals.targetRaiseMentioned) { iriRaw += 10; iriEvidence.push("Raise target mentioned"); }
  else { iriGaps.push("State your raise amount and intended use of funds"); }

  const iriScore = clamp(iriRaw, 0, 100);
  const iriAdj = Math.round((iriScore - 50) * w.iri * confidence);

  // ── Dimension 7: LCO — Legal & Compliance ────────────────────────────────
  let lcoRaw = b.lco_base;
  const lcoEvidence: string[] = [];
  const lcoGaps: string[] = [];

  if (signals.hasABN) { lcoRaw += 20; lcoEvidence.push("ABN/ASIC registration confirmed"); }
  else { lcoGaps.push("Register with ASIC and obtain ABN"); }

  if (signals.hasIPProtection) { lcoRaw += 15; lcoEvidence.push("IP protection in place (patent, trademark, copyright)"); }
  else { lcoGaps.push("Consider filing a trademark or provisional patent"); }

  if (signals.hasContracts) { lcoRaw += 10; lcoEvidence.push("Contracts or ToS documented"); }
  else { lcoGaps.push("Draft customer contracts or terms of service"); }

  if (signals.hasLegalDocs) { lcoRaw += 15; lcoEvidence.push("Legal documentation present"); }
  else { lcoGaps.push("Engage a solicitor to draft company constitution and legal docs"); }

  const lcoScore = clamp(lcoRaw, 0, 100);
  const lcoAdj = Math.round((lcoScore - 50) * w.lco * confidence);

  // ── Dimension 8: SVM — Strategic Vision & Moat ───────────────────────────
  let svmRaw = b.svm_base;
  const svmEvidence: string[] = [];
  const svmGaps: string[] = [];

  if (signals.hasMoat) { svmRaw += 35; svmEvidence.push("Defensible moat or competitive advantage identified"); }
  else { svmGaps.push("Articulate your defensible advantage (data, network, switching cost)"); }

  if (signals.hasNetworkEffect) { svmRaw += 20; svmEvidence.push("Network effect present"); }

  if (signals.hasDataAdvantage) { svmRaw += 15; svmEvidence.push("Proprietary data advantage identified"); }

  if (signals.hasSwitchingCosts) { svmRaw += 15; svmEvidence.push("Switching costs or lock-in mechanism present"); }

  const svmScore = clamp(svmRaw, 0, 100);
  const svmAdj = Math.round((svmScore - 50) * w.svm * confidence);

  // ── Stage detection ─────────────────────────────────────────────────────────
  const stage = detectStage(signals);
  const stageLabel = SVI_STAGE_LABELS[stage] ?? "Concept";
  const stageBonus = STAGE_BONUSES[stage] ?? 0;

  // ── 15 Risk penalties ────────────────────────────────────────────────────────
  const riskPenalties: RiskPenalty[] = [];

  if (signals.isAIWrapper && !signals.hasMoat) {
    riskPenalties.push({ label: "AI Wrapper Risk", points: p.ai_wrapper_no_moat,
      reason: "Idea appears to wrap an existing AI model without proprietary data, workflow or network moat. Very easy to replicate." });
  }
  if (signals.founderExperience === "first-time" && !signals.hasCoFounder && !signals.hasAdvisors) {
    riskPenalties.push({ label: "No Founder Background", points: p.no_founder_background,
      reason: "No founder experience, co-founder, or advisors identified. Solo first-time founders face significantly higher execution risk." });
  }
  if (signals.marketSize === "unknown") {
    riskPenalties.push({ label: "Undefined Market", points: p.undefined_market,
      reason: "No TAM/SAM/SOM identified. Investors need market size to assess scale potential." });
  }
  if (!signals.hasCapTable && !signals.hasShareholdersAgreement) {
    riskPenalties.push({ label: "No Cap Table", points: p.no_cap_table,
      reason: "No cap table or shareholders agreement mentioned. Bad equity splits early are the #1 cause of startup failure." });
  }
  if (signals.evidenceLevel === "self_declared") {
    riskPenalties.push({ label: "Unverified Claims Only", points: p.unverified_claims,
      reason: "All information is self-declared with no external evidence. Confidence score significantly reduced." });
  }
  if (!signals.hasCoFounder && stage >= 4) {
    riskPenalties.push({ label: "Solo Founder at Growth Stage", points: p.solo_founder_growth_stage,
      reason: "Solo founder operating at growth/revenue stage. Execution risk increases significantly without complementary co-founder." });
  }
  if (!signals.hasLegalDocs && !signals.hasContracts) {
    riskPenalties.push({ label: "No Legal Documents", points: p.no_legal_docs,
      reason: "No legal documentation, contracts, or ToS mentioned. Operating without legal scaffolding increases liability and investor risk." });
  }
  if (signals.problemClarity === "vague") {
    riskPenalties.push({ label: "Vague Problem Statement", points: p.vague_problem,
      reason: "The problem being solved is not clearly articulated. Investors fund clear, validated problems." });
  }
  if (!signals.hasProduct && !signals.hasDemo && stage >= 1) {
    riskPenalties.push({ label: "No Product at Validated Idea Stage", points: p.no_product_at_validated,
      reason: "Problem is identified but no product, demo, or prototype has been built yet." });
  }
  if (!signals.hasFinancialModel && !signals.hasRevenue) {
    riskPenalties.push({ label: "No Revenue Model", points: p.no_revenue_model,
      reason: "No financial model or revenue path described. Investors need to understand how the business makes money." });
  }
  if (!signals.hasCoFounder && !signals.hasCapTable && stage >= 3) {
    riskPenalties.push({ label: "Concentrated Cap Table Risk", points: p.concentrated_cap_table,
      reason: "Implied 100% founder ownership at traction stage with no cap table. High concentration risk deters investors." });
  }
  if (!signals.hasAdvisors && stage >= 6) {
    riskPenalties.push({ label: "No Advisors at Scale Stage", points: p.no_advisors_at_scale,
      reason: "No advisors mentioned at scale stage. Strategic advisors are critical for navigating growth challenges." });
  }
  if (!signals.hasAnalytics && stage >= 3) {
    riskPenalties.push({ label: "No Analytics at Traction Stage", points: p.no_analytics_at_traction,
      reason: "No analytics or measurement tools detected at early traction stage. Can't demonstrate or optimise growth without data." });
  }
  if (!signals.hasPitchDeck && stage >= 4) {
    riskPenalties.push({ label: "No Pitch Deck at Investor-Ready Stage", points: p.no_pitch_deck_investor_ready,
      reason: "No pitch deck found at revenue/growth stage. A pitch deck is essential to communicate value proposition to investors." });
  }
  if (!signals.hasMoat && !signals.hasNetworkEffect && !signals.hasDataAdvantage) {
    riskPenalties.push({ label: "Undefined Competitive Advantage", points: p.undefined_competitive_advantage,
      reason: "No moat, network effect, or data advantage identified. Sustainable businesses require clear defensibility." });
  }

  const totalPenalty = riskPenalties.reduce((s, r) => s + r.points, 0);

  // ── SVI total ───────────────────────────────────────────────────────────────
  const netAdj = ftvAdj + mpcAdj + ptdAdj + treAdj + cghAdj + iriAdj + lcoAdj + svmAdj;
  const effectiveMetricsBonus = metricsBonus ?? 0;
  const totalSVI = Math.round(Math.max(0, 100 + netAdj + stageBonus - totalPenalty + effectiveMetricsBonus));

  const percentileRank = calcPercentileRank(totalSVI, stage);

  const subs: SVISubScore[] = [
    {
      label: "Founder & Team",
      key: "ftv",
      value: ftvScore,
      adjustment: ftvAdj,
      rationale: `${signals.founderExperience === "serial" ? "Serial founder" : signals.founderExperience === "experienced" ? "Experienced founder" : "First-time founder"}. ${signals.hasCoFounder ? "Co-founder team." : "Solo founder."} ${signals.hasAdvisors ? "Advisors identified." : "No advisors mentioned."}`,
      evidence: ftvEvidence,
      gaps: ftvGaps,
    },
    {
      label: "Market & Problem",
      key: "mpc",
      value: mpcScore,
      adjustment: mpcAdj,
      rationale: `Market clarity and problem validation. ${signals.problemClarity === "validated" ? "Validated with customer evidence." : signals.problemClarity === "clear" ? "Problem is clear but needs validation." : "Problem needs clarification."} Market: ${signals.marketSize}.`,
      evidence: mpcEvidence,
      gaps: mpcGaps,
    },
    {
      label: "Product & Technical",
      key: "ptd",
      value: ptdScore,
      adjustment: ptdAdj,
      rationale: `${signals.hasProduct ? "Product built or described." : "No product described."} ${signals.hasDemo ? "Demo or prototype available." : "No demo yet."} ${signals.hasSourceCode ? "Source code linked." : "No source code linked."}`,
      evidence: ptdEvidence,
      gaps: ptdGaps,
    },
    {
      label: "Traction & Revenue",
      key: "tre",
      value: treScore,
      adjustment: treAdj,
      rationale: `Revenue band: ${signals.revenueBand.replace(/-/g, " ")}. ${signals.hasCustomers ? "Customer proof present." : "No customer proof mentioned."} ${signals.hasAnalytics ? "Analytics in place." : "No analytics connected."}`,
      evidence: treEvidence,
      gaps: treGaps,
    },
    {
      label: "Cap Table & Governance",
      key: "cgh",
      value: cghScore,
      adjustment: cghAdj,
      rationale: `${signals.hasCapTable ? "Cap table present." : "No cap table mentioned."} ${signals.hasShareholdersAgreement ? "SHA confirmed." : "No SHA mentioned."} ${signals.hasVesting ? "Vesting in place." : "No vesting mentioned."}`,
      evidence: cghEvidence,
      gaps: cghGaps,
    },
    {
      label: "Investor Readiness",
      key: "iri",
      value: iriScore,
      adjustment: iriAdj,
      rationale: `${signals.hasPitchDeck ? "Pitch deck present." : "No pitch deck uploaded."} ${signals.hasFinancialModel ? "Financial model available." : "No financial model."} ${signals.hasDataRoom ? "Data room prepared." : "No data room."}`,
      evidence: iriEvidence,
      gaps: iriGaps,
    },
    {
      label: "Legal & Compliance",
      key: "lco",
      value: lcoScore,
      adjustment: lcoAdj,
      rationale: `${signals.hasABN ? "ABN/ASIC registered." : "No ABN/registration found."} ${signals.hasIPProtection ? "IP protection in place." : "No IP protection mentioned."} ${signals.hasContracts ? "Contracts present." : "No contracts referenced."}`,
      evidence: lcoEvidence,
      gaps: lcoGaps,
    },
    {
      label: "Strategic Vision & Moat",
      key: "svm",
      value: svmScore,
      adjustment: svmAdj,
      rationale: `${signals.hasMoat ? "Competitive moat identified." : "No moat identified."} ${signals.hasNetworkEffect ? "Network effect present." : ""} ${signals.hasDataAdvantage ? "Data advantage present." : ""}`.trim(),
      evidence: svmEvidence,
      gaps: svmGaps,
    },
  ];

  // ── Evidence gaps (priority-ordered) ───────────────────────────────────────
  const evidenceGaps: SVIEvidenceGap[] = [];

  if (!signals.hasRevenue) {
    evidenceGaps.push({ priority: "P0", label: "Add first revenue proof", action: "Connect Stripe, upload invoice, or add customer contract", impact: ei.first_revenue, evidenceType: "transaction_data" });
  }
  if (signals.evidenceLevel === "self_declared") {
    evidenceGaps.push({ priority: "P0", label: "Upgrade evidence level", action: "Add public URL, upload documents, or connect source (GitHub, analytics, Stripe)", impact: ei.upgrade_evidence_level, evidenceType: "public_url" });
  }
  if (!signals.hasCapTable) {
    evidenceGaps.push({ priority: "P0", label: "Create cap table", action: "Build a cap table with founder shares, vesting, and ESOP pool", impact: ei.create_cap_table, evidenceType: "document_uploaded" });
  }
  if (!signals.hasABN) {
    evidenceGaps.push({ priority: "P0", label: "Register ABN/ASIC", action: "Register your company with ASIC and obtain an Australian Business Number", impact: ei.register_abn, evidenceType: "document_uploaded" });
  }
  if (!signals.hasSourceCode) {
    evidenceGaps.push({ priority: "P1", label: "Link source code repository", action: "Connect GitHub or GitLab to verify product progress", impact: ei.link_source_code, evidenceType: "connected_source" });
  }
  if (!signals.hasWebsite) {
    evidenceGaps.push({ priority: "P1", label: "Create public website", action: "Build a landing page to prove market presence and collect leads", impact: ei.create_website, evidenceType: "public_url" });
  }
  if (!signals.hasPitchDeck) {
    evidenceGaps.push({ priority: "P1", label: "Upload pitch deck", action: "Upload a pitch deck to the Evidence Vault", impact: ei.upload_pitch_deck, evidenceType: "document_uploaded" });
  }
  if (!signals.hasIPProtection) {
    evidenceGaps.push({ priority: "P1", label: "Secure IP protection", action: "File a provisional patent or trademark to protect your core innovation", impact: ei.secure_ip, evidenceType: "document_uploaded" });
  }
  if (!signals.hasFinancialModel) {
    evidenceGaps.push({ priority: "P2", label: "Upload financial model", action: "Add a financial model (even a basic P&L forecast) to the Evidence Vault", impact: ei.upload_financial_model, evidenceType: "document_uploaded" });
  }
  if (!signals.hasAnalytics) {
    evidenceGaps.push({ priority: "P2", label: "Connect analytics", action: "Connect Google Analytics or Search Console to verify traffic/traction", impact: ei.connect_analytics, evidenceType: "connected_source" });
  }
  if (!signals.hasAdvisors) {
    evidenceGaps.push({ priority: "P2", label: "Add named advisors", action: "Engage 1-2 industry advisors with relevant domain expertise and list them in your materials", impact: ei.add_advisors, evidenceType: "self_declared" });
  }

  // ── Next actions ────────────────────────────────────────────────────────────
  const nextActions: SVIAnalysis["nextActions"] = [];

  if (signals.isAIWrapper && !signals.hasMoat) {
    nextActions.push({
      priority: "P0",
      title: "Define your AI moat",
      detail: "Identify proprietary data, workflow, or network effect that makes your AI wrapper defensible. Without this, SVI penalises the AI wrapper risk heavily.",
      impact: "+15 SVI points",
    });
  }
  if (!signals.hasCapTable) {
    nextActions.push({
      priority: "P0",
      title: "Build your cap table now",
      detail: "Bad equity splits early are the #1 cause of startup failure. Use BlockID's cap table starter to model founder splits, vesting, ESOP, and dilution scenarios.",
      impact: "+12 SVI points",
    });
  }
  if (signals.evidenceLevel === "self_declared") {
    nextActions.push({
      priority: "P0",
      title: "Add verifiable evidence",
      detail: "Upload documents, link your GitHub, or connect analytics to raise evidence confidence from 20% to 50%+.",
      impact: "+15 SVI points",
    });
  }
  if (!signals.hasRevenue) {
    nextActions.push({
      priority: "P1",
      title: "Get your first paying customer",
      detail: "Even $1 of revenue lifts your Traction & Revenue score significantly and signals product-market fit direction.",
      impact: "+18 SVI points",
    });
  }
  if (signals.marketSize === "unknown") {
    nextActions.push({
      priority: "P1",
      title: "Define your TAM/SAM/SOM",
      detail: "Research and document your total addressable market. Include market size references in your pitch deck.",
      impact: "+10 SVI points",
    });
  }
  if (!signals.hasDemo) {
    nextActions.push({
      priority: "P1",
      title: "Create a live demo or prototype",
      detail: "A working demo is the most powerful evidence you can show investors and customers.",
      impact: "+8 SVI points",
    });
  }
  if (!signals.hasABN) {
    nextActions.push({
      priority: "P1",
      title: "Register your company with ASIC",
      detail: "Obtain an ABN and register as a Pty Ltd to unlock legal protections, investor trust, and government grants.",
      impact: "+10 SVI points",
    });
  }
  if (!signals.hasPitchDeck && stage >= 2) {
    nextActions.push({
      priority: "P2",
      title: "Upload your pitch deck",
      detail: "A structured pitch deck demonstrates investor readiness and clarifies your value proposition.",
      impact: "+8 SVI points",
    });
  }

  // ── Summary line ────────────────────────────────────────────────────────────
  const sviLabel =
    totalSVI >= 300 ? "Exceptional"
    : totalSVI >= 200 ? "Elite"
    : totalSVI >= 170 ? "Outstanding"
    : totalSVI >= 140 ? "Strong"
    : totalSVI >= 120 ? "Above Average"
    : totalSVI >= 100 ? "Average"
    : totalSVI >= 80 ? "Below Average"
    : "Early Stage";

  const summary = `${sviLabel} Startup Value Index — ${stageLabel} stage (${stage === 0 ? "p" : "P"}${percentileRank}th percentile for stage). ${
    riskPenalties.length > 0
      ? `${riskPenalties.length} risk factor${riskPenalties.length > 1 ? "s" : ""} detected. `
      : ""
  }${
    evidenceGaps.filter((g) => g.priority === "P0").length > 0
      ? `${evidenceGaps.filter((g) => g.priority === "P0").length} critical evidence gap${evidenceGaps.filter((g) => g.priority === "P0").length > 1 ? "s" : ""} to address.`
      : "Evidence base is solid."
  }`;

  return {
    version: SVI_VERSION,
    totalSVI,
    baselineSVI: 100,
    netAdjustment: netAdj + stageBonus - totalPenalty + effectiveMetricsBonus,
    confidenceMultiplier: confidence,
    subs,
    riskPenalties,
    evidenceGaps,
    nextActions: nextActions.slice(0, 5),
    signals,
    summary,
    stage,
    stageLabel,
    stageBonus,
    weeklyDelta,
    percentileRank,
    metricsBonus: effectiveMetricsBonus > 0 ? effectiveMetricsBonus : undefined,
  };
}
