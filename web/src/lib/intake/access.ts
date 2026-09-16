// Who may create intake links and read the scored inbox (G14 S35, D5).
//
// `intake.manage` (plans.csv: Firm / Program / Fund / VC Enterprise and
// every Programs rung from the Intake link up) OR the evaluator persona
// (`isEvaluatorUser` — account_type, `investor.dealflow`, or an org seat).
// The persona fallback keeps a mid-trial evaluator whose plan row has not
// synced yet from hitting a paywall on their own inbox.

import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser, type AppUser } from "@/lib/auth";
import { can, recordGateHit } from "@/lib/entitlements";
import { isEvaluatorUser } from "@/lib/evaluations";

export const INTAKE_FEATURE = "intake.manage" as const;

export async function canManageIntake(user: Pick<AppUser, "id" | "plan"> | null | undefined): Promise<boolean> {
  if (!user) return false;
  if (await can({ id: user.id, plan: user.plan ?? "", segment: "investor" }, INTAKE_FEATURE)) return true;
  return isEvaluatorUser(user);
}

/** Route gate: 401 anonymous, 402 `feature_locked` (records the gate hit), else the user. */
export async function gateIntakeRequest(): Promise<{ user: AppUser; response: null } | { user: null; response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  if (!(await canManageIntake(user))) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, INTAKE_FEATURE, "api");
    return { user: null, response: NextResponse.json({ ok: false, error: "feature_locked", feature: INTAKE_FEATURE }, { status: 402 }) };
  }
  return { user, response: null };
}
