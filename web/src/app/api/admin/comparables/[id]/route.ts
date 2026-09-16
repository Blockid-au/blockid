// POST /api/admin/comparables/[id] — approve / reject one ingested AU
// comparable (S-R5). Body: { decision: "approve" | "reject", note?, edits? }
// where `edits` (sector, stage, name, round_date, amount_aud,
// post_money_aud, arr_aud, arr_multiple, founded_year, notable) lets the
// reviewer fill what the regex extraction could not see before the row
// becomes `verified`. From this response on the repo cache is invalidated,
// so the next valuation chapter / landing render cites the new N.
//
// Admin gate 401/403. Audited via apiRoute — action
// `comparables.reviewed`; the audit note carries the decision, the name,
// the round date and `rollback` when a verified row was rejected.

import { NextResponse } from "next/server";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { readJsonBody } from "@/lib/security/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sectorMultiplesAdminGate } from "@/lib/valuation/multiples-admin-gate";
import { isUuid, reviewComparable, validateReviewBody, type ComparablesAdminDb } from "@/lib/valuation/comparables-admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const BODY_MAX_BYTES = 16 * 1024;
const FAILURE_STATUS: Record<string, number> = { not_found: 404, already_decided: 409, query_failed: 500, update_failed: 500 };

async function POST_handler(request: Request, { params }: Params) {
  const g = await sectorMultiplesAdminGate();
  if ("response" in g) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, reason: "bad_id" }, { status: 400 });

  const read = await readJsonBody(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  const v = validateReviewBody(read.body);
  if (!v.ok) return NextResponse.json({ ok: false, reason: "invalid_body", errors: v.errors }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const r = await reviewComparable(supabase as unknown as ComparablesAdminDb, id, v.body, { reviewer: g.user.email ?? g.user.id });
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason, error: r.error }, { status: FAILURE_STATUS[r.reason] ?? 500 });

  auditNote(r.row.id, { decision: v.body.decision, company: r.row.name, round_date: r.row.round_date, status: r.row.status, rollback: r.rollback, edited: Object.keys(v.body.edits ?? {}) });
  return NextResponse.json({ ok: true, row: r.row, rollback: r.rollback });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); action + entity overridden inline.
export const POST = apiRoute({ route: "api/admin/comparables/[id]/route.ts", method: "POST", action: "comparables.reviewed", entity: "au_comparable_raise" }, POST_handler);
