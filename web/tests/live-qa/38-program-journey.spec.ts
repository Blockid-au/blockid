/**
 * 38 — Program journey lane (G21 P2-C):
 *
 *   • the EVALUATOR seat provisioned by 28-dossier (storage state on disk)
 *     opens /workspace/accelerator and every one of the six stage tabs
 *     (`?stage=intake|assessment|selection|program|demo-day|sponsor`)
 *     renders: h1 outside any gate, the tab strip, the stage panel and a
 *     state chip (done / in progress / not started) derived from the data;
 *   • when the run elevates (LIVE_QA_ELEVATE=1 + LIVE_QA_ALLOW_DB=1) the
 *     seat is lifted to Program (investor_vc_small) for the lane and put
 *     back to Scout afterwards, so the Cohort Report route is exercised on
 *     a seat that holds lp_report: with a batch of its own the HTML answers
 *     200 (movement + human-review sections), otherwise the documented
 *     empty states — 400 without ?batch, 404 for a batch that is not the
 *     seat's; a non-elevated Scout documents 403 feature_locked; the
 *     Cohorts list (GET /api/evaluations/batch) answers 200 with `orgId`
 *     null or a uuid on every row (G22-B / 0433 fail-soft before apply);
 *   • the anonymous caller gets 401 on the report, the pack and the
 *     feedback-letter preview;
 *   • /workspace/accelerator/pilot on a non-pilot account shows the "Book a
 *     pilot" card (→ /pilot) and never the metrics form.
 *
 * Nothing is sent and nothing is paid: the feedback-letter route is only
 * ever called anonymously (401) and the pilot page is read.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post } from "./lib/api";
import { dbAllowed, elevatePlan } from "./lib/db";
import { env, evaluatorEmailFor } from "./lib/env";
import { LIVE_QA_OUT } from "../../playwright.live-qa.config";

const EVALUATOR_STATE = path.join(LIVE_QA_OUT, "evaluator-storage-state.json");
const STAGES = ["intake", "assessment", "selection", "program", "demo-day", "sponsor"] as const;
const NIL_BATCH = "00000000-0000-4000-8000-000000000000";

function requireEvaluator(): void {
  test.skip(!existsSync(EVALUATOR_STATE), "the evaluator seat was not provisioned by 28-dossier");
}

async function evaluatorBrowser(browser: { newContext: (o: { storageState: string }) => Promise<BrowserContext> }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: EVALUATOR_STATE });
  return { ctx, page: await ctx.newPage() };
}

test.describe("Program journey — the six stage tabs", () => {
  for (const stage of STAGES) {
    test(`/workspace/accelerator?stage=${stage} renders the h1, the tab strip and the ${stage} panel`, async ({ browser, qa }, testInfo) => {
      requireEvaluator();
      const { ctx, page } = await evaluatorBrowser(browser);
      try {
        const res = await page.goto(`${qa.baseURL}/workspace/accelerator?stage=${stage}`, { waitUntil: "domcontentloaded" });
        expect(res?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toContainText("Program journey");
        const journey = page.getByTestId("program-journey");
        await expect(journey).toBeVisible();
        await expect(journey).toHaveAttribute("data-stage", stage);
        const tabs = page.getByTestId("journey-tabs").locator("[data-stage-tab]");
        await expect(tabs).toHaveCount(6);
        await expect(page.locator(`[data-stage-tab="${stage}"]`)).toHaveAttribute("aria-current", "page");
        await expect(page.getByTestId(`panel-${stage}`)).toBeVisible();
        const states = await tabs.evaluateAll((els) => els.map((el) => el.getAttribute("data-stage-state")));
        for (const s of states) expect(["done", "in_progress", "not_started"]).toContain(s);
        await evidence(testInfo, `journey ${stage}`, { states, url: page.url() });
      } finally {
        await ctx.close();
      }
    });
  }

  test("the Cohort report page (URL kept) renders its h1 and the per-cohort report list or its empty state", async ({ browser, qa }, testInfo) => {
    requireEvaluator();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const res = await page.goto(`${qa.baseURL}/workspace/accelerator/quarterly-report`, { waitUntil: "domcontentloaded" });
      await evidence(testInfo, "/workspace/accelerator/quarterly-report", { status: res?.status(), url: page.url() });
      // A Scout is redirected by the tier gate; a Program seat sees the page.
      if (new URL(page.url()).pathname === "/workspace/accelerator/quarterly-report") {
        await expect(page.getByRole("heading", { level: 1 })).toContainText("Cohort Report");
        await expect(page.getByTestId("cohort-report-list")).toBeVisible();
      } else {
        expect(res?.status()).toBe(200);
      }
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Cohort Report route — gates and the documented states", () => {
  test("anonymous → 401 on the report, the demo-day pack and the feedback-letter preview (nothing sent)", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const report = await get<{ ok: boolean; error?: string }>(anon, `/api/reports/cohort?batch=${NIL_BATCH}`);
      const pack = await get<{ ok: boolean; error?: string }>(anon, `/api/reports/demo-day-pack?batch=${NIL_BATCH}`);
      const letters = await post<{ ok: boolean; error?: string }>(anon, "/api/reports/cohort/feedback-letters", { batch: NIL_BATCH });
      await evidence(testInfo, "anonymous", { report: report.status, pack: pack.status, letters: letters.status });
      expect(report.status).toBe(401);
      expect(pack.status).toBe(401);
      expect(letters.status).toBe(401);
    } finally {
      await anon.dispose();
    }
  });

  test("evaluator seat: 403 feature_locked as a Scout; elevated to Program → 400 without ?batch, 404 for a foreign batch, 200 HTML for its own", async ({ browser, qa }, testInfo) => {
    requireEvaluator();
    const email = evaluatorEmailFor(qa.email);
    const elevated = env.elevate && dbAllowed();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const scout = await get<{ ok: boolean; error?: string; feature?: string }>(page.request, `/api/reports/cohort?batch=${NIL_BATCH}`);
      await evidence(testInfo, "GET /api/reports/cohort (Scout)", { status: scout.status, error: scout.body.error });
      // A Scout holds neither lp_report nor accelerator.cohort → the documented 403.
      expect([403, 404]).toContain(scout.status);
      if (scout.status === 403) expect(scout.body).toMatchObject({ ok: false, error: "feature_locked", feature: "lp_report" });

      test.skip(!elevated, "needs LIVE_QA_ELEVATE=1 + LIVE_QA_ALLOW_DB=1 to lift the seat to Program for the report route");
      elevatePlan(email, "investor_vc_small");
      try {
        const missing = await get<{ ok: boolean; error?: string }>(page.request, "/api/reports/cohort");
        const foreign = await get<{ ok: boolean; error?: string }>(page.request, `/api/reports/cohort?batch=${NIL_BATCH}`);
        const bad = await get<{ ok: boolean; error?: string }>(page.request, `/api/reports/cohort?batch=${NIL_BATCH}&format=docx`);
        await evidence(testInfo, "GET /api/reports/cohort (Program)", { missing: missing.status, foreign: foreign.status, bad: bad.status });
        expect(missing.status).toBe(400);
        expect(missing.body).toMatchObject({ error: "missing_scope" });
        expect(foreign.status).toBe(404);
        expect(bad.status).toBe(400);

        // The seat's own batches, if 22-evaluator queued one: the HTML must answer 200 with the report sections.
        // G22-B (0433): the Cohorts list reads the org_id column through the V3 → V2 → V1 fallback, so it
        // answers 200 whether or not 0433 is applied, and `orgId` is null or a uuid — never undefined / a
        // non-string (fail-soft before apply; a stamped org after the backfill).
        const batches = await get<{ ok: boolean; batches?: Array<{ id: string; orgId?: unknown }> }>(page.request, "/api/evaluations/batch");
        const own = batches.status === 200 ? (batches.body.batches ?? [])[0]?.id : undefined;
        await evidence(testInfo, "own batches", { status: batches.status, first: own ?? null, org_id: (batches.body.batches ?? [])[0]?.orgId ?? null });
        expect(batches.status).toBe(200);
        for (const b of batches.body.batches ?? []) expect(b.orgId === null || (typeof b.orgId === "string" && /^[0-9a-f-]{36}$/i.test(b.orgId))).toBe(true);
        if (own) {
          const res = await page.request.get(`${qa.baseURL}/api/reports/cohort?batch=${encodeURIComponent(own)}&format=html`);
          const html = await res.text();
          await evidence(testInfo, "GET /api/reports/cohort?format=html (own batch)", { status: res.status(), type: res.headers()["content-type"], bytes: html.length });
          expect(res.status()).toBe(200);
          expect(res.headers()["content-type"]).toContain("text/html");
          expect(html).toContain('data-section="movement"');
          expect(html).toContain('data-section="human-review"');
          expect(html).toContain("Humans made every decision");
          const csv = await page.request.get(`${qa.baseURL}/api/reports/cohort?batch=${encodeURIComponent(own)}&format=csv`);
          expect(csv.status()).toBe(200);
          expect(csv.headers()["content-type"]).toContain("text/csv");
        }
      } finally {
        elevatePlan(email, "investor_angel");
      }
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Pilot delivery kit", () => {
  test("/workspace/accelerator/pilot on a non-pilot account shows the Book a pilot card, never the metrics form", async ({ browser, qa }, testInfo) => {
    requireEvaluator();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const res = await page.goto(`${qa.baseURL}/workspace/accelerator/pilot`, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Pilot delivery kit");
      await expect(page.getByTestId("pilot-book-card")).toBeVisible();
      const href = await page.getByTestId("pilot-book-card").getByRole("link", { name: /See the pilot/ }).getAttribute("href");
      await evidence(testInfo, "/workspace/accelerator/pilot", { href });
      expect(href).toBe("/pilot");
      await expect(page.getByTestId("pilot-metrics-form")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("the founder account cannot PATCH a foreign pilot order (404) and an anonymous caller gets 401", async ({ api, qa }, testInfo) => {
    const orderId = "11111111-1111-4111-8111-111111111111";
    const founder = await api.fetch(`${qa.baseURL}/api/pilots/${orderId}/metrics`, { method: "PATCH", data: { satisfaction: 5 } });
    const anon = await anonRequest(qa.baseURL);
    try {
      const anonRes = await anon.fetch(`${qa.baseURL}/api/pilots/${orderId}/metrics`, { method: "PATCH", data: { satisfaction: 5 } });
      await evidence(testInfo, "PATCH /api/pilots/[orderId]/metrics", { founder: founder.status(), anon: anonRes.status() });
      expect(founder.status()).toBe(404);
      expect(anonRes.status()).toBe(401);
    } finally {
      await anon.dispose();
    }
  });
});
