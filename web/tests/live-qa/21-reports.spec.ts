/**
 * 21 — Trust BizReport / one-click report (G12; qa3 §2 "A$3 Trust BizReport",
 * "A$3 One-Click (guest)"): the A$3 price is stated before any checkout, the
 * report checkout is only PREVIEWED (auth + validation shapes — the route has
 * no preview mode and always creates a Stripe session, so it is never called
 * with a valid body unless LIVE_QA_SPEND_OK), the credit path answers 402
 * with the quote, the one-click guest path answers 401 / 402, and the PDF
 * endpoint serves `application/pdf` for the account's own report when one
 * exists (skipped cleanly otherwise).
 *
 * Known: `ReportPaywallGate` (the "Confirm & Pay A$3" dialog) is not mounted
 * by any page in this tree — only referenced from ReportOrderView / the
 * order page comments. The A$3 copy is asserted on the surfaces that do
 * render it (/one-click-report, /pricing evaluator PAYG note) and the gap is
 * annotated as a finding.
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post } from "./lib/api";
import { env } from "./lib/env";

const RANDOM_UUID = "00000000-0000-4000-8000-00000000c0de";

test.describe("Trust BizReport — price before checkout", () => {
  test("/one-click-report states A$3 on the CTA; /pricing evaluator PAYG note prices the report at A$3", async ({ page, visit }, testInfo) => {
    await visit("/one-click-report");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    const cta = page.getByRole("button", { name: /Get my A\$3 report/ }).first(); // the form renders the CTA twice (hero + "Ready to see your report?")
    await expect(cta).toBeVisible();
    await visit("/pricing?segment=evaluator");
    const payg = page.getByTestId("evaluator-payg");
    await expect(payg).toBeVisible({ timeout: 30_000 });
    await expect(payg).toContainText(/A\$3/);
    await evidence(testInfo, "A$3 surfaces", { oneClickCta: await cta.innerText().catch(() => null), payg: await payg.innerText() });
    testInfo.annotations.push({ type: "finding", description: "ReportPaywallGate (Confirm & Pay A$3 / Confirm & Use credits) is not mounted by any page — the in-app Trust BizReport paywall dialog cannot be exercised end-to-end" });
  });

  test("/workspace/reports/order without an order renders the not-found copy, not a crash", async ({ page, visit, guard }, testInfo) => {
    const g = guard(page, { allowRequest: [{ method: "GET", pathRe: /^\/api\/svi\/phase-progress$/, status: 429 }] });
    await visit("/workspace/reports/order", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/could not find that report order/i, { timeout: 30_000 });
    const report = g.report("/workspace/reports/order");
    await evidence(testInfo, "guard report", report);
    expect(report.errors).toEqual([]);
    expect(report.failedRequests).toEqual([]);
  });
});

test.describe("Trust BizReport — checkout and credit contracts (no session created)", () => {
  test("POST /api/reports/checkout: 401 anonymous, 400 businessId-must-be-a-uuid — no Stripe session unless LIVE_QA_SPEND_OK", async ({ api, qa, credits }, testInfo) => {
    const before = await credits.snapshot();
    const anon = await anonRequest(qa.baseURL);
    try {
      const a = await post(anon, "/api/reports/checkout", { businessId: RANDOM_UUID });
      expect(a.status).toBe(401);
      expect(a.body.ok).toBe(false);
      const bad = await post(api, "/api/reports/checkout", { businessId: "not-a-uuid" });
      await evidence(testInfo, "POST /api/reports/checkout", { anon: a.body, invalid: bad.body });
      expect(bad.status).toBe(400);
      expect(bad.body.reason).toMatch(/businessId must be a uuid/);
      expect(bad.body).not.toHaveProperty("url");
      if (!env.spendOk) {
        testInfo.annotations.push({ type: "not-exercised", description: "Stripe Checkout session not created (LIVE_QA_SPEND_OK unset) — /api/reports/checkout has no preview mode" });
      } else {
        const s = await post<{ ok: boolean; url?: string; orderId?: string }>(api, "/api/reports/checkout", { businessId: RANDOM_UUID });
        await evidence(testInfo, "POST /api/reports/checkout (SPEND_OK)", { status: s.status, host: s.body.url ? new URL(s.body.url).host : null, orderId: s.body.orderId });
        expect(s.status).toBe(200);
        expect(s.body.url ?? "").toMatch(/^https:\/\/checkout\.stripe\.com\//);
      }
    } finally {
      await anon.dispose();
    }
    await credits.assertUnchanged(before, "reports checkout preview");
  });

  test("POST /api/reports/redeem (credit path) answers 402 insufficient_credits with the quote and balance — nothing debited", async ({ api, credits }, testInfo) => {
    const before = await credits.snapshot();
    const r = await post<{ ok: boolean; reason?: string; quote?: { credits: number }; balance?: number }>(api, "/api/reports/redeem", { businessId: RANDOM_UUID });
    await evidence(testInfo, "POST /api/reports/redeem", r.body);
    // A full report quotes ≥ 40 credits (BASE_UNITS_PER_SECTION) — the QA
    // balance can never afford it, so this is always the 402 branch.
    expect(r.status).toBe(402);
    expect(r.body.reason).toBe("insufficient_credits");
    expect(r.body.quote?.credits ?? 0).toBeGreaterThan(before);
    expect(r.body.balance).toBe(before);
    await credits.assertUnchanged(before, "reports redeem 402");
  });

  test("one-click investor pack: 401 for a guest, 402 { balance, cost, upgradeUrl } for the founder (5 credits > welcome balance)", async ({ api, qa, credits }, testInfo) => {
    const before = await credits.snapshot();
    const anon = await anonRequest(qa.baseURL);
    try {
      const a = await post(anon, "/api/investor-pack/one-click", {});
      expect(a.status).toBe(401);
      expect(a.body.error).toMatch(/Authentication required/);
      const guest = await post(anon, "/api/guest-analysis/create-order", { email: "nope", inputType: "website_url", inputValue: "https://example.com" });
      await evidence(testInfo, "guest paths", { oneClickAnon: a.body, guestOrderInvalidEmail: { status: guest.status, body: guest.body } });
      expect(guest.status).toBe(400);
      expect(guest.body).not.toHaveProperty("checkoutUrl");
    } finally {
      await anon.dispose();
    }
    if (before >= 5) {
      testInfo.annotations.push({ type: "not-exercised", description: `balance ${before} ≥ 5 — the founder one-click call would render and charge a pack; skipped` });
    } else {
      const f = await post<{ ok: boolean; error?: string; balance?: number; cost?: number; upgradeUrl?: string }>(api, "/api/investor-pack/one-click", {});
      await evidence(testInfo, "POST /api/investor-pack/one-click (founder)", f.body);
      expect(f.status).toBe(402);
      expect(f.body.cost).toBe(5);
      expect(f.body.balance).toBe(before);
      expect(f.body.upgradeUrl).toBe("/pricing?feature=investor_pack");
    }
    await credits.assertUnchanged(before, "one-click 401/402");
  });
});

test.describe("Report PDFs", () => {
  test("GET /api/reports/[orderId]: 404 for a foreign id; application/pdf for the account's own ready report (skipped when none)", async ({ api }, testInfo) => {
    const foreign = await get(api, `/api/reports/${RANDOM_UUID}?format=pdf`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.reason).toMatch(/not found/i);
    const history = await get<{ ok: boolean; investorPacks: unknown[]; assembledReports: Array<{ order_id: string; tier: string }> }>(api, "/api/reports/history");
    await evidence(testInfo, "history", { status: history.status, packs: history.body.investorPacks?.length, reports: history.body.assembledReports?.length });
    expect(history.status).toBe(200);
    expect(Array.isArray(history.body.assembledReports)).toBe(true);
    const own = history.body.assembledReports?.[0];
    if (!own) {
      test.skip(true, "the QA account has no Trust BizReport order (the suite never buys one) — PDF endpoint skipped");
    }
    const pdf = await api.get(`/api/reports/${own!.order_id}?format=pdf`);
    await evidence(testInfo, "own report pdf", { status: pdf.status(), type: pdf.headers()["content-type"] });
    expect([200, 202]).toContain(pdf.status());
    if (pdf.status() === 200) expect(pdf.headers()["content-type"]).toMatch(/application\/pdf/);
  });

  test("GET /api/reports/history is 401 without a session", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const r = await get(anon, "/api/reports/history");
      await evidence(testInfo, "anon history", r.body);
      expect(r.status).toBe(401);
    } finally {
      await anon.dispose();
    }
  });
});

// G14-S36 — the ReportV2 cover carries `cover.verification`; the public demo
// TBR is the L2 fixture, so its cover must show the "Verified ABN" badge
// (the same component the dossier header and the index card render).
test.describe("TBR cover — business verification badge (S36)", () => {
  test("/tbr/demo cover shows the 'Verified ABN' badge (L2 fixture)", async ({ page, visit }, testInfo) => {
    await visit("/tbr/demo");
    const badge = page.getByTestId("abn-badge").first();
    await expect(badge).toBeVisible({ timeout: 30_000 });
    const text = await badge.innerText();
    await evidence(testInfo, "cover badge", { text, level: await badge.getAttribute("data-level") });
    expect(text).toMatch(/Verified ABN/);
    expect(text).not.toMatch(/ABN not verified/);
    await expect(badge).toHaveAttribute("data-level", "2");
  });
});
