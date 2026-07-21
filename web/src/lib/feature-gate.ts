// Shared feature-gate helper for route handlers — per
// docs/plans/reseller-module-plan.md § U.15.12 R-03 and § P8.2.
//
// Every mutation handler in `feature-gates.manifest.ts` calls
// `gateRequireFeature(featureKey)` at the top and bails out with the returned
// NextResponse when the gate returns `{ ok: false, response }`. The success
// branch carries the current user + a UserWithPlan projection so the handler
// can skip its own duplicate auth check.
//
// Wire pattern:
//
//     export async function POST(request: Request) {
//       const gate = await gateRequireFeature("share_management");
//       if (!gate.ok) return gate.response;
//       const user = gate.user;
//       // …rest of handler…
//     }
//
// Status codes:
//   401 not authenticated → `{ ok: false, error: "Authentication required" }`
//   402 feature locked    → `{ ok: false, error: "feature_locked", feature }`
//
// The 402 shape mirrors the upgrade-CTA funnel — the client can read
// `feature` off the response and redirect to `/pricing?feature=<key>` without
// a second server roundtrip.

import "server-only";

import { NextResponse } from "next/server";

import { getCurrentUser, type AppUser } from "@/lib/auth";
import {
  EntitlementError,
  requireFeature,
  type Feature,
  type UserWithPlan,
} from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface FeatureGateSuccess {
  ok: true;
  user: AppUser;
  uwp: UserWithPlan;
}

export interface FeatureGateFailure {
  ok: false;
  response: NextResponse;
}

export type FeatureGateResult = FeatureGateSuccess | FeatureGateFailure;

export async function gateRequireFeature(
  feature: Feature,
): Promise<FeatureGateResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  const plan = user.plan ?? "free";
  const segment = await resolveSegment(user.id);
  const uwp: UserWithPlan = { id: user.id, plan, segment };

  try {
    await requireFeature(uwp, feature);
  } catch (err) {
    if (err instanceof EntitlementError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "feature_locked",
            feature: err.feature,
            reason: err.reason,
          },
          { status: 402 },
        ),
      };
    }
    throw err;
  }

  return { ok: true, user, uwp };
}

async function resolveSegment(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "founder";
  try {
    const { data } = await supabase
      .from("app_users")
      .select("segment")
      .eq("id", userId)
      .maybeSingle();
    const seg = (data as { segment?: string | null } | null)?.segment;
    return typeof seg === "string" && seg.length > 0 ? seg : "founder";
  } catch {
    return "founder";
  }
}
