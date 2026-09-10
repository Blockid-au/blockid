// SSR render test for RecommendedNextStepTile (G11 T0244). Server render
// never runs the /api/nudge effect, so this exercises the pure-fallback
// path: the phase-map step plus, for phases 1–3, the Money Finder secondary
// line under the CTA. Collapsed sidebar stays icon-only.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecommendedNextStepTile } from "./recommended-next-step-tile";

describe("RecommendedNextStepTile (fallback path)", () => {
  it("renders the phase step and the Money Finder secondary line for phase 2", () => {
    const html = renderToStaticMarkup(<RecommendedNextStepTile currentPhase={2} planId="founder_free" />);
    expect(html).toContain('data-testid="rec-next-step"');
    expect(html).toContain("Log your first evidence");
    expect(html).toContain('href="/workspace/evidence"');
    expect(html).toContain('data-testid="rec-next-step-secondary"');
    expect(html).toContain('href="/workspace/funding"');
    expect(html).toContain("Find non-dilutive money first");
  });

  it("omits the secondary line outside phases 1–3 and when collapsed", () => {
    const p7 = renderToStaticMarkup(<RecommendedNextStepTile currentPhase={7} />);
    expect(p7).toContain("Analyse your growth metrics");
    expect(p7).not.toContain("rec-next-step-secondary");
    const collapsed = renderToStaticMarkup(<RecommendedNextStepTile currentPhase={1} sidebarOpen={false} />);
    expect(collapsed).toContain('href="/workspace/evaluation"');
    expect(collapsed).not.toContain("rec-next-step-secondary");
  });
});
