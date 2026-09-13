// GET|POST /api/cron/connector-resync
//
// S25-A — weekly re-pull of every linked Stripe Connect / Xero account so
// `svi_signals.mrr_aud`, the Xero P&L evidence and the valuation bridge stop
// going stale after the one-shot pull at OAuth callback time. Crontab:
// `0 5 * * 1 bash $RUN connector-resync --timeout 300` (Mon 05:00 UTC =
// 15:00 AEST, after the Sunday-night Stripe/Xero settlement runs and inside
// the accounting week).
//
// Per tick (lib/connectors/resync.ts does the work, one connection at a time):
//   1. listResyncCandidates(20) — active rows from `oauth_connections_v2`
//      and the legacy `oauth_connections`, oldest-synced first, skipping
//      anything synced in the last 6 days (MAX_CONNECTIONS_PER_TICK caps
//      the tick; a large fleet drains over consecutive weekly runs — or an
//      operator POSTs again).
//   2. claimConnection() — 15-minute lease via a conditional UPDATE, so an
//      overlapping tick never pulls the same account twice.
//   3. resyncConnection() — open the sealed token (unreadable → one
//      `connector_reconnect` notification per 30 days, nothing pulled),
//      Xero refresh + reseal, pull the callback's metrics, insert a dated
//      `connector_snapshots` row (0349), upsert the dated svi_signals /
//      svi_evidence rows, and when the values changed rescore the account
//      (lib/svi/rescore-from-evidence.ts) + enqueue `svi.rescored`
//      (source "connector_resync").
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (constant-time). `?dry=1`
// lists the candidates the next live tick would take and touches nothing.
// A 240 s budget stops the loop early so maxDuration is never hit mid-pull.
// Nothing here logs a token: the summaries carry row ids and outcomes only.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  MAX_CONNECTIONS_PER_TICK,
  claimConnection,
  listResyncCandidates,
  resyncConnection,
  type ResyncSummary,
} from "@/lib/connectors/resync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const dryRun = isDry(request);
  const startedAt = Date.now();
  const now = new Date(startedAt);

  let candidates;
  try {
    candidates = await listResyncCandidates(supabase, MAX_CONNECTIONS_PER_TICK, now);
  } catch (err) {
    // 42703 / relation errors = migration 0349 not applied yet.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[connector-resync] candidate listing failed", message);
    return NextResponse.json({ ok: false, dryRun, error: "candidates_unavailable", detail: message }, { status: 503 });
  }

  const summaries: ResyncSummary[] = [];
  if (dryRun) {
    for (const c of candidates) {
      summaries.push({ table: c.table, id: c.id, provider: c.provider, project_id: c.projectId, outcome: "would_run" });
    }
    return NextResponse.json({ ok: true, dryRun, candidates: candidates.length, connections: summaries });
  }

  let synced = 0;
  let unchanged = 0;
  let reconnect = 0;
  let failed = 0;
  let skippedLease = 0;
  let budgetExceeded = false;

  for (const c of candidates) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetExceeded = true;
      break;
    }
    const claimed = await claimConnection(supabase, c, new Date());
    if (!claimed) {
      skippedLease++;
      continue;
    }
    const s = await resyncConnection(supabase, c, { now: new Date() });
    summaries.push(s);
    if (s.outcome === "synced") synced++;
    else if (s.outcome === "unchanged") unchanged++;
    else if (s.outcome === "token_unreadable" || s.outcome === "needs_reconnect") reconnect++;
    else if (s.outcome === "failed") failed++;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    candidates: candidates.length,
    processed: summaries.length,
    synced,
    unchanged,
    reconnect,
    failed,
    skippedLease,
    budgetExceeded,
    connections: summaries,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
