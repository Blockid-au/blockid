// GET /api/funding/calendar-token
//
// T0245 — mints (once) and returns the signed-in founder's Money Radar
// calendar token + subscribe URLs. Gated on `money_radar` (Starter+, Growth,
// Startup Package, evaluator rungs) — the ICS feed itself re-checks on
// every fetch.
//
//   200 { ok, token, url, webcal }
//   401 unauthorized · 403 money_radar_required · 503 service_unavailable

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";
import { fundingCalendarUrl, getOrMintCalendarToken } from "@/lib/funding/calendar-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const allowed = await can({ id: user.id, plan: user.plan ?? "free", segment: "founder" }, "money_radar");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "money_radar_required", upgrade: "/pricing" }, { status: 403 });
  }
  const token = await getOrMintCalendarToken(user.id);
  if (!token) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }
  const url = fundingCalendarUrl(token);
  return NextResponse.json(
    { ok: true, token, url, webcal: url.replace(/^https?:\/\//, "webcal://") },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
