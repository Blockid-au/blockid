import { NextResponse } from "next/server";
import pkg from "../../../../package.json";

// Wave 31b — machine-readable version endpoint for post-deploy smoke tests
// and Cloudflare cache-purge verification. Kept deliberately tiny: no
// database calls, no secrets, no user context. Runtime pinned to Node so
// `process.uptime()` and `process.version` resolve correctly (Edge would
// return undefined for both).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: pkg.version,
    name: pkg.name,
    ts: new Date().toISOString(),
    node: process.version,
    uptime_sec: Math.floor(process.uptime()),
  });
}
