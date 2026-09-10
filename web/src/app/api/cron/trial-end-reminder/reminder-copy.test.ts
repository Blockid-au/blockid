// Colocated vitest for the T-3d trial reminder copy (T0269 / G12-6).
//
// The previous body said "Add a payment method now … your workspace will
// downgrade to the free plan automatically — no charge", which contradicts a
// card-required trial (the card is already on file and WILL be charged on
// day 8). This suite pins the corrected contract:
//   * body names the charge: "your card will be charged A$X on <date>"
//   * footnote tells the user how to avoid it: "cancel any time before <date>"
//   * the stale phrases never come back
//   * evaluator rungs show Scout / Firm / Program; founder plans keep the row name
//   * plan lookup degrades gracefully (missing row / throw → no price, no crash)
//   * HTML-escapes user-controlled name

import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlanCached = vi.hoisted(() => vi.fn());
vi.mock("@/lib/plans-db", () => ({ getPlanCached }));

import { renderReminder, reminderSubject, resolvePlanDisplay } from "./reminder-copy";

const STALE = [/add a payment method/i, /downgrade to the free plan/i, /no charge/i];

describe("renderReminder — card-required wording", () => {
  it("names the charge amount + date and the cancel-before path", () => {
    const html = renderReminder({
      name: "Eva",
      trialEndFmt: "Friday 18 Sep",
      planName: "Scout",
      price: "A$79",
    });
    expect(html).toContain("Hi Eva,");
    expect(html).toContain(
      "Your BlockID Scout trial ends in 3 days. Your card will be charged A$79 on Friday 18 Sep unless you cancel before then.",
    );
    expect(html).toContain("Cancel any time before Friday 18 Sep from Billing and nothing will be charged.");
    expect(html).toContain("https://blockid.au/workspace/billing");
    for (const re of STALE) expect(html).not.toMatch(re);
  });

  it("omits the amount (but keeps the charge + date) when the price is unknown", () => {
    const html = renderReminder({
      name: "there",
      trialEndFmt: "Monday 21 Sep",
      planName: "your plan",
      price: null,
    });
    expect(html).toContain("Your card will be charged on Monday 21 Sep unless you cancel before then.");
    expect(html).not.toContain("A$");
    for (const re of STALE) expect(html).not.toMatch(re);
  });

  it("HTML-escapes the display name", () => {
    const html = renderReminder({
      name: "<script>alert(1)</script>",
      trialEndFmt: "Friday 18 Sep",
      planName: "Starter",
      price: "A$29",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("reminderSubject", () => {
  it("names the charge when the price is known", () => {
    expect(reminderSubject({ name: "Scout", price: "A$79" }, "Friday 18 Sep")).toBe(
      "Your BlockID trial ends in 3 days — your card will be charged A$79 on Friday 18 Sep",
    );
  });
  it("falls back to the plain subject without a price", () => {
    expect(reminderSubject({ name: "x", price: null }, "Friday")).toBe(
      "Your BlockID trial ends in 3 days",
    );
  });
});

describe("resolvePlanDisplay", () => {
  beforeEach(() => {
    getPlanCached.mockReset();
  });

  it.each([
    ["investor_angel", "Angel", 7900, "Scout", "A$79"],
    ["investor_advisor", "Advisor", 14900, "Firm", "A$149"],
    ["investor_vc_small", "VC Small (5-seat min)", 34900, "Program", "A$349"],
  ])("%s → public label %s with price", async (id, rowName, cents, label, price) => {
    getPlanCached.mockResolvedValue({ id, name: rowName, price_aud_cents: cents });
    expect(await resolvePlanDisplay(id)).toEqual({ name: label, price });
  });

  it("founder plans keep the row name", async () => {
    getPlanCached.mockResolvedValue({ id: "founder_starter", name: "Starter", price_aud_cents: 2900 });
    expect(await resolvePlanDisplay("founder_starter")).toEqual({ name: "Starter", price: "A$29" });
  });

  it("missing row → id (or public label) with no price", async () => {
    getPlanCached.mockResolvedValue(null);
    expect(await resolvePlanDisplay("founder_growth")).toEqual({ name: "founder_growth", price: null });
    expect(await resolvePlanDisplay("investor_angel")).toEqual({ name: "Scout", price: null });
  });

  it("null plan id → 'your plan' without hitting the DB", async () => {
    expect(await resolvePlanDisplay(null)).toEqual({ name: "your plan", price: null });
    expect(getPlanCached).not.toHaveBeenCalled();
  });

  it("swallows lookup errors", async () => {
    getPlanCached.mockRejectedValue(new Error("db down"));
    expect(await resolvePlanDisplay("investor_advisor")).toEqual({ name: "Firm", price: null });
  });

  it("zero / non-numeric price → null price", async () => {
    getPlanCached.mockResolvedValue({ id: "investor_vc_ent", name: "VC Enterprise", price_aud_cents: null });
    expect(await resolvePlanDisplay("investor_vc_ent")).toEqual({ name: "VC Enterprise", price: null });
  });
});
