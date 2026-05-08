// Deterministic Investor-Ready Score v2 (0–100) with five sub-scores.
// Documented heuristics — not a real DCF and not legal/financial advice.
// Tuned so a healthy seed-stage AU SaaS scores in the 80s and a fragile
// pre-seed scores in the 40s. v2 adds confidence, missing-data penalties,
// benchmark context, and founder action items.

export const SCORE_VERSION = "2.0.0";

export interface ScoreInput {
  // Step 1 — basics
  companyName: string;
  abn: string;
  sector: "saas" | "fintech" | "marketplace" | "devtools" | "other";
  stage?: "pre-seed" | "seed" | "series-a" | "growth" | "other";
  yearsTrading: number;

  // Step 2 — financials
  monthlyRevenue: number; // AUD
  monthlyBurn: number; // AUD
  runwayMonths: number;
  arrBand?: "pre-revenue" | "0-250k" | "250k-1m" | "1m-3m" | "3m-plus";
  targetRaiseAud?: number;
  valuationCapAud?: number;

  // Step 3 — cap table & docs
  founders: number;
  esopAllocated: number; // % allocated
  hasShareholdersAgreement: boolean;
  hasBoardMeetings: boolean;
  hasFinancialAudit: boolean;
}

export interface ScoreBreakdown {
  version: string;
  total: number;
  confidence: number;
  missingInputs: string[];
  actionPlan: {
    title: string;
    detail: string;
    impact: "high" | "medium" | "low";
  }[];
  benchmark: {
    label: string;
    medianScore: number;
    band: string;
    rationale: string;
  };
  subs: {
    label: string;
    value: number;
    rationale: string;
    evidence: string[];
  }[];
}

