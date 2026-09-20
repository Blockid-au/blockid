/**
 * 34 — Purchase path E2E (G20-F3, 2026-09-20): every buy surface is walked
 * to the last step BEFORE money, and nothing is paid.
 *
 *   (a) Free founder: `/pricing` Starter CTA → `/onboarding?trial=1&plan=
 *       founder_starter` (anonymous → 307 to the login/register form with
 *       `next` intact); the card-required `/signup?plan=founder_starter`
 *       renders the 7-day trial terms from `plans.trial_days`, the Starter
 *       price from the plan row, and mounts the Stripe card field;
 *   (b) `POST /api/stripe/checkout {plan:"founder_starter"}` as the QA
 *       founder → 200 + a `checkout.stripe.com` URL that is NEVER opened
 *       (an unpaid Checkout Session expires in 24 h; no customer id is
 *       written until the webhook sees a completed session, so (g) stays
 *       true); `interval:"annual"` on a rung without an annual price → 400
 *       `interval_unavailable`; a custom-priced tier → `contact_sales`;
 *   (c) evaluator: `/pricing?segment=evaluator` Scout CTA → `/signup?segment=
 *       evaluator&plan=investor_angel&trial=1` renders "7-day free trial",
 *       the A$79 row price, and the card field;
 *   (d) credit packs: `/workspace/billing#credits` lists the five packs with
 *       the catalogue amounts and each Buy posts `{amount:<credits>}` to
 *       `/api/credits` — intercepted and aborted in the browser, so the
 *       server never mints a session;
 *   (e) Startup Package: the `/startup-package` CTA carries the catalogue
 *       A$149 on the button AND the quote line, and posts `{plan:
 *       "founder_package"}` to `/api/stripe/checkout` — intercepted, aborted;
 *   (f) the Trusted Business Report quote (A$3 + unlock rail) is lane 21
 *       (`21-reports.spec.ts`) — referenced, not repeated;
 *   (g) `/api/stripe/portal` on an account without a Stripe customer → 404
 *       (never 500); `/workspace/billing` shows the no-subscription state.
 *
 * Amounts come from `config/pricing/stripe-price-catalogue.json` (the
 * read-only Stripe audit) — never typed here — so a re-price fails this lane
 * the same way it fails `stripe-map.test.ts`. Credits are snapshotted around
 * every step. LIVE_QA_SPEND_OK is never honoured by this file.
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence, fetchWithSwapRetry, post } from "./lib/api";
import catalogue from "../../src/config/pricing/stripe-price-catalogue.json";

type CatalogueRow = { plan_id: string; amount_cents: number; interval: string; active: boolean };
const PRICES = (catalogue as { prices: Record<string, CatalogueRow> }).prices;
const aud = (cents: number) => `A$${(cents / 100).toLocaleString("en-AU")}`;

const STARTER_CENTS = PRICES.STRIPE_PRICE_FOUNDER_STARTER!.amount_cents; // 2900
const SCOUT_CENTS = PRICES.STRIPE_PRICE_INVESTOR_ANGEL!.amount_cents; // 7900
const PACKAGE_CENTS = PRICES.STRIPE_PRICE_STARTUP_PACKAGE!.amount_cents; // 14900
const CREDIT_PACK_CENTS: Record<number, number> = Object.fromEntries(
  [5, 10, 25, 50, 100].map((n) => [n, PRICES[`STRIPE_PRICE_CREDITS_${n}`]!.amount_cents]),
);
/** plans.trial_days for the founder + evaluator rungs (docs/ops/pricing-truth.md § 6, pinned by stripe-map.test.ts). */
const TRIAL_DAYS = 7;

interface CheckoutResponse {
  ok: boolean;
  url?: string;
  error?: string;
  reason?: string;
  planId?: string;
  contactUrl?: string;
  /** G21 P0-C: `409 sku_unconfigured` carries the contact fallback. */
  fallback?: string;
  message?: string;
}

