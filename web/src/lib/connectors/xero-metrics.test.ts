// S25-A — Xero parsers (lifted from api/oauth/xero/callback) + the refresh
// exchange. Pins: P&L section totals + net row, BankSummary closing balance,
// parenthesised negatives, the metrics shape the snapshot stores, and that
// the refresh call never logs a token and surfaces invalid_grant as a typed
// 4xx error.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  XERO_PL_WINDOW_MONTHS,
  XeroRefreshError,
  extractBankBalance,
  extractPLValues,
  fetchXeroMetrics,
  parseXeroAmount,
  refreshXeroToken,
  xeroMetricsFromReports,
  type XeroReport,
} from "./xero-metrics";

const PL: XeroReport = {
  ReportName: "Profit and Loss",
  ReportDate: "For the 3 months ended 31 August 2026",
  Rows: [
    { RowType: "Header" },
    { RowType: "Section", Title: "Income", Rows: [{ RowType: "Row", Cells: [{ Value: "Sales" }, { Value: "27,000.00" }] }, { RowType: "SummaryRow", Cells: [{ Value: "Total Income" }, { Value: "27,000.00" }] }] },
    { RowType: "Section", Title: "Operating Expenses", Rows: [{ RowType: "SummaryRow", Cells: [{ Value: "Total Operating Expenses" }, { Value: "19,500.00" }] }] },
    { RowType: "Row", Cells: [{ Value: "Net Profit" }, { Value: "7,500.00" }] },
  ],
};

const BANK: XeroReport = {
  ReportName: "Bank Summary",
  Rows: [
    { RowType: "Header", Cells: [{ Value: "Bank Accounts" }, { Value: "Opening Balance" }, { Value: "Cash Received" }, { Value: "Cash Spent" }, { Value: "Closing Balance" }] },
    {
      RowType: "Section",
      Rows: [
        { RowType: "Row", Cells: [{ Value: "Business Cheque" }, { Value: "30,000.00" }, { Value: "27,000.00" }, { Value: "19,500.00" }, { Value: "37,500.00" }] },
        { RowType: "Row", Cells: [{ Value: "Savings" }, { Value: "4,600.50" }, { Value: "0.00" }, { Value: "0.00" }, { Value: "4,600.50" }] },
        { RowType: "SummaryRow", Cells: [{ Value: "Total" }, { Value: "34,600.50" }, { Value: "27,000.00" }, { Value: "19,500.00" }, { Value: "42,100.50" }] },
      ],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("parsers", () => {
  it("parseXeroAmount handles commas, currency symbols, blanks and (negatives)", () => {
    expect(parseXeroAmount("27,000.00")).toBe(27000);
    expect(parseXeroAmount("$1,234.5")).toBe(1234.5);
    expect(parseXeroAmount("(1,200.00)")).toBe(-1200);
    expect(parseXeroAmount(undefined)).toBe(0);
    expect(parseXeroAmount("n/a")).toBe(0);
  });

  it("extractPLValues reads section summaries and the net row; falls back to income − expenses", () => {
    expect(extractPLValues(PL)).toEqual({ totalIncomeAud: 27000, totalExpensesAud: 19500, netProfitAud: 7500 });
    const noNet: XeroReport = { Rows: PL.Rows!.filter((r) => r.RowType !== "Row") };
    expect(extractPLValues(noNet).netProfitAud).toBe(7500);
    expect(extractPLValues({})).toEqual({ totalIncomeAud: 0, totalExpensesAud: 0, netProfitAud: 0 });
  });

  it("extractBankBalance prefers the section SummaryRow closing balance, sums rows otherwise, null when empty", () => {
    expect(extractBankBalance(BANK)).toBe(42100.5);
    const noSummary: XeroReport = { Rows: [{ RowType: "Section", Rows: BANK.Rows![1].Rows!.filter((r) => r.RowType === "Row") }] };
    expect(extractBankBalance(noSummary)).toBe(42100.5);
    expect(extractBankBalance({ Rows: [] })).toBeNull();
    expect(extractBankBalance(undefined)).toBeNull();
  });

  it("xeroMetricsFromReports produces the snapshot metrics shape", () => {
    expect(xeroMetricsFromReports({ Reports: [PL] }, { Reports: [BANK] }, "Acme Pty Ltd")).toEqual({
      totalIncomeAud: 27000,
      totalExpensesAud: 19500,
      netProfitAud: 7500,
      bankBalanceAud: 42100.5,
      windowMonths: XERO_PL_WINDOW_MONTHS,
      tenantName: "Acme Pty Ltd",
      reportPeriod: "For the 3 months ended 31 August 2026",
    });
    expect(xeroMetricsFromReports({}, {}, null)).toMatchObject({ totalIncomeAud: 0, bankBalanceAud: null, windowMonths: 3 });
  });
});

describe("network", () => {
  it("refreshXeroToken posts the refresh grant with Basic client auth and returns the rotated pair", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new_access", refresh_token: "new_refresh", expires_in: 1800 }), { status: 200 }),
    );
    const out = await refreshXeroToken("old_refresh", { XERO_CLIENT_ID: "cid", XERO_CLIENT_SECRET: "sec" });
    expect(out.accessToken).toBe("new_access");
    expect(out.refreshToken).toBe("new_refresh");
    expect(out.expiresAt).toMatch(/^\d{4}-/);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://identity.xero.com/connect/token");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    expect(String(init.body)).toBe("grant_type=refresh_token&refresh_token=old_refresh");
  });

  it("refreshXeroToken throws a typed 4xx on invalid_grant and 0 when unconfigured; the message never carries the token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const err = await refreshXeroToken("secret_refresh_token", { XERO_CLIENT_ID: "cid", XERO_CLIENT_SECRET: "sec" }).catch((e) => e);
    expect(err).toBeInstanceOf(XeroRefreshError);
    expect(err.status).toBe(400);
    expect(err.message).not.toContain("secret_refresh_token");
    const unconfigured = await refreshXeroToken("x", {}).catch((e) => e);
    expect(unconfigured.status).toBe(0);
  });

  it("fetchXeroMetrics pulls the 3-period P&L + BankSummary with the tenant header; a failed report degrades to zeros", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("ProfitAndLoss")) return new Response(JSON.stringify({ Reports: [PL] }), { status: 200 });
      return new Response("nope", { status: 500 });
    });
    const out = await fetchXeroMetrics("tok", "tenant-1", "Acme");
    expect(out).toMatchObject({ totalIncomeAud: 27000, bankBalanceAud: null, tenantName: "Acme" });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain(`https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?periods=${XERO_PL_WINDOW_MONTHS}`);
    expect(urls).toContain("https://api.xero.com/api.xro/2.0/Reports/BankSummary");
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Xero-Tenant-Id"]).toBe("tenant-1");
    expect(headers.Authorization).toBe("Bearer tok");
  });
});
