/**
 * DELETE /api/evidence/dim/[id]
 *
 * Soft-deletes a `svi_dimension_evidence` row by its UUID, then
 * recalculates evidence completeness for the affected project.
 *
 * Auth: requires a valid session; the project owner or an accepted member
 * with role ≥ editor may delete (assertProjectAccess — S17-A). Multi-startup
 * safe: ownership is always resolved via the row's project_id.
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
import { apiRoute } from "@/lib/audit/api-route";
import { assertProjectAccess } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";

export const dynamic = "force-dynamic";

async function DELETE_handler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
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

    // Release QA-4 P2-e: the previous check selected `projects.owner_id`, a column
    // that does not exist, so every call was denied (fail-closed, feature dead).
    // Access now goes through the S17-A chokepoint `assertProjectAccess`
    // (owner or accepted member ≥ minRole; 404 for a non-member so the project's
    // existence is not confirmed, 403 for an under-ranked member, 503 no DB).
    try {
      await assertProjectAccess(user.id, row.project_id as string, "editor");
    } catch (err) {
      const denied = projectAccessResponse(err);
      if (denied) return denied;
      throw err;
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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const DELETE = apiRoute({ route: "api/evidence/dim/[id]/route.ts", method: "DELETE" }, DELETE_handler);
