// Colocated vitest for lib/evaluations/assessments.ts (G13-W2-D1, S-D1).
// Pins the §C.1 privacy contract:
//   * the founder receives NOTHING until shared_with_founder_at is set, and
//     afterwards ONLY the ticked allow-listed sections — decision /
//     conviction / private_notes / valuation_view / thesis_fit_pct / status
//     never appear in a founder payload (field allow-list, S4);
//   * another org seat never receives private_notes;
//   * the assessor gets the full row + a notes-free version timeline;
//   * getAssessment() for a founder viewer never returns `mine`, and for an
//     assessor filters to their own seat;
//   * a missing table (42P01, migration 0392 not applied) reads as
//     available:false, never a throw.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = { rows: [] as Row[], error: null as { code?: string; message?: string } | null, admin: true };

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.admin) return null;
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: async () => (state.error ? { data: null, error: state.error } : { data: state.rows, error: null }),
    };
    return { from: () => q };
  },
}));

import {
  FOUNDER_FORBIDDEN_FIELDS,
  FOUNDER_SHARE_ALLOW_LIST,
  dimensionRatingsSchema,
  getAssessment,
  listAssessmentHistory,
  mapAssessmentRow,
  maskAssessment,
  riskItemSchema,
  toFounderVisible,
  toHistoryEntry,
} from "./assessments";

const ROW: Row = {
  id: "a-1",
  evaluation_id: "e-1",
  project_id: "p-1",
  assessor_user_id: "u-eval",
  org_id: null,
  snapshot_id: "s-1",
  version: 2,
  status: "submitted",
  decision: "proceed",
  conviction: 4,
  thesis_fit_pct: 72,
  dimension_ratings: { TRE: { rating: 4, stance: "agree" }, MPC: { rating: 2, stance: "disagree", note: "TAM overstated" }, BAD: { rating: 9 } },
  criterion_ratings: { idea: { stance: "agree" }, junk: { stance: "nope" } },
  valuation_view: { low_aud: 2_000_000, high_aud: 4_000_000, method_note: "comps" },
  risks: [{ title: "Single founder", severity: "high", dimension: "FTV", source: "ai" }, { title: "x", severity: "nope" }],
  questions_for_founder: [{ text: "Runway?", dimension: "TRE", sent_at: null }],
  private_notes: "do not share",
  shared_notes: "we like the wedge",
  shared_fields: ["risks", "shared_notes", "decision"],
  shared_with_founder_at: null,
  submitted_at: "2026-09-12T00:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-12T00:00:00Z",
};

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.admin = true;
});

describe("mapAssessmentRow", () => {
  it("maps columns, drops malformed JSON entries and keeps only allow-listed shared_fields", () => {
    const a = mapAssessmentRow(ROW);
    expect(a.id).toBe("a-1");
    expect(a.version).toBe(2);
    expect(a.status).toBe("submitted");
    expect(a.decision).toBe("proceed");
    expect(a.conviction).toBe(4);
    expect(a.thesisFitPct).toBe(72);
    expect(Object.keys(a.dimensionRatings).sort()).toEqual(["MPC", "TRE"]);
    expect(a.criterionRatings).toEqual({ idea: { stance: "agree" } });
    expect(a.risks).toHaveLength(1);
    expect(a.questionsForFounder[0].text).toBe("Runway?");
    expect(a.valuationView?.high_aud).toBe(4_000_000);
    // "decision" is not shareable — dropped at the boundary.
    expect(a.sharedFields).toEqual(["risks", "shared_notes"]);
    expect(a.privateNotes).toBe("do not share");
  });

  it("tolerates a bare row (defaults, no throw)", () => {
    const a = mapAssessmentRow({ id: "x", evaluation_id: "e", project_id: "p", assessor_user_id: "u" });
    expect(a.version).toBe(1);
    expect(a.status).toBe("draft");
    expect(a.decision).toBeNull();
    expect(a.dimensionRatings).toEqual({});
    expect(a.risks).toEqual([]);
    expect(a.sharedFields).toEqual([]);
  });
});

