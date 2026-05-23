// Startup Value Index (SVI) — Signal Extraction Engine
//
// Deterministic text parser that extracts structured boolean/enum signals
// from raw startup description text. Uses 50+ regex/keyword patterns.
// NO AI — pure computation.

import type { SVIExtractedSignals, SVITextInput, EvidenceItem, StartupMetricsInput } from "./types.js";
import { EVIDENCE_CONFIDENCE } from "./types.js";

// ─── Text parser: extract signals from raw input ──────────────────────────────
export function extractSignals(
  input: SVITextInput,
  _fileName?: string,
  evidenceItems?: EvidenceItem[],
  metrics?: StartupMetricsInput,
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

  // ── Metrics overlay: auto-set signals from real startup_metrics data ───────
  if (metrics) {
    const mrr = metrics.mrr ?? 0;
    const users = metrics.users_total ?? 0;
    const nps = metrics.nps ?? 0;

    // Revenue signals from actual MRR
    if (mrr > 0) {
      signals.hasRevenue = true;
      if (mrr > 10000 && (signals.revenueBand === "pre-revenue" || signals.revenueBand === "early" || signals.revenueBand === "growing")) {
        signals.revenueBand = "scaling";
      } else if (mrr > 1000 && (signals.revenueBand === "pre-revenue" || signals.revenueBand === "early")) {
        signals.revenueBand = "growing";
      } else if (signals.revenueBand === "pre-revenue") {
        signals.revenueBand = "early";
      }
    }

    // User signals from actual user count
    if (users > 0) {
      signals.hasCustomers = true;
    }

    // NPS signals — social proof from real customer satisfaction data
    if (nps > 0) {
      signals.hasSocialProof = true;
    }
  }

  return signals;
}
