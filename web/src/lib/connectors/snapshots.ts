// S25-A — `connector_snapshots` (migration 0349): dated metric pulls from
// Stripe Connect / Xero. Written by the weekly resync cron and (from S25-A)
// by the OAuth callbacks at link time (`source: "callback"`); read by the
// S17-B loader (`lib/connected-revenue.ts`), the rescore route and
// `api/revenue`.
//
// Pure helpers (`metricsChanged`, `snapshotMrrAud`, `pickPriorSnapshot`,
// `snapshotToRevenueSignal`) live next to the two thin Supabase calls so the
// cron and the loaders share one definition of "what counts as a change" and
// "what is this provider's MRR". No `server-only`: the loaders that import
// this already run server-side and the tests import the pure parts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StripeConnectMetrics } from "@/lib/oauth-stripe-signals";
import type { XeroMetrics } from "@/lib/connectors/xero-metrics";
import type { ConnectedRevenueSignal } from "@/lib/valuation-mrr-bridge";

export type ConnectorProvider = "stripe" | "xero";
export type SnapshotSource = "callback" | "resync";

export type StripeSnapshotMetrics = StripeConnectMetrics;
export type XeroSnapshotMetrics = XeroMetrics;

export interface ConnectorSnapshotRow {
  id: string;
  user_id: string;
  project_id: string | null;
  provider: ConnectorProvider;
  taken_at: string;
  metrics: Record<string, unknown>;
  source: SnapshotSource;
}

/** Days between the latest snapshot and the one used as the growth baseline. */
export const GROWTH_BASELINE_DAYS = 90;
/** Tolerance so a snapshot re-pull that differs by float noise is "unchanged". */
export const CHANGE_TOLERANCE_AUD = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Provider-normalised MRR (AUD) for a snapshot; null when unusable. */
export function snapshotMrrAud(row: Pick<ConnectorSnapshotRow, "provider" | "metrics">): number | null {
  const m = row.metrics ?? {};
  if (row.provider === "stripe") return num(m.mrrAud);
  if (row.provider === "xero") {
    const income = num(m.totalIncomeAud);
    const months = num(m.windowMonths) ?? 3;
    if (income === null || income <= 0 || months <= 0) return null;
    return Math.round(income / months);
  }
  return null;
}

/** 90-day churn (Stripe only). */
export function snapshotChurnPct(row: Pick<ConnectorSnapshotRow, "provider" | "metrics">): number | null {
  if (row.provider !== "stripe") return null;
  return num(row.metrics?.churnRate90dPct);
}

/** The fields whose movement means "values changed" (→ rescore + webhook). */
const COMPARED_FIELDS: Record<ConnectorProvider, readonly string[]> = {
  stripe: ["mrrAud", "activeSubscriptions", "activeCustomers", "churnedSubscriptions90d"],
  xero: ["totalIncomeAud", "totalExpensesAud", "netProfitAud", "bankBalanceAud"],
};

/**
 * Pure: did the metrics move since the previous snapshot? No previous
 * snapshot counts as changed (first resync after a callback that predates
 * 0349). Nulls compare by identity; numbers by `CHANGE_TOLERANCE_AUD`.
 */
export function metricsChanged(
  provider: ConnectorProvider,
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
): boolean {
  if (!prev) return true;
  for (const f of COMPARED_FIELDS[provider]) {
    const a = num(prev[f]);
    const b = num(next[f]);
    if (a === null && b === null) continue;
    if (a === null || b === null) return true;
    if (Math.abs(a - b) > CHANGE_TOLERANCE_AUD) return true;
  }
  return false;
}

/**
 * Pure: from a DESC-ordered history for one provider, the snapshot at least
 * `GROWTH_BASELINE_DAYS` before `latest` (closest one to that mark). Null
 * when the history is younger than the baseline.
 */
