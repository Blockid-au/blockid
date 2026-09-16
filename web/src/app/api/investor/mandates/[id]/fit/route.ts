// GET /api/investor/mandates/[id]/fit — one mandate's fit rows
// (G13-W3-T2, BA spec §B.8 investors → startups direction; the persisted
// side of Appendix 1 GET /api/investor/dealflow).
//
//   ?fit=N        fit ≥ N (default FIT_FLOOR_V2 = 40; 0 shows gated rows)
//   ?project_id=  ONE project scored LIVE against the mandate (used by the
//                 dossier's thesis-fit prefill between nightly runs) —
//                 the project must be one the caller may see (an
//                 evaluation of theirs, or founder-visible).
//   + the deal-flow filter params (industry, model, stage, state, tags,
//     svi, moved, sort).
//
//   200 { ok, mandate:{id,label}, rows[], never_computed }
//   200 { ok, mandate, live:{ project_id, fit } }          (?project_id=)
//   401 auth_required · 402 feature_locked · 404 not_found (unknown id OR
//   a mandate the caller cannot read — never 403)
//
// Read-only → not wrapped by apiRoute() (mutation methods only —
// src/lib/audit/coverage.test.ts).

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can, recordGateHit } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDealFlowV2 } from "@/lib/investors/dealflow";
import { getMandateForUser } from "@/lib/investors/mandates";
import { scoreFit } from "@/lib/investors/fit-v2";
import { loadFitStartups, listVisibleProjectIds } from "@/lib/investors/fit-refresh";
import { filtersFromSearchParams } from "@/lib/investors/saved-views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const subset = { id: user.id, plan: user.plan ?? "", segment: "investor" };
  if (!(await can(subset, "investor.dealflow"))) {
    await recordGateHit(subset, "investor.dealflow", "api");
    return NextResponse.json({ ok: false, error: "feature_locked", feature: "investor.dealflow" }, { status: 402 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const mandate = await getMandateForUser(user.id, id);
  if (!mandate) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  if (projectId) {
    if (!UUID_RE.test(projectId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const db = getSupabaseAdmin();
    if (!db) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
    // Visibility: the caller's own evaluation of the project, or founder-visible.
    const { data: evals } = await db.from("evaluations").select("id").eq("project_id", projectId).eq("evaluator_user_id", user.id).limit(1);
    const mine = Array.isArray(evals) && evals.length > 0;
    const visible = mine || (await listVisibleProjectIds(db)).has(projectId);
    if (!visible) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const loaded = (await loadFitStartups(db, [projectId])).get(projectId);
    if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const fit = scoreFit(mandate, loaded);
    return NextResponse.json(
      { ok: true, mandate: { id: mandate.id, label: mandate.label }, live: { project_id: projectId, fit } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const filters = filtersFromSearchParams(Object.fromEntries(url.searchParams));
  const df = await getDealFlowV2(user.id, { ...filters, mandate_id: mandate.id });
  return NextResponse.json(
    { ok: true, mandate: { id: mandate.id, label: mandate.label }, rows: df.rows, count: df.rows.length, never_computed: df.never_computed, migrated: df.migrated },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
