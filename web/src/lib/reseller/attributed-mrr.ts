// Weekly digest — per-reseller attributed monthly recurring revenue (P11.5).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `attributed_mrr` as one of the ongoing signals the Monday digest should
// surface. Before this module the digest surfaced leading signals + audit-log
// anomalies + human_blocked escalations + budget-utilization (P11.1) +
// tier-mix (P11.2) + commission_cleared_mtd (P11.3) + clawback_exposure
// (P11.4) — the running-revenue side (what each partner's book is worth right
// now, not the paid commission alone) required an ops user to open
// /admin/resellers/[code] per row and hand-join subscription_trial_state to
// plans against the attributed customer set.
//
// A subscription contributes MRR when its status is active AND the plan's
// price_aud_cents is > 0 AND the plan's interval is monthly or yearly. Yearly
// prices normalise by ÷12 so mrr_cents is always in monthly-cents units and
// matches the v_mrr_active view from migration 0083.
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested without
// touching Supabase or nodemailer — mirrors budget-utilization.ts (P11.1) +
// tier-mix.ts (P11.2) + commission-cleared-mtd.ts (P11.3) + clawback-exposure
// (P11.4).

/**
 * One MRR-contributing subscription row shape the digest cron passes into
 * computeAttributedMrr. The cron resolves the fields by reading
 * subscription_trial_state (status='active') joined against the attributed
 * customer set and plans (interval + price_aud_cents).
 */
export interface AttributedSubscriptionRow {
  reseller_id: string;
  plan_id: string | null;
  price_aud_cents: number;
  interval: "monthly" | "yearly" | "once" | "custom" | string | null;
}

export interface AttributedMrr {
  active_subs: number;
  mrr_cents: number;
}

function emptyMrr(): AttributedMrr {
  return { active_subs: 0, mrr_cents: 0 };
}

/**
 * Normalise a plan's price to monthly cents. Yearly ÷ 12, monthly as-is; any
 * other interval (once/custom/null) contributes 0. Non-finite/non-positive
 * prices contribute 0 but still bump active_subs so a garbled ledger row is
 * visible in the count rather than silently omitted — matches the total-
 * invariant posture of computeClawbackExposure (P11.4) and computeClearedMtd
 * (P11.3).
 */
export function computeMrrCentsForRow(row: AttributedSubscriptionRow): number {
  const price = row.price_aud_cents;
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (row.interval === "monthly") return Math.floor(price);
  if (row.interval === "yearly") return Math.floor(price / 12);
  return 0;
}

/**
 * Fold active-subscription rows into an aggregate for a single reseller.
 * A row that resolves to 0 mrr_cents (once/custom interval, garbled price)
 * still bumps active_subs so ops can spot the mismatch in the section.
 */
export function computeAttributedMrr(
  rows: ReadonlyArray<AttributedSubscriptionRow>,
): AttributedMrr {
  const out = emptyMrr();
  for (const r of rows) {
    out.active_subs += 1;
    out.mrr_cents += computeMrrCentsForRow(r);
  }
  return out;
}

/**
 * Group active-subscription rows by reseller_id, then compute one
 * AttributedMrr per group. Resellers with zero active subscriptions still
 * appear with a zeroed aggregate so a partner whose book churned out is
 * visible rather than absent — matches computeClawbackExposureByReseller.
 */
export function computeAttributedMrrByReseller(
  resellerIds: ReadonlyArray<string>,
  rows: ReadonlyArray<AttributedSubscriptionRow>,
): Map<string, AttributedMrr> {
  const grouped = new Map<string, AttributedSubscriptionRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.reseller_id) ?? [];
    list.push(r);
    grouped.set(r.reseller_id, list);
  }
  const out = new Map<string, AttributedMrr>();
  for (const id of resellerIds) {
    out.set(id, computeAttributedMrr(grouped.get(id) ?? []));
  }
  return out;
}

export interface AttributedMrrRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  mrr: AttributedMrr;
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
 * Mirrors formatAud in clawback-exposure.ts (P11.4) + commission-cleared-mtd.ts
 * (P11.3).
 */
function formatAud(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = Math.abs(cents % 100).toString().padStart(2, "0");
  return `A$${whole}.${frac}`;
}

/**
 * Render the attributed-MRR section for the weekly digest. Returns an empty
 * string when `rows` is empty so the caller can unconditionally append the
 * result. Ops reads this alongside clawback_exposure (P11.4): MRR is the
 * running-revenue book, exposure is the still-at-risk pile that could reverse.
 * ARR column = mrr × 12 so ops can eyeball the annualised run-rate without
 * spreadsheeting.
 */
export function formatWeeklyDigestAttributedMrrSection(
  rows: ReadonlyArray<AttributedMrrRow>,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const totalSubs = sorted.reduce<number>((acc, r) => acc + r.mrr.active_subs, 0);
  const totalMrr = sorted.reduce<number>((acc, r) => acc + r.mrr.mrr_cents, 0);
  const body = sorted
    .map((r) => {
      const m = r.mrr;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${m.active_subs}</td>
        <td style="text-align:right">${formatAud(m.mrr_cents)}</td>
        <td style="text-align:right">${formatAud(m.mrr_cents * 12)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Attributed MRR (active subscriptions)</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller sum of monthly recurring revenue from attributed customers whose <code>subscription_trial_state.status='active'</code>. Yearly plans normalise to monthly cents (÷12) so the MRR column matches the <code>v_mrr_active</code> convention from migration 0083. ARR column is <code>mrr × 12</code> for the annualised run-rate. Once-off and custom-interval plans contribute 0 to MRR but still bump active_subs so ops can spot the mismatch.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Active subs</th>
          <th>MRR (AUD)</th>
          <th>ARR (AUD)</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${totalSubs}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalMrr)}</strong></td>
          <td style="text-align:right"><strong>${formatAud(totalMrr * 12)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
