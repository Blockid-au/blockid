// GET|POST /api/cron/account-erasure — daily (S24-B, 2026-09-12).
//
// Erases every account whose self-service deletion request
// (`app_users.deletion_requested_at`, POST /api/account/delete) is older
// than the 7-day grace period and has not been cancelled. Each account goes
// through eraseAccount(): Stripe cancel + detach first, then the atomic
// `erase_account` RPC (0348), storage purge, and one `account.erased` audit
// row (actor "cron"). A failure on one account (e.g. Stripe unreachable) is
// reported and retried on the next tick — the request stays pending.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (isCronAuthorised).
// `?dry=1` lists who is due and returns the per-table counts without writing
// anything. `?limit=N` caps accounts per tick (1..25).
//
// Crontab: `20 3 * * *` — after the Monday privacy-retention sweep window.
// cron-runner.sh appends the JSON body to content/reports/cron-health.jsonl.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ERASURE_BATCH_MAX, GRACE_DAYS, listDueForErasure } from "@/lib/privacy/deletion-request";
import { eraseAccount, type EraseAccountResult, type EraseRpcReport } from "@/lib/privacy/erase-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function params(request: Request): { dryRun: boolean; limit: number } {
  try {
    const sp = new URL(request.url).searchParams;
    const dry = sp.get("dry");
    const raw = sp.get("limit");
    const n = raw ? Number.parseInt(raw, 10) : ERASURE_BATCH_MAX;
    return { dryRun: dry === "1" || dry === "true", limit: Number.isFinite(n) ? Math.max(1, Math.min(n, ERASURE_BATCH_MAX)) : ERASURE_BATCH_MAX };
  } catch {
    return { dryRun: false, limit: ERASURE_BATCH_MAX };
  }
}

export interface AccountErasureSummary {
  ok: boolean;
  dryRun: boolean;
  now: string;
  graceDays: number;
  due: number;
  erased: number;
  failed: number;
  accounts: { user_id: string; requested_at: string; ok: boolean; error?: string; totals?: EraseRpcReport["totals"]; stripe?: EraseAccountResult["stripe"] }[];
  duration_ms: number;
  error?: string;
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { dryRun, limit } = params(request);
  const now = new Date();
  const started = Date.now();
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });

  let due: { id: string; deletion_requested_at: string }[];
  try {
    due = await listDueForErasure(db, now, limit);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `list_failed: ${(e as Error).message}` }, { status: 500 });
  }

  const summary: AccountErasureSummary = {
    ok: true,
    dryRun,
    now: now.toISOString(),
    graceDays: GRACE_DAYS,
    due: due.length,
    erased: 0,
    failed: 0,
    accounts: [],
    duration_ms: 0,
  };

  for (const row of due) {
    const r = await eraseAccount(row.id, { dryRun, reason: "self_service_grace_elapsed", actor: "cron", actorUserId: null, db });
    const entry: AccountErasureSummary["accounts"][number] = { user_id: row.id, requested_at: row.deletion_requested_at, ok: r.ok };
    if (r.report) entry.totals = r.report.totals;
    entry.stripe = r.stripe;
    if (r.ok) summary.erased++;
    else {
      summary.failed++;
      entry.error = r.error;
    }
    summary.accounts.push(entry);
  }

  summary.ok = summary.failed === 0;
  summary.duration_ms = Date.now() - started;
  if (!summary.ok) summary.error = "erasure_failed";
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
