// CohortTable — static render tests (G21 P2-B). No jsdom: markup is
// asserted from `renderToStaticMarkup`, exactly like every other component
// test in this repo (see ../../app/(app)/(founder)/workspace/evaluations/
// cohort/cohort-table.test.tsx at HEAD for the house style). Interaction
// (sorting, the column chooser, saved views, PATCH / POST calls) is pinned
// separately through the pure reducers in ./cohort-view-state.test.ts and
// the pure row/URL model in @/lib/evaluations/cohort-rows(.test.ts); this
// file pins the markup contract those reducers render into: the caption's
// weight-set + "canonical SVI unchanged" wording, aria-sort on exactly the
// active column, the 15 sort buttons, the sticky company column, the
// default Program-score-desc ranking, the SVI / Program-score override
// markers (model beside human, never replacing it), confidence /
// verification / delta / gaps cells, the owner-vs-viewer write surface
// (review-status select vs. chip, shortlist button, the bulk-decision
// toolbar vs. the read-only note, the Override button), loading / empty
// states, URL- and prop-driven filtering, and the decision log.

import * as React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
  usePathname: () => "/workspace/evaluations/cohort/b-1",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { CohortTable, DecisionLog } from "./CohortTable";
import { COHORT_COLUMNS } from "./cohort-view-state";
import { buildCohortRows, RISK_FLAG_LABELS, REVIEW_STATUS_LABELS, type AssessmentLogInput, type CohortAnalysisInput, type CohortItemInput, type CohortRow } from "@/lib/evaluations/cohort-rows";
import { equalWeights, type CohortRow as BatchCohortRow } from "@/lib/evaluations/batch-shared";
import { DECISION_REASON_CODES, DECISION_REASON_LABELS } from "@/lib/evaluations/cohort-decisions-shared";
import type { OverrideRow } from "@/lib/evaluations/overrides-shared";

// ── fixtures ─────────────────────────────────────────────────────────────
// buildCohortRows is the real (pure) row builder: feeding it a legacy row +
// the 0423 item columns + analyses / overrides mirrors what the loader
// assembles server-side, so these fixtures exercise the same shape the page
// renders in production.

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
    dimensionScores: { ftv: 80, mpc: 80, ptd: 80, tre: 35, cgh: 80, iri: 80, lco: 80, svm: 80 },
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

function row(opts: {
  legacy?: Partial<BatchCohortRow>;
  item?: Partial<Pick<CohortItemInput, "snapshotId" | "shortlisted" | "reviewStatus" | "reviewerId" | "reviewerName">>;
  analysis?: Partial<CohortAnalysisInput> | null;
  overrides?: OverrideRow[];
  assessmentLog?: AssessmentLogInput[];
} = {}): CohortRow {
  const legacy = legacyRow(opts.legacy);
  const item: CohortItemInput = {
    ...legacy,
    snapshotId: "snap-1",
    shortlisted: false,
    reviewStatus: "unreviewed",
    reviewerId: null,
    reviewerName: null,
    ...opts.item,
  };
  const analyses: Record<string, CohortAnalysisInput> =
    opts.analysis === null
      ? {}
      : { [legacy.projectId]: { evidenceConfidence: 82, verificationLevel: 3, pendingDims: 1, unverifiedMaterialClaims: 0, conflictingClaims: 1, ...opts.analysis } };
  const assessments = legacy.decision != null ? { [legacy.evaluationId]: { decision: legacy.decision, conviction: legacy.conviction, thesisFitPct: legacy.thesisFitPct, assessmentStatus: legacy.assessmentStatus } } : {};
  const overrides = opts.overrides ?? [];
  const [built] = buildCohortRows([item], analyses, assessments, overrides, equalWeights(), {}, opts.assessmentLog ?? []);
  return built!;
}

function overrideRow(over: Partial<OverrideRow>): OverrideRow {
  return {
    id: "o-1",
    batchId: "b-1",
    itemId: 1,
    projectId: "p-1",
    dimension: "total",
    fromValue: 71,
    toValue: 85,
    reasonCode: "sector_context",
    note: null,
    reviewerId: "u-2",
    reviewerName: "Sam",
    createdAt: "2026-09-11T10:00:00Z",
    ...over,
  };
}

