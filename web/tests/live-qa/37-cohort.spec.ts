/**
 * 37 — BlockID Cohort view (G21 P2-B; FI § 53/54).
 *
 * Re-types the dossier lane's evaluator seat (28-dossier) to a Program plan
 * (`investor_vc_small` — the plan row that carries the `lp_export` flag
 * `canBatchScore` gates on, per src/app/api/evaluations/batch/route.ts) and,
 * AS THE EVALUATOR, creates a one-item batch from the dossier evaluation
 * (`POST /api/evaluations/batch`). That single-startup, still-`queued` batch
 * (the cron scores it off-peak — this run never waits for a score) is then
 * the fixture for `/workspace/evaluations/cohort/<batchId>`:
 *
 *   • header — h1, stats, members (creator chip, "Invite reviewer" for the
 *     owner), "Humans make the decision.", the Program journey link;
 *   • table — every sort button, the caption's "canonical SVI unchanged"
 *     line, exactly one `aria-sort="descending"` column (default sort is
 *     Program score);
 *   • filters — URL-synced (`risk=1`, debounced `q=`), empty state + Clear;
 *   • Override dialog — disabled while the row is unscored (svi is null on
 *     a queued item); when scored, opens, explains the canonical score is
 *     unchanged, and validates an empty submit — never actually recorded;
 *   • Compare drawer — open / close for the one row;
 *   • column chooser + density toggle;
 *   • shortlist toggle — optimistic `aria-pressed`, then persisted after a
 *     reload (migration 0423; a 503 is recorded and the step annotated, not
 *     failed);
 *   • members API — GET (creator is `is_creator`+`owner`), POST an unknown
 *     e-mail (404), GET export.csv (CSV header row).
 *
 * The seat is ALWAYS re-typed back to `investor_angel` at the end (mirrors
 * 33-page-sweep's accelerator restore) so 33 and any lane after this one
 * still sees the paying Scout evaluator it expects. The batch itself needs
 * no explicit cleanup — `evaluation_batches` cascades on user_id when the
 * evaluator account is erased by the global teardown.
 *
 * Every network call in this file goes through the EVALUATOR's own session
 * (the evaluator storage state, or `page.request` inside an evaluator
 * `Page`) — never the founder `api` fixture.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { request, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { evidence, get, post } from "./lib/api";
import { env } from "./lib/env";
import { dbAllowed, elevatePlan, setAccountType } from "./lib/db";
import { getScratch, readRunState, setScratch } from "./lib/run-state";
import { LIVE_QA_OUT } from "../../playwright.live-qa.config";

const EVALUATOR_STATE = path.join(LIVE_QA_OUT, "evaluator-storage-state.json");

const SORT_COLUMNS = ["company", "svi", "weightedScore", "confidence", "verification", "delta", "gaps", "reviewStatus", "decision", "shortlist"] as const;

interface CohortMemberRow {
  user_id: string;
  role: "owner" | "reviewer" | "viewer";
  email: string | null;
  display_name: string | null;
  is_creator: boolean;
  created_at: string;
}

interface BatchCreateResponse {
  ok: boolean;
  batch_id?: string;
  queued?: number;
  quota_left?: number;
  error?: string;
  message?: string;
  feature?: string;
  upgrade_url?: string;
}

interface MembersGetResponse {
  ok: boolean;
  available?: boolean;
  role?: string;
  members?: CohortMemberRow[];
  error?: string;
}

interface MembersPostResponse {
  ok: boolean;
  member?: CohortMemberRow;
  email_sent?: boolean;
  already?: boolean;
  error?: string;
  message?: string;
}

interface ItemPatchResponse {
  ok: boolean;
  item?: { id: number; shortlisted: boolean; review_status: string; reviewer_id: string | null };
  error?: string;
  message?: string;
}

function requireEvaluatorSeat(): { evaluationId: string } {
  const evaluationId = getScratch<string>("dossier.evaluationId");
  test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 to re-type the evaluator seat as Program");
  test.skip(!evaluationId || !existsSync(EVALUATOR_STATE) || !readRunState().evaluator, getScratch<string>("dossier.skipReason") ?? "the evaluator seat was not provisioned earlier in this run (28-dossier)");
  return { evaluationId: evaluationId! };
}

function requireBatch(): { batchId: string } {
  const batchId = getScratch<string>("cohort.batchId");
  test.skip(!batchId, getScratch<string>("cohort.skipReason") ?? "the cohort batch was not provisioned earlier in this run (37-cohort provision)");
  return { batchId: batchId! };
}

async function evaluatorBrowser(browser: { newContext: (o: { storageState: string }) => Promise<BrowserContext> }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: EVALUATOR_STATE });
  return { ctx, page: await ctx.newPage() };
}

/** A request context with the evaluator's cookie jar — the third QA account, never the founder's. */
async function evaluatorRequest(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, storageState: EVALUATOR_STATE });
}

