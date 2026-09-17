// Colocated vitest for feedback-letter-store (G14-S34). Pins the 42P01 /
// 42703 guard on every read (0404 missing → `available: false` / null,
// never a throw), the row mapper, the dupe (23505) path on insert, the
// first-open-only semantics of markLetterOpened and the opt-out toggle's
// not_found / unavailable answers.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
const state = vi.hoisted(() => ({ replies: new Map<string, Reply>(), calls: [] as Array<{ table: string; op: string; args: unknown[] }>, available: true }));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.available) return null;
    return {
      from(table: string) {
        const reply = () => state.replies.get(table) ?? { data: [], error: null };
        const b: Record<string, unknown> = {};
        const rec = (op: string) => (...args: unknown[]) => {
          state.calls.push({ table, op, args });
          return b;
        };
        for (const op of ["select", "eq", "is", "in", "not", "order", "limit", "update", "insert"]) b[op] = rec(op);
        b.maybeSingle = () => {
          const r = reply();
          return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error });
        };
        b.then = (ok: (v: Reply) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(reply()).then(ok, err);
        return b;
      },
    };
  },
}));

import {
  insertLetter,
  isMissingRelation,
  latestLetterForFounder,
  listLetterCandidateProjects,
  mapLetterRow,
  markLetterOpened,
  readFeedbackOptOut,
  readProjectAssessments,
  setFeedbackOptOut,
  snapshotDimScoresLite,
} from "./feedback-letter-store";

const MISSING = { code: "42P01", message: 'relation "public.founder_feedback_letters" does not exist' };
const NO_COLUMN = { code: "42703", message: "column evaluation_assessments.feedback_opt_out does not exist" };

const LETTER = {
  id: "l-1",
  project_id: "p-1",
  founder_user_id: "u-f",
  evaluation_ids: ["e-1", "e-2"],
  k: 3,
  org_count: 2,
  window_start: null,
  window_end: "2026-09-20T22:00:00.000Z",
  aggregate: { k: 3, orgCount: 2, dimensions: [], risks: [], questions: [], weakestDim: "TRE" },
  letter_md: "## What investors said",
  letter_md_vi: "## Nhà đầu tư nói gì",
  next_actions: [{ id: "tre-01", title: "x" }],
  status: "sent",
  sent_at: "2026-09-20T22:01:00.000Z",
  opened_at: null,
  email_message_id: "<m1>",
  created_at: "2026-09-20T22:00:00.000Z",
};

