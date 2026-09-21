/**
 * 34 — Purchase path E2E (G20-F3, 2026-09-20; G25-D review-before-pay,
 * 2026-09-21): every buy surface is walked to the last step BEFORE money,
 * and nothing is paid.
 *
 * Founder rule 2026-09-21: a click on a plan, a price or "Start 7-day trial"
 * NEVER opens Stripe. Every entry point lands on `/checkout/review` (or the
 * card-required sign-up, whose card form sits under a review block); only
 * the explicit Pay / Add-card button posts to a checkout route. A request
 * interceptor on every checkout route asserts that nothing is posted before
 * that click.
 *
 *   (a) Free founder: `/pricing` Starter CTA → `/checkout/review?plan=
 *       founder_starter&trial=1&entry=pricing_card`; signed out the review
 *       renders the plan, A$29 inc. GST + the GST share, the 7-day trial
 *       line, renewal / cancellation, the seller of record and the data
 *       principle, and its ONE primary control is a sign-up LINK carrying
 *       `next=` (no POST to any checkout route, no Stripe URL); the
 *       card-required `/signup?plan=founder_starter` shows the review block
 *       above the Stripe card field with the submit "Add card & start 7-day
 *       trial"; signed in, the review's Pay button posts ONCE to
 *       `/api/stripe/checkout` — captured, the Stripe URL never opened;
 *   (b) `POST /api/stripe/checkout {plan:"founder_starter"}` as the QA
 *       founder → 200 + a `checkout.stripe.com` URL that is NEVER opened
 *       (an unpaid Checkout Session expires in 24 h; no customer id is
 *       written until the webhook sees a completed session, so (g) stays
 *       true); `interval:"annual"` on a rung without an annual price → 400
 *       `interval_unavailable`; a custom-priced tier → `contact_sales`;
 *   (c) evaluator: `/pricing?segment=evaluator` Scout CTA → the review for
 *       `investor_angel` (A$79, 7-day trial line); its sign-up link goes to
 *       `/signup?segment=evaluator&plan=investor_angel&trial=1&next=…`
 *       which renders the review block + card field; `/vi/pricing` links
 *       `/vi/checkout/review` and the VI review renders the VI strings;
 *   (d) credit packs: `/workspace/billing#credits` lists the five packs with
 *       the catalogue amounts and each Buy LINKS to `/checkout/review?pack=
 *       <credits>`; the review's Pay posts `{amount:<credits>}` to
 *       `/api/credits` — intercepted and aborted in the browser;
 *   (e) Startup Package: the `/startup-package` CTA carries the catalogue
 *       A$149 on the button AND the quote line and LINKS to the review for
 *       `founder_package`; the review's Pay posts `{plan:"founder_package"}`
 *       to `/api/stripe/checkout` — intercepted, aborted;
 *   (f) the Trusted Business Report quote (A$3 + unlock rail) is lane 21
 *       (`21-reports.spec.ts`) — referenced, not repeated;
 *   (g) `/api/stripe/portal` on an account without a Stripe customer → 404
 *       (never 500); `/workspace/billing` shows the no-subscription state;
 *   (j) G23-B: `/workspace/accelerator/pilot` on an account with no pilot
 *       order shows NO conversion card (or, if a paid order exists on this
 *       account, only the contact fallback — never a checkout control
 *       without a minted coupon); `POST /api/stripe/checkout` with
 *       `convert_from_pilot` for a random order → 404 (owner check before
 *       Stripe); `GET /api/admin/validation/<random>/proposal` anonymous →
 *       401 / 403 and as the QA founder → 403 (admin only).
 *
 * Amounts come from `config/pricing/stripe-price-catalogue.json` (the
 * read-only Stripe audit) — never typed here — so a re-price fails this lane
 * the same way it fails `stripe-map.test.ts`. Credits are snapshotted around
 * every step. LIVE_QA_SPEND_OK is never honoured by this file.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { anonRequest, evidence, fetchWithSwapRetry, post } from "./lib/api";
import catalogue from "../../src/config/pricing/stripe-price-catalogue.json";

type CatalogueRow = { plan_id: string; amount_cents: number; interval: string; active: boolean };
const PRICES = (catalogue as { prices: Record<string, CatalogueRow> }).prices;
const aud = (cents: number) => `A$${(cents / 100).toLocaleString("en-AU")}`;
/** The GST share of a GST-inclusive amount (1/11, rounded to the cent) as "A$2.64". */
const gstShare = (cents: number) => {
  const gst = Math.round(cents / 11);
  return `A$${(gst / 100).toLocaleString("en-AU", { minimumFractionDigits: gst % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
};

const STARTER_CENTS = PRICES.STRIPE_PRICE_FOUNDER_STARTER!.amount_cents; // 2900
const SCOUT_CENTS = PRICES.STRIPE_PRICE_INVESTOR_ANGEL!.amount_cents; // 7900
const PACKAGE_CENTS = PRICES.STRIPE_PRICE_STARTUP_PACKAGE!.amount_cents; // 14900
const CREDIT_PACK_CENTS: Record<number, number> = Object.fromEntries(
  [5, 10, 25, 50, 100].map((n) => [n, PRICES[`STRIPE_PRICE_CREDITS_${n}`]!.amount_cents]),
);
/** plans.trial_days for the founder + evaluator rungs (docs/ops/pricing-truth.md § 6, pinned by stripe-map.test.ts). */
const TRIAL_DAYS = 7;

/** Every browser-side route that mints a Stripe session — nothing may hit one before the Pay click. */
const CHECKOUT_ROUTES = ["**/api/stripe/checkout", "**/api/credits", "**/api/svi-api/checkout"] as const;

interface CapturedPost {
  path: string;
  body: unknown;
}

/**
 * Capture (and abort) every POST to a checkout route so the server never
 * mints a session and the browser can never reach Stripe. GETs (the
 * credits balance) pass through.
 */
async function interceptCheckoutRoutes(page: Page, posted: CapturedPost[]): Promise<void> {
  for (const pattern of CHECKOUT_ROUTES) {
    await page.route(pattern, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posted.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.abort("failed");
    });
  }
}

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

/** The review page's summary lines every order must show (EN). */
async function expectReviewSummary(page: Page, o: { name: string; cents: number; trialDays: number | null }) {
  const card = page.getByTestId("checkout-review");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("checkout-review-name")).toHaveText(o.name);
  await expect(page.getByTestId("checkout-review-price")).toContainText(`${aud(o.cents)} inc. GST`);
  await expect(page.getByTestId("gst-line")).toContainText(`includes ${gstShare(o.cents)} GST`);
  if (o.trialDays) {
    await expect(page.getByTestId("checkout-review-trial")).toContainText(`${o.trialDays}-day free trial · card required · you can cancel before day ${o.trialDays} and pay nothing`);
    await expect(page.getByTestId("checkout-review-renewal")).toContainText("Stripe Billing Portal");
  } else {
    await expect(page.getByTestId("checkout-review-trial")).toContainText("No trial on this item");
  }
  await expect(page.getByTestId("checkout-review-seller")).toContainText("ABN");
  await expect(page.getByTestId("checkout-review-data-principle")).toContainText("Your data belongs to your startup");
  // Exactly one primary control, and never a Stripe URL in the document.
  const primaries = await page.locator('[data-testid="checkout-review-pay"], [data-testid="checkout-review-continue"], [data-testid="checkout-review-contact"]').count();
  expect(primaries, "one primary control on the review").toBe(1);
  expect(page.url()).not.toMatch(/stripe\.com/);
}

test.describe("Purchase path — founder Starter (no spend)", () => {
  test("(a) /pricing Starter CTA → /checkout/review; signed out: full summary + sign-up LINK with next=, no checkout POST, no Stripe", async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await ctx.newPage();
      const posted: CapturedPost[] = [];
      await interceptCheckoutRoutes(page, posted);
      const res = await page.goto("/pricing", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const card = page.locator("#tier-starter");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText(`${aud(STARTER_CENTS)}`);
      await expect(card).toContainText(`${TRIAL_DAYS}-day free trial`);
      const href = await card.locator("a[href]").last().getAttribute("href");
      expect(href).toBe("/checkout/review?plan=founder_starter&trial=1&entry=pricing_card");

      // The click lands on the review — not on a card form, not on Stripe.
      await card.locator("a[href]").last().click();
      await page.waitForURL(/\/checkout\/review\?plan=founder_starter/, { timeout: 30_000 });
      await expectReviewSummary(page, { name: "Starter", cents: STARTER_CENTS, trialDays: TRIAL_DAYS });
      await expect(page.getByTestId("checkout-review")).toHaveAttribute("data-signed-in", "0");
      await expect(page.getByTestId("checkout-review-pay")).toHaveCount(0);
      const cont = page.getByTestId("checkout-review-continue");
      await expect(cont).toBeVisible();
      const contHref = await cont.getAttribute("href");
      expect(contHref).toBe(`/signup?plan=founder_starter&trial=1&next=${encodeURIComponent("/checkout/review?plan=founder_starter&trial=1&entry=pricing_card")}`);
      await expect(page.getByTestId("checkout-review-back")).toHaveAttribute("href", "/pricing");
      await evidence(testInfo, "Starter CTA → review (signed out)", { href, contHref, posted, url: page.url() });
      expect(posted, "no checkout route may be posted before the Pay click").toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("(a) /signup?plan=founder_starter: the review block sits above the Stripe card field and the submit says 'Add card & start 7-day trial'", async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await ctx.newPage();
      const posted: CapturedPost[] = [];
      await interceptCheckoutRoutes(page, posted);
      const res = await page.goto("/signup?plan=founder_starter", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`${TRIAL_DAYS}-day free trial`);
      // The plan picker preselects Starter at the plan-row price.
      const planSelect = page.locator("select", { has: page.locator("option[value=founder_starter]") });
      await expect(planSelect).toHaveValue("founder_starter", { timeout: 30_000 });
      const selected = await planSelect.locator("option[value=founder_starter]").innerText();
      expect(selected).toContain(`Starter — ${aud(STARTER_CENTS)}/mo`);
      // G25-D: the review block — name, price inc. GST + GST share, trial line, renewal, seller, data principle.
      const review = page.getByTestId("signup-review");
      await expect(review).toBeVisible();
      await expect(review).toHaveAttribute("data-plan-id", "founder_starter");
      await expect(review).toHaveAttribute("data-trial-days", String(TRIAL_DAYS));
      await expect(page.getByTestId("signup-review-price")).toContainText(`${aud(STARTER_CENTS)}/mo inc. GST`);
      await expect(review.getByTestId("gst-line")).toContainText(`includes ${gstShare(STARTER_CENTS)} GST`);
      await expect(page.getByTestId("signup-review-trial")).toContainText(`${TRIAL_DAYS}-day free trial · card required · you can cancel before day ${TRIAL_DAYS} and pay nothing · then ${aud(STARTER_CENTS)} per month`);
      await expect(page.getByTestId("signup-review-renewal")).toContainText("Stripe Billing Portal");
      await expect(page.getByTestId("signup-review-seller")).toContainText("ABN");
      await expect(page.getByTestId("signup-review-data-principle")).toContainText("Your data belongs to your startup");
      // The review block precedes the card field in the DOM.
      const order = await page.evaluate(() => {
        const r = document.querySelector('[data-testid="signup-review"]');
        const c = document.querySelector('[data-testid="signup-card-field"]');
        return r && c ? Boolean(r.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
      });
      expect(order, "review block renders above the card field").toBe(true);
      // Trial terms: "After 7 days, you'll pay A$29/mo for Starter. Cancel anytime."
      const terms = page.getByTestId("signup-trial-terms");
      await expect(terms).toBeVisible();
      const termsText = await terms.innerText();
      expect(termsText).toMatch(new RegExp(`After ${TRIAL_DAYS} days, you'll pay ${aud(STARTER_CENTS).replace(/[$.]/g, (c) => `\\${c}`)}/mo for (Founder )?Starter`));
      expect(termsText).toContain("Cancel anytime");
      const submit = page.getByRole("button", { name: `Add card & start ${TRIAL_DAYS}-day trial` });
      await expect(submit).toBeVisible();
      // Stripe Elements mounts its iframe inside the card wrapper (real key on production).
      const cardField = page.getByTestId("signup-card-field");
      await expect(cardField).toBeVisible();
      // Stripe Elements mounts a visible frame plus a hidden controller frame — ≥ 1.
      await expect.poll(async () => cardField.locator("iframe").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      await evidence(testInfo, "/signup?plan=founder_starter", { h1: await page.getByRole("heading", { level: 1 }).innerText(), selected, terms: termsText, submit: await submit.innerText(), cardIframes: await cardField.locator("iframe").count(), posted });
      expect(posted).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("(a) signed in: the review's Pay button posts ONCE to /api/stripe/checkout only on the click — captured, the Stripe URL never opened", async ({ page, visit, credits }, testInfo) => {
    const before = await credits.snapshot();
    const posted: CapturedPost[] = [];
    const responses: Array<{ status: number; body: CheckoutResponse | null }> = [];
    for (const pattern of CHECKOUT_ROUTES) {
      await page.route(pattern, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posted.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
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
    }
    await visit("/checkout/review?plan=founder_starter&trial=1&entry=billing");
    await expectReviewSummary(page, { name: "Starter", cents: STARTER_CENTS, trialDays: TRIAL_DAYS });
    await expect(page.getByTestId("checkout-review")).toHaveAttribute("data-signed-in", "1");
    const pay = page.getByTestId("checkout-review-pay");
    await expect(pay).toBeVisible();
    await expect(pay).toHaveText(new RegExp(`Add card & start ${TRIAL_DAYS}-day free trial`));
    await expect(pay).toHaveAttribute("data-post-path", "/api/stripe/checkout");
    // Rendering the review posts nothing.
    expect(posted).toEqual([]);
    await pay.click();
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1);
    expect(posted[0]).toEqual({ path: "/api/stripe/checkout", body: { plan: "founder_starter" } });
    await expect.poll(() => responses.length, { timeout: 30_000 }).toBe(1);
    const r = responses[0]!;
    await evidence(testInfo, "review Pay click (captured session)", { status: r.status, ok: r.body?.ok, host: r.body?.url ? new URL(r.body.url).host : null, posted });
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    expect(r.body?.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    // The dead-end answer surfaces as the inline error; the page never left the site.
    await expect(page.getByTestId("checkout-review-error")).toBeVisible({ timeout: 15_000 });
    expect(page.url()).not.toMatch(/stripe\.com/);
    // A second click after the failure is a fresh, single POST (no double-post while busy).
    expect(posted.length).toBe(1);
    await credits.assertUnchanged(before, "review Pay click (never opened)");
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
  test("(c) /pricing?segment=evaluator Scout CTA → review (A$79, 7-day line) → sign-up with segment + next= renders the review block + card field", async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await ctx.newPage();
      const posted: CapturedPost[] = [];
      await interceptCheckoutRoutes(page, posted);
      const res = await page.goto("/pricing?segment=evaluator", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const card = page.locator("#tier-scout");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText(aud(SCOUT_CENTS));
      const href = await card.locator("a[href]").last().getAttribute("href");
      expect(href).toBe("/checkout/review?plan=investor_angel&trial=1&entry=pricing_card");

      const review = await page.goto(href!, { waitUntil: "domcontentloaded" });
      expect(review?.status()).toBe(200);
      await expectReviewSummary(page, { name: "Scout", cents: SCOUT_CENTS, trialDays: TRIAL_DAYS });
      await expect(page.getByTestId("checkout-review-back")).toHaveAttribute("href", "/pricing?segment=evaluator");
      const cont = page.getByTestId("checkout-review-continue");
      const contHref = await cont.getAttribute("href");
      expect(contHref).toBe(`/signup?segment=evaluator&plan=investor_angel&trial=1&next=${encodeURIComponent(href!)}`);

      const signup = await page.goto(contHref!, { waitUntil: "domcontentloaded" });
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
      await expect(page.getByTestId("signup-review")).toHaveAttribute("data-plan-id", "investor_angel");
      await expect(page.getByTestId("signup-review-price")).toContainText(`${aud(SCOUT_CENTS)}/mo inc. GST`);
      const terms = await page.getByTestId("signup-trial-terms").innerText();
      expect(terms).toContain(`After ${TRIAL_DAYS} days, you'll pay ${aud(SCOUT_CENTS)}/mo for Scout`);
      await expect(page.getByRole("button", { name: `Add card & start ${TRIAL_DAYS}-day trial` })).toBeVisible();
      // "Sign in" keeps next= so an existing account returns to the review.
      const signIn = page.getByRole("link", { name: "Sign in" });
      expect(await signIn.getAttribute("href")).toBe(`/auth/login?next=${encodeURIComponent(href!)}`);
      const cardField = page.getByTestId("signup-card-field");
      // Stripe Elements mounts a visible frame plus a hidden controller frame — ≥ 1.
      await expect.poll(async () => cardField.locator("iframe").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      await evidence(testInfo, "Scout → review → signup", { href, contHref, trialText, selected, terms, cardIframes: await cardField.locator("iframe").count(), posted });
      expect(posted).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("(c) /vi/pricing Scout CTA → /vi/checkout/review renders the VI strings and links /vi/pricing back", async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await ctx.newPage();
      const posted: CapturedPost[] = [];
      await interceptCheckoutRoutes(page, posted);
      const res = await page.goto("/vi/pricing?segment=evaluator", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const card = page.locator("#tier-scout");
      await expect(card).toBeVisible({ timeout: 30_000 });
      const href = await card.locator("a[href]").last().getAttribute("href");
      expect(href).toBe("/vi/checkout/review?plan=investor_angel&trial=1&entry=pricing_card");
      const review = await page.goto(href!, { waitUntil: "domcontentloaded" });
      expect(review?.status()).toBe(200);
      const box = page.getByTestId("checkout-review");
      await expect(box).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("checkout-review-price")).toContainText(`${aud(SCOUT_CENTS)} inc. GST`);
      await expect(page.getByTestId("checkout-review-trial")).toContainText(`Dùng thử miễn phí ${TRIAL_DAYS} ngày · cần thẻ`);
      await expect(page.getByTestId("checkout-review-back")).toHaveAttribute("href", "/vi/pricing?segment=evaluator");
      await expect(page.getByTestId("checkout-review-continue")).toHaveText(/Tiếp tục đăng ký tài khoản/);
      await evidence(testInfo, "VI review", { href, text: (await box.innerText()).slice(0, 400), posted });
      expect(posted).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Purchase path — credit packs + Startup Package (review first, intercepted before Stripe)", () => {
  test("(d) /workspace/billing#credits lists the five packs at the catalogue amounts; each Buy LINKS to the review; the review's Pay posts {amount} to /api/credits", async ({ page, visit, credits }, testInfo) => {
    const before = await credits.snapshot();
    const posted: CapturedPost[] = [];
    await interceptCheckoutRoutes(page, posted);
    await visit("/workspace/billing#credits");
    const packs = page.getByTestId("credit-pack");
    await expect(packs).toHaveCount(5, { timeout: 30_000 });
    const seen: Array<{ pack: number; priceCents: number; label: string; href: string | null }> = [];
    for (let i = 0; i < 5; i++) {
      const el = packs.nth(i);
      const pack = Number(await el.getAttribute("data-pack"));
      const priceCents = Number(await el.getAttribute("data-price-cents"));
      const label = await el.innerText();
      const href = await el.getByTestId("credit-pack-buy").getAttribute("href");
      seen.push({ pack, priceCents, label: label.replace(/\s+/g, " ").trim(), href });
      expect(CREDIT_PACK_CENTS[pack], `pack ${pack} is not in the catalogue`).toBeDefined();
      expect(priceCents).toBe(CREDIT_PACK_CENTS[pack]);
      expect(label).toContain(`${aud(CREDIT_PACK_CENTS[pack]!)} inc. GST`);
      // G25-D: Buy is a link to the review step — nothing is posted from Billing.
      expect(href).toBe(`/checkout/review?pack=${pack}&entry=credits`);
    }
    expect(posted).toEqual([]);

    // Walk one pack through the review: Pay posts {amount} to /api/credits (aborted).
    await packs.nth(1).getByTestId("credit-pack-buy").click();
    await page.waitForURL(/\/checkout\/review\?pack=10/, { timeout: 30_000 });
    await expectReviewSummary(page, { name: "10 Credits", cents: CREDIT_PACK_CENTS[10]!, trialDays: null });
    await expect(page.getByTestId("checkout-review-renewal")).toContainText("Australian Consumer Law");
    const pay = page.getByTestId("checkout-review-pay");
    await expect(pay).toHaveText(`Pay ${aud(CREDIT_PACK_CENTS[10]!)} now`);
    await expect(pay).toHaveAttribute("data-post-path", "/api/credits");
    await pay.click();
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1);
    expect(posted[0]).toEqual({ path: "/api/credits", body: { amount: 10 } });
    await expect(pay).toBeEnabled({ timeout: 15_000 });
    await evidence(testInfo, "credit packs", { seen, posted });
    await credits.assertUnchanged(before, "credit-pack review Pay (aborted)");
  });

  test("(e) /startup-package CTA quotes the catalogue A$149 and LINKS to the review; the review's Pay posts founder_package (aborted before Stripe)", async ({ page, visit, credits }, testInfo) => {
    const before = await credits.snapshot();
    const posted: CapturedPost[] = [];
    await interceptCheckoutRoutes(page, posted);
    await visit("/startup-package");
    const cta = page.getByTestId("startup-package-checkout");
    await expect(cta).toBeVisible({ timeout: 30_000 });
    const label = await cta.innerText();
    const quote = await page.getByTestId("startup-package-quote").innerText();
    expect(label).toContain(aud(PACKAGE_CENTS));
    expect(quote).toContain(`${aud(PACKAGE_CENTS)} inc. GST`);
    expect(await cta.getAttribute("data-plan-id")).toBe("founder_package");
    expect(await cta.getAttribute("href")).toBe("/checkout/review?sku=founder_package&entry=startup_package");
    // Every other A$ on the page is the same figure (no stale price anywhere).
    const bodyText = await page.locator("main").first().innerText();
    const amounts = [...bodyText.matchAll(/A\$([\d,]+)/g)].map((m) => m[1]);
    for (const a of amounts) expect(`A$${a}`).toBe(aud(PACKAGE_CENTS));
    await cta.click();
    await page.waitForURL(/\/checkout\/review\?sku=founder_package/, { timeout: 30_000 });
    expect(posted).toEqual([]);
    await expectReviewSummary(page, { name: "Startup Package", cents: PACKAGE_CENTS, trialDays: null });
    await expect(page.getByTestId("checkout-review-included")).toContainText("25 credits included");
    const pay = page.getByTestId("checkout-review-pay");
    await expect(pay).toHaveText(`Pay ${aud(PACKAGE_CENTS)} now`);
    await pay.click();
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1);
    expect(posted[0]).toEqual({ path: "/api/stripe/checkout", body: { plan: "founder_package" } });
    await evidence(testInfo, "Startup Package CTA → review", { label, quote, amounts, posted });
    await credits.assertUnchanged(before, "Startup Package review Pay (aborted)");
  });

  test("(e) upgrade surfaces are links to the review, never a POST: Billing Upgrade, Index API 'Upgrade to Team'", async ({ page, visit }, testInfo) => {
    const posted: CapturedPost[] = [];
    await interceptCheckoutRoutes(page, posted);
    await visit("/workspace/billing");
    const upgrades = page.getByTestId("billing-upgrade");
    const n = await upgrades.count();
    const hrefs: string[] = [];
    for (let i = 0; i < n; i++) {
      const href = await upgrades.nth(i).getAttribute("href");
      const planId = await upgrades.nth(i).getAttribute("data-plan-id");
      hrefs.push(href ?? "");
      expect(href).toBe(`/checkout/review?plan=${planId}&trial=1&entry=billing`);
    }
    await visit("/workspace/settings/enterprise");
    const team = page.getByTestId("svi-api-upgrade-team");
    const teamHref = (await team.count()) ? await team.getAttribute("href") : null;
    if (teamHref !== null) expect(teamHref).toBe("/checkout/review?sku=svi_api_team&entry=svi_api");
    await evidence(testInfo, "upgrade links", { billing: hrefs, teamHref, posted });
    expect(posted).toEqual([]);
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

// ---------------------------------------------------------------------------
// G23-B — pilot → annual conversion + the admin proposal route (never paid)
// ---------------------------------------------------------------------------

test.describe("Purchase path — pilot conversion + proposal route (G23-B, no spend)", () => {
  test("(j) no pilot order → no conversion card (or contact fallback only); convert_from_pilot for a random order → 404; proposal route 401/403", async ({ api, page, visit, credits, qa }, testInfo) => {
    const before = await credits.snapshot();
    await visit("/workspace/accelerator/pilot");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pilot delivery kit", { timeout: 30_000 });
    const card = page.getByTestId("pilot-convert-card");
    const cards = await card.count();
    let mode: string | null = null;
    if (cards > 0) {
      mode = await card.getAttribute("data-convert-mode");
      // A card can only exist for an account that paid for a pilot; this
      // account never does, but if one is seeded it must not offer a
      // checkout without the founder-minted coupon.
      expect(["contact", "converted", "closed"]).toContain(mode);
      if (mode === "contact") expect(await page.getByTestId("pilot-convert-contact").getAttribute("href")).toBe("/contact?topic=pilot");
      expect(await page.getByTestId("pilot-convert-checkout").count()).toBe(0);
    }

    // The owner check runs before Stripe: a random order id is 404, never 500.
    const convert = await post<CheckoutResponse>(api, "/api/stripe/checkout", { plan: "accelerator_starter", interval: "annual", convert_from_pilot: "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b" });
    expect([400, 404]).toContain(convert.status);
    expect(convert.body.ok).toBe(false);

    const anon = await anonRequest(qa.baseURL);
    try {
      const proposalAnon = await fetchWithSwapRetry(anon, "GET", "/api/admin/validation/3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b/proposal");
      expect([401, 403]).toContain(proposalAnon.status());
      const proposalUser = await fetchWithSwapRetry(api, "GET", "/api/admin/validation/3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b/proposal");
      expect(proposalUser.status()).toBe(403);
      await evidence(testInfo, "pilot conversion + proposal gate", { cards, mode, convert: { status: convert.status, error: convert.body.error }, proposalAnon: proposalAnon.status(), proposalUser: proposalUser.status() });
    } finally {
      await anon.dispose();
    }
    await credits.assertUnchanged(before, "pilot conversion card (never paid)");
  });
});
