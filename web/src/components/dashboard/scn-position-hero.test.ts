// ScnPositionHero render tests — H.21 canonical 8-stage badge overlay.
//
// Focus: the dashboard header MUST render the canonical CanonicalStageBadge
// alongside the 6-phase founder label whenever `phase6` maps to a valid
// 12-phase key (0..5). Out-of-range ordinals (missing, negative, > 5)
// must NOT emit the badge — the 6-phase label stays alone.
//
// We render with `react-dom/server`'s `renderToStaticMarkup` — cheap, no
// JSDOM dependency, and enough to inspect the emitted HTML for the
// canonical `data-canonical-stage` marker written by the shared
// CanonicalStageBadge component.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScnPositionHero, phase6ToPhase12 } from "./scn-position-hero";

const BADGE_MARKER = "data-canonical-stage=";

describe("phase6ToPhase12", () => {
  it("maps every 6-phase ordinal (0..5) onto the 12-phase taxonomy", () => {
    expect(phase6ToPhase12(0)).toBe(1); // Idea → vision
    expect(phase6ToPhase12(1)).toBe(2); // Validation → customer_dev
    expect(phase6ToPhase12(2)).toBe(6); // Equity → legal_equity
    expect(phase6ToPhase12(3)).toBe(9); // Fundraise → investor_review
    expect(phase6ToPhase12(4)).toBe(10); // Traction → fundraise/term sheet
    expect(phase6ToPhase12(5)).toBe(11); // Growth → growth
  });

  it("returns null for out-of-range or missing ordinals so the badge collapses", () => {
    expect(phase6ToPhase12(undefined)).toBeNull();
    expect(phase6ToPhase12(null)).toBeNull();
    expect(phase6ToPhase12(-1)).toBeNull();
    expect(phase6ToPhase12(6)).toBeNull();
    expect(phase6ToPhase12(Number.NaN)).toBeNull();
  });
});

describe("ScnPositionHero canonical-stage overlay", () => {
  it("renders the canonical 8-stage badge next to the 6-phase label for a valid phase", () => {
    const html = renderToStaticMarkup(
      createElement(ScnPositionHero, {
        sviScore: 45,
        stageLabel: "Validation",
        percentile: 60,
        valuationLabel: "A$250K",
        phase6: 1,
      }),
    );
    // The stageLabel is still the primary heading.
    expect(html).toContain("Validation");
    // The canonical badge is present with its stage attribute (validation).
    expect(html).toContain(BADGE_MARKER);
    expect(html).toContain('data-canonical-stage="validation"');
  });

  it("renders no canonical badge for a missing phase (0..5 not supplied)", () => {
    const html = renderToStaticMarkup(
      createElement(ScnPositionHero, {
        sviScore: null,
        stageLabel: "Idea",
        percentile: null,
        valuationLabel: "—",
      }),
    );
    expect(html).toContain("Idea");
    expect(html).not.toContain(BADGE_MARKER);
  });

  it("renders no canonical badge for an out-of-range phase6 (6)", () => {
    const html = renderToStaticMarkup(
      createElement(ScnPositionHero, {
        sviScore: 200,
        stageLabel: "Growth",
        percentile: 95,
        valuationLabel: "A$25M",
        phase6: 6,
      }),
    );
    expect(html).toContain("Growth");
    expect(html).not.toContain(BADGE_MARKER);
  });
});
