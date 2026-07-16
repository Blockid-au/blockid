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

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  const { step, state } = (body as {
    step?: number;
    state?: Record<string, unknown>;
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

  const payload = {
    onboarding_state: {
      step,
      state,
      updated_at: new Date().toISOString(),
    },
  };

  try {
    const { error } = await admin
      .from("app_users")
      .update(payload)
      .eq("id", user.id);

    if (error) {
      // 42703 = undefined_column — column not present. Skip silently.
      const code = (error as { code?: string }).code;
      if (
        code === "42703" ||
        /column\s+.*onboarding_state.*does not exist/i.test(error.message ?? "")
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
