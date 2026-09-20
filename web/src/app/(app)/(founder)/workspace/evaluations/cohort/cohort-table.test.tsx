// cohort-table (thin wrapper) — render test (G21 P2-B rewrite of the T0272
// a11y pins). The BlockID Cohort table itself now lives in
// components/evaluations/CohortTable.tsx and is pinned there in full
// (./cohort-table.test.tsx one level up… see CohortTable.test.tsx). This
// wrapper only has two jobs left to pin:
//   * `liftLegacyRows` — the pure lift from a legacy batch-shared CohortRow
//     to the new CohortRow model (company ← startup, decision carried
//     over, unreviewed / unshortlisted defaults, confidence null since the
//     legacy shape carries no Evidence Confidence).
//   * `CohortTable` — legacy rows + no batchId render the read-only
//     (viewer) table; new-shape rows pass straight through unchanged.
// The a11y pins that still apply at this layer (caption, column scope,
// overflow-x-auto wrapper, sr-only sort-state text) are re-confirmed here
// so a future edit to the wrapper's pass-through cannot silently drop them.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The bulk toolbar / row actions call router.refresh() / useSearchParams() — no app router in a static render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
  usePathname: () => "/workspace/evaluations/cohort/b-1",
  useSearchParams: () => new URLSearchParams(),
}));

import type { CohortRow as BatchCohortRow } from "@/lib/evaluations/batch-shared";
import type { CohortRow } from "@/lib/evaluations/cohort-rows";
import { buildCohortRows, type CohortItemInput } from "@/lib/evaluations/cohort-rows";
import { equalWeights } from "@/lib/evaluations/batch-shared";
import { CohortTable, liftLegacyRows } from "./cohort-table";

function legacyRow(over: Partial<BatchCohortRow> = {}): BatchCohortRow {
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
    dimensionScores: { ftv: 70, mpc: 60, ptd: 55, tre: 40, cgh: 65, iri: 60, lco: 62, svm: 58 },
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

const LEGACY_ROWS: BatchCohortRow[] = [
  legacyRow({ itemId: 1, startup: "Acme", decision: "track", conviction: 3, thesisFitPct: 62, assessmentStatus: "submitted" }),
  legacyRow({ itemId: 2, evaluationId: "e2", projectId: "p2", projectSlug: "beta", startup: "Beta", svi: null, weighted: null, status: "queued", reportUrl: null, pdfUrl: null, delta: null, dimensionScores: null }),
  legacyRow({ itemId: 3, evaluationId: "e3", projectId: "p3", projectSlug: "gamma", startup: "Gamma", decision: "proceed", conviction: 4, thesisFitPct: 80, assessmentStatus: "draft" }),
];

describe("liftLegacyRows", () => {
  it("maps startup → company and carries the decision fields over", () => {
    const [acme] = liftLegacyRows([LEGACY_ROWS[0]!]);
    expect(acme!.company).toBe("Acme");
    expect(acme!.decision).toBe("track");
    expect(acme!.conviction).toBe(3);
    expect(acme!.assessmentStatus).toBe("submitted");
  });

  it("defaults unreviewed / unshortlisted and a null Evidence Confidence (the legacy shape carries none)", () => {
    const [acme] = liftLegacyRows([LEGACY_ROWS[0]!]);
    expect(acme!.reviewStatus).toBe("unreviewed");
    expect(acme!.shortlisted).toBe(false);
    expect(acme!.confidence).toBeNull();
  });

  it("with explicit weights, the Program score re-aggregates the dimension scores through them", () => {
    const weights = { ftv: 50, mpc: 0, ptd: 0, tre: 50, cgh: 0, iri: 0, lco: 0, svm: 0 };
    const [acme] = liftLegacyRows([LEGACY_ROWS[0]!], weights);
    // (70*50 + 40*50) / 100 = 55
    expect(acme!.weightedScore).toBe(55);
  });

  it("is equivalent to buildCohortRows with no analyses / overrides", () => {
    const items = LEGACY_ROWS.map<CohortItemInput>((r) => ({ ...r, snapshotId: null, shortlisted: false, reviewStatus: "unreviewed", reviewerId: null, reviewerName: null }));
    const assessments: Record<string, BatchCohortRow> = {};
    for (const r of LEGACY_ROWS) assessments[r.evaluationId] = r;
    const expected = buildCohortRows(items, {}, assessments, [], equalWeights());
    expect(liftLegacyRows(LEGACY_ROWS)).toEqual(expected);
  });
});

describe("CohortTable (thin wrapper) — legacy rows, no batchId → read-only viewer table", () => {
  it("renders the lifted rows read-only: caption, scoped headers, overflow wrapper, sr-only sort state", () => {
    const out = renderToStaticMarkup(<CohortTable rows={LEGACY_ROWS} />);
    expect(out).toContain('data-testid="blockid-cohort" data-role="viewer"');
    expect(out).toContain('data-testid="cohort-caption"');
    expect((out.match(/<th scope="col"/g) ?? []).length).toBeGreaterThan(0);
    expect(out).toMatch(/class="[^"]*overflow-x-auto[^"]*"[^>]*data-testid="cohort-scroll"/);
    expect(out).toContain('class="sr-only">, sorted descending</span>');
    // Read-only: no write surfaces.
    expect(out).not.toContain('data-testid="cohort-bulk-toolbar"');
    expect(out).not.toContain('data-testid="cohort-select-all"');
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(3);
    expect(out).toContain(">Acme<");
    expect(out).toContain(">Beta<");
    expect(out).toContain(">Gamma<");
  });
});

describe("CohortTable (thin wrapper) — new-shape rows pass straight through", () => {
  it("renders the given CohortRow[] unchanged (same row count, sticky column, aria-sort, caption)", () => {
    const newRows: CohortRow[] = liftLegacyRows(LEGACY_ROWS);
    const out = renderToStaticMarkup(<CohortTable rows={newRows} batchId="b-1" role="owner" />);
    expect(out).toContain('data-testid="blockid-cohort" data-role="owner"');
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(3);
    expect(out).toContain("sticky left-10 z-10 min-w-[11rem] bg-surface");
    expect((out.match(/aria-sort="descending"/g) ?? []).length).toBe(1);
    expect(out).toContain('data-testid="cohort-caption"');
    // With a batchId + owner role, the write surfaces are back.
    expect(out).toContain('data-testid="cohort-bulk-toolbar"');
  });
});
