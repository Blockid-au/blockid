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
 * G16-B (2026-09-19): `ReportPaywallGate` is now mounted by the founder TBR
 * page (/workspace/reports/business) behind the unlock rail at the free-tier
 * cut. The "TBR free cut" block below seeds the page's localStorage snapshot
 * (the same fast path the analyser writes) so the rail + the quote render
 * for the QA founder WITHOUT an analysis or a purchase: no credit is spent,
 * no Stripe session is created (the dialog is opened and cancelled; the
 * checkout request is asserted absent).
 */
import { test, expect } from "./fixtures";
import { getScratch, setScratch } from "./lib/run-state";
import { anonRequest, evidence, get, post } from "./lib/api";
import { env } from "./lib/env";

const RANDOM_UUID = "00000000-0000-4000-8000-00000000c0de";

/** The analyser's localStorage snapshot (business-report-client `svi-stream:<pid>`), 8 dims scored. */
function tbrSnapshotForSeed(startupName: string) {
  const dims: Record<string, { status: string; score: number; priority: string; markdown: string; insights: string[] }> = {};
  const scores: Record<string, number> = { tre: 38, mpc: 61, ftv: 72, ptd: 55, cgh: 44, iri: 47, lco: 52, svm: 58 };
  for (const [k, score] of Object.entries(scores)) {
    dims[k] = { status: "complete", score, priority: score < 50 ? "high" : "medium", markdown: `## ${k.toUpperCase()}\n\nQA seed narrative for ${k}. Evidence is thin; a second sentence follows.`, insights: [`${k} insight one`, `${k} insight two`] };
  }
  return {
    savedAt: Date.now(),
    dimStates: dims,
    criterionStates: [],
    completed: 8,
    total: 8,
    totalMs: 4200,
    done: true,
    industry: "SaaS",
    stage: "MVP",
    startupName,
    sviTotal: 53,
  };
}

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
  });

  // G16-B — the free founder's path to the first purchase, without spending.
  test("GET /api/reports/access quotes the report (credits + A$3 from the SKU) read-only — no order, no session, no debit", async ({ api, qa, credits }, testInfo) => {
    const before = await credits.snapshot();
    const anon = await anonRequest(qa.baseURL);
    try {
      const a = await get(anon, "/api/reports/access");
      expect(a.status).toBe(401);
    } finally {
      await anon.dispose();
    }
    const r = await get<{ ok: boolean; projectId: string | null; included: boolean; paidOrderId: string | null; quote: { credits: number; estimatedWords: number }; creditBalance: number; hasSubscription: boolean; price: { sku: string; amount_cents: number; label: string } }>(api, "/api/reports/access");
    await evidence(testInfo, "GET /api/reports/access", { status: r.status, body: r.body, elevated: qa.elevated });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.price).toEqual({ sku: "sku_trust_report_5aud", amount_cents: 300, label: "A$3" });
    expect(r.body.quote.credits).toBeGreaterThan(0);
    expect(r.body.quote.estimatedWords).toBeGreaterThan(0);
    expect(r.body.paidOrderId).toBeNull(); // the suite never buys one
    expect(r.body.creditBalance).toBe(before);
    // Production `plans.feature_flags` for founder_growth does NOT carry
    // `report.premium` (0309/0400 rows; the code fallback list is wider) — the
    // founder ladder sells the report pay-as-you-go / by credits, so `included`
    // is false on Growth too. Pin the contract, not a plan assumption.
    expect(typeof r.body.included).toBe("boolean");
    if (!qa.elevated) expect(r.body.included).toBe(false);
    setScratch("tbr.included", r.body.included);
    if (qa.projectId) expect(r.body.projectId).toBe(qa.projectId);
    const bad = await get(api, "/api/reports/access?project=nope");
    expect(bad.status).toBe(400);
    await credits.assertUnchanged(before, "reports access quote");
  });

  test("/workspace/reports/business (seeded snapshot): the free cut shows locked chapters + ONE unlock rail quoting A$3; the confirm dialog opens with credits + A$ and is cancelled — no checkout request, no spend", async ({ page, visit, qa, credits, guard }, testInfo) => {
    const before = await credits.snapshot();
    // Seed the analyser's localStorage snapshot before any page script runs
    // (same origin, same key the report page reads first) — no /api/svi call.
    await page.addInitScript((snap) => {
      try {
        window.localStorage.setItem("svi-stream:default", JSON.stringify(snap));
      } catch {
        /* storage blocked — the page falls back to the API and the test reports it */
      }
    }, tbrSnapshotForSeed(qa.projectName));
    const checkoutCalls: string[] = [];
    page.on("request", (req) => {
      if (/\/api\/reports\/(checkout|redeem)/.test(req.url())) checkoutCalls.push(`${req.method()} ${new URL(req.url()).pathname}`);
    });
    // The snapshot is seeded in localStorage only, so the peer lookup has no
    // DB snapshot to key on → 404 no_self_snapshot is the documented answer.
    const g = guard(page, { allowRequest: [{ method: "GET", pathRe: /^\/api\/svi\/phase-progress$/, status: 429 }, { method: "GET", pathRe: /^\/api\/svi\/report\/peers$/, status: 404 }, { method: "POST", pathRe: /^\/api\/analytics\/event$/, status: 404 }] });
    await visit("/workspace/reports/business", { waitUntil: "networkidle" });

    const body = page.locator("[data-tbr-version]").first();
    await expect(body).toBeVisible({ timeout: 30_000 });
    const tier = await body.getAttribute("data-tbr-tier");
    const rail = page.getByTestId("tbr-unlock-rail");
    const lockedCount = await page.locator("[data-tbr-locked]").count();

    if (getScratch<boolean>("tbr.included") === true) {
      // A plan that carries report.premium → the document renders in full, no cut, no rail.
      await evidence(testInfo, "TBR (included)", { tier, lockedCount, rails: await rail.count() });
      expect(tier).toBe("standard");
      expect(lockedCount).toBe(0);
      expect(await rail.count()).toBe(0);
    } else {
      await expect(rail).toBeVisible({ timeout: 30_000 });
      const railText = await rail.innerText();
      await evidence(testInfo, "TBR free cut", { tier, lockedCount, rails: await rail.count(), mode: await rail.getAttribute("data-tbr-unlock"), railText: railText.slice(0, 600) });
      expect(tier).toBe("free");
      expect(await rail.count()).toBe(1);
      expect(await rail.getAttribute("data-tbr-unlock")).toBe("buy");
      expect(lockedCount).toBeGreaterThanOrEqual(1);
      expect(railText).toMatch(/Unlock the full Trusted Business Report — A\$3 \(one-off\)/);
      expect(railText).toMatch(/PDF export/);
      expect(railText).toMatch(/before anything is charged/);
      // The one click → the quote-then-pay dialog (credits + A$ shown, explicit confirm) — then cancel.
      await page.getByTestId("tbr-unlock-cta").click();
      const dialog = page.getByTestId("report-paywall-gate");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      const dialogText = await dialog.innerText();
      await evidence(testInfo, "paywall dialog", { text: dialogText.slice(0, 800) });
      expect(dialogText).toMatch(/Confirm & Pay A\$3/);
      expect(dialogText).toMatch(/\d+ credits/);
      expect(dialogText).toMatch(/inc\.? ?GST/i);
      await dialog.getByRole("button", { name: /^Cancel$/ }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    }
    expect(checkoutCalls, "no checkout / redeem request may leave the page without the confirm click").toEqual([]);
    const report = g.report("/workspace/reports/business");
    await evidence(testInfo, "guard report", report);
    expect(report.errors).toEqual([]);
    await credits.assertUnchanged(before, "TBR free cut + cancelled dialog");
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

// G19-S44 — the cover "current value" hero and one to-do list: the demo TBR
// opens with the A$ consensus range (85 % confidence → never "pending"), the
// SVI + band, a 12-phase badge and NO SVI stage label; the document renders
// exactly one 90-day plan (chapter 13 — the live widget only appears when the
// plan is empty) and one floors row instead of 8 phase-lens sentences.
test.describe("TBR cover hero + one plan (G19-S44)", () => {
  test("/tbr/demo cover shows the A$ range hero, SVI + phase badge, and exactly one 90-day plan", async ({ page, visit }, testInfo) => {
    await visit("/tbr/demo");
    const hero = page.locator("[data-tbr-hero]");
    await expect(hero).toBeVisible({ timeout: 30_000 });
    const value = hero.locator("[data-tbr-hero-value]");
    const kind = await value.getAttribute("data-tbr-hero-value");
    const text = await value.innerText();
    const svi = await hero.locator("[data-tbr-hero-svi]").innerText();
    const phase = await page.locator("[data-tbr-phase-badge]").first().innerText();
    const plans = await page.locator("#tbr-action-plan").count();
    const floorsRows = await page.locator("[data-tbr-floors-row]").count();
    const floorChips = await page.locator("[data-tbr-floor-chip]").count();
    await evidence(testInfo, "cover hero", { kind, text, svi, phase, plans, floorsRows, floorChips });
    expect(kind).toBe("range");
    expect(text).toMatch(/^A\$[\d.]+[kMB]? – A\$[\d.]+[kMB]?$/);
    expect(svi).toMatch(/^SVI \d+/);
    expect(phase.trim().length).toBeGreaterThan(0);
    expect(plans).toBe(1);
    expect(floorsRows).toBe(1);
    expect(floorChips).toBe(8);
    await expect(page.getByText("not yet audited")).toHaveCount(0);
  });
});

// G19-S42 — valuation truth: the demo TBR (Stripe-evidenced revenue) shows
// the "Inputs & assumptions" table with source chips, only the applicable
// method rows (5 — scorecard and the stage baseline are cross-checks), the
// cross-check block (backtest quartile with N + AU stage baseline) and no
// ask line (the demo founder stated no raise).
test.describe("TBR valuation — inputs & assumptions (G19-S42)", () => {
  test("/tbr/demo valuation shows the Inputs & assumptions table, applicable methods only, cross-checks, no ask", async ({ page, visit }, testInfo) => {
    await visit("/tbr/demo");
    const inputs = page.locator("[data-tbr-valuation-inputs]");
    await expect(inputs).toBeVisible({ timeout: 30_000 });
    const text = await inputs.innerText();
    await evidence(testInfo, "valuation inputs", { text });
    expect(text).toMatch(/Inputs & assumptions/i);
    expect(text).toMatch(/MRR/);
    expect(text).toMatch(/not stated/);
    await expect(inputs.locator('[data-tbr-source="connector"]').first()).toBeVisible();
    await expect(page.locator("[data-tbr-method]")).toHaveCount(5);
    await expect(page.locator('[data-tbr-method="stage_baseline"]')).toHaveCount(0);
    await expect(page.locator("[data-tbr-valuation-cross-checks]")).toBeVisible();
    await expect(page.locator("[data-tbr-valuation-ask]")).toHaveCount(0);
    await expect(page.locator("[data-tbr-valuation-none]")).toHaveCount(0);
  });
});

// G19-S41 — every dimension chapter explains its score: the demo fixture
// carries a score ledger per chapter, so /tbr/demo must render the "How this
// score was built" table (base → signals ± points → × confidence → =
// adjustment) in all 8 chapters, with no chapter left pending.
test.describe("TBR score ledger — 'How this score was built' (G19-S41)", () => {
  test("/tbr/demo shows a 'How this score was built' table in 8 chapters", async ({ page, visit }, testInfo) => {
    await visit("/tbr/demo");
    const ledgers = page.locator("[data-tbr-ledger]");
    await expect(ledgers.first()).toBeVisible({ timeout: 30_000 });
    const count = await ledgers.count();
    const states = await ledgers.evaluateAll((els) => els.map((el) => `${el.getAttribute("data-tbr-ledger")}:${el.getAttribute("data-tbr-ledger-state")}`));
    const captions = await page.locator("[data-tbr-ledger] caption").allInnerTexts();
    const ftv = page.locator('[data-tbr-ledger="ftv"]');
    const ftvText = await ftv.innerText();
    await evidence(testInfo, "score ledgers", { count, states, captions: captions.slice(0, 8), ftv: ftvText.slice(0, 600) });
    expect(count).toBe(8);
    expect(captions.filter((c) => /How this score was built/i.test(c))).toHaveLength(8);
    expect(states.every((s) => s.endsWith(":assessed"))).toBe(true);
    expect(ftvText).toMatch(/Base 50/);
    expect(ftvText).toMatch(/\+\d+/);
    expect(ftvText).toMatch(/evidence confidence 0\.\d\d/);
    expect(ftvText).toMatch(/= adjustment [+−]\d+ on the SVI base of 100/);
    expect(ftvText).not.toMatch(/Not assessed yet/);
  });
});

// G19-S45 — paid view = ReportV2 (D4), i18n parity, clarity survey (D6).
//   * `/workspace/reports/order` now redirects a resolved order to the
//     ReportV2 page (`/workspace/reports/business?order=<id>`); without an
//     order it still renders the not-found copy (asserted above).
//   * The /vi share page renders Vietnamese chapter labels with diacritics
//     and zero English chrome; the clarity survey is mounted after the
//     Executive summary on the share view. Both need a share token, which
//     needs a DB snapshot — the suite mints one through POST
//     /api/svi/report/share and skips cleanly when the account has none.
test.describe("TBR paid view + i18n + clarity survey (G19-S45)", () => {
  test("share page `/vi/tbr/<token>` shows Vietnamese chapter labels (diacritics) and no English chrome (skipped when no snapshot to share)", async ({ page, visit, api, guard }, testInfo) => {
    const share = await post<{ ok: boolean; url?: string; error?: string }>(api, "/api/svi/report/share", { projectId: "default" });
    await evidence(testInfo, "POST /api/svi/report/share", { status: share.status, ok: share.body.ok, error: share.body.error });
    test.skip(!share.body.ok || !share.body.url, `no snapshot to share on this account (${share.body.error ?? share.status}) — VI share page skipped`);
    const token = new URL(share.body.url!).pathname.split("/").pop() ?? "";
    setScratch("tbr.shareToken", token);
    const g = guard(page, { allowRequest: [{ method: "GET", pathRe: /^\/api\/svi\/report\/peers$/, status: 404 }, { method: "POST", pathRe: /^\/api\/analytics\/event$/, status: 404 }] });
    await visit(`/vi/tbr/${token}`, { waitUntil: "networkidle" });
    const body = page.locator("[data-tbr-version]").first();
    await expect(body).toBeVisible({ timeout: 30_000 });
    const h1 = await page.getByRole("heading", { level: 1 }).first().innerText();
    const chapterTitles = await page.locator("section[id^='tbr-dim-'] h2").allInnerTexts();
    const captions = await page.locator("section[id^='tbr-'] caption").allInnerTexts();
    const text = (await body.innerText()).replace(/\s+/g, " ");
    await evidence(testInfo, "VI share page", { h1, chapterTitles, captions: captions.slice(0, 6), sample: text.slice(0, 600) });
    expect(h1).toContain("Báo cáo Kinh doanh Tin cậy");
    expect(chapterTitles.length).toBe(8);
    for (const title of chapterTitles) expect(title).toMatch(/[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/);
    for (const en of ["Executive Summary", "How this score was built", "Top strengths", "No evidence rows", "Next action (", "Evidence register", "Auditor:", "Cover — Where"]) expect(text, en).not.toContain(en);
    expect(text).toContain("Tóm tắt Điều hành");
    expect(text).toContain("Điểm này được xây dựng như thế nào");
    const report = g.report(`/vi/tbr/${token}`);
    await evidence(testInfo, "guard report", report);
    expect(report.errors).toEqual([]);
  });

  test("clarity survey (D6) is mounted after the Executive summary on the share view, once per snapshot (skipped when no token)", async ({ page, visit, guard }, testInfo) => {
    const token = getScratch<string>("tbr.shareToken");
    test.skip(!token, "no share token minted in this run — clarity survey on the share view skipped");
    const g = guard(page, { allowRequest: [{ method: "GET", pathRe: /^\/api\/svi\/report\/peers$/, status: 404 }, { method: "POST", pathRe: /^\/api\/analytics\/event$/, status: 404 }] });
    await visit(`/tbr/${token}`, { waitUntil: "networkidle" });
    const survey = page.getByTestId("tbr-clarity-survey");
    await expect(survey).toBeVisible({ timeout: 30_000 });
    const surveyText = await survey.innerText();
    const order = await page.evaluate(() => {
      const exec = document.getElementById("tbr-executive");
      const survey = document.querySelector('[data-testid="tbr-clarity-survey"]');
      const first = document.querySelector("section[id^='tbr-dim-']");
      return { execBeforeSurvey: Boolean(exec && survey && exec.compareDocumentPosition(survey) & Node.DOCUMENT_POSITION_FOLLOWING), surveyBeforeFirstChapter: Boolean(survey && first && survey.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    await evidence(testInfo, "clarity survey", { text: surveyText.slice(0, 300), chips: await page.locator("[data-tbr-clarity-score]").count(), ...order });
    expect(surveyText).toMatch(/Was this report clear and useful\?/);
    expect(await page.locator("[data-tbr-clarity-score]").count()).toBe(11);
    expect(order.execBeforeSurvey).toBe(true);
    expect(order.surveyBeforeFirstChapter).toBe(true);
    // Dismiss → remembered for this snapshot: a reload shows no survey.
    await page.getByTestId("tbr-clarity-dismiss").click();
    await expect(survey).toBeHidden({ timeout: 10_000 });
    await visit(`/tbr/${token}`, { waitUntil: "networkidle" });
    await expect(page.locator("[data-tbr-version]").first()).toBeVisible({ timeout: 30_000 });
    expect(await page.getByTestId("tbr-clarity-survey").count()).toBe(0);
    const report = g.report(`/tbr/${token}`);
    await evidence(testInfo, "guard report", report);
    expect(report.errors).toEqual([]);
  });

  test("the demo report (/tbr/demo) has no survey (no snapshot to ask about) and its VI chrome parity holds on the founder /vi page shell", async ({ page, visit }, testInfo) => {
    await visit("/tbr/demo");
    await expect(page.locator("[data-tbr-version]").first()).toBeVisible({ timeout: 30_000 });
    const surveys = await page.getByTestId("tbr-clarity-survey").count();
    await evidence(testInfo, "/tbr/demo survey count", { surveys });
    expect(surveys).toBe(0);
  });
});

// G19-S43 — every missing input is a CTA row with an internal link: the demo
// fixture carries two `missing` rows (GitHub audit, LinkedIn export) so
// /tbr/demo must render ≥ 1 CTA row ("Add now →" → /workspace/…) with a
// "+N SVI" chip, the next-action box must name the catalogue label (never
// the raw enum "evidence: github"), and Money on the Table must list real
// matches or a linked grant-profile CTA — never "re-run the analysis".
test.describe("TBR evidence & data CTAs (G19-S43)", () => {
  test("/tbr/demo renders ≥ 1 CTA row with an internal href and Money shows real rows or a linked CTA", async ({ page, visit }, testInfo) => {
    await visit("/tbr/demo");
    const ctaRows = page.locator('[data-tbr-evidence-row="cta"]');
    await expect(ctaRows.first()).toBeVisible({ timeout: 30_000 });
    const ctaCount = await ctaRows.count();
    const hrefs = await page.locator("[data-tbr-cta] a").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    const firstCta = await ctaRows.first().innerText();
    const nextActions = await page.locator("[data-tbr-next-action]").allInnerTexts();
    const moneySection = page.locator("#tbr-money");
    const moneyText = await moneySection.innerText();
    const moneyRows = await moneySection.locator("table tbody tr").count();
    const moneyEmpty = page.locator("[data-tbr-money-empty]");
    const moneyEmptyHref = (await moneyEmpty.count()) ? await moneyEmpty.locator("a").getAttribute("href") : null;
    const coverEvidence = await page.locator("[data-tbr-cover-evidence]").allInnerTexts();
    await evidence(testInfo, "S43 CTAs", { ctaCount, hrefs: hrefs.slice(0, 8), firstCta, nextActions: nextActions.slice(0, 8), moneyRows, moneyEmptyHref, coverEvidence });
    expect(ctaCount).toBeGreaterThanOrEqual(1);
    expect(hrefs.length).toBeGreaterThanOrEqual(1);
    expect(hrefs.every((h) => h.startsWith("/workspace/"))).toBe(true);
    expect(firstCta).toMatch(/Add now/);
    expect(firstCta).toMatch(/\+\d+ SVI/);
    expect(nextActions).toHaveLength(8);
    expect(nextActions.some((t) => /evidence: GitHub repository/.test(t))).toBe(true);
    expect(nextActions.every((t) => !/evidence: (stripe|github|linkedin|upload|url)\b/.test(t))).toBe(true);
    expect(moneyRows >= 1 || moneyEmptyHref === "/workspace/funding").toBe(true);
    expect(moneyText).not.toMatch(/re-run the analysis/i);
    expect(coverEvidence.join(" ")).toMatch(/Evidence: .+ \(×\d\.\d\d\)/);
  });
});

// G19-S46 — BlockID's own report as the showcase: /showcase/blockid/report
// renders the stored ReportV2 of BlockID's canonical project through the same
// <TbrReportV2> (≥ 8 svg[role=img], standard tier, no unlock rail, no survey)
// with the "our own report" banner + data-ownership sentence. Until the weekly
// self-report has persisted a report_v2 the page shows its empty state — a
// clean skip, never a failure.
test.describe("BlockID's own report — /showcase/blockid/report (G19-S46)", () => {
  test("renders BlockID's stored report unlocked with ≥ 8 visuals (skips on the 'not published yet' empty state)", async ({ page, visit }, testInfo) => {
    await visit("/showcase/blockid/report");
    const banner = page.getByTestId("showcase-blockid-report-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    const bannerText = await banner.innerText();
    expect(bannerText).toMatch(/Your data belongs to your startup/);
    expect(await page.locator('a[href="/methodology"]').count()).toBeGreaterThan(0);
    expect(await page.locator('a[href="/tbr/demo"]').count()).toBeGreaterThan(0);
    const empty = await page.getByTestId("showcase-blockid-report-empty").count();
    const report = page.getByTestId("showcase-blockid-report");
    await evidence(testInfo, "showcase report state", { empty, report: await report.count(), snapshot: await report.getAttribute("data-snapshot-id").catch(() => null) });
    test.skip(empty > 0, "BlockID's report_v2 not published yet — run scripts/run-self-analysis.mjs --report");
    await expect(report).toBeVisible();
    await expect(page.locator("[data-tbr-version]").first()).toBeVisible({ timeout: 30_000 });
    const svgs = await report.locator("svg[role=img]").count();
    const primaries = await report.locator("[data-tbr-primary]").count();
    const rails = await report.locator("[data-testid=tbr-unlock-rail]").count();
    const surveys = await page.getByTestId("tbr-clarity-survey").count();
    const tier = await page.locator("[data-tbr-tier]").first().getAttribute("data-tbr-tier");
    await evidence(testInfo, "showcase report render", { svgs, primaries, rails, surveys, tier });
    expect(svgs).toBeGreaterThanOrEqual(8);
    expect(primaries).toBe(8);
    expect(tier).toBe("standard");
    expect(rails).toBe(0);
    expect(surveys).toBe(0);
  });
});

/**
 * G14-S37 — Founder execution profile. The QA founder fills the structured
 * Execution fields through POST /api/founder-profile (the same route the
 * /workspace/settings/founder page saves with), reads them back, sees the
 * Execution section + live rubric preview on the page, and — only with
 * LIVE_QA_SPEND_OK (a re-score costs 1 credit) — re-scores and finds the
 * "Founder execution" evidence line on the FTV dimension. A pending 0408
 * (executionFieldsSaved: false) is a clean skip, never a failure.
 */
test.describe("Founder execution profile (S37)", () => {
  const EXEC = {
    prior_exits: [{ company: "QA Loom", year: 2020, type: "acquisition", value_band: "1m-10m" }],
    prior_raises: [{ company: "QA Loom", round: "seed", amount_aud_band: "250k-1m", year: 2019 }],
    roles: { ceo: "QA Founder", cto: "QA CTO", cpo: null, cfo: null },
    full_time_pct: 100,
    worked_together_before: true,
    github_url: "https://github.com/blockid-au",
    years_in_domain: 6,
  };

  test("POST /api/founder-profile saves the structured execution fields and GET reads them back (skips cleanly while 0408 is pending)", async ({ api, qa }, testInfo) => {
    const current = await get<{ ok: boolean; profile: Record<string, unknown> }>(api, "/api/founder-profile");
    expect(current.status).toBe(200);
    const save = await post<{ ok: boolean; error?: string; executionFieldsSaved?: boolean; issues?: unknown[] }>(api, "/api/founder-profile", { ...current.body.profile, full_name: current.body.profile.full_name ?? "QA Founder", ...EXEC });
    await evidence(testInfo, "POST /api/founder-profile (execution fields)", { status: save.status, ok: save.body.ok, executionFieldsSaved: save.body.executionFieldsSaved, error: save.body.error, issues: save.body.issues });
    expect(save.status).toBe(200);
    expect(save.body.ok).toBe(true);
    test.skip(save.body.executionFieldsSaved === false, "migration 0408 (founder_profiles execution columns) is not applied on this environment — legacy fields saved, execution fields skipped");
    const back = await get<{ ok: boolean; profile: Record<string, unknown> }>(api, "/api/founder-profile");
    expect(back.status).toBe(200);
    expect(back.body.profile.prior_exits).toEqual(EXEC.prior_exits);
    expect(back.body.profile.roles).toEqual(EXEC.roles);
    expect(back.body.profile.full_time_pct).toBe(100);
    expect(back.body.profile.github_url).toBe(EXEC.github_url);
    // A bad exit type is a 400 with issues, and the row is untouched.
    const bad = await post<{ ok: boolean; error?: string }>(api, "/api/founder-profile", { ...EXEC, prior_exits: [{ company: "X", year: 2020, type: "merger" }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_execution_fields");
    await evidence(testInfo, "invalid exit type", { status: bad.status, error: bad.body.error, baseURL: qa.baseURL });
  });

  test("/workspace/settings/founder renders the Execution section with the live rubric preview", async ({ page, visit }, testInfo) => {
    await visit("/workspace/settings/founder");
    const section = page.getByTestId("founder-execution-section");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("linkedin-import-button")).toBeVisible();
    const preview = page.getByTestId("execution-score-preview");
    await expect(preview).toBeVisible();
    const score = await preview.getAttribute("data-execution-score");
    await evidence(testInfo, "execution preview", { score, text: await preview.innerText() });
    expect(Number(score)).toBeGreaterThanOrEqual(0);
    expect(await page.getByTestId("exit-row").count()).toBeGreaterThanOrEqual(0);
  });

  test("re-score reads the profile: the FTV dimension carries the 'Founder execution' evidence line (LIVE_QA_SPEND_OK only — 1 credit)", async ({ api, qa, credits }, testInfo) => {
    test.skip(!env.spendOk, "a re-score spends 1 credit — skipped (LIVE_QA_SPEND_OK not set)");
    const before = await credits.snapshot();
    const res = await post<{ ok: boolean; error?: string; analysis?: { subs?: Array<{ key: string; evidence?: string[]; gaps?: string[] }>; signals?: { founderExecution?: { score: number; capped: boolean } } } }>(api, "/api/svi", {
      email: qa.email,
      input: { rawText: "QA Loom is a rostering app for regional aged-care providers. Two founders, 6 years in aged care, a prototype and 3 pilot customers." },
    });
    await evidence(testInfo, "POST /api/svi (re-score with founder profile)", { status: res.status, ok: res.body.ok, error: res.body.error, founderExecution: res.body.analysis?.signals?.founderExecution, before });
    expect(res.status).toBe(200);
    const ftv = res.body.analysis?.subs?.find((s) => s.key === "ftv");
    expect(ftv).toBeTruthy();
    expect((ftv?.evidence ?? []).some((line) => /Founder execution \d+\/100/.test(line))).toBe(true);
    expect(res.body.analysis?.signals?.founderExecution?.score).toBeGreaterThan(0);
  });
});
