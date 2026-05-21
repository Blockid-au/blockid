// Startup Value Index (SVI) — deterministic computation v2.0
// Base starts at 100 and adjusts up/down based on evidence signals.
// 0+ open-ended index — like a stock market index, grows without limit.
// NOT a legal valuation. An indicator of startup progress and evidence quality.

import type { TechAuditResult } from "./rnd-input";
import type { GitHubRepoAudit } from "./github-repo-audit";

export const SVI_VERSION = "2.0.0";

// ─── Stage labels ─────────────────────────────────────────────────────────────
export const SVI_STAGE_LABELS: string[] = [
  "Concept",
  "Validated Idea",
  "MVP / Prototype",
  "Early Traction",
  "Revenue",
  "Growth",
  "Scale",
  "Corporation",
];

const STAGE_BONUSES: Record<number, number> = {
  0: 0,
  1: 3,
  2: 5,
  3: 8,
  4: 12,
  5: 18,
  6: 25,
  7: 35,
};

// ─── Benchmark bands per stage ────────────────────────────────────────────────
export const SVI_BENCHMARKS: Record<
  number,
  { p10: number; p25: number; p50: number; p75: number; p90: number }
> = {
  0: { p10: 60,  p25: 75,  p50: 90,  p75: 105, p90: 115 },
  1: { p10: 75,  p25: 90,  p50: 105, p75: 118, p90: 130 },
  2: { p10: 85,  p25: 100, p50: 115, p75: 130, p90: 145 },
  3: { p10: 95,  p25: 110, p50: 125, p75: 142, p90: 158 },
  4: { p10: 105, p25: 120, p50: 138, p75: 155, p90: 170 },
  5: { p10: 118, p25: 135, p50: 152, p75: 168, p90: 185 },
  6: { p10: 135, p25: 152, p50: 168, p75: 185, p90: 200 },
  7: { p10: 155, p25: 170, p50: 185, p75: 200, p90: 220 },
};

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
  hasAdvisors: boolean;

  // Idea / market signals
  marketSize: "unknown" | "small" | "medium" | "large";
  problemClarity: "vague" | "clear" | "validated";
  hasCustomerInterviews: boolean;
  isAIWrapper: boolean;
  hasMoat: boolean;
  hasNetworkEffect: boolean;
  hasDataAdvantage: boolean;
  hasSwitchingCosts: boolean;

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
  raiseMentioned: boolean; // alias for targetRaiseMentioned

  // Legal & compliance
  hasABN: boolean;
  hasIPProtection: boolean;
  hasContracts: boolean;
  hasLegalDocs: boolean;

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
  totalSVI: number;             // 0+ open-ended index (base 100 ± adjustments)
  baselineSVI: number;          // Always 100
  netAdjustment: number;        // Sum of all adjustments
  confidenceMultiplier: number; // 0.20–1.00 based on evidence level
  subs: SVISubScore[];
  riskPenalties: RiskPenalty[];
  evidenceGaps: SVIEvidenceGap[];
  nextActions: { priority: "P0" | "P1" | "P2"; title: string; detail: string; impact: string }[];
  signals: SVIExtractedSignals;
  summary: string;
  // v2 additions
  stage: number;           // 0-7
  stageLabel: string;      // e.g. "Concept", "Validated Idea", ...
  stageBonus: number;      // +0 to +35
  weeklyDelta?: number;    // Optional: difference from prior snapshot
  percentileRank?: number; // 10-90 based on benchmark for current stage
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

// ─── Evidence item shape (from svi_evidence table) ───────────────────────────
export interface EvidenceItem {
  evidence_type: string;
  confidence_level: string;
  dimension: string;
  label: string;
}

