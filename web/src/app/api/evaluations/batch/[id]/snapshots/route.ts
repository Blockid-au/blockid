// GET /api/evaluations/batch/[id]/snapshots — a BlockID Cohort's snapshots,
// newest first (G21 P2-A).
//
//   ?limit=20 (1..100)
//   → 200 { ok, snapshots: [{ id, takenAt, reason, weightsVersion, summary, rows }],
//           delta: { byProject: { [projectId]: ProjectDelta }, summary } }
//
//   `delta` compares the two newest snapshots (lib/evaluations/cohort-delta.ts)
//   — P2-B's cohort table reads `byProject` for its "Δ since last snapshot"
//   column. Any seat on the batch (G22-A: assertBatchRole viewer+ — the same
//   rule migration 0432 `cohort_snapshots_member_select` gives user-JWT
//   clients); a non-member → 404. No feature gate beyond membership (a
//   downgraded Program keeps its history).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PRIVATE_JSON_HEADERS, isUuid } from "@/lib/security/request-guards";
import { assertBatchRole } from "@/lib/evaluations/batch-members";
import { listCohortSnapshots } from "@/lib/evaluations/cohort-snapshots";
import { deltaByProject, summariseDeltas } from "@/lib/evaluations/cohort-delta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const access = await assertBatchRole(id, user.id, "viewer");
  if (!access.ok) {
    if (access.error === "unavailable") return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const batch = access.batch;

  let limit = 20;
  try {
    const raw = Number(new URL(request.url).searchParams.get("limit") ?? "20");
    if (Number.isInteger(raw) && raw >= 1 && raw <= 100) limit = raw;
  } catch {
    /* default */
  }
  const snapshots = await listCohortSnapshots(batch.id, limit);
  const byProject = deltaByProject(snapshots[0] ?? null, snapshots[1] ?? null);
  return NextResponse.json(
    {
      ok: true,
      snapshots,
      delta: { byProject: Object.fromEntries(byProject), summary: summariseDeltas(byProject.values()) },
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}
