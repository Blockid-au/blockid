import { NextResponse } from "next/server";
import { computeScore, type ScoreInput } from "@/lib/score";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendScoreReady } from "@/lib/email";

// POST /api/score
// Body: { email, companyName?, inputs: ScoreInput }
// Behaviour:
//   - Always computes the score (deterministic, no external deps).
//   - Persists to Supabase if configured.
//   - Fire-and-forgets the score-ready email (response NOT blocked).
//   - Falls back to a `demo-XXXX` slug when Supabase is missing so the dev
//     UX (share link + PDF) still works locally.
//
// Returns: { slug, totalScore, subScores }

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

  const supabase = getSupabaseAdmin();
  let slug = newSlug();

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
      // Fire-and-forget: don't await, don't block the response.
      void sendScoreReady({
        to: parsed.email,
        slug,
        totalScore: breakdown.total,
        companyName: parsed.companyName ?? inputs.companyName ?? null,
      });
    }
  }

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
    persisted: isSupabaseConfigured() && !slug.startsWith("demo-"),
  });
}

export const dynamic = "force-dynamic";