/** Full-featured row: overrides on total + tre, shortlisted, in review, risk flags, a draft decision. */
function acmeRow(): CohortRow {
  return row({
    legacy: { itemId: 1, evaluationId: "e-1", projectId: "p-1", startup: "Acme", svi: 71, decision: "proceed", conviction: 4, assessmentStatus: "draft" },
    item: { shortlisted: true, reviewStatus: "in_review", reviewerId: "u-2", reviewerName: "Sam" },
    overrides: [overrideRow({ id: "o-total", dimension: "total", fromValue: 71, toValue: 85 }), overrideRow({ id: "o-tre", dimension: "tre", fromValue: 35, toValue: 65, reasonCode: "evidence_contradicted" })],
  });
}

function betaRow(): CohortRow {
  return row({
    legacy: { itemId: 2, evaluationId: "e-2", projectId: "p-2", startup: "Beta", svi: 50, stage: 2, delta: null, dimensionScores: { ftv: 50, mpc: 50, ptd: 50, tre: 50, cgh: 50, iri: 50, lco: 50, svm: 50 } },
    analysis: { evidenceConfidence: 40, verificationLevel: 1, pendingDims: 0, unverifiedMaterialClaims: 0, conflictingClaims: 0 },
  });
}

function unscoredRow(): CohortRow {
  return row({
    legacy: { itemId: 3, evaluationId: "e-3", projectId: "p-3", startup: "Gamma", svi: null, stage: 1, delta: null, dimensionScores: null, status: "failed" },
    analysis: null,
  });
}

function cellHtml(html: string, testid: string): string {
  const m = new RegExp(`data-testid="${testid}"[^>]*>([\\s\\S]*?)</td>`).exec(html);
  return m?.[1] ?? "";
}

/** The whole opening+closing <td> (or other element) tagged with `testid`, attributes included. */
function cellTag(html: string, testid: string): string {
  const m = new RegExp(`<td[^>]*data-testid="${testid}"[^>]*>[\\s\\S]*?</td>`).exec(html);
  return m?.[0] ?? "";
}

beforeEach(() => {
  nav.search = "";
});

describe("CohortTable — caption + header sort state", () => {
  it("the caption names the weight-set version and says the canonical SVI is unchanged", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" weightsVersion={2} />);
    expect(out).toMatch(/<caption[^>]*>[^<]*weights v2[^<]*canonical SVI unchanged/);
    expect(out).not.toContain('data-testid="cohort-weights-changed"');
  });

  it("G22-A: says 'weights changed' (v1 → v2) in the caption when the two snapshots behind the Δ column differ in weight set", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" weightsVersion={2} deltaWeightsChanged={{ from: 1, to: 2 }} />);
    expect(out).toContain('data-testid="cohort-weights-changed"');
    expect(out).toMatch(/Weights changed between the last two snapshots \(v1 → v2\)/);
    expect(out).toContain("canonical SVI, which is unaffected");
  });

  it("exactly one column (Program score) is aria-sort=descending by default; every other sortable header is aria-sort=none", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow(), betaRow()]} batchId="b-1" role="owner" />);
    expect((out.match(/aria-sort="descending"/g) ?? []).length).toBe(1);
    const descTh = out.match(/<th[^>]*aria-sort="descending"[^>]*>[\s\S]*?<\/th>/)?.[0] ?? "";
    expect(descTh).toContain('data-testid="sort-weightedScore"');
    expect((out.match(/aria-sort="none"/g) ?? []).length).toBe(COHORT_COLUMNS.length - 1);
  });

  it("renders a sort button for all 15 columns", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(COHORT_COLUMNS).toHaveLength(15);
    for (const c of COHORT_COLUMNS) expect(out).toContain(`data-testid="sort-${c}"`);
  });
});

