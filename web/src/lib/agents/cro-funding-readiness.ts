// CRO Funding Readiness Scoring (T0124).
//
// Pure-logic scorer that turns a founder's current state into an investor
// readiness score on the SCN CAPITAL layer. Six pillars are graded against
// stage-aware AU benchmarks and combined into an overall 0-100 score with
// a verdict band and prioritised actions.
//
// Designed to be importable from the SCN action plan (capital section) and
// from the fundraising readiness report without any UI / network dependency.
// Mirrors the shape used by cfo-projection-norms / cfo-esop-scoring so the
// report pipeline can render it consistently.

export type FundingStage = "pre-seed" | "seed" | "series-a" | "series-b";

export type ReadinessVerdict = "investor-ready" | "near-ready" | "warming-up" | "not-ready";

export type PillarKey =
  | "traction"
  | "team"
  | "governance"
  | "data_room"
  | "investor_materials"
  | "stage_fit";

export interface FundingReadinessInput {
  stage: FundingStage;
  /** Monthly recurring revenue in AUD (use 0 for pre-revenue). */
  mrrAud?: number;
  /** Total active users / customers. */
  users?: number;
  /** Month-over-month revenue growth %. */
  monthlyGrowthPct?: number;
  /** Self-rated team strength signal 0-100 (e.g. Antler team signal). */
  teamSignal?: number;
  /** True if at least one co-founder is technical / has ship history. */
  hasTechnicalFounder?: boolean;
  /** True if founders have signed vesting (typically 4yr / 1yr cliff). */
  hasFounderVesting?: boolean;
  /** True if a Shareholders Agreement is in place. */
  hasShareholdersAgreement?: boolean;
  /** ESOP pool size as % of total shares (12% is the AU standard). */
  esopPoolPct?: number;
  /** % of the 13-section data room that is populated. */
  dataRoomPct?: number;
  /** True if a current pitch deck (≤6 months old) exists. */
  hasPitchDeck?: boolean;
  /** True if a 36-month financial model exists. */
  hasFinancialModel?: boolean;
  /** True if a clear use-of-funds breakdown exists for the next raise. */
  hasUseOfFunds?: boolean;
  /** True if at least one warm investor intro is logged in CRM. */
  hasWarmIntros?: boolean;
}

export interface PillarScore {
  key: PillarKey;
  label: string;
  score: number;          // 0-100
  weight: number;         // 0-1
  weighted: number;       // score * weight
  verdict: ReadinessVerdict;
  reasoning: string;
}

export interface FundingReadinessAction {
  priority: 1 | 2 | 3;
  pillar: PillarKey;
  action: string;
  effort: "low" | "medium" | "high";
  impactPoints: number;   // expected lift on the overall score (0-100 scale)
}

export interface FundingReadinessResult {
  stage: FundingStage;
  overall: number;                 // 0-100
  verdict: ReadinessVerdict;
  pillars: PillarScore[];
  topGaps: PillarScore[];          // weakest 3 pillars
  actions: FundingReadinessAction[];
  summary: string;
}

// ─── Stage-aware weights ───────────────────────────────────────────────────
// Earlier stages weight team + governance more heavily; later stages weight
// traction. Weights for each stage sum to 1.0.
const STAGE_WEIGHTS: Record<FundingStage, Record<PillarKey, number>> = {
  "pre-seed": {
    traction: 0.10,
    team: 0.30,
    governance: 0.20,
    data_room: 0.10,
    investor_materials: 0.20,
    stage_fit: 0.10,
  },
  seed: {
    traction: 0.25,
    team: 0.20,
    governance: 0.15,
    data_room: 0.15,
    investor_materials: 0.15,
    stage_fit: 0.10,
  },
  "series-a": {
    traction: 0.35,
    team: 0.15,
    governance: 0.15,
    data_room: 0.15,
    investor_materials: 0.10,
    stage_fit: 0.10,
  },
  "series-b": {
    traction: 0.40,
    team: 0.10,
    governance: 0.15,
    data_room: 0.15,
    investor_materials: 0.10,
    stage_fit: 0.10,
  },
};

