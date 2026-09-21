// PATCH /api/evaluations/batch/[id]/weights — the BlockID Cohort weights
// editor (G22-A; docs/plans/g22-upgrade-hardening-2026-09-21.md § 2 A.3).
//
//   PATCH { rubric_weights: { ftv, mpc, ptd, tre, cgh, iri, lco, svm } }
//         → 200 { ok, batch, weights_version, previous_version, changed }
//
//   Owner only (assertBatchRole "owner"). The set is normalised to 100 %
//   (lib/evaluations/batch-shared normaliseWeights); an identical set is a
//   no-op that keeps the version (changed: false). A real change writes
//   `rubric_weights` + `weights_version + 1` (0422) — the next cohort
//   snapshot stamps the new version and the delta view says "weights
//   changed". Audit `cohort.weights_updated` carries both versions and the
//   new set (ids and numbers only). The canonical SVI never changes.
//
//   401 anonymous · 403 reviewer / viewer (forbidden) · 404 non-member /
//   unknown batch · 400 invalid body · 429 over 30/min · 503 no DB.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertBatchRole } from "@/lib/evaluations/batch-members";
import { updateBatchWeights } from "@/lib/evaluations/batch";
import { DIMENSION_KEYS } from "@/lib/evaluations/batch-shared";
import { PRIVATE_JSON_HEADERS, isUuid, readJsonBody } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const WEIGHTS_WRITES_PER_MINUTE = 30;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

/** One slider per dimension, 0..100 each (the sliders run 0..40; the API accepts any non-negative split and normalises). */
const weightValue = z.number().min(0).max(100);
export const weightsPatchSchema = z
  .object({
    rubric_weights: z.object(Object.fromEntries(DIMENSION_KEYS.map((k) => [k, weightValue])) as Record<(typeof DIMENSION_KEYS)[number], typeof weightValue>).strict(),
  })
  .strict()
  .refine((b) => DIMENSION_KEYS.some((k) => b.rubric_weights[k] > 0), { message: "At least one dimension needs a weight above 0", path: ["rubric_weights"] });

function deny(access: { error: "not_found" | "forbidden" | "unavailable" }) {
  if (access.error === "forbidden") return json({ ok: false, error: "forbidden", message: "Only the cohort owner can change the program weights" }, 403);
  if (access.error === "unavailable") return json({ ok: false, error: "unavailable" }, 503);
  return json({ ok: false, error: "not_found" }, 404);
}

async function patchHandler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return json({ ok: false, error: "not_found" }, 404);
  const access = await assertBatchRole(id, user.id, "owner");
  if (!access.ok) return deny(access);

  const limited = enforceRateLimit("batch-weights", user.id, request, WEIGHTS_WRITES_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = weightsPatchSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", message: "Send one weight (0–100) per dimension", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }

  const r = await updateBatchWeights(access.batch, parsed.data.rubric_weights);
  if (!r.ok) {
    const status = r.error === "unavailable" ? 503 : r.error === "not_found" ? 404 : 500;
    return json({ ok: false, error: r.error, message: r.message }, status);
  }
  if (r.changed) {
    void appendAudit({
      user_id: user.id,
      actor: "user",
      action: "cohort.weights_updated",
      resource_type: "evaluation_batch",
      resource_id: r.batch.id,
      detail: { previous_version: r.previousVersion, weights_version: r.batch.weightsVersion, rubric_weights: r.batch.rubricWeights },
    }).catch(() => {});
  }
  return json({ ok: true, batch: r.batch, weights_version: r.batch.weightsVersion, previous_version: r.previousVersion, changed: r.changed });
}

export const PATCH = apiRoute({ route: "api/evaluations/batch/[id]/weights/route.ts", method: "PATCH" }, patchHandler);
