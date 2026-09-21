// ProgramWeightsDialog (G22-A A.3) — static render + the pure helpers (this
// workspace has no DOM runner; the open / save path is covered by live-qa
// 37-cohort). Pins: closed by default with the "Edit program weights"
// trigger (aria-haspopup=dialog, aria-expanded=false) and no dialog markup;
// weightsDiffer ignores scale (normalised first) and catches a real move;
// savedMessage names the new version on a change and says "unchanged"
// otherwise.

import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));

import { ProgramWeightsDialog, savedMessage, weightsDiffer } from "./ProgramWeightsDialog";
import { equalWeights } from "@/lib/evaluations/batch-shared";

describe("ProgramWeightsDialog — closed render", () => {
  it("renders the trigger only, wired as a dialog opener; no status line, no dialog", () => {
    const out = renderToStaticMarkup(<ProgramWeightsDialog batchId="b-1" weights={equalWeights()} weightsVersion={1} />);
    expect(out).toContain('data-testid="program-weights-edit"');
    expect(out).toMatch(/aria-haspopup="dialog"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-haspopup="dialog"/);
    expect(out).toContain("Edit program weights");
    expect(out).not.toContain('data-testid="program-weights-dialog"');
    expect(out).not.toContain('data-testid="program-weights-status"');
    expect(out).not.toContain('role="dialog"');
  });
});

describe("weightsDiffer", () => {
  it("false for the same split at a different scale; true when a dimension really moves", () => {
    const eq = equalWeights();
    expect(weightsDiffer(eq, eq)).toBe(false);
    expect(weightsDiffer(eq, { ftv: 1, mpc: 1, ptd: 1, tre: 1, cgh: 1, iri: 1, lco: 1, svm: 1 })).toBe(false);
    expect(weightsDiffer(eq, { ...eq, tre: 40 })).toBe(true);
  });
});

describe("savedMessage", () => {
  it("names the new version on a change, says unchanged otherwise", () => {
    expect(savedMessage({ changed: true, weightsVersion: 2 })).toMatch(/saved as v2.*stamps v2/);
    expect(savedMessage({ changed: false, weightsVersion: 2 })).toMatch(/unchanged/);
  });
});
