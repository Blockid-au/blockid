// Colocated vitest for the artefact gate.
//
// The design rule under test is "gate the artefacts, not the analysis". The
// panel must never be the thing that hides the score, the valuation or the
// next actions — those render above it and stay visible signed out. What it
// does own is the honest presentation of the account-only outputs.
//
// The failure it was written to prevent: rendering a live "Export PDF" button
// to a signed-out visitor, who presses it and receives a raw 401 JSON body
// from /api/svi/pdf. That reads as a broken site, not as a feature.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtefactGatePanel, ARTEFACT_ITEMS } from "./artefact-gate-panel";

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("ArtefactGatePanel — signed out", () => {
  const out = html(
    <ArtefactGatePanel authenticated={false} analysisPath="/analyze/abc" />,
  );

  it("names both account-only artefacts", () => {
    expect(out).toContain("Unwatermarked export");
    expect(out).toContain("Data room and investor links");
  });

  it("marks them as account features rather than linking into a 401", () => {
    expect(out).toContain("analyze-artefact-export-badge");
    expect(out).toContain("analyze-artefact-data-room-badge");
    expect(out).not.toContain("analyze-artefact-export-link");
    expect(out).not.toContain("analyze-artefact-data-room-link");
  });

  it("says the analysis itself is not being withheld", () => {
    expect(out).toMatch(/score, valuation and next actions above are yours/i);
  });

  it("is explicit that the account costs nothing", () => {
    expect(out).toMatch(/free/i);
    expect(out).toMatch(/nothing to pay/i);
    expect(out).not.toMatch(/A\$|\d+\s*credits?|upgrade to|subscri/i);
  });

  it("returns to this run's permalink after signup", () => {
    expect(out).toContain(
      `next=${encodeURIComponent("/analyze/abc")}`,
    );
    expect(out).toContain("mode=register");
  });

  it("falls back to /analyze when the run was not saved", () => {
    const unsaved = html(<ArtefactGatePanel authenticated={false} />);
    expect(unsaved).toContain(`next=${encodeURIComponent("/analyze")}`);
  });
});

describe("ArtefactGatePanel — signed in", () => {
  const out = html(
    <ArtefactGatePanel authenticated analysisPath="/analyze/abc" />,
  );

  it("links straight through to the real destinations", () => {
    expect(out).toContain("analyze-artefact-export-link");
    expect(out).toContain("analyze-artefact-data-room-link");
    for (const item of ARTEFACT_ITEMS) {
      expect(out).toContain(`href="${item.href}"`);
    }
  });

  it("stops advertising an account they already have", () => {
    expect(out).not.toContain("analyze-artefact-gate-register");
    expect(out).not.toContain("analyze-artefact-export-badge");
  });

  it("treats an unknown session as signed out, never the other way", () => {
    const unknown = html(<ArtefactGatePanel />);
    expect(unknown).toContain("analyze-artefact-gate-register");
  });
});

describe("ArtefactGatePanel — presentation", () => {
  it("labels itself for assistive tech", () => {
    const out = html(<ArtefactGatePanel authenticated={false} />);
    expect(out).toContain('aria-labelledby="artefact-gate-heading"');
    expect(out).toContain('id="artefact-gate-heading"');
  });

  it("uses design-system tokens, never raw hex", () => {
    const out = html(<ArtefactGatePanel authenticated={false} />);
    expect(out).toContain("bg-surface-sunken");
    expect(out).toContain("border-line-subtle");
    expect(out).toContain("text-on-action");
    expect(out).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
