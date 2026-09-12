// S25-A — Xero metrics: the parsers `api/oauth/xero/callback` used inline,
// lifted here so the weekly resync (`api/cron/connector-resync`) pulls the
// SAME figures the callback pulls, plus the refresh-token exchange the
// callback never needed (a Xero access token lives 30 minutes; the weekly
// pull always has to refresh first, and Xero rotates the refresh token on
// every use, so the caller MUST persist the new pair).
//
// No `server-only` here: the parsers are pure and unit-tested; the fetchers
// take `fetch` from the global so tests stub it. Nothing in this file logs
// a token — errors carry HTTP status + a short reason only.

export const XERO_PL_WINDOW_MONTHS = 3;

export interface XeroReportRow {
  RowType?: string;
  Title?: string;
  Cells?: { Value?: string }[];
  Rows?: XeroReportRow[];
}

export interface XeroReport {
  ReportID?: string;
  ReportName?: string;
  ReportDate?: string;
  Rows?: XeroReportRow[];
}

export interface XeroReportsResponse {
  Reports?: XeroReport[];
  Status?: string;
  DateTimeUTC?: string;
}

export interface XeroMetrics {
  totalIncomeAud: number;
  totalExpensesAud: number;
  netProfitAud: number;
  /** Sum of closing balances across bank accounts; null when the report had none. */
  bankBalanceAud: number | null;
  windowMonths: number;
  tenantName: string | null;
  /** Xero's own report date label when present ("For the 3 months ended 31 August 2026"). */
  reportPeriod: string | null;
}

export function parseXeroAmount(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[,$\s]/g, "");
  const negativeParen = /^\(.*\)$/.test(cleaned);
  const num = parseFloat(cleaned.replace(/[()]/g, ""));
  if (Number.isNaN(num)) return 0;
  return negativeParen ? -num : num;
}

/** P&L totals from a `Reports/ProfitAndLoss` report (unchanged from the callback). */
export function extractPLValues(report: XeroReport): {
  totalIncomeAud: number;
  totalExpensesAud: number;
  netProfitAud: number;
} {
  let totalIncomeAud = 0;
  let totalExpensesAud = 0;
  let netProfitAud = 0;

  const rows = report.Rows ?? [];

  for (const section of rows) {
    if (section.RowType !== "Section") continue;
    const title = (section.Title ?? "").toLowerCase();
    const sectionRows = section.Rows ?? [];

    const summaryRow = sectionRows.find((r) => r.RowType === "SummaryRow");
    const summaryValue = summaryRow?.Cells?.[1]?.Value;

    if (title.includes("income") || title.includes("revenue")) {
      totalIncomeAud = parseXeroAmount(summaryValue);
    } else if (title.includes("expense") || title.includes("cost")) {
      totalExpensesAud = parseXeroAmount(summaryValue);
    }
  }

  const netRow = rows.find(
    (r) => r.RowType === "Row" && (r.Cells?.[0]?.Value ?? "").toLowerCase().includes("net"),
  );
  if (netRow) {
    netProfitAud = parseXeroAmount(netRow.Cells?.[1]?.Value);
  } else {
    netProfitAud = totalIncomeAud - totalExpensesAud;
  }

  return { totalIncomeAud, totalExpensesAud, netProfitAud };
}

/**
 * Closing bank balance from a `Reports/BankSummary` report. Cells per bank
 * row are [Account, Opening, Received, Spent, Closing]; the section's
 * SummaryRow ("Total") carries the sum. Falls back to summing the rows when
 * no summary row exists. Null when the report has no bank rows at all.
 */
export function extractBankBalance(report: XeroReport | undefined): number | null {
  if (!report) return null;
  let found = false;
  let total = 0;
  for (const section of report.Rows ?? []) {
    if (section.RowType !== "Section") continue;
    const rows = section.Rows ?? [];
    const summary = rows.find((r) => r.RowType === "SummaryRow");
    if (summary?.Cells?.length) {
      const last = summary.Cells[summary.Cells.length - 1]?.Value;
      total += parseXeroAmount(last);
      found = true;
      continue;
    }
    for (const r of rows) {
      if (r.RowType !== "Row" || !r.Cells?.length) continue;
      const last = r.Cells[r.Cells.length - 1]?.Value;
      total += parseXeroAmount(last);
      found = true;
    }
  }
  return found ? Math.round(total * 100) / 100 : null;
}

export function xeroMetricsFromReports(
  pl: XeroReportsResponse,
  bank: XeroReportsResponse,
  tenantName: string | null,
): XeroMetrics {
  const plReport = pl.Reports?.[0];
  const totals = plReport ? extractPLValues(plReport) : { totalIncomeAud: 0, totalExpensesAud: 0, netProfitAud: 0 };
  return {
    ...totals,
    bankBalanceAud: extractBankBalance(bank.Reports?.[0]),
    windowMonths: XERO_PL_WINDOW_MONTHS,
    tenantName,
    reportPeriod: plReport?.ReportDate ?? null,
  };
}

// ── Network ────────────────────────────────────────────────────────────────

export interface XeroTokenPair {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

export class XeroRefreshError extends Error {
  code = "xero_refresh_failed";
  constructor(public status: number, reason: string) {
    super(`xero refresh failed (${status}): ${reason}`);
    this.name = "XeroRefreshError";
  }
}

/**
 * Exchange a refresh token for a new pair. Throws `XeroRefreshError` on a
 * non-2xx (`invalid_grant` = the user revoked us → reconnect). Never logs
 * the tokens.
 */
export async function refreshXeroToken(
  refreshToken: string,
  env: { XERO_CLIENT_ID?: string; XERO_CLIENT_SECRET?: string } = process.env,
): Promise<XeroTokenPair> {
  const clientId = env.XERO_CLIENT_ID;
  const clientSecret = env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new XeroRefreshError(0, "not_configured");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });
  let json: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok || !json.access_token) {
    throw new XeroRefreshError(res.status, json.error ?? "no_access_token");
  }
  const expiresAt =
    typeof json.expires_in === "number" ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null;
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt };
}

async function xeroGet<T>(path: string, accessToken: string, tenantId: string): Promise<T | null> {
  const res = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/** Resolve the first tenant when the stored connection has none (legacy rows). */
export async function fetchXeroTenant(accessToken: string): Promise<{ tenantId: string; tenantName: string } | null> {
  const res = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const list = (await res.json()) as Array<{ tenantId?: string; tenantName?: string }>;
  const first = list?.[0];
  if (!first?.tenantId) return null;
  return { tenantId: first.tenantId, tenantName: first.tenantName ?? "Xero Organisation" };
}

/** The same two reports the callback pulls: 3-period P&L + BankSummary. */
export async function fetchXeroMetrics(
  accessToken: string,
  tenantId: string,
  tenantName: string | null,
): Promise<XeroMetrics> {
  const [pl, bank] = await Promise.all([
    xeroGet<XeroReportsResponse>(`Reports/ProfitAndLoss?periods=${XERO_PL_WINDOW_MONTHS}`, accessToken, tenantId),
    xeroGet<XeroReportsResponse>("Reports/BankSummary", accessToken, tenantId),
  ]);
  return xeroMetricsFromReports(pl ?? {}, bank ?? {}, tenantName);
}
