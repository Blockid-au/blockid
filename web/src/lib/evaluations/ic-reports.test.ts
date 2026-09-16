// Colocated vitest for lib/evaluations/ic-reports (G13-W5-D3). Pins:
// clampIcKind (Scout → one_page, Firm+ may memo), icMemoWeightsAllowed
// (Program+ only — F3 / R5), buildIcSections (weights null unless allowed ·
// weighted score always · decision record · seats only on the memo ·
// private_notes NEVER in the record), the row mapper, createIcReport
// (insert shape + audit `ic_report.exported`, 42P01 → unavailable) and the
// visibility helpers.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
interface Queued { table: string; op?: string; data?: unknown; error?: unknown; }
interface Captured { table: string; op: string | null; payload: unknown; }
const state = { configured: true, queue: [] as Queued[], calls: [] as Captured[] };
function next(table: string, op: string | null) {
  let idx = state.queue.findIndex((q) => q.table === table && (!q.op || q.op === op));
  if (idx === -1) idx = state.queue.findIndex((q) => q.table === table && !q.op);
  if (idx === -1) return { data: null, error: null };
  const [q] = state.queue.splice(idx, 1);
  return { data: q.data ?? null, error: q.error ?? null };
}
function builder(table: string) {
  const c: Captured = { table, op: null, payload: null };
  state.calls.push(c);
  const b: Record<string, unknown> = {};
  const chain = () => b;
  const resolve = () => Promise.resolve(next(table, c.op));
  Object.assign(b, {
    select() { if (!c.op) c.op = "select"; return b; },
    insert(p: unknown) { c.op = "insert"; c.payload = p; return b; },
    update(p: unknown) { c.op = "update"; c.payload = p; return b; },
    eq: chain, in: chain, order: chain, limit: chain,
    maybeSingle: resolve,
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return resolve().then(ok, err); },
  });
  return b;
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (state.configured ? { from: (t: string) => builder(t) } : null) }));
const { auditMock } = vi.hoisted(() => ({ auditMock: vi.fn(async () => ({ id: 1n, curr_hash: "h" })) }));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));

import { buildIcSections, clampIcKind, createIcReport, getIcReport, icMemoWeightsAllowed, listIcReports, mapIcReportRow } from "./ic-reports";
import { fakeView } from "./ic-reports.fixture";

beforeEach(() => {
  state.configured = true;
  state.queue = [];
  state.calls = [];
  auditMock.mockClear();
});

describe("plan rules (F3 / S6)", () => {
  it("clampIcKind: Scout → one_page always; Firm / Program default to memo and may pick one_page", () => {
    expect(clampIcKind("investor_angel", undefined)).toBe("one_page");
    expect(clampIcKind("investor_angel", "memo")).toBe("one_page");
    expect(clampIcKind("investor_advisor", undefined)).toBe("memo");
    expect(clampIcKind("investor_advisor", "one_page")).toBe("one_page");
    expect(clampIcKind("investor_vc_small", "memo")).toBe("memo");
    expect(clampIcKind("founder_free", undefined)).toBe("one_page");
  });
  it("icMemoWeightsAllowed: raw weights only for Program and above", () => {
    expect(icMemoWeightsAllowed("investor_angel")).toBe(false);
    expect(icMemoWeightsAllowed("investor_advisor")).toBe(false);
    expect(icMemoWeightsAllowed("investor_vc_small")).toBe(true);
    expect(icMemoWeightsAllowed("accelerator_starter")).toBe(true);
    expect(icMemoWeightsAllowed(null)).toBe(false);
  });
});