describe("CohortTable — layout", () => {
  it("the company cell carries the sticky-first-column class", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(out).toContain("sticky left-10 z-10 min-w-[11rem] bg-surface");
  });

  it("wraps the table in an overflow-x-auto scroll container", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(out).toMatch(/class="[^"]*overflow-x-auto[^"]*"[^>]*data-testid="cohort-scroll"/);
    // The scroll container must be positioned: the sr-only spans inside the sort buttons are
    // absolute, and an un-positioned wrapper let them widen the document (G24 UI lane).
    expect(out).toMatch(/class="relative overflow-x-auto[^"]*"[^>]*data-testid="cohort-scroll"/);
    // Sort buttons keep a 44 px hit box (24 px visual + 10 px each side) and a focus ring.
    const sortButtons = out.match(/<button[^>]*data-testid="sort-[a-z_]+"/g) ?? [];
    expect(sortButtons.length).toBeGreaterThan(3);
    for (const b of sortButtons) {
      expect(b).toContain("before:-inset-y-2.5");
      expect(b).toContain("focus-visible:ring-2");
    }
  });

  it("data-testid=cohort-row appears once per visible row", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow(), betaRow(), unscoredRow()]} batchId="b-1" role="owner" />);
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(3);
  });

  it("ranks by Program score descending by default (Acme 74.4 before Beta 50)", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[betaRow(), acmeRow()]} batchId="b-1" role="owner" />);
    expect(out.indexOf(">Acme<")).toBeGreaterThan(-1);
    expect(out.indexOf(">Acme<")).toBeLessThan(out.indexOf(">Beta<"));
  });
});

describe("CohortTable — SVI / Program score / confidence / verification / delta / gaps cells", () => {
  it("SVI cell shows the canonical number, and → the human override on the total when present", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    const cell = cellHtml(out, "svi-cell");
    expect(cell).toContain("71");
    expect(cell).toContain("→85");
  });

  it("SVI cell shows a dash when unscored, with no override marker", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[unscoredRow()]} batchId="b-1" role="owner" />);
    const cell = cellHtml(out, "svi-cell");
    expect(cell.replace(/<[^>]*>/g, "")).toBe("—");
  });

  it("Program score cell shows the model number, and → the score with dimension overrides applied", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    const cell = cellHtml(out, "weighted-cell");
    expect(cell).toContain("74.4");
    expect(cell).toContain("→78.1");
  });

  it("confidence, verification, gaps cells", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(cellHtml(out, "confidence-cell").replace(/<[^>]*>/g, "")).toBe("82");
    expect(cellHtml(out, "verification-cell").replace(/<[^>]*>/g, "")).toBe("L3");
    expect(cellHtml(out, "gaps-cell").replace(/<[^>]*>/g, "")).toBe("1");
  });

  it("delta cell: New when svi present and delta null, — when unscored, signed with tone otherwise", () => {
    const newDelta = row({ legacy: { itemId: 9, evaluationId: "e-9", projectId: "p-9", startup: "NewCo", svi: 40, delta: null } });
    const outNew = renderToStaticMarkup(<CohortTable rows={[newDelta]} batchId="b-1" role="owner" />);
    expect(cellHtml(outNew, "delta-cell").replace(/<[^>]*>/g, "")).toBe("New");

    const outUnscored = renderToStaticMarkup(<CohortTable rows={[unscoredRow()]} batchId="b-1" role="owner" />);
    expect(cellHtml(outUnscored, "delta-cell").replace(/<[^>]*>/g, "")).toBe("—");

    const up = row({ legacy: { itemId: 10, evaluationId: "e-10", projectId: "p-10", startup: "UpCo", svi: 60, delta: 2.46 } });
    const outUp = renderToStaticMarkup(<CohortTable rows={[up]} batchId="b-1" role="owner" />);
    expect(cellHtml(outUp, "delta-cell")).toContain("+2.5");
    expect(cellTag(outUp, "delta-cell")).toContain("text-bull");

    const down = row({ legacy: { itemId: 11, evaluationId: "e-11", projectId: "p-11", startup: "DownCo", svi: 60, delta: -1 } });
    const outDown = renderToStaticMarkup(<CohortTable rows={[down]} batchId="b-1" role="owner" />);
    expect(cellHtml(outDown, "delta-cell")).toContain("-1");
    expect(cellTag(outDown, "delta-cell")).toContain("text-bear");
  });

  it("risk-flags chips render the active flag labels", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(out).toContain('data-testid="risk-flags"');
    expect(out).toContain(RISK_FLAG_LABELS.low_dimension);
    expect(out).toContain(RISK_FLAG_LABELS.conflicting_claims);
  });
});

