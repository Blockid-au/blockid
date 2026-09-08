// Context detector — composes existing SVI signals + maturity detector +
// growth-phase mapping into a single `IntakeContext` used by the agent
// selector to pick the right wave/agent set.

import "server-only";

import { detectStage, type SVIExtractedSignals } from "@/lib/svi-analysis";
import {
  detectMaturity,
  type MaturityLevel,
} from "@/lib/agents/maturity-detector";
import {
  GROWTH_PHASES,
  getCurrentPhase,
} from "@/lib/startup-growth-phases";

export interface IntakeContext {
  /** SVI stage (0-7). */
  stage: number;
  /** 1-based growth-phase order (matches GROWTH_PHASES[i].order). */
  growthPhase: number;
  /** Growth-phase id (string, e.g. "vision", "customer_dev"). */
  growthPhaseId: string;
  /** Maturity level from the maturity-detector heuristics. */
  maturity: MaturityLevel;
  /** Composite completeness score across FTV/MPC/PTD/TRE/CGH/IRI/LCO/SVM signals. */
  evidenceCompleteness: number; // 0..1
  /** Human-readable list of missing signals — used by UI + selector. */
  missingSignals: string[];
}

// Weightings roughly mirror the SVI dimension weights so completeness reflects
// where the founder's real gaps are, not just field counts.
const SIGNAL_WEIGHTS: Array<[keyof SVIExtractedSignals, number, string]> = [
  ["hasCoFounder", 0.05, "co-founder"],
  ["hasAdvisors", 0.03, "advisors"],
  ["hasCustomerInterviews", 0.06, "customer interviews"],
  ["hasProduct", 0.06, "product"],
  ["hasDemo", 0.05, "demo or prototype"],
  ["hasWebsite", 0.05, "website"],
  ["hasSourceCode", 0.04, "source code"],
  ["hasCustomers", 0.08, "paying customers"],
  ["hasRevenue", 0.10, "revenue"],
  ["hasAnalytics", 0.05, "analytics"],
  ["hasSocialProof", 0.04, "social proof"],
  ["hasCapTable", 0.06, "cap table"],
  ["hasVesting", 0.04, "vesting schedule"],
  ["hasShareholdersAgreement", 0.03, "SHA"],
  ["hasPitchDeck", 0.05, "pitch deck"],
  ["hasFinancialModel", 0.05, "financial model"],
  ["hasDataRoom", 0.05, "data room"],
  ["hasABN", 0.03, "ABN"],
  ["hasIPProtection", 0.03, "IP protection"],
  ["hasContracts", 0.02, "contracts"],
  ["hasMoat", 0.03, "defensible moat"],
];

function maturityToGrowthPhase(maturity: MaturityLevel, sviStage: number): number {
  // Prefer the SVI stage → growth-phase mapping when available; fall back to
  // maturity buckets when SVI can't infer the stage.
  const phase = getCurrentPhase(sviStage);
  if (phase) return phase.order;
  switch (maturity) {
    case "idea": return 1;
    case "early": return 3;
    case "growth": return 6;
    case "scale": return 9;
    case "established": return 11;
    default: return 1;
  }
}

export interface DetectContextOptions {
  /** Optional URL — feeds the maturity detector's well-known allow-list. */
  url?: string;
  /** Optional scraped title/description/body (from `scrapeUrl`). */
  scraped?: { title?: string; description?: string; text?: string };
}

export function detectContext(
  signals: SVIExtractedSignals,
  rawText: string,
  options: DetectContextOptions = {},
): IntakeContext {
  const stage = detectStage(signals);

  const maturity = detectMaturity({
    url: options.url,
    scrapedTitle: options.scraped?.title,
    scrapedDescription: options.scraped?.description,
    scrapedText: options.scraped?.text,
    rawText,
  });

  const growthPhaseOrder = maturityToGrowthPhase(maturity.level, stage);
  const growthPhase = GROWTH_PHASES.find(p => p.order === growthPhaseOrder) ?? GROWTH_PHASES[0];

  const totalWeight = SIGNAL_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let earned = 0;
  const missing: string[] = [];
  for (const [key, weight, label] of SIGNAL_WEIGHTS) {
    if (signals[key]) {
      earned += weight;
    } else {
      missing.push(label);
    }
  }
  const evidenceCompleteness = totalWeight > 0
    ? Math.round((earned / totalWeight) * 100) / 100
    : 0;

  return {
    stage,
    growthPhase: growthPhase.order,
    growthPhaseId: growthPhase.id,
    maturity: maturity.level,
    evidenceCompleteness,
    missingSignals: missing.slice(0, 12),
  };
}
