// POST /api/dataroom/reseed-templates — founder-triggered retry of the
// 10-doc Day-0 dataroom seed. Idempotent (upsert:false + natural-key row
// dedupe), rate-limited to 5/hour/user via the persistent limiter.
//
// Auth via the feature gate + project resolved via getProjectScope (editor+)
// — the founder (or an accepted editor) re-seeds the active workspace.
//
// Response envelope mirrors seedDataroomTemplates:
//   { ok, uploaded, skipped, failed }
//
// On rate-limit hit we return 429 with Retry-After so the UI can back off.

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { seedDataroomTemplates } from "@/lib/dataroom/seed-templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const gate = await gateRequireFeature("data_room.access");
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

  // S18-A — editor+; the seeded rows belong to the project OWNER
  // (user_id / email) so a co-founder re-seeds the shared room, not a
  // private copy. The rate limit above stays per-caller.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  if (!projectId) {
    return NextResponse.json(
      { ok: false, reason: "no_active_project" },
      { status: 400 },
    );
  }

  const result = await seedDataroomTemplates({
    projectId,
    userId: scope?.ownerUserId ?? user.id,
    email: scope?.dataEmail ?? user.email,
  });

  return NextResponse.json({
    ok: result.ok,
    uploaded: result.uploaded,
    skipped: result.skipped,
    failed: result.failed,
  });
}