// ─── Text parser: extract signals from raw input ──────────────────────────────
export function extractSignals(
  input: SVITextInput,
  _fileName?: string,
  evidenceItems?: EvidenceItem[],
  techAudit?: TechAuditResult,
  repoAudit?: GitHubRepoAudit,
): SVIExtractedSignals {
  const text = (input.rawText + " " + (input.fileName ?? "")).toLowerCase();

  const has = (...terms: string[]) => terms.some((t) => text.includes(t));

  const isAIWrapper =
    has("gpt", "chatgpt", "openai", "llm wrapper", "ai chatbot", "ai agent") &&
    !has("fine-tun", "custom model", "proprietary data", "training data", "own model", "model fine");

  const hasMoat =
    has("proprietary", "patent", "exclusive", "network effect", "switching cost",
        "data advantage", "moat", "unique dataset", "10 year", "decade");

  const hasNetworkEffect = has("network effect", "two-sided", "marketplace", "platform");

  const hasDataAdvantage = has(
    "proprietary data", "unique dataset", "data moat", "data advantage",
  );

  const hasSwitchingCosts = has(
    "switching cost", "lock-in", "integration", "api integration",
  );

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

  const targetRaiseMentioned = has("raising", "raise", "funding", "investment", "seed round", "series");

  const signals: SVIExtractedSignals = {
    hasCoFounder: has("co-founder", "cofounder", "co founder", "2 founders", "three founders", "team of"),
    founderExperience,
    founderSectorFit: has("background in", "worked in", "experience in", "years in", "domain"),
    hasAdvisors: has("advisor", "mentor", "angel", "board member"),
    marketSize,
    problemClarity,
    hasCustomerInterviews: has("customer interview", "user interview", "discovery call", "survey"),
    isAIWrapper,
    hasMoat,
    hasNetworkEffect,
    hasDataAdvantage,
    hasSwitchingCosts,
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
    targetRaiseMentioned,
    raiseMentioned: targetRaiseMentioned,
    hasABN: has("abn", "australian business number", "asic", "registered company"),
    hasIPProtection: has("patent", "trademark", "copyright", "ip protection"),
    hasContracts: has("contract", "agreement", "terms of service", "tos"),
    hasLegalDocs: has("legal", "lawyer", "solicitor", "company constitution"),
    evidenceLevel,
  };

  // ── Evidence overlay: boost signals from uploaded/connected evidence ──────
  if (evidenceItems?.length) {
    for (const ev of evidenceItems) {
      switch (ev.evidence_type) {
        case "document":
        case "document_uploaded":
          if (ev.dimension === "ptd") { signals.hasProduct = true; signals.hasDemo = true; }
          if (ev.dimension === "iri") { signals.hasPitchDeck = true; }
          if (ev.dimension === "cgh") { signals.hasShareholdersAgreement = true; }
          if (ev.dimension === "lco") { signals.hasIPProtection = true; signals.hasContracts = true; }
          break;
        case "url":
          if (ev.dimension === "ptd") { signals.hasWebsite = true; signals.hasProduct = true; }
          break;
        case "github":
          signals.hasSourceCode = true;
          signals.hasProduct = true;
          // If GitHub evidence is in the "tre" (traction) dimension, it represents
          // commit activity — boost traction signals accordingly
          if (ev.dimension === "tre") {
            signals.hasAnalytics = true;
            signals.hasSocialProof = true;
          }
          break;
        case "analytics":
          signals.hasAnalytics = true;
          break;
        case "stripe":
          signals.hasRevenue = true; signals.hasCustomers = true;
          if (!signals.revenueBand || signals.revenueBand === "pre-revenue") {
            signals.revenueBand = "early";
          }
          break;
      }
      // Boost confidence based on evidence level
      if (ev.confidence_level === "connected_source" || ev.confidence_level === "transaction_data") {
        signals.evidenceLevel = ev.confidence_level;
      }
    }
  }

  // ── Tech audit overlay: auto-populate signals from deep website analysis ───
  if (techAudit) {
    // Website is live and reachable
    signals.hasWebsite = true;
    signals.hasProduct = true;

    // Upgrade evidence level — machine-verified is stronger than self-declared
    if (signals.evidenceLevel === "self_declared" || signals.evidenceLevel === "public_url") {
      signals.evidenceLevel = "connected_source";
    }

    // Product maturity signals
    const pm = techAudit.productMaturity;
    if (pm.hasSitemap && pm.sitemapPageCount >= 5) signals.hasProduct = true;
    if (pm.hasLoginForm || pm.hasDashboard) signals.hasDemo = true;
    if (pm.hasPWA) signals.hasApp = true;
    if (pm.githubLink) signals.hasSourceCode = true;

    // Traction signals from website content
    if (pm.hasTestimonials || pm.hasCustomerLogos) {
      signals.hasCustomers = true;
      signals.hasSocialProof = true;
    }
    if (pm.socialLinks.length >= 2) signals.hasSocialProof = true;

    // Analytics detected
    if (techAudit.techStack.analytics.length > 0) signals.hasAnalytics = true;

    // Payment integration detected — indicates revenue capability
    // NOTE: Payment JS on a page != confirmed revenue. We set hasProduct but
    // do NOT upgrade revenueBand automatically. Revenue needs transaction proof.
    if (techAudit.techStack.payments.length > 0) {
      signals.hasProduct = true;
    }

    // Tech moat signals
    const ts = techAudit.techStack;
    const isGenericCMS = ts.cms === "Wix" || ts.cms === "Squarespace";
    if (!isGenericCMS && ts.frameworks.length > 0) {
      // Custom-built product = stronger technical moat
      signals.hasMoat = signals.hasMoat || ts.frameworks.length >= 2;
      signals.hasSwitchingCosts = signals.hasSwitchingCosts || (pm.hasLoginForm && pm.hasDashboard);
    }

    // API sophistication = data advantage signal
    if (techAudit.evidenceLabels.some((l) => l.includes("GraphQL") || l.includes("/api/v"))) {
      signals.hasDataAdvantage = true;
    }
  }

  // ── GitHub repo audit overlay: deep codebase analysis → auto-populate signals ─
  if (repoAudit) {
    signals.hasSourceCode = true;
    signals.hasProduct = true;

    // Upgrade evidence level — machine-verified codebase analysis
    if (signals.evidenceLevel === "self_declared" || signals.evidenceLevel === "public_url") {
      signals.evidenceLevel = "connected_source";
    }

    // Architecture signals → product maturity
    const arch = repoAudit.architecture;
    if (arch.frameworks.length > 0) signals.hasProduct = true;
    if (arch.hasTypescript) signals.hasProduct = true;

    // CI/CD → demo/deployment = product is live
    if (repoAudit.cicd.hasCD) signals.hasDemo = true;

    // Testing → product quality
    if (repoAudit.testing.estimatedTestMaturity === "comprehensive" || repoAudit.testing.estimatedTestMaturity === "moderate") {
      signals.hasDemo = true;
    }

    // Activity → traction
    if (repoAudit.activity.isActivelyMaintained) {
      signals.hasSocialProof = signals.hasSocialProof || repoAudit.activity.starsCount >= 10;
    }
    if (repoAudit.activity.commitFrequencyTier === "intense" || repoAudit.activity.commitFrequencyTier === "strong") {
      signals.hasAnalytics = true;  // Strong activity = measurable traction
    }

    // Multi-contributor = team signal
    if (repoAudit.activity.contributors >= 2) {
      signals.hasCoFounder = signals.hasCoFounder || repoAudit.activity.contributors >= 2;
    }
    if (repoAudit.activity.contributors >= 3) {
      signals.hasAdvisors = true;  // 3+ contributors = team depth
    }

    // Tech moat signals from codebase analysis
    if (arch.hasMonorepo && arch.frameworks.length >= 2) {
      signals.hasMoat = true;
      signals.hasSwitchingCosts = true;
    }
    if (repoAudit.dependencies.notableLibs.some((l) =>
      l.includes("AI") || l.includes("OpenAI") || l.includes("Anthropic") || l.includes("TensorFlow") || l.includes("LangChain")
    )) {
      signals.hasDataAdvantage = true;
    }

    // Documentation → investor readiness
    if (repoAudit.documentation.hasApiDocs) {
      signals.hasProduct = true;
    }
  }

  return signals;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (v: number, min = 0, max = Infinity) => Math.max(min, Math.min(max, v));

function calcPercentileRank(
  svi: number,
  stage: number,
): number {
  const band = SVI_BENCHMARKS[stage];
  if (!band) return 50;
  if (svi >= band.p90) return 90;
  if (svi >= band.p75) return 75;
  if (svi >= band.p50) return 50;
  if (svi >= band.p25) return 25;
  return 10;
}

// ─── SVI v2 computation ───────────────────────────────────────────────────────
export function computeSVI(
  signals: SVIExtractedSignals,
  weeklyDelta?: number,
  techAuditBoosts?: { ptdBoost: number; svmBoost: number; treBoost: number; lcoBoost: number },
  repoAuditBoosts?: { ptdBoost: number; svmBoost: number; ftvBoost: number; treBoost: number },
): SVIAnalysis {
  const confidence = EVIDENCE_CONFIDENCE[signals.evidenceLevel] ?? 0.20;

  // ── Dimension 1: FTV — Founder & Team Value (15%) ──────────────────────────
  let ftvRaw = 50;
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

  // Repo audit boost for FTV (engineering team quality)
  if (repoAuditBoosts && repoAuditBoosts.ftvBoost !== 0) {
    ftvRaw += repoAuditBoosts.ftvBoost;
    if (repoAuditBoosts.ftvBoost > 0) ftvEvidence.push(`Code audit: +${repoAuditBoosts.ftvBoost} (team quality, testing, CI/CD maturity)`);
    else ftvEvidence.push(`Code audit: ${repoAuditBoosts.ftvBoost} (engineering gaps detected)`);
  }

  const ftvScore = clamp(ftvRaw, 0, 100);
  const ftvAdj = Math.round((ftvScore - 50) * 0.15 * confidence);

  // ── Dimension 2: MPC — Market & Problem Clarity (18%) ─────────────────────
  let mpcRaw = 50;
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
  const mpcAdj = Math.round((mpcScore - 50) * 0.18 * confidence);

  // ── Dimension 3: PTD — Product & Technical Depth (12%) ────────────────────
  let ptdRaw = 50;
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

  // Tech audit boost for PTD
  if (techAuditBoosts && techAuditBoosts.ptdBoost !== 0) {
    ptdRaw += techAuditBoosts.ptdBoost;
    if (techAuditBoosts.ptdBoost > 0) ptdEvidence.push(`Tech audit: +${techAuditBoosts.ptdBoost} (security, performance, stack)`);
    else ptdEvidence.push(`Tech audit: ${techAuditBoosts.ptdBoost} (technical gaps detected)`);
  }

  // Repo audit boost for PTD (architecture, CI/CD, testing, code quality)
  if (repoAuditBoosts && repoAuditBoosts.ptdBoost !== 0) {
    ptdRaw += repoAuditBoosts.ptdBoost;
    if (repoAuditBoosts.ptdBoost > 0) ptdEvidence.push(`Code audit: +${repoAuditBoosts.ptdBoost} (architecture, CI/CD, testing)`);
    else ptdEvidence.push(`Code audit: ${repoAuditBoosts.ptdBoost} (codebase gaps detected)`);
  }

  const ptdScore = clamp(ptdRaw, 0, 100);
  const ptdAdj = Math.round((ptdScore - 50) * 0.12 * confidence);

  // ── Dimension 4: TRE — Traction & Revenue Evidence (20%) ─────────────────
  let treRaw = 30;
  const treEvidence: string[] = [];
  const treGaps: string[] = [];

  if (signals.revenueBand === "scaling") {
    treRaw = 90; treEvidence.push("Scaling revenue ($1M+ ARR range)");
  } else if (signals.revenueBand === "growing") {
    treRaw = 70; treEvidence.push("Growing revenue ($100k–$500k ARR range)");
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

  // Tech audit boost for TRE
  if (techAuditBoosts && techAuditBoosts.treBoost > 0) {
    treRaw = Math.min(100, treRaw + techAuditBoosts.treBoost);
    treEvidence.push(`Tech audit: +${techAuditBoosts.treBoost} (social/analytics/testimonials)`);
  }

  // Repo audit boost for TRE (commit activity, stars, forks)
  if (repoAuditBoosts && repoAuditBoosts.treBoost > 0) {
    treRaw = Math.min(100, treRaw + repoAuditBoosts.treBoost);
    treEvidence.push(`Code audit: +${repoAuditBoosts.treBoost} (commit activity, community traction)`);
  }

  const treScore = clamp(treRaw, 0, 100);
  const treAdj = Math.round((treScore - 50) * 0.20 * confidence);

  // ── Dimension 5: CGH — Cap Table & Governance Health (12%) ───────────────
  let cghRaw = 40;
  const cghEvidence: string[] = [];
  const cghGaps: string[] = [];

  if (signals.hasCapTable) { cghRaw += 20; cghEvidence.push("Cap table referenced"); }
  else { cghGaps.push("Create a cap table with founder equity split"); }

  if (signals.hasVesting) { cghRaw += 15; cghEvidence.push("Vesting schedule in place"); }
  else { cghGaps.push("Add founder vesting (standard: 4 years, 1 year cliff)"); }

  if (signals.hasShareholdersAgreement) { cghRaw += 15; cghEvidence.push("Shareholders agreement referenced"); }
  else { cghGaps.push("Create a shareholders agreement (SHA)"); }

  if (signals.esopAllocated) { cghRaw += 10; cghEvidence.push("ESOP/option pool allocated"); }
  else { cghGaps.push("Allocate ESOP pool (8–15% is standard AU seed)"); }

  if (signals.hasBoardCadence) { cghRaw += 10; cghEvidence.push("Regular board cadence established"); }
  else { cghGaps.push("Establish quarterly board meetings with minutes"); }

  if (signals.hasFinancialAudit) { cghRaw += 15; cghEvidence.push("Financial audit completed"); }

  const cghScore = clamp(cghRaw, 0, 100);
  const cghAdj = Math.round((cghScore - 50) * 0.12 * confidence);

  // ── Dimension 6: IRI — Investor Readiness Index (10%) ────────────────────
  let iriRaw = 40;
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
  const iriAdj = Math.round((iriScore - 50) * 0.10 * confidence);

  // ── Dimension 7: LCO — Legal & Compliance (8%) ───────────────────────────
  let lcoRaw = 40;
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

  // Tech audit boost for LCO (security headers = compliance maturity)
  if (techAuditBoosts && techAuditBoosts.lcoBoost > 0) {
    lcoRaw += techAuditBoosts.lcoBoost;
    lcoEvidence.push(`Tech audit: +${techAuditBoosts.lcoBoost} (HTTPS + security headers)`);
  }

  const lcoScore = clamp(lcoRaw, 0, 100);
  const lcoAdj = Math.round((lcoScore - 50) * 0.08 * confidence);

  // ── Dimension 8: SVM — Strategic Vision & Moat (5%) ──────────────────────
  let svmRaw = 35;
  const svmEvidence: string[] = [];
  const svmGaps: string[] = [];

  if (signals.hasMoat) { svmRaw += 35; svmEvidence.push("Defensible moat or competitive advantage identified"); }
  else { svmGaps.push("Articulate your defensible advantage (data, network, switching cost)"); }

  if (signals.hasNetworkEffect) { svmRaw += 20; svmEvidence.push("Network effect present"); }

  if (signals.hasDataAdvantage) { svmRaw += 15; svmEvidence.push("Proprietary data advantage identified"); }

  if (signals.hasSwitchingCosts) { svmRaw += 15; svmEvidence.push("Switching costs or lock-in mechanism present"); }

  // Tech audit boost for SVM (custom tech stack = moat)
  if (techAuditBoosts && techAuditBoosts.svmBoost !== 0) {
    svmRaw += techAuditBoosts.svmBoost;
    if (techAuditBoosts.svmBoost > 0) svmEvidence.push(`Tech audit: +${techAuditBoosts.svmBoost} (custom stack, API depth)`);
    else svmEvidence.push(`Tech audit: ${techAuditBoosts.svmBoost} (generic CMS, low tech moat)`);
  }

  // Repo audit boost for SVM (proprietary tech, AI/ML, infrastructure)
  if (repoAuditBoosts && repoAuditBoosts.svmBoost > 0) {
    svmRaw += repoAuditBoosts.svmBoost;
    svmEvidence.push(`Code audit: +${repoAuditBoosts.svmBoost} (proprietary stack, notable libs, infra-as-code)`);
  }

  const svmScore = clamp(svmRaw, 0, 100);
  const svmAdj = Math.round((svmScore - 50) * 0.05 * confidence);

  // ── Stage detection ─────────────────────────────────────────────────────────
  const stage = detectStage(signals);
  const stageLabel = SVI_STAGE_LABELS[stage] ?? "Concept";
  const stageBonus = STAGE_BONUSES[stage] ?? 0;

  // ── 15 Risk penalties ────────────────────────────────────────────────────────
  const riskPenalties: RiskPenalty[] = [];

  if (signals.isAIWrapper && !signals.hasMoat) {
    riskPenalties.push({
      label: "AI Wrapper Risk",
      points: 15,
      reason: "Idea appears to wrap an existing AI model without proprietary data, workflow or network moat. Very easy to replicate.",
    });
  }
  if (signals.founderExperience === "first-time" && !signals.hasCoFounder && !signals.hasAdvisors) {
    riskPenalties.push({
      label: "No Founder Background",
      points: 8,
      reason: "No founder experience, co-founder, or advisors identified. Solo first-time founders face significantly higher execution risk.",
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
      label: "No Cap Table",
      points: 12,
      reason: "No cap table or shareholders agreement mentioned. Bad equity splits early are the #1 cause of startup failure.",
    });
  }
  if (signals.evidenceLevel === "self_declared") {
    riskPenalties.push({
      label: "Unverified Claims Only",
      points: 8,
      reason: "All information is self-declared with no external evidence. Confidence score significantly reduced.",
    });
  }
  if (!signals.hasCoFounder && stage >= 4) {
    riskPenalties.push({
      label: "Solo Founder at Growth Stage",
      points: 5,
      reason: "Solo founder operating at growth/revenue stage. Execution risk increases significantly without complementary co-founder.",
    });
  }
  if (!signals.hasLegalDocs && !signals.hasContracts) {
    riskPenalties.push({
      label: "No Legal Documents",
      points: 10,
      reason: "No legal documentation, contracts, or ToS mentioned. Operating without legal scaffolding increases liability and investor risk.",
    });
  }
  if (signals.problemClarity === "vague") {
    riskPenalties.push({
      label: "Vague Problem Statement",
      points: 8,
      reason: "The problem being solved is not clearly articulated. Investors fund clear, validated problems.",
    });
  }
  if (!signals.hasProduct && !signals.hasDemo && stage >= 1) {
    riskPenalties.push({
      label: "No Product at Validated Idea Stage",
      points: 5,
      reason: "Problem is identified but no product, demo, or prototype has been built yet.",
    });
  }
  if (!signals.hasFinancialModel && !signals.hasRevenue) {
    riskPenalties.push({
      label: "No Revenue Model",
      points: 7,
      reason: "No financial model or revenue path described. Investors need to understand how the business makes money.",
    });
  }
  if (!signals.hasCoFounder && !signals.hasCapTable && stage >= 3) {
    riskPenalties.push({
      label: "Concentrated Cap Table Risk",
      points: 8,
      reason: "Implied 100% founder ownership at traction stage with no cap table. High concentration risk deters investors.",
    });
  }
  if (!signals.hasAdvisors && stage >= 6) {
    riskPenalties.push({
      label: "No Advisors at Scale Stage",
      points: 5,
      reason: "No advisors mentioned at scale stage. Strategic advisors are critical for navigating growth challenges.",
    });
  }
  if (!signals.hasAnalytics && stage >= 3) {
    riskPenalties.push({
      label: "No Analytics at Traction Stage",
      points: 6,
      reason: "No analytics or measurement tools detected at early traction stage. Can't demonstrate or optimise growth without data.",
    });
  }
  if (!signals.hasPitchDeck && stage >= 4) {
    riskPenalties.push({
      label: "No Pitch Deck at Investor-Ready Stage",
      points: 8,
      reason: "No pitch deck found at revenue/growth stage. A pitch deck is essential to communicate value proposition to investors.",
    });
  }
  if (!signals.hasMoat && !signals.hasNetworkEffect && !signals.hasDataAdvantage) {
    riskPenalties.push({
      label: "Undefined Competitive Advantage",
      points: 6,
      reason: "No moat, network effect, or data advantage identified. Sustainable businesses require clear defensibility.",
    });
  }

  const totalPenalty = riskPenalties.reduce((s, r) => s + r.points, 0);

  // ── SVI total ───────────────────────────────────────────────────────────────
  const netAdj = ftvAdj + mpcAdj + ptdAdj + treAdj + cghAdj + iriAdj + lcoAdj + svmAdj;
  // SVI is an open-ended index (0+ range) — like a stock market index, it grows without limit
  const totalSVI = Math.round(Math.max(0, 100 + netAdj + stageBonus - totalPenalty));

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
    evidenceGaps.push({ priority: "P0", label: "Add first revenue proof", action: "Connect Stripe, upload invoice, or add customer contract", impact: 18, evidenceType: "transaction_data" });
  }
  if (signals.evidenceLevel === "self_declared") {
    evidenceGaps.push({ priority: "P0", label: "Upgrade evidence level", action: "Add public URL, upload documents, or connect source (GitHub, analytics, Stripe)", impact: 15, evidenceType: "public_url" });
  }
  if (!signals.hasCapTable) {
    evidenceGaps.push({ priority: "P0", label: "Create cap table", action: "Build a cap table with founder shares, vesting, and ESOP pool", impact: 12, evidenceType: "document_uploaded" });
  }
  if (!signals.hasABN) {
    evidenceGaps.push({ priority: "P0", label: "Register ABN/ASIC", action: "Register your company with ASIC and obtain an Australian Business Number", impact: 10, evidenceType: "document_uploaded" });
  }
  if (!signals.hasSourceCode) {
    evidenceGaps.push({ priority: "P1", label: "Link source code repository", action: "Connect GitHub or GitLab to verify product progress", impact: 10, evidenceType: "connected_source" });
  }
  if (!signals.hasWebsite) {
    evidenceGaps.push({ priority: "P1", label: "Create public website", action: "Build a landing page to prove market presence and collect leads", impact: 8, evidenceType: "public_url" });
  }
  if (!signals.hasPitchDeck) {
    evidenceGaps.push({ priority: "P1", label: "Upload pitch deck", action: "Upload a pitch deck to the Evidence Vault", impact: 8, evidenceType: "document_uploaded" });
  }
  if (!signals.hasIPProtection) {
    evidenceGaps.push({ priority: "P1", label: "Secure IP protection", action: "File a provisional patent or trademark to protect your core innovation", impact: 7, evidenceType: "document_uploaded" });
  }
  if (!signals.hasFinancialModel) {
    evidenceGaps.push({ priority: "P2", label: "Upload financial model", action: "Add a financial model (even a basic P&L forecast) to the Evidence Vault", impact: 6, evidenceType: "document_uploaded" });
  }
  if (!signals.hasAnalytics) {
    evidenceGaps.push({ priority: "P2", label: "Connect analytics", action: "Connect Google Analytics or Search Console to verify traffic/traction", impact: 8, evidenceType: "connected_source" });
  }
  if (!signals.hasAdvisors) {
    evidenceGaps.push({ priority: "P2", label: "Add named advisors", action: "Engage 1–2 industry advisors with relevant domain expertise and list them in your materials", impact: 5, evidenceType: "self_declared" });
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
    netAdjustment: netAdj + stageBonus - totalPenalty,
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
  };
}
