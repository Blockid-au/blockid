// GET /api/admin/comparables — the AU comparables review queue (S-R5).
//
// pending (weekly ingest, oldest first on the page), the latest verified
// rows and the latest rejections, plus counts (verified N / with-multiples
// N = what the valuation chapter and the landing copy cite). Admin gate
// 401/403 (same helper as /api/admin/sector-multiples).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sectorMultiplesAdminGate } from "@/lib/valuation/multiples-admin-gate";
import { loadComparablesQueue, type ComparablesAdminDb } from "@/lib/valuation/comparables-admin";
import { INGEST_SOURCES } from "@/lib/valuation/comparables-ingest";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await sectorMultiplesAdminGate();
  if ("response" in g) return g.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const queue = await loadComparablesQueue(supabase as unknown as ComparablesAdminDb);
  if (queue.error) return NextResponse.json({ ok: false, reason: "query_failed", error: queue.error }, { status: 500 });
  return NextResponse.json({ ok: true, ...queue, sources: INGEST_SOURCES.map((s) => ({ id: s.id, label: s.label, url: s.url })) });
}
