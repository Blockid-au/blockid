// S8-B a11y render test for the Money Finder report card pieces (2026-09-11).
// The full grant / program cards are exercised by the /funding/report page
// tests; here we pin the two leaf components whose markup carries meaning
// for screen readers:
//   • EligibilityChecklist — ✓ / ✗ / ? glyphs are aria-hidden and the
//     pass / fail / unknown word is real (sr-only) text, so colour + glyph
//     are never the only carrier (WCAG 1.4.1 / 1.3.3);
//   • ScoreBar — role="meter" with min / max / now and a text twin.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EligibilityChecklist, ScoreBar } from "./report-cards";

describe("EligibilityChecklist — S8-B", () => {
  it("names each status in text and hides the glyph from assistive tech", () => {
    const out = renderToStaticMarkup(
      <EligibilityChecklist
        items={[
          { label: "Incorporated in Australia", status: "pass" },
          { label: "Turnover under A$20m", status: "fail", detail: "A$25m reported" },
          { label: "R&D activities registered", status: "unknown" },
        ]}
      />,
    );
    expect(out).toContain('aria-label="Eligibility checklist"');
    expect(out).toContain('<span aria-hidden="true">✓</span><span class="sr-only">pass:</span>');
    expect(out).toContain('<span aria-hidden="true">✗</span><span class="sr-only">fail:</span>');
    expect(out).toContain('<span aria-hidden="true">?</span><span class="sr-only">unknown:</span>');
    // No aria-label on a plain span (ignored by most AT).
    expect(out).not.toMatch(/<span[^>]*aria-label="(pass|fail|unknown)"/);
    expect(out).toContain("A$25m reported");
  });
});

describe("ScoreBar — S8-B", () => {
  it("is a meter with a text twin", () => {
    const out = renderToStaticMarkup(<ScoreBar score={72.4} />);
    expect(out).toContain('role="meter"');
    expect(out).toContain('aria-valuemin="0"');
    expect(out).toContain('aria-valuemax="100"');
    expect(out).toContain('aria-valuenow="72"');
    expect(out).toContain('aria-label="Fit score"');
    expect(out).toContain("72/100 fit");
  });
});
