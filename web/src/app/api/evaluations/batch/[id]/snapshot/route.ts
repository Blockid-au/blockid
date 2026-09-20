// POST /api/evaluations/batch/[id]/snapshot — take a BlockID Cohort snapshot
// (G21 P2-A; docs/plans/g21-fi-upgrade-2026-09-20.md § P2-A).
//
//   { reason?: "manual" | "rescore", older_than_days?: number }
//   → 200 { ok, snapshot, requeued: number[], fresh, batch_status, delta }
//
//   manual   — snapshot the cohort as it stands (SVI, verification level,
//              evidence gaps per item + medians).
//   rescore  — "Re-score cohort": items whose last score is older than
//              older_than_days (default 30) go back to the queue (the
//              off-peak runner re-scores them; quota re-checked per item,
//              nothing charged here), then the snapshot is taken so the next
//              batch_complete snapshot has a baseline. Fail-soft: an item
//              that cannot be re-queued keeps its last score.
//
//   401 anonymous · 403 feature_locked (lp_export OR accelerator.cohort) ·
//   404 not my batch · 400 bad reason · 503 not migrated / DB · 429 (20/h).
//   `delta` = latest vs previous snapshot summarised (cohort-delta.ts).

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, isUuid, readJsonBody } from "@/lib/security/request-guards";
import { gateBatchRequest } from "@/lib/evaluations/batch-gate";
import { getBatchForUser } from "@/lib/evaluations/batch";
import { RESCORE_STALE_DAYS, latestSnapshots, requeueStaleItems, takeCohortSnapshot } from "@/lib/evaluations/cohort-snapshots";
import { deltaByProject, summariseDeltas } from "@/lib/evaluations/cohort-delta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function POST_handler(request: Request, { params }: Ctx) {
  const { user, response } = await gateBatchRequest("api/evaluations/batch/[id]/snapshot");
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const limited = enforceRateLimit("cohort-snapshot", user.id, request, 20, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<{ reason?: unknown; older_than_days?: unknown } | null>(request, 2 * 1024);
  if (!read.ok) return read.response;
  const body = read.body ?? {};
  const reason = body.reason == null ? "manual" : body.reason;
  if (reason !== "manual" && reason !== "rescore") {
    return NextResponse.json({ ok: false, error: "invalid_input", message: "reason must be manual or rescore" }, { status: 400 });
  }
  let olderThanDays = RESCORE_STALE_DAYS;
  if (body.older_than_days != null) {
    const n = Number(body.older_than_days);
    if (!Number.isInteger(n) || n < 0 || n > 3650) return NextResponse.json({ ok: false, error: "invalid_input", message: "older_than_days must be 0–3650" }, { status: 400 });
    olderThanDays = n;
  }

  const batch = await getBatchForUser(user.id, id);
  if (!batch) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const requeue = reason === "rescore" ? await requeueStaleItems(batch, { olderThanDays }) : { requeued: [] as number[], fresh: 0, batchStatus: batch.status };
  const taken = await takeCohortSnapshot(batch.id, { reason, createdBy: user.id, batch });
  if (!taken.ok) {
    const status = taken.error === "not_found" ? 404 : taken.error === "write_failed" ? 500 : 503;
    return NextResponse.json({ ok: false, error: taken.error, message: taken.message, requeued: requeue.requeued }, { status });
  }
  const { latest, previous } = await latestSnapshots(batch.id);
  const delta = summariseDeltas(deltaByProject(latest, previous).values());
  return NextResponse.json(
    { ok: true, snapshot: taken.snapshot, requeued: requeue.requeued, fresh: requeue.fresh, batch_status: requeue.batchStatus, delta },
    { status: 201, headers: PRIVATE_JSON_HEADERS },
  );
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/evaluations/batch/[id]/snapshot/route.ts", method: "POST" }, POST_handler);
