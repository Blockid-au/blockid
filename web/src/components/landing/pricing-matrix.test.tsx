// Colocated render test for <PricingMatrix /> (G11 T0247 — Founder Radar
// bundled into Starter). renderToStaticMarkup, like the segment-switch
// suite: what a crawler and the first paint see.
//
// Pins:
//   1. Starter keeps its label, gains the "Founder Radar" chip and the
//      approved Radar feature line; no other founder card carries the chip.
//   2. Free names the Money Finder preview + the A$3 Trusted Business Report.
//   3. Growth's Radar extras are live (T0251) — no "(coming)" left.
//   4. Every Evaluator card says "Money Finder & Progress Radar included".

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingMatrix, defaultIntervalForSegment, effectiveCardInterval } from "./pricing-matrix";
import {
  EVALUATOR_RADAR_LINE,
  FOUNDER_RADAR_BADGE,
  FOUNDER_RADAR_FEATURE_LINE,
  publicPlansForSegment,
} from "@/lib/plans-v2";

const esc = (s: string) => s.replace(/&/g, "&amp;");

describe("<PricingMatrix segment='founder' /> — Founder Radar in Starter (T0247)", () => {
  const out = renderToStaticMarkup(<PricingMatrix segment="founder" />);

  it("keeps the Starter label and shows the Founder Radar chip on that card only", () => {
    expect(out).toContain('aria-label="Starter plan"');
    expect(out).not.toContain('aria-label="Founder Radar plan"');
    const badges = out.match(/data-testid="plan-badge"/g) ?? [];
    expect(badges).toHaveLength(1);
    // The chip sits inside the Starter article, before the Growth one.
    const starter = out.indexOf('id="tier-starter"');
    const growth = out.indexOf('id="tier-growth"');
    const badge = out.indexOf('data-testid="plan-badge"');
    expect(starter).toBeGreaterThan(-1);
    expect(badge).toBeGreaterThan(starter);
    expect(badge).toBeLessThan(growth);
    expect(out).toContain(`>${FOUNDER_RADAR_BADGE}</span>`);
  });

  it("lists the approved Radar line on Starter", () => {
    expect(out).toContain(esc(FOUNDER_RADAR_FEATURE_LINE));
    const starter = out.indexOf('id="tier-starter"');
    const growth = out.indexOf('id="tier-growth"');
    const line = out.indexOf(esc(FOUNDER_RADAR_FEATURE_LINE));
    expect(line).toBeGreaterThan(starter);
    expect(line).toBeLessThan(growth);
  });

  it("Free row says Money Finder preview + Trusted Business Report A$3 pay-as-you-go", () => {
    expect(out).toContain("Money Finder preview");
    expect(out).toContain("Trusted Business Report A$3 pay-as-you-go");
  });

  it("Growth lists investor matching / unlimited drafts / quarterly expert update (live since T0251)", () => {
    expect(out).toContain("+ investor matching, unlimited application drafts, quarterly expert update");
    expect(out).not.toContain("(coming)");
  });

  it("does not put the evaluator Radar line on founder cards", () => {
    expect(out).not.toContain(esc(EVALUATOR_RADAR_LINE));
  });
});