const PILLAR_LABELS: Record<PillarKey, string> = {
  traction: "Traction",
  team: "Team",
  governance: "Governance",
  data_room: "Data Room",
  investor_materials: "Investor Materials",
  stage_fit: "Stage Fit",
};

// ─── Pillar scorers ────────────────────────────────────────────────────────

function scoreTraction(input: FundingReadinessInput): { score: number; reasoning: string } {
  const mrr = input.mrrAud ?? 0;
  const users = input.users ?? 0;
  const growth = input.monthlyGrowthPct ?? 0;

  let score = 0;
  const notes: string[] = [];

  // Stage-aware MRR thresholds — AU averages: pre-seed pre-revenue OK,
  // seed wants ≥$10k MRR, Series A wants ≥$83k MRR ($1m ARR).
  const targetMrr: Record<FundingStage, number> = {
    "pre-seed": 0,
    seed: 10_000,
    "series-a": 83_000,
    "series-b": 250_000,
  };
  const target = targetMrr[input.stage];
  if (target === 0) {
    score += 30;
    notes.push("Pre-revenue acceptable at pre-seed");
  } else {
    const pct = Math.min(1, mrr / target);
    score += Math.round(pct * 40);
    notes.push(`MRR A$${Math.round(mrr).toLocaleString()} / target A$${target.toLocaleString()}`);
  }

  // Growth — 15%/mo is healthy at pre-seed/seed, 10% Series A, 8% Series B.
  const targetGrowth: Record<FundingStage, number> = {
    "pre-seed": 15,
    seed: 15,
    "series-a": 10,
    "series-b": 8,
  };
  const gt = targetGrowth[input.stage];
  const gPct = Math.min(1, Math.max(0, growth) / gt);
  score += Math.round(gPct * 30);
  notes.push(`Growth ${growth}%/mo (target ${gt}%)`);

  // Users
  if (users > 1000) score += 30;
  else if (users > 100) score += 20;
  else if (users > 10) score += 10;
  notes.push(`${users.toLocaleString()} users`);

  return { score: Math.min(100, score), reasoning: notes.join("; ") };
}

function scoreTeam(input: FundingReadinessInput): { score: number; reasoning: string } {
  const signal = clamp01to100(input.teamSignal ?? 0);
  let score = Math.round(signal * 0.6);
  const notes: string[] = [`Team signal ${signal}/100`];
  if (input.hasTechnicalFounder) {
    score += 25;
    notes.push("Technical co-founder present");
  } else {
    notes.push("No technical co-founder");
  }
  if (input.hasFounderVesting) {
    score += 15;
    notes.push("Founder vesting in place");
  } else {
    notes.push("Founder vesting missing");
  }
  return { score: Math.min(100, score), reasoning: notes.join("; ") };
}

function scoreGovernance(input: FundingReadinessInput): { score: number; reasoning: string } {
  let score = 0;
  const notes: string[] = [];
  if (input.hasShareholdersAgreement) {
    score += 35;
    notes.push("SHA signed");
  } else {
    notes.push("No SHA");
  }
  if (input.hasFounderVesting) {
    score += 25;
    notes.push("Founder vesting");
  } else {
    notes.push("Founder vesting missing");
  }
  const pool = input.esopPoolPct ?? 0;
  if (pool >= 10 && pool <= 20) {
    score += 40;
    notes.push(`ESOP pool ${pool}% (in-range)`);
  } else if (pool > 0) {
    score += 20;
    notes.push(`ESOP pool ${pool}% (off-target — AU standard is 10–15%)`);
  } else {
    notes.push("No ESOP pool");
  }
  return { score: Math.min(100, score), reasoning: notes.join("; ") };
}

function scoreDataRoom(input: FundingReadinessInput): { score: number; reasoning: string } {
  const pct = clamp01to100(input.dataRoomPct ?? 0);
  return { score: pct, reasoning: `Data room ${pct}% complete (13-section AU template)` };
}

