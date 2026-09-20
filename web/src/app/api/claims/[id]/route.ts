// PATCH /api/claims/[id] — a founder's correction to one claim (G21 P1-A).
//
//   { founder_claimed_value?: json, statement?: string, note: string }
//     → 200 { ok, claim, version: { version, changed_at }, status_changed }
//
//   401 auth_required · 404 not_found (unknown id or a non-member — never
//   confirms existence) · 403 forbidden (a viewer-only member) · 400
//   invalid_body · 429 over 30/min · 503 unavailable (0417 not applied).
//
// The correction is APPENDED: claim_versions gets the previous state + the
// patch + the note before the row changes (lib/evidence/claim-correction.ts),
// the claim is re-graded (a founder value that disagrees with the extraction
// → `conflicting`) and `claim.corrected` is audited. Founder-only = the
// project owner or an accepted admin/editor member (assertProjectAccess
// "editor", the same guard PATCH /api/projects/[id] uses).

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { getCurrentUser } from "@/lib/auth";
import { correctClaim, parseClaimCorrection } from "@/lib/evidence/claim-correction";
import { defaultClaimsDb, isMissingTableError } from "@/lib/evidence/claims-db";
import { assertProjectAccess, ProjectAccessError } from "@/lib/projects";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const CORRECTIONS_PER_MINUTE = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });
const notFound = () => json({ ok: false, error: "not_found" }, 404);

async function PATCH_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "auth_required" }, 401);
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const limited = enforceRateLimit("claim-correction", user.id, request, CORRECTIONS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const db = await defaultClaimsDb();
  if (!db) return json({ ok: false, error: "unavailable" }, 503);

  let claim;
  try {
    claim = await db.getClaim(id);
  } catch (err) {
    if (isMissingTableError(err)) return json({ ok: false, error: "unavailable", reason: "migration_pending" }, 503);
    throw err;
  }
  if (!claim) return notFound();

  try {
    await assertProjectAccess(user.id, claim.project_id, "editor");
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      if (err.code === "forbidden") return json({ ok: false, error: "forbidden" }, 403);
      if (err.code === "not_found") return notFound();
      return json({ ok: false, error: "unavailable" }, 503);
    }
    throw err;
  }

  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;
  const parsed = parseClaimCorrection(body.body);
  if (!parsed.ok) return json({ ok: false, error: "invalid_body", issues: parsed.issues }, 400);

  const { appendAudit } = await import("@/lib/audit");
  const result = await correctClaim({ claim, correction: parsed.value, userId: user.id, db, audit: appendAudit });
  return json({
    ok: true,
    claim: result.claim,
    version: { version: result.version.version, changed_at: result.version.changed_at },
    status_changed: result.status_changed,
  });
}

export const PATCH = apiRoute({ route: "api/claims/[id]/route.ts", method: "PATCH" }, PATCH_handler);
