// Colocated test for the G8-P4 Next Unlock card — pins the G8-P8 help link
// and the phase / blocker rendering the dashboard relies on.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NEXT_UNLOCK_START_HERE, NextUnlockCard, progressColor, progressTextColor } from "./next-unlock-card";

describe("NextUnlockCard — start-here state (release QA-2 F8)", () => {
  it("renders Phase 1 · 0 % with a single CTA to /analyze for a founder with no project", () => {
    const out = renderToStaticMarkup(<NextUnlockCard {...NEXT_UNLOCK_START_HERE} />);
    expect(out).toContain('data-testid="next-unlock-card"');
    expect(out).toContain('data-start-here="true"');
    expect(out).toContain('data-phase="vision"');
    expect(out).toContain("Phase 1");
    expect(out).toContain("Vision &amp; Mission");
    expect(out).toContain('aria-valuenow="0"');
    expect(out).toContain("Start here");
    expect(out).toContain('data-testid="next-unlock-start-cta"');
    expect(out).toMatch(/href="\/analyze"/);
    expect(out).toContain("Run your first SVI score");
    expect(out).not.toContain("Blockers");
  });

  it("the normal state carries no start-here marker or CTA", () => {
    const out = renderToStaticMarkup(
      <NextUnlockCard currentPhase="vision" completionPct={40} topBlockers={[]} nextAction={null} />,
    );
    expect(out).not.toContain("data-start-here");
    expect(out).not.toContain("next-unlock-start-cta");
    expect(out).toContain("40% of exit conditions met");
  });
});

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

  it("S8-B a11y: progressbar semantics, semantic bull/warn/bear tokens (no dark-only slate ink on the light dashboard), region landmark", () => {
    const low = renderToStaticMarkup(
      <NextUnlockCard currentPhase="legal_equity" completionPct={30} topBlockers={[]} nextAction="Do the thing." />,
    );
    expect(low).toContain('role="region"');
    expect(low).toContain('aria-labelledby="next-unlock-heading"');
    expect(low).toContain('role="progressbar"');
    expect(low).toContain('aria-valuenow="30"');
    expect(low).toContain('aria-valuemin="0"');
    expect(low).toContain('aria-valuemax="100"');
    expect(low).toContain("bg-bear");
    expect(low).toContain("text-bear");
    expect(low).toContain("motion-reduce:transition-none");
    // The old dark-theme shades (text-slate-100 on bg-surface = 1.07:1) must be gone.
    expect(low).not.toMatch(/text-slate-\d+/);
    expect(low).not.toMatch(/(emerald|amber|rose)-\d+/);
    expect(progressColor(85)).toBe("bg-bull");
    expect(progressTextColor(55)).toBe("text-warn");
    expect(progressTextColor(10)).toBe("text-bear");
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
