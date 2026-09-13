/**
 * 20 — Money Finder / funding (G11; release-qa2 rows 7–10, qa3 §2 "A$3 Money
 * Finder (guest)"): `/funding` intake → free preview, the A$3 rail shows the
 * price before any spend, the guest checkout is PREVIEWED only (validation
 * shape; a Stripe-hosted URL is asserted only under LIVE_QA_SPEND_OK), the
 * grants / programs directories render, `/workspace/funding` on the QA
 * project, and the paid report contract (402 insufficient_credits vs the
 * plan-included path, which is the only one the suite ever generates on).
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post } from "./lib/api";
import { env } from "./lib/env";
import { setScratch } from "./lib/run-state";

const INTAKE = {
  description: "AI-assisted valuation and data-room tooling for Australian pre-seed founders (SaaS).",
  state: "NSW",
  stage: "mvp",
  industry_tags: ["saas"],
} as const;

interface Preview {
  ok: boolean;
  preview?: {
    grant_count: number;
    program_count: number;
    top_grants: Array<{ name: string; why: string }>;
    top_programs: Array<{ name: string; why: string }>;
    total_amount_max_aud?: number;
  };
  disclaimer?: string;
  error?: string;
  field?: string;
}

test.describe("Money Finder — public intake and directories", () => {
  test("/funding: three-question intake → free preview renders matches, A$3 rail shows the price before any spend", async ({ page, visit, guard, credits }, testInfo) => {
    const g = guard(page, { allowRequest: [{ method: "GET", pathRe: /^\/api\/svi\/phase-progress$/, status: 429 }] });
    const before = await credits.snapshot();
    await visit("/funding");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    const form = page.locator("form[data-funding-intake]");
    await expect(form).toBeVisible();
    await form.locator("#fi-description").fill(INTAKE.description);
    await form.locator("#fi-state").selectOption(INTAKE.state);
    await form.locator(`input[name="stage"][value="${INTAKE.stage}"]`).check({ force: true });
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/funding/preview") && r.request().method() === "POST", { timeout: 45_000 }),
      form.getByRole("button", { name: /Show my matches/ }).click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as Preview;
    await evidence(testInfo, "POST /api/funding/preview (UI)", { status: res.status(), grant_count: body.preview?.grant_count, program_count: body.preview?.program_count, top_grants: body.preview?.top_grants?.length });
    expect(res.status()).toBe(200);
    expect(body.ok).toBe(true);
    expect((body.preview?.grant_count ?? 0) + (body.preview?.program_count ?? 0), "at least one match for an NSW MVP SaaS").toBeGreaterThan(0);

    const preview = page.locator("section[data-funding-preview]");
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toContainText(/Your free preview/i);

    // Paywall rail: the price is visible BEFORE anything is charged. With the
    // founder session this is the credits rail; nothing is clicked.
    const paywall = page.locator("[data-funding-paywall]");
    await expect(paywall).toBeVisible();
    const rail = await paywall.getAttribute("data-rail");
    const railText = await paywall.innerText();
    await evidence(testInfo, "paywall rail", { rail, text: railText.slice(0, 600) });
    expect(railText).toMatch(/A\$3/);
    if (rail === "credits") {
      await expect(paywall.locator("[data-rail-form=credits]")).toContainText(/3 credits/);
      await expect(paywall.getByRole("button", { name: /Generate for 3 credits/ })).toBeVisible();
    } else if (rail === "plan") {
      await expect(paywall.getByRole("button", { name: /Generate my report/ })).toBeVisible();
    }
    await credits.assertUnchanged(before, "funding preview + rail");
    const report = g.report("/funding intake");
    await evidence(testInfo, "guard report", report);
    expect(report.failedRequests, "no failed requests during the intake").toEqual([]);
  });

  test("POST /api/funding/preview contract: 200 shape, 400 { error, field } on a short description", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const ok = await post<Preview>(anon, "/api/funding/preview", INTAKE);
      const bad = await post<Preview>(anon, "/api/funding/preview", { ...INTAKE, description: "too short" });
      await evidence(testInfo, "preview contract", { ok: { status: ok.status, keys: Object.keys(ok.body.preview ?? {}) }, bad: { status: bad.status, body: bad.body } });
      expect(ok.status).toBe(200);
      expect(ok.body.ok).toBe(true);
      expect(typeof ok.body.preview?.grant_count).toBe("number");
      expect(typeof ok.body.preview?.program_count).toBe("number");
      expect(Array.isArray(ok.body.preview?.top_grants)).toBe(true);
      expect(typeof ok.body.disclaimer).toBe("string");
      expect(bad.status).toBe(400);
      expect(bad.body.ok).toBe(false);
      expect(bad.body.field).toBe("description");
    } finally {
      await anon.dispose();
    }
  });

  test("A$3 guest checkout is previewed, not created: 400 on an invalid email; a Stripe-hosted URL only under LIVE_QA_SPEND_OK", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const invalid = await post(anon, "/api/funding/checkout", { ...INTAKE, email: "not-an-email" });
      await evidence(testInfo, "POST /api/funding/checkout (invalid email)", invalid.body);
      expect(invalid.status, "validation runs before any Stripe call").toBe(400);
      expect(invalid.body.ok).toBe(false);
      expect(invalid.body.field).toBe("email");
      expect(invalid.body).not.toHaveProperty("checkoutUrl");

      if (!env.spendOk) {
        testInfo.annotations.push({ type: "not-exercised", description: "Stripe Checkout session not created (LIVE_QA_SPEND_OK unset) — the route has no preview mode; creating the session is the only way to see the hosted URL" });
        return;
      }
      const session = await post<{ ok: boolean; checkoutUrl?: string; fundingReportId?: string }>(anon, "/api/funding/checkout", { ...INTAKE, email: qa.email });
      await evidence(testInfo, "POST /api/funding/checkout (SPEND_OK)", { status: session.status, host: session.body.checkoutUrl ? new URL(session.body.checkoutUrl).host : null, fundingReportId: session.body.fundingReportId });
      expect(session.status).toBe(200);
      expect(session.body.checkoutUrl ?? "").toMatch(/^https:\/\/checkout\.stripe\.com\//);
    } finally {
      await anon.dispose();
    }
  });

  test("/funding/grants directory renders with an open-count", async ({ page, visit }, testInfo) => {
    await visit("/funding/grants");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: 30_000 });
    await expect(h1).toContainText(/grants/i);
    const count = page.locator("[data-open-count]").first();
    await expect(count).toBeVisible();
    const n = Number(await count.getAttribute("data-open-count"));
    await evidence(testInfo, "grants directory", { h1: await h1.innerText(), openCount: n });
    expect(n, "at least one open grant listed").toBeGreaterThan(0);
  });

  test("/funding/programs/[capital] renders for sydney, 404s for an unknown capital", async ({ page, visit, qa }, testInfo) => {
    await visit("/funding/programs/sydney");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: 30_000 });
    await expect(h1).toContainText(/Sydney/);
    await expect(page.locator("#list-heading")).toBeVisible();
    const anon = await anonRequest(qa.baseURL);
    try {
      const nope = await anon.get("/funding/programs/not-a-capital", { headers: { accept: "text/html" }, maxRedirects: 0 });
      await evidence(testInfo, "programs", { h1: await h1.innerText(), unknownCapitalStatus: nope.status() });
      expect(nope.status()).toBe(404);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Money Finder — founder workspace and paid report contract", () => {
  test("/workspace/funding on the QA project: heading, price hint (Free) or empty radar state (plan-included)", async ({ page, visit, qa }, testInfo) => {
    await visit("/workspace/funding");
    const root = page.locator("[data-workspace-funding]");
    const boundary = page.getByRole("heading", { name: /We couldn't load your workspace/ });
    await expect(root.or(boundary).first()).toBeVisible({ timeout: 30_000 });
    if (await boundary.isVisible().catch(() => false)) {
      const errorId = (await page.getByText(/Error ID:/).innerText().catch(() => "")).trim();
      await evidence(testInfo, "workspace error boundary", { errorId, elevated: qa.elevated });
      // Product finding (run 1, 2026-09-13): page.tsx calls isFundingTab() from
      // the 'use client' funding-workspace.tsx on the plan-included path, so
      // every Starter+/Growth founder gets the error boundary here.
      throw new Error(`/workspace/funding rendered the workspace error boundary (${errorId}) — server log: "Attempted to call isFundingTab() from the server but isFundingTab is on the client"`);
    }
    await expect(page.getByRole("heading", { level: 1, name: /Grant & Program Finder/ })).toBeVisible();
    const included = (await root.getAttribute("data-plan-included")) === "1";
    setScratch("funding.planIncluded", included);
    const text = await root.innerText();
    await evidence(testInfo, "workspace funding", { included, elevated: qa.elevated, projectName: qa.projectName, sample: text.slice(0, 500) });
    expect(text).toContain(qa.projectName);
    if (included) {
      await expect(page.locator("[data-no-report]")).toContainText(/No report for this startup yet/);
    } else {
      const hint = page.locator("[data-paywall-hint]");
      await expect(hint).toContainText(/A\$3/);
      await expect(hint).toContainText(/Starter A\$29\/mo/);
    }
    await expect(page.locator("form[data-funding-intake]")).toBeVisible();
  });

  test("POST /api/funding/report: validation 400 shape; 402 insufficient_credits when the balance is short; generated only when plan-included (0 credits)", async ({ api, qa, credits }, testInfo) => {
    test.setTimeout(180_000);
    const bad = await post(api, "/api/funding/report", { ...INTAKE, description: "short", project_id: qa.projectId });
    await evidence(testInfo, "POST /api/funding/report (invalid)", bad.body);
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("description");

    const before = await credits.snapshot();
    const included = qa.scratch["funding.planIncluded"] === true;
    if (!included && before >= 3 && !env.spendOk) {
      testInfo.annotations.push({ type: "not-exercised", description: `report generation would spend 3 of the ${before} welcome credits (LIVE_QA_SPEND_OK unset) and the balance is not short enough for the 402 path` });
      test.skip(true, "Free plan with ≥ 3 credits — neither the 402 nor the included path can be asserted without spending");
    }
    const r = await post<{ ok: boolean; error?: string; creditsRequired?: number; balance?: number; reportId?: string; url?: string; paidVia?: string; creditsCharged?: number; creditNote?: string }>(
      api,
      "/api/funding/report",
      { ...INTAKE, project_id: qa.projectId },
    );
    await evidence(testInfo, "POST /api/funding/report", { status: r.status, body: { ...r.body, summary: undefined } });
    if (!included && before < 3) {
      expect(r.status).toBe(402);
      expect(r.body.error).toBe("insufficient_credits");
      expect(r.body.creditsRequired).toBe(3);
      expect(typeof r.body.balance).toBe("number");
      await credits.assertUnchanged(before, "funding report 402");
      return;
    }
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.reportId).toBeTruthy();
    if (included) {
      expect(r.body.paidVia).toBe("plan");
      expect(r.body.creditsCharged ?? 0).toBe(0);
      await credits.assertUnchanged(before, "plan-included funding report");
    }
    setScratch("funding.reportId", r.body.reportId!);

    const detail = await get<{ ok: boolean; report?: { id: string } }>(api, `/api/funding/report/${r.body.reportId}`);
    const pdf = await api.get(`/api/funding/report/${r.body.reportId}/pdf`);
    await evidence(testInfo, "report + pdf", { detailStatus: detail.status, pdfStatus: pdf.status(), pdfType: pdf.headers()["content-type"], pdfBytes: (await pdf.body()).length });
    expect([200, 202]).toContain(detail.status);
    expect([200, 409]).toContain(pdf.status());
    if (pdf.status() === 200) expect(pdf.headers()["content-type"]).toMatch(/application\/pdf/);
  });

  test("GET /api/funding/report is 401 without a session and 200 { paid_count } with one", async ({ api, qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const a = await get(anon, "/api/funding/report");
      const f = await get<{ ok: boolean; paid_count: number }>(api, "/api/funding/report");
      await evidence(testInfo, "GET /api/funding/report", { anon: a.status, founder: f.body });
      expect(a.status).toBe(401);
      expect(f.status).toBe(200);
      expect(typeof f.body.paid_count).toBe("number");
    } finally {
      await anon.dispose();
    }
  });
});
