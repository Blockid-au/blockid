// POST /api/svi/dimensions/evidence/[projectId]/[dimension]/[evidenceId]/request-review
//
// G14-S36 — the founder asks a BlockID reviewer to verify one evidence row.
// Flips `review_status` to 'pending' (migration 0407); the row's
// confidence_level is untouched — only the reviewer's approve decision
// (PATCH /api/admin/evidence/[id]/review) can raise it to
// third_party_verified. Project owner only (same gate as the upload route).
// Idempotent: a row already pending answers 200 { alreadyPending: true }; a
// verified row is refused (409) — there is nothing left to review.

import { NextRequest, NextResponse } from "next/server";
import { requireProjectOwner, KNOWN_DIMENSIONS } from "../../../../../_helpers";
import { apiRoute } from "@/lib/audit/api-route";
import { auditNote } from "@/lib/audit/context";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function POST_handler(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dimension: string; evidenceId: string }> },
) {
  const { projectId, dimension, evidenceId } = await params;
  const dim = dimension.toLowerCase();
  if (!KNOWN_DIMENSIONS.includes(dim)) {
    return NextResponse.json({ ok: false, error: `Unknown dimension: ${dimension}` }, { status: 400 });
  }
  if (!UUID_RE.test(evidenceId ?? "")) {
    return NextResponse.json({ ok: false, error: "Invalid evidenceId" }, { status: 400 });
  }

  const auth = await requireProjectOwner(projectId);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const supabase = auth.ctx.supabase;

  const { data: row, error } = await supabase
    .from("svi_dimension_evidence")
    .select("*")
    .eq("id", evidenceId)
    .eq("project_id", projectId)
    .eq("dimension", dim)
    .maybeSingle();
  if (error) {
    console.error("[blockid:svi-dimensions] request-review lookup failed", error);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ ok: false, error: "Evidence row not found" }, { status: 404 });

  const r = row as { is_verified?: boolean | null; review_status?: string | null };
  if (r.is_verified === true) {
    return NextResponse.json({ ok: false, error: "already_verified" }, { status: 409 });
  }
  if (r.review_status === "pending") {
    return NextResponse.json({ ok: true, alreadyPending: true, reviewStatus: "pending" });
  }

  const { error: upErr } = await supabase
    .from("svi_dimension_evidence")
    .update({ review_status: "pending", review_note: null, updated_at: new Date().toISOString() })
    .eq("id", evidenceId);
  if (upErr) {
    // 42703 = review_status column missing → 0407 not applied yet on this DB.
    const code = (upErr as { code?: string }).code;
    if (code === "42703") {
      return NextResponse.json({ ok: false, error: "review_unavailable" }, { status: 503 });
    }
    console.error("[blockid:svi-dimensions] request-review update failed", upErr);
    return NextResponse.json({ ok: false, error: "Failed to request review" }, { status: 500 });
  }

  auditNote(evidenceId, { project_id: projectId, dimension: dim });
  return NextResponse.json({ ok: true, alreadyPending: false, reviewStatus: "pending" });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const POST = apiRoute(
  { route: "api/svi/dimensions/evidence/[projectId]/[dimension]/[evidenceId]/request-review/route.ts", method: "POST" },
  POST_handler,
);