const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, v));

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const {
    monthlyRevenue,
    monthlyBurn,
    runwayMonths,
    founders,
    esopAllocated,
    yearsTrading,
    stage = "seed",
    targetRaiseAud = 0,
    hasShareholdersAgreement,
    hasBoardMeetings,
    hasFinancialAudit,
  } = input;

  // Financials: revenue scale + burn multiple + runway
  const revBand =
    monthlyRevenue >= 200000
      ? 60
      : monthlyRevenue >= 80000
        ? 48
        : monthlyRevenue >= 30000
          ? 36
          : monthlyRevenue >= 10000
            ? 24
            : monthlyRevenue > 0
              ? 14
              : 6;
  const burnMultiple = monthlyRevenue > 0 ? monthlyBurn / monthlyRevenue : 5;
  const burnPenalty =
    burnMultiple <= 1 ? 0 : burnMultiple <= 2 ? 6 : burnMultiple <= 3 ? 14 : 22;
  const runwayBoost =
    runwayMonths >= 18
      ? 22
      : runwayMonths >= 12
        ? 16
        : runwayMonths >= 6
          ? 10
          : runwayMonths >= 3
            ? 4
            : 0;
  const financials = clamp(revBand + runwayBoost - burnPenalty);

  // Cap table hygiene: founder count + ESOP discipline + SHA presence
  const founderBand =
    founders === 0 ? 25 : founders <= 2 ? 75 : founders <= 4 ? 70 : 55;
  const esopBand =
    esopAllocated >= 8 && esopAllocated <= 15
      ? 20
      : esopAllocated > 15 && esopAllocated <= 22
        ? 14
        : esopAllocated > 0
          ? 8
          : 0;
  const shaBand = hasShareholdersAgreement ? 10 : 0;
  const raiseFitPenalty = targetRaiseAud > 0 && monthlyRevenue > 0
    ? targetRaiseAud / Math.max(monthlyRevenue * 12, 1) > 3
      ? 5
      : 0
    : 0;
  const capTable = clamp(founderBand + esopBand + shaBand - 5 - raiseFitPenalty);

  // Governance: board meetings + audit + years
  const boardBand = hasBoardMeetings ? 35 : 5;
  const auditBand = hasFinancialAudit ? 35 : 8;
  const yearsBand = clamp(yearsTrading * 8, 0, 30);
  const governance = clamp(boardBand + auditBand + yearsBand - 8);

  // Founder background: synthesized from founder count + sector heat
  const sectorHeat: Record<ScoreInput["sector"], number> = {
    saas: 28,
    fintech: 26,
    devtools: 24,
    marketplace: 18,
    other: 14,
  };
  const stageBoost = stage === "seed" || stage === "series-a" ? 4 : 0;
  const founderBg = clamp(
    50 + sectorHeat[input.sector] + (founders > 1 ? 8 : 0) + stageBoost,
  );

  // Documentation: SHA + audit + ESOP + years coverage
  const docs = clamp(
    (hasShareholdersAgreement ? 30 : 5) +
      (hasFinancialAudit ? 25 : 5) +
      (esopAllocated > 0 ? 18 : 5) +
      clamp(yearsTrading * 6, 0, 22),
  );

  const missingInputs = getMissingInputs(input);
  const missingPenalty = Math.min(8, missingInputs.length * 2);
  const confidence = computeConfidence(input, missingInputs);
  const benchmark = buildBenchmark(input, financials);
  const subs = [
    {
      label: "Financials",
      value: clamp(financials - missingPenalty * 0.35),
      rationale: `${formatRevBand(monthlyRevenue)} revenue band, burn multiple ${burnMultiple.toFixed(1)}, ${runwayMonths}m runway.`,
      evidence: [
        `${formatRevBand(monthlyRevenue)} monthly revenue`,
        `${burnMultiple.toFixed(1)}x burn multiple`,
        `${runwayMonths} months runway`,
      ],
    },
    {
      label: "Cap Table Hygiene",
      value: clamp(capTable - missingPenalty * 0.25),
      rationale: `${founders} founders, ${esopAllocated}% ESOP allocated${hasShareholdersAgreement ? ", SHA in place" : ", no SHA on file"}.`,
      evidence: [
        `${founders} founder${founders === 1 ? "" : "s"}`,
        `${esopAllocated}% ESOP allocated`,
        hasShareholdersAgreement ? "Shareholders agreement present" : "Shareholders agreement missing",
      ],
    },
    {
      label: "Governance",
      value: clamp(governance - missingPenalty * 0.2),
      rationale: `${hasBoardMeetings ? "Regular" : "No"} board cadence; ${hasFinancialAudit ? "audited" : "unaudited"} financials; ${yearsTrading}y trading.`,
      evidence: [
        hasBoardMeetings ? "Regular board cadence" : "Board cadence missing",
        hasFinancialAudit ? "Audited financials" : "Unaudited financials",
        `${yearsTrading} years trading`,
      ],
    },
    {
      label: "Founder Background",
      value: founderBg,
      rationale: `Sector heat ${input.sector.toUpperCase()}; ${founders > 1 ? "co-founder" : "solo"} structure.`,
      evidence: [
        `${input.sector.toUpperCase()} sector`,
        `${stage} stage`,
        founders > 1 ? "Multi-founder team" : "Solo-founder structure",
      ],
    },
    {
      label: "Documentation",
      value: clamp(docs - missingPenalty * 0.5),
      rationale: `Doc coverage from SHA, audit, ESOP plan and trading history.`,
      evidence: [
        hasShareholdersAgreement ? "SHA present" : "SHA missing",
        hasFinancialAudit ? "Audit present" : "Audit missing",
        esopAllocated > 0 ? "ESOP pool recorded" : "ESOP pool missing",
      ],
    },
  ];

  const total = Math.round(clamp(
    subs.reduce((acc, s) => acc + s.value, 0) / subs.length - missingPenalty,
  ));

  return {
    version: SCORE_VERSION,
    total,
    confidence,
    missingInputs,
    actionPlan: buildActionPlan(input, subs, missingInputs),
    benchmark,
    subs,
  };
}

