// Weekly digest — per-reseller LTV / CAC ratio (P11.11).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `ltv_cac_per_reseller` as the last remaining ongoing signal for the Monday
// digest. Before this module the digest surfaced leading-signals + audit
// anomalies + human_blocked + budget-utilization (P11.1) + tier-mix (P11.2) +
// commission_cleared_mtd (P11.3) + clawback_exposure (P11.4) + attributed_mrr
// (P11.5) + attributed_net_contribution (P11.6) + attributed_churn_30d
// (P11.7) + ledger_drift_events (P11.8) + gst_reconciliation_delta (P11.9) +
// cohort_velocity (P11.10) — the channel-health golden ratio (is a reseller's
// customer base worth 3× what BlockID paid to acquire it?) required an ops
// user to open /admin/resellers/[code] per row and hand-sum revenue_events
// against cleared reseller_commissions across all-time.
//
// Definition per plan-delta-2026-07-23.md D2-CFO-07 (CFO §5 expanded KPI set)
// and industry convention:
//   • lifetime_revenue_cents  = Σ revenue_events.net_aud_cents scoped to the
//     reseller_id (all-time). net_aud_cents is GST-net so the ratio compares
//     BlockID's take-home revenue against BlockID's commission cost — the
//     GST that Auschain remits to the ATO is not counted as either side of
//     the equation.
//   • cumulative_cleared_commission_cents = Σ reseller_commissions.commission_aud_cents
//     for status='cleared' rows (past pending_until, no refund/dispute) — the
//     realised commission cost. Pending and disputed commissions are NOT
//     counted here because they can still reverse before landing on the
//     payout — P11.4 clawback_exposure already surfaces the still-at-risk
//     pile so the LTV/CAC ratio only reads settled cost.
//   • attributed_customers = distinct user_ids in the reseller's attribution
//     book (matches the customersByReseller.size denominator already used by
//     P11.7 attributed_churn_30d).
//   • ltv_per_customer_cents  = attributed_customers > 0
//                               ? floor(lifetime_revenue / attributed_customers)
//                               : 0
//   • cac_per_customer_cents  = attributed_customers > 0
//                               ? floor(cumulative_cleared / attributed_customers)
//                               : 0
//   • ltv_cac_ratio_hundredths = cumulative_cleared > 0
//                                ? floor(lifetime_revenue * 100 / cumulative_cleared)
//                                : null
//   Renders as "N.NN×" in the section (e.g. 312 → "3.12×"). null renders as
//   &mdash; so a reseller that has never had a cleared commission does not
//   misleadingly show ∞× or 0×.
//
// Ratio convention: hundredths (integer scaled 100×) rather than a floating
// point ratio so the digest never emits a locale-drifted "3.12" vs "3,12" and
// the CSV/HTML pipeline stays whole-integer end-to-end — mirrors the
// commission_pct scaling posture in commission.ts.
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested without
// touching Supabase or nodemailer — mirrors cohort-velocity.ts (P11.10).

/**
 * The revenue-recognising kinds from revenue_events.kind_check. All-time sum
 * of net_aud_cents across these kinds is the LTV numerator. Refund + chargeback
 * are excluded from the sum here because net_aud_cents on a refund row is
 * already negative — the caller sums every row and the sign of net_aud_cents
 * carries the direction. Kept as a public export so the cron can pre-filter
 * the .in() clause and keep the query surface small.
 */
export const LTV_REVENUE_KINDS = [
  "subscribe",
  "renewal",
  "upgrade",
  "downgrade",
  "trial_convert",
  "refund",
  "chargeback",
] as const;

export type LtvRevenueKind = (typeof LTV_REVENUE_KINDS)[number];

/**
 * One revenue_events row the cron passes into computeLtvCac. Scoped to
 * revenue-recognising kinds so the caller does not need to filter.
 */
export interface LtvRevenueRow {
  reseller_id: string;
  net_aud_cents: number | null;
  kind?: string | null;
}

/**
 * One reseller_commissions_current row (status='cleared') the cron passes
 * into computeLtvCac. commission_aud_cents is the realised commission cost.
 */
