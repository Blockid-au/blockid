import { describe, it, expect } from "vitest";
import {
  buildMonthlyReport,
  csvEscape,
  formatMonthlyReportCsv,
  formatMonthlyReportEmail,
  monthKeyOf,
  monthWindow,
  previousMonthKey,
  type CreditGrantRow,
  type ResellerMeta,
  type RevenueEventRow,
} from "./monthly-report";

const RESELLERS: ResellerMeta[] = [
  { id: "r-info", code: "INFOVISION", display_name: "InfoVision" },
  { id: "r-alpha", code: "ALPHA20", display_name: 'Alpha, "Bravo" & Co' },
];

const ts = (dayOfJune: number, hour = 12) =>
  new Date(Date.UTC(2026, 5, dayOfJune, hour)).toISOString();

function evt(partial: Partial<RevenueEventRow>): RevenueEventRow {
  return {
    reseller_id: "r-info",
    user_id: "u1",
    ts: ts(1),
    kind: "subscribe",
    gross_aud_cents: 9900,
    net_aud_cents: 9000,
    reseller_commission_aud_cents: 0,
    ...partial,
  };
}

describe("monthKeyOf + previousMonthKey + monthWindow", () => {
  it("formats UTC month keys", () => {
    expect(monthKeyOf(new Date("2026-01-15T10:00:00Z"))).toBe("2026-01");
    expect(monthKeyOf(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
  it("previousMonthKey returns YYYY-MM of previous month", () => {
    expect(previousMonthKey(new Date("2026-07-05T00:00:00Z"))).toBe("2026-06");
    expect(previousMonthKey(new Date("2026-01-05T00:00:00Z"))).toBe("2025-12");
  });
  it("monthWindow spans [start, end) at UTC month boundaries", () => {
    const { startIso, endIso } = monthWindow("2026-06");
    expect(startIso).toBe("2026-06-01T00:00:00.000Z");
    expect(endIso).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("buildMonthlyReport", () => {
  it("aggregates gross + net + commission per reseller", () => {
    const events: RevenueEventRow[] = [
      evt({ reseller_id: "r-info", user_id: "u1", kind: "subscribe" }),
      evt({
        reseller_id: "r-info",
        user_id: "u2",
        kind: "renewal",
        gross_aud_cents: 9900,
        net_aud_cents: 9000,
        reseller_commission_aud_cents: 3960,
      }),
      evt({
        reseller_id: "r-alpha",
        user_id: "u3",
        kind: "upgrade",
        gross_aud_cents: 19800,
        net_aud_cents: 18000,
        reseller_commission_aud_cents: 7920,
      }),
    ];
    const rows = buildMonthlyReport("2026-06", events, [], RESELLERS);
    expect(rows.length).toBe(2);
    // sorted by reseller_code — ALPHA20 first
    expect(rows[0].reseller_code).toBe("ALPHA20");
    expect(rows[0].blockid_gross_revenue_aud_cents).toBe(19800);
    expect(rows[0].commission_owed_aud_cents).toBe(7920);
    expect(rows[0].commission_pct_effective).toBe(40);
    expect(rows[1].reseller_code).toBe("INFOVISION");
    expect(rows[1].blockid_gross_revenue_aud_cents).toBe(19800);
    expect(rows[1].commission_owed_aud_cents).toBe(3960);
    expect(rows[1].commission_pct_effective).toBe(20);
  });

  it("counts new_signups as distinct users on subscribe/trial_convert", () => {
    const events: RevenueEventRow[] = [
      evt({ user_id: "u1", kind: "subscribe" }),
      evt({ user_id: "u1", kind: "renewal" }), // renewal is not a signup
      evt({ user_id: "u2", kind: "trial_convert" }),
      evt({ user_id: "u3", kind: "subscribe" }),
    ];
    const [row] = buildMonthlyReport("2026-06", events, [], RESELLERS);
    expect(row.new_signups).toBe(3);
  });

  it("active_customers_eom = users whose LATEST event kind is recurring", () => {
    const events: RevenueEventRow[] = [
      // u1: subscribes then refunds — churned
      evt({ user_id: "u1", kind: "subscribe", ts: ts(1) }),
      evt({
        user_id: "u1",
        kind: "refund",
        ts: ts(20),
        gross_aud_cents: -9900,
        net_aud_cents: -9000,
      }),
      // u2: subscribes then renews — active
      evt({ user_id: "u2", kind: "subscribe", ts: ts(2) }),
      evt({ user_id: "u2", kind: "renewal", ts: ts(25) }),
      // u3: trial_convert, no churn — active
      evt({ user_id: "u3", kind: "trial_convert", ts: ts(5) }),
    ];
    const [row] = buildMonthlyReport("2026-06", events, [], RESELLERS);
    expect(row.active_customers_eom).toBe(2);
    expect(row.churned_customers).toBe(1);
  });

  it("commission_pct_effective is 0 when gross is 0", () => {
    const events: RevenueEventRow[] = [
      evt({ kind: "credit_pack", gross_aud_cents: 0, reseller_commission_aud_cents: 0 }),
    ];
    const [row] = buildMonthlyReport("2026-06", events, [], RESELLERS);
    expect(row.commission_pct_effective).toBe(0);
  });

  it("skips events with null reseller_id", () => {
    const events: RevenueEventRow[] = [
      evt({ reseller_id: null as unknown as string, user_id: "u9" }),
    ];
    const rows = buildMonthlyReport("2026-06", events, [], RESELLERS);
    expect(rows.length).toBe(0);
  });

  it("aggregates credit grants filtered by month_key", () => {
    const grants: CreditGrantRow[] = [
      { reseller_id: "r-info", kind: "grant", amount: 500, over_budget: false, month_key: "2026-06" },
      { reseller_id: "r-info", kind: "grant", amount: 1500, over_budget: true, month_key: "2026-06" },
      { reseller_id: "r-info", kind: "grant", amount: 999, over_budget: true, month_key: "2026-05" }, // wrong month
      { reseller_id: "r-info", kind: "sandbox_spend", amount: -10, over_budget: false, month_key: "2026-06" }, // ignored
    ];
    const [row] = buildMonthlyReport("2026-06", [], grants, RESELLERS);
    expect(row.reseller_id).toBe("r-info");
    expect(row.ai_credits_granted).toBe(2000);
    expect(row.ai_credits_over_budget_count).toBe(1);
    expect(row.blockid_gross_revenue_aud_cents).toBe(0);
  });

  it("attributed_mrr sums only recurring kinds", () => {
    const events: RevenueEventRow[] = [
      evt({ kind: "subscribe", gross_aud_cents: 4900 }),
      evt({ user_id: "u2", kind: "renewal", gross_aud_cents: 4900 }),
      evt({
        user_id: "u3",
        kind: "refund",
        gross_aud_cents: -4900,
        net_aud_cents: -4455,
      }),
      evt({ user_id: "u4", kind: "credit_pack", gross_aud_cents: 2000 }),
    ];
    const [row] = buildMonthlyReport("2026-06", events, [], RESELLERS);
    expect(row.attributed_mrr_aud_cents).toBe(9800);
    // gross still nets refunds
    expect(row.blockid_gross_revenue_aud_cents).toBe(6900);
  });

  it("falls back to UNKNOWN when reseller meta missing", () => {
    const events: RevenueEventRow[] = [
      evt({ reseller_id: "r-ghost", user_id: "u1" }),
    ];
    const [row] = buildMonthlyReport("2026-06", events, [], []);
    expect(row.reseller_code).toBe("UNKNOWN");
    expect(row.reseller_display_name).toBe("Unknown reseller");
  });
});

describe("csvEscape + formatMonthlyReportCsv", () => {
  it("csvEscape wraps commas/quotes/newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('a "b"')).toBe('"a ""b"""');
    expect(csvEscape("l\nk")).toBe('"l\nk"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(0)).toBe("0");
  });

  it("emits header + one line per row + trailing newline", () => {
    const rows = buildMonthlyReport(
      "2026-06",
      [
        evt({
          reseller_id: "r-alpha",
          user_id: "u3",
          kind: "subscribe",
          gross_aud_cents: 19800,
          net_aud_cents: 18000,
          reseller_commission_aud_cents: 7920,
        }),
      ],
      [],
      RESELLERS,
    );
    const csv = formatMonthlyReportCsv("2026-06", rows);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("# BlockID reseller monthly KPI report — 2026-06");
    expect(lines[1]).toContain("reseller_id,reseller_display_name,month");
    expect(lines[2]).toContain('"Alpha, ""Bravo"" & Co"');
    expect(lines[2]).toContain("198.00");
    expect(lines[2]).toContain("40.00"); // commission_pct_effective
    expect(csv.endsWith("\n")).toBe(true);
  });
});

describe("formatMonthlyReportEmail", () => {
  it("renders a fallback when no rows", () => {
    const html = formatMonthlyReportEmail("2026-06", []);
    expect(html).toContain("No reseller activity this month");
  });
  it("HTML-escapes reseller display names", () => {
    const rows = buildMonthlyReport(
      "2026-06",
      [
        evt({
          reseller_id: "r-alpha",
          user_id: "u3",
          kind: "subscribe",
          gross_aud_cents: 100,
          net_aud_cents: 90,
        }),
      ],
      [],
      RESELLERS,
    );
    const html = formatMonthlyReportEmail("2026-06", rows);
    expect(html).toContain("Alpha, &quot;Bravo&quot; &amp; Co");
    expect(html).not.toContain('"Bravo"');
  });
});
