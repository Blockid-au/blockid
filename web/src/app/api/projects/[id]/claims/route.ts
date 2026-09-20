// GET /api/projects/[id]/claims — the project's Claim ≠ Evidence graph
// (G21 P1-A, migration 0417).
//
//   200 { ok, claims: [ …claim, records: [...] ], counts: { claimed,
//         evidence_backed, verified, unverified, conflicting },
//         viewer: { kind, consent_tier } }
//   401 auth_required
//   404 not_found   unknown id OR a caller with no access — never 403, the
//                   id must not confirm existence
//   429             over 60 reads / minute per user
//   503 unavailable 0417 not applied / DB down
//
// Who: the owner or an accepted member (viewer+) sees everything; an
// entitled evaluator with an `evaluations` row for the project sees records
// filtered by visibility + consent_scope and projected by the evaluation's
// consent tier (lib/evidence/claims-access.ts). `?dimension=tre` narrows.
//
// Read-only, so not wrapped by apiRoute() (mutation methods only —
// src/lib/audit/coverage.test.ts).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { projectClaimsByTier, resolveClaimsViewer } from "@/lib/evidence/claims-access";
import { defaultClaimsDb, isMissingTableError } from "@/lib/evidence/claims-db";
import { countClaimStatuses, listEvidenceRecords } from "@/lib/evidence/records";
import { isSviDimension } from "@/lib/evidence/types";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const CLAIMS_READS_PER_MINUTE = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });
const notFound = () => json({ ok: false, error: "not_found" }, 404);

export async function GET(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "auth_required" }, 401);
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const limited = enforceRateLimit("project-claims", user.id, request, CLAIMS_READS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const dimensionParam = new URL(request.url).searchParams.get("dimension")?.toLowerCase() ?? null;
  if (dimensionParam && !isSviDimension(dimensionParam)) return json({ ok: false, error: "invalid_dimension" }, 400);
  const dimension = dimensionParam && isSviDimension(dimensionParam) ? dimensionParam : null;

  let access;
  try {
    access = await resolveClaimsViewer({ id: user.id, plan: user.plan ?? null }, id);
  } catch (err) {
    console.error("[blockid:claims] access check failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "unavailable" }, 503);
  }
  if (!access) return notFound();

  const db = await defaultClaimsDb();
  if (!db) return json({ ok: false, error: "unavailable" }, 503);

  try {
    const [allClaims, records] = await Promise.all([db.listClaims(id), listEvidenceRecords(id, { dimension, viewer: access.viewer }, db)]);
    const claims = dimension ? allClaims.filter((c) => c.svi_dimension === dimension) : allClaims;
    const byClaim = new Map<string, typeof records>();
    for (const r of records) if (r.claim_id) byClaim.set(r.claim_id, [...(byClaim.get(r.claim_id) ?? []), r]);
    const projected = projectClaimsByTier(claims, byClaim, access.consentTier);
    return json({
      ok: true,
      claims: projected,
      counts: countClaimStatuses(claims),
      viewer: { kind: access.kind, consent_tier: access.consentTier },
    });
  } catch (err) {
    if (isMissingTableError(err)) return json({ ok: false, error: "unavailable", reason: "migration_pending" }, 503);
    console.error("[blockid:claims] read failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "internal" }, 500);
  }
}
