// Pure helpers for the monthly reseller reconciliation export.
// Kept dependency-free so the CSV shape and drift-alert body can be unit
// tested without touching Supabase or Stripe.
// See docs/plans/reseller-module-plan.md § D.5.

export interface ReconciliationRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  billing_model: "retail" | "wholesale";
  cleared_count: number;
  cleared_commission_aud_cents: number;
}

export interface StripeDriftRow {
  code: string;
  reseller_code: string;
  tier_pct: number;
  stripe_promotion_code_id: string;
  reason: string;
}

/**
 * Maximum absolute delta (cents) between our ledger GST total and Stripe's
 * invoice-tax total before we page admin. A$1 mirrors the plan's P7.3 gate.
 */
export const GST_TOLERANCE_CENTS = 100;

export interface GstReconciliation {
  month: string;
  ledger_gst_aud_cents: number;
  stripe_gst_aud_cents: number;
  delta_cents: number;
  abs_delta_cents: number;
  within_tolerance: boolean;
  stripe_invoice_count: number;
}

/**
 * Pure comparison of our internal GST rollup against Stripe's authoritative
 * invoice.tax rollup. Delta is `ledger - stripe`, so a positive value means
 * we over-recorded GST vs Stripe.
 */
export function computeGstDelta(
  monthKey: string,
  ledgerGstCents: number,
  stripeGstCents: number,
  stripeInvoiceCount: number = 0,
): GstReconciliation {
  const ledger = Math.trunc(ledgerGstCents);
  const stripe = Math.trunc(stripeGstCents);
  const delta = ledger - stripe;
  const abs = Math.abs(delta);
  return {
    month: monthKey,
    ledger_gst_aud_cents: ledger,
    stripe_gst_aud_cents: stripe,
    delta_cents: delta,
    abs_delta_cents: abs,
    within_tolerance: abs <= GST_TOLERANCE_CENTS,
    stripe_invoice_count: stripeInvoiceCount,
  };
}

const CSV_HEADER = [
  "reseller_id",
  "reseller_code",
  "reseller_display_name",
  "billing_model",
  "cleared_count",
  "cleared_commission_aud_cents",
  "cleared_commission_aud",
] as const;

/** Escape a single CSV field per RFC 4180. */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Render the cleared-commissions aggregate as an RFC-4180 CSV string.
 * Includes a trailing newline. Rows are ordered by reseller_code for
 * deterministic output (test friendly, human-scannable).
 */
