/**
 * POST /api/proofs/score   — anchor a proof for a score_id
 * GET  /api/proofs/score   — retrieve a proof by proof_id
 *
 * Proof anchoring flow:
 *   1. Load the score row from Supabase.
 *   2. Canonicalize the score data → deterministic JSON.
 *   3. SHA-256 hash the canonical JSON → `blockid:v1:<hex>`.
 *   4. Insert into `score_proofs` (idempotent on duplicate hash).
 *   5. Insert a `trust_event` record.
 *   6. Return proof id + hash to the caller.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canonicalizeScore } from "@/lib/proofs/canonical-json";
import { hashScore } from "@/lib/proofs/hash";

export const dynamic = "force-dynamic";

/* ── POST ───────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = body as { score_id?: string } | null;
  if (!parsed?.score_id || typeof parsed.score_id !== "string") {
    return NextResponse.json(
      { ok: false, error: "score_id is required" },
      { status: 400 },
    );
  }

  const scoreId = parsed.score_id.trim();

  // ── 1. Load the score ──────────────────────────────────────────────────────
  // Try svi_analyses first (slug-based), then fall back to scores table.
  let scoreData: Record<string, unknown> | null = null;
  let companyName: string | null = null;
  let scoreDate: string | null = null;
  let sviTotal: number | null = null;

  const { data: sviRow } = await supabase
    .from("svi_analyses")
    .select("id, email, total_svi, analysis_json, created_at")
    .eq("id", scoreId)
    .maybeSingle();

  if (sviRow) {
    companyName = (sviRow.analysis_json as { companyName?: string } | null)?.companyName ?? null;
    scoreDate = sviRow.created_at;
    sviTotal = sviRow.total_svi;
    scoreData = {
      source: "svi_analyses",
      id: sviRow.id,
      email: sviRow.email,
      total_svi: sviRow.total_svi,
      analysis_json: sviRow.analysis_json,
      created_at: sviRow.created_at,
    };
  } else {
    const { data: legacyRow } = await supabase
      .from("scores")
      .select("id, email, company_name, total_score, sub_scores, inputs, score_version, created_at")
      .eq("id", scoreId)
      .maybeSingle();

    if (!legacyRow) {
      return NextResponse.json(
        { ok: false, error: "Score not found" },
        { status: 404 },
      );
    }

    companyName = legacyRow.company_name ?? null;
    scoreDate = legacyRow.created_at;
    sviTotal = legacyRow.total_score;
    scoreData = {
      source: "scores",
      id: legacyRow.id,
      email: legacyRow.email,
      company_name: legacyRow.company_name,
      total_score: legacyRow.total_score,
      sub_scores: legacyRow.sub_scores,
      inputs: legacyRow.inputs,
      score_version: legacyRow.score_version,
      created_at: legacyRow.created_at,
    };
  }

  // ── 2 & 3. Canonicalize + hash ────────────────────────────────────────────
  const canonicalJson = canonicalizeScore(scoreData);
  const hash = hashScore(canonicalJson);

  // ── 4. Insert proof (idempotent: if hash already exists, return it) ────────
  const { data: existingProof } = await supabase
    .from("score_proofs")
    .select("id, hash, anchored_at")
    .eq("hash", hash)
    .maybeSingle();

  if (existingProof) {
    return NextResponse.json({
      ok: true,
      proofId: existingProof.id,
      hash: existingProof.hash,
      anchoredAt: existingProof.anchored_at,
      idempotent: true,
    });
  }

  const { data: proof, error: proofError } = await supabase
    .from("score_proofs")
    .insert({
      score_id: scoreId,
      hash,
      canonical_json: canonicalJson,
      anchor_method: "local",
      verified: true,
    })
    .select("id, hash, anchored_at")
    .single();

  if (proofError || !proof) {
    console.error("[blockid:proofs] insert failed", proofError);
    return NextResponse.json(
      { ok: false, error: "Failed to anchor proof" },
      { status: 500 },
    );
  }

  // ── 5. Trust event ────────────────────────────────────────────────────────
  await supabase.from("trust_events").insert({
    entity_type: "score",
    entity_id: scoreId,
    event_type: "created",
    hash,
    metadata: {
      proof_id: proof.id,
      company_name: companyName,
      score_date: scoreDate,
      svi_total: sviTotal,
      anchor_method: "local",
    },
  });

  return NextResponse.json({
    ok: true,
    proofId: proof.id,
    hash: proof.hash,
    anchoredAt: proof.anchored_at,
    idempotent: false,
  });
}

/* ── GET ────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const proofId = searchParams.get("proof_id");

  if (!proofId) {
    return NextResponse.json(
      { ok: false, error: "proof_id query param is required" },
      { status: 400 },
    );
  }

  const { data: proof, error } = await supabase
    .from("score_proofs")
    .select("*")
    .eq("id", proofId)
    .maybeSingle();

  if (error || !proof) {
    return NextResponse.json(
      { ok: false, error: "Proof not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, proof });
}