test.describe("Purchase path — founder Starter (no spend)", () => {
  test("(a) /pricing Starter CTA → /onboarding?plan=founder_starter; anonymous → login with next intact", async ({ browser, qa }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anon = await anonRequest(qa.baseURL);
    try {
      const page = await ctx.newPage();
      const res = await page.goto("/pricing", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const card = page.locator("#tier-starter");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText(`${aud(STARTER_CENTS)}`);
      await expect(card).toContainText(`${TRIAL_DAYS}-day free trial`);
      const href = await card.locator("a[href]").last().getAttribute("href");
      expect(href).toBe("/onboarding?trial=1&plan=founder_starter");

      // The founder CTA lands on the wizard; signed-out that is the login /
      // register form carrying the plan in `next` (never a 500, never a 404).
      const r = await fetchWithSwapRetry(anon, "GET", href!);
      const location = (r.headers()["location"] ?? "").replace(/^https?:\/\/[^/]+/, "");
      await evidence(testInfo, "Starter CTA", { href, status: r.status(), location, starter: aud(STARTER_CENTS) });
      expect([302, 307]).toContain(r.status());
      expect(location).toMatch(/^\/auth\/login\?next=/);
      expect(decodeURIComponent(location.replace(/^\/auth\/login\?next=/, ""))).toBe(href);
    } finally {
      await anon.dispose();
      await ctx.close();
    }
  });

  test("(a) /signup?plan=founder_starter renders the 7-day trial terms, the Starter price and the Stripe card field", async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await ctx.newPage();
      const res = await page.goto("/signup?plan=founder_starter", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`${TRIAL_DAYS}-day free trial`);
      // The plan picker preselects Starter at the plan-row price.
      const planSelect = page.locator("select", { has: page.locator("option[value=founder_starter]") });
      await expect(planSelect).toHaveValue("founder_starter", { timeout: 30_000 });
      const selected = await planSelect.locator("option[value=founder_starter]").innerText();
      expect(selected).toContain(`Starter — ${aud(STARTER_CENTS)}/mo`);
      // Trial terms: "After 7 days, you'll pay A$29/mo for Starter. Cancel anytime."
      const terms = page.getByTestId("signup-trial-terms");
      await expect(terms).toBeVisible();
      const termsText = await terms.innerText();
      expect(termsText).toMatch(new RegExp(`After ${TRIAL_DAYS} days, you'll pay ${aud(STARTER_CENTS).replace(/[$.]/g, (c) => `\\${c}`)}/mo for (Founder )?Starter`));
      expect(termsText).toContain("Cancel anytime");
      // Stripe Elements mounts its iframe inside the card wrapper (real key on production).
      const cardField = page.getByTestId("signup-card-field");
      await expect(cardField).toBeVisible();
      // Stripe Elements mounts a visible frame plus a hidden controller frame — ≥ 1.
      await expect.poll(async () => cardField.locator("iframe").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      await evidence(testInfo, "/signup?plan=founder_starter", { h1: await page.getByRole("heading", { level: 1 }).innerText(), selected, terms: termsText, cardIframes: await cardField.locator("iframe").count() });
    } finally {
      await ctx.close();
    }
  });

  test("(b) POST /api/stripe/checkout founder_starter → 200 checkout.stripe.com URL (never opened); annual → 400 interval_unavailable; custom → contact_sales", async ({ api, credits }, testInfo) => {
    const before = await credits.snapshot();

    // Pre-Stripe branches first (no session minted, no rate-limit budget spent on Stripe).
    const annual = await post<CheckoutResponse>(api, "/api/stripe/checkout", { plan: "founder_starter", interval: "annual" });
    const custom = await post<CheckoutResponse>(api, "/api/stripe/checkout", { plan: "founder_enterprise" });

    // The real one: a subscription Checkout Session with a 7-day trial. It is
    // never navigated to — the session expires unpaid.
    const starter = await post<CheckoutResponse>(api, "/api/stripe/checkout", { plan: "founder_starter" });
    const host = starter.body.url ? new URL(starter.body.url).host : null;
    await evidence(testInfo, "POST /api/stripe/checkout", {
      annual: { status: annual.status, body: annual.body },
      custom: { status: custom.status, body: custom.body },
      starter: { status: starter.status, ok: starter.body.ok, host, urlPresent: Boolean(starter.body.url) },
    });

    expect(annual.status).toBe(400);
    expect(annual.body.ok).toBe(false);
    expect(annual.body.error).toBe("interval_unavailable");
    expect(annual.body.planId).toBe("founder_starter");

    expect(custom.status).toBe(200);
    expect(custom.body.ok).toBe(false);
    expect(custom.body.error).toBe("contact_sales");
    expect(custom.body.contactUrl).toBe("/contact?plan=founder_enterprise");

    expect(starter.status, starter.text.slice(0, 300)).toBe(200);
    expect(starter.body.ok).toBe(true);
    expect(host).toBe("checkout.stripe.com");

    await credits.assertUnchanged(before, "checkout session preview");
  });
});

