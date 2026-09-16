// /api/projects/[id]/taxonomy — the startup's canonical classification
// (G13-W4-D2 E1.4; BA spec §B.6, §B.10 T1/T2, Appendix 1).
//
//   GET   → 200 { ok, taxonomy: StartupTaxonomyRow | null, suggested, confirmed, unclassified_count }
//           viewer+ member. `taxonomy` is null while the pipeline has not
//           classified the project yet (the card says "pick one").
//   PATCH → 200 { ok, taxonomy, changed[], dropped_protected_tags[], locked_by_founder[], unclassified_count }
//           editor+ member. Body (6-axis object, all optional) + `confirm`
//           + `not_sure[]`:
//             { industry?, business_model?, stage_key?, customer_types?[],
//               geo_scope?, hq_state?, tags?[], not_sure?: axis[], confirm: boolean }
//           The write goes through `confirmTaxonomy()` in the store:
//           sources.<axis> = 'founder' (or 'evaluator' when the caller is an
//           evaluator persona), confirmed_at / confirmed_by on confirm,
//           protected tags (female_founded · first_nations) accepted from a
//           founder only (DQ-4), founder-owned fields never overwritten by an
//           evaluator (§B.6 step 3). Audit `taxonomy.confirmed` / `.edited`.
//
//   401 · 404 non-member (existence not confirmed) · 403 viewer on PATCH ·
//   400 invalid body with Zod issue paths · 503 service unavailable.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ProjectAccessError, assertProjectAccess } from "@/lib/projects";
import { isEvaluatorUser } from "@/lib/evaluations";
import { confirmTaxonomy, countUnclassified, getTaxonomy } from "@/lib/taxonomy/store";
import { taxonomyPatchSchema } from "@/lib/taxonomy/confirm-schema";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function accessError(err: unknown) {
  if (err instanceof ProjectAccessError) {
    const error = err.code === "not_found" ? "not_found" : err.code === "forbidden" ? "forbidden" : "service_unavailable";
    return NextResponse.json({ ok: false, error }, { status: err.status, headers: PRIVATE_JSON_HEADERS });
  }
  console.error("[blockid:taxonomy] access check failed", err);
  return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
}

export async function GET(_request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  try {
    await assertProjectAccess(user.id, id, "viewer");
  } catch (err) {
    return accessError(err);
  }
  const taxonomy = await getTaxonomy(id);
  return NextResponse.json(
    {
      ok: true,
      taxonomy,
      suggested: taxonomy?.suggested ?? null,
      confirmed: Boolean(taxonomy?.confirmed_at),
      unclassified_count: taxonomy ? countUnclassified(taxonomy) : 3,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

async function PATCH_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  try {
    await assertProjectAccess(user.id, id, "editor");
  } catch (err) {
    return accessError(err);
  }

  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;
  const parsed = taxonomyPatchSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  // Evaluator persona → 'evaluator' source (T2); everyone else on a project
  // they can edit is the founder side.
  const source = (await isEvaluatorUser(user)) ? "evaluator" : "founder";
  const result = await confirmTaxonomy(id, parsed.data, { userId: user.id, source });
  if (!result.ok) {
    const status = result.error === "unavailable" ? 503 : result.error === "invalid" ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status, headers: PRIVATE_JSON_HEADERS });
  }
  return NextResponse.json(
    {
      ok: true,
      taxonomy: result.row,
      changed: result.changed,
      dropped_protected_tags: result.droppedProtectedTags,
      locked_by_founder: result.lockedByFounder,
      unclassified_count: result.unclassifiedCount,
      source,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

export const PATCH = apiRoute({ route: "api/projects/[id]/taxonomy/route.ts", method: "PATCH" }, PATCH_handler);
