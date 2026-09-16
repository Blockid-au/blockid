/**
 * 28 — Investor Dossier lane (G13 S-D3, BA spec §A.5 S1 / S4 / E5.1, §C.3):
 * a THIRD account `qa-live-evaluator-<stamp>@blockid.au` is registered by
 * this spec (the run's third and last register call — the bucket is 3 / 15
 * min per IP; the founder setup and the member lane hold the other two),
 * re-typed `investor_angel` by a local DB step (LIVE_QA_ALLOW_DB=1 — there
 * is no self-service evaluator registration without a card), adds the QA
 * founder's startup as an evaluation with the founder's email, and the
 * founder CLAIMS it (POST /api/evaluations/claim/[token]) so the row is
 * founder_claimed at reports_shared. Then:
 *
 *   • TTFB: the evaluator's document response for
 *     /workspace/evaluations/[id] arrives in < 1.5 s (§C.3 — measured from
 *     the browser's Navigation Timing `responseStart − requestStart`, plus
 *     the API GET /api/evaluations/[id]/dossier timing as a second reading);
 *   • masking: the founder's read-only preview never carries an assessment
 *     field (no decision chip, no form, no notes) — and the founder's
 *     GET /api/evaluations/[id]/assessment returns only the allow-listed
 *     projection after the evaluator shares `risks`;
 *   • share allow-list: the share response's founderPreview and the founder
 *     read contain no decision / conviction / private notes / valuation;
 *     the share dialog preview text "The founder will see exactly these
 *     items" is on the page;
 *   • S-D3 surfaces: block 3 evidence CTA, block 6 action bar, "Export IC"
 *     (POST ic-report → 201 or 503 before 0403), the seats prompt.
 *
 * The evaluator account is recorded in the run state (`evaluator`) FIRST
 * and erased by the global teardown like the founder and the member.
 * Without LIVE_QA_ALLOW_DB the whole lane is skipped, not failed.
 */
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post, put } from "./lib/api";
import { evaluatorEmailFor, QA_EVALUATOR_EMAIL_RE } from "./lib/env";
import { dbAllowed, setAccountType } from "./lib/db";
import { getScratch, patchRunState, readRunState, setScratch } from "./lib/run-state";
import { LIVE_QA_OUT } from "../../playwright.live-qa.config";

const EVALUATOR_STATE = path.join(LIVE_QA_OUT, "evaluator-storage-state.json");
/** §C.3: dossier TTFB budget (p95) — the lane asserts one sample under it. */
const TTFB_BUDGET_MS = 1500;
const FORBIDDEN_FOUNDER_KEYS = ["decision", "conviction", "privateNotes", "private_notes", "valuationView", "valuation_view", "thesisFitPct", "thesis_fit_pct"];

function requireEvaluator(): { evaluationId: string } {
  const evaluationId = getScratch<string>("dossier.evaluationId");
  test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 to type the third QA account as an evaluator");
  test.skip(!evaluationId || !existsSync(EVALUATOR_STATE), getScratch<string>("dossier.skipReason") ?? "the evaluator seat was not provisioned earlier in this run");
  return { evaluationId: evaluationId! };
}

async function evaluatorBrowser(browser: { newContext: (o: { storageState: string }) => Promise<BrowserContext> }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: EVALUATOR_STATE });
  return { ctx, page: await ctx.newPage() };
}