describe("buildIcSections", () => {
  it("memo: weights only when allowed, weighted score always, decision record, seat views, consensus — never private notes", () => {
    const view = fakeView();
    const s = buildIcSections(view, "memo", { weightsShown: false });
    expect(s.summary).toMatchObject({ startupName: "Acme Robotics", sector: "Advanced manufacturing", stageLabel: "Seed", svi: 62, percentile: 61, consentTier: "reports_shared", evidenceItems: 3 });
    expect(s.svi_table[0]).toEqual({ dim: "TRE", title: "Traction & Revenue Evidence", weight: null, score: 61, weighted: 12.2, p50: 52, band: "developing", myRating: 4, myStance: "agree" });
    expect(buildIcSections(view, "memo", { weightsShown: true }).svi_table[0].weight).toBe(20);
    expect(s.valuation.consensus?.midAud).toBe(5_000_000);
    expect(s.valuation.methods).toHaveLength(1); // scorecard (not applicable) dropped
    expect(s.valuation.myView?.lowAud).toBe(4_000_000);
    expect(s.thesis_fit).toEqual({ pct: 71, mandateLabel: "Seed deep-tech AU", fitScore: 77, reasons: ["Industry match", "Stage match"], gaps: ["Cheque above range"] });
    expect(s.risks).toHaveLength(2);
    expect(s.questions[0].text).toBe("When does the licence renew?");
    expect(s.decision).toEqual({ value: "proceed", conviction: 4, status: "submitted", version: 2, submittedAt: "2026-09-16T00:00:00Z", assessorUserId: "u-eval", sharedNotes: "Strong team." });
    expect(s.seats.map((x) => [x.displayName, x.decision, x.topRisk])).toEqual([["Me", "proceed", "Licence renewal"], ["Ben", "track", "Churn"]]);
    expect(s.consensus).toMatchObject({ label: "Firm consensus (2/2)", aggregate: "split", tally: { pass: 0, track: 1, proceed: 1 } });
    expect(JSON.stringify(s)).not.toContain("PRIVATE-NOTE-BODY");
  });

  it("one_page: no seats / consensus; no assessment → empty decision record; single seat → consensus null", () => {
    const one = buildIcSections(fakeView(), "one_page", { weightsShown: false });
    expect(one.seats).toEqual([]);
    expect(one.consensus).toBeNull();
    const none = buildIcSections(fakeView({ mine: null, consensus: null }), "memo", { weightsShown: false });
    expect(none.decision).toEqual({ value: null, conviction: null, status: null, version: null, submittedAt: null, assessorUserId: null, sharedNotes: null });
    expect(none.risks).toEqual([]);
    expect(none.svi_table[0].myRating).toBeNull();
    expect(none.seats).toEqual([]);
  });
});

describe("persistence", () => {
  it("createIcReport inserts the frozen record (FKs to evaluation / project only; user + assessment ids bare) and audits ic_report.exported", async () => {
    state.queue.push({ table: "ic_reports", op: "insert", data: { id: "ic-1", evaluation_id: "e-1", project_id: "p-1", user_id: "u-eval", assessment_id: "a-1", snapshot_id: "s-2", kind: "memo", sections: { decision: { value: "proceed" } }, weights_shown: false, generated_by: "u-eval", pages: null, created_at: "2026-09-16T01:00:00Z" } });
    const r = await createIcReport({ view: fakeView(), userId: "u-eval", kind: "memo", weightsShown: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({ id: "ic-1", kind: "memo", weightsShown: false, generatedBy: "u-eval", createdAt: "2026-09-16T01:00:00Z" });
    const ins = state.calls.find((c) => c.table === "ic_reports" && c.op === "insert")!.payload as Row;
    expect(ins).toMatchObject({ evaluation_id: "e-1", project_id: "p-1", user_id: "u-eval", assessment_id: "a-1", snapshot_id: "s-2", kind: "memo", weights_shown: false, generated_by: "u-eval" });
    expect(JSON.stringify(ins.sections)).not.toContain("PRIVATE-NOTE-BODY");
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "ic_report.exported", resource_type: "ic_report", resource_id: "ic-1", detail: { evaluation_id: "e-1", kind: "memo", decision: "proceed", seats: 2 } });
  });

  it("42P01 → unavailable; list / get scope to the visible user ids; mapIcReportRow defaults", async () => {
    state.queue.push({ table: "ic_reports", op: "insert", error: { code: "42P01", message: "relation \"ic_reports\" does not exist" } });
    expect(await createIcReport({ view: fakeView(), userId: "u-eval", kind: "one_page", weightsShown: false })).toMatchObject({ ok: false, error: "unavailable" });
    state.queue.push({ table: "ic_reports", op: "select", data: [{ id: "ic-1", evaluation_id: "e-1", project_id: "p-1", user_id: "u-b", kind: "bogus", sections: null, created_at: "x" }] });
    const list = await listIcReports("e-1", ["u-eval", "u-b"]);
    expect(list.available).toBe(true);
    expect(list.reports[0]).toMatchObject({ kind: "memo", sections: {}, generatedBy: "u-b", pages: null });
    expect(await listIcReports("e-1", [])).toEqual({ available: false, reports: [] });
    state.queue.push({ table: "ic_reports", op: "select", data: null });
    expect(await getIcReport("ic-9", "e-1", ["u-eval"])).toBeNull();
    expect(mapIcReportRow({ id: "x", evaluation_id: "e", project_id: "p", user_id: "u", kind: "one_page", weights_shown: true, pages: 1 })).toMatchObject({ kind: "one_page", weightsShown: true, pages: 1, generatedBy: "u" });
  });
});
