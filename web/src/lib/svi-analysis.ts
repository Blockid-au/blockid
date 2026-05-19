// Startup Value Index (SVI) — deterministic computation v1.0
// Base starts at 100 and adjusts up/down based on evidence signals.
// NOT a legal valuation. An indicator of startup progress and evidence quality.

export const SVI_VERSION = "1.0.0";

// ─── Evidence confidence levels ───────────────────────────────────────────────
export const EVIDENCE_CONFIDENCE: Record<string, number> = {
  self_declared: 0.20,
  public_url: 0.35,
  document_uploaded: 0.50,
  connected_source: 0.75,
  transaction_data: 0.90,
  third_party_verified: 1.00,
};

// ─── Input types ──────────────────────────────────────────────────────────────
export interface SVITextInput {
  rawText: string;
  fileName?: string;
}

export interface SVIExtractedSignals {
  // Founder signals
  hasCoFounder: boolean;
  founderExperience: "first-time" | "experienced" | "serial";
  founderSectorFit: boolean;

  // Idea / market signals
  marketSize: "unknown" | "small" | "medium" | "large";
  problemClarity: "vague" | "clear" | "validated";
  isAIWrapper: boolean;
  hasMoat: boolean;
  hasNetworkEffect: boolean;

  // Product signals
  hasProduct: boolean;
  hasDemo: boolean;
  hasSourceCode: boolean;
  hasWebsite: boolean;
  hasApp: boolean;

  // Traction / revenue signals
  hasRevenue: boolean;
  revenueBand: "pre-revenue" | "early" | "growing" | "scaling";
  hasCustomers: boolean;
  hasSocialProof: boolean;
  hasAnalytics: boolean;

  // Cap table / governance signals
  hasCapTable: boolean;
  hasVesting: boolean;
  hasShareholdersAgreement: boolean;
  hasBoardCadence: boolean;
  hasFinancialAudit: boolean;
  esopAllocated: boolean;

  // Investor readiness
  hasPitchDeck: boolean;
  hasFinancialModel: boolean;
  hasDataRoom: boolean;
  targetRaiseMentioned: boolean;

  // Evidence quality
  evidenceLevel: keyof typeof EVIDENCE_CONFIDENCE;
}

export interface SVISubScore {
  label: string;
  key: string;
  value: number;        // 0–100 range for sub-scores
  adjustment: number;   // +/- applied to base SVI
  rationale: string;
  evidence: string[];
  gaps: string[];
}

export interface RiskPenalty {
  label: string;
  points: number;
  reason: string;
}

export interface SVIEvidenceGap {
  priority: "P0" | "P1" | "P2";
  label: string;
  action: string;
  impact: number; // SVI points potential gain
  evidenceType: string;
}

export interface SVIAnalysis {
  version: string;
  totalSVI: number;        // Base 100 ± adjustments
  baselineSVI: number;     // Always 100
  netAdjustment: number;   // Sum of all adjustments
  confidenceMultiplier: number; // 0.20–1.00 based on evidence level
  subs: SVISubScore[];
  riskPenalties: RiskPenalty[];
  evidenceGaps: SVIEvidenceGap[];
  nextActions: { priority: "P0" | "P1" | "P2"; title: string; detail: string; impact: string }[];
  signals: SVIExtractedSignals;
  summary: string;
}

