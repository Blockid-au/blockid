/**
 * GET /api/funding/report/[id] — read one Money Finder report (T0242, §4e).
 *
 * Access: the signed-in owner (`user_id`), the emailed `?t=<access_token>`,
 * or the Stripe Checkout `?s=<session_id>` from the success redirect. Anyone
 * else gets 404 (not 403 — the id is not confirmed to exist). Secrets
 * (token, email, Stripe ids) never leave the server; see `publicFundingReport`.
 *
 *   200 { ok: true, report: PublicFundingReport }
 *   202 { ok: true, report }              row exists but is not `ready` yet
 *   404 { ok: false, error: "not_found" }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canViewFundingReport, getFundingReport, publicFundingReport } from "@/lib/funding/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const sessionId = url.searchParams.get("s");
  const user = await getCurrentUser();

  const row = await getFundingReport(id);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const viewer = { userId: user?.id ?? null, token, sessionId };
  if (!canViewFundingReport(row, viewer)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const report = publicFundingReport(row, viewer);
  const status = report.status === "ready" ? 200 : 202;
  return NextResponse.json({ ok: true, report }, { status, headers: { "Cache-Control": "private, no-store" } });
}
