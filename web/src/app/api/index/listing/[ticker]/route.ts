// GET /api/index/listing/[ticker] — detail data for the per-ticker page.

import { NextResponse } from "next/server";
import { computeListingDetail } from "@/lib/startup-index-listings";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { ticker } = await ctx.params;
  const detail = await computeListingDetail(ticker);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "Ticker not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
