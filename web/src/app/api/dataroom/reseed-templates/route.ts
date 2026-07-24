// POST /api/dataroom/reseed-templates — founder-triggered retry of the
// 10-doc Day-0 dataroom seed. Idempotent (upsert:false + natural-key row
// dedupe), rate-limited to 5/hour/user via the persistent limiter.
//
// Auth via getCurrentUser + project resolved via getProjectIdFromRequest —
// the founder can only re-seed their own currently-active workspace.
//
// Response envelope mirrors seedDataroomTemplates:
//   { ok, uploaded, skipped, failed }
//
// On rate-limit hit we return 429 with Retry-After so the UI can back off.

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getProjectIdFromRequest } from "@/lib/projects";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { seedDataroomTemplates } from "@/lib/dataroom/seed-templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const gate = await gateRequireFeature("share_management");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  const rl = await consumeRateLimit({
    bucket: "dataroom.reseed_templates",
    actorId: user.id,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate_limited",
        limit: rl.limit,
        retry_after_seconds: rl.retry_after_seconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retry_after_seconds ?? 60),
        },
      },
    );
  }

  const projectId = await getProjectIdFromRequest();
  if (!projectId) {
    return NextResponse.json(
      { ok: false, reason: "no_active_project" },
      { status: 400 },
    );
  }

  const result = await seedDataroomTemplates({
    projectId,
    userId: user.id,
    email: user.email,
  });

  return NextResponse.json({
    ok: result.ok,
    uploaded: result.uploaded,
    skipped: result.skipped,
    failed: result.failed,
  });
}