function scoreInvestorMaterials(input: FundingReadinessInput): { score: number; reasoning: string } {
  let score = 0;
  const notes: string[] = [];
  if (input.hasPitchDeck) {
    score += 40;
    notes.push("Pitch deck");
  } else {
    notes.push("No current pitch deck");
  }
  if (input.hasFinancialModel) {
    score += 35;
    notes.push("36-month financial model");
  } else {
    notes.push("No financial model");
  }
  if (input.hasUseOfFunds) {
    score += 15;
    notes.push("Use-of-funds defined");
  }
  if (input.hasWarmIntros) {
    score += 10;
    notes.push("Warm investor intros logged");
  }
  return { score: Math.min(100, score), reasoning: notes.join("; ") };
}

function scoreStageFit(input: FundingReadinessInput): { score: number; reasoning: string } {
  // "Are you raising at the right stage for your metrics?"
  // Penalise raising Series A with pre-seed traction; reward stage-appropriate metrics.
  const mrr = input.mrrAud ?? 0;
  const arr = mrr * 12;
  const expected: Record<FundingStage, { min: number; ideal: number }> = {
    "pre-seed": { min: 0, ideal: 0 },
    seed: { min: 60_000, ideal: 240_000 },
    "series-a": { min: 600_000, ideal: 1_000_000 },
    "series-b": { min: 2_000_000, ideal: 5_000_000 },
  };
  const { min, ideal } = expected[input.stage];
  if (ideal === 0) {
    return { score: 80, reasoning: "Pre-seed — stage fit is conviction-driven" };
  }
  if (arr >= ideal) {
    return { score: 100, reasoning: `ARR A$${Math.round(arr).toLocaleString()} ≥ ideal A$${ideal.toLocaleString()}` };
  }
  if (arr >= min) {
    const within = (arr - min) / (ideal - min);
    const score = Math.round(60 + within * 40);
    return { score, reasoning: `ARR A$${Math.round(arr).toLocaleString()} in stage band (min A$${min.toLocaleString()})` };
  }
  const ratio = min > 0 ? arr / min : 0;
  return {
    score: Math.round(ratio * 50),
    reasoning: `ARR A$${Math.round(arr).toLocaleString()} below ${input.stage} minimum A$${min.toLocaleString()} — consider raising at a lower stage`,
  };
}

// ─── Action generator ──────────────────────────────────────────────────────

