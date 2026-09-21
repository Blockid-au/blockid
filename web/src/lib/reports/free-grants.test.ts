// Colocated vitest for the free-allowance ledger (G25-C, migration 0439).
//
// A thenable query-builder double stands in for the admin client. What it
// pins: the identity pair (email vs hash), the fail-open reads, the
// sequence retry on a unique violation (23505 → next sequence → allowance
// used), the release that only removes an unattached reservation, the
// delivered stamp by analysis id, the bounded metrics read with the
// converted-to-paid lookups, and the /api/status cache.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Table = { rows?: Array<Record<string, unknown>>; count?: number; error?: { message: string; code?: string } | null; errors?: Array<{ message: string; code?: string } | null> };
const db: { tables: Record<string, Table>; ops: Array<{ table: string; op: string; args: unknown[] }> } = { tables: {}, ops: [] };

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (db.tables.__none ? null : fakeClient()),
}));

function fakeClient() {
  return {
    from: (table: string) => {
      const t = db.tables[table] ?? {};
      const nextError = () => (t.errors && t.errors.length > 0 ? t.errors.shift() ?? null : t.error ?? null);
      const chain: Record<string, unknown> = {};
      const self = (op: string) => (...args: unknown[]) => {
        db.ops.push({ table, op, args });
        return chain;
      };
      for (const op of ["select", "insert", "update", "delete", "eq", "is", "in", "gte", "lt", "order", "limit", "maybeSingle", "single"]) chain[op] = self(op);
      chain.then = (res: (v: unknown) => void) => {
        const error = nextError();
        if (error) return res({ data: null, count: null, error });
        const single = db.ops.some((o) => o.table === table && (o.op === "single" || o.op === "maybeSingle"));
        const rows = t.rows ?? [];
        return res({ data: single ? (rows[0] ?? null) : rows, count: t.count ?? rows.length, error: null });
      };
      return chain;
    },
  };
}

import {
  attachAnalysis,
  countFreeReportsSubmittedToday,
  countIpFreeReportsToday,
  freeReportsCapReached,
  grantForAnalysis,
  grantedAnalysisIds,
  releaseStaleReservations,
  hashReportEmail,
  markDelivered,
  readFreeReportMetrics,
  readFreeReportMetricsCached,
  recordSubmission,
  releaseGrant,
  remainingFreeReports,
  reportEmailIdentity,
  resetFreeReportMetricsCache,
} from "./free-grants";

function row(seq: 1 | 2, over: Record<string, unknown> = {}) {
  return {
    id: `g${seq}`,
    email_hash: hashReportEmail("founder@example.com"),
    email: "founder@example.com",
    project_id: null,
    analysis_id: null,
    ip_hash: null,
    submitted_at: "2026-09-21T01:00:00.000Z",
    delivered_at: null,
    delivery_status: "queued",
    sequence_no: seq,
    source: "guest",
    ...over,
  };
}

beforeEach(() => {
  db.tables = {};
  db.ops = [];
  resetFreeReportMetricsCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reportEmailIdentity", () => {
  it("stores the cleaned address but hashes the NORMALISED one", () => {
    const id = reportEmailIdentity(" A.B+news@Gmail.com ");
    expect(id).toEqual({ email: "a.b+news@gmail.com", normalised: "ab@gmail.com", emailHash: hashReportEmail("ab@gmail.com") });
    expect(reportEmailIdentity("nope")).toBeNull();
    expect(hashReportEmail("ab@gmail.com")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashReportEmail("ab@gmail.com")).not.toBe(hashReportEmail("ab@example.com"));
  });
});

describe("remainingFreeReports", () => {
  it("counts the rows on the hash, newest sequence first", async () => {
    db.tables.free_report_grants = { rows: [row(2), row(1)] };
    const r = await remainingFreeReports("founder@example.com");
    expect(r).toMatchObject({ used: 2, remaining: 0 });
    expect(r.grants.map((g) => g.sequence_no)).toEqual([2, 1]);
    expect(db.ops.find((o) => o.op === "eq")?.args).toEqual(["email_hash", hashReportEmail("founder@example.com")]);
  });

  it("fails open: malformed address, no client, or a query error → nothing used", async () => {
    expect(await remainingFreeReports("nope")).toMatchObject({ used: 0, remaining: 2 });
    db.tables.__none = {};
    expect(await remainingFreeReports("founder@example.com")).toMatchObject({ used: 0, remaining: 2 });
    db.tables = { free_report_grants: { error: { message: "boom" } } };
    expect(await remainingFreeReports("founder@example.com")).toMatchObject({ used: 0, remaining: 2 });
  });
});

