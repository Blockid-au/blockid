// Weekly digest — per-reseller sandbox share of budget (P11.12).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `sandbox_share_of_budget` as the twelfth of thirteen ongoing signals the
// Monday digest should surface. Before this module the digest surfaced leading
// signals + audit-log anomalies + human_blocked escalations + budget-
// utilization (P11.1) + tier-mix (P11.2) + commission_cleared_mtd (P11.3) +
// clawback_exposure (P11.4) + attributed_mrr (P11.5) + attributed_net_
// contribution (P11.6) + attributed_churn_30d (P11.7) + ledger_drift_events
// (P11.8) + gst_reconciliation_delta (P11.9) + cohort_velocity (P11.10) +
// ltv_cac_per_reseller (P11.11) — the "how much of this reseller's credit
// spend is internal experimentation vs customer delivery?" ratio still
// required an ops user to open /admin/resellers/[code] per row and hand-divide
// the sandbox column by the grant column.
//
// P11.1 already surfaces sandbox_pct = sandbox_used / monthly_sandbox_credits
// (sandbox activity against its own cap). This module answers TWO different
// questions the P11.1 column does not:
//   • share_of_consumption_pct = sandbox_used / (sandbox_used + grant_used)
//     "of every credit this reseller spent this month, what % went to sandbox
//      experimentation rather than customer grants?" — a channel-health signal
//     (a high value on a wholesale partner means the partner is experimenting
//      more than converting, an early warning that customer activation is
//      lagging behind reseller engagement).
//   • share_of_budget_pct = sandbox_used / monthly_credit_budget
//     "how much of the primary customer-serving budget dial (H.15 single
//      monthly_credit_budget) is being consumed by sandbox spend?" — a
//     capacity signal (a high value means sandbox is eating headroom that
//     was minted for customer grants; combined with a red grant_pct in P11.1
//     it suggests raising monthly_credit_budget or trimming sandbox activity).
// The two metrics are complementary: consumption-share tells you the mix;
// budget-share tells you the drain on the primary dial.
//
// Both denominators are integer credit counts (not cents) matching migration
// 0091 + 0096 shape. Percent is an integer 0..999 via floor with clamp, same
// as budget-utilization.ts so a runaway ratio (e.g. sandbox exceeds primary
// budget) surfaces as a three-digit % rather than corrupting the table
// layout. null renders when the denominator is zero so the section never
// shows a divide-by-zero NaN — mirrors the ratio_hundredths null posture in
// ltv-cac.ts (P11.11).
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested without
// touching Supabase or nodemailer — mirrors ltv-cac.ts (P11.11) +
// cohort-velocity.ts (P11.10) + gst-reconciliation-delta.ts (P11.9).

/**
 * Inputs for one reseller. All three fields already exist on
 * BudgetUtilizationInput (P11.1) so the digest cron reuses the P11.1 pull.
 */
export interface SandboxShareInput {
  sandbox_credits_used: number;
  grant_credits_used: number;
  monthly_credit_budget: number;
}

export interface SandboxShare {
  sandbox_credits_used: number;
  grant_credits_used: number;
  total_credits_used: number;
  monthly_credit_budget: number;
  /**
   * floor(sandbox * 100 / (sandbox + grant)); null when total=0. Clamped to
   * 0..999. "Of every credit this reseller spent, what % was sandbox?"
   */
  share_of_consumption_pct: number | null;
  /**
   * floor(sandbox * 100 / monthly_credit_budget); null when budget<=0.
   * Clamped to 0..999. "How much of the primary budget dial went to sandbox?"
   */
  share_of_budget_pct: number | null;
}

function safeCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  return Math.floor(n);
}

function safePct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  if (!Number.isFinite(numerator) || numerator <= 0) return 0;
  const pct = Math.floor((numerator * 100) / denominator);
  return Math.max(0, Math.min(pct, 999));
}

