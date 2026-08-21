import { NextResponse } from "next/server";
import { computeScore, type ScoreInput } from "@/lib/score";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendScoreReady } from "@/lib/email";
import {
  buildVcValuationReport,
  type BuildVcValuationInput,
} from "@/lib/agents/cfo-valuation";

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
    persisted: persisted && isSupabaseConfigured() && !slug.startsWith("demo-"),
  });
}

export const dynamic = "force-dynamic";