describe("recordSubmission — the UNIQUE (email_hash, sequence_no) index is the arbiter", () => {
  it("reserves the requested sequence with status queued", async () => {
    db.tables.free_report_grants = { rows: [row(1)] };
    const r = await recordSubmission({ email: "founder@example.com", sequenceNo: 1, source: "guest", ipHash: "h" });
    expect(r).toMatchObject({ ok: true, grant: { sequence_no: 1 } });
    const insert = db.ops.find((o) => o.op === "insert")!;
    expect(insert.args[0]).toMatchObject({ email: "founder@example.com", email_hash: hashReportEmail("founder@example.com"), sequence_no: 1, source: "guest", ip_hash: "h", delivery_status: "queued", analysis_id: null });
  });

  it("23505 on sequence 1 → tries 2; 23505 on 2 → allowance_used", async () => {
    db.tables.free_report_grants = { rows: [row(2)], errors: [{ message: "dup", code: "23505" }, null] };
    expect(await recordSubmission({ email: "founder@example.com", sequenceNo: 1, source: "guest" })).toMatchObject({ ok: true, grant: { sequence_no: 2 } });
    db.ops = [];
    db.tables.free_report_grants = { errors: [{ message: "dup", code: "23505" }, { message: "dup", code: "23505" }] };
    expect(await recordSubmission({ email: "founder@example.com", sequenceNo: 1, source: "guest" })).toEqual({ ok: false, reason: "allowance_used" });
    expect(db.ops.filter((o) => o.op === "insert")).toHaveLength(2);
  });

  it("a sequence-2 request never falls back to 1; other errors → unavailable; malformed → invalid_email", async () => {
    db.tables.free_report_grants = { errors: [{ message: "dup", code: "23505" }] };
    expect(await recordSubmission({ email: "founder@example.com", sequenceNo: 2, source: "guest" })).toEqual({ ok: false, reason: "allowance_used" });
    db.tables.free_report_grants = { error: { message: "down", code: "57P01" } };
    expect(await recordSubmission({ email: "founder@example.com", sequenceNo: 1, source: "guest" })).toEqual({ ok: false, reason: "unavailable" });
    expect(await recordSubmission({ email: "nope", sequenceNo: 1, source: "guest" })).toEqual({ ok: false, reason: "invalid_email" });
  });
});

describe("attachAnalysis / releaseGrant / markDelivered / grantForAnalysis", () => {
  it("attach points the reservation at the analyses row", async () => {
    db.tables.free_report_grants = {};
    expect(await attachAnalysis("g1", "a1")).toBe(true);
    expect(db.ops.find((o) => o.op === "update")?.args[0]).toEqual({ analysis_id: "a1" });
    expect(db.ops.find((o) => o.op === "eq")?.args).toEqual(["id", "g1"]);
  });

  it("release deletes only an UNATTACHED reservation", async () => {
    db.tables.free_report_grants = {};
    await releaseGrant("g1");
    expect(db.ops.map((o) => o.op)).toEqual(["delete", "eq", "is"]);
    expect(db.ops[2].args).toEqual(["analysis_id", null]);
  });

  it("sent stamps delivered_at + status by analysis id and returns the row; failed stamps only the status", async () => {
    db.tables.free_report_grants = { rows: [row(1, { analysis_id: "a1", delivery_status: "sent", delivered_at: "2026-09-21T02:00:00.000Z" })] };
    const now = new Date("2026-09-21T02:00:00.000Z");
    const r = await markDelivered("a1", "sent", now);
    expect(r?.delivery_status).toBe("sent");
    expect(db.ops.find((o) => o.op === "update")?.args[0]).toEqual({ delivery_status: "sent", delivered_at: now.toISOString() });
    expect(db.ops.find((o) => o.op === "eq")?.args).toEqual(["analysis_id", "a1"]);
    db.ops = [];
    await markDelivered("a1", "failed");
    expect(db.ops.find((o) => o.op === "update")?.args[0]).toEqual({ delivery_status: "failed" });
  });

  it("no grant for the analysis → null (an entitled run)", async () => {
    db.tables.free_report_grants = { rows: [] };
    expect(await grantForAnalysis("a9")).toBeNull();
    expect(await markDelivered("a9", "sent")).toBeNull();
  });
});

