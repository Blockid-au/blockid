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

/**
 * Build the HTML body for the monthly reconciliation email. Kept small
 * and inline so it renders in every mail client.
 */
export function formatReconciliationEmail(
  monthKey: string,
  rows: ReconciliationRow[],
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
