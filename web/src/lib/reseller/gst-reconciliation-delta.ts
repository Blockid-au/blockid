// Weekly digest — per-reseller GST reconciliation ledger delta (P11.9).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `gst_reconciliation_delta` as one of the ongoing signals the Monday digest
// should surface. Before this module the digest surfaced leading signals +
// audit-log anomalies + human_blocked escalations + budget-utilization (P11.1)
// + tier-mix (P11.2) + commission_cleared_mtd (P11.3) + clawback_exposure
// (P11.4) + attributed_mrr (P11.5) + attributed_net_contribution (P11.6) +
// attributed_churn_30d (P11.7) + ledger_drift_events (P11.8) — the GST
// contribution each partner's attributed revenue is putting into the
// portfolio-wide BAS envelope required an ops user to hand-sum
// revenue_events.gst_aud_cents per reseller_id inside the current UTC month.
//
// Scope split from the monthly reconciliation cron: the existing P7.3
// reconciliation.ts + /api/cron/reseller-monthly-reconciliation compares
// portfolio-wide ledger GST against Stripe's authoritative invoice.tax and
// pages on the A$1 tolerance. That answer is portfolio-scope (Stripe does
// not tag invoices with reseller_id) so the two views are complementary:
//   - monthly reconciliation = "does the total match Stripe?" (correctness)
//   - weekly digest per-reseller = "which partners are moving the GST needle?"
//     (attribution + leading signal for the next monthly close)
//
// Ledger split — positive-flow vs reversal:
//   - positive_gst_cents  = sum of gst_aud_cents from kinds that recognise
//     revenue (subscribe / renewal / upgrade / downgrade / trial_convert).
//     These land as positive whole cents in the ledger.
//   - reversal_gst_cents  = sum of |gst_aud_cents| from kinds that reverse
//     revenue (refund / chargeback). Ledger stores these as negative cents;
//     the aggregate reports the absolute magnitude so ops can eyeball the
//     reversal pressure without needing to mentally flip a sign.
//   - net_gst_cents       = positive_gst_cents - reversal_gst_cents. This is
//     the per-reseller contribution to the portfolio BAS envelope for the
//     window — the number that should roll up to the monthly reconciliation.
//
// Kept dependency-free so the shape can be regression-tested without
// touching Supabase — mirrors budget-utilization.ts (P11.1) + tier-mix.ts
// (P11.2) + commission-cleared-mtd.ts (P11.3) + clawback-exposure.ts (P11.4)
// + attributed-mrr.ts (P11.5) + attributed-net-contribution.ts (P11.6) +
// attributed-churn-30d.ts (P11.7) + ledger-drift-events.ts (P11.8).

/** Revenue-recognising kinds that contribute positive GST to the window. */
export const POSITIVE_GST_KINDS = [
  "subscribe",
  "renewal",
  "upgrade",
  "downgrade",
  "trial_convert",
] as const;

/** Revenue-reversing kinds whose GST is reported as absolute reversal magnitude. */
export const REVERSAL_GST_KINDS = ["refund", "chargeback"] as const;

export type PositiveGstKind = (typeof POSITIVE_GST_KINDS)[number];
export type ReversalGstKind = (typeof REVERSAL_GST_KINDS)[number];

function isPositiveGstKind(kind: string | null | undefined): kind is PositiveGstKind {
  return typeof kind === "string" && (POSITIVE_GST_KINDS as readonly string[]).includes(kind);
}

function isReversalGstKind(kind: string | null | undefined): kind is ReversalGstKind {
  return typeof kind === "string" && (REVERSAL_GST_KINDS as readonly string[]).includes(kind);
}

/**
 * One revenue_events row the digest cron passes into the aggregator. Only
 * the fields the check needs — the cron scopes the underlying query to
 * reseller_id IN (active-set) AND ts >= start-of-UTC-month.
 */
export interface GstLedgerRow {
  reseller_id: string | null;
  kind: string | null;
  gst_aud_cents: number | null;
}

export interface GstReconciliationDelta {
  positive_count: number;
  positive_gst_cents: number;
  reversal_count: number;
  reversal_gst_cents: number;
  net_gst_cents: number;
}

function emptyDelta(): GstReconciliationDelta {
  return {
    positive_count: 0,
    positive_gst_cents: 0,
    reversal_count: 0,
    reversal_gst_cents: 0,
    net_gst_cents: 0,
  };
}

/**
 * Coerce a raw ledger GST value to a safe whole-cent magnitude. The ledger
 * stores signed integers (positive for subscribe/renewal, negative for
 * refund/chargeback) but a mid-migration extract could surface NaN or a
 * fractional cent — this helper floors to whole cents and takes the
 * absolute value so both branches can add the magnitude and let the caller
 * apply the sign via which bucket the row lands in.
 */
function safeAbsCents(n: number | null | undefined): number {
  if (n === null || n === undefined) return 0;
  if (!Number.isFinite(n)) return 0;
  return Math.abs(Math.trunc(n));
}

