/**
 * GET /api/i18n/stats — translation traffic snapshot (T-1403.10).
 *
 * Auth: admin-only. Reuses `x-admin-key` header + `INTERNAL_ADMIN_KEY`
 * env — the same pattern used by other admin diagnostic endpoints
 * (see /api/admin/*). If neither is set the endpoint 404s so it
 * doesn't leak its existence.
 *
 * Response: `{ en: LocaleCounters, vi: LocaleCounters }` — see
 * `translate-stats.ts` for shape. Numbers are process-local and reset
 * on every deploy.
 */

import { NextResponse } from "next/server";
import { snapshotStats } from "@/lib/i18n/translate-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const adminKey = process.env.INTERNAL_ADMIN_KEY ?? "";
  if (!adminKey) return new Response("Not found", { status: 404 });
  const provided = req.headers.get("x-admin-key") ?? "";
  if (provided !== adminKey) return new Response("Not found", { status: 404 });
  return NextResponse.json(snapshotStats(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
