// GET|POST /api/admin/sector-multiples — sector-multiple override review
// queue (S27-C, 2026-09-13).
//
//   GET   the queue: every `proposed` row (oldest first), the approved rows
//         (newest first, capped), the rejected tail, and the side-by-side
//         "static vs in force today" table for every sector.
//   POST  manual "Propose override": an admin types the band + the source
//         URL / title / verbatim excerpt → one `status='proposed'` row with
//         proposed_by='admin' and proposed_by_user_id = the caller. It still
//         has to be approved (POST …/[id]/approve) before the resolver reads
//         it; approving your own proposal is allowed but the audit row says
//         `same_admin: true`.
//
// Admin gate: lib/valuation/multiples-admin-gate.ts (401 no session /
// 403 not admin). Service-role client — the table has no user policies.
// Audited via apiRoute (action `sector_multiples.proposed`).

import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/security/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { sectorMultiplesAdminGate } from "@/lib/valuation/multiples-admin-gate";
import { currentMultiplesTable, validateManualProposal } from "@/lib/valuation/multiples-admin";
import { isoDate, OVERRIDES_TABLE, type SectorMultipleOverride } from "@/lib/valuation/sector-multiples";
import { MULTIPLES_SOURCES } from "@/lib/valuation/multiples-sources";

export const dynamic = "force-dynamic";

const BODY_MAX_BYTES = 16 * 1024;

export async function GET() {
  const g = await sectorMultiplesAdminGate();
  if ("response" in g) return g.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const [proposed, approved, rejected] = await Promise.all([
    supabase.from(OVERRIDES_TABLE).select("*").eq("status", "proposed").order("created_at", { ascending: true }).limit(500),
    supabase.from(OVERRIDES_TABLE).select("*").eq("status", "approved").order("effective_from", { ascending: false }).order("approved_at", { ascending: false }).limit(500),
    supabase.from(OVERRIDES_TABLE).select("*").eq("status", "rejected").order("rejected_at", { ascending: false }).limit(50),
  ]);
  const err = proposed.error ?? approved.error ?? rejected.error;
  if (err) return NextResponse.json({ ok: false, reason: "query_failed", error: err.message }, { status: 500 });

  const today = isoDate(new Date());
  const approvedRows = (approved.data ?? []) as SectorMultipleOverride[];
  return NextResponse.json({
    ok: true,
    today,
    proposed: (proposed.data ?? []) as SectorMultipleOverride[],
    approved: approvedRows,
    rejected: (rejected.data ?? []) as SectorMultipleOverride[],
    current: currentMultiplesTable(approvedRows, today),
    sources: MULTIPLES_SOURCES,
  });
}

async function POST_handler(request: Request) {
  const g = await sectorMultiplesAdminGate();
  if ("response" in g) return g.response;

  const read = await readJsonBody(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const v = validateManualProposal(read.body, isoDate(new Date()));
  if (!v.ok) return NextResponse.json({ ok: false, reason: "invalid_proposal", error: v.error }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from(OVERRIDES_TABLE)
    .insert({ ...v.value, status: "proposed", proposed_by: "admin", proposed_by_user_id: g.user.id })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: false, reason: "duplicate_proposal" }, { status: 409 });
    return NextResponse.json({ ok: false, reason: "insert_failed", error: error.message }, { status: 500 });
  }

  const row = data as SectorMultipleOverride;
  auditNote(row.id, { sector: row.sector, arr_low: row.arr_low, arr_mid: row.arr_mid, arr_high: row.arr_high, source_url: row.source_url, proposed_by: "admin" });
  return NextResponse.json({ ok: true, row }, { status: 201 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); action + entity overridden inline (webhooks pattern).
export const POST = apiRoute({ route: "api/admin/sector-multiples/route.ts", method: "POST", action: "sector_multiples.proposed", entity: "sector_multiples_override" }, POST_handler);
