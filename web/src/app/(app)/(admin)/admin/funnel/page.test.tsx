// G16-A — /admin/funnel render test with a fixture jsonl + latest file:
// the view shows yesterday / 7 d / 28 d, per-step conversions, the top gate
// features, the last sign-ups (id prefix, persona — never an e-mail), the
// live "today so far" block, and the missing-report banner. The page itself
// keeps the sibling admin gate (anon → login, non-admin → /admin).

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ ADMIN_EMAIL: "admin@blockid.au", getCurrentUser: () => getCurrentUserMock() }));
const redirectMock = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirectMock(to) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { buildReport } from "../../../../../../scripts/funnel-report.mjs";
import { readFunnelDaily, readFunnelLatest, liveTodayFunnel } from "@/lib/funnel/read";
import { emptyDbCounts, reduceInstitutional } from "@/lib/funnel/institutional";
import { reduceDaily, type FunnelEventRow } from "@/lib/funnel/core";
import { FunnelAdminView, type FunnelViewData } from "./funnel-view";
import FunnelAdminPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const NOW = Date.UTC(2026, 8, 19, 4, 0, 0);
const ROWS: FunnelEventRow[] = [
  { event_id: "1", event_name: "sign_up", user_id: "11111111-aaaa", params: { method: "google", segment: "founder", persona: "founder" }, ts: "2026-09-18T09:00:00.000Z" },
  { event_id: "2", event_name: "svi_analyze", user_id: "11111111-aaaa", params: { first: true, project_id: "p1" }, ts: "2026-09-18T09:05:00.000Z" },
  { event_id: "3", event_name: "report_view", user_id: "11111111-aaaa", params: { tier: "free", project_id: "p1" }, ts: "2026-09-18T09:06:00.000Z" },
  { event_id: "4", event_name: "paywall_view", user_id: "11111111-aaaa", params: { surface: "tbr_unlock_rail", sku: "trust_report_5aud", amount_cents: 300 }, ts: "2026-09-18T09:07:00.000Z" },
  { event_id: "5", event_name: "sign_up", user_id: "22222222-bbbb", params: { method: "card", segment: "investor", persona: "accelerator" }, ts: "2026-09-17T09:00:00.000Z" },
  { event_id: "6", event_name: "feature_gate_hit", user_id: "22222222-bbbb", params: { feature: "investor.dealflow" }, ts: "2026-09-17T09:08:00.000Z" },
  { event_id: "7", event_name: "feature_gate_hit", user_id: "11111111-aaaa", params: { feature: "cap_table.write" }, ts: "2026-09-18T09:08:00.000Z" },
  { event_id: "8", event_name: "feature_gate_hit", user_id: "11111111-aaaa", params: { feature: "cap_table.write" }, ts: "2026-09-18T09:09:00.000Z" },
  { event_id: "9", event_name: "sign_up", user_id: "qa-user", params: { method: "email", segment: "founder", qa: true }, ts: "2026-09-18T09:00:00.000Z" },
];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "admin-funnel-"));
  mkdirSync(join(root, "content", "reports"), { recursive: true });
  const { daily, latest } = buildReport(ROWS, { days: 14, now: NOW, generatedAt: new Date(NOW).toISOString() });
  writeFileSync(join(root, "content", "reports", "funnel-daily.jsonl"), daily.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(root, "content", "reports", "funnel-latest.json"), JSON.stringify(latest));
  return root;
}

async function dataFromFixture(): Promise<FunnelViewData> {
  const root = fixtureRoot();
  const { latest, status, error } = await readFunnelLatest(root);
  const daily = await readFunnelDaily(root);
  const today = { counts: reduceDaily(ROWS, { days: 1, now: NOW, includeToday: true })[0], date: "2026-09-19", warning: null };
  return { latest, status: status === "missing" ? "missing" : "ok", fileError: error, daily, today };
}

