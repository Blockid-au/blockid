// POST /api/admin/sector-multiples/[id]/approve — flip a proposed
// sector-multiple override to `approved` (S27-C). From this response on the
// resolver (lib/valuation/sector-multiples.ts) returns this row for its
// sector whenever `effective_from <= today`; every valuation surface picks it
// up on the next request (cache invalidated here, 10-minute TTL elsewhere).
//
// Body (optional): { note?: string }. Admin gate 401/403. Audited via
// apiRoute — action `sector_multiples.approved`; the audit note
// carries the sector, the band, the source URL and `same_admin` when the
// approver is the admin who typed the proposal (allowed, but on record).

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

  const r = await reviewOverride(supabase as unknown as ReviewClient, id, "approve", { userId: g.user.id, note });
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason, error: r.error }, { status: FAILURE_STATUS[r.reason] ?? 500 });

  auditNote(r.row.id, {
    sector: r.row.sector,
    arr_low: r.row.arr_low,
    arr_mid: r.row.arr_mid,
    arr_high: r.row.arr_high,
    effective_from: r.row.effective_from,
    source_url: r.row.source_url,
    proposed_by: r.row.proposed_by,
    same_admin: r.sameAdmin,
  });
  return NextResponse.json({ ok: true, row: r.row, sameAdmin: r.sameAdmin });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); action + entity overridden inline (webhooks pattern).
export const POST = apiRoute({ route: "api/admin/sector-multiples/[id]/approve/route.ts", method: "POST", action: "sector_multiples.approved", entity: "sector_multiples_override" }, POST_handler);
