// CompareDrawer — static render tests (G21 P2-B). Pins the closed / open /
// prompt-when-empty / capped-at-4 states, the "Open dossier" + Remove
// actions per column, the 8 dimension rows, the human-override marker
// (never replacing the model score), and the decision row's wording. The
// MAX_COMPARE cap itself is pure and lives in ./cohort-view-state; this
// file only re-confirms toggleCompare refuses a 5th id (the same guarantee
// the drawer relies on to never receive more than 4 rows).

import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompareDrawer, trajectoryStateFromResponse } from "./CompareDrawer";
import { toggleCompare, MAX_COMPARE } from "./cohort-view-state";
import { buildCohortRows, type CohortAnalysisInput, type CohortItemInput, type CohortRow } from "@/lib/evaluations/cohort-rows";
import { equalWeights, DIMENSION_LABELS, type CohortRow as BatchCohortRow } from "@/lib/evaluations/batch-shared";
import type { OverrideRow } from "@/lib/evaluations/overrides-shared";

function legacyRow(over: Partial<BatchCohortRow> = {}): BatchCohortRow {
  return {
    itemId: 1,
    evaluationId: "e-1",
    projectId: "p-1",
    projectSlug: "acme",
    startup: "Acme",
    label: null,
    industry: "DeepTech",
    state: "NSW",
    status: "done",
    svi: 71,
    weighted: null,
    stage: 3,
    delta: 4,
    topStrength: "Founder & Team",
    topGap: "Traction & Revenue",
    dimensionScores: { ftv: 80, mpc: 80, ptd: 80, tre: 40, cgh: 80, iri: 80, lco: 80, svm: 80 },
    reportUrl: "/tbr/tok-1",
    pdfUrl: "/api/svi/report/pdf?token=tok-1",
    error: null,
    scoredAt: "2026-09-10T12:00:00Z",
    decision: null,
    conviction: null,
    thesisFitPct: null,
    assessmentStatus: null,
    ...over,
  };
}

function row(opts: { legacy?: Partial<BatchCohortRow>; analysis?: Partial<CohortAnalysisInput> | null; overrides?: OverrideRow[] } = {}): CohortRow {
  const legacy = legacyRow(opts.legacy);
  const item: CohortItemInput = { ...legacy, snapshotId: null, shortlisted: false, reviewStatus: "unreviewed", reviewerId: null, reviewerName: null };
  const analyses: Record<string, CohortAnalysisInput> = opts.analysis === null ? {} : { [legacy.projectId]: { evidenceConfidence: 70, verificationLevel: 2, pendingDims: 0, unverifiedMaterialClaims: 0, conflictingClaims: 0, ...opts.analysis } };
  const assessments = legacy.decision != null ? { [legacy.evaluationId]: { decision: legacy.decision, conviction: legacy.conviction, thesisFitPct: legacy.thesisFitPct, assessmentStatus: legacy.assessmentStatus } } : {};
  const [built] = buildCohortRows([item], analyses, assessments, opts.overrides ?? [], equalWeights());
  return built!;
}

function makeRows(n: number): CohortRow[] {
  return Array.from({ length: n }, (_, i) =>
    row({ legacy: { itemId: i + 1, evaluationId: `e-${i + 1}`, projectId: `p-${i + 1}`, startup: `Startup ${i + 1}` } }),
  );
}

describe("CompareDrawer — closed", () => {
  it("aria-hidden, data-open=false, and translated fully off-screen", () => {
    const out = renderToStaticMarkup(<CompareDrawer open={false} rows={[]} onClose={() => {}} />);
    expect(out).toContain('data-testid="compare-drawer-root"');
    expect(out).toMatch(/aria-hidden="true"[^>]*data-testid="compare-drawer-root"[^>]*data-open="false"/);
    expect(out).toContain("translate-x-full");
  });
});

describe("CompareDrawer — open, nothing selected", () => {
  it("prompts to select up to MAX_COMPARE startups", () => {
    const out = renderToStaticMarkup(<CompareDrawer open rows={[]} onClose={() => {}} />);
    expect(out).toContain(`Select up to ${MAX_COMPARE} startups in the table to compare them here.`);
    expect(out).not.toContain('data-testid="compare-table"');
  });
});

