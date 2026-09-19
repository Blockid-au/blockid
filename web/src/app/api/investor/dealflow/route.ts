// /api/investor/dealflow — GET the investor's deal-flow.
//
// G13-W3-T2 (BA spec Appendix 1): v2 first — rows from `mandate_fit_scores`
// ⋈ `startup_taxonomy` ⋈ latest snapshot keyed on project_id for the
// caller's mandate (`?mandate=` or the default), with the §B.8 filter
// params (industry, model, stage, state, tags, fit, svi, moved, sort — see
// lib/investors/saved-views.ts `filtersFromSearchParams`). Response
// `{ ok, version: 2, count, rows, mandate:{id,label}, filters, views,
// never_computed }`.
//
// Legacy fallback (`version: 1`, `reason: "not_migrated" | "no_mandate"`)
// keeps the pre-0393 contract until the mirror is deleted:
//   ?stage=seed|series_a|...  ?sector=fintech  ?minScore=70
//   ?jurisdiction=AU  ?limit=50
//
// Feature-gated on 'investor.dealflow'. Preferences / mandates are read
// server-side — the client never POSTs them back on every request.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can, recordGateHit } from "@/lib/entitlements";
import { getDealFlow, type StageBand } from "@/lib/investor-portal";
import { detectJurisdiction } from "@/lib/jurisdiction";
import { getDealFlowV2 } from "@/lib/investors/dealflow";
import { filtersFromSearchParams } from "@/lib/investors/saved-views";

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
    await recordGateHit(userSubset, "investor.dealflow", "api", "api/investor/dealflow");
    return NextResponse.json(
      { ok: false, error: "feature_locked", feature: "investor.dealflow" },
      { status: 402 },
    );
  }

  const url = new URL(req.url);

  // v2 (0393): mandate-scored rows keyed on project_id.
  const v2Filters = filtersFromSearchParams(Object.fromEntries(url.searchParams));
  const v2 = await getDealFlowV2(user.id, v2Filters);
  if (v2.migrated && v2.mandate) {
    return NextResponse.json({
      ok: true,
      version: 2,
      count: v2.rows.length,
      rows: v2.rows,
      mandate: { id: v2.mandate.id, label: v2.mandate.label },
      filters: v2Filters,
      views: v2.views,
      never_computed: v2.never_computed,
      total_above_floor: v2.total_above_floor,
    });
  }
  const legacyReason = v2.migrated ? "no_mandate" : "not_migrated";

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
    version: 1,
    reason: legacyReason,
    count: rows.length,
    rows,
    filters: { stage, sector, jurisdiction, minScore, limit },
  });
}
