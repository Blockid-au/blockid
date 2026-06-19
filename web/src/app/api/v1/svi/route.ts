// /api/v1/svi — Institutional SVI data API (T_SVI_EXC_0014)
// Auth: Bearer svi_live_... key
// Tiers: free 10/day, team 1k/day, institutional unlimited
//
// GET /api/v1/svi?page=1&pageSize=50&sector=saas&sort=svi
// GET /api/v1/svi?ticker=ACME-AU   (single ticker detail)

import { NextResponse, type NextRequest } from "next/server";
import { authenticateSviApiKey, SVI_API_TIERS } from "@/lib/svi-api-auth";
import { computeListings } from "@/lib/startup-index-listings";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function GET(req: NextRequest) {
  const auth = await authenticateSviApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Valid svi_live_... API key required. Get one at blockid.au/workspace/svi-api" } },
      { status: 401, headers: CORS },
    );
  }

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const sector = searchParams.get("sector") ?? "all";
  const sort = (searchParams.get("sort") ?? "svi") as "svi" | "delta" | "valuation" | "stage" | "recent";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));
  const publicOnly = searchParams.get("publicOnly") !== "false";

  const result = await computeListings({
    filter: { sector, publicOnly },
    sort,
    page,
    pageSize,
  });

  if (ticker) {
    const row = result.rows.find((r) => r.ticker.toUpperCase() === ticker.toUpperCase());
    if (!row) {
      return NextResponse.json({ error: { code: "not_found", message: "Ticker not found" } }, { status: 404, headers: CORS });
    }
    return NextResponse.json({
      ok: true,
      tier: auth.tier,
      data: row,
      _meta: { generatedAt: result.generatedAt },
    }, { headers: CORS });
  }

  return NextResponse.json({
    ok: true,
    tier: auth.tier,
    dailyLimit: SVI_API_TIERS[auth.tier]?.dailyLimit ?? 10,
    data: result.rows,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
    _meta: { generatedAt: result.generatedAt },
  }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
