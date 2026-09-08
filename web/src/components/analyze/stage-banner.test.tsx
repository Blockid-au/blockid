// Colocated tests for StageBanner — uses renderToStaticMarkup because
// this workspace does not install @testing-library/react. See sibling
// components (svi-score-ring.test.tsx) for the same pattern.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StageBanner, colorForStage } from "./stage-banner";
import { CANONICAL_STAGE_LABELS } from "@/lib/journey-vocabulary";

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("StageBanner static render", () => {
  it("renders the canonical English label for the stage", () => {
    const out = html(<StageBanner stage="idea" />);
    expect(out).toContain(CANONICAL_STAGE_LABELS.idea.label_en);
  });

  it("shows confidence % when provided", () => {
    const out = html(<StageBanner stage="seed" confidence={0.82} />);
    expect(out).toContain("82% confidence");
  });

  it("renders an override link only when handler provided", () => {
    const without = html(<StageBanner stage="idea" />);
    expect(without).not.toContain("Not right?");
    const withOverride = html(
      <StageBanner stage="idea" onOverride={() => {}} />,
    );
    expect(withOverride).toContain("Not right?");
  });

  it("carries the stage colour into the chip inline style", () => {
    const out = html(<StageBanner stage="mvp_early_revenue" />);
    const color = colorForStage("mvp_early_revenue").toLowerCase();
    expect(out.toLowerCase()).toContain(color);
  });
});

describe("colorForStage", () => {
  it("returns a hex-ish value for every canonical stage", () => {
    for (const s of ["idea", "validation", "seed", "series_a", "series_b_c", "public_exit"] as const) {
      expect(colorForStage(s)).toMatch(/^#/);
    }
  });

  it("distinct colours for early vs late stages", () => {
    expect(colorForStage("idea")).not.toEqual(colorForStage("series_b_c"));
  });
});
