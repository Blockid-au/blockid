// GET /api/ai/registry — public read of the current AI provider registry.
// startupvalueindex.com fetches this every 5min and merges into its own
// provider chain. Response is safe to cache (5min) — no keys, only ids.

import { NextResponse } from "next/server";
import { readRegistry } from "@/lib/ai/registry";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const reg = readRegistry();
  return NextResponse.json(reg, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
