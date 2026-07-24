// Weekly digest — per-reseller contribution margin % (P11.34).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `contribution_margin_pct` as a distinct signal alongside
// `attributed_net_contribution`. P11.6 already renders a margin column inside
// the net-contribution table but has no standalone JSONL envelope for the
// margin figures — an ops workflow that tails cron-health.jsonl for the
// margin-only trend has to re-derive net_contribution_cents / revenue_cents
// per row on every read. This module lands the dedicated margin projection:
//
//   • Consumes the exact same NetContributionRow shape P11.6 already produces
//     so the two sections cannot drift on how COGS + commission are folded.
//   • Sort is margin desc primary (most-profitable partners land first —
//     opposite of P11.6's code-alphabetical sort so ops can spot the "who
//     should we send more customers?" answer at a glance), reseller_code asc
//     secondary for deterministic tie-break.
//   • Negative margins render in an amber-highlighted row so loss-leader
//     partners visually pop — matches the down-streak highlight posture from
//     P11.30/P11.32.
//   • Portfolio margin footer folds revenue + net across all rows and renders
//     one aggregate percent so the reader can compare partner margins against
//     the book-wide average without spreadsheeting the section.
//   • margin_pct is a floored integer (Math.trunc) matching P11.6's
//     formatMarginPct posture: -12.7% renders as -12% so the loss magnitude
//     is visible without rounding-toward-loss.
//   • rows with revenue_cents === 0 render margin as `—` and are sorted last
//     (Number.NEGATIVE_INFINITY sentinel) so the null band stays visually
//     grouped rather than interleaving with real-margin rows.
//
// Kept dependency-free (imports only the NetContributionRow type from P11.6)
// so the section can be regression-tested without touching Supabase or
// nodemailer — mirrors budget-utilization.ts / tier-mix.ts / commission-
// cleared-mtd.ts / clawback-exposure.ts / attributed-mrr.ts / attributed-net-
// contribution.ts.

import type { NetContributionRow } from "./attributed-net-contribution";

export interface ContributionMarginRow {
  readonly reseller_id: string;
  readonly reseller_code: string;
  readonly reseller_display_name: string;
  readonly revenue_cents: number;
  readonly net_contribution_cents: number;
  readonly margin_pct: number | null;
}

export interface ContributionMargins {
  readonly month_key: string;
  readonly reseller_count: number;
  readonly portfolio_revenue_cents: number;
  readonly portfolio_net_cents: number;
  readonly portfolio_margin_pct: number | null;
  readonly rows: readonly ContributionMarginRow[];
}

function safeCents(n: number): number {
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/**
 * Project a per-reseller margin from revenue + net contribution cents.
 * Returns null when revenue is <= 0 so a partner with zero MRR does not
 * surface a NaN / division-by-zero / misleading 0%. Uses Math.trunc so a
 * -12.7% renders as -12 (loss magnitude visible without rounding toward the
 * loss).
 */
function marginPctFromCents(revenue: number, net: number): number | null {
  if (revenue <= 0) return null;
  const pct = (net / revenue) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.trunc(pct);
}

/**
 * Fold a list of NetContributionRow (produced by the P11.6 net-contribution
 * step in the digest cron) into a ContributionMargins projection: one row per
 * partner sorted by margin desc, portfolio-aggregate footer, monthKey passed
 * through for section rendering.
 */
export function computeContributionMargins(
  rows: ReadonlyArray<NetContributionRow>,
  monthKey: string,
): ContributionMargins {
  const projected: ContributionMarginRow[] = rows.map((r) => {
    const revenue_cents = safeCents(r.net.revenue_cents);
    const net_contribution_cents = safeCents(r.net.net_contribution_cents);
    return {
      reseller_id: r.reseller_id,
      reseller_code: r.reseller_code,
      reseller_display_name: r.reseller_display_name,
      revenue_cents,
      net_contribution_cents,
      margin_pct: marginPctFromCents(revenue_cents, net_contribution_cents),
    };
  });

  projected.sort((a, b) => {
    // null margins sort last (Number.NEGATIVE_INFINITY sentinel keeps the
    // null band grouped rather than interleaving with real-margin rows).
    const aKey = a.margin_pct ?? Number.NEGATIVE_INFINITY;
    const bKey = b.margin_pct ?? Number.NEGATIVE_INFINITY;
    if (aKey !== bKey) return bKey - aKey;
    return a.reseller_code.localeCompare(b.reseller_code);
  });

  const portfolio_revenue_cents = projected.reduce<number>(
    (acc, r) => acc + r.revenue_cents,
    0,
  );
  const portfolio_net_cents = projected.reduce<number>(
    (acc, r) => acc + r.net_contribution_cents,
    0,
  );

  return {
    month_key: monthKey,
    reseller_count: projected.length,
    portfolio_revenue_cents,
    portfolio_net_cents,
    portfolio_margin_pct: marginPctFromCents(
      portfolio_revenue_cents,
      portfolio_net_cents,
    ),
    rows: projected,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSignedAud(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}A$${whole}.${frac}`;
}

/**
 * Render a margin_pct value as `N%` / `-N%` / `—` (null). Extracted so the
 * section body + footer share formatting.
 */
export function formatMarginCell(margin_pct: number | null): string {
  if (margin_pct === null) return "—";
  return `${margin_pct}%`;
}

/**
 * Render the dedicated contribution-margin section for the weekly digest.
 * Returns an empty string when `rows` is empty so the caller can
 * unconditionally append the result. Negative-margin rows render on an
 * amber background so loss-leader partners visually pop against profitable
 * ones — matches the down-streak highlight posture from P11.30/P11.32.
 */
export function formatWeeklyDigestContributionMarginSection(
  margins: ContributionMargins,
): string {
  if (margins.rows.length === 0) return "";

  const body = margins.rows
    .map((r) => {
      const highlight =
        r.margin_pct !== null && r.margin_pct < 0
          ? ' style="background:#fff8e1"'
          : "";
      return `
      <tr${highlight}>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${formatSignedAud(r.revenue_cents)}</td>
        <td style="text-align:right">${formatSignedAud(r.net_contribution_cents)}</td>
        <td style="text-align:right">${formatMarginCell(r.margin_pct)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Contribution margin % — ${escapeHtml(margins.month_key)}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Dedicated margin projection of the net-contribution table above, sorted by margin desc so the most-profitable partners land first (answers &quot;who should we send more customers?&quot;). Margin is <code>net &divide; revenue &times; 100</code> rendered as integer percent (Math.trunc so loss magnitude is visible without rounding toward loss). Negative-margin rows are highlighted amber &mdash; partner is currently a loss leader. Rows with zero revenue render <code>&mdash;</code> and sort last so the null band stays grouped.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Revenue (MRR)</th>
          <th>Net contribution</th>
          <th>Margin</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Portfolio</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(margins.portfolio_revenue_cents)}</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(margins.portfolio_net_cents)}</strong></td>
          <td style="text-align:right"><strong>${formatMarginCell(margins.portfolio_margin_pct)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
