// Colocated render test for <PricingMatrix /> (G11 T0247 — Founder Radar
// bundled into Starter). renderToStaticMarkup, like the segment-switch
// suite: what a crawler and the first paint see.
//
// Pins:
//   1. Starter keeps its label, gains the "Founder Radar" chip and the
//      approved Radar feature line; no other founder card carries the chip.
//   2. Free names the Money Finder preview + the A$3 Trust BizReport.
//   3. Growth's Radar extras are live (T0251) — no "(coming)" left.
//   4. Every Evaluator card says "Money Finder & Progress Radar included".

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingMatrix } from "./pricing-matrix";
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

  it("Free row says Money Finder preview + Trust BizReport A$3 pay-as-you-go", () => {
    expect(out).toContain("Money Finder preview");
    expect(out).toContain("Trust BizReport A$3 pay-as-you-go");
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

  it("adds 'Money Finder & Progress Radar included' to Scout, Firm and Program", () => {
    const hits = out.match(new RegExp(esc(EVALUATOR_RADAR_LINE).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [];
    expect(hits).toHaveLength(publicPlansForSegment("investor").length);
    expect(hits).toHaveLength(3);
  });

  it("carries no Founder Radar chip — the bundle is a Starter thing", () => {
    expect(out).not.toContain('data-testid="plan-badge"');
  });
});
