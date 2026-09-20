// batch-gate — the one gate every BlockID Cohort route shares (G21 P2-A).
//
// Same rule as POST /api/evaluations/batch (T0272): the caller must hold
// `lp_export` OR `accelerator.cohort` (canBatchScore). 401 anonymous, 403
// feature_locked with the Program upgrade hint (+ recordGateHit so the
// funnel sees the paywall). The batch route keeps its own inline copy so its
// colocated test mocks stay untouched; new routes import this.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type AppUser } from "@/lib/auth";
import { getEntitlements, recordGateHit } from "@/lib/entitlements";
import { canBatchScore } from "./batch-shared";

export const BATCH_UPGRADE_HINT =
  "Batch scoring is included in Program (A$349/mo — 100 Trusted Business Reports, 200 tracked startups, 5 seats). Upgrade at /pricing?segment=evaluator.";

export async function gateBatchRequest(surface: string): Promise<{ user: AppUser; flags: string[]; response: null } | { user: null; flags: string[]; response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, flags: [], response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  }
  const flags = await getEntitlements(user.plan ?? "", user.id);
  if (!canBatchScore(flags)) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "lp_export", "api", surface);
    return {
      user: null,
      flags,
      response: NextResponse.json(
        { ok: false, error: "feature_locked", feature: "lp_export", message: BATCH_UPGRADE_HINT, upgrade_url: "/pricing?segment=evaluator" },
        { status: 403 },
      ),
    };
  }
  return { user, flags, response: null };
}
