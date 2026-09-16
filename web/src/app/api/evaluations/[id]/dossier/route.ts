// GET /api/evaluations/[id]/dossier — the Investor Dossier read model
// (G13-W2-D1, BA spec Appendix 1). The server page calls the lib directly;
// this route exists for the mobile / PDF / IC-memo paths and returns the
// SAME masked view (consent tier + viewer role applied inside
// lib/evaluations/dossier.ts — nothing is filtered here).
//
//   200 { ok, dossier }        evaluator (assessor) or the founder who claimed
//   401 auth_required
//   404 not_found              unknown id OR a row the caller cannot access —
//                              never 403, the id must not confirm existence.
//
// Read-only, so not wrapped by apiRoute() (mutation methods only —
// src/lib/audit/coverage.test.ts); the view itself is audited as
// `dossier.viewed` (§C.2) via auditDossierView, fire-and-forget.

import { NextResponse } from "next/server";
import { isEvaluatorUser } from "@/lib/evaluations";
import { getCurrentUser } from "@/lib/auth";
import { loadDossier } from "@/lib/evaluations/dossier";
import { auditDossierView } from "@/lib/evaluations/dossier-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(_request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const [dossier, isEvaluator] = await Promise.all([loadDossier(id, user.id), isEvaluatorUser(user)]);
  if (!dossier) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  // Same gate as the page: an evaluator seat whose entitlement lapsed gets
  // 404, the claimed founder needs none for the read-only preview.
  if (dossier.viewer.role === "assessor" && !isEvaluator) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  auditDossierView({
    userId: user.id,
    evaluationId: dossier.header.evaluationId,
    projectId: dossier.header.projectId,
    role: dossier.viewer.role,
    consentTier: dossier.header.consentTier,
    surface: "api",
    sviTotal: dossier.header.svi,
    snapshotId: dossier.header.snapshotId,
  });

  return NextResponse.json(
    { ok: true, dossier },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
