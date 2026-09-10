// Colocated test for the G8-P4 Next Unlock card — pins the G8-P8 help link
// and the phase / blocker rendering the dashboard relies on.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextUnlockCard } from "./next-unlock-card";

describe("NextUnlockCard", () => {
  it("renders the phase, completion and a 'How unlocks work' link to /docs/unlocks", () => {
    const out = renderToStaticMarkup(
      <NextUnlockCard
        currentPhase="legal_equity"
        completionPct={62.4}
        topBlockers={[
          { code: "dimension_below_floor", subject: "cgh", detail: "CGH scores 41 — Legal & Equity needs 50." },
        ]}
        nextAction="Upload your cap table."
      />,
    );
    expect(out).toContain('data-phase="legal_equity"');
    expect(out).toContain("Phase 6");
    expect(out).toContain("Legal &amp; Equity");
    expect(out).toContain("62%");
    expect(out).toContain('href="/docs/unlocks"');
    expect(out).toContain("How unlocks work");
    expect(out).toContain("SVI dimension too low");
    expect(out).toContain("Upload your cap table.");
  });

  it("clamps completion to 0..100 and reads 'ready to advance' at 100", () => {
    const out = renderToStaticMarkup(
      <NextUnlockCard currentPhase="funding" completionPct={140} topBlockers={[]} nextAction={null} />,
    );
    expect(out).toContain("100%");
    expect(out).toContain("ready to advance");
    expect(out).not.toContain("Blockers");
  });
});
