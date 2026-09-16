// Colocated vitest for the WRITE side of lib/evaluations/assessments.ts
// (G13-W4-D2, S-D2). Table-level Supabase fake so the real versioning /
// share / revoke code paths run. Pins:
//   * versioning: v1 insert · draft updated in place · submitted → v(n+1)
//     pre-filled from v(n) · submit needs decision + conviction (422 codes)
//     · a new version never inherits the previous share;
//   * share: only allow-listed fields land in shared_fields, the founder
//     projection returned is exactly toFounderVisible(); re-share replaces
//     the set; nothing to share → not_found;
//   * revoke: EVERY version of the seat is cleared; masking after
//     share / revoke (the founder reads nothing again);
//   * audit rows: assessment.saved / submitted / shared / share_revoked with
//     ids + field names, never note bodies;
//   * 0392 missing → unavailable, never a throw.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = { rows: [] as Row[], error: null as { code?: string; message?: string } | null, admin: true, seq: 1 };

function builder() {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  let single = false;
  const run = async () => {
    if (state.error) return { data: null, error: state.error };
    if (op === "insert") {
      const now = new Date().toISOString();
      const row: Row = { id: `a-${state.seq++}`, created_at: now, updated_at: now, shared_fields: [], shared_with_founder_at: null, dimension_ratings: {}, criterion_ratings: {}, risks: [], questions_for_founder: [], ...payload };
      state.rows.push(row);
      return { data: single ? row : [row], error: null };
    }
    let rows = state.rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      const now = new Date().toISOString();
      for (const r of rows) Object.assign(r, payload, { updated_at: now });
    }
    rows = [...rows].sort((a, b) => Number(b.version) - Number(a.version));
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    insert: (p: Row) => { op = "insert"; payload = p; return q; },
    update: (p: Row) => { op = "update"; payload = p; return q; },
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
    not: (k: string) => { filters.push((r) => r[k] != null); return q; },
    order: () => q,
    limit: () => run(),
    maybeSingle: () => { single = true; return run(); },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
  };
  return q;
}

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (state.admin ? { from: () => builder() } : null) }));
const appendAuditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => appendAuditMock(p as never) }));

import {
  FOUNDER_FORBIDDEN_FIELDS,
  assessmentDelta,
  assessmentDraftSchema,
  assessmentShareSchema,
  getAssessment,
  mapAssessmentRow,
  revokeAssessmentShare,
  shareAssessment,
  toFounderVisible,
  upsertAssessment,
} from "./assessments";

const CTX = { evaluationId: "e-1", projectId: "p-1", assessorUserId: "u-eval" };
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.admin = true;
  state.seq = 1;
  appendAuditMock.mockClear();
});

describe("assessmentDraftSchema", () => {
  it("accepts an empty body, rejects unknown keys and out-of-range values with issue paths", () => {
    expect(assessmentDraftSchema.safeParse({}).success).toBe(true);
    const bad = assessmentDraftSchema.safeParse({ conviction: 9, decision: "maybe", dimension_ratings: { TRE: { rating: 0, stance: "agree" } }, extra: 1 });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["conviction", "decision", "dimension_ratings.TRE.rating"]));
  });
  it("share schema accepts only the four allow-listed sections", () => {
    expect(assessmentShareSchema.safeParse({ fields: ["risks", "shared_notes"] }).success).toBe(true);
    expect(assessmentShareSchema.safeParse({ fields: ["decision"] }).success).toBe(false);
    expect(assessmentShareSchema.safeParse({ fields: ["private_notes"] }).success).toBe(false);
    expect(assessmentShareSchema.safeParse({ fields: [] }).success).toBe(false);
  });
});

