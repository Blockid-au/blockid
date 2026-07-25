// POST /api/startup-package/save-answer
//
// Persist a single guided-interview answer for the founder's Startup Package
// project. Debounced (~800ms) by the client wizard, so this endpoint should
// be fast: auth, validate, upsert, snapshot, return. No agent dispatch —
// that's /api/startup-package/analyze.
//
// Body:  { stepKey, answerText, projectId? }
// Reply: { ok, sviMeter: { svi, delta, stage } }
//
// Side effects:
//   - upsert startup_package_interview (project_id, step_key) unique.
//   - recomputeAndSnapshot(projectId) → inserts a svi_snapshots row so the
//     live-meter poll picks up the delta.
//   - Rate-limit 60/hour/user (keystroke debounce means ~60 saves in a
//     single interview session is generous headroom).
//
// Auth: getCurrentUser → 401 anon. Gated behind the `startup_package`
// feature in web/src/lib/feature-gates.manifest.ts.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createProject, getActiveProject } from "@/lib/projects";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { recomputeAndSnapshot } from "@/lib/startup-package/svi-recompute";
import {
  getInterviewStep,
  isInterviewStepKey,
} from "@/lib/startup-package/interview-steps";

export const dynamic = "force-dynamic";

interface SaveAnswerBody {
  stepKey?: string;
  answerText?: string;
  projectId?: string;
}

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "authentication_required" },
      { status: 401 },
    );
  }

  // ── Rate-limit ────────────────────────────────────────────────────────
  const rl = await consumeRateLimit({
    bucket: "startup-package.save-answer",
    actorId: user.id,
    limit: 60,
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
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  // ── Parse + validate ──────────────────────────────────────────────────
  let body: SaveAnswerBody;
  try {
    body = (await request.json()) as SaveAnswerBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }

  if (!isInterviewStepKey(body.stepKey)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_step_key" },
      { status: 400 },
    );
  }
  const step = getInterviewStep(body.stepKey);

  const answerText =
    typeof body.answerText === "string" ? body.answerText.trim() : "";
  // Allow shorter drafts on save (autosave-friendly). minChars is enforced
  // only when the wizard hits "Next"; server just accepts non-empty text.
  if (answerText.length === 0) {
    return NextResponse.json(
      { ok: false, reason: "empty_answer" },
      { status: 400 },
    );
  }
  if (answerText.length > 20_000) {
    return NextResponse.json(
      { ok: false, reason: "answer_too_long" },
      { status: 400 },
    );
  }

  // ── Resolve project (create founder's first if missing) ───────────────
  let projectId: string | undefined = body.projectId;
  if (!projectId) {
    const active = await getActiveProject(user.id);
    projectId = active?.id;
  }
  if (!projectId) {
    // Founder has no project — lazily create one so the interview flows
    // uninterrupted. Uses the seed startup name derived from displayName.
    const seedName =
      (user.startupName?.trim() ||
        user.displayName?.trim() ||
        user.email.split("@")[0]) ?? "My Startup";
    const created = await createProject(
      user.id,
      seedName,
      user.plan ?? "free",
      { description: "Founder Package interview draft" },
    );
    if (!created.ok || !created.project) {
      return NextResponse.json(
        { ok: false, reason: created.reason ?? "project_create_failed" },
        { status: 400 },
      );
    }
    projectId = created.project.id;
  }

  // ── Upsert interview answer ───────────────────────────────────────────
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, reason: "db_unavailable" },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const upsertPayload = {
    project_id: projectId,
    step_key: step.key,
    answer_text: answerText,
    char_count: answerText.length,
    updated_at: now,
  };

  const { error: upsertErr } = await admin
    .from("startup_package_interview")
    .upsert(upsertPayload, { onConflict: "project_id,step_key" });

  if (upsertErr) {
    const code = (upsertErr as { code?: string }).code;
    // 42P01 = migration 0116 not yet applied. Return 200 skipped so the
    // client keeps its local draft and doesn't spam retries.
    if (code === "42P01") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "table_missing",
        sviMeter: null,
      });
    }
    console.error("[startup-package:save-answer] upsert failed", upsertErr);
    return NextResponse.json(
      { ok: false, reason: "upsert_failed" },
      { status: 500 },
    );
  }

  // ── SVI real-time recompute + snapshot ────────────────────────────────
  const snap = await recomputeAndSnapshot(projectId);

  return NextResponse.json({
    ok: true,
    projectId,
    sviMeter: {
      svi: snap.svi,
      delta: snap.delta,
      stage: snap.stage,
    },
  });
}
