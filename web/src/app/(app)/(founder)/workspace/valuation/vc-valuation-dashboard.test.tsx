// Colocated render test for the VC valuation dashboard empty state
// (release QA-2 F4).
//
// A fresh founder used to see "A$535K · SVI 100 · 60% confidence" because
// /api/valuation/vc defaulted a missing score to 100. The route now answers
// `{ empty: true }` and the client renders an honest empty state whose CTA
// goes to /analyze — the same "Complete an SVI analysis first" message the
// certificate panel shows for its 409.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ValuationEmptyState } from "./vc-valuation-dashboard";

describe("ValuationEmptyState", () => {
  const html = renderToStaticMarkup(<ValuationEmptyState />);

  it("tells the founder to run a first score and links to /analyze", () => {
    expect(html).toContain('data-testid="valuation-empty-state"');
    expect(html).toContain("Run your first score to see a valuation");
    expect(html).toContain("Complete an SVI analysis first");
    expect(html).toMatch(/href="\/analyze"/);
  });

  it("renders no fabricated figures", () => {
    expect(html).not.toMatch(/A\$\d/);
    expect(html).not.toMatch(/SVI \d/);
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain("Bear Case");
    expect(html).not.toContain("Confidence</p>");
  });
});