export function pickPriorSnapshot<T extends Pick<ConnectorSnapshotRow, "taken_at">>(
  latest: T,
  history: T[],
  baselineDays: number = GROWTH_BASELINE_DAYS,
): T | null {
  const cutoff = new Date(latest.taken_at).getTime() - baselineDays * DAY_MS;
  if (!Number.isFinite(cutoff)) return null;
  let best: T | null = null;
  for (const row of history) {
    const t = new Date(row.taken_at).getTime();
    if (!Number.isFinite(t) || t > cutoff) continue;
    if (!best || t > new Date(best.taken_at).getTime()) best = row;
  }
  return best;
}

/** Pure: a snapshot (+ its 90-day prior) as a bridge / score signal. */
export function snapshotToRevenueSignal(
  latest: ConnectorSnapshotRow,
  prior: ConnectorSnapshotRow | null,
): ConnectedRevenueSignal | null {
  const mrr = snapshotMrrAud(latest);
  if (mrr === null) return null;
  const priorMrr = prior ? snapshotMrrAud(prior) : null;
  return {
    provider: latest.provider,
    mrrAud: mrr,
    capturedAt: latest.taken_at,
    priorMrrAud: priorMrr,
    priorCapturedAt: prior?.taken_at ?? null,
    churnRate90dPct: snapshotChurnPct(latest),
    origin: "connector_snapshot",
  };
}

// ── Supabase ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface InsertSnapshotArgs {
  userId: string;
  projectId: string | null;
  provider: ConnectorProvider;
  metrics: StripeSnapshotMetrics | XeroSnapshotMetrics;
  source: SnapshotSource;
  takenAt?: string;
}

/** Insert one dated snapshot. Never throws — a failed insert logs and returns null. */
export async function insertConnectorSnapshot(db: Db, args: InsertSnapshotArgs): Promise<ConnectorSnapshotRow | null> {
  try {
    const { data, error } = await db
      .from("connector_snapshots")
      .insert({
        user_id: args.userId,
        project_id: args.projectId,
        provider: args.provider,
        taken_at: args.takenAt ?? new Date().toISOString(),
        metrics: args.metrics as unknown as Record<string, unknown>,
        source: args.source,
      })
      .select("id, user_id, project_id, provider, taken_at, metrics, source")
      .single();
    if (error) {
      console.warn("[blockid:connector-snapshots] insert failed", { provider: args.provider, code: error.code });
      return null;
    }
    return data as ConnectorSnapshotRow;
  } catch (err) {
    console.warn("[blockid:connector-snapshots] insert threw", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface SnapshotHistory {
  latest: ConnectorSnapshotRow;
  prior: ConnectorSnapshotRow | null;
}

/**
 * Latest snapshot per provider for (owner, project) plus its ~90-day prior.
 * Never throws (a missing table before 0349 is applied yields `{}`).
 */
export async function loadSnapshotHistory(
  db: Db,
  args: { userId: string; projectId: string | null; limit?: number },
): Promise<Partial<Record<ConnectorProvider, SnapshotHistory>>> {
  const out: Partial<Record<ConnectorProvider, SnapshotHistory>> = {};
  try {
    let q = db
      .from("connector_snapshots")
      .select("id, user_id, project_id, provider, taken_at, metrics, source")
      .eq("user_id", args.userId);
    q = args.projectId ? q.eq("project_id", args.projectId) : q.is("project_id", null);
    const { data, error } = await q.order("taken_at", { ascending: false }).limit(args.limit ?? 60);
    if (error || !data) return out;
    const rows = data as ConnectorSnapshotRow[];
    for (const provider of ["stripe", "xero"] as const) {
      const history = rows.filter((r) => r.provider === provider);
      const latest = history[0];
      if (!latest) continue;
      out[provider] = { latest, prior: pickPriorSnapshot(latest, history.slice(1)) };
    }
  } catch (err) {
    console.warn("[blockid:connector-snapshots] history lookup failed", err instanceof Error ? err.message : String(err));
  }
  return out;
}
