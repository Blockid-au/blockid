// Weekly digest — per-reseller cleared commission month-to-date (P11.3).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `commission_cleared_mtd` as one of the ongoing signals the Monday digest
// should surface. Before this module the digest surfaced leading signals +
// audit-log anomalies + human_blocked escalations + budget-utilization
// (P11.1) + tier-mix (P11.2) — the payout side of the ledger required an ops
// user to open /admin/resellers/[code] per row and hand-sum
// reseller_commissions_current rows whose status='cleared' for the current
// calendar month.
//
// Two independent aggregates per reseller:
//   - cleared_count  = number of commission rows that transitioned to
//                      'cleared' inside the current UTC month window.
//   - cleared_cents  = sum of commission_aud_cents for those rows.
//
// The nightly clearance cron (P3.3) writes a reseller_commission_events row
// with event_type='cleared' when a commission passes pending_until without
// dispute/refund. This module rolls those cleared events for the current UTC
// month by joining events.created_at (the cleared-at timestamp) against the
// parent reseller_commissions.commission_aud_cents. Both fields land as-is
// with no re-derivation from the ±1c-tolerance CHECK — the ledger row is the
// source of truth once accrued.
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested
// without touching Supabase or nodemailer — mirrors budget-utilization.ts
// (P11.1) + tier-mix.ts (P11.2).

/**
 * One cleared-event row shape the digest cron passes into computeClearedMtd.
 * The cron resolves the two fields by joining reseller_commission_events
 * (event_type='cleared', created_at within the current UTC month) against
 * the parent reseller_commissions row for reseller_id +
 * commission_aud_cents.
 */
export interface ClearedCommissionRow {
  reseller_id: string;
  commission_aud_cents: number;
}

export interface ClearedMtd {
  cleared_count: number;
  cleared_cents: number;
}

function emptyMtd(): ClearedMtd {
  return { cleared_count: 0, cleared_cents: 0 };
}

function safeCents(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Fold cleared-commission rows into an aggregate for a single reseller.
 * Non-finite / non-positive commission_aud_cents values contribute 0 to
 * cleared_cents but still bump cleared_count so a garbled ledger row is
 * visible in the count rather than silently omitted — matches the
 * total-invariant posture of computeTierMix (P11.2).
 */
export function computeClearedMtd(
  rows: ReadonlyArray<ClearedCommissionRow>,
): ClearedMtd {
  const out = emptyMtd();
  for (const r of rows) {
    out.cleared_count += 1;
    out.cleared_cents += safeCents(r.commission_aud_cents);
  }
  return out;
}

/**
 * Group cleared-commission rows by reseller_id, then compute one ClearedMtd
 * per group. Resellers with zero cleared events in the window still appear
 * with a zeroed aggregate so a partner whose accruals all landed on refunds
 * or disputes is visible rather than absent — matches computeTierMixByReseller.
 */
export function computeClearedMtdByReseller(
  resellerIds: ReadonlyArray<string>,
  rows: ReadonlyArray<ClearedCommissionRow>,
): Map<string, ClearedMtd> {
  const grouped = new Map<string, ClearedCommissionRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.reseller_id) ?? [];
    list.push(r);
    grouped.set(r.reseller_id, list);
  }
  const out = new Map<string, ClearedMtd>();
  for (const id of resellerIds) {
    out.set(id, computeClearedMtd(grouped.get(id) ?? []));
  }
  return out;
}

export interface ClearedMtdRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  mtd: ClearedMtd;
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
 * a literal ASCII byte, not an HTML entity.
 */
function formatAud(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = Math.abs(cents % 100).toString().padStart(2, "0");
  return `A$${whole}.${frac}`;
}

/**
 * Render the cleared-commission MTD section for the weekly digest. Returns
 * an empty string when `rows` is empty so the caller can unconditionally
 * append the result. `monthKey` is the UTC `YYYY-MM` window used to filter
 * events.created_at — surfaced in the section header so ops can correlate
 * the numbers with reseller_commission_events rows directly.
 */
export function formatWeeklyDigestClearedMtdSection(
  rows: ReadonlyArray<ClearedMtdRow>,
  monthKey: string,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const totalCents = sorted.reduce<number>(
    (acc, r) => acc + r.mtd.cleared_cents,
    0,
  );
  const totalCount = sorted.reduce<number>(
    (acc, r) => acc + r.mtd.cleared_count,
    0,
  );
  const body = sorted
    .map((r) => {
      const m = r.mtd;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${m.cleared_count}</td>
        <td style="text-align:right">${formatAud(m.cleared_cents)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Commission cleared MTD (${escapeHtml(monthKey)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller month-to-date cleared-commission count + AUD total. Sourced from <code>reseller_commission_events(event_type='cleared')</code> joined to <code>reseller_commissions.commission_aud_cents</code>. Cleared events are written by the nightly P3.3 clearance cron once a commission passes <code>pending_until</code> without dispute or refund.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Cleared count</th>
          <th>Cleared AUD</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalCount}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalCents)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