describe("grantedAnalysisIds / releaseStaleReservations (review 2026-09-21)", () => {
  it("answers the ids that carry a grant; empty on failure / no ids", async () => {
    db.tables.free_report_grants = { rows: [{ analysis_id: "a1" }, { analysis_id: "a3" }, { analysis_id: null }] };
    expect(Array.from(await grantedAnalysisIds(["a1", "a2", "a3"])).sort()).toEqual(["a1", "a3"]);
    expect(db.ops.find((o) => o.op === "in")?.args).toEqual(["analysis_id", ["a1", "a2", "a3"]]);
    expect((await grantedAnalysisIds([])).size).toBe(0);
    db.tables.free_report_grants = { error: { message: "boom" } };
    expect((await grantedAnalysisIds(["a1"])).size).toBe(0);
  });

  it("releases only unattached, queued reservations older than an hour", async () => {
    db.tables.free_report_grants = { rows: [{ id: "g1" }, { id: "g2" }] };
    const now = new Date("2026-09-21T12:00:00.000Z");
    expect(await releaseStaleReservations(now)).toBe(2);
    expect(db.ops.map((o) => o.op)).toEqual(["delete", "is", "eq", "lt", "select"]);
    expect(db.ops[1].args).toEqual(["analysis_id", null]);
    expect(db.ops[2].args).toEqual(["delivery_status", "queued"]);
    expect(db.ops[3].args).toEqual(["submitted_at", "2026-09-21T11:00:00.000Z"]);
    db.tables.free_report_grants = { error: { message: "boom" } };
    expect(await releaseStaleReservations(now)).toBe(0);
  });
});

describe("the daily counts", () => {
  it("ipToday filters on the hash + today's UTC start; unknown hash / no client → null", async () => {
    db.tables.free_report_grants = { count: 2 };
    expect(await countIpFreeReportsToday("h", new Date("2026-09-21T13:00:00.000Z"))).toBe(2);
    expect(db.ops.find((o) => o.op === "gte")?.args).toEqual(["submitted_at", "2026-09-21T00:00:00.000Z"]);
    expect(await countIpFreeReportsToday(null)).toBeNull();
    db.tables.__none = {};
    expect(await countIpFreeReportsToday("h")).toBeNull();
  });

  it("submittedToday → the count; a failed read → 0 (the cap never fires by accident)", async () => {
    db.tables.free_report_grants = { count: 7 };
    expect(await countFreeReportsSubmittedToday()).toBe(7);
    db.tables.free_report_grants = { error: { message: "boom" } };
    expect(await countFreeReportsSubmittedToday()).toBe(0);
  });

  it("capReached compares today's count with FREE_REPORTS_DAILY_CAP", async () => {
    db.tables.free_report_grants = { count: 50 };
    expect(await freeReportsCapReached(new Date(), {} as NodeJS.ProcessEnv)).toBe(true);
    expect(await freeReportsCapReached(new Date(), { FREE_REPORTS_DAILY_CAP: "100" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("readFreeReportMetrics — bounded, fail-soft, with the converted-to-paid lookups", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");

  it("folds the ledger and counts distinct addresses that later paid (guest order or member TBR order)", async () => {
    db.tables.free_report_grants = {
      rows: [
        row(1, { email: "a@example.com", email_hash: "ha", delivery_status: "sent", delivered_at: "2026-09-21T02:00:00.000Z" }),
        row(2, { email: "a@example.com", email_hash: "ha" }),
        row(1, { email: "b@example.com", email_hash: "hb", delivery_status: "sent", delivered_at: "2026-09-20T02:00:00.000Z", submitted_at: "2026-09-20T01:00:00.000Z" }),
        row(1, { email: "c@example.com", email_hash: "hc" }),
      ],
    };
    db.tables.guest_analyses = { rows: [{ email: "a@example.com" }] };
    db.tables.app_users = { rows: [{ id: "u-b", email: "b@example.com" }, { id: "u-c", email: "c@example.com" }] };
    db.tables.report_orders = { rows: [{ user_id: "u-b" }] };
    const m = await readFreeReportMetrics({ now, env: { FREE_REPORTS_DAILY_CAP: "40" } as NodeJS.ProcessEnv });
    expect(m).toMatchObject({ submitted: 4, delivered: 2, unique_emails: 3, today: 3, cap: 40, converted_to_paid: 2 });
    expect(m.last_7_days).toHaveLength(7);
    expect(db.ops.find((o) => o.table === "free_report_grants" && o.op === "limit")?.args).toEqual([20_000]);
  });

  it("a failed ledger read → the empty block with the cap; no client → the same", async () => {
    db.tables.free_report_grants = { error: { message: "boom" } };
    expect(await readFreeReportMetrics({ now })).toMatchObject({ submitted: 0, cap: 50 });
    db.tables = { __none: {} };
    expect(await readFreeReportMetrics({ now })).toMatchObject({ submitted: 0, unique_emails: 0, cap: 50 });
  });

  it("the cached reader reuses the last value for 60 s", async () => {
    db.tables.free_report_grants = { rows: [row(1)] };
    db.tables.guest_analyses = { rows: [] };
    db.tables.app_users = { rows: [] };
    const first = await readFreeReportMetricsCached(now);
    db.tables.free_report_grants = { rows: [row(1), row(2)] };
    expect((await readFreeReportMetricsCached(new Date(now.getTime() + 30_000))).submitted).toBe(first.submitted);
    expect((await readFreeReportMetricsCached(new Date(now.getTime() + 61_000))).submitted).toBe(2);
  });
});
