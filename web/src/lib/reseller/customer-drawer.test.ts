import { describe, it, expect } from "vitest";
import {
  buildOverviewSummary,
  buildProgressionTimeline,
  buildReportsList,
  buildSviCurve,
  type AppUserBasics,
  type CreditTxRow,
  type RevenueEventRow,
  type SviAnalysisRow,
} from "./customer-drawer";

const USER: AppUserBasics = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "founder@acme.com",
  display_name: "Acme",
  created_at: "2026-01-05T00:00:00Z",
  last_login_at: "2026-07-10T12:00:00Z",
  onboarding_completed: true,
  onboarding_completed_at: "2026-01-06T09:00:00Z",
};

describe("buildProgressionTimeline", () => {
  it("emits signup + onboarding + SVI first/update + report + plan_change + credit_grant, sorted ascending", () => {
    const svi: SviAnalysisRow[] = [
      { id: "s1", total_svi: 42, created_at: "2026-02-01T10:00:00Z", file_name: null, input_type: "idea" },
      { id: "s2", total_svi: 58, created_at: "2026-03-01T10:00:00Z", file_name: "svi-report-2026-03.pdf", input_type: "idea" },
      { id: "s3", total_svi: 55, created_at: "2026-04-01T10:00:00Z", file_name: null, input_type: "idea" },
    ];
    const revenue: RevenueEventRow[] = [
      { ts: "2026-01-10T00:00:00Z", kind: "subscribe", plan_id: "starter", net_aud_cents: 4900 },
      { ts: "2026-06-10T00:00:00Z", kind: "upgrade", plan_id: "growth", net_aud_cents: 9900 },
      { ts: "2026-06-11T00:00:00Z", kind: "refund", plan_id: null, net_aud_cents: -9900 }, // ignored
    ];
    const credits: CreditTxRow[] = [
      { amount: 100, reason: "plan_grant", created_at: "2026-01-10T00:05:00Z" },
      { amount: -20, reason: "svi_analysis", created_at: "2026-02-01T10:00:00Z" }, // ignored (not a grant)
      { amount: 500, reason: "reseller_grant", created_at: "2026-05-01T00:00:00Z" },
    ];

    const timeline = buildProgressionTimeline({ user: USER, svi, revenue, credits });

    const kinds = timeline.map((t) => t.kind);
    expect(kinds).toEqual([
      "signup",
      "onboarding_completed",
      "plan_change", // subscribe 2026-01-10
      "credit_grant", // plan_grant 2026-01-10T00:05
      "first_svi_run", // 2026-02-01
      "svi_score_update", // 2026-03-01
      "report_generated", // 2026-03-01 (file_name present)
      "svi_score_update", // 2026-04-01
      "credit_grant", // reseller_grant 2026-05-01
      "plan_change", // upgrade 2026-06-10
    ]);

    const scored = timeline.filter((e) => e.kind === "svi_score_update");
    expect(scored[0].detail).toBe("+16 → 58");
    expect(scored[1].detail).toBe("-3 → 55");

    const rev = timeline.filter((e) => e.kind === "plan_change");
    expect(rev[0].detail).toBe("starter");
    expect(rev[0].label).toBe("Subscribed");
    expect(rev[1].label).toBe("Upgraded plan");
  });

  it("omits onboarding when not completed", () => {
    const timeline = buildProgressionTimeline({
      user: { ...USER, onboarding_completed: false, onboarding_completed_at: null },
      svi: [],
      revenue: [],
      credits: [],
    });
    expect(timeline.map((t) => t.kind)).toEqual(["signup"]);
  });

  it("handles empty SVI/revenue/credits gracefully", () => {
    const timeline = buildProgressionTimeline({ user: USER, svi: [], revenue: [], credits: [] });
    expect(timeline.map((t) => t.kind)).toEqual(["signup", "onboarding_completed"]);
  });

  it("first_svi_run label carries score when total_svi is present", () => {
    const svi: SviAnalysisRow[] = [
      { id: "s1", total_svi: 33, created_at: "2026-02-01T10:00:00Z", file_name: null, input_type: "idea" },
    ];
    const t = buildProgressionTimeline({ user: USER, svi, revenue: [], credits: [] });
    const first = t.find((e) => e.kind === "first_svi_run");
    expect(first?.detail).toBe("score 33");
  });
});