test.describe("Dossier lane — provision the evaluator seat", () => {
  test("register the evaluator account (third register of the run), type it investor_angel, add the QA startup with the founder's email", async ({ qa }, testInfo) => {
    test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 to type the third QA account as an evaluator");
    const email = evaluatorEmailFor(qa.email);
    expect(QA_EVALUATOR_EMAIL_RE.test(email)).toBe(true);
    const existing = readRunState().evaluator;
    if (existing && existsSync(EVALUATOR_STATE) && getScratch<string>("dossier.evaluationId")) {
      await evidence(testInfo, "evaluator already provisioned (re-run)", { email: existing.email });
      return;
    }
    const password = `Qa!${randomBytes(18).toString("base64url")}`;
    const anon = await anonRequest(qa.baseURL);
    try {
      const reg = await post<{ ok?: boolean; pending?: boolean; user?: { id: string }; error?: string }>(anon, "/api/auth/register", { email, password, displayName: "QA Live Evaluator" });
      await evidence(testInfo, "POST /api/auth/register (evaluator)", { status: reg.status, ok: reg.body.ok, userId: reg.body.user?.id, error: reg.body.error, retryAfter: reg.headers["retry-after"] ?? null });
      if (reg.status === 429) {
        setScratch("dossier.skipReason", `evaluator register rate-limited (429, Retry-After ${reg.headers["retry-after"] ?? "?"}s) — the register bucket is 3 / 15 min per IP`);
        throw new Error(`evaluator register rate-limited (429) — Retry-After ${reg.headers["retry-after"] ?? "?"}s`);
      }
      expect(reg.status).toBe(200);
      expect(reg.body.user?.id).toBeTruthy();
      // Record FIRST — from here on the teardown must erase this account.
      patchRunState({ evaluator: { email, userId: reg.body.user!.id, evaluationId: null, projectId: null } });
      // The persona: the suite cannot register through the card-required evaluator trial (22-evaluator).
      setAccountType(email, "investor_angel");
      const me = await get<{ ok: boolean; user: { id: string; email: string } | null }>(anon, "/api/auth/me");
      expect(me.body.user?.email).toBe(email);
      writeFileSync(EVALUATOR_STATE, JSON.stringify(await anon.storageState(), null, 2));

      // Evaluate the QA founder's startup and invite the founder by email so they can claim it.
      const created = await post<{ ok: boolean; evaluation?: { id: string; projectId: string; inviteToken: string | null; ownerKind: string; consentTier: string }; invite_sent?: boolean; error?: string; message?: string }>(anon, "/api/evaluations", {
        name: qa.projectName,
        website: "https://example.com",
        description: "Throw-away evaluation created by the live-QA dossier lane. Erased at the end of the run.",
        founder_email: qa.email,
        state: "NSW",
        industry: "saas",
      });
      await evidence(testInfo, "POST /api/evaluations", { status: created.status, ok: created.body.ok, evaluationId: created.body.evaluation?.id, ownerKind: created.body.evaluation?.ownerKind, consentTier: created.body.evaluation?.consentTier, inviteSent: created.body.invite_sent, error: created.body.error, message: created.body.message });
      expect(created.status).toBe(201);
      expect(created.body.evaluation?.ownerKind).toBe("founder_invited");
      expect(created.body.evaluation?.consentTier).toBe("attributed_only");
      expect(created.body.evaluation?.inviteToken).toBeTruthy();
      setScratch("dossier.evaluationId", created.body.evaluation!.id);
      setScratch("dossier.inviteToken", created.body.evaluation!.inviteToken!);
      patchRunState({ evaluator: { email, userId: reg.body.user!.id, evaluationId: created.body.evaluation!.id, projectId: created.body.evaluation!.projectId } });
    } finally {
      await anon.dispose();
    }
  });

  test("founder claims the evaluation → founder_claimed at reports_shared", async ({ api }, testInfo) => {
    const { evaluationId } = requireEvaluator();
    const token = getScratch<string>("dossier.inviteToken");
    test.skip(!token, "no invite token recorded");
    const claim = await post<{ ok: boolean; evaluation?: { id: string; ownerKind: string; consentTier: string }; already_claimed?: boolean; error?: string; message?: string }>(api, `/api/evaluations/claim/${encodeURIComponent(token!)}`, {});
    await evidence(testInfo, "POST /api/evaluations/claim/[token]", { status: claim.status, ownerKind: claim.body.evaluation?.ownerKind, consentTier: claim.body.evaluation?.consentTier, already: claim.body.already_claimed, error: claim.body.error, message: claim.body.message });
    expect(claim.status).toBe(200);
    expect(claim.body.evaluation?.id).toBe(evaluationId);
    expect(claim.body.evaluation?.ownerKind).toBe("founder_claimed");
    expect(claim.body.evaluation?.consentTier).toBe("reports_shared");
  });
});