describe("<PricingMatrix segment='investor' /> — Evaluator cards (T0247)", () => {
  const out = renderToStaticMarkup(<PricingMatrix segment="investor" />);

  it("adds 'Money Finder & Progress Radar included' to Scout, Firm, Program and Fund", () => {
    const hits = out.match(new RegExp(esc(EVALUATOR_RADAR_LINE).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [];
    expect(hits).toHaveLength(publicPlansForSegment("investor").length);
    expect(hits).toHaveLength(4);
  });

  // Pricing v4 (2026-09-16): four evaluator cards → a four-column grid at lg.
  it("renders four cards on a lg:grid-cols-4 grid, Fund last with #tier-fund", () => {
    expect(out).toContain("lg:grid-cols-4");
    expect(out).toContain('id="tier-fund"');
    expect(out).toContain('aria-label="Fund plan"');
    expect(out).toContain("A$999");
    expect(out).toContain("/checkout/review?plan=investor_fund&amp;trial=1&amp;entry=pricing_card");
    expect(out).not.toMatch(/affinity|slack|airtable/i);
  });

  it("carries no Founder Radar chip — the bundle is a Starter thing", () => {
    expect(out).not.toContain('data-testid="plan-badge"');
  });
});

// 2026-09-16 pricing audit: the Annual toggle showed A$290/yr for Starter
// while no annual Stripe Price existed and every CTA dropped the interval —
// signup billed A$29/mo. The card now (a) only shows a yearly figure for
// rungs on the server's annual-provisioned list and (b) carries
// `interval=annual` on its CTA so the charge matches the card.
describe("effectiveCardInterval — Annual toggle honesty gate", () => {
  it("monthly toggle is always monthly", () => {
    expect(effectiveCardInterval("monthly", "investor_angel", ["investor_angel"])).toBe("monthly");
    expect(effectiveCardInterval("monthly", "investor_angel", undefined)).toBe("monthly");
  });
  it("annual only for rungs on the provisioned list; no list = legacy 'all'", () => {
    expect(effectiveCardInterval("annual", "investor_angel", ["investor_angel"])).toBe("annual");
    expect(effectiveCardInterval("annual", "founder_starter", ["investor_angel"])).toBe("monthly");
    expect(effectiveCardInterval("annual", "founder_starter", [])).toBe("monthly");
    expect(effectiveCardInterval("annual", "founder_starter", undefined)).toBe("annual");
  });
});

describe("<PricingMatrix /> CTA hrefs under the default (monthly) toggle", () => {
  it("never carry interval=annual, and every CTA lands on the review step (G25-D)", () => {
    const out = renderToStaticMarkup(<PricingMatrix segment="investor" annualAvailable={[]} />);
    expect(out).not.toContain("interval=annual");
    expect(out).toContain("/checkout/review?plan=investor_angel&amp;trial=1&amp;entry=pricing_card");
    expect(out).not.toContain("/signup?");
    expect(out).not.toContain("stripe.com");
  });
});

// Pricing v4 (2026-09-16, plan §3.2): the Programs ladder is annual-first.
describe("defaultIntervalForSegment + <PricingMatrix segment='accelerator' /> — Programs ladder", () => {
  it("only the Programs ladder defaults to Annual (every public card carries billing_default: 'annual')", () => {
    expect(defaultIntervalForSegment("accelerator")).toBe("annual");
    expect(defaultIntervalForSegment("investor")).toBe("monthly");
    expect(defaultIntervalForSegment("founder")).toBe("monthly");
    expect(defaultIntervalForSegment("advisor")).toBe("monthly");
  });

  it("renders Intake link / Cohort 25 / Cohort 100 as three trial cards, billed annually, with 14-day trials", () => {
    const out = renderToStaticMarkup(<PricingMatrix segment="accelerator" />);
    expect(out).toContain('data-testid="programs-ladder"');
    expect(out).toContain("lg:grid-cols-3");
    expect(out).toContain('aria-label="Intake link plan"');
    expect(out).toContain('aria-label="Cohort 25 plan"');
    expect(out).toContain('aria-label="Cohort 100 plan"');
    expect(out).not.toContain('aria-label="Cohort Enterprise plan"');
    expect(out).toContain('id="tier-intake"');
    expect(out).toContain('id="tier-cohort-25"');
    expect(out).toContain('id="tier-cohort-100"');
    // Annual-first: yearly figures + interval=annual on every CTA, 14-day trial.
    expect(out).toContain("A$2,490");
    expect(out).toContain("A$5,000");
    expect(out).toContain("A$15,000");
    expect(out).toContain("Billed annually");
    expect(out).toContain("/checkout/review?plan=accelerator_intake&amp;trial=1&amp;entry=pricing_card&amp;interval=annual");
    expect(out).toContain("/checkout/review?plan=accelerator_starter&amp;trial=1&amp;entry=pricing_card&amp;interval=annual");
    expect(out).toContain("Start 14-day free trial");
    expect(out).not.toContain("/contact?plan=accelerator_");
    // Old copy must not resurface.
    expect(out).not.toMatch(/Demo Day kit|mentor pool|5,000 AI credits/);
  });

  it("with no annual Stripe Price provisioned the Programs cards fall back to monthly figures", () => {
    const out = renderToStaticMarkup(<PricingMatrix segment="accelerator" annualAvailable={[]} />);
    expect(out).not.toContain("interval=annual");
    expect(out).toContain("A$249");
    expect(out).toContain("A$500");
    expect(out).toContain("Billed monthly");
  });
});

describe("purchasable gate (W4 review P1)", () => {
  it("a trial-CTA plan without a Stripe price renders Contact sales; with `purchasable` undefined the catalogue CTA stands", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PricingMatrix } = await import("./pricing-matrix");
    const gated = renderToStaticMarkup(<PricingMatrix segment="investor" purchasable={["investor_angel", "investor_advisor", "investor_vc_small"]} />);
    expect(gated).toContain("/contact?plan=investor_fund");
    expect(gated).not.toContain("plan=investor_fund&trial=1");
    const open = renderToStaticMarkup(<PricingMatrix segment="investor" />);
    expect(open).toContain("plan=investor_fund");
    expect(open).not.toContain("/contact?plan=investor_fund");
  });
});
