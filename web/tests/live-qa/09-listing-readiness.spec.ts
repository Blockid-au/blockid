/**
 * 09 — Listing readiness (lane 1 #39–#44): ASX / Nasdaq tabs, facts form
 * saves and recomputes, every row carries basis + source + as-at,
 * confirm-current-rule rows assert no threshold, PDF export is priced first
 * (included on Growth → direct download; paid → preview only, never confirmed).
 * Growth-only (page gate minTier growth).
 */
import { test, expect } from "./fixtures";
import { evidence, get, patch, post } from "./lib/api";
import { env } from "./lib/env";



interface Readiness {
  ok: boolean;
  exchange: string;
  rows: Array<{ id: string; label: string; status: string; rule: string; sourceRef: string; asAt: string; basis: string; nextStep: string }>;
  score: { met: number; notMet: number; notConfirmed: number; confirmCurrentRule: number; total: number; pct: number | null };
  inputs: unknown;
  pdf: { listedCost: number; cost: number; included: boolean; includedVia: string | null; alreadyCharged: boolean };
}

const FACTS = {
  directors_total: 3,
  independent_directors: 2,
  audit_committee_independent_members: 2,
  market_makers: 3,
  nta_after_raise_aud: 6_000_000,
  working_capital_aud: 2_000_000,
  stockholders_equity_aud: 7_000_000,
  expected_market_cap_aud: 40_000_000,
  proposed_issue_price_aud: 1.5,
  aud_usd_rate: 0.66,
  audited_accounts_fys: ["FY2025", "FY2026"],
};