describe("CompareDrawer — open with rows", () => {
  it("renders at most MAX_COMPARE columns even when given 5 rows", () => {
    const rows = makeRows(5);
    const out = renderToStaticMarkup(<CompareDrawer open rows={rows} onClose={() => {}} onRemove={() => {}} />);
    expect(MAX_COMPARE).toBe(4);
    expect((out.match(/Open dossier/g) ?? []).length).toBe(4);
    expect(out).toContain("Startup 1");
    expect(out).toContain("Startup 4");
    expect(out).not.toContain("Startup 5");
  });

  it("each column links Open dossier to the evaluation dossier and offers Remove when onRemove is given", () => {
    const rows = makeRows(2);
    const out = renderToStaticMarkup(<CompareDrawer open rows={rows} onClose={() => {}} onRemove={() => {}} />);
    expect(out).toContain('href="/workspace/evaluations/e-1"');
    expect(out).toContain('href="/workspace/evaluations/e-2"');
    expect((out.match(/>Remove</g) ?? []).length).toBe(2);
  });

  it("omits Remove when onRemove is not given", () => {
    const out = renderToStaticMarkup(<CompareDrawer open rows={makeRows(2)} onClose={() => {}} />);
    expect(out).not.toContain(">Remove<");
  });

  it("renders a dimension row for all 8 dimension labels", () => {
    const out = renderToStaticMarkup(<CompareDrawer open rows={makeRows(1)} onClose={() => {}} />);
    for (const label of Object.values(DIMENSION_LABELS)) expect(out).toContain(label.replace(/&/g, "&amp;"));
  });

  it("shows the human-override marker beside the model score, plus sr-only text", () => {
    const overridden = row({
      legacy: { itemId: 1, evaluationId: "e-1", projectId: "p-1", startup: "Acme", dimensionScores: { ftv: 80, mpc: 80, ptd: 80, tre: 40, cgh: 80, iri: 80, lco: 80, svm: 80 } },
      overrides: [
        { id: "o-1", batchId: "b-1", itemId: 1, projectId: "p-1", dimension: "tre", fromValue: 40, toValue: 65, reasonCode: "sector_context", note: null, reviewerId: "u-2", reviewerName: "Sam", createdAt: "2026-09-11T00:00:00Z" },
      ],
    });
    const out = renderToStaticMarkup(<CompareDrawer open rows={[overridden]} onClose={() => {}} />);
    expect(out).toContain("→65");
    expect(out).toContain("human override 65");
  });

  it("the decision row reads '<Decision> · conviction N (draft)'", () => {
    const decided = row({ legacy: { itemId: 1, evaluationId: "e-1", projectId: "p-1", startup: "Acme", decision: "proceed", conviction: 4, assessmentStatus: "draft" } });
    const out = renderToStaticMarkup(<CompareDrawer open rows={[decided]} onClose={() => {}} />);
    expect(out).toContain("Proceed · conviction 4 (draft)");
  });

  it("the decision row shows a dash when there is no decision", () => {
    const undecided = row({ legacy: { itemId: 1, evaluationId: "e-1", projectId: "p-1", startup: "Acme" } });
    const out = renderToStaticMarkup(<CompareDrawer open rows={[undecided]} onClose={() => {}} />);
    expect(out).toContain("<span class=\"text-muted\">—</span>");
  });
});

describe("CompareDrawer — trajectories (G22-A A.5)", () => {
  it("with a batchId, one trajectory card per shown row renders the loading skeleton on the server (fetch runs client-side); without a batchId the section is absent", () => {
    const rows = makeRows(2);
    const out = renderToStaticMarkup(<CompareDrawer open rows={rows} onClose={() => {}} batchId="b-1" />);
    expect(out).toContain('data-testid="compare-trajectories"');
    expect(out.match(/data-testid="compare-trajectory"/g)?.length).toBe(2);
    expect(out).toContain('data-item-id="1"');
    expect(out).toContain('data-state="idle"');
    expect(out).toContain("Loading the trajectory for Startup 1");
    const none = renderToStaticMarkup(<CompareDrawer open rows={rows} onClose={() => {}} />);
    expect(none).not.toContain('data-testid="compare-trajectories"');
  });

  it("trajectoryStateFromResponse: 200 + ok + trajectory → ready (values_withheld echoed); anything else → error", () => {
    const trajectory = { state: "empty" as const, day0: null, spanDays: 0, points: [], markers: [], milestones: [], latest: null, verificationLevel: null, outcomesAfterLatest: 0 };
    expect(trajectoryStateFromResponse(200, { ok: true, trajectory, values_withheld: true })).toEqual({ status: "ready", trajectory, valuesWithheld: true });
    expect(trajectoryStateFromResponse(200, { ok: true, trajectory })).toEqual({ status: "ready", trajectory, valuesWithheld: false });
    expect(trajectoryStateFromResponse(404, { ok: false })).toEqual({ status: "error" });
    expect(trajectoryStateFromResponse(200, { ok: true })).toEqual({ status: "error" });
    expect(trajectoryStateFromResponse(200, null)).toEqual({ status: "error" });
  });
});

describe("toggleCompare — the cap the drawer relies on", () => {
  it("refuses a 5th id once 4 are already selected", () => {
    const result = toggleCompare([1, 2, 3, 4], 5);
    expect(result.full).toBe(true);
    expect(result.selected).toEqual([1, 2, 3, 4]);
  });
});