describe("FunnelAdminView", () => {
  it("renders yesterday / 7 d / 28 d, conversions, top gates, last sign-ups (no e-mails) and the daily table from the fixture files", async () => {
    const data = await dataFromFixture();
    expect(data.latest).not.toBeNull();
    const out = await html(<FunnelAdminView data={data} />);
    expect(out).toContain("<h1");
    expect(out).toContain('data-testid="funnel-status"');
    expect(out).toContain("report: ok");
    expect(out).toContain('data-testid="funnel-yesterday-signups">1 sign-ups<');
    expect(out).toContain('data-testid="funnel-d7-signups">2 sign-ups<');
    expect(out).toContain('data-testid="funnel-d28-signups">2 sign-ups<');
    expect(out).toContain("no first dollar yet");
    // per-step table: yesterday column has 1 sign-up, 1 analysis, 1 report view, 1 paywall view, 0 checkouts
    expect(out).toContain('data-step="paywall_views"');
    expect(out).toContain('data-conv="signup_to_analysis"');
    expect(out).toContain("100%"); // 1 analysis / 1 sign-up yesterday
    // gates: 28 d totals sorted desc
    const gates = out.slice(out.indexOf('data-testid="funnel-gates"'));
    expect(gates.indexOf("cap_table.write")).toBeLessThan(gates.indexOf("investor.dealflow"));
    // sign-ups: id prefix + persona, QA row absent, never an e-mail
    expect(out).toContain("<code>11111111<!-- -->…</code>");
    expect(out).toContain("<code>22222222<!-- -->…</code>");
    expect(out).toContain("accelerator");
    expect(out).toContain("<code>paywall_view</code>"); // furthest step of 11111111
    expect(out).not.toContain("qa-user");
    expect(out).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    // today block from the live reducer
    expect(out).toContain('data-testid="funnel-today-signups">0 sign-ups<');
    // daily table: 14 rows written, view shows them with the 2026-09-18 row
    expect(out).toContain('data-date="2026-09-18"');
    expect(out).toContain('data-date="2026-09-05"');
    expect(out).not.toContain('data-testid="funnel-missing"');
  });

  it("shows the missing banner + live block when there is no report file, and n/a when the live query failed", async () => {
    const out = await html(
      <FunnelAdminView data={{ latest: null, status: "missing", fileError: null, daily: [], today: { counts: null, date: "2026-09-19", warning: "supabase not configured" } }} />,
    );
    expect(out).toContain('data-testid="funnel-missing"');
    expect(out).toContain("node scripts/funnel-report.mjs");
    expect(out).toContain("report: missing");
    expect(out).toContain('data-testid="funnel-today-signups">n/a<');
    expect(out).toContain("supabase not configured");
    expect(out).toContain("No daily rows yet.");
    expect(out).not.toContain('data-testid="funnel-gates"');
  });

  it("names the schema-drift error when the file exists but does not parse", async () => {
    const out = await html(
      <FunnelAdminView data={{ latest: null, status: "stale", fileError: "funnel-latest.json does not match the current schema — re-run scripts/funnel-report.mjs", daily: [], today: { counts: null, date: "2026-09-19", warning: null } }} />,
    );
    expect(out).toContain("does not match the current schema");
    expect(out).toContain("report: stale");
  });
});

describe("FunnelAdminView — institutional section (G21 P0-D)", () => {
  it("renders the North Star, the six FI sections, live values, '— P1/P2' for metrics without a data path, and the warnings", async () => {
    const data = await dataFromFixture();
    const sections = reduceInstitutional(
      [{ event_id: "p", event_name: "pilot_started", user_id: "org", params: { amount_cents: 150000, pilot_source: "paid" }, ts: "2026-09-18T09:00:00.000Z" }],
      { ...emptyDbCounts(), companies: 200, mrr_cents: 69800, paying_orgs: 2 },
    );
    const out = await html(
      <FunnelAdminView
        data={{
          ...data,
          institutional: {
            window: { days: 28, from: "2026-08-22", to: "2026-09-19" },
            sections,
            northStar: { month: "2026-09", assessed: 7, assessed_all: 12, paying_batches: 2, paying_orgs: 1, partial: null },
            warnings: ["svi_snapshots:longitudinal: boom"],
          },
        }}
      />,
    );
    expect(out).toContain('data-testid="funnel-institutional"');
    expect(out).toContain('data-testid="funnel-north-star-value">7<');
    expect(out).toContain("startups assessed through paying institutional workflows this month");
    for (const k of ["acquisition", "activation", "engagement", "revenue", "trust", "data_moat"]) expect(out).toContain(`data-fi-section="${k}"`);
    expect(out).toContain('data-fi-metric="paid_pilots" data-fi-status="live"');
    expect(out).toContain("A$1,500");
    expect(out).toContain("A$698");
    expect(out).toContain("A$8,376");
    expect(out).toContain("— P1");
    // G21 P3-A: the outcome ledger is live — no "— P3" placeholder remains on the Data moat section.
    expect(out).not.toContain("— P3");
    expect(out).toContain('data-fi-metric="known_outcomes" data-fi-status="live"');
    expect(out).toContain('data-fi-metric="proposals_pending" data-fi-status="live"');
    expect(out).toContain("svi_snapshots:longitudinal: boom");
    // unavailable table counts are n/a, not 0
    expect(out).toMatch(/data-fi-metric="snapshots" data-fi-status="live"[\s\S]*?n\/a</);
  });
});

describe("/admin/funnel page gate", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    redirectMock.mockClear();
  });

  it("anonymous → login with next; non-admin → /admin", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(FunnelAdminPage()).rejects.toThrow("NEXT_REDIRECT:/auth/login?next=/admin/funnel");
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "jane@example.com", role: "user" });
    await expect(FunnelAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin");
  });

  it("admin renders the view (live block n/a without Supabase, never throws)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "admin", email: "admin@blockid.au", role: "admin" });
    const el = await FunnelAdminPage();
    const out = await html(el);
    expect(out).toContain("<h1");
    expect(out).toContain("Funnel");
    expect(out).toContain("supabase not configured");
    expect((await liveTodayFunnel(null)).counts).toBeNull();
  });
});
