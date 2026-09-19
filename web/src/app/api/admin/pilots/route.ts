// /api/admin/pilots — G16-C evaluator pilot enablement (admin only).
//
//   GET   → { ok, pilots: [{…row, days_left, submissions, reports_run,
//            assessments, email_masked, intake_url}], active, cap }
//   POST  { email, program_name, days?=30, credits?=trust_report×60,
//           intake_slug?, intake_name? }
//         → 201 { ok, pilot, intake_url, existing:false, warnings }
//         → 200 { ok, pilot, existing:true } when the e-mail already has
//           an active pilot (idempotent)
//         → 400 invalid · 401 anon · 403 non-admin · 404 unknown evaluator
//           (never creates accounts) · 409 cap (5 active) · 503 no db
//
// The comp is an admin plan + credit grant (never a Stripe coupon); every
// POST is audited by apiRoute AND by `appendAudit` inside the service
// (`pilot.started`). End early: DELETE /api/admin/pilots/[id].

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { gateAdmin } from "@/lib/pilots/admin-gate";
import { listPilots, startPilot } from "@/lib/pilots/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const g = await gateAdmin();
  if (g.response) return g.response;
  const out = await listPilots();
  return NextResponse.json({ ok: true, ...out });
}

async function POST_handler(request: Request) {
  const g = await gateAdmin();
  if (g.response) return g.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "invalid_input", message: "JSON body required" }, { status: 400 });

  const r = await startPilot(body as Parameters<typeof startPilot>[0], { email: g.user.email, id: g.user.id });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, message: r.message, ...(r.active !== undefined ? { active: r.active } : {}) }, { status: r.status });
  return NextResponse.json({ ok: true, existing: r.existing, pilot: r.pilot, intake_url: r.intake_url, warnings: r.warnings }, { status: r.existing ? 200 : 201 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/admin/pilots/route.ts", method: "POST" }, POST_handler);