/**
 * Fold the three integer counts into a SandboxShare aggregate. Both share
 * pcts default to null on zero denominator so a reseller with no consumption
 * and no budget lands as "—" in every cell.
 */
export function computeSandboxShare(input: SandboxShareInput): SandboxShare {
  const sandbox_credits_used = safeCount(input.sandbox_credits_used);
  const grant_credits_used = safeCount(input.grant_credits_used);
  const total_credits_used = sandbox_credits_used + grant_credits_used;
  const monthly_credit_budget = safeCount(input.monthly_credit_budget);
  return {
    sandbox_credits_used,
    grant_credits_used,
    total_credits_used,
    monthly_credit_budget,
    share_of_consumption_pct: safePct(sandbox_credits_used, total_credits_used),
    share_of_budget_pct: safePct(sandbox_credits_used, monthly_credit_budget),
  };
}

export interface SandboxShareRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  share: SandboxShare;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pctCell(pct: number | null): string {
  return pct === null ? "&mdash;" : `${pct}%`;
}

/**
 * Render the sandbox-share section for the weekly digest. Returns an empty
 * string when `rows` is empty so the caller can unconditionally append the
 * result.
 *
 * `monthKey` is the UTC `YYYY-MM` key the P11.1 monthly-usage roll-up used —
 * surfaced in the section header so ops can correlate against
 * reseller_credit_grants.month_key directly (same convention as
 * formatWeeklyDigestBudgetSection).
 *
 * Layout: one row per reseller with sandbox_used, grant_used, total, budget,
 * consumption-share %, budget-share %. A <tfoot> Total row sums the whole-
 * portfolio counts and computes the portfolio consumption-share + budget-
 * share so ops sees the channel-wide sandbox drag at a glance.
 */
export function formatWeeklyDigestSandboxShareSection(
  rows: ReadonlyArray<SandboxShareRow>,
  monthKey: string,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const body = sorted
    .map((r) => {
      const s = r.share;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${s.sandbox_credits_used}</td>
        <td style="text-align:right">${s.grant_credits_used}</td>
        <td style="text-align:right">${s.total_credits_used}</td>
        <td style="text-align:right">${s.monthly_credit_budget}</td>
        <td style="text-align:right"><strong>${pctCell(s.share_of_consumption_pct)}</strong></td>
        <td style="text-align:right"><strong>${pctCell(s.share_of_budget_pct)}</strong></td>
      </tr>`;
    })
    .join("");
  let totalSandbox = 0;
  let totalGrant = 0;
  let totalBudget = 0;
  for (const r of sorted) {
    totalSandbox += r.share.sandbox_credits_used;
    totalGrant += r.share.grant_credits_used;
    totalBudget += r.share.monthly_credit_budget;
  }
  const totalConsumption = totalSandbox + totalGrant;
  const portfolioConsumptionPct = safePct(totalSandbox, totalConsumption);
  const portfolioBudgetPct = safePct(totalSandbox, totalBudget);
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Sandbox share of budget (${escapeHtml(monthKey)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Complementary to P11.1 credit-budget utilization. <strong>Consumption %</strong> = sandbox &divide; (sandbox + grants) — of every credit spent, what fraction went to sandbox experimentation rather than customer grants. <strong>Budget %</strong> = sandbox &divide; <code>monthly_credit_budget</code> — how much of the primary customer-serving budget dial is being consumed by sandbox spend. Renders as &mdash; when the denominator is zero.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Sandbox used</th>
          <th>Grants used</th>
          <th>Total used</th>
          <th>Budget</th>
          <th>Consumption %</th>
          <th>Budget %</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalSandbox}</strong></td>
          <td style="text-align:right"><strong>${totalGrant}</strong></td>
          <td style="text-align:right"><strong>${totalConsumption}</strong></td>
          <td style="text-align:right"><strong>${totalBudget}</strong></td>
          <td style="text-align:right"><strong>${pctCell(portfolioConsumptionPct)}</strong></td>
          <td style="text-align:right"><strong>${pctCell(portfolioBudgetPct)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
