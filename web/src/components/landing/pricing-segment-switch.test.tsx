// Colocated tests for the Founder | Evaluator switch on /pricing (G12,
// T0268). Uses renderToStaticMarkup (this workspace has no
// @testing-library/react) so the assertions are on the SSR markup each tab
// produces — which is exactly what a crawler and a first paint see.

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PricingSegmentSwitch,
  TAB_TO_SEGMENT,
  resolvePricingTab,
  tabFromLocation,
} from "./pricing-segment-switch";
import { evaluatorSignupHref } from "./pricing-matrix";

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("resolvePricingTab()", () => {
  it("defaults to founder for nothing / unknown values", () => {
    expect(resolvePricingTab(undefined)).toBe("founder");
    expect(resolvePricingTab(null)).toBe("founder");
    expect(resolvePricingTab("")).toBe("founder");
    expect(resolvePricingTab("founder")).toBe("founder");
    expect(resolvePricingTab("banana")).toBe("founder");
  });

  it("lands every investor-shaped value on the Evaluator tab and every program-shaped value on Programs", () => {
    for (const v of ["evaluator", "Evaluator", "investor", "advisor", "fund", "vc"]) {
      expect(resolvePricingTab(v), v).toBe("evaluator");
    }
    for (const v of ["accelerator", "program", "programs", "incubator", "university"]) {
      expect(resolvePricingTab(v), v).toBe("programs");
    }
  });

  it("reads the first value of a repeated query param", () => {
    expect(resolvePricingTab(["evaluator", "founder"])).toBe("evaluator");
    expect(resolvePricingTab(["founder", "evaluator"])).toBe("founder");
  });

  it("maps the three tabs onto the plans-v2 segments", () => {
    expect(TAB_TO_SEGMENT.founder).toBe("founder");
    expect(TAB_TO_SEGMENT.evaluator).toBe("investor");
    expect(TAB_TO_SEGMENT.programs).toBe("accelerator");
  });
});

describe("tabFromLocation() — deep-link params", () => {
  // vitest runs in node: stub `window.location.search` per case.
  function withSearch(search: string): ReturnType<typeof tabFromLocation> {
    (globalThis as { window?: unknown }).window = { location: { search } };
    return tabFromLocation();
  }
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("returns null on the server (no window) and when no param is present", () => {
    expect(tabFromLocation()).toBeNull();
    expect(withSearch("")).toBeNull();
    expect(withSearch("?utm_source=deck")).toBeNull();
  });

  it("accepts `?persona=` as an alias of `?segment=` (deck v3 links, G14 §2.4)", () => {
    expect(withSearch("?persona=investor")).toBe("evaluator");
    expect(withSearch("?persona=founder")).toBe("founder");
    expect(withSearch("?persona=accelerator")).toBe("programs");
    expect(withSearch("?segment=evaluator")).toBe("evaluator");
    expect(withSearch("?segment=programs")).toBe("programs");
    expect(withSearch("?tab=investor")).toBe("evaluator");
    expect(withSearch("?tier=accelerator")).toBe("programs");
  });

  it("prefers segment over persona over tab over tier", () => {
    expect(withSearch("?persona=investor&segment=founder")).toBe("founder");
    expect(withSearch("?tab=investor&persona=founder")).toBe("founder");
  });
});

describe("<PricingSegmentSwitch /> — Founder tab", () => {
  const out = html(<PricingSegmentSwitch />);

  it("renders exactly three tabs (Founder / Evaluator / Programs), Founder selected", () => {
    expect(out.match(/role="tab"/g)).toHaveLength(3);
    expect(out).toContain('id="pricing-tab-founder"');
    expect(out).toContain('id="pricing-tab-evaluator"');
    expect(out).toContain('id="pricing-tab-programs"');
    expect(out).toMatch(/id="pricing-tab-founder"[^>]*aria-selected="true"/);
    expect(out).toMatch(/id="pricing-tab-evaluator"[^>]*aria-selected="false"/);
    expect(out).toMatch(/id="pricing-tab-programs"[^>]*aria-selected="false"/);
    expect(out).toContain('data-active-tab="founder"');
  });

  it("renders the Founder ladder (Free / Starter / Growth) with founder CTAs", () => {
    expect(out).toContain('data-testid="founder-ladder"');
    expect(out).toContain('id="tier-free"');
    expect(out).toContain('id="tier-starter"');
    expect(out).toContain('id="tier-growth"');
    expect(out).toContain("/onboarding?trial=1&amp;plan=founder_growth");
    expect(out).not.toContain("segment=evaluator");
    expect(out).not.toContain('id="tier-scout"');
    expect(out).not.toContain('data-testid="evaluator-payg"');
  });
});

