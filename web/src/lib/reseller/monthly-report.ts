// Pure aggregation + CSV/email formatting for the monthly reseller KPI report.
// See docs/plans/reseller-module-plan.md § C.6 (R9) and § P7_kpi_reports.
//
// Kept dependency-free so the aggregation shape and CSV column contract can be
// unit-tested without touching Supabase. Consumed by
// /api/cron/reseller-monthly-report.

export interface RevenueEventRow {
  reseller_id: string;
  user_id: string | null;
  ts: string; // ISO timestamp
  kind: string;
  gross_aud_cents: number | null;
  net_aud_cents: number | null;
  reseller_commission_aud_cents: number | null;
}

export interface CreditGrantRow {
  reseller_id: string;
  kind: string; // 'grant' | 'sandbox_spend'
  amount: number;
  over_budget: boolean;
  month_key: string;
}

export interface ResellerMeta {
  id: string;
  code: string;
  display_name: string | null;
}

export interface MonthlyReportRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  month: string;
  new_signups: number;
  active_customers_eom: number;
  attributed_mrr_aud_cents: number;
  churned_customers: number;
  blockid_gross_revenue_aud_cents: number;
  blockid_net_revenue_aud_cents: number;
  commission_pct_effective: number;
  commission_owed_aud_cents: number;
  ai_credits_granted: number;
  ai_credits_over_budget_count: number;
}

const SIGNUP_KINDS = new Set(["trial_convert", "subscribe"]);
// Recurring kinds are those whose latest occurrence for a user marks the user
// as "still on plan" at end-of-month.
const RECURRING_KINDS = new Set([
  "trial_convert",
  "subscribe",
  "renewal",
  "upgrade",
  "downgrade",
]);
// Churn kinds are terminal for a user in the reporting window.
const CHURN_KINDS = new Set(["trial_end_no_payment", "refund", "chargeback"]);

/** Returns the 'YYYY-MM' key for a UTC date. */
export function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Returns the previous full calendar month key relative to `now` (UTC). */
export function previousMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return monthKeyOf(prev);
}

