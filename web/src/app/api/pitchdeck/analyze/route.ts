// POST /api/pitchdeck/analyze
//
// Wave 11 step 2 — reserve credits + mark the row as `analyzing`.
//
// Body: { pitchdeckId: string, dims: string[] }
//   pitchdeckId — id from /api/pitchdeck/classify response
//   dims        — subset of the 8 SVI DIM_KEYS the founder chose to run
//
// Charges the founder for every dim that's flagged `missing` in the
// classifier coverage map (speculative analyses cost credits; `strong` /
// `partial` dims run for free because they have deck evidence to cite).
//
// The actual streaming happens client-side against
// /api/svi/dimensions/stream — this route only prices + gates the run.
// Client receives the extracted deck text back so it can pass it as
// `deckText` in the SSE POST body.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
type DimKey = (typeof DIM_KEYS)[number];

const FEATURE_KEY = (dim: DimKey) => `dim_${dim}_analysis`;

type CoverageLevel = "strong" | "partial" | "missing";
interface DimCoverage {
  level: CoverageLevel;
  excerpt: string;
}

interface PitchdeckRow {
  id: string;
  user_id: string;
  filename: string;
  extracted_text: string;
  dim_coverage: Record<string, DimCoverage>;
  status: string;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { pitchdeckId?: string; dims?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const pitchdeckId = body.pitchdeckId?.trim() ?? "";
  if (!pitchdeckId) {
    return NextResponse.json({ ok: false, error: "missing_pitchdeckId" }, { status: 400 });
  }

  const requested = Array.isArray(body.dims)
    ? body.dims.filter((k): k is DimKey =>
        typeof k === "string" && (DIM_KEYS as readonly string[]).includes(k),
      )
    : [];
  if (requested.length === 0) {
    return NextResponse.json({ ok: false, error: "no_dims_selected" }, { status: 400 });
  }
  const dims = Array.from(new Set(requested));

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 500 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("pitchdeck_analyses")
    .select("id, user_id, filename, extracted_text, dim_coverage, status")
    .eq("id", pitchdeckId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: fetchErr.message },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const deck = row as PitchdeckRow;

  // Identify speculative dims (coverage=missing) that will incur credit
  // charges. `strong` and `partial` are free — the LLM has deck evidence.
  const speculativeDims = dims.filter((d) => {
    const cov = deck.dim_coverage?.[d];
    return !cov || cov.level === "missing";
  });

  // Compute cost from the canonical FEATURE_COSTS table so pricing stays
  // in one place. Sum, not per-dim charges, so we only hit the credits
  // ledger once — cheaper + easier to refund on failure.
  const cost = speculativeDims.reduce((acc, d) => {
    const c = FEATURE_COSTS[FEATURE_KEY(d)] ?? 0;
    return acc + c;
  }, 0);

  if (cost > 0) {
    // Pre-flight — cheap read to reject with a clear message before we
    // hit the atomic spend path (which races).
    const gate = await canAfford(user.id, "svi_analysis");
    if (!gate.allowed && gate.reason === "insufficient_credits") {
      return NextResponse.json(
        {
          ok: false,
          error: "insufficient_credits",
          balance: gate.balance,
          required: cost,
        },
        { status: 402 },
      );
    }
    // Single spend against a synthetic feature id so the transaction row
    // clearly identifies pitchdeck speculative analyses.
    const spend = await spendCredits(user.id, "pitchdeck_speculative", {
      pitchdeckId,
      dims: speculativeDims,
      totalCost: cost,
    });
    if (!spend.ok) {
      return NextResponse.json(
        { ok: false, error: "spend_failed", balance: spend.balance },
        { status: 402 },
      );
    }
  }

  // Mark the row so we can audit-trail what was run + how much it cost.
  await supabase
    .from("pitchdeck_analyses")
    .update({
      selected_dims: dims,
      credits_spent: cost,
      status: "analyzing",
    })
    .eq("id", pitchdeckId);

  // Hand back the deck text so the client can pass it as `deckText` on the
  // SSE POST. Avoids a second DB round-trip from the stream endpoint.
  return NextResponse.json({
    ok: true,
    pitchdeckId,
    dims,
    speculativeDims,
    creditsCharged: cost,
    deckText: deck.extracted_text,
  });
}
