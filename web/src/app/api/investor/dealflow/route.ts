// /api/investor/dealflow — GET a filtered list of verified startups matched
// against the current investor's stated preferences.
//
// Query params (all optional):
//   ?stage=seed|series_a|...
//   ?sector=fintech
//   ?minScore=70
//   ?jurisdiction=AU
//   ?limit=50
//
// Feature-gated on 'investor.dealflow'. Preferences are read server-side —
// the client never has to POST them back on every request.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can, recordGateHit } from "@/lib/entitlements";
import { getDealFlow, type StageBand } from "@/lib/investor-portal";
import { detectJurisdiction } from "@/lib/jurisdiction";

export const dynamic = "force-dynamic";

const VALID_STAGES: StageBand[] = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "growth",
  "any",
];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "auth_required" },
      { status: 401 },
    );
  }

  const juri = await detectJurisdiction(req);
  const userSubset = {
    id: user.id,
    plan: user.plan ?? "",
    segment: "investor",
    jurisdiction: juri.country,
  };

  const allowed = await can(userSubset, "investor.dealflow");
  if (!allowed) {
    await recordGateHit(userSubset, "investor.dealflow", "api");
    return NextResponse.json(
      { ok: false, error: "feature_locked", feature: "investor.dealflow" },
      { status: 402 },
    );
  }

  const url = new URL(req.url);
  const stageRaw = (url.searchParams.get("stage") ?? "").trim() as StageBand;
  const sector = (url.searchParams.get("sector") ?? "").trim() || null;
  const jurisdiction =
    (url.searchParams.get("jurisdiction") ?? "").trim().toUpperCase() || null;
  const minScoreRaw = url.searchParams.get("minScore");
  const limitRaw = url.searchParams.get("limit");

  const stage = VALID_STAGES.includes(stageRaw) ? stageRaw : null;
  const minScore =
    minScoreRaw && !Number.isNaN(Number(minScoreRaw))
      ? Math.max(0, Math.min(100, Number(minScoreRaw)))
      : null;
  const limit =
    limitRaw && !Number.isNaN(Number(limitRaw))
      ? Math.max(1, Math.min(200, Number(limitRaw)))
      : 50;

  const rows = await getDealFlow(user.id, {
    stage,
    sector,
    jurisdiction,
    minScore,
    limit,
  });

  return NextResponse.json({
    ok: true,
    count: rows.length,
    rows,
    filters: { stage, sector, jurisdiction, minScore, limit },
  });
}