test.describe("Listing readiness", () => {
  test("ASX and Nasdaq tabs both render 11 rows with a score tile", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const asx = await get<Readiness>(api, "/api/listing/readiness?exchange=asx");
    const nasdaq = await get<Readiness>(api, "/api/listing/readiness?exchange=nasdaq");
    await evidence(testInfo, "API", { asx: { status: asx.status, score: asx.body.score, rows: asx.body.rows?.length }, nasdaq: { status: nasdaq.status, score: nasdaq.body.score, rows: nasdaq.body.rows?.length } });
    expect(asx.status).toBe(200);
    expect(nasdaq.status).toBe(200);
    expect(asx.body.rows.length).toBeGreaterThanOrEqual(10);
    expect(nasdaq.body.rows.length).toBeGreaterThanOrEqual(10);

    await visit("/workspace/exit/listing");
    await expect(page).toHaveURL(/\/workspace\/listing-readiness/);
    await expect(page.getByTestId("listing-readiness")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("listing-score")).toContainText(/Readiness/i);
    await expect(page.getByTestId("listing-row")).toHaveCount(asx.body.rows.length);
    await page.getByTestId("listing-tab-nasdaq").click();
    await expect(page.getByTestId("listing-row")).toHaveCount(nasdaq.body.rows.length, { timeout: 30_000 });
    await page.getByTestId("listing-tab-asx").click();
    await expect(page.getByTestId("listing-row")).toHaveCount(asx.body.rows.length, { timeout: 30_000 });
  });

  test("facts form saves (PATCH 200), rows recompute and the values persist", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const before = await get<Readiness>(api, "/api/listing/readiness?exchange=nasdaq");
    const saved = await patch<{ ok: boolean; facts: Record<string, unknown> }>(api, "/api/listing/profile", FACTS);
    await evidence(testInfo, "PATCH facts", { status: saved.status, facts: saved.body.facts });
    expect(saved.status).toBe(200);
    const after = await get<Readiness>(api, "/api/listing/readiness?exchange=nasdaq");
    await evidence(testInfo, "nasdaq before/after", { before: before.body.score, after: after.body.score });
    expect(after.body.score.met).toBeGreaterThan(before.body.score.met);

    const profile = await get<{ ok: boolean; facts: Record<string, unknown> }>(api, "/api/listing/profile");
    expect(profile.body.facts.market_makers).toBe(3);
    expect(profile.body.facts.directors_total).toBe(3);

    await visit("/workspace/exit/listing");
    await page.getByTestId("listing-toggle-facts").click();
    await expect(page.getByTestId("listing-facts-form")).toBeVisible();
    await expect(page.getByTestId("fact-market_makers")).toHaveValue("3");
    await page.getByTestId("fact-independent_directors").fill("3");
    await page.getByTestId("listing-save-facts").click();
    await expect(page.getByTestId("listing-notice")).toContainText(/Facts saved/, { timeout: 30_000 });
    const profile2 = await get<{ facts: Record<string, unknown> }>(api, "/api/listing/profile");
    expect(profile2.body.facts.independent_directors).toBe(3);
  });

  test("every row carries a rule reference, an as-at date, a basis and a next step", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const asx = await get<Readiness>(api, "/api/listing/readiness?exchange=asx");
    const missing = asx.body.rows.filter((r) => !r.rule || !r.sourceRef || !r.asAt || !r.basis);
    await evidence(testInfo, "rows", asx.body.rows.map((r) => ({ id: r.id, status: r.status, rule: r.rule, asAt: r.asAt, basis: r.basis.slice(0, 120) })));
    expect(missing.map((r) => r.id)).toEqual([]);
    await visit("/workspace/exit/listing");
    const first = page.getByTestId("listing-row").first();
    await expect(first).toContainText(/Basis:/);
    await expect(first).toContainText(/checked \d{4}-\d{2}-\d{2}/);
    await expect(page.getByTestId("listing-inputs")).toContainText(/cap-table holders/);
  });

  test("confirm-current-rule rows assert no numeric threshold as fact", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const asx = await get<Readiness>(api, "/api/listing/readiness?exchange=asx");
    const rows = asx.body.rows.filter((r) => r.status === "confirm_current_rule");
    await evidence(testInfo, "confirm rows", rows.map((r) => ({ id: r.id, basis: r.basis })));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.basis, `${r.id} basis must not assert an A$ / % / count threshold`).not.toMatch(/A\$\s?\d|\d+\s?%|\d+ (holders|shareholders|market makers)/);
    }
    await visit("/workspace/exit/listing");
    const ui = page.locator('[data-testid="listing-row"][data-status="confirm_current_rule"]');
    await expect(ui.first()).toBeVisible({ timeout: 30_000 });
    await expect(ui.first()).toContainText(/Confirm current rule/i);
  });

  test("PDF export is priced first: included on Growth → application/pdf with no charge", async ({ page, visit, growth, api, credits }, testInfo) => {
    void growth;
    const before = await credits.snapshot();
    const preview = await post<{ ok: boolean; preview: boolean; cost: number; listedCost: number; included: boolean; includedVia: string | null; balance: number | null; creditNote: string }>(api, "/api/listing/readiness/pdf", { exchange: "asx" });
    await evidence(testInfo, "POST preview", preview.body);
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toBe(true);
    expect(preview.body.listedCost).toBe(1);
    expect(preview.body.included).toBe(true);
    expect(preview.body.cost).toBe(0);
    expect(preview.body.creditNote).not.toMatch(/Charged to your credits/);
    await credits.assertUnchanged(before, "listing PDF preview");

    await visit("/workspace/exit/listing");
    const exportBtn = page.getByTestId("listing-export");
    await expect(exportBtn).toContainText(/Export PDF · included \(Growth\+\)/);

    if (preview.body.included || env.spendOk) {
      const res = await api.get("/api/listing/readiness/pdf?exchange=asx", { headers: { accept: "application/pdf" } });
      const buf = await res.body();
      await evidence(testInfo, "GET pdf", { status: res.status(), contentType: res.headers()["content-type"], bytes: buf.length, charged: res.headers()["x-blockid-credits-charged"] });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toMatch(/application\/pdf/);
      expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      await credits.assertUnchanged(before, "included listing PDF download");
    }
    const bad = await get(api, "/api/listing/readiness?exchange=lse");
    expect(bad.status).toBe(400);
  });
});