export interface CacCommissionRow {
  reseller_id: string;
  commission_aud_cents: number | null;
}

export interface LtvCac {
  lifetime_revenue_cents: number;
  cumulative_cleared_commission_cents: number;
  attributed_customers: number;
  ltv_per_customer_cents: number;
  cac_per_customer_cents: number;
  ltv_cac_ratio_hundredths: number | null;
}

function safeCents(x: number | null | undefined): number {
  if (x === null || x === undefined) return 0;
  if (!Number.isFinite(x)) return 0;
  return Math.trunc(x);
}

/**
 * Fold revenue rows + commission rows + the attributed_customers denominator
 * into the LTV/CAC aggregate for a single reseller. Every dimension is a
 * whole-integer cent so the ratio math never drifts on floating-point.
 *
 * lifetime_revenue_cents sums net_aud_cents as-is (refund/chargeback rows
 * arrive negative and subtract themselves). Negative sum is clamped to 0
 * because a reseller whose refund exceeds cumulative revenue would otherwise
 * produce a nonsense negative LTV — clamping at 0 is the truthful "no LTV
 * captured yet" answer.
 */
export function computeLtvCac(
  revenue: ReadonlyArray<LtvRevenueRow>,
  commission: ReadonlyArray<CacCommissionRow>,
  attributedCustomers: number,
): LtvCac {
  let lifetime = 0;
  for (const r of revenue) lifetime += safeCents(r.net_aud_cents);
  if (lifetime < 0) lifetime = 0;
  let cumulative = 0;
  for (const c of commission) cumulative += safeCents(c.commission_aud_cents);
  if (cumulative < 0) cumulative = 0;
  const denom = Number.isFinite(attributedCustomers) && attributedCustomers > 0
    ? Math.trunc(attributedCustomers)
    : 0;
  const ltvPerCustomer = denom > 0 ? Math.floor(lifetime / denom) : 0;
  const cacPerCustomer = denom > 0 ? Math.floor(cumulative / denom) : 0;
  const ratioHundredths = cumulative > 0
    ? Math.floor((lifetime * 100) / cumulative)
    : null;
  return {
    lifetime_revenue_cents: lifetime,
    cumulative_cleared_commission_cents: cumulative,
    attributed_customers: denom,
    ltv_per_customer_cents: ltvPerCustomer,
    cac_per_customer_cents: cacPerCustomer,
    ltv_cac_ratio_hundredths: ratioHundredths,
  };
}

/**
 * Fold revenue + commission rows across every requested reseller. Every
 * reseller in `resellerIds` receives one LtvCac row even if it has zero
 * revenue / zero commission / zero attributed customers so a partner without
 * activity is visible not absent (mirrors the zero-row survival posture of
 * P11.5 attributed-mrr / P11.7 attributed-churn / P11.10 cohort-velocity).
 *
 * `attributedCustomers` is a per-reseller_id → count map (typically
 * customersByReseller.size from the cron). Missing keys default to 0.
 */
export function computeLtvCacByReseller(
  resellerIds: ReadonlyArray<string>,
  revenue: ReadonlyArray<LtvRevenueRow>,
  commission: ReadonlyArray<CacCommissionRow>,
  attributedCustomers: ReadonlyMap<string, number>,
): Map<string, LtvCac> {
  const revByReseller = new Map<string, LtvRevenueRow[]>();
  for (const r of revenue) {
    const list = revByReseller.get(r.reseller_id) ?? [];
    list.push(r);
    revByReseller.set(r.reseller_id, list);
  }
  const comByReseller = new Map<string, CacCommissionRow[]>();
  for (const c of commission) {
    const list = comByReseller.get(c.reseller_id) ?? [];
    list.push(c);
    comByReseller.set(c.reseller_id, list);
  }
  const out = new Map<string, LtvCac>();
  for (const id of resellerIds) {
    out.set(
      id,
      computeLtvCac(
        revByReseller.get(id) ?? [],
        comByReseller.get(id) ?? [],
        attributedCustomers.get(id) ?? 0,
      ),
    );
  }
  return out;
}

