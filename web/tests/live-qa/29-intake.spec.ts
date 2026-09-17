/**
 * 29 — Program intake lane (G14 S35, D2 / D5 / F-4):
 *
 *   • the EVALUATOR seat provisioned by 28-dossier (qa-live-evaluator-…,
 *     investor_angel, storage state on disk) creates an intake link via
 *     POST /api/intake/links → 201 { intake.publicUrl = /apply/<slug> },
 *     auto_report OFF by default (F-4); without that seat (no
 *     LIVE_QA_ALLOW_DB, or 28 skipped) the whole lane is skipped, not
 *     failed. 404 `not_migrated` (0405 not applied yet) also skips;
 *   • the QA FOUNDER account (not an evaluator) gets 402 feature_locked;
 *   • an ANONYMOUS browser submits a one-page PDF deck at /apply/<slug>
 *     (multipart, consent ticked) → 200 { status: "received" }; the same
 *     email again → 409 duplicate; the honeypot → 204;
 *   • the row is visible in the evaluator's inbox
 *     (/workspace/accelerator/applications) with the startup name, a
 *     "Score now (1 report)" button (unscored) and a dossier link; the CSV
 *     export carries the row; the founder is the QA account's email so the
 *     invite lands in the run's own mailbox and the evaluation is erased
 *     with the evaluator by the teardown;
 *   • closing the link → /apply/<slug> shows the closed card and the
 *     submit route answers 404 { error: "closed" }.
 *
 * The lane never spends: "Score now" is asserted as a button, not clicked
 * (the evaluator's report quota belongs to the 22/28 lanes).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, patch, post } from "./lib/api";
import { dbAllowed } from "./lib/db";
import { getScratch, setScratch } from "./lib/run-state";
import { LIVE_QA_OUT } from "../../playwright.live-qa.config";

const EVALUATOR_STATE = path.join(LIVE_QA_OUT, "evaluator-storage-state.json");
const DECK = path.join(__dirname, "fixtures", "one-page.pdf");
const DATA_SENTENCE = "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.";

interface IntakeDto {
  id: string;
  slug: string;
  name: string;
  status: "open" | "closed";
  autoReport: boolean;
  publicUrl: string;
  submissionCount: number;
}

function requireIntake(): { intakeId: string; slug: string } {
  const intakeId = getScratch<string>("intake.id");
  const slug = getScratch<string>("intake.slug");
  test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 (the evaluator seat comes from 28-dossier)");
  test.skip(!existsSync(EVALUATOR_STATE), "the evaluator seat was not provisioned by 28-dossier");
  test.skip(!intakeId || !slug, getScratch<string>("intake.skipReason") ?? "no intake link was created earlier in this lane");
  return { intakeId: intakeId!, slug: slug! };
}

async function evaluatorBrowser(browser: { newContext: (o: { storageState: string }) => Promise<BrowserContext> }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: EVALUATOR_STATE });
  return { ctx, page: await ctx.newPage() };
}

function deckMultipart(fields: Record<string, string>) {
  return {
    multipart: {
      ...fields,
      deck: { name: "one-page.pdf", mimeType: "application/pdf", buffer: readFileSync(DECK) },
    },
  };
}

test.describe("Intake lane — create the link", () => {
  test("founder account → 402 feature_locked on POST /api/intake/links", async ({ api }, testInfo) => {
    const res = await post<{ ok: boolean; error?: string; feature?: string }>(api, "/api/intake/links", { name: "Should not exist" });
    await evidence(testInfo, "POST /api/intake/links (founder)", { status: res.status, body: res.body });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ ok: false, error: "feature_locked", feature: "intake.manage" });
  });

  test("evaluator creates an intake link — auto_report OFF by default, public URL /apply/<slug>", async ({ browser, qa }, testInfo) => {
    test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 (the evaluator seat comes from 28-dossier)");
    test.skip(!existsSync(EVALUATOR_STATE), "the evaluator seat was not provisioned by 28-dossier");
    const { ctx } = await evaluatorBrowser(browser);
    try {
      const res = await post<{ ok: boolean; intake?: IntakeDto; error?: string; message?: string }>(ctx.request, "/api/intake/links", {
        name: `QA Live Intake ${qa.startedAt.slice(0, 16)}`,
        blurb: "Throw-away intake link created by the live-QA intake lane. Erased with the evaluator at the end of the run.",
        max_submissions: 5,
      });
      await evidence(testInfo, "POST /api/intake/links (evaluator)", { status: res.status, body: res.body });
      if (res.status === 404 && res.body.error === "not_migrated") {
        setScratch("intake.skipReason", "migration 0405 (program_intakes) is not applied on this server");
        test.skip(true, "migration 0405 not applied");
      }
      expect(res.status).toBe(201);
      const intake = res.body.intake!;
      expect(intake.autoReport).toBe(false);
      expect(intake.status).toBe("open");
      expect(intake.publicUrl).toBe(`${qa.baseURL}/apply/${intake.slug}`);
      expect(intake.slug).toMatch(/^qa-live-intake-[a-z0-9-]+-[a-z2-7]{8}$/);
      setScratch("intake.id", intake.id);
      setScratch("intake.slug", intake.slug);

      const list = await get<{ ok: boolean; intakes: IntakeDto[] }>(ctx.request, "/api/intake/links");
      expect(list.status).toBe(200);
      expect(list.body.intakes.some((i) => i.id === intake.id)).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Intake lane — anonymous founder applies", () => {
  test("/apply/<slug> renders the form with the data-ownership sentence verbatim and is noindex", async ({ page, qa }, testInfo) => {
    const { slug } = requireIntake();
    const res = await page.goto(`${qa.baseURL}/apply/${slug}`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("apply-form")).toBeVisible();
    await expect(page.getByTestId("apply-data-principle")).toHaveText(DATA_SENTENCE);
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    await evidence(testInfo, "/apply/<slug>", { robots, title: await page.title() });
    expect(robots ?? "").toMatch(/noindex/);
  });

  test("multipart submit with the one-page PDF → 200 received; duplicate email → 409; honeypot → 204", async ({ qa }, testInfo) => {
    const { slug } = requireIntake();
    const anon = await anonRequest(qa.baseURL);
    try {
      const fields = { startup_name: `${qa.projectName} (intake)`, founder_name: "QA Live Founder", founder_email: qa.email, website: "https://example.com", consent: "on" };
      const t0 = Date.now();
      const res = await anon.post(`/api/intake/${slug}/submit`, { ...deckMultipart(fields), timeout: 120_000 });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; submission_id?: string; status?: string; error?: string; message?: string };
      await evidence(testInfo, "POST /api/intake/[slug]/submit", { status: res.status(), body, ms: Date.now() - t0 });
      expect(res.status()).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.status).toBe("received");
      setScratch("intake.submissionId", body.submission_id ?? null);

      const dup = await anon.post(`/api/intake/${slug}/submit`, { ...deckMultipart(fields), timeout: 60_000 });
      await evidence(testInfo, "duplicate", { status: dup.status(), body: await dup.json().catch(() => null) });
      expect(dup.status()).toBe(409);

      const bot = await anon.post(`/api/intake/${slug}/submit`, deckMultipart({ ...fields, founder_email: `bot+${Date.now()}@example.com`, company_website_confirm: "http://spam.example" }));
      await evidence(testInfo, "honeypot", { status: bot.status() });
      expect(bot.status()).toBe(204);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Intake lane — evaluator inbox", () => {
  test("the row is in the inbox with Score now + dossier link; the CSV carries it", async ({ browser, qa }, testInfo) => {
    const { intakeId } = requireIntake();
    test.skip(!getScratch<string>("intake.submissionId"), "no submission recorded");
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const res = await page.goto(`${qa.baseURL}/workspace/accelerator/applications`, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      await expect(page.getByTestId("intake-inbox")).toBeVisible();
      const row = page.getByTestId("intake-row").filter({ hasText: `${qa.projectName} (intake)` });
      await expect(row).toHaveCount(1);
      await expect(row.getByTestId("intake-dossier-link")).toBeVisible();
      await expect(row.getByTestId("intake-score-now")).toBeVisible();
      await expect(row.getByTestId("coverage-heat")).toBeVisible();
      await evidence(testInfo, "inbox row", { status: await row.getAttribute("data-status"), text: (await row.innerText()).slice(0, 300) });
      expect(await page.getByTestId("not-available-yet").count()).toBe(0);

      const csv = await ctx.request.get(`/api/intake/links/${intakeId}/export.csv`);
      const text = await csv.text();
      await evidence(testInfo, "export.csv", { status: csv.status(), contentType: csv.headers()["content-type"], lines: text.split("\r\n").length });
      expect(csv.status()).toBe(200);
      expect(text.startsWith("﻿Startup,Founder,Founder email")).toBe(true);
      expect(text).toContain(`${qa.projectName} (intake)`);
    } finally {
      await ctx.close();
    }
  });

  test("closing the link → /apply shows the closed card and the submit route answers 404 closed", async ({ browser, page, qa }, testInfo) => {
    const { intakeId, slug } = requireIntake();
    const { ctx } = await evaluatorBrowser(browser);
    try {
      const closed = await patch<{ ok: boolean; intake?: IntakeDto }>(ctx.request, `/api/intake/links/${intakeId}`, { status: "closed" });
      await evidence(testInfo, "PATCH close", { status: closed.status, body: closed.body });
      expect(closed.status).toBe(200);
      expect(closed.body.intake?.status).toBe("closed");
    } finally {
      await ctx.close();
    }
    await page.goto(`${qa.baseURL}/apply/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("apply-closed")).toBeVisible();
    const anon = await anonRequest(qa.baseURL);
    try {
      const res = await anon.post(`/api/intake/${slug}/submit`, deckMultipart({ startup_name: "Late", founder_email: `late+${Date.now()}@example.com`, consent: "on" }));
      const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
      await evidence(testInfo, "submit after close", { status: res.status(), body });
      expect(res.status()).toBe(404);
      expect(body.error).toBe("closed");
    } finally {
      await anon.dispose();
    }
  });
});
