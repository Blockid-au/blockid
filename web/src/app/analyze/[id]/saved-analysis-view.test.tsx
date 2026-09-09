// Colocated spec for the saved-analysis view.
//
// The security-relevant behaviour is the one pinned hardest: every way a
// caller can fail to be entitled to a run — bad id, someone else's id, no
// cookie, malformed body — has to collapse to the same `not-found` state and
// the same "Analysis not found" panel. A branch that said anything more
// specific would confirm the id exists to a person who cannot see it.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SavedAnalysisView,
  resolveLoadState,
  type SavedAnalysisPayload,
} from "./saved-analysis-view";

const payload: SavedAnalysisPayload = {
  id: "abc",
  createdAt: "2026-09-08T04:00:00.000Z",
  owned: true,
  input: {
    kind: "website",
    url: "https://example.com",
    filename: null,
    chars: 1200,
    truncated: false,
  },
  // The API shapes `analysis.intake` to drop straight into AnalyzeResults.
  intake: { inputKind: "website", rawText: "" } as SavedAnalysisPayload["intake"],
  svi: null,
};

describe("resolveLoadState", () => {
  it("treats a 404 as not found", () => {
    expect(resolveLoadState({ ok: false })).toEqual({ status: "not-found" });
  });

  it("treats a 200 with ok:false the same as a 404", () => {
    expect(resolveLoadState({ ok: true, body: { ok: false } })).toEqual({
      status: "not-found",
    });
  });

  it("treats a 200 with no analysis the same as a 404", () => {
    expect(resolveLoadState({ ok: true, body: { ok: true } })).toEqual({
      status: "not-found",
    });
    expect(resolveLoadState({ ok: true, body: null })).toEqual({
      status: "not-found",
    });
  });

  it("returns the analysis on a real hit", () => {
    const state = resolveLoadState({ ok: true, body: { ok: true, analysis: payload } });
    expect(state.status).toBe("found");
    expect(state.status === "found" && state.analysis.id).toBe("abc");
  });
});

describe("SavedAnalysisView", () => {
  it("opens on a loading state rather than a false 'not found'", () => {
    const html = renderToStaticMarkup(<SavedAnalysisView id="abc" />);
    expect(html).toContain("Loading your analysis");
    expect(html).not.toContain("not found");
  });
});

describe("SavedAnalysisPayload.svi", () => {
  // The publish panel runs the thinness gate and builds its preview from
  // this field. If the API ever stops returning it the panel silently
  // decides every run is unpublishable, so the shape is pinned here.
  it("carries the compact score summary through from the API", () => {
    const withScore = resolveLoadState({
      ok: true,
      body: {
        ok: true,
        analysis: {
          ...payload,
          svi: {
            version: "2.1.0",
            totalSVI: 118,
            stage: 2,
            stageLabel: "MVP / Prototype",
            summary: "s",
            confidenceMultiplier: 0.5,
            dimensions: { ftv: 60, mpc: 55, ptd: 50, tre: 40, cgh: 45, iri: 50, lco: 40, svm: 45 },
            nextActions: [],
            valuation: {
              low: 1,
              mid: 2,
              high: 3,
              method: "Berkus",
              confidence: 50,
              currency: "AUD",
            },
          },
        },
      },
    });
    expect(withScore.status).toBe("found");
    expect(
      withScore.status === "found" && withScore.analysis.svi?.totalSVI,
    ).toBe(118);
  });

  it("tolerates a run that produced no score", () => {
    const state = resolveLoadState({ ok: true, body: { ok: true, analysis: payload } });
    expect(state.status === "found" && state.analysis.svi).toBeNull();
  });
});
