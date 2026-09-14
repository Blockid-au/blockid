// POST /api/onboarding/save-progress
//
// Persist the current onboarding wizard state as JSON on
// app_users.onboarding_state so a user who bounces mid-flow can resume
// where they left off. The column is optional (nullable jsonb); this
// route is intentionally forgiving — if the column is missing (older
// schema, migration not applied yet) it returns { ok: true, skipped: true }
// so the client can continue without seeing an error.
//
// Body: { step: number, state: object }
// The `state` blob is opaque to the server — clients own its shape.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { step, state, completed } = (body as {
    step?: number;
    state?: Record<string, unknown>;
    /** S31-B: the wizard's terminal actions set this (or firstStartupCreatedAt). */
    completed?: boolean;
  }) ?? {};

  if (typeof step !== "number" || Number.isNaN(step)) {
    return NextResponse.json(
      { ok: false, reason: "step must be a number" },
      { status: 400 },
    );
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return NextResponse.json(
      { ok: false, reason: "state must be an object" },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    // Fail-open: onboarding-progress is a nice-to-have, not a legal artefact.
    return NextResponse.json({ ok: true, skipped: true });
  }

  // S31-B (2026-09-13): the 6-step wizard saved progress but never set
  // app_users.onboarding_completed — only the older 3-step WelcomeWizard
  // (POST /api/onboarding/complete) did. Every Google / magic-link founder
  // therefore finished this wizard and was immediately bounced into the
  // second one by the dashboard's `!onboardingCompleted` check. The two
  // terminal actions (step 6 create/skip → firstStartupCreatedAt; step 4
  // "continue without card" → completed:true) now stamp the flag.
  const finished = isWizardFinished(step, state, completed);
  const payload = {
    onboarding_state: {
      step,
      state,
      updated_at: new Date().toISOString(),
    },
    ...(finished
      ? { onboarding_completed: true, onboarding_completed_at: new Date().toISOString() }
      : {}),
  };

  try {
    const { error } = await admin
      .from("app_users")
      .update(payload)
      .eq("id", user.id);

    if (error) {
      // Column not present → skip silently. Two spellings of the same
      // condition:
      //   42703    = Postgres undefined_column (raw SQL path)
      //   PGRST204 = PostgREST "Could not find the '<col>' column of
      //              '<table>' in the schema cache" (what the REST client
      //              actually returns — release QA-2 F5 saw this 500 once
      //              per wizard step in production).
      const code = (error as { code?: string }).code;
      const message = error.message ?? "";
      if (
        code === "42703" ||
        code === "PGRST204" ||
        /column\s+.*onboarding_state.*does not exist/i.test(message) ||
        /could not find the '?onboarding_state'? column/i.test(message)
      ) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      console.error("[blockid:onboarding] save-progress failed", error);
      return NextResponse.json(
        { ok: false, reason: "Persistence failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[blockid:onboarding] save-progress threw", err);
    return NextResponse.json({ ok: true, skipped: true });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
/** Exported for the colocated test. Pure. */
export function isWizardFinished(
  step: number,
  state: Record<string, unknown>,
  completed: boolean | undefined,
): boolean {
  if (completed === true) return true;
  return step >= 6 && typeof state.firstStartupCreatedAt === "string" && state.firstStartupCreatedAt.length > 0;
}

export const POST = apiRoute({ route: "api/onboarding/save-progress/route.ts", method: "POST" }, POST_handler);
