// S8-B a11y render test for the cohort table (T0272). Pins the sortable-
// header contract a screen reader relies on: aria-sort on the active column
// only, real <button> semantics with the sort state spoken (sr-only), a
// table caption, column scope on every header, decorative sort icons, and
// the horizontal-scroll wrapper that keeps a 400px viewport from scrolling
// sideways. `sortRows` keeps unscored rows last in both directions.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// S-D3: the bulk toolbar calls router.refresh() after a set — no app router in a static render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }) }));
import type { CohortRow } from "@/lib/evaluations/batch-shared";
import { CohortTable, sortRows } from "./cohort-table";

function row(over: Partial<CohortRow>): CohortRow {
  return {
    itemId: 1,
    evaluationId: "e1",
    projectId: "p1",
    projectSlug: "acme",
    startup: "Acme",
    label: null,
    industry: "Agtech",
    state: "NSW",
    status: "done",
    svi: 61,
    weighted: 63.5,
    stage: 3,
    delta: 4,
    topStrength: "Team",
    topGap: "Traction",
    dimensionScores: null,
    reportUrl: "/tbr/tok-1",
    pdfUrl: "/api/svi/report/pdf?token=tok-1",
    error: null,
    scoredAt: "2026-09-10T00:00:00Z",
    decision: null,
    conviction: null,
    thesisFitPct: null,
    assessmentStatus: null,
    ...over,
  };
}

const ROWS: CohortRow[] = [
  row({ itemId: 1, startup: "Acme", weighted: 63.5, decision: "track", conviction: 3, thesisFitPct: 62, assessmentStatus: "submitted" }),
  row({ itemId: 2, evaluationId: "e2", projectSlug: "beta", startup: "Beta", svi: null, weighted: null, status: "queued", reportUrl: null, pdfUrl: null, delta: null }),
  row({ itemId: 3, evaluationId: "e3", projectSlug: "gamma", startup: "Gamma", weighted: 70, decision: "proceed", conviction: 4, thesisFitPct: 80, assessmentStatus: "draft" }),
];

describe("CohortTable — S8-B a11y", () => {
  it("has a caption, column scope on every header and aria-sort on the active column only (weighted, descending by default)", () => {
    const out = renderToStaticMarkup(<CohortTable rows={ROWS} />);
    expect(out).toContain('<caption class="sr-only">Cohort table');
    expect((out.match(/<th scope="col"/g) ?? []).length).toBe(12);
    expect((out.match(/aria-sort="descending"/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<th scope="col"[^>]*aria-sort="descending"><button[^>]*data-testid="sort-weighted"/);
    expect((out.match(/aria-sort="none"/g) ?? []).length).toBe(10);
    expect(out).toContain('class="sr-only">, sorted descending</span>');
    expect(out).toContain('class="sr-only">, sortable</span>');
  });

  it("sort headers are buttons with decorative icons; report links name the startup and the new tab; scroll wrapper present", () => {
    const out = renderToStaticMarkup(<CohortTable rows={ROWS} />);
    expect((out.match(/<button type="button"[^>]*data-testid="sort-/g) ?? []).length).toBe(11);
    for (const svg of out.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
    expect(out).toContain("Open<span class=\"sr-only\"> Acme report (opens in a new tab)</span>");
    expect(out).toContain("PDF<span class=\"sr-only\"> for Acme</span>");
    expect(out).toContain('class="overflow-x-auto');
    // Unscored placeholder dash is AA ink, not ink-400.
    expect(out).not.toContain("text-ink-400");
  });

  it("sortRows keeps unscored rows last whichever direction is chosen", () => {
    expect(sortRows(ROWS, "weighted", "desc").map((r) => r.startup)).toEqual(["Gamma", "Acme", "Beta"]);
    expect(sortRows(ROWS, "weighted", "asc").map((r) => r.startup)).toEqual(["Acme", "Gamma", "Beta"]);
    expect(sortRows(ROWS, "startup", "asc").map((r) => r.startup)).toEqual(["Acme", "Beta", "Gamma"]);
  });
});

describe("CohortTable — S-D3 decision columns + bulk set (P1 / P2)", () => {
  it("renders decision / conviction / thesis-fit cells; a draft decision is marked; undecided rows show a dash", () => {
    const out = renderToStaticMarkup(<CohortTable rows={ROWS} />);
    expect(out).toContain('data-decision="track"');
    expect(out).toContain('data-decision="proceed"');
    expect(out).toContain('data-decision=""');
    expect(out).toMatch(/proceed<span class="ml-1 font-normal normal-case text-ink-500">draft<\/span>/);
    expect(out).toContain("62%");
    expect(out).toContain("80%");
    // Read-only table (no batchId): no select column, no toolbar.
    expect(out).not.toContain("cohort-bulk-toolbar");
    expect(out).not.toContain("cohort-select-all");
  });

  it("sorts decisions as a pipeline (proceed > track > pass), undecided last", () => {
    expect(sortRows(ROWS, "decision", "desc").map((r) => r.startup)).toEqual(["Gamma", "Acme", "Beta"]);
    expect(sortRows(ROWS, "decision", "asc").map((r) => r.startup)).toEqual(["Acme", "Gamma", "Beta"]);
    expect(sortRows(ROWS, "conviction", "desc").map((r) => r.startup)).toEqual(["Gamma", "Acme", "Beta"]);
  });

  it("with a batchId renders the select column and the Set-decision toolbar with pass / track / proceed / clear, all disabled at 0 selected", () => {
    const out = renderToStaticMarkup(<CohortTable rows={ROWS} batchId="b-1" />);
    expect(out).toContain('data-testid="cohort-bulk-toolbar"');
    expect(out).toContain("0 selected");
    expect((out.match(/data-testid="cohort-select"/g) ?? []).length).toBe(3);
    for (const id of ["bulk-pass", "bulk-track", "bulk-proceed", "bulk-clear"]) {
      expect(out).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*data-testid="${id}"`));
    }
    expect((out.match(/<th scope="col"/g) ?? []).length).toBe(13);
  });
});
