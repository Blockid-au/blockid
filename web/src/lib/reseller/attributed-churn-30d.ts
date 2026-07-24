// Weekly digest — per-reseller attributed churn count over a 30-day window (P11.7).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `attributed_churn_30d` as one of the ongoing signals the Monday digest should
// surface. Before this module the digest surfaced leading signals + audit-log
// anomalies + human_blocked escalations + budget-utilization (P11.1) +
// tier-mix (P11.2) + commission_cleared_mtd (P11.3) + clawback_exposure
// (P11.4) + attributed_mrr (P11.5) + attributed_net_contribution (P11.6) —
// the loss-side twin of P11.5 (which attributed customer subs flipped off in
// the last 30 days, split by cancel vs trial_ended) required an ops user to
// hand-query subscription_trial_state.status in ('canceled','trial_ended_no_payment')
// against the attributed customer set.
//
// Status source: subscription_trial_state.status enum from migration 0075
// (trialing / active / past_due / canceled / incomplete / trial_ended_no_payment).
// The two terminal-loss buckets are:
//   • canceled — paid customer left the funnel
//   • trial_ended_no_payment — trial expired without conversion
// past_due and incomplete are excluded because they can still recover to active
// (a card update or a re-attempted charge lifts them back). They surface via
// leading-signals (inactive_7d/30d) instead so ops sees the recovery signal
// before it becomes a terminal churn.
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested without
// touching Supabase or nodemailer — mirrors attributed-mrr.ts (P11.5) +
// attributed-net-contribution.ts (P11.6).

export const CHURN_WINDOW_DAYS = 30;

export const CHURN_STATUSES = [
  "canceled",
  "trial_ended_no_payment",
] as const;

export type ChurnStatus = (typeof CHURN_STATUSES)[number];

/**
 * One subscription-status row the digest cron passes into computeAttributedChurn30d.
 * The cron resolves the fields by reading subscription_trial_state scoped to
 * the attributed customer set (allUserIds).
 */
export interface ChurnCandidateRow {
  reseller_id: string;
  status: string | null;
  updated_at: string | null;
}

export interface AttributedChurn30d {
  churned_count: number;
  canceled_count: number;
  trial_ended_count: number;
  attributed_total: number;
  churn_pct: number;
}

function emptyChurn(attributed_total: number): AttributedChurn30d {
  return {
    churned_count: 0,
    canceled_count: 0,
    trial_ended_count: 0,
    attributed_total,
    churn_pct: 0,
  };
}

function isChurnStatus(status: string | null): status is ChurnStatus {
  return status === "canceled" || status === "trial_ended_no_payment";
}

function isWithinWindow(updated_at: string | null, now: Date): boolean {
  if (!updated_at) return false;
  const t = Date.parse(updated_at);
  if (!Number.isFinite(t)) return false;
  const windowStart = now.getTime() - CHURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return t >= windowStart && t <= now.getTime();
}

/**
 * Fold candidate rows into a single-reseller aggregate.
 *
 * `attributedTotal` is the size of the reseller's active attributed customer
 * set so churn_pct = churned/attributed × 100 (integer). Passing the total
 * separately keeps the pure lib decoupled from the attribution query: the cron
 * already builds customersByReseller for leading-signals so the count is free.
 *
 * Rows whose status is not a terminal-loss bucket are ignored. Rows whose
 * updated_at falls outside the 30-day window are ignored. Non-finite/absent
 * updated_at is treated as out-of-window (defensive against a garbled ledger
 * row leaking into the count).
 */
export function computeAttributedChurn30d(
  rows: ReadonlyArray<ChurnCandidateRow>,
  opts: { now: Date; attributed_total: number },
): AttributedChurn30d {
  const out = emptyChurn(Math.max(0, Math.floor(opts.attributed_total)));
  for (const r of rows) {
    if (!isChurnStatus(r.status)) continue;
    if (!isWithinWindow(r.updated_at, opts.now)) continue;
    out.churned_count += 1;
    if (r.status === "canceled") out.canceled_count += 1;
    else if (r.status === "trial_ended_no_payment") out.trial_ended_count += 1;
  }
  if (out.attributed_total > 0) {
    out.churn_pct = Math.floor((out.churned_count * 100) / out.attributed_total);
  }
  return out;
}