describe("Appendix 2 Zod shapes", () => {
  it("dimension ratings accept 1..5 + stance and reject out-of-range", () => {
    expect(dimensionRatingsSchema.safeParse({ FTV: { rating: 5, stance: "agree" } }).success).toBe(true);
    expect(dimensionRatingsSchema.safeParse({ FTV: { rating: 6, stance: "agree" } }).success).toBe(false);
    expect(riskItemSchema.safeParse({ title: "t", severity: "low", source: "evaluator" }).success).toBe(true);
    expect(riskItemSchema.safeParse({ title: "", severity: "low", source: "evaluator" }).success).toBe(false);
  });

  it("G14-S37: dimension ratings accept the optional FTV flags (4 booleans), reject unknown flag keys / non-boolean values, and keep the flags on the parsed row", () => {
    const ok = dimensionRatingsSchema.safeParse({ FTV: { rating: 4, stance: "agree", flags: { references_checked: true, full_time: true } } });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.FTV?.flags).toEqual({ references_checked: true, full_time: true });
    expect(dimensionRatingsSchema.safeParse({ FTV: { rating: 4, stance: "agree", flags: {} } }).success).toBe(true);
    expect(dimensionRatingsSchema.safeParse({ FTV: { rating: 4, stance: "agree", flags: { references_checked: "yes" } } }).success).toBe(false);
    expect(dimensionRatingsSchema.safeParse({ FTV: { rating: 4, stance: "agree", flags: { bogus: true } } }).success).toBe(false);
    // A pre-S37 row (no flags) still parses — append-only.
    expect(dimensionRatingsSchema.safeParse({ MPC: { rating: 2, stance: "disagree", note: "n" } }).success).toBe(true);
    const row = mapAssessmentRow({ ...ROW, dimension_ratings: { FTV: { rating: 5, stance: "agree", flags: { key_person_risk: true, complementary_skills: false } } } });
    expect(row.dimensionRatings.FTV?.flags).toEqual({ key_person_risk: true, complementary_skills: false });
  });
});

describe("maskAssessment — founder", () => {
  const forbidden = FOUNDER_FORBIDDEN_FIELDS as readonly string[];

  it("returns null while nothing is shared (S4: founder sees NOTHING from block 4)", () => {
    const a = mapAssessmentRow(ROW);
    expect(maskAssessment(a, "founder")).toEqual({ role: "founder", assessment: null });
    expect(toFounderVisible(a)).toBeNull();
  });

  it("after sharing, emits ONLY the ticked allow-listed sections and never a forbidden field", () => {
    const a = mapAssessmentRow({ ...ROW, shared_with_founder_at: "2026-09-13T00:00:00Z" });
    const m = maskAssessment(a, "founder");
    expect(m.role).toBe("founder");
    const v = m.assessment!;
    expect(v.sharedFields).toEqual(["risks", "shared_notes"]);
    expect(v.risks).toHaveLength(1);
    expect(v.sharedNotes).toBe("we like the wedge");
    // un-ticked allow-listed sections are absent, not empty
    expect("dimensionRatings" in v).toBe(false);
    expect("questionsForFounder" in v).toBe(false);
    for (const f of forbidden) expect(f in v, `${f} leaked to founder`).toBe(false);
    // and the serialised payload carries none of the private values
    const json = JSON.stringify(v);
    expect(json).not.toContain("do not share");
    expect(json).not.toContain("proceed");
    expect(json).not.toContain("4000000");
    expect(json).not.toContain("u-eval");
  });

  it("the allow-list is exactly the four §C.1 sections", () => {
    expect([...FOUNDER_SHARE_ALLOW_LIST]).toEqual(["dimension_ratings", "risks", "questions_for_founder", "shared_notes"]);
  });
});

