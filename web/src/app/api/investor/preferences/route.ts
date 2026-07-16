// /api/investor/preferences — GET/POST the current investor's stated
// preferences (sector, stage, cheque size band, geo).
//
// Writes go to app_users.investor_prefs (jsonb). The column is optional at
// this stage — a missing column returns { ok:false, reason:"column_missing" }
// alongside the merged in-memory state so the UI can degrade gracefully.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";
import {
  DEFAULT_PREFS,
  getInvestorPreferences,
  setInvestorPreferences,
  type InvestorPreferences,
} from "@/lib/investor-portal";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "auth_required", prefs: DEFAULT_PREFS },
      { status: 401 },
    );
  }
  const prefs = await getInvestorPreferences(user.id);
  return NextResponse.json({ ok: true, prefs });
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

  let body: Partial<InvestorPreferences> = {};
  try {
    body = (await req.json()) as Partial<InvestorPreferences>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const result = await setInvestorPreferences(user.id, body);
  return NextResponse.json(
    { ok: result.ok, prefs: result.prefs, reason: result.reason },
    { status: result.ok ? 200 : result.reason === "column_missing" ? 200 : 500 },
  );
}