test.describe("BlockID Cohort — provision", () => {
  test("re-type the evaluator seat to Program (investor_vc_small) and create a one-item batch from the dossier evaluation", async ({ qa }, testInfo) => {
    const { evaluationId } = requireEvaluatorSeat();
    const existingBatchId = getScratch<string>("cohort.batchId");
    if (existingBatchId) {
      await evidence(testInfo, "batch already provisioned (re-run)", { batchId: existingBatchId });
      return;
    }
    const seat = readRunState().evaluator!;
    // Program = plans row `investor_vc_small`, which carries `lp_export` — the flag canBatchScore gates on.
    setAccountType(seat.email, "investor_vc");
    if (env.elevate) elevatePlan(seat.email, "investor_vc_small");

    const evaluator = await evaluatorRequest(qa.baseURL);
    try {
      const batch = await post<BatchCreateResponse>(evaluator, "/api/evaluations/batch", { evaluation_ids: [evaluationId], name: "QA Live cohort" });
      await evidence(testInfo, "POST /api/evaluations/batch", { status: batch.status, batchId: batch.body.batch_id, queued: batch.body.queued, quotaLeft: batch.body.quota_left, error: batch.body.error, feature: batch.body.feature, message: batch.body.message });
      if (batch.status === 402 || batch.status === 403) {
        const reason = `POST /api/evaluations/batch → ${batch.status} ${batch.body.error ?? "?"} — ${batch.body.message ?? "batch scoring is not available for this seat"}`;
        setScratch("cohort.skipReason", reason);
        test.skip(true, reason);
      }
      expect(batch.status).toBe(201);
      expect(batch.body.ok).toBe(true);
      expect(batch.body.batch_id).toBeTruthy();
      setScratch("cohort.batchId", batch.body.batch_id!);
    } finally {
      await evaluator.dispose();
    }
  });
});

