// GET /api/startup-package/svi-snapshot?projectId=...
//
// Reads the latest svi_snapshots row for the founder's Startup Package
// project so the client-side SVI live-meter can poll (every 5s during
// an active interview session, idle-off otherwise).
//
// Response: { ok, svi, delta, stage } — 200 always so the SWR client
//            can render "loading…" or "no data yet" without an error
//            boundary; ok:false carries a `reason` when we can't answer.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { readLatestSnapshot } from "@/lib/startup-package/svi-recompute";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "authentication_required" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  let projectId = url.searchParams.get("projectId") ?? undefined;

  if (!projectId) {
    const active = await getActiveProject(user.id);
    projectId = active?.id;
  }

  if (!projectId) {
    return NextResponse.json({
      ok: false,
      reason: "no_project",
      svi: null,
      delta: null,
      stage: null,
    });
  }

  const snap = await readLatestSnapshot(projectId);
  if (!snap) {
    return NextResponse.json({
      ok: true,
      projectId,
      svi: null,
      delta: null,
      stage: null,
      empty: true,
    });
  }

  return NextResponse.json({
    ok: true,
    projectId,
    svi: snap.svi,
    delta: snap.delta,
    stage: snap.stage,
  });
}
