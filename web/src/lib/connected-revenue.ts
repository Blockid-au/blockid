// S17-B — Loader for connected-source MRR signals (server-side only).
//
// Two writers exist today:
//   - Stripe: `api/integrations/stripe/callback` → `writeSignals()` upserts
//     `svi_signals` { provider: "stripe", signal_key: "mrr_aud" } per
//     (user_id, project_id).
//   - Xero:   `api/oauth/xero/callback` upserts an `svi_evidence` row
//     { evidence_type: "xero_revenue" } whose `value_or_url` JSON carries
//     `totalIncomeAud` for the 3-month P&L window → MRR ≈ income / 3.
//
// Both are normalised into `ConnectedRevenueSignal[]` for
// `applyConnectedRevenueBridge()` in `./valuation-mrr-bridge.ts`.
//
// S25-A adds a third, preferred source: `connector_snapshots` (migration
// 0349), the dated history the weekly resync cron writes. A snapshot signal
// carries the ~90-day prior MRR and Stripe churn so the SVI contribution
// table can price growth and churn; the two legacy stores stay as the
// fallback for accounts linked before 0349 was applied.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectedRevenueSignal } from "./valuation-mrr-bridge";
import { loadSnapshotHistory, snapshotToRevenueSignal } from "@/lib/connectors/snapshots";

export const XERO_PL_WINDOW_MONTHS = 3;

interface SignalRow {
  provider: string | null;
  signal_value_num: number | null;
  captured_at: string | null;
}

interface XeroEvidenceRow {
  value_or_url: string | null;
  verified_at: string | null;
  created_at: string | null;
}

/** Pure: turn a `xero_revenue` evidence row into an MRR signal (null when unusable). */
export function xeroEvidenceToSignal(row: XeroEvidenceRow): ConnectedRevenueSignal | null {
  if (!row.value_or_url) return null;
  let parsed: { totalIncomeAud?: unknown } | null = null;
  try {
    parsed = JSON.parse(row.value_or_url) as { totalIncomeAud?: unknown };
  } catch {
    return null;
  }
  const income = typeof parsed?.totalIncomeAud === "number" ? parsed.totalIncomeAud : NaN;
  if (!Number.isFinite(income) || income <= 0) return null;
  const capturedAt = row.verified_at ?? row.created_at;
  if (!capturedAt) return null;
  return {
    provider: "xero",
    mrrAud: Math.round(income / XERO_PL_WINDOW_MONTHS),
    capturedAt,
    origin: "svi_evidence",
  };
}

/**
 * Pure: turn the legacy `api/oauth/stripe/callback` evidence row
 * ({ evidence_type: "stripe", dimension: "tre" }, `value_or_url` JSON with
 * `mrr`) into an MRR signal (null when unusable). S25-A — before this the
 * legacy Stripe path only ever earned the flat +15.
 */
export function stripeEvidenceToSignal(row: XeroEvidenceRow): ConnectedRevenueSignal | null {
  if (!row.value_or_url) return null;
  let parsed: { mrr?: unknown } | null = null;
  try {
    parsed = JSON.parse(row.value_or_url) as { mrr?: unknown };
  } catch {
    return null;
  }
  const mrr = typeof parsed?.mrr === "number" ? parsed.mrr : NaN;
  if (!Number.isFinite(mrr) || mrr <= 0) return null;
  const capturedAt = row.verified_at ?? row.created_at;
  if (!capturedAt) return null;
  return { provider: "stripe", mrrAud: Math.round(mrr), capturedAt, origin: "svi_evidence" };
}

/** Pure: turn an `svi_signals` mrr_aud row into an MRR signal (null when unusable). */
export function sviSignalToRevenue(row: SignalRow): ConnectedRevenueSignal | null {
  if (row.provider !== "stripe" && row.provider !== "xero") return null;
  if (typeof row.signal_value_num !== "number" || !Number.isFinite(row.signal_value_num)) return null;
  if (!row.captured_at) return null;
  return { provider: row.provider, mrrAud: row.signal_value_num, capturedAt: row.captured_at, origin: "svi_signals" };
}

export interface LoadConnectedRevenueArgs {
  /** Project OWNER's user id (svi_signals / connector_snapshots key); null skips both stores. */
  userId: string | null;
  /** Current project scope; `null` matches the legacy no-project rows. */
  projectId: string | null;
  /** svi_accounts.id — enables the Xero evidence lookup when known. */
  accountId?: string | null;
}

/**
 * Read every connected MRR signal for the caller. Never throws — a failed
 * lookup simply yields fewer signals so the valuation still renders.
 */
export async function loadConnectedRevenueSignals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  args: LoadConnectedRevenueArgs,
): Promise<ConnectedRevenueSignal[]> {
  const out: ConnectedRevenueSignal[] = [];

  // S25-A — dated snapshots first (they carry growth + churn history). A
  // provider with a snapshot skips its legacy row so the same figure is not
  // offered twice with different dates.
  const snapshotProviders = new Set<string>();
  if (args.userId) {
    const history = await loadSnapshotHistory(supabase, { userId: args.userId, projectId: args.projectId });
    for (const provider of ["stripe", "xero"] as const) {
      const h = history[provider];
      if (!h) continue;
      const s = snapshotToRevenueSignal(h.latest, h.prior);
      if (s) {
        out.push(s);
        snapshotProviders.add(provider);
      }
    }
  }

  if (args.userId) {
    try {
      let q = supabase
        .from("svi_signals")
        .select("provider, signal_value_num, captured_at")
        .eq("user_id", args.userId)
        .eq("signal_key", "mrr_aud");
      q = args.projectId ? q.eq("project_id", args.projectId) : q.is("project_id", null);
      const { data } = await q.order("captured_at", { ascending: false }).limit(5);
      for (const row of (data as SignalRow[] | null) ?? []) {
        const s = sviSignalToRevenue(row);
        if (s && !snapshotProviders.has(s.provider)) out.push(s);
      }
    } catch (err) {
      console.warn("[blockid:connected-revenue] svi_signals lookup failed", err);
    }
  }

  // S25-A — legacy Stripe evidence row (api/oauth/stripe/callback) when no
  // snapshot and no svi_signals row already covers Stripe.
  if (args.accountId && !snapshotProviders.has("stripe") && !out.some((s) => s.provider === "stripe")) {
    try {
      const { data } = await supabase
        .from("svi_evidence")
        .select("value_or_url, verified_at, created_at")
        .eq("account_id", args.accountId)
        .eq("evidence_type", "stripe")
        .eq("dimension", "tre")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const s = data ? stripeEvidenceToSignal(data as XeroEvidenceRow) : null;
      if (s) out.push(s);
    } catch (err) {
      console.warn("[blockid:connected-revenue] stripe evidence lookup failed", err);
    }
  }

  if (args.accountId && !snapshotProviders.has("xero")) {
    try {
      const { data } = await supabase
        .from("svi_evidence")
        .select("value_or_url, verified_at, created_at")
        .eq("account_id", args.accountId)
        .eq("evidence_type", "xero_revenue")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const s = data ? xeroEvidenceToSignal(data as XeroEvidenceRow) : null;
      if (s) out.push(s);
    } catch (err) {
      console.warn("[blockid:connected-revenue] svi_evidence lookup failed", err);
    }
  }

  return out;
}