describe("maskAssessment — seats", () => {
  it("assessor gets the full row", () => {
    const a = mapAssessmentRow(ROW);
    const m = maskAssessment(a, "assessor");
    expect(m.role).toBe("assessor");
    expect(m.assessment).toBe(a);
  });

  it("org member gets everything except private_notes", () => {
    const a = mapAssessmentRow(ROW);
    const m = maskAssessment(a, "org_member");
    expect(m.role).toBe("org_member");
    expect(m.assessment.privateNotes).toBeNull();
    expect(m.assessment.decision).toBe("proceed");
    expect(m.assessment.sharedNotes).toBe("we like the wedge");
  });

  it("history entries never carry notes or ratings", () => {
    const h = toHistoryEntry(mapAssessmentRow(ROW));
    expect(Object.keys(h).sort()).toEqual(["conviction", "decision", "id", "snapshotId", "status", "submittedAt", "updatedAt", "version"]);
  });
});

describe("getAssessment", () => {
  it("assessor: mine = own highest version, history = own versions only; other seats' rows are not returned", async () => {
    state.rows = [
      { ...ROW, id: "a-2", version: 2 },
      { ...ROW, id: "a-1", version: 1, status: "draft", decision: null, submitted_at: null },
      { ...ROW, id: "b-1", version: 1, assessor_user_id: "u-other", private_notes: "other seat" },
    ];
    const r = await getAssessment("e-1", { userId: "u-eval", role: "assessor" });
    expect(r.available).toBe(true);
    expect(r.mine?.id).toBe("a-2");
    expect(r.history.map((h) => h.id)).toEqual(["a-2", "a-1"]);
    expect(r.sharedWithFounder).toBeNull();
    expect(JSON.stringify(r)).not.toContain("other seat");
  });

  it("founder: never `mine`; newest shared row projected through the allow-list", async () => {
    state.rows = [
      { ...ROW, id: "a-2", version: 2, shared_with_founder_at: "2026-09-13T00:00:00Z", shared_fields: ["questions_for_founder"] },
      { ...ROW, id: "a-1", version: 1 },
    ];
    const r = await getAssessment("e-1", { userId: "u-founder", role: "founder" });
    expect(r.mine).toBeNull();
    expect(r.history).toEqual([]);
    expect(r.sharedWithFounder?.id).toBe("a-2");
    expect(r.sharedWithFounder?.questionsForFounder?.[0].text).toBe("Runway?");
    const json = JSON.stringify(r);
    for (const needle of ["do not share", "proceed", "we like the wedge", "conviction", "thesisFitPct", "valuationView"]) {
      expect(json, `founder payload leaked ${needle}`).not.toContain(needle);
    }
    expect(await listAssessmentHistory("e-1", { userId: "u-founder", role: "founder" })).toEqual([]);
  });

  it("founder with nothing shared → sharedWithFounder null", async () => {
    state.rows = [{ ...ROW }];
    const r = await getAssessment("e-1", { userId: "u-founder", role: "founder" });
    expect(r).toEqual({ available: true, mine: null, history: [], sharedWithFounder: null });
  });

  it("42P01 (0392 not applied) → available:false, no throw, no console noise", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.error = { code: "42P01", message: 'relation "public.evaluation_assessments" does not exist' };
    const r = await getAssessment("e-1", { userId: "u-eval", role: "assessor" });
    expect(r).toEqual({ available: false, mine: null, history: [], sharedWithFounder: null });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("other DB errors are logged and read as unavailable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.error = { code: "XX000", message: "boom" };
    const r = await getAssessment("e-1", { userId: "u-eval", role: "assessor" });
    expect(r.available).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("no admin client → unavailable", async () => {
    state.admin = false;
    expect((await getAssessment("e-1", { userId: "u-eval", role: "assessor" })).available).toBe(false);
  });
});
