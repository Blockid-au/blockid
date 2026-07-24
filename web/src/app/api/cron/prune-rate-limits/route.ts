// /api/cron/prune-rate-limits — delete expired rows from the persistent
// rate-limit table so it doesn't grow unbounded.
//
// The consume_rate_limit RPC only ever inserts a new row when a fresh
// (bucket_key, window_start) pair appears. Old windows stay behind until
// something evicts them. This endpoint calls the SQL helper
// `prune_rate_limits(older_than)` (see migration 0107_rate_limits.sql)
// which deletes any row whose window_start is older than the interval.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` — same pattern as the
// other endpoints under /api/cron/**. Fails closed when the secret env
// var is unset so a misconfigured deploy cannot be triggered externally.
//
// Schedule: NOT wired into any cron scheduler yet — the interval-based
// crons live in the server crontab (per project memory
// project_cloud_routines) and can call this URL with the shared secret
// on whatever cadence we pick (hourly is fine given the 2-hour default
// retention).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_INTERVAL = "2 hours";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

async function handle(request: Request): Promise<Response> {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_unavailable" },
      { status: 503 },
    );
  }

  // Optional ?interval= override, e.g. `?interval=6%20hours` — validated
  // by simple whitelist so we don't hand arbitrary strings to Postgres.
  const url = new URL(request.url);
  const raw = url.searchParams.get("interval");
  const interval = raw && /^[0-9]+\s+(minute|minutes|hour|hours|day|days)$/i.test(raw)
    ? raw
    : DEFAULT_INTERVAL;

  const { data, error } = await supabase.rpc("prune_rate_limits", {
    older_than: interval,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, pruned: 0, interval },
      { status: 500 },
    );
  }

  const pruned = typeof data === "number" ? data : 0;
  return NextResponse.json({ ok: true, pruned, interval });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

// Allow GET too — the server crontab often uses curl -X GET.
export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