/**
 * Fold a batch of revenue_events rows into one aggregate. Rows whose kind
 * is neither positive nor reversal (e.g. trial_start, trial_end_no_payment,
 * credit_pack) are silently dropped — those kinds do not carry GST in the
 * ledger. Rows with null reseller_id are dropped by the caller before
 * reaching this helper (via computeGstReconciliationDeltaByReseller).
 */
export function computeGstReconciliationDelta(
  rows: ReadonlyArray<GstLedgerRow>,
): GstReconciliationDelta {
  const out = emptyDelta();
  for (const r of rows) {
    if (isPositiveGstKind(r.kind)) {
      out.positive_count += 1;
      out.positive_gst_cents += safeAbsCents(r.gst_aud_cents);
    } else if (isReversalGstKind(r.kind)) {
      out.reversal_count += 1;
      out.reversal_gst_cents += safeAbsCents(r.gst_aud_cents);
    }
  }
  out.net_gst_cents = out.positive_gst_cents - out.reversal_gst_cents;
  return out;
}

/**
 * Group revenue_events rows by reseller_id, then compute one
 * GstReconciliationDelta per requested reseller. Resellers with zero events
 * in the window still appear in the output map with a zeroed aggregate so a
 * partner whose ledger has no GST activity this month is visible rather
 * than absent — matches the zero-survival posture of computeClearedMtdByReseller
 * (P11.3) and computeClawbackExposureByReseller (P11.4).
 */
export function computeGstReconciliationDeltaByReseller(
  resellerIds: ReadonlyArray<string>,
  rows: ReadonlyArray<GstLedgerRow>,
): Map<string, GstReconciliationDelta> {
  const grouped = new Map<string, GstLedgerRow[]>();
  for (const r of rows) {
    if (!r.reseller_id) continue;
    const list = grouped.get(r.reseller_id) ?? [];
    list.push(r);
    grouped.set(r.reseller_id, list);
  }
  const out = new Map<string, GstReconciliationDelta>();
  for (const id of resellerIds) {
    out.set(id, computeGstReconciliationDelta(grouped.get(id) ?? []));
  }
  return out;
}

export interface GstReconciliationDeltaRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  delta: GstReconciliationDelta;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a signed whole-cent int as an AUD dollar amount with two decimal
 * places and a leading minus sign for negative values. Matches formatSignedAud
 * from attributed-net-contribution.ts (P11.6) so the two sections render
 * dollar amounts identically.
 */
function formatSignedAud(cents: number): string {
  const negative = cents < 0;
  const magnitude = Math.abs(cents);
  const whole = Math.floor(magnitude / 100);
  const frac = (magnitude % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}A$${whole}.${frac}`;
}

/**
 * Render the GST reconciliation delta section for the weekly digest. Returns
 * an empty string when `rows` is empty so the caller can unconditionally
 * append the result. `monthKey` is the UTC `YYYY-MM` window used to filter
 * revenue_events.ts — surfaced in the section header so ops can correlate
 * the numbers with revenue_events rows directly.
 */
export function formatWeeklyDigestGstReconciliationDeltaSection(
  rows: ReadonlyArray<GstReconciliationDeltaRow>,
  monthKey: string,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const totalPositiveCount = sorted.reduce<number>(
    (acc, r) => acc + r.delta.positive_count,
    0,
  );
  const totalPositiveCents = sorted.reduce<number>(
    (acc, r) => acc + r.delta.positive_gst_cents,
    0,
  );
  const totalReversalCount = sorted.reduce<number>(
    (acc, r) => acc + r.delta.reversal_count,
    0,
  );
  const totalReversalCents = sorted.reduce<number>(
    (acc, r) => acc + r.delta.reversal_gst_cents,
    0,
  );
  const totalNetCents = totalPositiveCents - totalReversalCents;
  const body = sorted
    .map((r) => {
      const d = r.delta;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${d.positive_count}</td>
        <td style="text-align:right">${formatSignedAud(d.positive_gst_cents)}</td>
        <td style="text-align:right">${d.reversal_count}</td>
        <td style="text-align:right">${formatSignedAud(d.reversal_gst_cents)}</td>
        <td style="text-align:right">${formatSignedAud(d.net_gst_cents)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">GST reconciliation delta (${escapeHtml(monthKey)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller month-to-date ledger-side GST from <code>revenue_events.gst_aud_cents</code> scoped by <code>reseller_id</code>. <strong>Positive</strong> = revenue-recognising kinds (<code>${POSITIVE_GST_KINDS.join("/")}</code>). <strong>Reversal</strong> = magnitude of GST reversed by <code>${REVERSAL_GST_KINDS.join("/")}</code>. <strong>Net</strong> = positive − reversal — the per-reseller contribution to the portfolio BAS envelope. The monthly reconciliation cron (P7.3) compares the portfolio-wide ledger total against Stripe's <code>invoice.tax</code> and pages on the A$1 tolerance; this section is the per-reseller leading signal so ops can spot which partner drove a delta before the monthly close.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Positive count</th>
          <th>Positive GST</th>
          <th>Reversal count</th>
          <th>Reversal GST</th>
          <th>Net GST</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalPositiveCount}</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(totalPositiveCents)}</strong></td>
          <td style="text-align:right"><strong>${totalReversalCount}</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(totalReversalCents)}</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(totalNetCents)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
