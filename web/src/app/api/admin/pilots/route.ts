// /api/admin/pilots — G16-C evaluator pilot enablement (admin only).
//
//   GET   → { ok, pilots: [{…row, days_left, submissions, reports_run,
//            assessments, email_masked, intake_url}], active, cap }
//   POST  → 410 pilots_retired (G25, 2026-09-21 — no new pilots are
//           offered; the ledger of past comps stays readable)
//         → 401 anon · 403 non-admin
//
// End a comp still running early: DELETE /api/admin/pilots/[id].

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { gateAdmin } from "@/lib/pilots/admin-gate";
import { listPilots } from "@/lib/pilots/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const g = await gateAdmin();
  if (g.response) return g.response;
  const out = await listPilots();
  return NextResponse.json({ ok: true, ...out });
}

// G25 (2026-09-21, "bỏ luôn coupon và pilot"): no new pilots. The ledger of
// past comps stays readable (GET) and a running comp can still be ended
// (DELETE /api/admin/pilots/[id]); starting one answers 410 so an old admin
// tab or script cannot grant a comp by accident. `startPilot` stays in
// lib/pilots/service for its tests and the ledger shape only.
async function POST_handler(_request: Request) {
  const g = await gateAdmin();
  if (g.response) return g.response;
  return NextResponse.json({ ok: false, error: "pilots_retired", message: "New pilots are no longer offered (G25, 2026-09-21). Evaluators go straight to the Cohort / Scout / Firm / Program plans." }, { status: 410 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/admin/pilots/route.ts", method: "POST" }, POST_handler);
