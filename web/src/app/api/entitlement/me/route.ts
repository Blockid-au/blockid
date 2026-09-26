// GET /api/entitlement/me — canonical snapshot for the current session.
//
// The client hook (useEntitlement) polls this every 60s and on window-focus.
// Server components and route handlers should NOT call this endpoint — they
// have direct access to `can()` from `@/lib/entitlements`. This route exists
// purely to project the server-side entitlement state to the browser.

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, type UserWithPlan } from "@/lib/entitlements";
import { hasActiveResellerMembership } from "@/lib/reseller/scope";
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
  account_type: string | null;
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
      account_type: null,
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

  // G33 T15 — one stage instead of three: the profile read (segment +
  // account_type + jurisdiction, formerly two sequential app_users reads) is
  // independent of the entitlement / trial / reseller lookups, so all four
  // run together. This route is polled by every signed-in tab.
  const [{ segment, accountType, jurisdiction }, entitlements, trialState, isResellerMember] = await Promise.all([
    resolveProfile(user.id),
    // user.id makes this add-on-aware: a founder paying for the Equity
    // add-on gets its features unioned onto their plan bundle here, so the
    // client hook and the sidebar see the same set the server gates on.
    getEntitlements(plan, user.id),
    loadTrialState(user.id),
    hasActiveResellerMembership(user.id),
  ]);

  const uwp: UserWithPlan = {
    id: user.id,
    plan,
    segment,
    jurisdiction: jurisdiction ?? undefined,
  };

  // Reseller owners often keep a founder plan (growth / enterprise) so they
  // can also run their own startup on the same account. Their plan bundle
  // therefore lacks the `reseller.*` entitlements even though the DB shows
  // them as an active reseller admin. Merge the reseller-console bundle in
  // so the sidebar renders the Reseller nav group + the /reseller layout
  // gate accepts them. Server-side gates on `/api/reseller/*` still call
  // scopedReseller() which re-checks reseller_admins independently.
  const mergedEntitlements = isResellerMember
    ? Array.from(new Set([
        ...entitlements,
        "reseller.console",
        "reseller.create_startup",
        "reseller.grant_credits",
      ]))
    : entitlements;

  const body: EntitlementMeResponse = {
    user_id: user.id,
    plan,
    segment,
    account_type: accountType,
    jurisdiction,
    legal_review_passed: false,
    entitlements: mergedEntitlements,
    trial: trialSummary(uwp, trialState),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}

// ---------------------------------------------------------------------------
// resolveProfile — read `app_users.segment` (added in 0073_user_segments.sql),
// `account_type` and `jurisdiction`. Falls back to 'founder' / null if a
// column is missing (pre-migration DB) or the value is out of range.
// ---------------------------------------------------------------------------

/**
 * `segment` + `account_type` + `jurisdiction` in one app_users read.
 * `account_type` (reseller / affiliate / journalist / investor / …) is what
 * `resolvePersona()` needs to pick the console bridge; without it every
 * reseller rendered the founder sidebar (W1 review P2). Every field falls
 * back independently (segment → 'founder', the others → null).
 */
async function resolveProfile(
  userId: string,
): Promise<{ segment: string; accountType: string | null; jurisdiction: string | null }> {
  const fallback = { segment: "founder", accountType: null, jurisdiction: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallback;
  try {
    const { data } = await supabase
      .from("app_users")
      .select("segment, account_type, jurisdiction")
      .eq("id", userId)
      .maybeSingle();
    const row = data as { segment?: string | null; account_type?: string | null; jurisdiction?: string | null } | null;
    const seg = row?.segment;
    const at = row?.account_type;
    const j = row?.jurisdiction;
    return {
      segment: typeof seg === "string" && seg.length > 0 ? seg : "founder",
      accountType: typeof at === "string" && at.length > 0 ? at : null,
      jurisdiction: typeof j === "string" && j.length > 0 ? j : null,
    };
  } catch {
    return fallback;
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
