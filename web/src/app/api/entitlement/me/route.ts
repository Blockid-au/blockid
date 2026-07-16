// GET /api/entitlement/me — canonical snapshot for the current session.
//
// The client hook (useEntitlement) polls this every 60s and on window-focus.
// Server components and route handlers should NOT call this endpoint — they
// have direct access to `can()` from `@/lib/entitlements`. This route exists
// purely to project the server-side entitlement state to the browser.

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, type UserWithPlan } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  trialSummary,
  type SubscriptionTrialState,
  type TrialSummary,
} from "@/lib/trial";

export const dynamic = "force-dynamic";

interface EntitlementMeResponse {
  user_id: string | null;
  plan: string;
  segment: string;
  jurisdiction: string | null;
  legal_review_passed: boolean;
  entitlements: string[];
  trial: TrialSummary;
}

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();

  // Anonymous: return the free-tier entitlements without any DB roundtrip
  // beyond the plans lookup. Callers gate everything visible on `user_id`.
  if (!user) {
    const entitlements = await getEntitlements("free");
    const body: EntitlementMeResponse = {
      user_id: null,
      plan: "free",
      segment: "founder",
      jurisdiction: null,
      legal_review_passed: false,
      entitlements,
      trial: emptyTrial(),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  const plan = user.plan ?? "free";
  const segment = await resolveSegment(user.id);
  const jurisdiction = await resolveJurisdiction(user.id);

  const uwp: UserWithPlan = {
    id: user.id,
    plan,
    segment,
    jurisdiction: jurisdiction ?? undefined,
  };

  const [entitlements, trialState] = await Promise.all([
    getEntitlements(plan),
    loadTrialState(user.id),
  ]);

  const body: EntitlementMeResponse = {
    user_id: user.id,
    plan,
    segment,
    jurisdiction,
    legal_review_passed: false,
    entitlements,
    trial: trialSummary(uwp, trialState),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}

// ---------------------------------------------------------------------------
// resolveSegment — read `app_users.segment` (added in 0073_user_segments.sql).
// Falls back to 'founder' if the column is missing (pre-migration DB) or the
// value is out of range.
// ---------------------------------------------------------------------------

async function resolveSegment(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "founder";
  try {
    const { data } = await supabase
      .from("app_users")
      .select("segment")
      .eq("id", userId)
      .maybeSingle();
    const seg = (data as { segment?: string } | null)?.segment;
    return typeof seg === "string" && seg.length > 0 ? seg : "founder";
  } catch {
    return "founder";
  }
}

async function resolveJurisdiction(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("app_users")
      .select("jurisdiction")
      .eq("id", userId)
      .maybeSingle();
    const j = (data as { jurisdiction?: string | null } | null)?.jurisdiction;
    return typeof j === "string" && j.length > 0 ? j : null;
  } catch {
    return null;
  }
}

async function loadTrialState(userId: string): Promise<SubscriptionTrialState | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("subscription_trial_state")
      .select(
        "user_id, stripe_subscription_id, plan_id, trial_start, trial_end, status, payment_method_id, reminder_sent, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle();
    return (data as SubscriptionTrialState | null) ?? null;
  } catch {
    return null;
  }
}

function emptyTrial(): TrialSummary {
  return {
    inTrial: false,
    daysLeft: 0,
    endsAt: null,
    requiresPayment: false,
    status: null,
    planId: null,
  };
}