export interface LtvCacRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  ltv_cac: LtvCac;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render dollars from whole cents as A$D.CC. No Intl locale drift.
 */
function formatAud(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `A$${dollars}.${rem.toString().padStart(2, "0")}`;
}

/**
 * Render the ratio_hundredths integer as N.NN× (e.g. 312 → "3.12×"). null
 * renders as &mdash; so a reseller with zero commission does not misleadingly
 * show ∞× or 0× — the truthful answer is "no ratio yet". Fractional cents on
 * the divisor round toward the ledger sign (Math.floor already applied inside
 * computeLtvCac).
 */
function formatRatio(hundredths: number | null): string {
  if (hundredths === null) return "&mdash;";
  const whole = Math.floor(hundredths / 100);
  const rem = hundredths % 100;
  return `${whole}.${rem.toString().padStart(2, "0")}&times;`;
}

/**
 * Render the LTV/CAC section for the weekly digest. Returns an empty string
 * when `rows` is empty so the caller can unconditionally append the result.
 *
 * Layout: one row per reseller with lifetime revenue, cumulative cleared
 * commission, attributed customer count, LTV/customer, CAC/customer, and the
 * ratio. A <tfoot> Total row sums the whole-portfolio LTV + CAC and computes
 * the portfolio-wide ratio so ops sees the reseller channel's aggregate
 * unit economics at a glance.
 */
export function formatWeeklyDigestLtvCacSection(
  rows: ReadonlyArray<LtvCacRow>,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const body = sorted
    .map((r) => {
      const l = r.ltv_cac;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${l.attributed_customers}</td>
        <td style="text-align:right">${formatAud(l.lifetime_revenue_cents)}</td>
        <td style="text-align:right">${formatAud(l.cumulative_cleared_commission_cents)}</td>
        <td style="text-align:right">${formatAud(l.ltv_per_customer_cents)}</td>
        <td style="text-align:right">${formatAud(l.cac_per_customer_cents)}</td>
        <td style="text-align:right"><strong>${formatRatio(l.ltv_cac_ratio_hundredths)}</strong></td>
      </tr>`;
    })
    .join("");
  let totalCustomers = 0;
  let totalLtv = 0;
  let totalCac = 0;
  for (const r of sorted) {
    totalCustomers += r.ltv_cac.attributed_customers;
    totalLtv += r.ltv_cac.lifetime_revenue_cents;
    totalCac += r.ltv_cac.cumulative_cleared_commission_cents;
  }
  const portfolioLtvPerCustomer = totalCustomers > 0
    ? Math.floor(totalLtv / totalCustomers)
    : 0;
  const portfolioCacPerCustomer = totalCustomers > 0
    ? Math.floor(totalCac / totalCustomers)
    : 0;
  const portfolioRatioHundredths = totalCac > 0
    ? Math.floor((totalLtv * 100) / totalCac)
    : null;
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">LTV / CAC per reseller</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Channel-health golden ratio. LTV = sum of <code>revenue_events.net_aud_cents</code> (GST-net) across the reseller's book, all-time. CAC = sum of <code>reseller_commissions_current.commission_aud_cents</code> for <code>status='cleared'</code> rows (past <code>pending_until</code>, no refund/dispute) — realised commission cost only. Ratio renders as N.NN&times; and lands blank (&mdash;) when the reseller has no cleared commission yet.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Customers</th>
          <th>Lifetime revenue</th>
          <th>Cumulative commission</th>
          <th>LTV / customer</th>
          <th>CAC / customer</th>
          <th>LTV / CAC</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalCustomers}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalLtv)}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalCac)}</strong></td>
          <td style="text-align:right"><strong>${formatAud(portfolioLtvPerCustomer)}</strong></td>
          <td style="text-align:right"><strong>${formatAud(portfolioCacPerCustomer)}</strong></td>
          <td style="text-align:right"><strong>${formatRatio(portfolioRatioHundredths)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
