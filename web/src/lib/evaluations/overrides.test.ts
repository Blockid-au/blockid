// Colocated vitest for lib/evaluations/overrides + overrides-shared (G21
// P2-B; migration 0423 assessment_overrides). Pins the pure Zod / mapper /
// reducer half (overrideInputSchema coercion + strictness + the "other"
// reason needs a note refinement, mapOverrideRow's unknown-value fallbacks,
// latestOverrideByDimension, applyOverrides), then the DB layer against a
// small in-memory fake of @/lib/supabase: listBatchOverrides (newest
// first, reviewer names joined from app_users, empty + available:false on
// a missing table) and createOverride (item_not_in_batch, the insert with
// from_value taken from the item, an empty note trimmed to null, the
// assessment.override audit row, the evaluator_reviewed FI event, and the
// unavailable / db_error branches).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Db = { assessment_overrides: Row[]; app_users: Row[] };

const state: { db: Db; errors: Partial<Record<keyof Db, { code?: string; message?: string }>>; configured: boolean; nextId: number } = {
  db: { assessment_overrides: [], app_users: [] },
  errors: {},
  configured: true,
  nextId: 1,
};

function resetDb(): void {
  state.db = { assessment_overrides: [], app_users: [] };
  state.errors = {};
  state.configured = true;
  state.nextId = 1;
}

function builder(table: keyof Db) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: "select" | "insert" = "select";
  let payload: Row | Row[] | null = null;
  let ordering: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;

  const rowsMatching = () => {
    let rows = state.db[table].filter((r) => filters.every((f) => f(r)));
    if (ordering) {
      const { col, asc } = ordering;
      rows = [...rows].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (asc ? 1 : -1));
    }
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  };

  const run = () => {
    const err = state.errors[table];
    if (err) return { data: null, error: err };
    if (op === "insert") {
      const rows = (Array.isArray(payload) ? payload : [payload as Row]).map((r) => ({ id: `ov-${state.nextId++}`, created_at: r.created_at ?? "2026-09-20T00:00:00Z", ...r }));
      state.db[table].push(...rows);
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    return { data: rowsMatching().map((r) => ({ ...r })), error: null };
  };

  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select() {
      return b;
    },
    insert(p: Row | Row[]) {
      op = "insert";
      payload = p;
      return b;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => String(r[col]) === String(val));
      return b;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.map(String).includes(String(r[col])));
      return b;
    },
    order(col: string, o?: { ascending?: boolean }) {
      ordering = { col, asc: o?.ascending !== false };
      return b;
    },
    limit(n: number) {
      lim = n;
      return b;
    },
    maybeSingle() {
      const { data, error } = run();
      const rows = (data ?? []) as Row[];
      return Promise.resolve({ data: rows[0] ?? null, error });
    },
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(ok, err);
    },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.configured ? { from: (t: keyof Db) => builder(t) } : null),
}));

const { auditMock, emitMock } = vi.hoisted(() => ({
  auditMock: vi.fn(async () => ({ id: 1n, curr_hash: "h" })),
  emitMock: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));
vi.mock("@/lib/analytics/fi-events", () => ({ emitFiEvent: (name: unknown, envelope: unknown) => emitMock(name, envelope) }));

import {
  applyOverrides,
  createOverride,
  latestOverrideByDimension,
  listBatchOverrides,
  mapOverrideRow,
  overrideInputSchema,
} from "./overrides";

beforeEach(() => {
  resetDb();
  auditMock.mockClear();
  emitMock.mockClear();
});

const SCORES = { ftv: 80, mpc: 60, ptd: 70, tre: 40, cgh: 50, iri: 55, lco: 65, svm: 75 };

describe("overrideInputSchema", () => {
  it("coerces item_id to a positive int, accepts a dimension key or total, to_value 0..100, a known reason_code", () => {
    const r = overrideInputSchema.safeParse({ item_id: "7", dimension: "tre", to_value: "62", reason_code: "sector_context" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ item_id: 7, to_value: 62 });
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "total", to_value: 66, reason_code: "data_error" }).success).toBe(true);
    expect(overrideInputSchema.safeParse({ item_id: 0, dimension: "tre", to_value: 50, reason_code: "data_error" }).success).toBe(false);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "bogus", to_value: 50, reason_code: "data_error" }).success).toBe(false);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 101, reason_code: "data_error" }).success).toBe(false);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: -1, reason_code: "data_error" }).success).toBe(false);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 50, reason_code: "bogus" }).success).toBe(false);
  });

  it("a note over 2000 chars is rejected; strict — unknown keys rejected", () => {
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 50, reason_code: "data_error", note: "x".repeat(2001) }).success).toBe(false);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 50, reason_code: "data_error", note: "x".repeat(2000) }).success).toBe(true);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 50, reason_code: "data_error", extra: 1 }).success).toBe(false);
  });

  it('reason_code "other" requires a non-empty note', () => {
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 50, reason_code: "other" }).success).toBe(false);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 50, reason_code: "other", note: "  " }).success).toBe(false);
    expect(overrideInputSchema.safeParse({ item_id: 1, dimension: "tre", to_value: 50, reason_code: "other", note: "context" }).success).toBe(true);
  });
});

