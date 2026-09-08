// Colocated smoke test for SviScoreRing.
//
// Uses renderToStaticMarkup so we avoid pulling in @testing-library/react
// (not installed in this workspace) — the component is a pure server-safe
// SVG render, so a static HTML string is enough to pin the invariants that
// matter: aria label carries the score, both circles render, the numeric
// score is echoed in the centre label, and the input is clamped.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SviScoreRing } from "./svi-score-ring";

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("SviScoreRing", () => {
  it("renders an accessible label with the score", () => {
    const out = html(<SviScoreRing score={72} label="SVI" />);
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="SVI score 72 out of 100"');
    expect(out).toContain(">72<"); // center number
    expect(out).toContain(">SVI<"); // center label
  });

  it("clamps out-of-range scores to [0, 100]", () => {
    expect(html(<SviScoreRing score={-25} />)).toContain(
      'aria-label="SVI score 0 out of 100"',
    );
    expect(html(<SviScoreRing score={140} />)).toContain(
      'aria-label="SVI score 100 out of 100"',
    );
  });

  it("renders track + arc as two <circle> elements", () => {
    const out = html(<SviScoreRing score={50} />);
    const circles = out.match(/<circle\b/g) ?? [];
    expect(circles.length).toBe(2);
  });

  it("emits a gradient with the growth-good end stop when score >= 70", () => {
    const out = html(<SviScoreRing score={80} />);
    expect(out).toContain("#FF9F0A"); // svi-500 start
    expect(out).toContain("#16C784"); // bull end
  });

  it("uses the warn end stop for mid-band scores", () => {
    const out = html(<SviScoreRing score={55} />);
    expect(out).toContain("#F5B23F");
  });

  it("uses the bear end stop for weak scores", () => {
    const out = html(<SviScoreRing score={22} />);
    expect(out).toContain("#F16169");
  });

  it("hides the label paragraph when label prop is empty", () => {
    const out = html(<SviScoreRing score={50} label="" />);
    // Empty label — only the center number should remain, no stray span.
    expect(out).not.toContain('letter-spacing: 0.14em');
  });
});