export function formatReconciliationCsv(
  monthKey: string,
  rows: ReconciliationRow[],
): string {
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const lines: string[] = [];
  lines.push(`# BlockID reseller commission reconciliation — ${monthKey}`);
  lines.push(CSV_HEADER.map(csvEscape).join(","));
  for (const r of sorted) {
    lines.push(
      [
        r.reseller_id,
        r.reseller_code,
        r.reseller_display_name,
        r.billing_model,
        r.cleared_count,
        r.cleared_commission_aud_cents,
        (r.cleared_commission_aud_cents / 100).toFixed(2),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Sum row totals to a single grand total (cents). */
export function sumClearedCents(rows: ReconciliationRow[]): number {
  return rows.reduce((acc, r) => acc + r.cleared_commission_aud_cents, 0);
}

/** Small HTML fragment describing the GST reconciliation delta. */
function formatGstSection(recon: GstReconciliation | null): string {
  if (!recon) return "";
  const ledgerAud = (recon.ledger_gst_aud_cents / 100).toFixed(2);
  const stripeAud = (recon.stripe_gst_aud_cents / 100).toFixed(2);
  const deltaAud = (recon.delta_cents / 100).toFixed(2);
  const tolerance = (GST_TOLERANCE_CENTS / 100).toFixed(2);
  const status = recon.within_tolerance
    ? `<span style="color:#065f46">within A$${tolerance} tolerance</span>`
    : `<span style="color:#b91c1c"><strong>EXCEEDS A$${tolerance} tolerance</strong></span>`;
  return `<h3 style="margin-top:24px">GST reconciliation — ${escapeHtml(recon.month)}</h3>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
<tbody>
<tr><td>Ledger GST (revenue_events.gst_aud_cents)</td><td style="text-align:right">A$${ledgerAud}</td></tr>
<tr><td>Stripe GST (invoice.tax across ${recon.stripe_invoice_count} invoice${recon.stripe_invoice_count === 1 ? "" : "s"})</td><td style="text-align:right">A$${stripeAud}</td></tr>
<tr><td><strong>Delta (ledger − stripe)</strong></td><td style="text-align:right"><strong>A$${deltaAud}</strong></td></tr>
<tr><td>Status</td><td style="text-align:right">${status}</td></tr>
</tbody>
</table>`;
}

/**
 * Build the HTML body for the monthly reconciliation email. Kept small
 * and inline so it renders in every mail client.
 */
export function formatReconciliationEmail(
  monthKey: string,
  rows: ReconciliationRow[],
  gstReconciliation: GstReconciliation | null = null,
): string {
  const total = sumClearedCents(rows);
  const totalAud = (total / 100).toFixed(2);
  const rowsHtml = rows
    .slice()
    .sort((a, b) => a.reseller_code.localeCompare(b.reseller_code))
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.reseller_code)}</td><td>${escapeHtml(
          r.reseller_display_name,
        )}</td><td>${escapeHtml(r.billing_model)}</td><td style="text-align:right">${
          r.cleared_count
        }</td><td style="text-align:right">A$${(
          r.cleared_commission_aud_cents / 100
        ).toFixed(2)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:14px">
<h2>Reseller reconciliation — ${escapeHtml(monthKey)}</h2>
<p>Cleared commissions grouped by reseller. Attached CSV is authoritative.</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
<thead><tr><th>Code</th><th>Reseller</th><th>Model</th><th>Cleared rows</th><th>Cleared A$</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="5"><em>No cleared commissions this month.</em></td></tr>'}</tbody>
<tfoot><tr><td colspan="4" style="text-align:right"><strong>Total</strong></td><td style="text-align:right"><strong>A$${totalAud}</strong></td></tr></tfoot>
</table>
${formatGstSection(gstReconciliation)}
</body></html>`;
}

/**
 * Standalone drift alert body — sent when the GST delta exceeds
 * GST_TOLERANCE_CENTS so the reconciliation email itself is not the only
 * signal of a material discrepancy.
 */
export function formatGstDriftEmail(recon: GstReconciliation): string {
  const ledgerAud = (recon.ledger_gst_aud_cents / 100).toFixed(2);
  const stripeAud = (recon.stripe_gst_aud_cents / 100).toFixed(2);
  const deltaAud = (recon.delta_cents / 100).toFixed(2);
  const tolerance = (GST_TOLERANCE_CENTS / 100).toFixed(2);
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:14px">
<h2 style="color:#b91c1c">GST reconciliation drift — ${escapeHtml(recon.month)}</h2>
<p>Ledger and Stripe disagree by <strong>A$${deltaAud}</strong> (tolerance A$${tolerance}). Investigate before the BAS lodgement window closes.</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
<tbody>
<tr><td>Ledger GST total (revenue_events.gst_aud_cents)</td><td style="text-align:right">A$${ledgerAud}</td></tr>
<tr><td>Stripe GST total (invoice.tax across ${recon.stripe_invoice_count} invoice${recon.stripe_invoice_count === 1 ? "" : "s"})</td><td style="text-align:right">A$${stripeAud}</td></tr>
<tr><td><strong>Delta (ledger − stripe)</strong></td><td style="text-align:right"><strong>A$${deltaAud}</strong></td></tr>
</tbody>
</table>
<p>Common causes: (1) refund landed after cron ran; (2) invoice.tax split across multiple line items and one webhook was missed; (3) manual credit_note in Stripe not mirrored to revenue_events.</p>
</body></html>`;
}

/** Human summary body for a Stripe promotion-code drift alert. */
export function formatDriftEmail(
  rows: StripeDriftRow[],
  runAtIso: string,
): string {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(
          r.reseller_code,
        )}</td><td>${r.tier_pct}%</td><td>${escapeHtml(
          r.stripe_promotion_code_id,
        )}</td><td>${escapeHtml(r.reason)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:14px">
<h2>Reseller promotion-code drift — ${escapeHtml(runAtIso)}</h2>
<p>${rows.length} code(s) are marked active in BlockID but no longer active (or missing) in Stripe.</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
<thead><tr><th>BlockID code</th><th>Reseller</th><th>Tier</th><th>Stripe promotion_code_id</th><th>Reason</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
<p>Action: reactivate in Stripe or deactivate in <code>reseller_promotion_codes.active</code> to stop new checkouts stamping this code.</p>
</body></html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
