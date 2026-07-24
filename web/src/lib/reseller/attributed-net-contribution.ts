// Weekly digest — per-reseller attributed net contribution (P11.6).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `attributed_net_contribution` as one of the ongoing signals the Monday
// digest should surface. Before this module the digest surfaced leading
// signals + audit-log anomalies + human_blocked escalations + budget-
// utilization (P11.1) + tier-mix (P11.2) + commission_cleared_mtd (P11.3) +
// clawback_exposure (P11.4) + attributed_mrr (P11.5) — the composite bottom-
// line that answers "is this partner net-positive for BlockID this month?"
// still required an ops user to hand-fold MRR against commission paid and
// COGS of credits granted.
//
// Definition per plan-delta-2026-07-23.md § D2-CFO-07 and CFO §5:
//   net_contribution = attributed_mrr_cents
//                    − commission_cleared_mtd_cents
//                    − cogs_of_credits_granted_mtd_cents
//
// Where cogs_of_credits_granted_mtd_cents = credits_used_mtd × cogs_per_credit
// (cogs_per_credit resolves via getCogsPerCreditAud from cogs.ts so a monthly
// env update propagates without redeploy — matches U.15.13 / H.18 posture).
// Both grant + sandbox credit consumption count against COGS since both draw
// on the same AI provider bill.
//
// margin_pct is exposed as (net / revenue) × 100 rendered as an integer
// percent; when revenue_cents is 0 the section renders `—` rather than a
// division-by-zero NaN so ops sees the shape (no revenue = margin undefined
// even if we did spend on credits — the loss belongs to the credit_budget_
// utilization section, not the margin column).
//
// Kept dependency-free (except the pure cogs.ts env lookup) so the CSV/HTML
// shape can be regression-tested without touching Supabase or nodemailer —
// mirrors budget-utilization.ts (P11.1) + tier-mix.ts (P11.2) + commission-
// cleared-mtd.ts (P11.3) + clawback-exposure.ts (P11.4) + attributed-mrr.ts
// (P11.5).

import { getCogsPerCreditAud } from "./cogs";

/**
 * One net-contribution input row shape the digest cron passes into
 * computeNetContribution. All four fields are already computed by earlier
 * sections (mrr from P11.5, commission from P11.3, credits_used from P11.1);
 * this module just folds them into the composite bottom line.
 */
export interface NetContributionInput {
  reseller_id: string;
  mrr_cents: number;
  commission_cleared_mtd_cents: number;
  credits_used_mtd: number;
}

export interface NetContribution {
  revenue_cents: number;
  commission_cost_cents: number;
  credit_cogs_cents: number;
  net_contribution_cents: number;
}