describe("CohortTable — review status, shortlist, decision, override by role", () => {
  it("owner / reviewer get a review-status <select>; viewer gets a read-only chip", () => {
    const owner = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(owner).toContain('data-testid="review-status-select"');
    expect(owner).toContain(REVIEW_STATUS_LABELS.in_review);

    const reviewer = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="reviewer" />);
    expect(reviewer).toContain('data-testid="review-status-select"');

    const viewer = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="viewer" />);
    expect(viewer).not.toContain('data-testid="review-status-select"');
    expect(viewer).toContain(REVIEW_STATUS_LABELS.in_review);
  });

  it("shortlist button carries aria-pressed and is disabled for a viewer", () => {
    const owner = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    const ownerBtn = owner.match(/<button[^>]*data-testid="shortlist-toggle"[^>]*>/)?.[0] ?? "";
    expect(ownerBtn).toContain('aria-pressed="true"');
    expect(ownerBtn).not.toContain('disabled=""');

    const viewer = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="viewer" />);
    const viewerBtn = viewer.match(/<button[^>]*data-testid="shortlist-toggle"[^>]*>/)?.[0] ?? "";
    expect(viewerBtn).toContain('aria-pressed="true"');
    expect(viewerBtn).toContain('disabled=""');
  });

  it("decision chip shows conviction /5 and a draft marker", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    const cell = cellHtml(out, "decision-cell");
    expect(cell).toContain("proceed");
    expect(cell).toContain("4/5");
    expect(cell).toContain("draft");
  });

  it("undecided rows show a dash in the decision cell", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[betaRow()]} batchId="b-1" role="owner" />);
    expect(cellHtml(out, "decision-cell").replace(/<[^>]*>/g, "")).toBe("—");
  });

  it("the Override button is absent for a viewer", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="viewer" />);
    expect(out).not.toContain('data-testid="override-open"');
  });

  it("the Override button is disabled when the row has no SVI", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[unscoredRow()]} batchId="b-1" role="owner" />);
    const btn = out.match(/<button[^>]*data-testid="override-open"[^>]*>/)?.[0] ?? "";
    expect(btn).toContain('disabled=""');
  });

  it("the Override button is enabled when the row has an SVI", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    const btn = out.match(/<button[^>]*data-testid="override-open"[^>]*>/)?.[0] ?? "";
    expect(btn).not.toContain('disabled=""');
  });
});

describe("CohortTable — write surface (owner) vs. read-only (viewer)", () => {
  it("owner sees the bulk decision toolbar with a reason select listing every DECISION_REASON_CODES", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(out).toContain('data-testid="cohort-bulk-toolbar"');
    expect(out).toContain('data-testid="bulk-reason"');
    for (const code of DECISION_REASON_CODES) expect(out).toContain(DECISION_REASON_LABELS[code]);
    expect(out).not.toContain('data-testid="viewer-note"');
  });

  it("viewer sees the read-only note instead of the bulk toolbar", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="viewer" />);
    expect(out).toContain('data-testid="viewer-note"');
    expect(out).not.toContain('data-testid="cohort-bulk-toolbar"');
  });
});

describe("CohortTable — loading / empty states", () => {
  it("loading renders 5 skeleton rows", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[]} batchId="b-1" role="owner" loading />);
    expect((out.match(/data-testid="cohort-skeleton-row"/g) ?? []).length).toBe(5);
  });

  it("no rows at all → 'No startups in this cohort yet.'", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[]} batchId="b-1" role="owner" />);
    expect(out).toContain('data-testid="cohort-empty"');
    expect(out).toContain("No startups in this cohort yet.");
  });
});

