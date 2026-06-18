// GET /api/index/headlines — public snapshot of the BlockID Startup Value Index.
// Cached 5 minutes at the edge; SSR'd from this in /index.

import { NextResponse } from "next/server";
import { computeIndexHeadlines } from "@/lib/startup-index-aggregator";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET() {
  const headlines = await computeIndexHeadlines(90);
  return NextResponse.json({ ok: true, ...headlines }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
