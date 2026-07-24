// Weekly digest — per-reseller ledger drift between revenue_events and
// reseller_commissions (P11.8).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `ledger_drift_events` as one of the ongoing signals the Monday digest should
// surface. Before this module the digest surfaced leading signals + audit-log
// anomalies + human_blocked escalations + budget-utilization (P11.1) +
// tier-mix (P11.2) + commission_cleared_mtd (P11.3) + clawback_exposure
// (P11.4) + attributed_mrr (P11.5) + attributed_net_contribution (P11.6) +
// attributed_churn_30d (P11.7) — the correctness signal (does every attributed
// stripe-event have a matching commission row?) required an ops user to
// hand-diff revenue_events.stripe_event_id against reseller_commissions.stripe_event_id
// per reseller.
//
// Two drift buckets per reseller:
//   • missing_commission — revenue_events with reseller_id set AND kind in the
//     revenue-recognising set (subscribe/renewal/upgrade/downgrade/trial_convert)
//     AND no matching reseller_commissions row on stripe_event_id. This is the
//     load-bearing case: an attributed customer paid, the reseller expects a
//     commission accrual, but the ledger has no row → payout would silently
//     skip this event.
//   • orphan_commission — reseller_commissions rows whose stripe_event_id has
//     no matching revenue_events row in the window. Rarer (both sides usually
//     write from the same webhook path) but visible for the manual-INSERT case
//     or a webhook-handler misconfiguration that writes the commission but
//     never emits the revenue event.
//
// The window is caller-controlled (the cron passes the last 7 days) so a
// long-standing pre-fix drift row does not silently pollute the digest week
// after week — ops fixes it, the window rolls forward, the row disappears.
//
// Kept dependency-free so the shape can be regression-tested without touching
// Supabase — mirrors budget-utilization.ts (P11.1) + tier-mix.ts (P11.2) +
// commission-cleared-mtd.ts (P11.3) + clawback-exposure.ts (P11.4) +
// attributed-mrr.ts (P11.5) + attributed-net-contribution.ts (P11.6) +
// attributed-churn-30d.ts (P11.7).

export const LEDGER_DRIFT_WINDOW_DAYS = 7;

// The kinds we expect to produce a reseller_commissions accrual when
// revenue_events.reseller_id is set. Excludes trial_start (no charge),
// refund/chargeback (handled via commission-events append log), credit_pack
// (no attribution-side commission accrual).
export const COMMISSION_TRIGGERING_KINDS = [
  "subscribe",
  "renewal",
  "upgrade",
  "downgrade",
  "trial_convert",
] as const;

export type CommissionTriggeringKind = (typeof COMMISSION_TRIGGERING_KINDS)[number];

export function isCommissionTriggeringKind(
  kind: string | null | undefined,
): kind is CommissionTriggeringKind {
  return typeof kind === "string" && (COMMISSION_TRIGGERING_KINDS as readonly string[]).includes(kind);
}

/**
 * One revenue_events row the drift check reads. Only the fields the check
 * needs — the cron scopes the underlying query to reseller_id IS NOT NULL
 * inside the drift window.
 */
export interface RevenueEventDriftRow {
  reseller_id: string | null;
  stripe_event_id: string | null;
  kind: string | null;
  ts: string | null;
}

/**
 * One reseller_commissions row the drift check reads. Only the fields the
 * check needs.
 */
export interface CommissionDriftRow {
  reseller_id: string;
  stripe_event_id: string;
  created_at: string | null;
}

export interface LedgerDrift {
  missing_commission_count: number;
  orphan_commission_count: number;
  total_drift_count: number;
}

function emptyDrift(): LedgerDrift {
  return {
    missing_commission_count: 0,
    orphan_commission_count: 0,
    total_drift_count: 0,
  };
}

/**
 * Fold revenue-event + commission rows into per-reseller drift aggregates.
 *
 * missing_commission = revenue_events (reseller-attributed, revenue-kind) with
 * no matching commission row on stripe_event_id.
 *
 * orphan_commission = commission rows with no matching revenue_events row on
 * stripe_event_id.
 *
 * Rows with a null/blank stripe_event_id contribute to neither bucket (they
 * cannot be joined) — the cron should scope its queries to non-null so this
 * defensive branch never fires in practice.
 */