function safeCents(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function safeCredits(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Compute COGS in whole cents for a given credit count at the current
 * COGS_PER_CREDIT_AUD rate. Cost per credit is AUD dollars so multiply by
 * 100 to reach cents, then Math.round to whole cents (matches the half-away-
 * from-zero rounding that Math.round applies on positive integers — good
 * enough for a digest aggregate; individual per-grant COGS is not re-derived
 * here since the digest reads the credit_transactions total, not per-txn).
 */
export function computeCreditCogsCents(credits: number): number {
  const safeCr = safeCredits(credits);
  if (safeCr === 0) return 0;
  const perCreditAud = getCogsPerCreditAud();
  if (!Number.isFinite(perCreditAud) || perCreditAud <= 0) return 0;
  return Math.round(safeCr * perCreditAud * 100);
}

/**
 * Fold input into a NetContribution. All three cost dimensions are floored
 * to non-negative integers so a garbled input can only shrink net toward
 * zero, never push it negative through NaN.
 */
export function computeNetContribution(
  input: NetContributionInput,
): NetContribution {
  const revenue_cents = safeCents(input.mrr_cents);
  const commission_cost_cents = safeCents(input.commission_cleared_mtd_cents);
  const credit_cogs_cents = computeCreditCogsCents(input.credits_used_mtd);
  const net_contribution_cents =
    revenue_cents - commission_cost_cents - credit_cogs_cents;
  return {
    revenue_cents,
    commission_cost_cents,
    credit_cogs_cents,
    net_contribution_cents,
  };
}

/**
 * Compute one NetContribution per reseller_id from a batched input list.
 * Resellers with no matching input row still appear with a zeroed aggregate
 * so a partner whose book has zero revenue is visible rather than absent —
 * matches computeAttributedMrrByReseller / computeClawbackExposureByReseller.
 */
export function computeNetContributionByReseller(
  resellerIds: ReadonlyArray<string>,
  inputs: ReadonlyArray<NetContributionInput>,
): Map<string, NetContribution> {
  const byId = new Map<string, NetContributionInput>();
  for (const i of inputs) byId.set(i.reseller_id, i);
  const out = new Map<string, NetContribution>();
  for (const id of resellerIds) {
    out.set(
      id,
      computeNetContribution(
        byId.get(id) ?? {
          reseller_id: id,
          mrr_cents: 0,
          commission_cleared_mtd_cents: 0,
          credits_used_mtd: 0,
        },
      ),
    );
  }
  return out;
}

export interface NetContributionRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  net: NetContribution;
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
 * Signed — negative net contributions render as -A$D.CC so ops can spot
 * loss-making resellers at a glance. Mirrors formatAud in the sibling
 * P11.3/P11.4/P11.5 modules but adds a leading minus for negative cents
 * since a net-contribution figure legitimately goes below zero when COGS +
 * commission exceed MRR (partner is currently a loss leader).
 */
function formatSignedAud(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}A$${whole}.${frac}`;
}

/**
 * Render margin as integer percent (net / revenue × 100), or `—` when
 * revenue is 0 so the section does not surface a NaN or a misleading 0%.
 * Negative margins render with a leading minus. Uses Math.trunc so a
 * -12.7% renders as -12% (loss magnitude visible without pretending to
 * round toward the loss).
 */
export function formatMarginPct(net: NetContribution): string {
  if (net.revenue_cents <= 0) return "—";
  const pct = (net.net_contribution_cents / net.revenue_cents) * 100;
  if (!Number.isFinite(pct)) return "—";
  return `${Math.trunc(pct)}%`;
}

/**
 * Render the net-contribution section for the weekly digest. Returns an
 * empty string when `rows` is empty so the caller can unconditionally append
 * the result. Ops reads this as the composite bottom line — the earlier
 * sections (P11.1 P11.3 P11.5) each report one dimension; this one folds
 * them into the "is this partner net-positive?" answer.
 */
export function formatWeeklyDigestNetContributionSection(
  rows: ReadonlyArray<NetContributionRow>,
  monthKey: string,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const totalRevenue = sorted.reduce<number>(
    (acc, r) => acc + r.net.revenue_cents,
    0,
  );
  const totalCommission = sorted.reduce<number>(
    (acc, r) => acc + r.net.commission_cost_cents,
    0,
  );
  const totalCogs = sorted.reduce<number>(
    (acc, r) => acc + r.net.credit_cogs_cents,
    0,
  );
  const totalNet = totalRevenue - totalCommission - totalCogs;
  const totalNetForMargin: NetContribution = {
    revenue_cents: totalRevenue,
    commission_cost_cents: totalCommission,
    credit_cogs_cents: totalCogs,
    net_contribution_cents: totalNet,
  };
  const body = sorted
    .map((r) => {
      const n = r.net;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${formatSignedAud(n.revenue_cents)}</td>
        <td style="text-align:right">${formatSignedAud(n.commission_cost_cents)}</td>
        <td style="text-align:right">${formatSignedAud(n.credit_cogs_cents)}</td>
        <td style="text-align:right">${formatSignedAud(n.net_contribution_cents)}</td>
        <td style="text-align:right">${formatMarginPct(n)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Attributed net contribution — ${escapeHtml(monthKey)}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Composite bottom line per reseller: <code>attributed_mrr − commission_cleared_mtd − credit_cogs_mtd</code>. COGS resolves via <code>COGS_PER_CREDIT_AUD</code> (env-overridable per H.18; default A$0.05/credit) applied to both grant + sandbox credit consumption. Negative net contributions render with a leading minus — partner is currently a loss leader (COGS + commission exceed MRR). Margin column is <code>net ÷ revenue × 100</code> rendered as integer percent; <code>—</code> when revenue is zero.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Revenue (MRR)</th>
          <th>Commission cost</th>
          <th>Credit COGS</th>
          <th>Net contribution</th>
          <th>Margin</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(totalRevenue)}</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(totalCommission)}</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(totalCogs)}</strong></td>
          <td style="text-align:right"><strong>${formatSignedAud(totalNet)}</strong></td>
          <td style="text-align:right"><strong>${formatMarginPct(totalNetForMargin)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}
