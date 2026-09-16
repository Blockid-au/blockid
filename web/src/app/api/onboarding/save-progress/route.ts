// POST /api/onboarding/save-progress
//
// Persist the current onboarding wizard state as JSON on
// app_users.onboarding_state so a user who bounces mid-flow can resume
// where they left off. The column is optional (nullable jsonb); this
// route is intentionally forgiving — if the column is missing (older
// schema, migration not applied yet) it returns { ok: true, skipped: true }
// so the client can continue without seeing an error.
//
// Body: { step: number, state: object, persona?: WizardPersona, completed?: boolean }
// The `state` blob is opaque to the server — clients own its shape.
// `persona` (G13-W4-IA4 wizard step 1) writes `app_users.account_type` +
// the derived `segment` — only ever between the five wizard personas (a
// reseller / affiliate / journalist / admin row is never re-typed here).
//
// G13-W5-IA5 (W4 review P3-a) — persona lock: a persona may be written only
// while onboarding is incomplete AND the user owns no project. Otherwise a
// change is refused with 400 `persona_locked` (a resave of the SAME persona
// is a no-op, never an error — the wizard resends it on every step). The
// rule lives in `lib/onboarding/flow.ts#personaLockDecision`, shared with
// the wizard page that hides the evaluator cards.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { isWizardPersona, personaLockDecision, WIZARD_PERSONAS } from "@/lib/onboarding/flow";

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

  const { step, state, completed, persona } = (body as {
    step?: number;
    state?: Record<string, unknown>;
    /** S31-B: the wizard's terminal actions set this (or firstStartupCreatedAt). */
    completed?: boolean;
    /** S-IA4 step 1 — one of the five wizard personas. */
    persona?: unknown;
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
  const payload: Record<string, unknown> = {
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
    if (isWizardPersona(persona)) {
      const [{ data: current }, ownsProject] = await Promise.all([
        admin.from("app_users").select("account_type, onboarding_completed").eq("id", user.id).maybeSingle(),
        countOwnedProjects(admin, user.id).then((n) => n > 0),
      ]);
      const row = current as { account_type?: string | null; onboarding_completed?: boolean | null } | null;
      const at = row?.account_type ?? null;
      const decision = personaLockDecision(at, persona, { onboardingCompleted: row?.onboarding_completed === true, ownsProject });
      if (decision === "locked") {
        return NextResponse.json({ ok: false, reason: "persona_locked" }, { status: 400 });
      }
      if (decision === "write" && personaWriteAllowed(at, persona)) {
        // The five wizard personas are 1:1 with the 0073 `segment` enum.
        payload.account_type = persona;
        payload.segment = persona;
      }
    }

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

/** Legacy evaluator account types (0310) the wizard may refine into a persona. */
const LEGACY_RETYPABLE = new Set(["investor", "incubator", "service_provider"]);

/** `projects.user_id = userId` head count; an unreadable table counts as 0 (never locks on a guess). */
async function countOwnedProjects(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string): Promise<number> {
  try {
    const { count } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId);
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

/**
 * The wizard may (re)type an account only between the five wizard personas
 * (plus the legacy evaluator types / null default). Console personas
 * (reseller / affiliate / journalist) keep theirs. Exported for the
 * colocated test. Pure.
 */
export function personaWriteAllowed(currentAccountType: string | null, persona: string): boolean {
  if (!isWizardPersona(persona)) return false;
  if (currentAccountType === null || LEGACY_RETYPABLE.has(currentAccountType)) return true;
  return (WIZARD_PERSONAS as readonly string[]).includes(currentAccountType);
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
