// GET /api/pricing-test/assign?experiment=<name>&bucket=<key>
//
// Public endpoint. Deterministic per-bucket variant assignment so any page
// (SSR or client) can decide what to show without dragging the admin
// `pricing-experiments` lib into the client bundle.
//
// Returns 404 unless the experiment exists AND is in `running` state — a
// paused or concluded experiment must not silently keep serving variants.

import { NextResponse } from "next/server";
import { assignVariant, getExperimentByName } from "@/lib/pricing-experiments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("experiment")?.trim() ?? "";
  const bucket = url.searchParams.get("bucket")?.trim() ?? "";
  if (!name || !bucket) {
    return NextResponse.json(
      { ok: false, error: "experiment and bucket query params required" },
      { status: 400 },
    );
  }

  const experiment = await getExperimentByName(name);
  if (!experiment || experiment.status !== "running") {
    return NextResponse.json({ ok: false, error: "not_running" }, { status: 404 });
  }

  const { variantKey, payload } = assignVariant(experiment, bucket);
  return NextResponse.json({
    ok: true,
    experimentId: experiment.id,
    variantKey,
    payload,
  });
}