describe("upsertAssessment — versioning", () => {
  it("first save inserts v1 as a draft stamped with the snapshot; audit assessment.saved carries field names, never text", async () => {
    const r = await upsertAssessment(CTX, { snapshot_id: "11111111-1111-4111-8111-111111111111", dimension_ratings: { TRE: { rating: 4, stance: "agree", note: "solid MRR" } }, private_notes: "TOP SECRET" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(true);
    expect(r.version).toBe(1);
    expect(r.assessment.status).toBe("draft");
    expect(r.assessment.snapshotId).toBe("11111111-1111-4111-8111-111111111111");
    expect(r.history.map((h) => h.version)).toEqual([1]);
    await tick();
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const audit = appendAuditMock.mock.calls[0][0] as unknown as Row;
    expect(audit).toMatchObject({ action: "assessment.saved", resource_type: "evaluation_assessment", user_id: "u-eval", detail: { evaluation_id: "e-1", version: 1, created: true } });
    expect(JSON.stringify(audit)).not.toContain("TOP SECRET");
    expect(JSON.stringify(audit)).not.toContain("solid MRR");
    expect((audit.detail as Row).changed).toEqual(expect.arrayContaining(["dimension_ratings", "private_notes"]));
  });

  it("a draft is updated in place (same id, same version) on every autosave", async () => {
    const first = await upsertAssessment(CTX, { conviction: 2 });
    const second = await upsertAssessment(CTX, { conviction: 4, decision: "track" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.created).toBe(false);
    expect(second.assessment.id).toBe(first.assessment.id);
    expect(second.version).toBe(1);
    expect(second.assessment.conviction).toBe(4);
    expect(state.rows).toHaveLength(1);
  });

  it("submit without a decision / conviction is refused with the S3 message and writes nothing", async () => {
    const noDecision = await upsertAssessment(CTX, { status: "submitted", conviction: 3 });
    expect(noDecision).toEqual({ ok: false, error: "missing_decision", message: "Choose pass / track / proceed" });
    const noConviction = await upsertAssessment(CTX, { status: "submitted", decision: "pass" });
    expect(noConviction).toEqual({ ok: false, error: "missing_conviction", message: "Rate your conviction 1–5" });
    expect(state.rows).toHaveLength(0);
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("submit stamps submitted_at + status and audits assessment.submitted; the effective decision may come from the draft", async () => {
    await upsertAssessment(CTX, { decision: "proceed", conviction: 5 });
    const r = await upsertAssessment(CTX, { status: "submitted" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assessment.status).toBe("submitted");
    expect(r.assessment.submittedAt).toBeTruthy();
    expect(r.assessment.decision).toBe("proceed");
    expect(r.version).toBe(1);
    await tick();
    expect(appendAuditMock.mock.calls.map((c) => (c[0] as unknown as Row).action)).toEqual(["assessment.saved", "assessment.submitted"]);
  });

  it("saving after a submit creates v(n+1) pre-filled from v(n) — content carried, share state NOT carried", async () => {
    await upsertAssessment(CTX, { status: "submitted", decision: "track", conviction: 3, risks: [{ title: "Single founder", severity: "high", source: "ai" }], shared_notes: "hello founder" });
    const shared = await shareAssessment(CTX, ["risks"]);
    expect(shared.ok).toBe(true);
    const v2 = await upsertAssessment(CTX, { conviction: 4 });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.created).toBe(true);
    expect(v2.version).toBe(2);
    expect(v2.assessment.status).toBe("draft");
    expect(v2.assessment.decision).toBe("track"); // carried from v1
    expect(v2.assessment.risks[0].title).toBe("Single founder"); // carried
    expect(v2.assessment.conviction).toBe(4); // patched
    expect(v2.assessment.sharedWithFounderAt).toBeNull(); // never inherited
    expect(v2.assessment.sharedFields).toEqual([]);
    expect(v2.history.map((h) => h.version)).toEqual([2, 1]);
    // v1 keeps its share until revoked — the founder still reads v1's risks.
    const founder = await getAssessment("e-1", { userId: "u-founder", role: "founder" });
    expect(founder.sharedWithFounder?.version).toBe(1);
    expect(founder.sharedWithFounder?.risks?.[0].title).toBe("Single founder");
    expect(state.rows).toHaveLength(2);
  });

  it("0392 missing → unavailable, no throw; no admin client → unavailable", async () => {
    state.error = { code: "42P01", message: "relation does not exist" };
    expect((await upsertAssessment(CTX, { conviction: 1 })).ok).toBe(false);
    expect((await upsertAssessment(CTX, { conviction: 1 }) as { error: string }).error).toBe("unavailable");
    state.error = null;
    state.admin = false;
    expect((await upsertAssessment(CTX, { conviction: 1 }) as { error: string }).error).toBe("unavailable");
  });
});

describe("shareAssessment / revokeAssessmentShare — masking after share and revoke", () => {
  const forbidden = FOUNDER_FORBIDDEN_FIELDS as readonly string[];

  it("nothing to share before a row exists", async () => {
    const r = await shareAssessment(CTX, ["risks"]);
    expect(r).toMatchObject({ ok: false, error: "not_found" });
  });

  it("share ticks only allow-listed fields on the CURRENT row; the returned preview is exactly toFounderVisible() and carries no forbidden field", async () => {
    await upsertAssessment(CTX, {
      status: "submitted",
      decision: "proceed",
      conviction: 5,
      thesis_fit_pct: 88,
      valuation_view: { low_aud: 1_000_000, high_aud: 3_000_000 },
      dimension_ratings: { MPC: { rating: 2, stance: "disagree", note: "TAM overstated" } },
      questions_for_founder: [{ text: "Runway?", dimension: "TRE" }],
      private_notes: "do not share",
      shared_notes: "we like the wedge",
    });
    // The lib filters defensively even if a caller bypasses Zod.
    const r = await shareAssessment(CTX, ["dimension_ratings", "shared_notes", "decision" as never]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assessment.sharedFields).toEqual(["dimension_ratings", "shared_notes"]);
    expect(r.assessment.sharedWithFounderAt).toBeTruthy();
    expect(r.founderPreview).toEqual(toFounderVisible(r.assessment));
    expect(r.founderPreview.sharedNotes).toBe("we like the wedge");
    expect(r.founderPreview.dimensionRatings?.MPC?.note).toBe("TAM overstated");
    expect("questionsForFounder" in r.founderPreview).toBe(false);
    for (const f of forbidden) expect(f in r.founderPreview, `${f} leaked`).toBe(false);
    // Serialise WITHOUT the timestamp: a wall-clock like "…33.889Z" once
    // matched the "88" needle (thesis-fit) and failed a deploy gate.
    const json = JSON.stringify({ ...r.founderPreview, sharedWithFounderAt: undefined });
    for (const needle of ["do not share", "proceed", "88", "3000000", "Runway?"]) expect(json).not.toContain(needle);
    // and the founder read path agrees
    const founder = await getAssessment("e-1", { userId: "u-founder", role: "founder" });
    expect(founder.sharedWithFounder).toEqual(r.founderPreview);
    await tick();
    const audit = appendAuditMock.mock.calls.at(-1)![0] as unknown as Row;
    expect(audit).toMatchObject({ action: "assessment.shared", detail: { fields: ["dimension_ratings", "shared_notes"], fields_count: 2, reshared: false } });
    expect(JSON.stringify(audit)).not.toContain("we like the wedge");
  });

  it("re-share replaces the ticked set (audit reshared:true); the founder now sees the new set only", async () => {
    await upsertAssessment(CTX, { risks: [{ title: "Churn", severity: "medium", source: "evaluator" }], shared_notes: "n" });
    await shareAssessment(CTX, ["shared_notes"]);
    const r = await shareAssessment(CTX, ["risks"]);
    expect(r.ok && r.assessment.sharedFields).toEqual(["risks"]);
    const founder = await getAssessment("e-1", { userId: "u-founder", role: "founder" });
    expect(founder.sharedWithFounder?.sharedFields).toEqual(["risks"]);
    expect("sharedNotes" in (founder.sharedWithFounder ?? {})).toBe(false);
    await tick();
    expect((appendAuditMock.mock.calls.at(-1)![0] as unknown as Row).detail).toMatchObject({ reshared: true });
  });

  it("revoke clears EVERY shared version of the seat; the founder reads nothing again; audit assessment.share_revoked lists the versions", async () => {
    await upsertAssessment(CTX, { status: "submitted", decision: "track", conviction: 3, risks: [{ title: "r1", severity: "low", source: "evaluator" }] });
    await shareAssessment(CTX, ["risks"]);
    await upsertAssessment(CTX, { status: "submitted", decision: "pass", conviction: 2 }); // v2
    await shareAssessment(CTX, ["risks"]); // v2 shared too
    expect(state.rows.filter((r) => r.shared_with_founder_at)).toHaveLength(2);
    const r = await revokeAssessmentShare(CTX);
    expect(r).toEqual({ ok: true, revoked: 2 });
    expect(state.rows.every((row) => row.shared_with_founder_at == null && (row.shared_fields as string[]).length === 0)).toBe(true);
    const founder = await getAssessment("e-1", { userId: "u-founder", role: "founder" });
    expect(founder.sharedWithFounder).toBeNull();
    await tick();
    const audit = appendAuditMock.mock.calls.at(-1)![0] as unknown as Row;
    expect(audit).toMatchObject({ action: "assessment.share_revoked", detail: { versions: [2, 1], previously_shared_fields: ["risks"] } });
    // revoking again is a no-op
    expect(await revokeAssessmentShare(CTX)).toEqual({ ok: true, revoked: 0 });
  });

  it("another seat's share never touches mine and mine never touches theirs", async () => {
    await upsertAssessment(CTX, { shared_notes: "mine" });
    await upsertAssessment({ ...CTX, assessorUserId: "u-other" }, { shared_notes: "theirs" });
    await shareAssessment({ ...CTX, assessorUserId: "u-other" }, ["shared_notes"]);
    const mine = state.rows.find((r) => r.assessor_user_id === "u-eval")!;
    expect(mine.shared_with_founder_at).toBeNull();
    await revokeAssessmentShare(CTX);
    const theirs = state.rows.find((r) => r.assessor_user_id === "u-other")!;
    expect(theirs.shared_with_founder_at).toBeTruthy();
  });
});

describe("assessmentDelta", () => {
  it("reports changed field names and counts only", () => {
    const prev = mapAssessmentRow({ id: "a", evaluation_id: "e", project_id: "p", assessor_user_id: "u", decision: "track", private_notes: "abc" });
    const next = mapAssessmentRow({ id: "a", evaluation_id: "e", project_id: "p", assessor_user_id: "u", decision: "proceed", private_notes: "abcd", risks: [{ title: "x", severity: "low", source: "ai" }] });
    const d = assessmentDelta(prev, next);
    expect(d.changed).toEqual(["decision", "risks", "private_notes"]);
    expect(d).toMatchObject({ decision: "proceed", risks: 1, questions: 0 });
    expect(JSON.stringify(d)).not.toContain("abcd");
  });
});
