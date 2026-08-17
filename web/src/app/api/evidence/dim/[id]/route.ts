/**
 * DELETE /api/evidence/dim/[id]
 *
 * Soft-deletes a `svi_dimension_evidence` row by its UUID, then
 * recalculates evidence completeness for the affected project.
 *
 * Auth: requires a valid session; only the project owner may delete.
 * Multi-startup safe: always scopes ownership via project_id → projects.owner_id.
 *
 * Response:
 *   200 { ok: true, completeness }
 *   401 unauthenticated
 *   403 row does not belong to caller's project
 *   404 row not found
 *   500 internal error
 *
 * Note: The schema (20260827_svi_evidence_completeness.sql) does NOT define
 * an `is_deleted` soft-delete column. We perform a hard DELETE but immediately
 * trigger a completeness recompute so downstream consumers stay consistent.
 * If a soft-delete column is added to the migration, replace `.delete()` with
 * `.update({ is_deleted: true, deleted_at: new Date().toISOString() })`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assessEvidenceQuality } from "@/lib/computeEvidenceCompleteness";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Evidence id is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }

    // Fetch the row first to verify ownership via project
    const { data: row, error: fetchErr } = await supabase
      .from("svi_dimension_evidence")
      .select("id, project_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      console.error("[blockid:evidence:delete] fetch failed", fetchErr);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Evidence row not found" }, { status: 404 });
    }

    // Verify project ownership
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", row.project_id as string)
      .maybeSingle();

    if (projErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if ((project.owner_id as string) !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Hard delete the evidence row
    const { error: deleteErr } = await supabase
      .from("svi_dimension_evidence")
      .delete()
      .eq("id", id);

    if (deleteErr) {
      console.error("[blockid:evidence:delete] delete failed", deleteErr);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    // Recompute completeness after deletion
    const completeness = await assessEvidenceQuality(row.project_id as string);

    return NextResponse.json({ ok: true, completeness });
  } catch (err) {
    console.error("[blockid:evidence:delete] unexpected error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
