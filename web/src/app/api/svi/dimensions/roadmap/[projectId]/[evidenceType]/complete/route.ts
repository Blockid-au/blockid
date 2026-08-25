// PATCH /api/svi/dimensions/roadmap/[projectId]/[evidenceType]/complete
//
// Marks a single roadmap item as completed and inserts a corresponding
// svi_dimension_evidence row so completeness/forecast reflect the change.
//
// Body: { "completed": true, "notes"?: string }

import { NextRequest, NextResponse } from "next/server";
import {
  requireProjectOwner,
  loadDimensionResults,
  loadCurrentSvi,
  computeRoadmapAndForecast,
} from "../../../../_helpers";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";

export const dynamic = "force-dynamic";

interface PatchBody {
  completed?: boolean;
  notes?: string;
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; evidenceType: string }> },
) {
  const { projectId, evidenceType } = await params;
  const auth = await requireProjectOwner(projectId);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const completed = body.completed !== false; // default true
  const supabase = auth.ctx.supabase;

  // Look up the roadmap item so we know its dimension / label / impact.
  const { data: roadmapRow, error: lookupErr } = await supabase
    .from("svi_evidence_roadmap")
    .select(
      "id, dimension, evidence_type, action_title, estimated_svi_impact, is_completed",
    )
    .eq("project_id", projectId)
    .eq("evidence_type", evidenceType)
    .maybeSingle();

  if (lookupErr) {
    console.error(
      "[blockid:svi-dimensions] roadmap lookup failed",
      lookupErr,
    );
    return NextResponse.json(
      { ok: false, error: "Roadmap lookup failed" },
      { status: 500 },
    );
  }

  // Fall back to the catalog if the roadmap row was never persisted (the
  // aggregate route computes roadmap in-memory; a real completion should
  // still succeed).
  let dimension: string | null = roadmapRow?.dimension ?? null;
  let evidenceLabel: string | null = roadmapRow?.action_title ?? null;
  let impact = (roadmapRow?.estimated_svi_impact as number | null) ?? 0;

  if (!dimension) {
    for (const [dim, catalog] of Object.entries(EVIDENCE_CATALOG)) {
      const match = catalog.find((c) => c.code === evidenceType);
      if (match) {
        dimension = dim;
        evidenceLabel = match.label;
        impact = match.estimatedSviImpact;
        break;
      }
    }
  }

  if (!dimension) {
    return NextResponse.json(
      { ok: false, error: "Roadmap item not found" },
      { status: 404 },
    );
  }

  if (roadmapRow?.is_completed && completed) {
    return NextResponse.json(
      { ok: false, error: "Already completed" },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  // Upsert the roadmap row (marks completed_at).
  const { error: roadmapErr } = await supabase
    .from("svi_evidence_roadmap")
    .upsert(
      {
        project_id: projectId,
        dimension,
        evidence_type: evidenceType,
        action_title: evidenceLabel ?? evidenceType,
        estimated_svi_impact: impact,
        estimated_effort_hours: 4,
        bang_for_buck: 1,
        urgency_tier: 3,
        urgency_label: "medium",
        roadmap_week: 1,
        is_completed: completed,
        completed_at: completed ? nowIso : null,
        updated_at: nowIso,
      },
      { onConflict: "project_id,dimension,evidence_type" },
    );

  if (roadmapErr) {
    console.error("[blockid:svi-dimensions] roadmap upsert failed", roadmapErr);
    return NextResponse.json(
      { ok: false, error: "Failed to mark roadmap item complete" },
      { status: 500 },
    );
  }

  // Insert the evidence row that makes the completeness score move.
  if (completed) {
    const { error: evidErr } = await supabase
      .from("svi_dimension_evidence")
      .upsert(
        {
          project_id: projectId,
          dimension,
          evidence_type: evidenceType,
          evidence_label: evidenceLabel ?? evidenceType,
          confidence_level: "self_declared",
          evidence_value_or_url: body.notes ?? null,
          estimated_svi_impact: impact,
          updated_at: nowIso,
        },
        { onConflict: "project_id,dimension,evidence_type" },
      );
    if (evidErr) {
      console.error(
        "[blockid:svi-dimensions] evidence upsert failed",
        evidErr,
      );
      return NextResponse.json(
        { ok: false, error: "Failed to record evidence" },
        { status: 500 },
      );
    }
  }

  // Recompute completeness + forecast so the client can update UI without
  // a follow-up round-trip.
  const [{ results }, currentSvi] = await Promise.all([
    loadDimensionResults(supabase, projectId),
    loadCurrentSvi(supabase, projectId),
  ]);
  const { forecast } = computeRoadmapAndForecast(results, currentSvi);

  const newCompleteness: Record<string, number> = {};
  for (const r of results) newCompleteness[r.dimension] = r.completenessPercent;

  return NextResponse.json({
    ok: true,
    updated: true,
    newCompleteness,
    newForecast: {
      currentSvi: forecast.currentSvi,
      projectedSvi: forecast.projectedSvi,
      potentialSviGain: forecast.potentialSviGain,
    },
  });
}