describe("mapOverrideRow", () => {
  it("falls back to total / other for unknown dimension / reason, and coerces numeric strings", () => {
    const r = mapOverrideRow({ id: "ov-1", batch_id: "b-1", item_id: "7", project_id: "p-1", dimension: "bogus", reason_code: "bogus", from_value: "40", to_value: "62", note: null, reviewer_id: "u-1", created_at: "2026-09-12T00:00:00Z" });
    expect(r).toEqual({ id: "ov-1", batchId: "b-1", itemId: 7, projectId: "p-1", dimension: "total", fromValue: 40, toValue: 62, reasonCode: "other", note: null, reviewerId: "u-1", reviewerName: null, createdAt: "2026-09-12T00:00:00Z" });
  });

  it("keeps a known dimension / reason, and defaults from_value to null / to_value to 0 when unparsable", () => {
    const r = mapOverrideRow({ id: "ov-2", batch_id: "b-1", item_id: 1, project_id: "p-1", dimension: "tre", reason_code: "sector_context", from_value: null, to_value: "not-a-number", note: "ctx", reviewer_id: null, created_at: "" });
    expect(r).toMatchObject({ dimension: "tre", reasonCode: "sector_context", fromValue: null, toValue: 0, note: "ctx", reviewerId: null });
  });
});

describe("latestOverrideByDimension / applyOverrides", () => {
  it("keeps the latest (by createdAt) row per dimension, out of order input", () => {
    const rows = [
      mapOverrideRow({ id: "1", batch_id: "b", item_id: 1, project_id: "p", dimension: "tre", reason_code: "sector_context", from_value: 40, to_value: 50, note: null, reviewer_id: "u", created_at: "2026-09-11T00:00:00Z" }),
      mapOverrideRow({ id: "2", batch_id: "b", item_id: 1, project_id: "p", dimension: "tre", reason_code: "sector_context", from_value: 50, to_value: 62, note: null, reviewer_id: "u", created_at: "2026-09-12T00:00:00Z" }),
    ];
    const latest = latestOverrideByDimension(rows);
    expect(latest.tre?.id).toBe("2");
  });

  it("applyOverrides applies the latest per dimension; a `total` override never changes the dimension map", () => {
    const rows = [
      mapOverrideRow({ id: "1", batch_id: "b", item_id: 1, project_id: "p", dimension: "tre", reason_code: "sector_context", from_value: 40, to_value: 62, note: null, reviewer_id: "u", created_at: "2026-09-12T00:00:00Z" }),
      mapOverrideRow({ id: "2", batch_id: "b", item_id: 1, project_id: "p", dimension: "total", reason_code: "sector_context", from_value: 71, to_value: 66, note: null, reviewer_id: "u", created_at: "2026-09-12T01:00:00Z" }),
    ];
    expect(applyOverrides(SCORES, rows)).toEqual({ ...SCORES, tre: 62 });
  });

  it("returns the same scores object when nothing changed, and null in / no rows -> null", () => {
    expect(applyOverrides(SCORES, [])).toBe(SCORES);
    expect(applyOverrides(null, [])).toBeNull();
  });
});

describe("listBatchOverrides", () => {
  it("orders newest first and attaches reviewer names", async () => {
    state.db.assessment_overrides.push(
      { id: "ov-1", batch_id: "b-1", item_id: 1, project_id: "p-1", dimension: "tre", from_value: 40, to_value: 50, reason_code: "sector_context", note: null, reviewer_id: "u-1", created_at: "2026-09-11T00:00:00Z" },
      { id: "ov-2", batch_id: "b-1", item_id: 1, project_id: "p-1", dimension: "tre", from_value: 50, to_value: 62, reason_code: "sector_context", note: null, reviewer_id: "u-1", created_at: "2026-09-12T00:00:00Z" },
    );
    state.db.app_users.push({ id: "u-1", display_name: "Jo Reviewer", email: "jo@x.test" });
    const { rows, available } = await listBatchOverrides("b-1");
    expect(available).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(["ov-2", "ov-1"]);
    expect(rows.every((r) => r.reviewerName === "Jo Reviewer")).toBe(true);
  });

  it("falls back to email when display_name is missing, and leaves reviewerName null when the reviewer row is absent", async () => {
    state.db.assessment_overrides.push({ id: "ov-1", batch_id: "b-1", item_id: 1, project_id: "p-1", dimension: "tre", from_value: 40, to_value: 50, reason_code: "sector_context", note: null, reviewer_id: "u-1", created_at: "2026-09-11T00:00:00Z" });
    state.db.app_users.push({ id: "u-1", display_name: null, email: "jo@x.test" });
    const { rows } = await listBatchOverrides("b-1");
    expect(rows[0].reviewerName).toBe("jo@x.test");
  });

  it("empty + available:false on a missing table", async () => {
    state.errors.assessment_overrides = { code: "42P01", message: "relation does not exist" };
    expect(await listBatchOverrides("b-1")).toEqual({ rows: [], available: false });
  });

  it("empty when there is no Supabase client", async () => {
    state.configured = false;
    expect(await listBatchOverrides("b-1")).toEqual({ rows: [], available: false });
  });
});