/** Returns [startIso, endIso) covering the given YYYY-MM month in UTC. */
export function monthWindow(monthKey: string): {
  startIso: string;
  endIso: string;
} {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

interface UserAgg {
  latest_ts: number;
  latest_kind: string;
  signed_up: boolean;
}

/**
 * Aggregate revenue_events + reseller_credit_grants into one CSV row per
 * reseller. Only resellers with at least one event *or* grant during the
 * window appear in the output (matches the reconciliation cron's shape).
 */
export function buildMonthlyReport(
  monthKey: string,
  events: RevenueEventRow[],
  grants: CreditGrantRow[],
  resellers: ResellerMeta[],
): MonthlyReportRow[] {
  const resellerMeta = new Map(resellers.map((r) => [r.id, r]));
  const perReseller = new Map<
    string,
    {
      gross: number;
      net: number;
      commission: number;
      mrr: number;
      signups: Set<string>;
      users: Map<string, UserAgg>;
    }
  >();

  const ensureReseller = (id: string) => {
    const existing = perReseller.get(id);
    if (existing) return existing;
    const fresh = {
      gross: 0,
      net: 0,
      commission: 0,
      mrr: 0,
      signups: new Set<string>(),
      users: new Map<string, UserAgg>(),
    };
    perReseller.set(id, fresh);
    return fresh;
  };

  for (const ev of events) {
    if (!ev.reseller_id) continue;
    const bucket = ensureReseller(ev.reseller_id);
    bucket.gross += ev.gross_aud_cents ?? 0;
    bucket.net += ev.net_aud_cents ?? 0;
    bucket.commission += ev.reseller_commission_aud_cents ?? 0;
    if (RECURRING_KINDS.has(ev.kind)) {
      bucket.mrr += ev.gross_aud_cents ?? 0;
    }
    if (ev.user_id) {
      if (SIGNUP_KINDS.has(ev.kind)) {
        bucket.signups.add(ev.user_id);
      }
      if (RECURRING_KINDS.has(ev.kind) || CHURN_KINDS.has(ev.kind)) {
        const tsMs = Date.parse(ev.ts);
        const prior = bucket.users.get(ev.user_id);
        if (!prior || tsMs > prior.latest_ts) {
          bucket.users.set(ev.user_id, {
            latest_ts: tsMs,
            latest_kind: ev.kind,
            signed_up: prior?.signed_up ?? SIGNUP_KINDS.has(ev.kind),
          });
        } else if (SIGNUP_KINDS.has(ev.kind)) {
          prior.signed_up = true;
        }
      }
    }
  }

  const grantsByReseller = new Map<string, { total: number; overBudget: number }>();
  for (const g of grants) {
    if (g.month_key !== monthKey) continue;
    if (g.kind !== "grant") continue;
    const b = grantsByReseller.get(g.reseller_id) ?? { total: 0, overBudget: 0 };
    b.total += g.amount;
    if (g.over_budget) b.overBudget += 1;
    grantsByReseller.set(g.reseller_id, b);
    if (!perReseller.has(g.reseller_id)) {
      // Grants without revenue events still deserve a report row.
      ensureReseller(g.reseller_id);
    }
  }

  const rows: MonthlyReportRow[] = [];
  for (const [id, bucket] of perReseller) {
    const meta = resellerMeta.get(id);
    let active = 0;
    let churned = 0;
    for (const [, agg] of bucket.users) {
      if (RECURRING_KINDS.has(agg.latest_kind)) active += 1;
      else if (CHURN_KINDS.has(agg.latest_kind)) churned += 1;
    }
    const grantAgg = grantsByReseller.get(id) ?? { total: 0, overBudget: 0 };
    const commissionPct = bucket.gross > 0
      ? Math.round((bucket.commission / bucket.gross) * 10000) / 100
      : 0;
    rows.push({
      reseller_id: id,
      reseller_code: meta?.code ?? "UNKNOWN",
      reseller_display_name: meta?.display_name ?? meta?.code ?? "Unknown reseller",
      month: monthKey,
      new_signups: bucket.signups.size,
      active_customers_eom: active,
      attributed_mrr_aud_cents: bucket.mrr,
      churned_customers: churned,
      blockid_gross_revenue_aud_cents: bucket.gross,
      blockid_net_revenue_aud_cents: bucket.net,
      commission_pct_effective: commissionPct,
      commission_owed_aud_cents: bucket.commission,
      ai_credits_granted: grantAgg.total,
      ai_credits_over_budget_count: grantAgg.overBudget,
    });
  }
  rows.sort((a, b) => a.reseller_code.localeCompare(b.reseller_code));
  return rows;
}

/** RFC-4180 field escape. */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const CSV_HEADER = [
  "reseller_id",
  "reseller_display_name",
  "month",
  "new_signups",
  "active_customers_eom",
  "attributed_mrr_aud",
  "churned_customers",
  "blockid_gross_revenue_aud",
  "blockid_net_revenue_aud",
  "commission_pct_effective",
  "commission_owed_aud",
  "ai_credits_granted",
  "ai_credits_over_budget_count",
] as const;

const cents = (v: number) => (v / 100).toFixed(2);

export function formatMonthlyReportCsv(
  monthKey: string,
  rows: MonthlyReportRow[],
): string {
  const lines: string[] = [];
  lines.push(`# BlockID reseller monthly KPI report — ${monthKey}`);
  lines.push(CSV_HEADER.map(csvEscape).join(","));
  for (const r of rows) {
    lines.push(
      [
        r.reseller_id,
        r.reseller_display_name,
        r.month,
        r.new_signups,
        r.active_customers_eom,
        cents(r.attributed_mrr_aud_cents),
        r.churned_customers,
        cents(r.blockid_gross_revenue_aud_cents),
        cents(r.blockid_net_revenue_aud_cents),
        r.commission_pct_effective.toFixed(2),
        cents(r.commission_owed_aud_cents),
        r.ai_credits_granted,
        r.ai_credits_over_budget_count,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMonthlyReportEmail(
  monthKey: string,
  rows: MonthlyReportRow[],
): string {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.reseller_code)}</td><td>${escapeHtml(
          r.reseller_display_name,
        )}</td><td style="text-align:right">${r.new_signups}</td><td style="text-align:right">${r.active_customers_eom}</td><td style="text-align:right">${r.churned_customers}</td><td style="text-align:right">A$${cents(
          r.attributed_mrr_aud_cents,
        )}</td><td style="text-align:right">A$${cents(
          r.blockid_gross_revenue_aud_cents,
        )}</td><td style="text-align:right">A$${cents(
          r.commission_owed_aud_cents,
        )}</td><td style="text-align:right">${r.ai_credits_granted}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:14px">
<h2>Reseller monthly KPI report — ${escapeHtml(monthKey)}</h2>
<p>Per-reseller KPIs for ${escapeHtml(monthKey)}. Attached CSV is authoritative and mirrors § C.6 column contract.</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
<thead><tr><th>Code</th><th>Reseller</th><th>New signups</th><th>Active EOM</th><th>Churned</th><th>MRR A$</th><th>Gross A$</th><th>Commission A$</th><th>Credits granted</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="9"><em>No reseller activity this month.</em></td></tr>'}</tbody>
</table>
</body></html>`;
}
