// PATCH /api/admin/corrections/[id] — resolve a founder correction (G21 P1-C).
//
// Body { decision: "accept" | "reject", resolution?: string } (a reject needs
// a resolution). Admin only (gateAdmin — the /api/admin/pilots ladder: 401
// anon / 403 non-admin). An accept NEVER overwrites data directly: only a
// `wrong_sector_stage` correction with a proposed value is written, through
// `updateProject` (the audited project update path); every other accept
// records the resolution only. The founder is e-mailed on accept. Audit
// action `correction.accepted` / `correction.rejected`.
//
//   200 { ok, correction, applied, change, warnings } · 400 bad body ·
//   404 unknown id · 409 already resolved · 503 no db

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { gateAdmin } from "@/lib/pilots/admin-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readJsonBody } from "@/lib/security/request-guards";
import { resolveCorrection } from "@/lib/corrections/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BODY_MAX_BYTES = 16 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOLUTION_MAX = 2000;

async function PATCH_handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateAdmin();
  if (g.response) return g.response;
  const { id } = await params;
  if (!UUID_RE.test(id ?? "")) return NextResponse.json({ ok: false, error: "invalid_input", message: "id must be a uuid" }, { status: 400 });

  const parsed = await readJsonBody<{ decision?: unknown; resolution?: unknown }>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const decision = parsed.body?.decision;
  if (decision !== "accept" && decision !== "reject") return NextResponse.json({ ok: false, error: "invalid_input", message: "decision must be accept or reject" }, { status: 400 });
  const resolution = typeof parsed.body?.resolution === "string" ? parsed.body.resolution.trim() : "";
  if (resolution.length > RESOLUTION_MAX) return NextResponse.json({ ok: false, error: "invalid_input", message: `resolution must be at most ${RESOLUTION_MAX} characters` }, { status: 400 });
  if (decision === "reject" && !resolution) return NextResponse.json({ ok: false, error: "invalid_input", message: "a rejection needs a resolution the founder can read" }, { status: 400 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const r = await resolveCorrection(db, { id, decision, note: resolution || null, adminId: g.user.id });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, message: r.message }, { status: r.status });

  auditAction(decision === "accept" ? "correction.accepted" : "correction.rejected");
  auditNote(r.row.id, { project_id: r.row.project_id, kind: r.row.kind, target_ref: r.row.target_ref, applied: r.applied, change_field: r.change?.field ?? null });
  return NextResponse.json({ ok: true, correction: r.row, applied: r.applied, change: r.change, warnings: r.warnings });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const PATCH = apiRoute({ route: "api/admin/corrections/[id]/route.ts", method: "PATCH" }, PATCH_handler);