describe("createOverride", () => {
  const reviewer = { id: "u-1", email: "jo@x.test", plan: "vc_small" };

  it("item_not_in_batch when the item is null", async () => {
    const r = await createOverride({ batchId: "b-1", reviewer, item: null, body: { item_id: 1, dimension: "tre", to_value: 62, reason_code: "sector_context", note: null } });
    expect(r).toEqual({ ok: false, error: "item_not_in_batch", message: "That startup is not in this cohort" });
  });

  it("inserts with from_value taken from the item, trims a blank note to null, audits, and emits evaluator_reviewed", async () => {
    const r = await createOverride({
      batchId: "b-1",
      reviewer,
      item: { id: 1, projectId: "p-1", fromValue: 40 },
      body: { item_id: 1, dimension: "tre", to_value: 62, reason_code: "sector_context", note: "   " },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.override).toMatchObject({ batchId: "b-1", itemId: 1, projectId: "p-1", dimension: "tre", fromValue: 40, toValue: 62, reasonCode: "sector_context", note: null });
    expect(state.db.assessment_overrides).toHaveLength(1);
    expect(state.db.assessment_overrides[0]).toMatchObject({ from_value: 40, to_value: 62, note: null, reviewer_id: "u-1" });

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      action: "assessment.override",
      resource_type: "evaluation_batch_item",
      resource_id: "1",
      detail: { batch_id: "b-1", project_id: "p-1", dimension: "tre", from: 40, to: 62, reason_code: "sector_context", has_note: false },
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe("evaluator_reviewed");
    expect(emitMock.mock.calls[0][1]).toMatchObject({ organisation: "u-1", startup: "p-1", plan: "vc_small", channel: "cohort", userId: "u-1", email: "jo@x.test", action: "override", dimension: "tre", reason_code: "sector_context", batch_id: "b-1" });
  });

  it("keeps a real note and marks has_note true in the audit detail", async () => {
    await createOverride({ batchId: "b-1", reviewer, item: { id: 2, projectId: "p-2", fromValue: null }, body: { item_id: 2, dimension: "total", to_value: 66, reason_code: "other", note: "context here" } });
    expect(state.db.assessment_overrides[0]).toMatchObject({ from_value: null, note: "context here" });
    expect(auditMock.mock.calls[0][0]).toMatchObject({ detail: { has_note: true, from: null } });
  });

  it("unavailable on a missing table", async () => {
    state.errors.assessment_overrides = { code: "42P01", message: "relation does not exist" };
    const r = await createOverride({ batchId: "b-1", reviewer, item: { id: 1, projectId: "p-1", fromValue: 40 }, body: { item_id: 1, dimension: "tre", to_value: 62, reason_code: "sector_context", note: null } });
    expect(r).toEqual({ ok: false, error: "unavailable", message: "Overrides are not available yet (migration 0423 pending)" });
    expect(auditMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("db_error on any other insert failure", async () => {
    state.errors.assessment_overrides = { code: "23505", message: "duplicate key" };
    const r = await createOverride({ batchId: "b-1", reviewer, item: { id: 1, projectId: "p-1", fromValue: 40 }, body: { item_id: 1, dimension: "tre", to_value: 62, reason_code: "sector_context", note: null } });
    expect(r).toEqual({ ok: false, error: "db_error", message: "duplicate key" });
  });

  it("unavailable when there is no Supabase client", async () => {
    state.configured = false;
    const r = await createOverride({ batchId: "b-1", reviewer, item: { id: 1, projectId: "p-1", fromValue: 40 }, body: { item_id: 1, dimension: "tre", to_value: 62, reason_code: "sector_context", note: null } });
    expect(r).toEqual({ ok: false, error: "unavailable", message: "Database not configured" });
  });
});
