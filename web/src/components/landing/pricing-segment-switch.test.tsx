// Colocated tests for the Founder | Evaluator switch on /pricing (G12,
// T0268). Uses renderToStaticMarkup (this workspace has no
// @testing-library/react) so the assertions are on the SSR markup each tab
// produces — which is exactly what a crawler and a first paint see.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PricingSegmentSwitch,
  TAB_TO_SEGMENT,
  resolvePricingTab,
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

  it("lands every evaluator-shaped value on the Evaluator tab", () => {
    for (const v of ["evaluator", "Evaluator", "investor", "advisor", "accelerator", "program"]) {
      expect(resolvePricingTab(v)).toBe("evaluator");
    }
  });

  it("reads the first value of a repeated query param", () => {
    expect(resolvePricingTab(["evaluator", "founder"])).toBe("evaluator");
    expect(resolvePricingTab(["founder", "evaluator"])).toBe("founder");
  });

  it("maps the two tabs onto the plans-v2 segments", () => {
    expect(TAB_TO_SEGMENT.founder).toBe("founder");
    expect(TAB_TO_SEGMENT.evaluator).toBe("investor");
  });
});

describe("<PricingSegmentSwitch /> — Founder tab", () => {
  const out = html(<PricingSegmentSwitch />);

  it("renders exactly two tabs, Founder selected", () => {
    expect(out.match(/role="tab"/g)).toHaveLength(2);
    expect(out).toContain('id="pricing-tab-founder"');
    expect(out).toContain('id="pricing-tab-evaluator"');
    expect(out).toMatch(/id="pricing-tab-founder"[^>]*aria-selected="true"/);
    expect(out).toMatch(/id="pricing-tab-evaluator"[^>]*aria-selected="false"/);
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

  it("renders Scout A$79 · Firm A$149 · Program A$349 and nothing else", () => {
    expect(out).toContain('data-testid="evaluator-ladder"');
    expect(out).toContain('id="tier-scout"');
    expect(out).toContain('id="tier-firm"');
    expect(out).toContain('id="tier-program"');
    expect(out).toContain('aria-label="Scout plan"');
    expect(out).toContain('aria-label="Firm plan"');
    expect(out).toContain('aria-label="Program plan"');
    expect(out).toContain("A$79");
    expect(out).toContain("A$149");
    expect(out).toContain("A$349");
    expect(out).not.toContain('aria-label="VC Enterprise plan"');
    expect(out).not.toContain('id="tier-free"');
    expect(out).not.toContain('id="tier-growth"');
    // The retired labels must never resurface.
    expect(out).not.toContain('aria-label="Angel plan"');
    expect(out).not.toContain('aria-label="VC Small plan"');
  });

  it("routes every rung to /signup?segment=evaluator&plan=<id>&trial=1 as a 7-day card-required trial", () => {
    for (const id of ["investor_angel", "investor_advisor", "investor_vc_small"]) {
      expect(evaluatorSignupHref(id)).toBe(`/signup?segment=evaluator&plan=${id}&trial=1`);
      expect(out).toContain(evaluatorSignupHref(id).replace(/&/g, "&amp;"));
    }
    expect(out).toContain("Start 7-day free trial");
    expect(out).toContain("card required · cancel anytime");
    expect(out).not.toContain("/contact?plan=investor_");
  });

  it("release QA-2 F10 / S7-C: every evaluator card says the trial includes 1 full report, then the monthly quota", () => {
    expect(out).toContain("1 full Trust BizReport included during the trial, then 10/month on Scout");
    expect(out).toContain("1 full Trust BizReport included during the trial, then 30/month on Firm");
    expect(out).toContain("1 full Trust BizReport included during the trial, then 100/month on Program");
    expect(out.match(/data-testid="evaluator-trial-included"/g)?.length).toBe(3);
  });

  it("shows the A$3 pay-as-you-go Trust BizReport line", () => {
    expect(out).toContain('data-testid="evaluator-payg"');
    expect(out).toContain("A$3 per startup");
    expect(out).toContain("Trust BizReport");
  });

  it("does not carry the retired 'Beta pricing' badge", () => {
    expect(out).not.toContain("Beta pricing");
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
