/**
 * 35 — Positioning + trust lane (G21 P0, 2026-09-20):
 *
 *   • ANONYMOUS `/` renders the evidence-backed hero H1, the two CTAs
 *     (Start a cohort → the Cohort 25 annual trial sign-up (G25), Score my
 *     startup → /analyze), the trust line, the section order problem → sequence →
 *     messages → why-not-chatgpt → built-for → trust → cta, and no "A$"
 *     figure or agent count anywhere in <main> (G17 D3 + G21 § 0);
 *   • the top nav carries exactly the seven G21 items in order and the
 *     primary nav CTA is Start a cohort;
 *   • the TrustBand (operating entity · ACN/ABN · methodology version) is on
 *     `/`, `/product`, `/pricing`, `/methodology`, `/solutions/accelerator`,
 *     `/solutions/investor` and `/solutions/founder`, and names the
 *     same operator + ABN on every one of them (one legal identity);
 *   • `/methodology/governance` answers 200 with the governance H1 and the
 *     human-in-the-loop line; `/solutions/accelerator#cohort` shows the
 *     Cohort offer (inclusions + metrics) and `#plans` the two rungs with
 *     the catalogue's annual prices — never a pilot card or a pilot price;
 *   • `og:image:alt` and the site description carry the FI hero, not the
 *     legacy "60 seconds" line.
 *
 * Read-only: every request is an anonymous GET. Nothing touches the QA
 * account, nothing is bought (the Cohort trial path is lane 34).
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { evidence } from "./lib/api";

const HERO_H1 = "Screen every startup on the same evidence-backed framework.";
const NAV = ["Product", "For Programs", "For Investors", "For Founders", "Methodology", "Startup Index", "Pricing"] as const;
const TRUST_PAGES = ["/", "/product", "/pricing", "/methodology", "/solutions/accelerator", "/solutions/investor", "/solutions/founder"] as const;
const START_COHORT_HREF = "/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual";
const OPERATOR = "Auschain PTY LTD";
const ABN = "ABN 79 659 615 111";

async function mainText(page: Page): Promise<string> {
  return (await page.locator("main").innerText()).replace(/\s+/g, " ");
}

test.describe("G21 P0 — home positioning", () => {
  test("hero H1, two CTAs, trust line, section order, no price / agent count in <main>", async ({ page, qa }, testInfo) => {
    const res = await page.goto(`${qa.baseURL}/`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HERO_H1);
    const primary = page.locator(`main a[href="${START_COHORT_HREF}"]`).first();
    const secondary = page.locator('main a[href="/analyze"]').first();
    await expect(primary).toContainText("Start a cohort");
    await expect(secondary).toContainText("Score my startup");
    const text = await mainText(page);
    expect(text).toContain("Australian-built · Evidence-backed · Founder-controlled data");
    const ids = await page.locator("main section[id]").evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(["problem", "sequence", "messages", "why-not-chatgpt", "built-for", "trust", "cta"]);
    expect(text).not.toMatch(/A\$\s?\d/);
    expect(text).not.toMatch(/pilot/i);
    expect(text).not.toMatch(/\b\d+\s+(AI\s+)?(C-Level\s+)?agents\b/i);
    expect(text).toContain("Screen faster");
    expect(text).toContain("Trust the evidence");
    expect(text).toContain("Track improvement");
    await evidence(testInfo, "home", { ids, h1: HERO_H1 });
  });

  test("top nav = the seven G21 items in order; primary nav CTA is Start a cohort (signed out)", async ({ browser, qa }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto(`${qa.baseURL}/`, { waitUntil: "domcontentloaded" });
    const header = page.locator("header").first();
    const labels = await header.locator("nav a").evaluateAll((as) => as.map((a) => (a.textContent ?? "").trim()));
    for (const item of NAV) expect(labels, `nav item ${item}`).toContain(item);
    const order = NAV.map((n) => labels.indexOf(n));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(header.locator(`a[href="${START_COHORT_HREF}"]`).first()).toContainText("Start a cohort");
    expect(labels.join(" ")).not.toMatch(/pilot/i);
    await ctx.close();
  });

  test("og:image:alt and description carry the FI hero, not the legacy 60-seconds line", async ({ page, qa }, testInfo) => {
    await page.goto(`${qa.baseURL}/`, { waitUntil: "domcontentloaded" });
    const ogAlt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    await evidence(testInfo, "home-meta", { ogAlt, description });
    expect(ogAlt ?? "").toContain("Screen every startup on the same evidence-backed framework");
    expect(description ?? "").toContain("evidence");
    expect(`${ogAlt} ${description}`).not.toMatch(/60 seconds/);
  });
});

test.describe("G21 P0 — one legal identity", () => {
  for (const path of TRUST_PAGES) {
    test(`${path} carries the TrustBand with the operator, ABN and methodology version`, async ({ page, qa }, testInfo) => {
      const res = await page.goto(`${qa.baseURL}${path}`, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const band = page.getByTestId("trust-band");
      await expect(band).toHaveCount(1);
      const text = (await band.innerText()).replace(/\s+/g, " ");
      await evidence(testInfo, `trust-band${path.replace(/\//g, "_")}`, { text: text.slice(0, 400) });
      expect(text).toContain(OPERATOR);
      expect(text).toContain(ABN);
      expect(text).toMatch(/Startup Value Index v\d+\.\d+\.\d+/);
    });
  }

  test("the footer entity line names the same operator + ABN as the trust band", async ({ page, qa }) => {
    await page.goto(`${qa.baseURL}/`, { waitUntil: "domcontentloaded" });
    const footer = (await page.locator("footer").first().innerText()).replace(/\s+/g, " ");
    expect(footer).toContain(OPERATOR);
    expect(footer).toContain(ABN);
  });
});

test.describe("G21 P0 — trust documents + the Cohort offer (G25)", () => {
  test("/methodology/governance → 200, governance H1, human-in-the-loop line", async ({ page, qa }) => {
    const res = await page.goto(`${qa.baseURL}/methodology/governance`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/governance/i);
    const text = await mainText(page);
    expect(text).toMatch(/Humans make the decision/);
  });

  test("/solutions/accelerator shows the Cohort offer (#cohort) and the two rungs (#plans) with the catalogue's annual prices — no pilot block, no pilot price", async ({ page, qa }, testInfo) => {
    const res = await page.goto(`${qa.baseURL}/solutions/accelerator`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.locator("#cohort")).toHaveCount(1);
    await expect(page.locator("#plans")).toHaveCount(1);
    await expect(page.locator("#pilot")).toHaveCount(0);
    await expect(page.getByTestId("cohort-offer-includes").locator("li")).toHaveCount(8);
    await expect(page.getByTestId("cohort-offer-metrics").locator("li")).toHaveCount(6);
    const text = await mainText(page);
    await evidence(testInfo, "accelerator-cohort", { hasOffer: text.includes("What a Cohort plan delivers") });
    expect(text).toContain("What a Cohort plan delivers");
    expect(text).toContain("Start a cohort");
    expect(text).toMatch(/A\$5,000 a year/);
    expect(text).toMatch(/A\$15,000 a year/);
    expect(text).not.toMatch(/A\$1,500|A\$2,500/);
    expect(text).not.toMatch(/pilot/i);
    expect(text).toMatch(/Humans make the decision/);
    await expect(page.locator(`main a[href="${START_COHORT_HREF}"]`).first()).toBeVisible();
  });
});
