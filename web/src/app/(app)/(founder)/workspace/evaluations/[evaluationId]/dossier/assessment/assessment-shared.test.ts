// Pure-helper tests for the assessment form (G13-W4-D2, S-D2): the PUT body
// mapping (blank notes → null, empty valuation → null), the save / submit
// gates, the literal share preview lines per allow-listed section, and the
// version diff lines.

import { describe, expect, it } from "vitest";
import { SHARE_SECTIONS, diffHistory, diffRatings, emptyFormValues, hasAnyContent, sectionPreviewLines, submitBlockers, toPutBody } from "./assessment-shared";

describe("toPutBody / gates", () => {
  it("maps blank notes and an empty valuation view to null and carries the status", () => {
    const v = emptyFormValues("s-1");
    const body = toPutBody({ ...v, private_notes: "   ", valuation_view: {} }, "draft");
    expect(body).toMatchObject({ status: "draft", snapshot_id: "s-1", private_notes: null, shared_notes: null, valuation_view: null, dimension_ratings: {}, risks: [] });
    const filled = toPutBody({ ...v, shared_notes: "hi", valuation_view: { low_aud: 1 } }, "submitted");
    expect(filled).toMatchObject({ status: "submitted", shared_notes: "hi", valuation_view: { low_aud: 1 } });
  });

  it("hasAnyContent is false for the empty form and true for any single field; submit needs decision + conviction", () => {
    const v = emptyFormValues(null);
    expect(hasAnyContent(v)).toBe(false);
    expect(hasAnyContent({ ...v, conviction: 2 })).toBe(true);
    expect(hasAnyContent({ ...v, private_notes: "x" })).toBe(true);
    expect(submitBlockers(v)).toEqual(["Choose pass / track / proceed", "Rate your conviction 1–5"]);
    expect(submitBlockers({ ...v, decision: "pass", conviction: 1 })).toEqual([]);
  });
});

describe("sectionPreviewLines — the literal 'founder will see exactly' content", () => {
  const v = {
    ...emptyFormValues(null),
    dimension_ratings: { TRE: { rating: 4 as const, stance: "agree" as const, note: "solid" } },
    risks: [{ title: "Churn", severity: "high" as const, dimension: "TRE" as const, source: "ai" as const }],
    questions_for_founder: [{ text: "Runway?", dimension: "TRE" as const }],
    shared_notes: "a\nb",
  };
  it("renders each allow-listed section from the current values", () => {
    expect(sectionPreviewLines(v, "dimension_ratings")).toEqual(["Traction & revenue: 4/5 · Agree — solid"]);
    expect(sectionPreviewLines(v, "risks")).toEqual(["HIGH · TRE: Churn (suggested by AI)"]);
    expect(sectionPreviewLines(v, "questions_for_founder")).toEqual(["TRE · Runway?"]);
    expect(sectionPreviewLines(v, "shared_notes")).toEqual(["a", "b"]);
  });
  it("empty sections say so explicitly", () => {
    const e = emptyFormValues(null);
    expect(sectionPreviewLines(e, "dimension_ratings")).toEqual(["(no dimension rated yet)"]);
    expect(sectionPreviewLines(e, "risks")).toEqual(["(no risks listed)"]);
    expect(sectionPreviewLines(e, "questions_for_founder")).toEqual(["(no questions yet)"]);
    expect(sectionPreviewLines(e, "shared_notes")).toEqual(["(shared notes are empty)"]);
  });
  it("the dialog sections are exactly the §C.1 allow-list in order", () => {
    expect(SHARE_SECTIONS.map((s) => s.field)).toEqual(["dimension_ratings", "risks", "questions_for_founder", "shared_notes"]);
  });
});

describe("diffHistory / diffRatings", () => {
  const base = { id: "a", status: "submitted" as const, snapshotId: "s-1", submittedAt: null, updatedAt: "" };
  it("reports decision / conviction / snapshot changes between consecutive versions", () => {
    const v1 = { ...base, version: 1, decision: "track" as const, conviction: 3 };
    const v2 = { ...base, version: 2, decision: "proceed" as const, conviction: 4, snapshotId: "s-2" };
    expect(diffHistory(null, v1)).toEqual([]);
    expect(diffHistory(v1, v2)).toEqual([
      { key: "decision", before: "Track", after: "Proceed" },
      { key: "conviction", before: "3/5", after: "4/5" },
      { key: "snapshot", before: "earlier snapshot", after: "newer snapshot" },
    ]);
    expect(diffHistory(v1, { ...v1, version: 2 })).toEqual([]);
  });
  it("rating deltas per dimension", () => {
    expect(diffRatings({ TRE: { rating: 2, stance: "agree" } }, { TRE: { rating: 4, stance: "agree" }, MPC: { rating: 1, stance: "unsure" } })).toEqual([
      { dim: "TRE", before: 2, after: 4 },
      { dim: "MPC", before: null, after: 1 },
    ]);
  });
});
