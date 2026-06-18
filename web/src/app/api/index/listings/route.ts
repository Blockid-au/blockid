// GET /api/index/listings — paginated ranked listing of every analysed startup.
// Anonymous tickers; opt-in public names.

import { NextResponse, type NextRequest } from "next/server";
import { computeListings, type ListingFilter, type ListingSort } from "@/lib/startup-index-listings";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const filter: ListingFilter = {
    sector: q.get("sector") ?? "all",
    stage: q.get("stage") === "all" || q.get("stage") == null ? "all" : Number(q.get("stage")),
    publicOnly: q.get("public_only") === "true",
    revenueOnly: q.get("revenue_only") === "true",
  };
  const sort = (q.get("sort") as ListingSort | null) ?? "svi";
  const order = (q.get("order") as "asc" | "desc" | null) ?? "desc";
  const page = Math.max(1, Number(q.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(q.get("pageSize") ?? 50)));

  const result = await computeListings({ filter, sort, order, page, pageSize });
  return NextResponse.json({ ok: true, ...result }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