describe("<PricingSegmentSwitch /> — Evaluator tab (deep link)", () => {
  const out = html(<PricingSegmentSwitch initialSegment="evaluator" />);

  it("selects the Evaluator tab from the initialSegment prop", () => {
    expect(out).toMatch(/id="pricing-tab-evaluator"[^>]*aria-selected="true"/);
    expect(out).toContain('data-active-tab="evaluator"');
  });

  it("renders Scout A$79 · Firm A$149 · Program A$349 · Fund A$999 and nothing else", () => {
    expect(out).toContain('data-testid="evaluator-ladder"');
    expect(out).toContain('id="tier-scout"');
    expect(out).toContain('id="tier-firm"');
    expect(out).toContain('id="tier-program"');
    expect(out).toContain('id="tier-fund"');
    expect(out).toContain('aria-label="Scout plan"');
    expect(out).toContain('aria-label="Firm plan"');
    expect(out).toContain('aria-label="Program plan"');
    expect(out).toContain('aria-label="Fund plan"');
    expect(out).toContain("A$79");
    expect(out).toContain("A$149");
    expect(out).toContain("A$349");
    expect(out).toContain("A$999");
    expect(out).not.toContain('aria-label="VC Enterprise plan"');
    expect(out).not.toContain('aria-label="Index API plan"');
    expect(out).not.toContain('id="tier-free"');
    expect(out).not.toContain('id="tier-growth"');
    // The retired labels must never resurface.
    expect(out).not.toContain('aria-label="Angel plan"');
    expect(out).not.toContain('aria-label="VC Small plan"');
  });

  it("routes every rung to /signup?segment=evaluator&plan=<id>&trial=1 as a 7-day card-required trial", () => {
    for (const id of ["investor_angel", "investor_advisor", "investor_vc_small", "investor_fund"]) {
      expect(evaluatorSignupHref(id)).toBe(`/signup?segment=evaluator&plan=${id}&trial=1`);
      expect(out).toContain(evaluatorSignupHref(id).replace(/&/g, "&amp;"));
    }
    expect(out).toContain("Start 7-day free trial");
    expect(out).toContain("card required · cancel anytime");
    expect(out).not.toContain("/contact?plan=investor_");
  });

  it("release QA-2 F10 / S7-C: every evaluator card says the trial includes 1 full report, then the monthly quota", () => {
    expect(out).toContain("1 full Trusted Business Report included during the trial, then 10/month on Scout");
    expect(out).toContain("1 full Trusted Business Report included during the trial, then 30/month on Firm");
    expect(out).toContain("1 full Trusted Business Report included during the trial, then 100/month on Program");
    expect(out).toContain("1 full Trusted Business Report included during the trial, then unlimited on Fund");
    expect(out.match(/data-testid="evaluator-trial-included"/g)?.length).toBe(4);
  });

  it("shows the A$3 pay-as-you-go Trusted Business Report line", () => {
    expect(out).toContain('data-testid="evaluator-payg"');
    expect(out).toContain("A$3 per startup");
    expect(out).toContain("Trusted Business Report");
  });

  it("does not carry the retired 'Beta pricing' badge", () => {
    expect(out).not.toContain("Beta pricing");
  });
});

// Pricing v4 (2026-09-16): third tab — the annual-first Programs ladder.
describe("<PricingSegmentSwitch /> — Programs tab (deep link)", () => {
  const out = html(<PricingSegmentSwitch initialSegment="programs" />);

  it("selects the Programs tab and renders Intake link / Cohort 25 / Cohort 100, annual by default, 14-day trial", () => {
    expect(out).toMatch(/id="pricing-tab-programs"[^>]*aria-selected="true"/);
    expect(out).toContain('data-active-tab="programs"');
    expect(out).toContain('data-testid="programs-ladder"');
    expect(out).toContain('aria-label="Intake link plan"');
    expect(out).toContain('aria-label="Cohort 25 plan"');
    expect(out).toContain('aria-label="Cohort 100 plan"');
    expect(out).toContain("A$2,490");
    expect(out).toContain("A$15,000");
    expect(out).toContain("Start 14-day free trial");
    expect(out).toContain("/signup?segment=evaluator&amp;plan=accelerator_starter&amp;trial=1&amp;interval=annual");
    expect(out).not.toContain('id="tier-scout"');
    expect(out).not.toContain('id="tier-free"');
    expect(out).not.toContain('aria-label="Cohort Enterprise plan"');
  });
});

describe("<PricingSegmentSwitch /> — localised labels", () => {
  it("accepts label overrides for the /vi page without changing the ladder", () => {
    const out = html(
      <PricingSegmentSwitch
        initialSegment="evaluator"
        labels={{
          founder: { label: "Nhà sáng lập", sub: "x" },
          evaluator: { label: "Nhà đánh giá", sub: "y" },
        }}
      />,
    );
    expect(out).toContain("Nhà sáng lập");
    expect(out).toContain("Nhà đánh giá");
    expect(out).toContain('aria-label="Scout plan"');
  });
});