/**
 * Group candidate rows by reseller_id, then compute one AttributedChurn30d per
 * reseller. Resellers with zero churn still appear with a zeroed aggregate so
 * a partner whose book stayed intact this window is visible rather than absent.
 * `attributedTotals` maps reseller_id → count so churn_pct denominator matches
 * the P11.5 attributed customer set the caller already resolved.
 */
export function computeAttributedChurn30dByReseller(
  resellerIds: ReadonlyArray<string>,
  rows: ReadonlyArray<ChurnCandidateRow>,
  opts: { now: Date; attributedTotals: ReadonlyMap<string, number> },
): Map<string, AttributedChurn30d> {
  const grouped = new Map<string, ChurnCandidateRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.reseller_id) ?? [];
    list.push(r);
    grouped.set(r.reseller_id, list);
  }
  const out = new Map<string, AttributedChurn30d>();
  for (const id of resellerIds) {
    out.set(
      id,
      computeAttributedChurn30d(grouped.get(id) ?? [], {
        now: opts.now,
        attributed_total: opts.attributedTotals.get(id) ?? 0,
      }),
    );
  }
  return out;
}

export interface AttributedChurnRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  churn: AttributedChurn30d;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the attributed-churn section for the weekly digest. Returns an empty
 * string when `rows` is empty so the caller can unconditionally append the
 * result. Ops reads this alongside attributed_mrr (P11.5): MRR is the running-
 * revenue book, churn_30d is the loss column that will erode MRR over the next
 * billing cycle if the terminal-loss trend continues. Rate column renders as
 * "—" when attributed_total is 0 so a partner with no attribution history does
 * not misleadingly render 0% churn.
 */
export function formatWeeklyDigestAttributedChurnSection(
  rows: ReadonlyArray<AttributedChurnRow>,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const totalChurned = sorted.reduce<number>((acc, r) => acc + r.churn.churned_count, 0);
  const totalCanceled = sorted.reduce<number>((acc, r) => acc + r.churn.canceled_count, 0);
  const totalTrialEnded = sorted.reduce<number>((acc, r) => acc + r.churn.trial_ended_count, 0);
  const totalAttributed = sorted.reduce<number>((acc, r) => acc + r.churn.attributed_total, 0);
  const portfolioRate =
    totalAttributed > 0
      ? `${Math.floor((totalChurned * 100) / totalAttributed)}%`
      : "&mdash;";
  const body = sorted
    .map((r) => {
      const c = r.churn;
      const rate = c.attributed_total > 0 ? `${c.churn_pct}%` : "&mdash;";
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${c.attributed_total}</td>
        <td style="text-align:right">${c.canceled_count}</td>
        <td style="text-align:right">${c.trial_ended_count}</td>
        <td style="text-align:right">${c.churned_count}</td>
        <td style="text-align:right">${rate}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Attributed churn (last ${CHURN_WINDOW_DAYS} days)</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller count of attributed customers whose <code>subscription_trial_state.status</code> flipped to <code>canceled</code> or <code>trial_ended_no_payment</code> inside the ${CHURN_WINDOW_DAYS}-day window ending now. <code>past_due</code> and <code>incomplete</code> are excluded because they can still recover; leading-signals (inactive_7d/30d) surfaces those before they become terminal. Rate column is <code>churned ÷ attributed_total × 100</code>; renders as &mdash; when the partner has no attributed customers yet.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Attributed</th>
          <th>Canceled</th>
          <th>Trial ended</th>
          <th>Churned</th>
          <th>Rate</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalAttributed}</strong></td>
          <td style="text-align:right"><strong>${totalCanceled}</strong></td>
          <td style="text-align:right"><strong>${totalTrialEnded}</strong></td>
          <td style="text-align:right"><strong>${totalChurned}</strong></td>
          <td style="text-align:right"><strong>${portfolioRate}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