function formatRevBand(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M+`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

function getMissingInputs(input: ScoreInput): string[] {
  const missing: string[] = [];
  if (!input.abn?.trim()) missing.push("ABN not provided");
  if (!input.stage) missing.push("Funding stage not selected");
  if (!input.arrBand) missing.push("ARR band not selected");
  if (!input.targetRaiseAud || input.targetRaiseAud <= 0) {
    missing.push("Target raise not provided");
  }
  if (!input.valuationCapAud || input.valuationCapAud <= 0) {
    missing.push("Valuation or cap not provided");
  }
  if (!input.hasShareholdersAgreement) {
    missing.push("Shareholders agreement not confirmed");
  }
  if (!input.hasBoardMeetings) missing.push("Board cadence not confirmed");
  if (!input.hasFinancialAudit) missing.push("Audited financials not confirmed");
  return missing;
}

function computeConfidence(input: ScoreInput, missingInputs: string[]): number {
  let confidence = 92;
  confidence -= Math.min(32, missingInputs.length * 5);
  if (input.monthlyRevenue <= 0 && input.arrBand !== "pre-revenue") {
    confidence -= 8;
  }
  if (input.valuationCapAud && input.targetRaiseAud) {
    const raiseAsPctOfCap = input.targetRaiseAud / input.valuationCapAud;
    if (raiseAsPctOfCap > 0.35) confidence -= 6;
  }
  return Math.round(clamp(confidence, 35, 96));
}

function buildBenchmark(input: ScoreInput, financials: number) {
  const stageMedian: Record<NonNullable<ScoreInput["stage"]>, number> = {
    "pre-seed": 58,
    seed: 71,
    "series-a": 78,
    growth: 82,
    other: 66,
  };
  const stage = input.stage ?? "seed";
  const medianScore = stageMedian[stage];
  const band = financials >= 76
    ? "above current AU founder benchmark"
    : financials >= 58
      ? "within current AU founder benchmark"
      : "below current AU founder benchmark";
  return {
    label: `${stage} · ${input.sector.toUpperCase()}`,
    medianScore,
    band,
    rationale:
      "Benchmark is an internal heuristic until BlockID has enough verified AU company outcomes.",
  };
}

function buildActionPlan(
  input: ScoreInput,
  subs: ScoreBreakdown["subs"],
  missingInputs: string[],
): ScoreBreakdown["actionPlan"] {
  const actions: ScoreBreakdown["actionPlan"] = [];
  const weakest = [...subs].sort((a, b) => a.value - b.value)[0];

  if (missingInputs.length > 0) {
    actions.push({
      title: "Complete missing diligence inputs",
      detail: `Add ${missingInputs.slice(0, 3).join(", ")} to lift confidence before sharing with investors.`,
      impact: "high",
    });
  }
  if (!input.hasShareholdersAgreement) {
    actions.push({
      title: "Upload or confirm the shareholders agreement",
      detail: "Investors will check founder rights, transfer controls, vesting, drag/tag and dispute mechanics.",
      impact: "high",
    });
  }
  if (input.runwayMonths < 9) {
    actions.push({
      title: "Prepare a runway bridge narrative",
      detail: "Explain burn reduction, committed revenue, or bridge timing before investors ask about cash pressure.",
      impact: "high",
    });
  }
  if (input.esopAllocated < 8) {
    actions.push({
      title: "Review ESOP pool size before term-sheet negotiation",
      detail: "AU seed investors often expect an 8-15% post-money pool; clarify whether any top-up is pre-money.",
      impact: "medium",
    });
  }
  if (!input.hasBoardMeetings) {
    actions.push({
      title: "Create a board cadence record",
      detail: "Add recent minutes or quarterly founder updates to show governance maturity.",
      impact: "medium",
    });
  }
  if (actions.length < 3 && weakest) {
    actions.push({
      title: `Improve ${weakest.label}`,
      detail: weakest.rationale,
      impact: weakest.value < 60 ? "high" : "medium",
    });
  }
  return actions.slice(0, 5);
}
