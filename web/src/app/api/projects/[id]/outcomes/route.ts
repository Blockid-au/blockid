// /api/projects/[id]/outcomes — the project's outcome ledger (G21 P3-A,
// migration 0427).
//
//   GET  → 200 { ok, outcomes, counts: { proposed, confirmed, rejected },
//                viewer: { kind, consent_tier, can_record, can_resolve } }
//          the owner / an accepted member sees every row (actor ids
//          stripped); an entitled evaluator with an `evaluations` row sees
//          the consent-tier projection (lib/outcomes/service
//          projectOutcomesByTier — same tiers as the claims route).
//   POST { kind, observedAt, value, note?, confidence? }
//        → 201 { ok, outcome, duplicate }
//          the OWNER records with source "founder"; an evaluator with an
//          evaluations row records with source "evaluator"; both land as
//          `proposed` (a person confirms — never automatic). Members cannot
//          record (the record is the founder's). Audit action
//          `outcome.recorded`; FI event `outcome_recorded`.
//   401 auth_required · 404 not_found (unknown id OR no access — existence
//   is never confirmed) · 400 invalid_input (field named) · 429 rate limit
//   / too many proposed · 503 unavailable (0427 not applied / DB down)

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { emitOutcomeRecorded } from "@/lib/analytics/fi-events";
import { resolveClaimsViewer } from "@/lib/evidence/claims-access";
import { isMissingTableError } from "@/lib/evidence/claims-db";
import { listProjectOutcomes, projectOutcomesByTier, recordOutcome } from "@/lib/outcomes/service";
import { parseOutcomeInput } from "@/lib/outcomes/types";
import { checkRateLimit, enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const OUTCOME_READS_PER_MINUTE = 60;
/** Records per user per hour. */
export const OUTCOME_WRITES_PER_HOUR = 30;
const BODY_MAX_BYTES = 16 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });
const notFound = () => json({ ok: false, error: "not_found" }, 404);

export async function GET(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "auth_required" }, 401);
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const limited = enforceRateLimit("project-outcomes", user.id, request, OUTCOME_READS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  let access;
  try {
    access = await resolveClaimsViewer({ id: user.id, plan: user.plan ?? null }, id);
  } catch (err) {
    console.error("[blockid:outcomes] access check failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "unavailable" }, 503);
  }
  if (!access) return notFound();

  const db = getSupabaseAdmin();
  if (!db) return json({ ok: false, error: "unavailable" }, 503);

  try {
    const rows = await listProjectOutcomes(db, id);
    const counts = { proposed: 0, confirmed: 0, rejected: 0 };
    for (const r of rows) counts[r.status] += 1;
    const isOwner = access.kind === "owner" && access.role === "owner";
    return json({
      ok: true,
      outcomes: projectOutcomesByTier(rows, access.kind === "evaluator" ? access.consentTier : null),
      counts,
      viewer: { kind: access.kind, consent_tier: access.kind === "evaluator" ? access.consentTier : null, can_record: isOwner || access.kind === "evaluator", can_resolve: isOwner },
    });
  } catch (err) {
    if (isMissingTableError(err)) return json({ ok: false, error: "unavailable", reason: "migration_pending" }, 503);
    console.error("[blockid:outcomes] read failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "internal" }, 500);
  }
}

async function POST_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "auth_required" }, 401);
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const rl = checkRateLimit(`outcomes:record:${user.id}`, OUTCOME_WRITES_PER_HOUR, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited", message: "Too many outcomes recorded in the last hour — try again later." }, { status: 429, headers: { ...PRIVATE_JSON_HEADERS, "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } });
  }

  const parsedBody = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parseOutcomeInput(parsedBody.body);
  if (!parsed.ok) return json({ ok: false, error: "invalid_input", field: parsed.field, message: parsed.error }, 400);

  let access;
  try {
    access = await resolveClaimsViewer({ id: user.id, plan: user.plan ?? null }, id);
  } catch (err) {
    console.error("[blockid:outcomes] access check failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "unavailable" }, 503);
  }
  if (!access) return notFound();
  if (access.kind === "owner" && access.role !== "owner") return json({ ok: false, error: "forbidden", message: "Only the startup's owner records outcomes on its record." }, 403);
  const source = access.kind === "owner" ? ("founder" as const) : ("evaluator" as const);

  const db = getSupabaseAdmin();
  if (!db) return json({ ok: false, error: "unavailable" }, 503);

  try {
    const r = await recordOutcome(db, { projectId: id, input: parsed.input, source, recordedBy: user.id });
    if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.status);
    auditAction("outcome.recorded");
    auditNote(r.row.id, { project_id: id, kind: r.row.kind, source: r.row.source, status: r.row.status, duplicate: r.duplicate });
    if (!r.duplicate) {
      emitOutcomeRecorded({ ownerUserId: access.kind === "owner" ? user.id : null, actorUserId: user.id, email: user.email, plan: user.plan ?? null, projectId: id, channel: "api", outcomeId: r.row.id, kind: r.row.kind, source: r.row.source, status: r.row.status });
    }
    const { recorded_by: _r, confirmed_by: _c, ...outcome } = r.row;
    void _r;
    void _c;
    return json({ ok: true, outcome, duplicate: r.duplicate }, r.duplicate ? 200 : 201);
  } catch (err) {
    if (isMissingTableError(err)) return json({ ok: false, error: "unavailable", reason: "migration_pending" }, 503);
    console.error("[blockid:outcomes] record failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "internal" }, 500);
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const POST = apiRoute({ route: "api/projects/[id]/outcomes/route.ts", method: "POST" }, POST_handler);