describe("buildSviCurve", () => {
  it("averages scores per YYYY-MM bucket and sorts ascending", () => {
    const svi: SviAnalysisRow[] = [
      { id: "a", total_svi: 40, created_at: "2026-02-05T00:00:00Z", file_name: null, input_type: null },
      { id: "b", total_svi: 60, created_at: "2026-02-20T00:00:00Z", file_name: null, input_type: null },
      { id: "c", total_svi: 55, created_at: "2026-03-01T00:00:00Z", file_name: null, input_type: null },
    ];
    expect(buildSviCurve(svi)).toEqual([
      { month: "2026-02", score: 50 },
      { month: "2026-03", score: 55 },
    ]);
  });

  it("ignores rows without total_svi", () => {
    const svi: SviAnalysisRow[] = [
      { id: "a", total_svi: null, created_at: "2026-02-05T00:00:00Z", file_name: null, input_type: null },
    ];
    expect(buildSviCurve(svi)).toEqual([]);
  });
});

describe("buildReportsList", () => {
  it("lists artifacts newest-first with mapped type labels", () => {
    const svi: SviAnalysisRow[] = [
      { id: "aaaaaaaa-old", total_svi: 40, created_at: "2026-02-01T00:00:00Z", file_name: null, input_type: "idea" },
      { id: "bbbbbbbb-mid", total_svi: 50, created_at: "2026-03-01T00:00:00Z", file_name: "market.pdf", input_type: "research" },
      { id: "cccccccc-new", total_svi: 60, created_at: "2026-04-01T00:00:00Z", file_name: null, input_type: "financial" },
    ];
    const list = buildReportsList(svi);
    expect(list.map((r) => r.id)).toEqual(["cccccccc-new", "bbbbbbbb-mid", "aaaaaaaa-old"]);
    expect(list.map((r) => r.type)).toEqual(["financial_projection", "market_research", "svi_report"]);
    expect(list[1].title).toBe("market.pdf");
    expect(list[0].title).toBe("SVI analysis cccccccc");
  });

  it("excludes rows with neither file_name nor score", () => {
    const svi: SviAnalysisRow[] = [
      { id: "empty", total_svi: null, created_at: "2026-02-01T00:00:00Z", file_name: null, input_type: null },
    ];
    expect(buildReportsList(svi)).toEqual([]);
  });
});

describe("buildOverviewSummary", () => {
  it("sums 31-day MRR from subscribe + renewal, ignoring refunds and older events", () => {
    const now = new Date("2026-07-20T00:00:00Z");
    const revenue: RevenueEventRow[] = [
      { ts: "2026-01-10T00:00:00Z", kind: "subscribe", plan_id: "starter", net_aud_cents: 4900 },
      { ts: "2026-07-01T00:00:00Z", kind: "renewal", plan_id: "growth", net_aud_cents: 9900 },
      { ts: "2026-07-15T00:00:00Z", kind: "renewal", plan_id: "growth", net_aud_cents: 9900 },
      { ts: "2026-07-16T00:00:00Z", kind: "refund", plan_id: null, net_aud_cents: -9900 },
    ];
    const overview = buildOverviewSummary({
      user: USER,
      masked_email: "fo***@acme.com",
      credits_balance: 250,
      revenue,
      now,
    });
    expect(overview.mrr_aud_cents).toBe(19800);
    expect(overview.plan_label).toBe("growth"); // latest plan_id wins
    expect(overview.credits_balance).toBe(250);
    expect(overview.masked_email).toBe("fo***@acme.com");
    expect(overview.onboarding_completed).toBe(true);
  });

  it("returns zero MRR and null plan when no revenue events", () => {
    const now = new Date("2026-07-20T00:00:00Z");
    const overview = buildOverviewSummary({
      user: USER,
      masked_email: "fo***@acme.com",
      credits_balance: 0,
      revenue: [],
      now,
    });
    expect(overview.mrr_aud_cents).toBe(0);
    expect(overview.plan_label).toBeNull();
  });
});
