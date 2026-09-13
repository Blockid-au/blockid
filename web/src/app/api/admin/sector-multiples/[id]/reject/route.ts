// POST /api/admin/sector-multiples/[id]/reject — reject a proposed
// sector-multiple override, or roll back an approved one (S27-C). Rejecting
// an approved row is the rollback: the resolver falls back to the previous
// approved row for the sector, else the static table, on the next request.
// The row is never deleted — it stays as the citation trail.
//
// Body (optional): { note?: string }. Admin gate 401/403. Audited via
// apiRoute — action `sector_multiples.rejected`; the audit note
// carries `previous_status` so a rollback is distinguishable from a
// declined proposal.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { sectorMultiplesAdminGate } from "@/lib/valuation/multiples-admin-gate";
import { readReviewNote, reviewOverride, type ReviewClient } from "@/lib/valuation/multiples-admin-review";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILURE_STATUS: Record<string, number> = { not_found: 404, already_approved: 409, already_rejected: 409, not_reviewable: 409, raced: 409, query_failed: 500, update_failed: 500 };

async function POST_handler(request: Request, { params }: Params) {
  const g = await sectorMultiplesAdminGate();
  if ("response" in g) return g.response;

  const { id } = await params;
  if (!UUID_RE.test(id ?? "")) return NextResponse.json({ ok: false, reason: "bad_id" }, { status: 400 });

  const body = await readReviewNote(request);
  if (!body.ok) return NextResponse.json({ ok: false, reason: body.reason }, { status: body.status });
  const note = body.note;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const r = await reviewOverride(supabase as unknown as ReviewClient, id, "reject", { userId: g.user.id, note });
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason, error: r.error }, { status: FAILURE_STATUS[r.reason] ?? 500 });

  auditNote(r.row.id, {
    sector: r.row.sector,
    arr_low: r.row.arr_low,
    arr_mid: r.row.arr_mid,
    arr_high: r.row.arr_high,
    source_url: r.row.source_url,
    previous_status: r.previousStatus,
    rollback: r.previousStatus === "approved",
  });
  return NextResponse.json({ ok: true, row: r.row, previousStatus: r.previousStatus });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); action + entity overridden inline (webhooks pattern).
export const POST = apiRoute({ route: "api/admin/sector-multiples/[id]/reject/route.ts", method: "POST", action: "sector_multiples.rejected", entity: "sector_multiples_override" }, POST_handler);