// ─── Text parser: extract signals from raw input ──────────────────────────────
export function extractSignals(input: SVITextInput): SVIExtractedSignals {
  const text = (input.rawText + " " + (input.fileName ?? "")).toLowerCase();

  const has = (...terms: string[]) => terms.some((t) => text.includes(t));

  const isAIWrapper =
    has("gpt", "chatgpt", "openai", "llm wrapper", "ai chatbot", "ai agent") &&
    !has("fine-tun", "custom model", "proprietary data", "training data", "own model", "model fine");

  const hasMoat =
    has("proprietary", "patent", "exclusive", "network effect", "switching cost",
        "data advantage", "moat", "unique dataset", "10 year", "decade");

  const hasNetworkEffect = has("network effect", "two-sided", "marketplace", "platform");

  const founderExperience: SVIExtractedSignals["founderExperience"] = has(
    "exited", "founded before", "serial founder", "previous startup", "sold company",
  )
    ? "serial"
    : has("10 year", "decade", "15 year", "20 year", "senior", "experienced founder")
      ? "experienced"
      : "first-time";

  const marketSize: SVIExtractedSignals["marketSize"] = has(
    "billion", "trillion", "1b", "2b", "10b", "$1b", "$10b",
  )
    ? "large"
    : has("million", "100m", "500m", "$100m", "$500m")
      ? "medium"
      : has("small", "niche", "local market")
        ? "small"
        : "unknown";

  const problemClarity: SVIExtractedSignals["problemClarity"] = has(
    "customer interview", "survey", "validated", "paying customer", "letter of intent", "loi", "mou",
  )
    ? "validated"
    : has("problem", "pain point", "challenge", "issue", "solve", "need")
      ? "clear"
      : "vague";

  const revenueBand: SVIExtractedSignals["revenueBand"] = has(
    "mrr", "arr", "monthly revenue", "revenue", "paying", "$1m", "$500k", "1m arr",
  )
    ? has("$1m", "$2m", "1m arr", "scaling", "growth stage")
      ? "scaling"
      : has("$100k", "$200k", "$500k", "growing")
        ? "growing"
        : "early"
    : "pre-revenue";

  // Evidence quality: check file types and keywords
  let evidenceLevel: keyof typeof EVIDENCE_CONFIDENCE = "self_declared";
  if (input.fileName) {
    if (input.fileName.match(/\.(pdf|doc|docx|xlsx|csv)$/i)) {
      evidenceLevel = "document_uploaded";
    }
  }
  if (has("stripe", "xero", "quickbooks", "github", "google analytics", "app store", "play store")) {
    evidenceLevel = "connected_source";
  }
  if (has("invoice", "revenue proof", "customer contract", "signed", "transaction")) {
    evidenceLevel = "transaction_data";
  }
  if (has("audit", "accountant report", "asic", "board signed", "third party")) {
    evidenceLevel = "third_party_verified";
  }

  return {
    hasCoFounder: has("co-founder", "cofounder", "co founder", "2 founders", "three founders", "team of"),
    founderExperience,
    founderSectorFit: has("background in", "worked in", "experience in", "years in", "domain"),
    marketSize,
    problemClarity,
    isAIWrapper,
    hasMoat,
    hasNetworkEffect,
    hasProduct: has("product", "app", "platform", "tool", "software", "mvp", "beta", "saas"),
    hasDemo: has("demo", "prototype", "proof of concept", "poc", "live"),
    hasSourceCode: has("github", "gitlab", "bitbucket", "source code", "repository", "open source"),
    hasWebsite: has("website", "landing page", "domain", ".com", ".au", "online"),
    hasApp: has("ios", "android", "app store", "play store", "mobile app"),
    hasRevenue: revenueBand !== "pre-revenue",
    revenueBand,
    hasCustomers: has("customer", "client", "user", "paying", "subscriber", "member"),
    hasSocialProof: has("linkedin", "twitter", "instagram", "facebook", "tiktok", "youtube",
                       "social", "followers", "community", "discord", "telegram"),
    hasAnalytics: has("analytics", "search console", "ga4", "mixpanel", "amplitude", "data"),
    hasCapTable: has("cap table", "equity", "shares", "shareholding", "ownership", "stake"),
    hasVesting: has("vesting", "cliff", "4 year", "12 month cliff"),
    hasShareholdersAgreement: has("shareholders agreement", "sha", "shareholders deed"),
    hasBoardCadence: has("board meeting", "board minutes", "quarterly meeting", "board cadence"),
    hasFinancialAudit: has("audit", "audited", "financial audit", "big 4", "pwc", "deloitte"),
    esopAllocated: has("esop", "option pool", "employee options", "eso", "share option"),
    hasPitchDeck: has("pitch deck", "deck", "presentation", "slideshow"),
    hasFinancialModel: has("financial model", "p&l", "revenue forecast", "financial projection", "cashflow"),
    hasDataRoom: has("data room", "dataroom", "due diligence", "dd folder"),
    targetRaiseMentioned: has("raising", "raise", "funding", "investment", "seed round", "series"),
    evidenceLevel,
  };
}

