// /api/investor/preferences — GET/POST the current investor's stated
// preferences (sector, stage, cheque size band, geo).
//
// Writes go to app_users.investor_prefs (jsonb). The column is optional at
// this stage — a missing column returns { ok:false, reason:"column_missing" }
// alongside the merged in-memory state so the UI can degrade gracefully.
//
// T0251 follow-up — the same POST also carries the "Let matching founders
// see me" opt-in as `investor_discoverable: boolean` (app_users column,
// migration 0323). It is written only for evaluator personas
// (account_type / segment); anyone else has the key ignored and the response
// says so (`discoverable_ignored: "evaluator_only"`). GET echoes the current
// flag + persona so the preferences page can render the switch.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";
import {
  DEFAULT_PREFS,
  getInvestorPreferences,
  getInvestorVisibility,
  setInvestorDiscoverable,
  setInvestorPreferences,
  type InvestorPreferences,
} from "@/lib/investor-portal";

export const dynamic = "force-dynamic";

/** Wire body: the prefs patch plus the optional opt-in flag. */
export type InvestorPreferencesBody = Partial<InvestorPreferences> & {
  investor_discoverable?: boolean;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "auth_required", prefs: DEFAULT_PREFS },
      { status: 401 },
    );
  }
  const [prefs, visibility] = await Promise.all([
    getInvestorPreferences(user.id),
    getInvestorVisibility(user.id),
  ]);
  return NextResponse.json({
    ok: true,
    prefs,
    discoverable: visibility.discoverable,
    evaluator: visibility.evaluator,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "auth_required" },
      { status: 401 },
    );
  }

  // Preferences are a paid surface — gate on the investor deal-flow feature
  // rather than plan id, so any investor SKU (Angel and up) is eligible.
  const allowed = await can(
    { id: user.id, plan: user.plan ?? "", segment: "investor" },
    "investor.dealflow",
  );
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "feature_locked", feature: "investor.dealflow" },
      { status: 402 },
    );
  }

  let body: InvestorPreferencesBody = {};
  try {
    body = (await req.json()) as InvestorPreferencesBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  // Split the opt-in flag off the prefs patch. A non-object body (array,
  // scalar) is forwarded verbatim as before — the lib normalises it.
  const isPlainObject = body !== null && typeof body === "object" && !Array.isArray(body);
  const wantsDiscoverable = isPlainObject && typeof body.investor_discoverable === "boolean";
  const patch: Partial<InvestorPreferences> =
    isPlainObject && "investor_discoverable" in body
      ? (Object.fromEntries(Object.entries(body).filter(([k]) => k !== "investor_discoverable")) as Partial<InvestorPreferences>)
      : body;

  const result = await setInvestorPreferences(user.id, patch);

  // Opt-in flag — evaluator personas only. Founders (or anyone without an
  // evaluator account_type / segment) get the key ignored, not an error, so
  // a stray field never blocks a prefs save.
  let discoverable: boolean | undefined;
  let discoverableIgnored: "evaluator_only" | undefined;
  let discoverableReason: string | undefined;
  if (wantsDiscoverable) {
    const visibility = await getInvestorVisibility(user.id);
    if (!visibility.evaluator) {
      discoverable = visibility.discoverable;
      discoverableIgnored = "evaluator_only";
    } else {
      const flag = await setInvestorDiscoverable(user.id, body.investor_discoverable === true);
      discoverable = flag.discoverable;
      discoverableReason = flag.reason;
    }
  }

  const prefsOk = result.ok || result.reason === "column_missing";
  const flagOk = !discoverableReason || discoverableReason === "column_missing";
  return NextResponse.json(
    {
      ok: result.ok && !discoverableReason,
      prefs: result.prefs,
      reason: result.reason ?? discoverableReason,
      ...(discoverable === undefined ? {} : { discoverable }),
      ...(discoverableIgnored ? { discoverable_ignored: discoverableIgnored } : {}),
    },
    { status: prefsOk && flagOk ? 200 : 500 },
  );
}
