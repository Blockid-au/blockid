// LandingGrid / LandingBlock frame + the client trackers (G13-W3-IA3).

import { renderToStaticMarkup } from "react-dom/server";
import { Compass } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...a: unknown[]) => track(...a) }));

import { LandingBlock, LandingCta, LandingGrid, LANDING_BLOCKS, landingClickPayload, landingViewedPayload } from "./landing-grid";

const ctx = { phase: "customer_dev", plan: "founder_free", persona: "founder" };

describe("LandingGrid + LandingBlock", () => {
  it("names the five blocks in benefit order", () => {
    expect(LANDING_BLOCKS).toEqual(["where-you-stand", "next-best-action", "money-on-the-table", "evidence-to-add", "your-reports"]);
  });

  it("renders the 12-col grid and a block with its stable data attributes + span", () => {
    const html = renderToStaticMarkup(
      <LandingGrid>
        <LandingBlock name="where-you-stand" order={1} title="Where you stand" icon={Compass} span="wide" cta={<a href="/x">Go</a>}>
          body
        </LandingBlock>
        <LandingBlock name="your-reports" order={5} title="Your reports" icon={Compass} span="third" empty>
          nothing yet
        </LandingBlock>
      </LandingGrid>,
    );
    expect(html).toContain("data-landing-grid");
    expect(html).toContain("lg:grid-cols-12");
    expect(html).toContain('data-landing-block="where-you-stand"');
    expect(html).not.toMatch(/data-landing-block="where-you-stand" data-landing-empty/);
    expect(html).toContain("lg:col-span-6");
    expect(html).toContain('aria-labelledby="landing-where-you-stand-heading"');
    expect(html).toContain('data-landing-block="your-reports" data-landing-empty="true"');
    expect(html).toContain("lg:col-span-4");
    expect(html).toContain("<footer");
  });
});

describe("LandingCta", () => {
  beforeEach(() => track.mockReset());

  it("renders a link carrying the block + testid contract", () => {
    const html = renderToStaticMarkup(
      <LandingCta block="next-best-action" href="/workspace/evidence" ctx={ctx} action="add_evidence" testId="cta">
        Add evidence
      </LandingCta>,
    );
    expect(html).toContain('href="/workspace/evidence"');
    expect(html).toContain('data-landing-cta="next-best-action"');
    expect(html).toContain('data-testid="cta"');
    expect(html).toContain("bg-action");
    const link = renderToStaticMarkup(
      <LandingCta block="money-on-the-table" href="/workspace/investors" ctx={ctx} variant="link">
        Investors
      </LandingCta>,
    );
    expect(link).toContain("underline-offset-2");
  });

  it("payload builders match the AnalyticsEventMap shapes (time-to-first-action marker)", () => {
    expect(landingClickPayload("next-best-action", "/workspace/evidence", ctx, "add_evidence")).toEqual({
      block: "next-best-action",
      href: "/workspace/evidence",
      phase: "customer_dev",
      action: "add_evidence",
      persona: "founder",
    });
    // action defaults to the href so every click is attributable
    expect(landingClickPayload("your-reports", "/workspace/reports", ctx).action).toBe("/workspace/reports");
    expect(landingViewedPayload({ phase: "none", plan: "free", persona: "founder" }, ["a", "b"], ["b"])).toEqual({
      phase: "none",
      plan: "free",
      persona: "founder",
      blocks: "a,b",
      empty_blocks: "b",
    });
  });
});