function actionsFor(pillar: PillarScore, input: FundingReadinessInput): FundingReadinessAction[] {
  const out: FundingReadinessAction[] = [];
  switch (pillar.key) {
    case "governance":
      if (!input.hasShareholdersAgreement) {
        out.push({
          priority: 1,
          pillar: "governance",
          action: "Sign a Shareholders Agreement (use the AU standard template in the data room)",
          effort: "medium",
          impactPoints: 6,
        });
      }
      if (!input.hasFounderVesting) {
        out.push({
          priority: 1,
          pillar: "governance",
          action: "Put founder vesting in place (4-year vest, 1-year cliff)",
          effort: "low",
          impactPoints: 4,
        });
      }
      if ((input.esopPoolPct ?? 0) < 10) {
        out.push({
          priority: 2,
          pillar: "governance",
          action: "Top the ESOP pool up to 10–15% (AU standard) before the next priced round",
          effort: "medium",
          impactPoints: 5,
        });
      }
      break;
    case "investor_materials":
      if (!input.hasPitchDeck) {
        out.push({
          priority: 1,
          pillar: "investor_materials",
          action: "Build a 12-slide pitch deck from the SVI report (auto-generated)",
          effort: "low",
          impactPoints: 6,
        });
      }
      if (!input.hasFinancialModel) {
        out.push({
          priority: 1,
          pillar: "investor_materials",
          action: "Generate the 36-month financial model from /dashboard/valuation",
          effort: "low",
          impactPoints: 5,
        });
      }
      if (!input.hasUseOfFunds) {
        out.push({
          priority: 2,
          pillar: "investor_materials",
          action: "Document a clear use-of-funds breakdown for the next raise",
          effort: "low",
          impactPoints: 2,
        });
      }
      break;
    case "data_room":
      out.push({
        priority: 2,
        pillar: "data_room",
        action: "Lift the 13-section data room above 80% complete (Legal, Financials, Cap Table priority)",
        effort: "medium",
        impactPoints: Math.max(2, Math.round((80 - (input.dataRoomPct ?? 0)) * pillar.weight)),
      });
      break;
    case "team":
      if (!input.hasTechnicalFounder) {
        out.push({
          priority: 1,
          pillar: "team",
          action: "Recruit a technical co-founder or document the CTO succession plan",
          effort: "high",
          impactPoints: 8,
        });
      }
      break;
    case "traction":
      out.push({
        priority: 2,
        pillar: "traction",
        action: "Wire MRR + active-user counters into Evidence Vault to keep traction signals current",
        effort: "low",
        impactPoints: 4,
      });
      break;
    case "stage_fit":
      if (pillar.score < 60) {
        out.push({
          priority: 1,
          pillar: "stage_fit",
          action: `Re-target this raise as ${stepDownStage(input.stage)} — your metrics fit one stage earlier`,
          effort: "low",
          impactPoints: 7,
        });
      }
      break;
  }
  return out;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function scoreFundingReadiness(input: FundingReadinessInput): FundingReadinessResult {
  const weights = STAGE_WEIGHTS[input.stage];

  const tractionR = scoreTraction(input);
  const teamR = scoreTeam(input);
  const govR = scoreGovernance(input);
  const drR = scoreDataRoom(input);
  const matR = scoreInvestorMaterials(input);
  const sfR = scoreStageFit(input);

  const pillars: PillarScore[] = [
    pillar("traction", tractionR.score, weights.traction, tractionR.reasoning),
    pillar("team", teamR.score, weights.team, teamR.reasoning),
    pillar("governance", govR.score, weights.governance, govR.reasoning),
    pillar("data_room", drR.score, weights.data_room, drR.reasoning),
    pillar("investor_materials", matR.score, weights.investor_materials, matR.reasoning),
    pillar("stage_fit", sfR.score, weights.stage_fit, sfR.reasoning),
  ];

  const overall = Math.round(pillars.reduce((sum, p) => sum + p.weighted, 0));
  const verdict = verdictFor(overall);

  const topGaps = [...pillars].sort((a, b) => a.score - b.score).slice(0, 3);

  const actions: FundingReadinessAction[] = [];
  for (const p of topGaps) actions.push(...actionsFor(p, input));
  actions.sort((a, b) => a.priority - b.priority || b.impactPoints - a.impactPoints);

  const summary =
    `Funding readiness ${overall}/100 (${verdict}). ` +
    `Strongest pillar: ${strongest(pillars).label}. ` +
    `Weakest pillar: ${topGaps[0].label} (${topGaps[0].score}/100).`;

  return {
    stage: input.stage,
    overall,
    verdict,
    pillars,
    topGaps,
    actions: actions.slice(0, 6),
    summary,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function pillar(key: PillarKey, score: number, weight: number, reasoning: string): PillarScore {
  const safe = clamp01to100(score);
  return {
    key,
    label: PILLAR_LABELS[key],
    score: safe,
    weight,
    weighted: safe * weight,
    verdict: verdictFor(safe),
    reasoning,
  };
}

function verdictFor(score: number): ReadinessVerdict {
  if (score >= 80) return "investor-ready";
  if (score >= 65) return "near-ready";
  if (score >= 45) return "warming-up";
  return "not-ready";
}

function strongest(pillars: PillarScore[]): PillarScore {
  return [...pillars].sort((a, b) => b.score - a.score)[0];
}

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function stepDownStage(stage: FundingStage): FundingStage {
  switch (stage) {
    case "series-b": return "series-a";
    case "series-a": return "seed";
    case "seed": return "pre-seed";
    case "pre-seed": return "pre-seed";
  }
}
