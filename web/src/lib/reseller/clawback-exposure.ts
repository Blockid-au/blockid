// Weekly digest — per-reseller pending-commission clawback exposure (P11.4).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `clawback_exposure` as one of the ongoing signals the Monday digest should
// surface. Before this module the digest surfaced leading signals + audit-log
// anomalies + human_blocked escalations + budget-utilization (P11.1) +
// tier-mix (P11.2) + commission_cleared_mtd (P11.3) — the at-risk (still
// clawbackable) commissions required an ops user to open /admin/resellers/[code]
// per row and hand-sum reseller_commissions_current rows whose status is
// pending_clearance or dispute_open.
//
// A commission is "exposed" while its status is still one of:
//   - pending_clearance — accrued, not yet past pending_until; nightly P3.3
//     will move it to cleared unless a refund/dispute/void arrives first.
//   - dispute_open      — Stripe raised a dispute; outcome (dispute_won or
//     dispute_lost) has not yet landed. dispute_lost clawbacks the full amount.
// Rows already in cleared / clawed_back / partially_refunded are excluded —
// cleared has passed the clawback window, clawed_back is already realised,
// partially_refunded had its delta applied via the event log and the residual
// remains exposed but the reseller_commissions_current view will still report
// its status as partially_refunded (an explicit terminal-ish state) so the
// digest chooses to surface only the unresolved pending + dispute buckets.
//
// Two aggregates per reseller so ops can eyeball the split without spreadsheeting:
//   - pending_count / pending_cents — status='pending_clearance' rows
//   - dispute_count / dispute_cents — status='dispute_open' rows
//   - total_count   / total_cents   — sum of the two, for the section footer
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested
// without touching Supabase or nodemailer — mirrors budget-utilization.ts
// (P11.1) + tier-mix.ts (P11.2) + commission-cleared-mtd.ts (P11.3).

/**
 * One at-risk commission row shape the digest cron passes into
 * computeClawbackExposure. The cron resolves the two fields by reading
 * reseller_commissions_current (the derived-status view from migration 0094)
 * and filtering to status IN ('pending_clearance','dispute_open') for the
 * active reseller set.
 */
export interface ExposedCommissionRow {
  reseller_id: string;
  commission_aud_cents: number;
  status: "pending_clearance" | "dispute_open";
}

export interface ClawbackExposure {
  pending_count: number;
  pending_cents: number;
  dispute_count: number;
  dispute_cents: number;
  total_count: number;
  total_cents: number;
}

function emptyExposure(): ClawbackExposure {
  return {
    pending_count: 0,
    pending_cents: 0,
    dispute_count: 0,
    dispute_cents: 0,
    total_count: 0,
    total_cents: 0,
  };
}

function safeCents(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Fold at-risk commission rows into an aggregate for a single reseller.
 * Non-finite / non-positive commission_aud_cents values contribute 0 to the
 * cents sums but still bump the count so a garbled ledger row is visible in
 * the count rather than silently omitted — matches the total-invariant
 * posture of computeClearedMtd (P11.3) and computeTierMix (P11.2).
 */
export function computeClawbackExposure(
  rows: ReadonlyArray<ExposedCommissionRow>,
): ClawbackExposure {
  const out = emptyExposure();
  for (const r of rows) {
    const cents = safeCents(r.commission_aud_cents);
    if (r.status === "dispute_open") {
      out.dispute_count += 1;
      out.dispute_cents += cents;
    } else {
      out.pending_count += 1;
      out.pending_cents += cents;
    }
    out.total_count += 1;
    out.total_cents += cents;
  }
  return out;
}

/**
 * Group at-risk commission rows by reseller_id, then compute one
 * ClawbackExposure per group. Resellers with zero exposed commissions in the
 * window still appear with a zeroed aggregate so a partner whose ledger has
 * cleared cleanly is visible rather than absent — matches
 * computeClearedMtdByReseller.
 */
export function computeClawbackExposureByReseller(
  resellerIds: ReadonlyArray<string>,
  rows: ReadonlyArray<ExposedCommissionRow>,
): Map<string, ClawbackExposure> {
  const grouped = new Map<string, ExposedCommissionRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.reseller_id) ?? [];
    list.push(r);
    grouped.set(r.reseller_id, list);
  }
  const out = new Map<string, ClawbackExposure>();
  for (const id of resellerIds) {
    out.set(id, computeClawbackExposure(grouped.get(id) ?? []));
  }
  return out;
}

export interface ClawbackExposureRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  exposure: ClawbackExposure;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a whole-cent int as an AUD dollar amount with two decimal places.
 * No currency symbol collision with the escapeHtml pass — dollar sign is
 * a literal ASCII byte, not an HTML entity. Mirrors formatAud in
 * commission-cleared-mtd.ts (P11.3).
 */
function formatAud(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = Math.abs(cents % 100).toString().padStart(2, "0");
  return `A$${whole}.${frac}`;
}

/**
 * Render the clawback-exposure section for the weekly digest. Returns an
 * empty string when `rows` is empty so the caller can unconditionally append
 * the result. Ops reads this alongside commission_cleared_mtd (P11.3): cleared
 * is realised revenue, exposure is the still-at-risk pile that could be
 * clawed back if a refund/dispute lands before pending_until elapses.
 */
export function formatWeeklyDigestClawbackExposureSection(
  rows: ReadonlyArray<ClawbackExposureRow>,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const totalPendingCount = sorted.reduce<number>(
    (acc, r) => acc + r.exposure.pending_count,
    0,
  );
  const totalPendingCents = sorted.reduce<number>(
    (acc, r) => acc + r.exposure.pending_cents,
    0,
  );
  const totalDisputeCount = sorted.reduce<number>(
    (acc, r) => acc + r.exposure.dispute_count,
    0,
  );
  const totalDisputeCents = sorted.reduce<number>(
    (acc, r) => acc + r.exposure.dispute_cents,
    0,
  );
  const totalCount = totalPendingCount + totalDisputeCount;
  const totalCents = totalPendingCents + totalDisputeCents;
  const body = sorted
    .map((r) => {
      const e = r.exposure;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${e.pending_count}</td>
        <td style="text-align:right">${formatAud(e.pending_cents)}</td>
        <td style="text-align:right">${e.dispute_count}</td>
        <td style="text-align:right">${formatAud(e.dispute_cents)}</td>
        <td style="text-align:right">${e.total_count}</td>
        <td style="text-align:right">${formatAud(e.total_cents)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Clawback exposure (open commissions)</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller sum of commissions still inside the clawback window. Sourced from <code>reseller_commissions_current</code> filtered to <code>status IN ('pending_clearance','dispute_open')</code>. Pending rows will clear on the nightly P3.3 cron once past <code>pending_until</code> unless a refund/dispute/void event lands first; dispute rows are actively contested and clawback the full amount if Stripe rules <code>dispute_lost</code>.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Pending count</th>
          <th>Pending AUD</th>
          <th>Dispute count</th>
          <th>Dispute AUD</th>
          <th>Total count</th>
          <th>Total AUD</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalPendingCount}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalPendingCents)}</strong></td>
          <td style="text-align:right"><strong>${totalDisputeCount}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalDisputeCents)}</strong></td>
          <td style="text-align:right"><strong>${totalCount}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalCents)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
