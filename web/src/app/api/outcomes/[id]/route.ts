// PATCH /api/outcomes/[id] — confirm / reject a proposed outcome (G21 P3-A).
//
//   Body { decision: "confirm" | "reject", note?: string }
//   200 { ok, outcome } · 400 bad body · 401 anon · 403 the owner may not
//   resolve connector / register proposals (BlockID does) · 404 unknown id
//   OR not the caller's project (existence never confirmed) · 409 already
//   resolved · 429 · 503 no db / 0427 pending
//
// Who: the project OWNER resolves founder / evaluator proposals on their
// own project; an admin (ADMIN_EMAIL or role admin) resolves any. A
// confirmation never changes the reporter's confidence — it records who and
// when. Audit action `outcome.confirmed` / `outcome.rejected`; FI event
// `outcome_recorded` with the new status.

import { NextResponse } from "next/server";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { emitOutcomeRecorded } from "@/lib/analytics/fi-events";
import { isMissingTableError } from "@/lib/evidence/claims-db";
import { resolveOutcome } from "@/lib/outcomes/service";
import { OUTCOME_NOTE_MAX } from "@/lib/outcomes/types";
import { assertProjectAccess, ProjectAccessError } from "@/lib/projects";
import { checkRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Resolutions per user per hour. */
export const OUTCOME_RESOLVES_PER_HOUR = 60;
const BODY_MAX_BYTES = 8 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

async function PATCH_handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "auth_required" }, 401);
  const { id } = await params;
  if (!UUID_RE.test(id ?? "")) return json({ ok: false, error: "not_found" }, 404);

  const rl = checkRateLimit(`outcomes:resolve:${user.id}`, OUTCOME_RESOLVES_PER_HOUR, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited", message: "Too many decisions in the last hour — try again later." }, { status: 429, headers: { ...PRIVATE_JSON_HEADERS, "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } });
  }

  const parsed = await readJsonBody<{ decision?: unknown; note?: unknown }>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const decision = parsed.body?.decision;
  if (decision !== "confirm" && decision !== "reject") return json({ ok: false, error: "invalid_input", field: "decision", message: "decision must be confirm or reject" }, 400);
  const note = typeof parsed.body?.note === "string" ? parsed.body.note.trim() : "";
  if (note.length > OUTCOME_NOTE_MAX) return json({ ok: false, error: "invalid_input", field: "note", message: `note must be at most ${OUTCOME_NOTE_MAX} characters` }, 400);

  const db = getSupabaseAdmin();
  if (!db) return json({ ok: false, error: "unavailable" }, 503);

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  const ownsProject = async (projectId: string): Promise<boolean> => {
    try {
      const access = await assertProjectAccess(user.id, projectId, "viewer");
      return access.isOwner;
    } catch (err) {
      if (err instanceof ProjectAccessError && err.code !== "service_unavailable") return false;
      throw err;
    }
  };

  try {
    const r = await resolveOutcome(db, { id, decision, note: note || null, actor: { userId: user.id, isAdmin, ownsProject } });
    if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.status);
    auditAction(decision === "confirm" ? "outcome.confirmed" : "outcome.rejected");
    auditNote(r.row.id, { project_id: r.row.project_id, kind: r.row.kind, source: r.row.source, status: r.row.status, by_admin: isAdmin });
    emitOutcomeRecorded({ ownerUserId: isAdmin ? null : user.id, actorUserId: user.id, email: user.email, plan: user.plan ?? null, projectId: r.row.project_id, channel: isAdmin ? "admin_review" : "api", outcomeId: r.row.id, kind: r.row.kind, source: r.row.source, status: r.row.status });
    const { recorded_by: _r, confirmed_by: _c, ...outcome } = r.row;
    void _r;
    void _c;
    return json({ ok: true, outcome });
  } catch (err) {
    if (isMissingTableError(err)) return json({ ok: false, error: "unavailable", reason: "migration_pending" }, 503);
    if (err instanceof ProjectAccessError) return json({ ok: false, error: "unavailable" }, 503);
    console.error("[blockid:outcomes] resolve failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "internal" }, 500);
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const PATCH = apiRoute({ route: "api/outcomes/[id]/route.ts", method: "PATCH" }, PATCH_handler);