test.describe("Purchase path — evaluator Scout (no spend)", () => {
  test("(c) /pricing?segment=evaluator Scout CTA → register-with-card page: 7-day trial line, A$79, card field", async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await ctx.newPage();
      const res = await page.goto("/pricing?segment=evaluator", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const card = page.locator("#tier-scout");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText(aud(SCOUT_CENTS));
      const href = await card.locator("a[href]").last().getAttribute("href");
      expect(href).toBe("/signup?segment=evaluator&plan=investor_angel&trial=1");

      const signup = await page.goto(href!, { waitUntil: "domcontentloaded" });
      expect(signup?.status()).toBe(200);
      const trialLine = page.getByTestId("evaluator-trial-line");
      await expect(trialLine).toBeVisible({ timeout: 30_000 });
      const trialText = await trialLine.innerText();
      expect(trialText).toContain(`${TRIAL_DAYS}-day free trial`);
      expect(trialText).toContain("card required");
      expect(trialText).toContain(`charged on day ${TRIAL_DAYS + 1}`);
      const planSelect = page.locator("select", { has: page.locator("option[value=investor_angel]") });
      await expect(planSelect).toHaveValue("investor_angel", { timeout: 30_000 });
      const selected = await planSelect.locator("option[value=investor_angel]").innerText();
      expect(selected).toContain(`Scout — ${aud(SCOUT_CENTS)}/mo`);
      const terms = await page.getByTestId("signup-trial-terms").innerText();
      expect(terms).toContain(`After ${TRIAL_DAYS} days, you'll pay ${aud(SCOUT_CENTS)}/mo for Scout`);
      const cardField = page.getByTestId("signup-card-field");
      // Stripe Elements mounts a visible frame plus a hidden controller frame — ≥ 1.
      await expect.poll(async () => cardField.locator("iframe").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      await evidence(testInfo, "Scout signup", { href, trialText, selected, terms, cardIframes: await cardField.locator("iframe").count() });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Purchase path — credit packs + Startup Package (intercepted before Stripe)", () => {
  test("(d) /workspace/billing#credits lists the five packs at the catalogue amounts; each Buy posts {amount} to /api/credits", async ({ page, visit, credits }, testInfo) => {
    const before = await credits.snapshot();
    const posted: Array<{ url: string; body: unknown }> = [];
    // Abort every POST /api/credits at the browser — the server never sees it,
    // so no Stripe session is created and no dev-fallback grant can run.
    await page.route("**/api/credits", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posted.push({ url: route.request().url(), body: route.request().postDataJSON() });
      await route.abort("failed");
    });
    await visit("/workspace/billing#credits");
    const packs = page.getByTestId("credit-pack");
    await expect(packs).toHaveCount(5, { timeout: 30_000 });
    const seen: Array<{ pack: number; priceCents: number; label: string }> = [];
    for (let i = 0; i < 5; i++) {
      const el = packs.nth(i);
      const pack = Number(await el.getAttribute("data-pack"));
      const priceCents = Number(await el.getAttribute("data-price-cents"));
      const label = await el.innerText();
      seen.push({ pack, priceCents, label: label.replace(/\s+/g, " ").trim() });
      expect(CREDIT_PACK_CENTS[pack], `pack ${pack} is not in the catalogue`).toBeDefined();
      expect(priceCents).toBe(CREDIT_PACK_CENTS[pack]);
      expect(label).toContain(`${aud(CREDIT_PACK_CENTS[pack]!)} inc. GST`);
      // Click Buy → the request is captured and aborted; the button re-enables
      // once the fetch rejects (network error surfaces as the inline error).
      await el.getByTestId("credit-pack-buy").click();
      await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(i + 1);
      expect(posted[i]!.body).toEqual({ amount: pack });
      await expect(el.getByTestId("credit-pack-buy")).toBeEnabled({ timeout: 15_000 });
    }
    await evidence(testInfo, "credit packs", { seen, posted });
    expect(posted.map((p) => (p.body as { amount: number }).amount)).toEqual([5, 10, 25, 50, 100]);
    await credits.assertUnchanged(before, "credit-pack buy buttons (aborted)");
  });

  test("(e) /startup-package CTA quotes the catalogue A$149 before checkout and posts founder_package (aborted before Stripe)", async ({ page, visit, credits }, testInfo) => {
    const before = await credits.snapshot();
    const posted: unknown[] = [];
    await page.route("**/api/stripe/checkout", async (route) => {
      posted.push(route.request().postDataJSON());
      await route.abort("failed");
    });
    await visit("/startup-package");
    const cta = page.getByTestId("startup-package-checkout");
    await expect(cta).toBeVisible({ timeout: 30_000 });
    const label = await cta.innerText();
    const quote = await page.getByTestId("startup-package-quote").innerText();
    expect(label).toContain(aud(PACKAGE_CENTS));
    expect(quote).toContain(`${aud(PACKAGE_CENTS)} inc. GST`);
    expect(await cta.getAttribute("data-plan-id")).toBe("founder_package");
    // Every other A$ on the page is the same figure (no stale price anywhere).
    const bodyText = await page.locator("main").first().innerText();
    const amounts = [...bodyText.matchAll(/A\$([\d,]+)/g)].map((m) => m[1]);
    await cta.click();
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1);
    expect(posted[0]).toEqual({ plan: "founder_package" });
    await evidence(testInfo, "Startup Package CTA", { label, quote, amounts, posted });
    for (const a of amounts) expect(`A$${a}`).toBe(aud(PACKAGE_CENTS));
    await credits.assertUnchanged(before, "Startup Package CTA (aborted)");
  });
});

test.describe("Purchase path — Free account billing truth", () => {
  test("(g) POST /api/stripe/portal without a Stripe customer → 404 (not 500); /workspace/billing shows the no-subscription state", async ({ api, page, visit, qa }, testInfo) => {
    const portal = await post<CheckoutResponse>(api, "/api/stripe/portal", {});
    await visit("/workspace/billing");
    await expect(page.getByRole("heading", { level: 2, name: /Current Plan/ })).toBeVisible({ timeout: 30_000 });
    const currentPlan = page.getByRole("heading", { level: 2, name: /Current Plan/ }).locator("xpath=ancestor::section[1]");
    const planText = (await currentPlan.innerText()).replace(/\s+/g, " ");
    await evidence(testInfo, "portal + billing", { portal: { status: portal.status, body: portal.body }, plan: qa.plan, elevated: qa.elevated, planText: planText.slice(0, 300) });
    expect(portal.status).toBe(404);
    expect(portal.body.ok).toBe(false);
    // A DB-elevated Growth account still has no Stripe subscription: no cancel
    // section, no Manage Billing; a Free account additionally says so.
    if (!qa.elevated) expect(planText).toContain("You are on the free plan");
    expect(await page.locator('[data-testid="cancel-subscription-section"]').count()).toBe(0);
    expect(await page.getByRole("button", { name: /Manage Billing/ }).count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// G21 P0-C — the paid Cohort Validation Pilot (never paid here)
// ---------------------------------------------------------------------------
//
//   (h) /solutions/accelerator#pilot shows BOTH offer cards at the PILOT_SKUS
//       amounts (A$1,500 / ≤ 25, A$2,500 / ≤ 50 — read from the catalogue
//       rows, never typed here), each with "inc. GST" and the
//       quote-before-you-pay line;
//   (i) clicking the A$1,500 control does ONE of two things, and the test
//       asserts whichever occurs: with STRIPE_PRICE_COHORT_PILOT_25 set the
//       button opens the confirm panel and "Continue to secure checkout"
//       posts {plan:"cohort_pilot_25"} — the response is captured and the
//       returned checkout.stripe.com URL is NEVER opened (the session
//       expires unpaid); without the env var the control is a link that
//       lands on /contact?topic=pilot. Credits are asserted unchanged.
const PILOT_25_CENTS = PRICES.STRIPE_PRICE_COHORT_PILOT_25!.amount_cents; // 150000
const PILOT_50_CENTS = PRICES.STRIPE_PRICE_COHORT_PILOT_50!.amount_cents; // 250000

test.describe("Purchase path — Cohort Validation Pilot (G21 P0-C, no spend)", () => {
  test("(h) /solutions/accelerator#pilot shows both offer cards at the catalogue amounts inc. GST with the quote line", async ({ page, visit, credits }, testInfo) => {
    const before = await credits.snapshot();
    await visit("/solutions/accelerator#pilot");
    const cards = page.getByTestId("pilot-offer-card");
    await expect(cards).toHaveCount(2, { timeout: 30_000 });
    const seen: Array<{ sku: string | null; text: string }> = [];
    for (let i = 0; i < 2; i++) {
      const el = cards.nth(i);
      const sku = await el.getAttribute("data-sku");
      const text = (await el.innerText()).replace(/\s+/g, " ");
      seen.push({ sku, text });
    }
    const c25 = seen.find((c) => c.sku === "cohort_pilot_25")!;
    const c50 = seen.find((c) => c.sku === "cohort_pilot_50")!;
    expect(c25.text).toContain(aud(PILOT_25_CENTS));
    expect(c25.text).toContain("inc. GST");
    expect(c25.text).toMatch(/Up to 25 applicants/i);
    expect(c25.text).toMatch(/quote before you pay/i);
    expect(c50.text).toContain(aud(PILOT_50_CENTS));
    expect(c50.text).toMatch(/Up to 50 applicants/i);
    await expect(page.getByTestId("pilot-metrics").locator("li")).toHaveCount(6);
    await evidence(testInfo, "pilot offer cards", { seen });
    await credits.assertUnchanged(before, "pilot offer cards (read-only)");
  });

  test("(i) the A$1,500 control → a checkout.stripe.com URL (captured, never opened) when the price is minted, else /contact?topic=pilot", async ({ page, visit, credits }, testInfo) => {
    const before = await credits.snapshot();
    const posted: unknown[] = [];
    const responses: Array<{ status: number; body: CheckoutResponse | null }> = [];
    await page.route("**/api/stripe/checkout", async (route) => {
      posted.push(route.request().postDataJSON());
      // Let the server mint (or refuse) the session, capture the answer, and
      // hand the browser a dead-end so the Stripe URL is never navigated to.
      const res = await route.fetch();
      let body: CheckoutResponse | null = null;
      try {
        body = (await res.json()) as CheckoutResponse;
      } catch {
        body = null;
      }
      responses.push({ status: res.status(), body });
      await route.fulfill({ status: 599, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "captured by live-qa — never opened" }) });
    });
    await visit("/solutions/accelerator#pilot");
    const buy = page.getByTestId("pilot-buy-cohort_pilot_25");
    await expect(buy).toBeVisible({ timeout: 30_000 });
    const mode = await buy.getAttribute("data-pilot-mode");
    expect(["contact", "checkout"]).toContain(mode);

    if (mode === "contact") {
      // Unminted: a plain link, no POST, no login detour.
      expect(await buy.getAttribute("href")).toBe("/contact?topic=pilot");
      await buy.click();
      await page.waitForURL(/\/contact\?topic=pilot/, { timeout: 30_000 });
      await evidence(testInfo, "pilot buy (unconfigured → contact)", { landed: page.url(), posted });
      expect(posted).toHaveLength(0);
    } else {
      // Minted: the confirm panel quotes the amount, then the POST is captured.
      await buy.click();
      const confirm = page.getByTestId("pilot-confirm-cohort_pilot_25");
      await expect(confirm).toBeVisible({ timeout: 15_000 });
      expect((await confirm.innerText()).replace(/\s+/g, " ")).toContain(`${aud(PILOT_25_CENTS)} inc. GST`);
      await page.getByTestId("pilot-checkout-cohort_pilot_25").click();
      await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1);
      expect(posted[0]).toEqual({ plan: "cohort_pilot_25" });
      await expect.poll(() => responses.length, { timeout: 30_000 }).toBe(1);
      const r = responses[0]!;
      await evidence(testInfo, "pilot buy (configured → captured session)", { status: r.status, ok: r.body?.ok, error: r.body?.error, host: r.body?.url ? new URL(r.body.url).host : null, fallback: r.body?.fallback });
      if (r.status === 200) {
        expect(r.body?.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      } else {
        // The env var vanished between render and POST — still an honest answer.
        expect(r.status).toBe(409);
        expect(r.body?.fallback).toBe("/contact?topic=pilot");
      }
      expect(page.url()).not.toMatch(/stripe\.com/);
    }
    await credits.assertUnchanged(before, "pilot buy control (never paid)");
  });
});
