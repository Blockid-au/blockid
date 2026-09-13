// GET|POST /api/cron/chain-reconcile (S27-B)
//
// Weekly read-back of every tokenised project's share-token contract against
// its off-chain register. Crontab: `0 6 * * 0 bash $RUN chain-reconcile
// --timeout 300` (Sunday 06:00 UTC = 16:00 AEST, after the Saturday-night
// blockchain-sync drains and before the Monday connector resync).
//
// Per tick:
//   1. list ≤ 50 `blockchain_sync_config` rows with a token address AND a
//      project_id, oldest reconciliation first (rows never reconciled come
//      first) — a larger fleet drains over consecutive Sundays.
//   2. runProjectReconciliation() per project (lib/onchain/reconcile-project.ts)
//      keyed on the project OWNER (`projects.user_id`), persisting one
//      `cap_table_chain_reconciliations` row (0365).
//   3. status drift → one `chain_drift` founder notification per project per
//      7 days (lib/onchain/notify-drift.ts). Unreachable chain → the row says
//      `unreachable`, no notification, and the tick carries on.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (constant-time). `?dry=1`
// lists the projects the next live tick would take and writes nothing —
// no reconciliation row, no notification, no RPC call.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runProjectReconciliation } from "@/lib/onchain/reconcile-project";
import { notifyChainDrift } from "@/lib/onchain/notify-drift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const MAX_PROJECTS_PER_TICK = 50;
const BUDGET_MS = 240_000;

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

interface Candidate {
  projectId: string;
  ownerUserId: string;
  accountId: string;
  tokenAddress: string;
  symbol: string | null;
  lastTakenAt: string | null;
}

interface Summary {
  project_id: string;
  outcome: "in_sync" | "drift" | "unreachable" | "no_token" | "failed" | "would_run";
  drift_count?: number;
  notified?: boolean;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listCandidates(db: any, limit: number): Promise<Candidate[]> {
  const { data: configs, error } = await db
    .from("blockchain_sync_config")
    .select("account_id, project_id, token_address, token_symbol")
    .not("token_address", "is", null)
    .not("project_id", "is", null)
    .limit(500);
  if (error) throw new Error(error.message ?? "config listing failed");
  const rows = (configs ?? []) as Array<{ account_id: string; project_id: string; token_address: string; token_symbol: string | null }>;
  if (rows.length === 0) return [];

  const projectIds = rows.map((r) => r.project_id);
  const [{ data: projects }, { data: recent }] = await Promise.all([
    db.from("projects").select("id, user_id, archived_at").in("id", projectIds),
    db
      .from("cap_table_chain_reconciliations")
      .select("project_id, taken_at")
      .in("project_id", projectIds)
      .order("taken_at", { ascending: false })
      .limit(2000),
  ]);
  const owner = new Map<string, { user_id: string; archived: boolean }>();
  for (const p of (projects ?? []) as Array<{ id: string; user_id: string; archived_at: string | null }>) {
    owner.set(p.id, { user_id: p.user_id, archived: Boolean(p.archived_at) });
  }
  const lastTaken = new Map<string, string>();
  for (const r of (recent ?? []) as Array<{ project_id: string; taken_at: string }>) {
    if (!lastTaken.has(r.project_id)) lastTaken.set(r.project_id, r.taken_at);
  }

  const out: Candidate[] = [];
  for (const r of rows) {
    const o = owner.get(r.project_id);
    if (!o || o.archived) continue;
    out.push({
      projectId: r.project_id,
      ownerUserId: o.user_id,
      accountId: r.account_id,
      tokenAddress: r.token_address,
      symbol: r.token_symbol,
      lastTakenAt: lastTaken.get(r.project_id) ?? null,
    });
  }
  out.sort((a, b) => (a.lastTakenAt ?? "").localeCompare(b.lastTakenAt ?? ""));
  return out.slice(0, limit);
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

  let candidates: Candidate[];
  try {
    candidates = await listCandidates(supabase, MAX_PROJECTS_PER_TICK);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[chain-reconcile] candidate listing failed", message);
    return NextResponse.json({ ok: false, dryRun, error: "candidates_unavailable", detail: message }, { status: 503 });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, dryRun, noop: true, candidates: 0, projects: [] });
  }

  const summaries: Summary[] = [];
  if (dryRun) {
    for (const c of candidates) summaries.push({ project_id: c.projectId, outcome: "would_run" });
    return NextResponse.json({ ok: true, dryRun, candidates: candidates.length, projects: summaries });
  }

  let inSync = 0;
  let drift = 0;
  let unreachable = 0;
  let failed = 0;
  let notified = 0;
  let budgetExceeded = false;

  for (const c of candidates) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetExceeded = true;
      break;
    }
    try {
      const outcome = await runProjectReconciliation(supabase, {
        projectId: c.projectId,
        ownerUserId: c.ownerUserId,
        sviAccountId: c.accountId,
        source: "cron",
      });
      const s: Summary = { project_id: c.projectId, outcome: outcome.status, drift_count: outcome.driftCount };
      if (outcome.status === "in_sync") inSync++;
      else if (outcome.status === "unreachable") {
        unreachable++;
        s.error = outcome.error ?? undefined;
      } else if (outcome.status === "drift" && outcome.result) {
        drift++;
        s.notified = await notifyChainDrift({ ownerUserId: c.ownerUserId, projectId: c.projectId, symbol: c.symbol, result: outcome.result });
        if (s.notified) notified++;
      }
      summaries.push(s);
    } catch (err) {
      failed++;
      summaries.push({ project_id: c.projectId, outcome: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    candidates: candidates.length,
    processed: summaries.length,
    inSync,
    drift,
    unreachable,
    failed,
    notified,
    budgetExceeded,
    projects: summaries,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
