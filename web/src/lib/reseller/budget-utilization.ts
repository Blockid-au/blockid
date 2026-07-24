// Weekly digest — per-reseller credit-budget + sandbox-cap utilization.
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`)
// names `credit_budget_utilization` and `sandbox_share_of_budget` as leading
// operational KPIs the Monday digest should surface. Neither was in the
// digest before this module — CS + finance had to open /admin/resellers per
// row and hand-compute against `computeMonthlyUsage` output.
//
// Two independent utilization pcts, matched to the two independent caps set
// on `resellers` (both from migration 0091):
//   - `monthly_credit_budget`    caps `reseller_credit_grants(kind='grant')`
//   - `monthly_sandbox_credits`  caps `reseller_credit_grants(kind='sandbox_spend')`
// Plan §H.11 keeps them as one budget dial in customer-facing product copy
// but expects the split visible in reporting, which is exactly this section.
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested
// without touching Supabase or nodemailer — mirrors weekly-digest.ts.

export interface BudgetUtilizationInput {
  /** Reseller row `monthly_credit_budget` (int, per calendar month). */
  monthly_credit_budget: number;
  /** Reseller row `monthly_sandbox_credits` (int, per calendar month). */
  monthly_sandbox_credits: number;
  /** From computeMonthlyUsage(...).grant_credits_used for the current month. */
  grant_credits_used: number;
  /** From computeMonthlyUsage(...).sandbox_credits_used for the current month. */
  sandbox_credits_used: number;
}

export interface BudgetUtilization {
  grant_used: number;
  grant_budget: number;
  /** Whole-integer percent 0..999; null when budget<=0 (unbounded/undefined). */
  grant_pct: number | null;
  sandbox_used: number;
  sandbox_cap: number;
  /** Whole-integer percent 0..999; null when cap<=0. */
  sandbox_pct: number | null;
}

function safePct(used: number, cap: number): number | null {
  if (!Number.isFinite(cap) || cap <= 0) return null;
  if (!Number.isFinite(used) || used <= 0) return 0;
  // Clamp so a runaway ratio (e.g. over-budget approvals) surfaces as a
  // three-digit % rather than corrupting the table layout.
  const pct = Math.floor((used * 100) / cap);
  return Math.max(0, Math.min(pct, 999));
}

function safeCount(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeBudgetUtilization(input: BudgetUtilizationInput): BudgetUtilization {
  const grantUsed = safeCount(input.grant_credits_used);
  const sandboxUsed = safeCount(input.sandbox_credits_used);
  const grantBudget = Number.isFinite(input.monthly_credit_budget)
    ? Math.max(0, input.monthly_credit_budget)
    : 0;
  const sandboxCap = Number.isFinite(input.monthly_sandbox_credits)
    ? Math.max(0, input.monthly_sandbox_credits)
    : 0;
  return {
    grant_used: grantUsed,
    grant_budget: grantBudget,
    grant_pct: safePct(grantUsed, grantBudget),
    sandbox_used: sandboxUsed,
    sandbox_cap: sandboxCap,
    sandbox_pct: safePct(sandboxUsed, sandboxCap),
  };
}

export interface BudgetUtilizationRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  utilization: BudgetUtilization;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pctCell(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

/**
 * Render the credit-budget + sandbox-cap utilization section for the weekly
 * digest. Returns an empty string when `rows` is empty so the caller can
 * unconditionally append the result.
 *
 * `monthKey` is the UTC `YYYY-MM` key the underlying `computeMonthlyUsage`
 * roll-up used — surfaced in the section header so ops can correlate the
 * numbers with `reseller_credit_grants.month_key` directly.
 */
export function formatWeeklyDigestBudgetSection(
  rows: ReadonlyArray<BudgetUtilizationRow>,
  monthKey: string,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const body = sorted
    .map((r) => {
      const u = r.utilization;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${u.grant_used}</td>
        <td style="text-align:right">${u.grant_budget}</td>
        <td style="text-align:right">${pctCell(u.grant_pct)}</td>
        <td style="text-align:right">${u.sandbox_used}</td>
        <td style="text-align:right">${u.sandbox_cap}</td>
        <td style="text-align:right">${pctCell(u.sandbox_pct)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Credit-budget utilization (${escapeHtml(monthKey)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller month-to-date share of <code>monthly_credit_budget</code> (attributed-customer grants) and <code>monthly_sandbox_credits</code> (reseller sandbox spend). Percent renders as &mdash; when the cap is zero.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Grants used</th>
          <th>Grants budget</th>
          <th>Grants %</th>
          <th>Sandbox used</th>
          <th>Sandbox cap</th>
          <th>Sandbox %</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
