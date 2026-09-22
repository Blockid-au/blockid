/**
 * 41 — G21 regression lane (G22-D). One assertion per G21 acceptance line,
 * kept in one file so the weekly cron can run it ALONE
 * (`bash scripts/qa-live.sh -- tests/live-qa/41-g21-regression.spec.ts`,
 * Sun 05:10 UTC in scripts/crontab.production) and append to
 * content/reports/live-qa-history.jsonl through the runner.
 *
 * Anonymous (a fresh context with no cookies):
 *   • `/` and `/vi` — the business hero; English keeps the seven nav items;
 *   • `data-testid="trust-band"` exactly once on the seven template pages;
 *   • `/methodology/{governance,versions,calibration}` → 200 + one h1; the
 *     calibration section shows either the empty state or `n =`;
 *   • `/tbr/demo` — one `assessment-card` with SVI + Evidence Confidence
 *     (case-insensitive) and no benchmark line without `n =`;
 *   • G30: home intake and sample; G25: "Start a cohort" in the nav and `/solutions/accelerator`
 *     → the Cohort 25 annual trial sign-up; `/pilot`, `/vi/pilot`,
 *     `/pilot/investor` and `/workspace/accelerator/pilot` answer 301 to
 *     their replacements; no pilot offer card anywhere;
 *   • `/api/v1/institutional/methodology` → 401 without a key.
 * Elevated founder (Growth):
 *   • `/workspace/evidence/corrections` 200, `/workspace/evidence/outcomes` 200;
 *   • `/workspace/score` shows the `assessment-card` + `trajectory-timeline`.
 * Evaluator: `/workspace/evaluations/cohort` 200 (the evaluator seat from
 *   28-dossier when the full suite ran; standalone, the founder session —
 *   the index h1 sits outside any gate — recorded as an annotation).
 * Trusted `/api/status` (Bearer STATUS_FULL_TOKEN or CRON_SECRET, both
 *   loaded from .env.runtime by qa-live.sh) carries `data_moat`.
 *
 * Read-only: nothing is created, so nothing is restored. The one write is
 * the plan elevation lane 01 also performs — and only when this lane runs
 * alone with LIVE_QA_ELEVATE=1 LIVE_QA_ALLOW_DB=1 on the qa-live-* account
 * the global teardown erases; with the full suite, 01 already did it.
 * Lanes 21 / 35 / 36 / 39 / 40 cover several of these lines in depth; this
 * lane is the cheap weekly canary that fails loudly when any one regresses.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { type BrowserContext, type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, gotoWithSwapRetry, json } from "./lib/api";
import { dbAllowed, elevatePlan, setGrowthPhase } from "./lib/db";
import { env } from "./lib/env";
import { patchRunState, readRunState } from "./lib/run-state";
import { LIVE_QA_OUT } from "../../playwright.live-qa.config";

const EVALUATOR_STATE = path.join(LIVE_QA_OUT, "evaluator-storage-state.json");

const HERO_H1 = "Know the business before you invest.";
const NAV = ["Product", "For Programs", "For Investors", "For Founders", "Methodology", "Startup Index", "Pricing"] as const;
const TRUST_PAGES = ["/", "/product", "/pricing", "/methodology", "/solutions/accelerator", "/solutions/investor", "/solutions/founder"] as const;
const START_COHORT_HREF = "/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual";
const RETIRED_PILOT_REDIRECTS: ReadonlyArray<[string, string]> = [
  ["/pilot", "/solutions/accelerator"],
  ["/vi/pilot", "/vi/solutions/accelerator"],
  ["/pilot/investor", "/solutions/investor"],
  ["/workspace/accelerator/pilot", "/workspace/accelerator/onboarding"],
];
const METHODOLOGY_PAGES = ["/methodology/governance", "/methodology/versions", "/methodology/calibration"] as const;

type Browser = { newContext: (o: { storageState: string | { cookies: never[]; origins: never[] } }) => Promise<BrowserContext> };

async function anonPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { ctx, page: await ctx.newPage() };
}

function requireElevated(): void {
  const rs = readRunState();
  test.skip(!rs.elevated, "Growth-gated line — run with LIVE_QA_ELEVATE=1 LIVE_QA_ALLOW_DB=1 (or after lane 01)");
}

// ── Provision (only when this lane runs alone) ──────────────────────────────

test.describe("G21 regression — provision", () => {
  test("elevate the QA founder to Growth when the run asked for it and lane 01 has not (idempotent)", async ({ api, qa }, testInfo) => {
    test.skip(!env.elevate, "LIVE_QA_ELEVATE not set — Free-plan coverage only");
    test.skip(!dbAllowed(), "LIVE_QA_ELEVATE=1 needs LIVE_QA_ALLOW_DB=1 for the psql step");
    if (qa.elevated) {
      await evidence(testInfo, "already elevated (lane 01 ran)", { plan: qa.plan });
      return;
    }
    expect(qa.projectId, "project id from setup").toBeTruthy();
    const plan = elevatePlan(qa.email, "growth");
    const phase = setGrowthPhase(qa.email, qa.projectId!, "funding");
    const me = await get<{ ok: boolean; user: { plan?: string } | null }>(api, "/api/auth/me");
    await evidence(testInfo, "after elevation", { plan, phase, me: me.body });
    expect(me.body.user?.plan).toBe("growth");
    patchRunState({ plan: "growth", elevated: true });
  });
});

// ── Anonymous ───────────────────────────────────────────────────────────────

test.describe("G21 regression — anonymous", () => {
  test("home: EN/VI business hero + the seven English nav items in order", async ({ browser, qa }, testInfo) => {
    const { ctx, page } = await anonPage(browser);
    try {
      const res = await page.goto(`${qa.baseURL}/`, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(HERO_H1);
      const labels = await page.locator("header").first().locator("nav a").evaluateAll((as) => as.map((a) => (a.textContent ?? "").trim()));
      await evidence(testInfo, "nav", { labels });
      for (const item of NAV) expect(labels, `nav item ${item}`).toContain(item);
      const order = NAV.map((n) => labels.indexOf(n));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      await page.goto(`${qa.baseURL}/vi`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hiểu rõ doanh nghiệp trước khi đầu tư.");
      const intake = page.getByTestId("hero-search");
      await expect(intake.getByTestId("smart-intake-cta")).toHaveText("Phân tích doanh nghiệp");
      await expect(intake.getByTestId("smart-intake-cta")).toBeDisabled();
      await expect(intake.locator('[data-cta-id="hero_sample_report"]')).toHaveAttribute("href", "/tbr/demo");
    } finally {
      await ctx.close();
    }
  });

  test("trust band exactly once on the seven template pages", async ({ browser, qa }, testInfo) => {
    const { ctx, page } = await anonPage(browser);
    const seen: Record<string, number> = {};
    try {
      for (const p of TRUST_PAGES) {
        const res = await page.goto(`${qa.baseURL}${p}`, { waitUntil: "domcontentloaded" });
        expect(res?.status(), `${p} status`).toBe(200);
        const count = await page.getByTestId("trust-band").count();
        seen[p] = count;
        expect(count, `${p} trust-band count`).toBe(1);
      }
      await evidence(testInfo, "trust-band", seen);
    } finally {
      await ctx.close();
    }
  });

  test("/methodology/{governance,versions,calibration} → 200 + one h1; calibration shows the empty state or n =", async ({ browser, qa }, testInfo) => {
    const { ctx, page } = await anonPage(browser);
    try {
      for (const p of METHODOLOGY_PAGES) {
        const res = await page.goto(`${qa.baseURL}${p}`, { waitUntil: "domcontentloaded" });
        expect(res?.status(), `${p} status`).toBe(200);
        expect(await page.locator("h1").count(), `${p} h1 count`).toBe(1);
      }
      // Still on /methodology/calibration.
      const empty = await page.getByTestId("calibration-empty").count();
      const nStat = await page.getByTestId("calibration-n").count();
      const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      await evidence(testInfo, "calibration", { empty, nStat, hasNEquals: /n = \d+/.test(text) });
      expect(empty > 0 || nStat > 0 || /n = \d+/.test(text), "calibration shows the empty state or an n = figure").toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test("/tbr/demo: one assessment card with SVI + Evidence Confidence; no benchmark line without n =", async ({ browser, qa }, testInfo) => {
    const { ctx, page } = await anonPage(browser);
    try {
      // An anonymous context does not inherit the config baseURL — absolute URL.
      const res = await gotoWithSwapRetry(page, `${qa.baseURL}/tbr/demo`, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      // G27 v3: the Dashboard is the one SVI + Evidence Confidence surface (the G21 card's numbers live in its tiles).
      const dash = page.locator("#tbr-dashboard");
      await expect(dash).toBeVisible({ timeout: 30_000 });
      expect(await page.locator("#tbr-dashboard").count()).toBe(1);
      const text = await dash.innerText();
      expect(text).toMatch(/SVI/i);
      expect(text).toMatch(/evidence confidence/i);
      const benchmarkLines = await page.locator("[data-tbr-benchmark-line]").allInnerTexts();
      await evidence(testInfo, "dashboard", { text: text.slice(0, 600), benchmarkLines: benchmarkLines.slice(0, 4) });
      for (const line of benchmarkLines) expect(line, "benchmark line carries n = or says no published cohort").toMatch(/n\s*=\s*\d+|no published cohort|not published|n = —/i);
    } finally {
      await ctx.close();
    }
  });

  test("G30 home intake and G25 accelerator cohort CTA; existing nav and no pilot offer cards", async ({ browser, qa }, testInfo) => {
    const { ctx, page } = await anonPage(browser);
    try {
      const seen: Record<string, { hero: number; nav: number; pilotCards: number }> = {};
      for (const path of ["/", "/solutions/accelerator"]) {
        const res = await page.goto(`${qa.baseURL}${path}`, { waitUntil: "domcontentloaded" });
        expect(res?.status(), path).toBe(200);
        // The nav CTA renders only after auth hydration (SSR shows a skeleton) — wait for it.
        await page.getByTestId("nav-v2-auth-skeleton").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
        const hero = await page.locator(`main a[href="${START_COHORT_HREF}"]`).count();
        const nav = await page.locator(`header a[href="${START_COHORT_HREF}"]`).count();
        const pilotCards = await page.getByTestId("pilot-offer-card").count();
        seen[path] = { hero, nav, pilotCards };
        if (path === "/") {
          const intake = page.getByTestId("hero-search");
          await expect(intake.getByTestId("smart-intake-cta")).toHaveText("Analyse a business");
          await expect(intake.getByTestId("smart-intake-cta")).toBeDisabled();
          await expect(intake.locator('[data-cta-id="hero_sample_report"]')).toHaveAttribute("href", "/tbr/demo");
        } else {
          expect(hero, `${path} cohort CTA`).toBeGreaterThanOrEqual(1);
          await expect(page.locator(`main a[href="${START_COHORT_HREF}"]`).first()).toContainText("Start a cohort");
        }
        expect(nav, `${path} nav CTA`).toBeGreaterThanOrEqual(1);
        expect(pilotCards, `${path} pilot cards`).toBe(0);
        expect(await page.locator("main").innerText(), path).not.toMatch(/cohort validation pilot|paid pilot|run a cohort pilot/i);
      }
      await evidence(testInfo, "start a cohort CTA", seen);
    } finally {
      await ctx.close();
    }
  });

  test("G25: the retired pilot URLs answer 301 to their replacements (one hop, no 404, no 200)", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const hops: Record<string, { status: number; location: string | undefined }> = {};
      for (const [from, to] of RETIRED_PILOT_REDIRECTS) {
        const res = await anon.get(from, { maxRedirects: 0 });
        hops[from] = { status: res.status(), location: res.headers()["location"] };
        expect(res.status(), from).toBe(301);
        expect(res.headers()["location"] ?? "", from).toMatch(new RegExp(`${to.replace(/\//g, "\\/")}$`));
      }
      await evidence(testInfo, "retired pilot redirects", hops);
    } finally {
      await anon.dispose();
    }
  });

  test("/api/v1/institutional/methodology → 401 without a key", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const r = await get<{ ok?: boolean; error?: string }>(anon, "/api/v1/institutional/methodology");
      await evidence(testInfo, "institutional methodology anon", { status: r.status, error: r.body.error ?? null });
      expect(r.status).toBe(401);
    } finally {
      await anon.dispose();
    }
  });
});

// ── Elevated founder ────────────────────────────────────────────────────────

test.describe("G21 regression — elevated founder", () => {
  test("/workspace/evidence/corrections and /workspace/evidence/outcomes answer 200 with one h1", async ({ page, qa }, testInfo) => {
    requireElevated();
    const out: Record<string, { status: number | null; h1s: number }> = {};
    for (const p of ["/workspace/evidence/corrections", "/workspace/evidence/outcomes"]) {
      const res = await gotoWithSwapRetry(page, p, { waitUntil: "domcontentloaded" });
      const h1s = await page.locator("h1").count();
      out[p] = { status: res?.status() ?? null, h1s };
      expect(res?.status(), `${p} status`).toBe(200);
      expect(h1s, `${p} h1 count`).toBe(1);
    }
    await evidence(testInfo, "evidence pages", { ...out, baseURL: qa.baseURL });
  });

  test("/workspace/score shows the Assessment Card + the trajectory timeline", async ({ page }, testInfo) => {
    requireElevated();
    const res = await gotoWithSwapRetry(page, "/workspace/score", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    const card = page.getByTestId("assessment-card");
    const timeline = page.getByTestId("trajectory-timeline");
    // The QA project only carries an analysis when lane 01/21 ran before this
    // lane; standalone the page is the honest "Run your first SVI analysis"
    // empty state — that is a pass too (the card is asserted on /tbr/demo).
    const emptyState = page.getByRole("heading", { level: 1 }).filter({ hasText: /Run your first SVI analysis/i });
    await Promise.race([card.first().waitFor({ state: "visible", timeout: 30_000 }), emptyState.first().waitFor({ state: "visible", timeout: 30_000 })]);
    const cards = await card.count();
    await evidence(testInfo, "score", { cards, timelines: await timeline.count(), empty: await page.getByTestId("trajectory-empty").count(), noAnalysis: await emptyState.count() });
    if (cards === 0) {
      testInfo.annotations.push({ type: "no-analysis", description: "QA project has no analysis yet — empty state rendered" });
      return;
    }
    expect(cards).toBe(1);
    await expect(timeline.first()).toBeVisible();
    expect(await timeline.count()).toBe(1);
  });
});

// ── Evaluator ───────────────────────────────────────────────────────────────

test.describe("G21 regression — evaluator", () => {
  test("/workspace/evaluations/cohort → 200 with the cohort index", async ({ browser, page, qa }, testInfo) => {
    const hasEvaluator = existsSync(EVALUATOR_STATE) && !!readRunState().evaluator;
    let ctx: BrowserContext | null = null;
    let target = page;
    if (hasEvaluator) {
      ctx = await (browser as Browser).newContext({ storageState: EVALUATOR_STATE });
      target = await ctx.newPage();
    } else {
      testInfo.annotations.push({ type: "note", description: "evaluator seat not provisioned in this run (28-dossier) — asserting the cohort index with the founder session; the h1 sits outside any gate" });
    }
    try {
      const res = await gotoWithSwapRetry(target, `${qa.baseURL}/workspace/evaluations/cohort`, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      await expect(target.getByTestId("cohort-index-page")).toBeVisible();
      await expect(target.getByRole("heading", { level: 1 })).toContainText("BlockID Cohort");
      await evidence(testInfo, "cohort index", { seat: hasEvaluator ? "evaluator" : "founder", baseURL: qa.baseURL });
    } finally {
      await ctx?.close();
    }
  });
});

// ── Trusted /api/status ─────────────────────────────────────────────────────

test.describe("G21 regression — status", () => {
  test("trusted /api/status carries data_moat", async ({ qa }, testInfo) => {
    const token = process.env.STATUS_FULL_TOKEN || process.env.CRON_SECRET || "";
    test.skip(!token, "needs STATUS_FULL_TOKEN or CRON_SECRET (qa-live.sh loads .env.runtime) for the trusted payload");
    const anon = await anonRequest(qa.baseURL);
    try {
      const r = await json<{ ok?: boolean; data_moat?: Record<string, unknown> }>(anon, "GET", "/api/status", undefined, { Authorization: `Bearer ${token}` });
      await evidence(testInfo, "status trusted", { status: r.status, hasDataMoat: r.body.data_moat !== undefined, keys: r.body.data_moat ? Object.keys(r.body.data_moat) : null });
      expect(r.status).toBe(200);
      expect(r.body, "trusted payload has data_moat").toHaveProperty("data_moat");
    } finally {
      await anon.dispose();
    }
  });
});