test.describe("BlockID Cohort — view", () => {
  test("header, stats, members and the sortable table render for the owner", async ({ browser, qa, guard }, testInfo) => {
    const { batchId } = requireBatch();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const g = guard(page);
      await page.goto(`${qa.baseURL}/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`, { waitUntil: "domcontentloaded" });

      await expect(page.getByTestId("cohort-h1")).toContainText("BlockID Cohort — QA Live cohort");
      await expect(page.getByTestId("cohort-stats")).toBeVisible();

      const table = page.getByTestId("cohort-table");
      await expect(table).toBeVisible();
      for (const c of SORT_COLUMNS) await expect(table.getByTestId(`sort-${c}`)).toBeVisible();
      await expect(table.locator('th[aria-sort="descending"]')).toHaveCount(1);
      await expect(page.getByTestId("cohort-caption")).toContainText(/canonical SVI unchanged/);

      await expect(page.getByTestId("cohort-members")).toBeVisible();
      await expect(page.getByTestId("cohort-member").first()).toBeVisible();
      await expect(page.getByTestId("invite-reviewer-toggle")).toBeVisible();

      await expect(page.getByTestId("humans-decide")).toContainText("Humans make the decision.");
      await expect(page.getByTestId("cohort-program-journey")).toHaveAttribute("href", "/workspace/accelerator");

      const report = g.report(`cohort/${batchId}`);
      await evidence(testInfo, "console/network guard", { errors: report.errors, failedRequests: report.failedRequests });
      expect(report.errors, "unexpected console errors").toEqual([]);
      expect(report.failedRequests, "unexpected failed requests (≥400)").toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("filters update the URL (risk, clear) and the search box debounces into an empty state", async ({ browser, qa }, testInfo) => {
    const { batchId } = requireBatch();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      await page.goto(`${qa.baseURL}/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`, { waitUntil: "domcontentloaded" });

      await page.getByTestId("filter-risk").click();
      await expect.poll(() => page.url()).toContain("risk=1");
      await page.getByTestId("filter-clear").click();
      await expect.poll(() => page.url()).not.toContain("risk=1");

      await page.getByTestId("filter-q").fill("zzz-nothing");
      await expect.poll(() => page.url(), { timeout: 5_000 }).toContain("q=zzz-nothing");
      const empty = page.getByTestId("cohort-empty");
      await expect(empty).toBeVisible();
      const clearFilters = empty.getByRole("button", { name: "Clear filters" });
      await expect(clearFilters).toBeVisible();
      await evidence(testInfo, "empty state after search", { url: page.url(), emptyText: await empty.innerText() });
      await clearFilters.click();
      await expect.poll(() => page.url()).not.toContain("q=zzz-nothing");
    } finally {
      await ctx.close();
    }
  });

  test("Override dialog is disabled while the row is unscored, or opens and validates an empty submit when scored (never actually recorded)", async ({ browser, qa }, testInfo) => {
    const { batchId } = requireBatch();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      await page.goto(`${qa.baseURL}/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`, { waitUntil: "domcontentloaded" });
      const row = page.getByTestId("cohort-row").first();
      await expect(row).toBeVisible();
      const sviText = (await row.getByTestId("svi-cell").innerText()).trim();
      const overrideOpen = row.getByTestId("override-open");
      await expect(overrideOpen).toBeVisible();
      await evidence(testInfo, "row score state", { sviText });

      if (sviText === "—") {
        await expect(overrideOpen, "the batch is queued — override is disabled until the item is scored").toBeDisabled();
        return;
      }

      await overrideOpen.click();
      const dialog = page.getByTestId("override-dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("role", "dialog");
      await expect(dialog).toContainText(/The canonical score is unchanged/);

      await dialog.getByTestId("override-submit").click();
      await expect(dialog.getByTestId("override-to-error")).toBeVisible();
      await expect(dialog.getByTestId("override-reason-error")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    } finally {
      await ctx.close();
    }
  });

  test("Compare drawer opens for the selected row and closes", async ({ browser, qa }, testInfo) => {
    const { batchId } = requireBatch();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      await page.goto(`${qa.baseURL}/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`, { waitUntil: "domcontentloaded" });
      const row = page.getByTestId("cohort-row").first();
      await row.getByTestId("compare-toggle").click();
      await page.getByTestId("compare-open").click();
      const drawer = page.getByTestId("compare-drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("link", { name: /Open dossier/ })).toBeVisible();
      await page.getByTestId("compare-close").click();
      await expect(drawer).toBeHidden();
      await evidence(testInfo, "compare drawer", { url: page.url() });
    } finally {
      await ctx.close();
    }
  });

  test("column chooser hides/shows a column; density toggle switches the table to compact", async ({ browser, qa }, testInfo) => {
    const { batchId } = requireBatch();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      await page.goto(`${qa.baseURL}/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`, { waitUntil: "domcontentloaded" });
      const table = page.getByTestId("cohort-table");

      await page.getByTestId("column-chooser-toggle").click();
      await page.getByTestId("column-toggle-gaps").uncheck();
      await expect(table.getByTestId("sort-gaps")).toHaveCount(0);
      await page.getByTestId("column-toggle-gaps").check();
      await expect(table.getByTestId("sort-gaps")).toBeVisible();

      await page.getByTestId("density-toggle").click();
      await expect(table).toHaveAttribute("data-density", "compact");
      await evidence(testInfo, "density toggled", { density: await table.getAttribute("data-density") });
    } finally {
      await ctx.close();
    }
  });

  test("shortlist toggle is optimistic and persists after a reload (or is annotated pending-migration on a 503)", async ({ browser, qa }, testInfo) => {
    const { batchId } = requireBatch();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      await page.goto(`${qa.baseURL}/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`, { waitUntil: "domcontentloaded" });
      const row = page.getByTestId("cohort-row").first();
      const toggle = row.getByTestId("shortlist-toggle");

      const [resp] = await Promise.all([
        page.waitForResponse((r) => /\/api\/evaluations\/batch\/[^/]+\/items\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH"),
        toggle.click(),
      ]);
      const body = (await resp.json().catch(() => ({}))) as ItemPatchResponse;
      await evidence(testInfo, "PATCH …/items/[itemId] (shortlist)", { status: resp.status(), body });

      if (resp.status() === 503) {
        testInfo.annotations.push({ type: "pending-migration", description: "cohort review columns (0423) not applied on this environment — shortlist PATCH answered 503" });
        return;
      }
      expect(resp.status()).toBe(200);
      await expect(toggle).toHaveAttribute("aria-pressed", "true");

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("cohort-row").first()).toHaveAttribute("data-shortlisted", "true");
    } finally {
      await ctx.close();
    }
  });

  test("members API: GET lists the creator as owner, POST an unknown e-mail is 404, export.csv carries the BlockID Cohort header row", async ({ browser }, testInfo) => {
    const { batchId } = requireBatch();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const membersGet = await get<MembersGetResponse>(page.request, `/api/evaluations/batch/${encodeURIComponent(batchId)}/members`);
      await evidence(testInfo, "GET …/members", { status: membersGet.status, available: membersGet.body.available, role: membersGet.body.role, members: membersGet.body.members });
      if (membersGet.status === 503) {
        testInfo.annotations.push({ type: "pending-migration", description: "evaluation_batch_members (0423) not applied on this environment — GET members answered 503" });
      } else {
        expect(membersGet.status).toBe(200);
        expect(membersGet.body.members?.[0]?.is_creator).toBe(true);
        expect(membersGet.body.members?.[0]?.role).toBe("owner");
      }

      const nobody = `qa-nobody-${Math.random().toString(36).slice(2, 10)}@example.com`;
      const membersPost = await post<MembersPostResponse>(page.request, `/api/evaluations/batch/${encodeURIComponent(batchId)}/members`, { email: nobody, role: "reviewer" });
      await evidence(testInfo, "POST …/members (unknown e-mail)", { status: membersPost.status, error: membersPost.body.error, message: membersPost.body.message });
      if (membersPost.status === 503) {
        testInfo.annotations.push({ type: "pending-migration", description: "evaluation_batch_members (0423) not applied on this environment — POST members answered 503" });
      } else {
        expect(membersPost.status).toBe(404);
        expect(membersPost.body.error).toBe("unknown_email");
      }

      const csv = await page.request.get(`/api/evaluations/batch/${encodeURIComponent(batchId)}/export.csv`);
      expect(csv.status()).toBe(200);
      expect(csv.headers()["content-type"] ?? "").toContain("text/csv");
      const text = (await csv.text()).replace(/^﻿/, "");
      const headerRow = text.split(/\r\n/)[0] ?? "";
      await evidence(testInfo, "GET …/export.csv", { status: csv.status(), contentType: csv.headers()["content-type"], headerRow });
      expect(headerRow.startsWith("Company,Stage,Sector,SVI,Program score")).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("BlockID Cohort — restore", () => {
  test("restore the evaluator seat to investor_angel for the lanes that follow", async ({}, testInfo) => {
    test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 to restore the evaluator seat");
    const seat = readRunState().evaluator;
    test.skip(!seat, "no evaluator seat was provisioned in this run — nothing to restore");
    setAccountType(seat!.email, "investor_angel");
    if (env.elevate) elevatePlan(seat!.email, "investor_angel");
    await evidence(testInfo, "evaluator seat restored", { email: seat!.email, accountType: "investor_angel", elevated: env.elevate });
  });
});
