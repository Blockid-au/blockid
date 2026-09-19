// DELETE /api/admin/pilots/[id] — end a pilot early (G16-C, admin only).
//
// Body (optional): { reason?: "ended_early" | "converted" | "withdrawn" |
// "other", note?: string }. Reverts `app_users.plan` to `previous_plan`
// UNLESS a Stripe subscription row exists for the user (never downgrade a
// payer) or the plan is no longer the pilot tier; ledger status → `ended`
// with the reason; evaluator e-mailed; `pilot.ended` audit row; ops alert.
//
//   200 { ok, pilot, plan_reverted, warnings } · 401 anon · 403 non-admin ·
//   404 unknown id · 409 already ended / expired · 503 no db

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { gateAdmin } from "@/lib/pilots/admin-gate";
import { endPilot } from "@/lib/pilots/service";
import type { PilotEndReason } from "@/lib/pilots/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const END_REASONS: readonly PilotEndReason[] = ["ended_early", "converted", "withdrawn", "other"];

async function DELETE_handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateAdmin();
  if (g.response) return g.response;
  const { id } = await params;
  if (!id || id.length > 80) return NextResponse.json({ ok: false, error: "invalid_input", message: "id required" }, { status: 400 });

  const body = ((await request.json().catch(() => null)) ?? {}) as { reason?: unknown; note?: unknown };
  const reason: PilotEndReason = typeof body.reason === "string" && (END_REASONS as readonly string[]).includes(body.reason) ? (body.reason as PilotEndReason) : "ended_early";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const r = await endPilot(id, reason, { email: g.user.email, id: g.user.id, kind: "admin" }, {}, note);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, message: r.message }, { status: r.status });
  return NextResponse.json({ ok: true, pilot: r.pilot, plan_reverted: r.plan_reverted, warnings: r.warnings });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const DELETE = apiRoute({ route: "api/admin/pilots/[id]/route.ts", method: "DELETE" }, DELETE_handler);
