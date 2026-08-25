// POST /api/svi/dimensions/evidence/[projectId]/[dimension]/upload
//
// Upserts an evidence row for a given (projectId, dimension) and returns the
// refreshed completeness + roadmap so the caller can re-render immediately.

import { NextRequest, NextResponse } from "next/server";
import {
  requireProjectOwner,
  KNOWN_DIMENSIONS,
  loadDimensionResults,
  loadCurrentSvi,
  loadCompletedEvidenceTypes,
  computeRoadmapAndForecast,
  groupRoadmapByWeek,
} from "../../../../_helpers";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000; // 1MB

const VALID_CONFIDENCE = new Set([
  "self_declared",
  "public_url",
  "document_uploaded",
  "connected_source",
  "transaction_data",
  "third_party_verified",
]);

interface UploadBody {
  evidenceType?: string;
  evidenceValueOrUrl?: string;
  evidenceLabel?: string;
  confidenceLevel?: string;
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; dimension: string }> },
) {
  const { projectId, dimension } = await params;

  const dim = dimension.toLowerCase();
  if (!KNOWN_DIMENSIONS.includes(dim)) {
    return NextResponse.json(
      { ok: false, error: `Unknown dimension: ${dimension}` },
      { status: 400 },
    );
  }

  const auth = await requireProjectOwner(projectId);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  // Payload-size guard (best-effort — content-length may be absent).
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413 },
    );
  }

  const rawText = await request.text();
  if (rawText.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413 },
    );
  }

  let body: UploadBody;
  try {
    body = JSON.parse(rawText || "{}") as UploadBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const evidenceType = body.evidenceType?.trim();
  if (!evidenceType) {
    return NextResponse.json(
      { ok: false, error: "evidenceType is required" },
      { status: 400 },
    );
  }

  const catalog = EVIDENCE_CATALOG[dim] ?? [];
  const catalogEntry = catalog.find((c) => c.code === evidenceType);
  if (!catalogEntry) {
    return NextResponse.json(
      {
        ok: false,
        error: `evidenceType "${evidenceType}" is not valid for dimension "${dim}"`,
      },
      { status: 400 },
    );
  }

  const confidenceLevel = body.confidenceLevel ?? catalogEntry.confidenceLevel;
  if (!VALID_CONFIDENCE.has(confidenceLevel)) {
    return NextResponse.json(
      { ok: false, error: `Invalid confidenceLevel: ${confidenceLevel}` },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;

  // Duplicate check — return 409 for a strict duplicate insert attempt.
  const { data: existing } = await supabase
    .from("svi_dimension_evidence")
    .select("id, evidence_value_or_url")
    .eq("project_id", projectId)
    .eq("dimension", dim)
    .eq("evidence_type", evidenceType)
    .maybeSingle();

  if (
    existing &&
    body.evidenceValueOrUrl !== undefined &&
    existing.evidence_value_or_url === body.evidenceValueOrUrl
  ) {
    return NextResponse.json(
      { ok: false, error: "Evidence already recorded" },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  const { data: upserted, error: upsertErr } = await supabase
    .from("svi_dimension_evidence")
    .upsert(
      {
        project_id: projectId,
        dimension: dim,
        evidence_type: evidenceType,
        evidence_label: body.evidenceLabel ?? catalogEntry.label,
        confidence_level: confidenceLevel,
        evidence_value_or_url: body.evidenceValueOrUrl ?? null,
        estimated_svi_impact: catalogEntry.estimatedSviImpact,
        updated_at: nowIso,
      },
      { onConflict: "project_id,dimension,evidence_type" },
    )
    .select("id")
    .single();

  if (upsertErr || !upserted) {
    console.error(
      "[blockid:svi-dimensions] evidence upsert failed",
      upsertErr,
    );
    return NextResponse.json(
      { ok: false, error: "Failed to save evidence" },
      { status: 500 },
    );
  }

  // Return refreshed derived state.
  const [{ results }, currentSvi, completedSet] = await Promise.all([
    loadDimensionResults(supabase, projectId),
    loadCurrentSvi(supabase, projectId),
    loadCompletedEvidenceTypes(supabase, projectId),
  ]);
  const { roadmap } = computeRoadmapAndForecast(results, currentSvi);
  const grouped = groupRoadmapByWeek(roadmap).map((wk) => ({
    week: wk.week,
    items: wk.items.map((it) => ({
      ...it,
      completed: completedSet.has(it.code),
    })),
  }));

  const updatedCompleteness: Record<string, number> = {};
  for (const r of results) updatedCompleteness[r.dimension] = r.completenessPercent;

  return NextResponse.json(
    {
      ok: true,
      id: upserted.id as string,
      updatedCompleteness,
      updatedRoadmap: grouped,
    },
    { status: 201 },
  );
}