export function computeLedgerDriftByReseller(
  resellerIds: ReadonlyArray<string>,
  revenueRows: ReadonlyArray<RevenueEventDriftRow>,
  commissionRows: ReadonlyArray<CommissionDriftRow>,
): Map<string, LedgerDrift> {
  const out = new Map<string, LedgerDrift>();
  for (const id of resellerIds) out.set(id, emptyDrift());

  const commissionEventIds = new Set<string>();
  const commissionsByReseller = new Map<string, CommissionDriftRow[]>();
  for (const c of commissionRows) {
    if (c.stripe_event_id) commissionEventIds.add(c.stripe_event_id);
    const list = commissionsByReseller.get(c.reseller_id) ?? [];
    list.push(c);
    commissionsByReseller.set(c.reseller_id, list);
  }

  const revenueEventIds = new Set<string>();
  for (const r of revenueRows) {
    if (!r.reseller_id) continue;
    if (!r.stripe_event_id) continue;
    if (!isCommissionTriggeringKind(r.kind)) continue;
    revenueEventIds.add(r.stripe_event_id);
    if (!commissionEventIds.has(r.stripe_event_id)) {
      const agg = out.get(r.reseller_id);
      if (!agg) continue;
      agg.missing_commission_count += 1;
      agg.total_drift_count += 1;
    }
  }

  for (const c of commissionRows) {
    if (!c.stripe_event_id) continue;
    if (revenueEventIds.has(c.stripe_event_id)) continue;
    const agg = out.get(c.reseller_id);
    if (!agg) continue;
    agg.orphan_commission_count += 1;
    agg.total_drift_count += 1;
  }

  return out;
}

export interface LedgerDriftRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  drift: LedgerDrift;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the ledger-drift section for the weekly digest. Returns an empty
 * string when `rows` is empty so the caller can unconditionally append the
 * result. Ops reads this alongside commission_cleared_mtd (P11.3) +
 * clawback_exposure (P11.4): cleared is realised revenue, exposure is the
 * still-at-risk pile, and drift is the correctness gate — every attributed
 * Stripe event should have both a revenue_events row (CFO ledger) and a
 * reseller_commissions row (payout ledger). Any non-zero row here is a bug
 * report to investigate before the monthly reconciliation cron ships.
 */
export function formatWeeklyDigestLedgerDriftSection(
  rows: ReadonlyArray<LedgerDriftRow>,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const totalMissing = sorted.reduce<number>(
    (acc, r) => acc + r.drift.missing_commission_count,
    0,
  );
  const totalOrphan = sorted.reduce<number>(
    (acc, r) => acc + r.drift.orphan_commission_count,
    0,
  );
  const totalDrift = totalMissing + totalOrphan;
  const body = sorted
    .map((r) => {
      const d = r.drift;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${d.missing_commission_count}</td>
        <td style="text-align:right">${d.orphan_commission_count}</td>
        <td style="text-align:right">${d.total_drift_count}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Ledger drift events (last ${LEDGER_DRIFT_WINDOW_DAYS} days)</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller mismatches between <code>revenue_events</code> (CFO ledger) and <code>reseller_commissions</code> (payout ledger) joined on <code>stripe_event_id</code>. <strong>Missing commission</strong> = a revenue-recognising event (<code>${COMMISSION_TRIGGERING_KINDS.join("/")}</code>) with <code>reseller_id</code> set had no matching commission accrual — the reseller expects a payout but the ledger has no row. <strong>Orphan commission</strong> = a commission row whose stripe event has no matching revenue_events row in the window — usually a manual insert or a webhook misconfiguration. Any non-zero row is a bug to investigate before the monthly reconciliation cron ships.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Missing commission</th>
          <th>Orphan commission</th>
          <th>Total drift</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalMissing}</strong></td>
          <td style="text-align:right"><strong>${totalOrphan}</strong></td>
          <td style="text-align:right"><strong>${totalDrift}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