beforeEach(() => {
  state.replies.clear();
  state.calls.length = 0;
  state.available = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("snapshotDimScoresLite", () => {
  it("reads dim_results[k].score first, then dimension_scores[k] as a number or {score}; ignores junk", () => {
    expect(snapshotDimScoresLite({ dim_results: { tre: { score: 41 }, ftv: { score: "x" } }, dimension_scores: { ftv: 60, mpc: { score: 33 }, ptd: "bad", cgh: null } })).toEqual({ tre: 41, mpc: 33 });
    expect(snapshotDimScoresLite({ dimension_scores: { ftv: 60, svm: { score: 12 } } })).toEqual({ ftv: 60, svm: 12 });
    expect(snapshotDimScoresLite({})).toEqual({});
  });
});

describe("isMissingRelation", () => {
  it("42P01, 42703, PGRST204 and the schema-cache wording → true; anything else → false", () => {
    expect(isMissingRelation(MISSING)).toBe(true);
    expect(isMissingRelation(NO_COLUMN)).toBe(true);
    expect(isMissingRelation({ code: "PGRST204" })).toBe(true);
    expect(isMissingRelation({ message: "Could not find the table 'public.x' in the schema cache" })).toBe(true);
    expect(isMissingRelation({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});

describe("42P01 guard — 0404 not applied", () => {
  it("candidate projects → available:false; project assessments → available:false; latest letter → null; opt-out → null", async () => {
    state.replies.set("evaluation_assessments", { data: null, error: NO_COLUMN });
    state.replies.set("founder_feedback_letters", { data: null, error: MISSING });
    expect(await listLetterCandidateProjects()).toEqual({ available: false, projectIds: [] });
    expect(await readProjectAssessments("p-1")).toEqual({ available: false, rows: [] });
    expect(await latestLetterForFounder("u-f")).toBeNull();
    expect(await readFeedbackOptOut("e-1", "u-1")).toBeNull();
    expect(await markLetterOpened("l-1", "u-f")).toBe(false);
    const set = await setFeedbackOptOut("e-1", "u-1", true);
    expect(set).toMatchObject({ ok: false, error: "unavailable" });
    const ins = await insertLetter({ projectId: "p-1", founderUserId: "u-f", evaluationIds: [], k: 3, orgCount: 2, windowStart: null, windowEnd: "w", aggregate: {} as never, letterMd: "", letterMdVi: null, nextActions: [] });
    expect(ins).toMatchObject({ ok: false, error: "unavailable" });
    // a missing relation is never logged as an error
    expect(console.error).not.toHaveBeenCalled();
  });

  it("no admin client → the same quiet answers", async () => {
    state.available = false;
    expect(await listLetterCandidateProjects()).toEqual({ available: false, projectIds: [] });
    expect(await latestLetterForFounder("u-f")).toBeNull();
    expect(await readFeedbackOptOut("e-1", "u-1")).toBeNull();
  });
});

describe("reads", () => {
  it("candidate projects are distinct and filtered on submitted · not opted out · no letter yet", async () => {
    state.replies.set("evaluation_assessments", { data: [{ project_id: "p-1" }, { project_id: "p-1" }, { project_id: "p-2" }], error: null });
    const r = await listLetterCandidateProjects();
    expect(r).toEqual({ available: true, projectIds: ["p-1", "p-2"] });
    const ops = state.calls.filter((c) => c.table === "evaluation_assessments").map((c) => [c.op, ...c.args].join(":"));
    expect(ops).toContain("eq:status:submitted");
    expect(ops).toContain("eq:feedback_opt_out:false");
    expect(ops).toContain("is:feedback_letter_id:");
  });

  it("project assessments select the 0404 columns and map feedbackOptOut / feedbackLetterId", async () => {
    state.replies.set("evaluation_assessments", {
      data: [{ id: "a-1", evaluation_id: "e-1", project_id: "p-1", assessor_user_id: "u-1", version: 2, status: "submitted", feedback_opt_out: true, feedback_letter_id: "l-0", created_at: "c" }],
      error: null,
    });
    const r = await readProjectAssessments("p-1");
    expect(r.available).toBe(true);
    expect(r.rows[0]).toMatchObject({ id: "a-1", version: 2, feedbackOptOut: true, feedbackLetterId: "l-0" });
    const select = state.calls.find((c) => c.table === "evaluation_assessments" && c.op === "select")!;
    expect(String(select.args[0])).toMatch(/feedback_letter_id, feedback_opt_out$/);
  });

  it("mapLetterRow + latestLetterForFounder", async () => {
    state.replies.set("founder_feedback_letters", { data: [LETTER], error: null });
    const l = await latestLetterForFounder("u-f");
    expect(l).toMatchObject({ id: "l-1", projectId: "p-1", founderUserId: "u-f", evaluationIds: ["e-1", "e-2"], k: 3, orgCount: 2, status: "sent", openedAt: null, emailMessageId: "<m1>" });
    expect(l!.aggregate.weakestDim).toBe("TRE");
    expect(l!.nextActions).toEqual([{ id: "tre-01", title: "x" }]);
    expect(mapLetterRow({ ...LETTER, status: "bogus", evaluation_ids: null, next_actions: "x" })).toMatchObject({ status: "draft", evaluationIds: [], nextActions: [] });
    expect(state.calls.some((c) => c.table === "founder_feedback_letters" && c.op === "eq" && c.args[0] === "founder_user_id" && c.args[1] === "u-f")).toBe(true);
  });
});

describe("writes", () => {
  it("insertLetter maps 23505 to dupe and returns the row otherwise", async () => {
    state.replies.set("founder_feedback_letters", { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
    const input = { projectId: "p-1", founderUserId: "u-f", evaluationIds: ["e-1"], k: 3, orgCount: 2, windowStart: null, windowEnd: "2026-09-20T22:00:00.000Z", aggregate: LETTER.aggregate as never, letterMd: "md", letterMdVi: "vi", nextActions: [] };
    expect(await insertLetter(input)).toMatchObject({ ok: false, error: "dupe" });
    state.replies.set("founder_feedback_letters", { data: [LETTER], error: null });
    const ok = await insertLetter(input);
    expect(ok.ok).toBe(true);
    const insert = state.calls.find((c) => c.table === "founder_feedback_letters" && c.op === "insert")!;
    expect(insert.args[0]).toMatchObject({ project_id: "p-1", founder_user_id: "u-f", k: 3, org_count: 2, status: "draft", letter_md: "md", letter_md_vi: "vi" });
  });

  it("markLetterOpened flips only an unopened row of that founder (true once, false on repeat)", async () => {
    state.replies.set("founder_feedback_letters", { data: [{ id: "l-1" }], error: null });
    expect(await markLetterOpened("l-1", "u-f")).toBe(true);
    const ops = state.calls.filter((c) => c.table === "founder_feedback_letters").map((c) => [c.op, ...c.args.map((a) => (typeof a === "object" && a ? Object.keys(a).sort().join("+") : a))].join(":"));
    expect(ops).toContain("update:opened_at+status");
    expect(ops).toContain("eq:founder_user_id:u-f");
    expect(ops).toContain("is:opened_at:");
    state.replies.set("founder_feedback_letters", { data: [], error: null });
    expect(await markLetterOpened("l-1", "u-f")).toBe(false);
  });

  it("setFeedbackOptOut updates every version of the seat; zero rows → not_found", async () => {
    state.replies.set("evaluation_assessments", { data: [{ id: "a-1" }, { id: "a-2" }], error: null });
    expect(await setFeedbackOptOut("e-1", "u-1", true)).toEqual({ ok: true, optOut: true, updated: 2 });
    const update = state.calls.find((c) => c.table === "evaluation_assessments" && c.op === "update")!;
    expect(update.args[0]).toEqual({ feedback_opt_out: true });
    expect(state.calls.some((c) => c.op === "eq" && c.args[0] === "assessor_user_id" && c.args[1] === "u-1")).toBe(true);
    state.replies.set("evaluation_assessments", { data: [], error: null });
    expect(await setFeedbackOptOut("e-1", "u-1", false)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("readFeedbackOptOut reads the highest version's flag", async () => {
    state.replies.set("evaluation_assessments", { data: [{ feedback_opt_out: true }], error: null });
    expect(await readFeedbackOptOut("e-1", "u-1")).toBe(true);
    state.replies.set("evaluation_assessments", { data: [], error: null });
    expect(await readFeedbackOptOut("e-1", "u-1")).toBeNull();
  });
});