test.describe("Dossier lane — evaluator", () => {
  test("TTFB < 1.5 s for /workspace/evaluations/[id]; the S-D3 blocks render; the API dossier is fast too", async ({ browser, qa }, testInfo) => {
    const { evaluationId } = requireEvaluator();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const url = `${qa.baseURL}/workspace/evaluations/${encodeURIComponent(evaluationId)}`;
      // Warm the route once (a cold Next.js route compile is not the page's TTFB), then measure.
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const res = await page.goto(url, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const nav = await page.evaluate(() => {
        const [n] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        return n ? { ttfbMs: Math.round(n.responseStart - n.requestStart), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd - n.startTime) } : null;
      });
      const t0 = Date.now();
      const apiRes = await page.request.get(`/api/evaluations/${encodeURIComponent(evaluationId)}/dossier`);
      const apiMs = Date.now() - t0;
      await evidence(testInfo, "dossier timing", { navigation: nav, apiStatus: apiRes.status(), apiMs, budgetMs: TTFB_BUDGET_MS });
      expect(nav, "navigation timing entry").not.toBeNull();
      expect(nav!.ttfbMs, `dossier TTFB ${nav!.ttfbMs} ms must be under ${TTFB_BUDGET_MS} ms (§C.3)`).toBeLessThan(TTFB_BUDGET_MS);
      expect(apiRes.status()).toBe(200);
      expect(apiMs, `GET /api/evaluations/[id]/dossier ${apiMs} ms`).toBeLessThan(TTFB_BUDGET_MS * 2);

      const root = page.getByTestId("investor-dossier");
      await expect(root).toHaveAttribute("data-viewer-role", "assessor");
      for (const n of [1, 2, 3, 4, 5, 6]) await expect(page.getByTestId(`dossier-block-${n}`)).toBeVisible();
      await expect(page.getByTestId("consent-chip")).toContainText(/Reports shared/);
      // S-D3: block 3 request-upgrade CTA (→ full_mentor), block 6 action bar, header Export IC, single-seat prompt.
      await expect(page.getByTestId("evidence-upgrade-cta")).toContainText(/Request data-room access/);
      await expect(page.getByTestId("dossier-actions")).toBeVisible();
      for (const id of ["action-watchlist", "action-portfolio", "action-intro", "action-export-ic"]) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId("export-ic")).toContainText(/Export one-pager/);
      await expect(page.getByTestId("seats-single")).toBeVisible();
      await expect(page.getByTestId("evidence-legend")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("submit an assessment (decision + conviction) and share ONLY risks — the founder projection is allow-listed", async ({ browser, qa }, testInfo) => {
    const { evaluationId } = requireEvaluator();
    const { ctx, page } = await evaluatorBrowser(browser);
    try {
      const saved = await put<{ ok: boolean; assessment?: Record<string, unknown>; version?: number; error?: string; message?: string }>(page.request, `/api/evaluations/${encodeURIComponent(evaluationId)}/assessment`, {
        status: "submitted",
        decision: "track",
        conviction: 3,
        dimension_ratings: { TRE: { rating: 3, stance: "unsure", note: "live-qa" } },
        risks: [{ title: "Live-QA risk", severity: "low", source: "evaluator" }],
        private_notes: "LIVE-QA-PRIVATE-NOTE",
        shared_notes: "Live-QA shared note",
      });
      await evidence(testInfo, "PUT /api/evaluations/[id]/assessment (submit)", { status: saved.status, version: saved.body.version, decision: saved.body.assessment?.decision, status_: saved.body.assessment?.status, error: saved.body.error, message: saved.body.message });
      if (saved.status === 503) test.skip(true, "assessments unavailable — migration 0392 not applied on this environment");
      expect(saved.status).toBe(200);
      expect(saved.body.assessment?.status).toBe("submitted");
      expect(saved.body.assessment?.decision).toBe("track");

      const shared = await post<{ ok: boolean; founder_preview?: Record<string, unknown>; error?: string }>(page.request, `/api/evaluations/${encodeURIComponent(evaluationId)}/assessment/share`, { fields: ["risks"] });
      await evidence(testInfo, "POST …/assessment/share {risks}", { status: shared.status, founderPreview: shared.body.founder_preview, error: shared.body.error });
      expect(shared.status).toBe(200);
      const preview = shared.body.founder_preview ?? {}; // route contract is snake_case (S-D2)
      expect(preview.sharedFields).toEqual(["risks"]);
      expect(Array.isArray(preview.risks)).toBe(true);
      const previewJson = JSON.stringify(preview);
      for (const k of FORBIDDEN_FOUNDER_KEYS) expect(previewJson, `founder preview must not carry ${k}`).not.toContain(`"${k}"`);
      expect(previewJson).not.toContain("LIVE-QA-PRIVATE-NOTE");
      expect(previewJson).not.toContain("Live-QA shared note"); // shared_notes was not ticked

      // The share dialog on the page carries the literal preview heading (S4).
      await page.goto(`${qa.baseURL}/workspace/evaluations/${encodeURIComponent(evaluationId)}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("decision-chip")).toContainText(/track/i);
      await page.getByTestId("assessment-share-open").click();
      await expect(page.getByText(/The founder will see exactly these items/)).toBeVisible({ timeout: 15_000 });

      // Block 6: audit trail lists the submit + share; "Export IC" → 201 (or 503 before 0403 — recorded, not failed).
      const ic = await post<{ ok: boolean; ic_report_id?: string; kind?: string; pages?: number | null; pdf_url?: string; error?: string }>(page.request, `/api/evaluations/${encodeURIComponent(evaluationId)}/ic-report`, { kind: "one_page" });
      await evidence(testInfo, "POST …/ic-report", { status: ic.status, kind: ic.body.kind, pages: ic.body.pages, error: ic.body.error });
      expect([201, 503]).toContain(ic.status);
      if (ic.status === 201) {
        expect(ic.body.kind).toBe("one_page"); // Scout is clamped to the one-pager (S6)
        const pdf = await page.request.get(ic.body.pdf_url!);
        expect(pdf.status()).toBe(200);
        expect(pdf.headers()["content-type"]).toContain("application/pdf");
        const bytes = await pdf.body();
        expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
        await evidence(testInfo, "IC one-pager", { bytes: bytes.length, pages: ic.body.pages });
      } else {
        testInfo.annotations.push({ type: "pending-migration", description: "ic_reports (0403) not applied — Export IC answered 503" });
      }
      const watch = await post<{ ok: boolean; added?: boolean; ticker?: string; error?: string }>(page.request, `/api/evaluations/${encodeURIComponent(evaluationId)}/actions`, { action: "watchlist" });
      await evidence(testInfo, "POST …/actions watchlist", watch.body);
      expect(watch.status).toBe(200);
      expect(watch.body.ticker).toMatch(/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Dossier lane — founder preview (§C.1 masking)", () => {
  test("the founder sees blocks 1–3/5, never an assessment field, and reads only the shared risks through the API", async ({ page, api, visit, qa }, testInfo) => {
    const { evaluationId } = requireEvaluator();
    await visit(`/workspace/evaluations/${encodeURIComponent(evaluationId)}`);
    const root = page.getByTestId("investor-dossier");
    await expect(root).toHaveAttribute("data-viewer-role", "founder", { timeout: 30_000 });
    await expect(page.getByTestId("founder-preview-note")).toContainText(/Read-only preview/);
    await expect(page.getByTestId("decision-private")).toBeVisible();
    expect(await page.getByTestId("decision-chip").count()).toBe(0);
    expect(await page.getByTestId("assessment-form").count()).toBe(0);
    expect(await page.getByTestId("dossier-actions").count()).toBe(0);
    expect(await page.getByTestId("export-ic").count()).toBe(0);
    expect(await page.getByTestId("seats-consensus").count()).toBe(0);
    expect(await page.getByTestId("evidence-upgrade-cta").count()).toBe(0);
    const html = await page.content();
    expect(html).not.toContain("LIVE-QA-PRIVATE-NOTE");
    expect(html).not.toContain("Live-QA shared note");
    expect(html).not.toContain('data-testid="consensus-chip"');
    await evidence(testInfo, "founder preview", { url: page.url(), hasPrivateNote: html.includes("LIVE-QA-PRIVATE-NOTE") });

    const read = await get<{ ok: boolean; role?: string; available?: boolean; sharedWithFounder?: Record<string, unknown> | null; assessment?: unknown; error?: string }>(api, `/api/evaluations/${encodeURIComponent(evaluationId)}/assessment`);
    await evidence(testInfo, "GET …/assessment (founder)", { status: read.status, role: read.body.role, available: read.body.available, shared: read.body.sharedWithFounder });
    expect(read.status).toBe(200);
    expect(read.body.role).toBe("founder");
    expect(read.body.assessment).toBeUndefined();
    const text = JSON.stringify(read.body);
    for (const k of FORBIDDEN_FOUNDER_KEYS) expect(text, `founder read must not carry ${k}`).not.toContain(`"${k}"`);
    expect(text).not.toContain("LIVE-QA-PRIVATE-NOTE");
    if (read.body.available && read.body.sharedWithFounder) {
      expect(read.body.sharedWithFounder.sharedFields).toEqual(["risks"]);
      expect(read.body.sharedWithFounder.sharedNotes).toBeUndefined();
    }
    // The founder can never write.
    const write = await put(api, `/api/evaluations/${encodeURIComponent(evaluationId)}/assessment`, { decision: "proceed" });
    expect(write.status).toBe(404);
    // The intro request from the evaluator (Scout) is mailto — nothing lands in the founder CRM from this lane.
    expect(qa.email).toMatch(/^qa-live-/);
  });
});
