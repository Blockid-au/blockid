/**
 * 22 — Evaluator ladder (G12; release-qa2 rows E1–E5, qa3 §1 pricing truth):
 * `/pricing` Founder ↔ Evaluator switch, Scout / Firm / Program cards at
 * A$79 / A$149 / A$349 with the card-required trial pill, `/solutions/advisor`
 * and `/compare*` render clean, the evaluator sign-up up to the card step
 * (nothing entered — the register-with-card contract is asserted by its
 * validation shapes, which run before any Stripe call), and
 * `/workspace/evaluations` for a founder account shows the gate copy.
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post } from "./lib/api";

const LADDER = [
  { id: "tier-scout", name: "Scout", price: "A$79", plan: "investor_angel" },
  { id: "tier-firm", name: "Firm", price: "A$149", plan: "investor_advisor" },
  { id: "tier-program", name: "Program", price: "A$349", plan: "investor_vc_small" },
] as const;

test.describe("Pricing — evaluator segment", () => {
  test("/pricing: Founder ↔ Evaluator switch flips the ladder; Scout / Firm / Program priced A$79 / A$149 / A$349 with a card-required 7-day trial", async ({ page, visit }, testInfo) => {
    await visit("/pricing");
    const sw = page.getByTestId("pricing-segment-switch");
    await expect(sw).toBeVisible({ timeout: 30_000 });
    expect(await sw.getAttribute("data-active-tab")).toBe("founder");
    await expect(page.getByTestId("founder-ladder")).toBeVisible();

    await page.locator("#pricing-tab-evaluator").click();
    await expect(sw).toHaveAttribute("data-active-tab", "evaluator");
    const ladder = page.getByTestId("evaluator-ladder");
    await expect(ladder).toBeVisible();
    await expect(page.locator("#pricing-matrix-heading")).toContainText(/evaluators/i);
    expect(new URL(page.url()).searchParams.get("segment")).toBe("evaluator");

    const rows: Array<{ name: string; price: string | null; cta: string | null; trialPill: boolean }> = [];
    for (const tier of LADDER) {
      const card = page.locator(`#${tier.id}`);
      await expect(card).toBeVisible();
      await expect(card.getByRole("heading", { level: 3 })).toHaveText(tier.name);
      const text = await card.innerText();
      const cta = card.getByRole("link", { name: /Start 7-day free trial/ }).first();
      const href = await cta.getAttribute("href");
      rows.push({ name: tier.name, price: (text.match(/A\$\d+/) ?? [null])[0], cta: href, trialPill: /card required/i.test(text) });
      expect(text, `${tier.name} price`).toContain(tier.price);
      expect(text, `${tier.name} trial pill`).toMatch(/7-day free trial/);
      expect(text, `${tier.name} card required`).toMatch(/card required/i);
      expect(href ?? "", `${tier.name} CTA`).toContain(`plan=${tier.plan}`);
      expect(href ?? "", `${tier.name} CTA segment`).toContain("segment=evaluator");
    }
    await evidence(testInfo, "evaluator ladder", rows);
    await expect(page.getByTestId("evaluator-trial-included").first()).toContainText(/Trusted Business Report/);

    // ?segment=evaluator lands on the evaluator tab directly (E1).
    await visit("/pricing?segment=evaluator");
    await expect(page.getByTestId("pricing-segment-switch")).toHaveAttribute("data-active-tab", "evaluator", { timeout: 30_000 });
  });

  for (const path of ["/solutions/advisor", "/compare", "/compare/chatgpt", "/compare/valuers"]) {
    test(`${path} renders its h1 without console errors or failed requests`, async ({ page, visit, guard }, testInfo) => {
      const g = guard(page, { allowRequest: [{ method: "GET", pathRe: /^\/api\/svi\/phase-progress$/, status: 429 }] });
      await visit(path, { waitUntil: "networkidle" });
      const h1 = page.getByRole("heading", { level: 1 }).first();
      await expect(h1).toBeVisible({ timeout: 30_000 });
      const text = await h1.innerText();
      const report = g.report(path);
      await evidence(testInfo, "page", { h1: text, guard: report });
      if (path.startsWith("/compare")) expect(text).toMatch(/BlockID vs ChatGPT vs a valuer/);
      else expect(text).toMatch(/A\$3/);
      if (report.allowed.length) testInfo.annotations.push({ type: "allow-listed", description: `${report.allowed.length}× Cloudflare-injected GTM bootstrap refused by CSP` });
      expect(report.errors, "unexpected console errors").toEqual([]);
      expect(report.failedRequests, "unexpected failed requests (≥400)").toEqual([]);
    });
  }
});

test.describe("Evaluator registration — up to the card step", () => {
  test("/signup?segment=evaluator&plan=investor_angel&trial=1: Scout preselected, trial line, Stripe card field mounted — no card entered", async ({ browser, qa }, testInfo) => {
    // A fresh, logged-out browser context: the founder session must not
    // pre-fill or redirect the sign-up.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${qa.baseURL}/signup?segment=evaluator&plan=investor_angel&trial=1`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/A\$3/, { timeout: 30_000 });
      await expect(page.getByTestId("evaluator-trial-line")).toContainText(/7-day free trial · card required/);
      const planSelect = page.locator("select").filter({ hasText: /Scout/ }).first();
      await expect(planSelect).toBeVisible();
      const selected = await planSelect.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "");
      expect(selected).toMatch(/Scout — A\$79\/mo/);
      await expect(page.getByTestId("signup-account-type")).toBeVisible();
      const submit = page.getByRole("button", { name: /Start 7-day evaluator trial/ });
      await expect(submit).toBeVisible();
      // Stripe's CardElement mounts as an iframe titled "Secure card payment input (Stripe)".
      await expect(page.locator('iframe[title*="Secure card payment input"]').first()).toBeAttached({ timeout: 45_000 });
      await evidence(testInfo, "signup card step", { selected, submit: await submit.innerText(), stripeIframes: await page.locator('iframe[src*="stripe"]').count() });
    } finally {
      await ctx.close();
    }
  });

  test("POST /api/auth/register-with-card validates before Stripe: payment_method_required, terms_required, unsupported_plan — no account, no customer", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    const email = `qa-live-evaluator-${Date.now()}@blockid.au`; // never registered — every call below fails validation first
    try {
      const base = { email, password: "Qa!never-registered-1", account_type: "investor", plan_id: "investor_angel", terms_accepted: true };
      const noCard = await post(anon, "/api/auth/register-with-card", base);
      // The pm id only has to pass /^pm_[A-Za-z0-9]{1,125}$/ — it is never sent to Stripe because every call fails an earlier gate.
      const noTerms = await post(anon, "/api/auth/register-with-card", { ...base, payment_method_id: "pm_liveQAplaceholder", terms_accepted: false });
      const badPlan = await post(anon, "/api/auth/register-with-card", { ...base, payment_method_id: "pm_liveQAplaceholder", plan_id: "founder_free" });
      await evidence(testInfo, "register-with-card validation", { noCard: { status: noCard.status, body: noCard.body }, noTerms: { status: noTerms.status, body: noTerms.body }, badPlan: { status: badPlan.status, body: badPlan.body } });
      for (const r of [noCard, noTerms, badPlan]) {
        if (r.status === 429) test.skip(true, "register-with-card bucket (5 / 15 min per IP) is exhausted by another lane — re-run later");
      }
      expect(noCard.status).toBe(400);
      expect(noCard.body.error).toBe("payment_method_required");
      expect(noTerms.status).toBe(400);
      expect(noTerms.body.error).toBe("terms_required");
      expect(badPlan.status).toBe(400);
      expect(["unsupported_plan", "unknown_plan"]).toContain(badPlan.body.error);
      // None of the calls may have created an account.
      const login = await post(anon, "/api/auth/login-password", { email, password: base.password });
      await evidence(testInfo, "no account created", { status: login.status, error: login.body.error });
      expect([401, 429]).toContain(login.status);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Evaluator workspace as a founder", () => {
  test("/workspace/evaluations shows the evaluator gate copy for a founder; GET /api/evaluations is 402 feature_locked", async ({ page, visit, api }, testInfo) => {
    await visit("/workspace/evaluations");
    await expect(page.getByRole("heading", { level: 1, name: /Startups I'm evaluating/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/This workspace is for evaluators/)).toBeVisible();
    await expect(page.getByRole("link", { name: /See evaluator plans/ })).toHaveAttribute("href", /\/pricing\?segment=evaluator/);
    expect(await page.getByTestId("evaluation-row").count()).toBe(0);
    const r = await get<{ ok: boolean; error?: string; feature?: string }>(api, "/api/evaluations");
    await evidence(testInfo, "GET /api/evaluations", r.body);
    expect(r.status).toBe(402);
    expect(r.body.error).toBe("feature_locked");
    expect(r.body.feature).toBe("investor.dealflow");
  });
});
