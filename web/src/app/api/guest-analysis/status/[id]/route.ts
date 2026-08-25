/**
 * GET /api/guest-analysis/status/[id] — poll delivery status for a guest order.
 *
 * Public — no auth required. The success page (Phase 3) polls this endpoint
 * after Stripe redirects the buyer to /one-click-report/success. Response is
 * deliberately narrow: only the status transition and (once delivered) the
 * PDF URL. We do NOT echo email / input value / report_data — those are PII
 * or paid deliverables that must not leak via a knowable UUID URL.
 *
 * Response:
 *   200 { status, deliveredAt, reportPdfUrl }
 *   400 invalid id
 *   404 not found
 *   503 db not configured
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("guest_analyses")
    .select("status, delivered_at, report_pdf_url")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "[guest-analysis:status] query failed",
      error.message,
    );
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: data.status,
    deliveredAt: data.delivered_at ?? null,
    reportPdfUrl: data.report_pdf_url ?? null,
  });
}