// ─── SVI computation ───────────────────────────────────────────────────────────
const clamp = (v: number, min = 0, max = 200) => Math.max(min, Math.min(max, v));

export function computeSVI(signals: SVIExtractedSignals): SVIAnalysis {
  const confidence = EVIDENCE_CONFIDENCE[signals.evidenceLevel] ?? 0.20;

  // ── 1. Composite Value ──────────────────────────────────────────────────────
  let compositeRaw = 50;
  const compositeEvidence: string[] = [];
  const compositeGaps: string[] = [];

  if (signals.problemClarity === "validated") { compositeRaw += 20; compositeEvidence.push("Validated problem with customer proof"); }
  else if (signals.problemClarity === "clear") { compositeRaw += 10; compositeEvidence.push("Clear problem statement"); compositeGaps.push("Add customer validation proof"); }
  else { compositeGaps.push("Clarify the problem being solved"); }

  if (signals.marketSize === "large") { compositeRaw += 20; compositeEvidence.push("Large addressable market"); }
  else if (signals.marketSize === "medium") { compositeRaw += 12; compositeEvidence.push("Medium addressable market"); }
  else { compositeGaps.push("Define total addressable market size"); }

  if (signals.hasMoat) { compositeRaw += 10; compositeEvidence.push("Moat or competitive advantage identified"); }
  else { compositeGaps.push("Define defensible moat or advantage"); }

  if (signals.hasNetworkEffect) { compositeRaw += 8; compositeEvidence.push("Network effect present"); }

  const compositeScore = clamp(compositeRaw, 0, 100);
  const compositeAdj = Math.round((compositeScore - 50) * 0.20 * confidence);

  // ── 2. Evidence Confidence ──────────────────────────────────────────────────
  let evidenceRaw = Math.round(confidence * 100);
  const evidenceEvidence: string[] = [];
  const evidenceGapsLocal: string[] = [];

  const evidenceLevelLabels: Record<string, string> = {
    self_declared: "Self-declared input only",
    public_url: "Public URL available",
    document_uploaded: "Document uploaded",
    connected_source: "Source/API connected",
    transaction_data: "Transaction data verified",
    third_party_verified: "Third-party verified",
  };
  evidenceEvidence.push(evidenceLevelLabels[signals.evidenceLevel] ?? "Unknown");

  if (signals.hasSourceCode) { evidenceRaw = Math.min(100, evidenceRaw + 10); evidenceEvidence.push("Source code repository linked"); }
  else { evidenceGapsLocal.push("Link GitHub/GitLab repository"); }

  if (signals.hasWebsite) { evidenceRaw = Math.min(100, evidenceRaw + 5); evidenceEvidence.push("Website or landing page present"); }
  else { evidenceGapsLocal.push("Create a public website or landing page"); }

  if (signals.hasAnalytics) { evidenceRaw = Math.min(100, evidenceRaw + 8); evidenceEvidence.push("Analytics connected"); }
  else { evidenceGapsLocal.push("Connect Google Analytics or Search Console"); }

  if (signals.hasRevenue) { evidenceRaw = Math.min(100, evidenceRaw + 15); evidenceEvidence.push("Revenue evidence present"); }
  else { evidenceGapsLocal.push("Add revenue proof (Stripe, invoice, contract)"); }

  const evidenceScore = clamp(evidenceRaw, 0, 100);
  const evidenceAdj = Math.round((evidenceScore - 50) * 0.25 * confidence);

  // ── 3. Founder Value ────────────────────────────────────────────────────────
  let founderRaw = 50;
  const founderEvidence: string[] = [];
  const founderGaps: string[] = [];

  if (signals.founderExperience === "serial") { founderRaw += 30; founderEvidence.push("Serial founder with exits"); }
  else if (signals.founderExperience === "experienced") { founderRaw += 18; founderEvidence.push("Experienced founder (10+ years)"); }
  else { founderGaps.push("Add founder background and track record"); }

  if (signals.hasCoFounder) { founderRaw += 12; founderEvidence.push("Co-founder team"); }
  else { founderGaps.push("Consider adding a co-founder for complementary skills"); }

  if (signals.founderSectorFit) { founderRaw += 8; founderEvidence.push("Domain expertise in target sector"); }
  else { founderGaps.push("Highlight relevant domain experience"); }

  const founderScore = clamp(founderRaw, 0, 100);
  const founderAdj = Math.round((founderScore - 50) * 0.20 * confidence);

  // ── 4. Revenue Value ────────────────────────────────────────────────────────
  let revenueRaw = 30;
  const revenueEvidence: string[] = [];
  const revenueGaps: string[] = [];

  if (signals.revenueBand === "scaling") { revenueRaw = 90; revenueEvidence.push("Scaling revenue ($1M+ ARR range)"); }
  else if (signals.revenueBand === "growing") { revenueRaw = 70; revenueEvidence.push("Growing revenue ($100k–$500k ARR range)"); }
  else if (signals.revenueBand === "early") { revenueRaw = 50; revenueEvidence.push("Early revenue traction"); revenueGaps.push("Scale to $100k ARR to lift Revenue Value Index"); }
  else { revenueRaw = 30; revenueGaps.push("Get first paying customer to lift Revenue Value Index significantly"); }

  if (signals.hasCustomers) { revenueRaw = Math.min(100, revenueRaw + 8); revenueEvidence.push("Customer proof present"); }
  if (signals.hasFinancialModel) { revenueRaw = Math.min(100, revenueRaw + 5); revenueEvidence.push("Financial model uploaded"); }
  else { revenueGaps.push("Upload a financial model or revenue forecast"); }

  const revenueScore = clamp(revenueRaw, 0, 100);
  const revenueAdj = Math.round((revenueScore - 50) * 0.15 * confidence);

  // ── 5. Cap Table Health ─────────────────────────────────────────────────────
  let capRaw = 40;
  const capEvidence: string[] = [];
  const capGaps: string[] = [];

  if (signals.hasCapTable) { capRaw += 20; capEvidence.push("Cap table referenced"); }
  else { capGaps.push("Create a cap table with founder equity split"); }

  if (signals.hasVesting) { capRaw += 15; capEvidence.push("Vesting schedule mentioned"); }
  else { capGaps.push("Add founder vesting (standard: 4 years, 1 year cliff)"); }

  if (signals.hasShareholdersAgreement) { capRaw += 15; capEvidence.push("Shareholders agreement referenced"); }
  else { capGaps.push("Create a shareholders agreement"); }

  if (signals.esopAllocated) { capRaw += 10; capEvidence.push("ESOP/option pool allocated"); }
  else { capGaps.push("Allocate ESOP pool (8–15% is standard AU seed)"); }

  const capScore = clamp(capRaw, 0, 100);
  const capAdj = Math.round((capScore - 50) * 0.10 * confidence);

  // ── 6. Moat & Product ──────────────────────────────────────────────────────
  let moatRaw = 35;
  const moatEvidence: string[] = [];
  const moatGaps: string[] = [];

  if (signals.hasProduct) { moatRaw += 15; moatEvidence.push("Product exists"); }
  else { moatGaps.push("Build or describe your product/MVP"); }

  if (signals.hasDemo) { moatRaw += 15; moatEvidence.push("Demo or prototype available"); }
  else { moatGaps.push("Create a live demo or prototype"); }

  if (signals.hasApp) { moatRaw += 10; moatEvidence.push("Mobile app present"); }

  if (signals.hasMoat) { moatRaw += 20; moatEvidence.push("Moat / defensibility identified"); }
  else { moatGaps.push("Articulate your defensible advantage (data, network, switching cost)"); }

  if (signals.hasNetworkEffect) { moatRaw += 5; moatEvidence.push("Network effect identified"); }

  const moatScore = clamp(moatRaw, 0, 100);
  const moatAdj = Math.round((moatScore - 50) * 0.10 * confidence);

  // ── Risk penalties ──────────────────────────────────────────────────────────
  const riskPenalties: RiskPenalty[] = [];

  if (signals.isAIWrapper && !signals.hasMoat) {
    riskPenalties.push({
      label: "AI Wrapper Risk",
      points: 15,
      reason: "Idea appears to wrap an existing AI model without proprietary data, workflow or network moat. Very easy to replicate.",
    });
  }
  if (signals.marketSize === "unknown") {
    riskPenalties.push({
      label: "Undefined Market",
      points: 10,
      reason: "No TAM/SAM/SOM identified. Investors need market size to assess scale potential.",
    });
  }
  if (!signals.hasCapTable && !signals.hasShareholdersAgreement) {
    riskPenalties.push({
      label: "Cap Table & Governance Risk",
      points: 12,
      reason: "No cap table or shareholders agreement mentioned. Bad equity splits early are the #1 cause of startup failure.",
    });
  }
  if (signals.evidenceLevel === "self_declared") {
    riskPenalties.push({
      label: "Unverified Claims",
      points: 8,
      reason: "All information is self-declared with no external evidence. Confidence score significantly reduced.",
    });
  }
  if (signals.problemClarity === "vague") {
    riskPenalties.push({
      label: "Unclear Problem Statement",
      points: 8,
      reason: "The problem being solved is not clearly articulated. Investors fund clear problems.",
    });
  }

  const totalPenalty = riskPenalties.reduce((s, r) => s + r.points, 0);

  // ── SVI total ───────────────────────────────────────────────────────────────
  const netAdj =
    compositeAdj + evidenceAdj + founderAdj + revenueAdj + capAdj + moatAdj;
  const totalSVI = Math.round(clamp(100 + netAdj - totalPenalty, 30, 300));

  const subs: SVISubScore[] = [
    {
      label: "Composite Value",
      key: "compositeValue",
      value: compositeScore,
      adjustment: compositeAdj,
      rationale: `Market clarity and problem validation. ${signals.problemClarity === "validated" ? "Validated with evidence." : signals.problemClarity === "clear" ? "Problem is clear but needs validation." : "Problem needs clarification."}`,
      evidence: compositeEvidence,
      gaps: compositeGaps,
    },
    {
      label: "Evidence Confidence",
      key: "evidenceConfidence",
      value: evidenceScore,
      adjustment: evidenceAdj,
      rationale: `Evidence quality: ${evidenceLevelLabels[signals.evidenceLevel]}. Confidence multiplier: ${Math.round(confidence * 100)}%.`,
      evidence: evidenceEvidence,
      gaps: evidenceGapsLocal,
    },
    {
      label: "Founder Value",
      key: "founderValue",
      value: founderScore,
      adjustment: founderAdj,
      rationale: `${signals.founderExperience === "serial" ? "Serial founder" : signals.founderExperience === "experienced" ? "Experienced founder" : "First-time founder"}. ${signals.hasCoFounder ? "Co-founder team." : "Solo founder."}`,
      evidence: founderEvidence,
      gaps: founderGaps,
    },
    {
      label: "Revenue Value",
      key: "revenueValue",
      value: revenueScore,
      adjustment: revenueAdj,
      rationale: `Revenue band: ${signals.revenueBand.replace(/-/g, " ")}. ${signals.hasCustomers ? "Customer proof present." : "No customer proof mentioned."}`,
      evidence: revenueEvidence,
      gaps: revenueGaps,
    },
    {
      label: "Cap Table Health",
      key: "capTableHealth",
      value: capScore,
      adjustment: capAdj,
      rationale: `${signals.hasCapTable ? "Cap table present." : "No cap table mentioned."} ${signals.hasShareholdersAgreement ? "SHA confirmed." : "No SHA mentioned."} ${signals.hasVesting ? "Vesting in place." : "No vesting mentioned."}`,
      evidence: capEvidence,
      gaps: capGaps,
    },
    {
      label: "Moat & Product",
      key: "moatProduct",
      value: moatScore,
      adjustment: moatAdj,
      rationale: `${signals.hasProduct ? "Product built." : "No product described."} ${signals.hasMoat ? "Competitive moat identified." : "No moat identified."}`,
      evidence: moatEvidence,
      gaps: moatGaps,
    },
  ];

  // ── Evidence gaps (priority-ordered) ───────────────────────────────────────
  const evidenceGaps: SVIEvidenceGap[] = [];

  if (!signals.hasRevenue) {
    evidenceGaps.push({ priority: "P0", label: "Add first revenue proof", action: "Connect Stripe, upload invoice, or add customer contract", impact: 18, evidenceType: "transaction_data" });
  }
  if (signals.evidenceLevel === "self_declared") {
    evidenceGaps.push({ priority: "P0", label: "Upgrade evidence level", action: "Add public URL, upload documents, or connect source (GitHub, analytics, Stripe)", impact: 15, evidenceType: "public_url" });
  }
  if (!signals.hasCapTable) {
    evidenceGaps.push({ priority: "P0", label: "Create cap table", action: "Build a cap table with founder shares, vesting, and ESOP pool", impact: 12, evidenceType: "document_uploaded" });
  }
  if (!signals.hasSourceCode) {
    evidenceGaps.push({ priority: "P1", label: "Link source code repository", action: "Connect GitHub or GitLab to verify product progress", impact: 10, evidenceType: "connected_source" });
  }
  if (!signals.hasWebsite) {
    evidenceGaps.push({ priority: "P1", label: "Create public website", action: "Build a landing page to prove market presence and collect leads", impact: 8, evidenceType: "public_url" });
  }
  if (!signals.hasPitchDeck) {
    evidenceGaps.push({ priority: "P1", label: "Upload pitch deck", action: "Upload a pitch deck to the Evidence Vault", impact: 7, evidenceType: "document_uploaded" });
  }
  if (!signals.hasFinancialModel) {
    evidenceGaps.push({ priority: "P2", label: "Upload financial model", action: "Add a financial model (even a basic P&L forecast) to the Evidence Vault", impact: 6, evidenceType: "document_uploaded" });
  }
  if (!signals.hasAnalytics) {
    evidenceGaps.push({ priority: "P2", label: "Connect analytics", action: "Connect Google Analytics or Search Console to verify traffic/traction", impact: 8, evidenceType: "connected_source" });
  }

  // ── Next actions ────────────────────────────────────────────────────────────
  const nextActions: SVIAnalysis["nextActions"] = [];

  // Prioritize by weakest sub and biggest penalties
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
      detail: "Even $1 of revenue lifts your Revenue Value Index significantly and signals product-market fit direction.",
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

  // ── Summary line ────────────────────────────────────────────────────────────
  const sviLabel =
    totalSVI >= 140 ? "Strong"
    : totalSVI >= 120 ? "Above Average"
    : totalSVI >= 100 ? "Average"
    : totalSVI >= 80 ? "Below Average"
    : "Early Stage";

  const summary = `${sviLabel} Startup Value Index. ${
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
    netAdjustment: netAdj - totalPenalty,
    confidenceMultiplier: confidence,
    subs,
    riskPenalties,
    evidenceGaps,
    nextActions: nextActions.slice(0, 5),
    signals,
    summary,
  };
}