describe("CohortTable — filters from the URL / initialFilters", () => {
  it("a ?stage=3 URL hides non-matching rows", () => {
    nav.search = "stage=3";
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow(), betaRow()]} batchId="b-1" role="owner" />);
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(1);
    expect(out).toContain(">Acme<");
    expect(out).not.toContain(">Beta<");
  });

  it("when the URL-driven filters hide every row, the empty state offers Clear filters", () => {
    nav.search = "stage=5";
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow(), betaRow()]} batchId="b-1" role="owner" />);
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(0);
    expect(out).toContain("No startups match these filters.");
    expect(out).toContain("Clear filters");
  });

  it("initialFilters apply when the URL carries no query", () => {
    nav.search = "";
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow(), betaRow()]} batchId="b-1" role="owner" initialFilters={{ stage: [3] }} />);
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(1);
    expect(out).toContain(">Acme<");
  });
});

describe("CohortTable — export, compare drawer, override dialog", () => {
  it("the export CSV link points at the batch export endpoint", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-42" role="owner" />);
    expect(out).toContain('href="/api/evaluations/batch/b-42/export.csv"');
  });

  it("the compare drawer renders closed by default and the override dialog is absent", () => {
    const out = renderToStaticMarkup(<CohortTable rows={[acmeRow()]} batchId="b-1" role="owner" />);
    expect(out).toMatch(/data-testid="compare-drawer-root"[^>]*data-open="false"/);
    expect(out).not.toContain('data-testid="override-dialog"');
  });
});

describe("DecisionLog", () => {
  it("renders the empty state when there are no entries", () => {
    const out = renderToStaticMarkup(<DecisionLog row={acmeRow()} />);
    // acmeRow has overrides → not empty; build one with no log entries instead.
    const empty = row({ legacy: { itemId: 20, evaluationId: "e-20", startup: "Empty Co" } });
    const outEmpty = renderToStaticMarkup(<DecisionLog row={empty} />);
    expect(outEmpty).toContain('data-testid="decision-log-empty"');
    expect(outEmpty).toContain("No decisions or overrides recorded for Empty Co yet.");
    expect(out).not.toContain('data-testid="decision-log-empty"');
  });

  it("lists assessment + override entries newest first, labelled Human override / Decision", () => {
    const logged = row({
      legacy: { itemId: 21, evaluationId: "e-21", projectId: "p-21", startup: "Delta" },
      assessmentLog: [
        { evaluationId: "e-21", version: 1, status: "submitted", decision: "track", conviction: 3, assessorId: "u-9", assessorName: "Ash", updatedAt: "2026-09-10T10:00:00Z" },
        { evaluationId: "e-21", version: 2, status: "draft", decision: "proceed", conviction: 4, assessorId: "u-9", assessorName: "Ash", updatedAt: "2026-09-12T10:00:00Z" },
      ],
      overrides: [overrideRow({ id: "o-log", itemId: 21, projectId: "p-21", dimension: "tre", fromValue: 40, toValue: 60, createdAt: "2026-09-11T10:00:00Z" })],
    });
    const out = renderToStaticMarkup(<DecisionLog row={logged} />);
    expect(out).toContain('data-testid="decision-log"');
    const humanIdx = out.indexOf("Human override");
    const decisionIdx = out.indexOf("Decision");
    const v2Idx = out.indexOf("v2");
    const v1Idx = out.indexOf("v1");
    // newest (v2, 09-12) first, then the override (09-11), then v1 (09-10).
    expect(v2Idx).toBeGreaterThan(-1);
    expect(v2Idx).toBeLessThan(humanIdx);
    expect(humanIdx).toBeLessThan(v1Idx);
    expect(decisionIdx).toBeGreaterThan(-1);
    expect((out.match(/Human override/g) ?? []).length).toBe(1);
    expect((out.match(/>Decision</g) ?? []).length).toBe(2);
  });
});
