// OverrideDialog — pure validation tests + static render tests (G21 P2-B).
// `validateOverrideForm` mirrors the route's Zod schema client-side so the
// dialog never POSTs what the server would reject; `modelScoreFor` reads
// the on-screen model number for the "from" field. The render half pins
// the dialog's open/closed contract, the explanation that the canonical
// score is unchanged, the dimension select defaulting to the row's
// weakest, the read-only "from" value, and the 7 reason codes.

import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OverrideDialog, validateOverrideForm, modelScoreFor, type OverrideFormValues } from "./OverrideDialog";
import { OVERRIDE_REASON_CODES, OVERRIDE_REASON_LABELS } from "@/lib/evaluations/overrides-shared";
import { buildCohortRows, type CohortAnalysisInput, type CohortItemInput, type CohortRow } from "@/lib/evaluations/cohort-rows";
import { equalWeights, type CohortRow as BatchCohortRow } from "@/lib/evaluations/batch-shared";

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

function row(over: Partial<BatchCohortRow> = {}): CohortRow {
  const legacy = legacyRow(over);
  const item: CohortItemInput = { ...legacy, snapshotId: null, shortlisted: false, reviewStatus: "unreviewed", reviewerId: null, reviewerName: null };
  const analyses: Record<string, CohortAnalysisInput> = { [legacy.projectId]: { evidenceConfidence: 70, verificationLevel: 2, pendingDims: 0, unverifiedMaterialClaims: 0, conflictingClaims: 0 } };
  const [built] = buildCohortRows([item], analyses, {}, [], equalWeights());
  return built!;
}

function values(over: Partial<OverrideFormValues> = {}): OverrideFormValues {
  return { dimension: "tre", to: "60", reasonCode: "sector_context", note: "", ...over };
}

describe("validateOverrideForm", () => {
  it("requires a reason code", () => {
    const r = validateOverrideForm(values({ reasonCode: "" }), 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.reasonCode).toBeTruthy();
  });

  it("rejects an empty, non-numeric, or > 100 'to' value", () => {
    for (const to of ["", "abc", "101"]) {
      const r = validateOverrideForm(values({ to }), 1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.to).toBeTruthy();
    }
  });

  it("requires a note when the reason is 'other'", () => {
    const r = validateOverrideForm(values({ reasonCode: "other", note: "" }), 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.note).toBeTruthy();
  });

  it("rejects a note over 2000 characters", () => {
    const r = validateOverrideForm(values({ note: "x".repeat(2001) }), 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.note).toBeTruthy();
  });

  it("accepts a valid form and returns the POST body (note trimmed, empty → null)", () => {
    const r = validateOverrideForm(values({ dimension: "tre", to: "62", reasonCode: "sector_context", note: "  saw a signed LOI  " }), 42);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body).toEqual({ item_id: 42, dimension: "tre", to_value: 62, reason_code: "sector_context", note: "saw a signed LOI" });
      expect(typeof r.body.to_value).toBe("number");
    }
  });

  it("an empty / whitespace-only note becomes null", () => {
    const r = validateOverrideForm(values({ note: "   " }), 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.note).toBeNull();
  });
});

describe("modelScoreFor", () => {
  const r = row();

  it("returns the canonical SVI for 'total'", () => {
    expect(modelScoreFor(r, "total")).toBe(71);
  });

  it("returns the dimension score otherwise", () => {
    expect(modelScoreFor(r, "tre")).toBe(35);
    expect(modelScoreFor(r, "ftv")).toBe(80);
  });

  it("returns null when there is no row", () => {
    expect(modelScoreFor(null, "total")).toBeNull();
  });
});

describe("OverrideDialog — render", () => {
  it("renders nothing when closed or when row is null", () => {
    expect(renderToStaticMarkup(<OverrideDialog open={false} batchId="b-1" row={row()} onClose={() => {}} />)).toBe("");
    expect(renderToStaticMarkup(<OverrideDialog open batchId="b-1" row={null} onClose={() => {}} />)).toBe("");
  });

  it("open: dialog role, title, and the 'canonical score unchanged' explanation", () => {
    const out = renderToStaticMarkup(<OverrideDialog open batchId="b-1" row={row()} onClose={() => {}} />);
    expect(out).toContain('data-testid="override-dialog"');
    expect(out).toMatch(/role="dialog"/);
    expect(out).toMatch(/aria-modal="true"/);
    expect(out).toContain("Override a score — Acme");
    expect(out).toContain("The canonical score is unchanged");
  });

  it("the dimension select defaults to the row's weakest dimension", () => {
    // tre=35 is the weakest of the fixture's 8 dims.
    const out = renderToStaticMarkup(<OverrideDialog open batchId="b-1" row={row()} onClose={() => {}} />);
    const select = out.match(/<select[^>]*data-testid="override-dimension"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(select).toMatch(/<option value="tre" selected(=""|)>/);
  });

  it("override-from is read-only and equals the weakest dimension's model score", () => {
    const out = renderToStaticMarkup(<OverrideDialog open batchId="b-1" row={row()} onClose={() => {}} />);
    expect(out).toMatch(/data-testid="override-from"[^>]*value="35"/);
    expect(out).toMatch(/<input[^>]*readOnly=""[^>]*data-testid="override-from"/);
  });

  it("override-to is required", () => {
    const out = renderToStaticMarkup(<OverrideDialog open batchId="b-1" row={row()} onClose={() => {}} />);
    expect(out).toMatch(/<input[^>]*required=""[^>]*data-testid="override-to"/);
  });

  it("override-reason lists all 7 OVERRIDE_REASON_CODES labels", () => {
    const out = renderToStaticMarkup(<OverrideDialog open batchId="b-1" row={row()} onClose={() => {}} />);
    expect(OVERRIDE_REASON_CODES).toHaveLength(7);
    const select = out.match(/<select[^>]*data-testid="override-reason"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
    for (const code of OVERRIDE_REASON_CODES) expect(select).toContain(OVERRIDE_REASON_LABELS[code]);
  });

  it("override-note textarea and override-submit button are present", () => {
    const out = renderToStaticMarkup(<OverrideDialog open batchId="b-1" row={row()} onClose={() => {}} />);
    expect(out).toContain('data-testid="override-note"');
    expect(out).toContain('data-testid="override-submit"');
  });
});
