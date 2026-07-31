import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only accelerator-portal helpers used by
// the /workspace/accelerator surface. Sibling advisor-portal.ts already has
// a colocated suite (advisor-portal.test.ts); accelerator-portal.ts shares
// the same "degrade to a placeholder shape until the 0080 migration lands"
// contract but was untested. This pins the three exported surfaces:
//   * isSupabaseConfigured()=false → placeholder / demo, no query issued
//   * admin client null → placeholder / demo, no query issued
//   * 42P01 (table missing) → placeholder / demo (page still renders)
//   * other DB errors → placeholder / [] (never throws to the caller)
//   * happy paths return the mapped shape with Number/String coercion
//   * the *exact* Supabase chain shape each helper ships (table name,
//     select columns, eq filters, order/limit/maybeSingle terminator) — a
//     silent regression here would either 500 /workspace/accelerator or
//     silently return zero applicants when the migration ships.

interface CapturedState {
  supabaseConfigured: boolean;
  adminNull: boolean;
  throwOnFrom: boolean;
  result: { data: unknown; error: { code?: string; message: string } | null };
  captured: {
    from: string | null;
    selectCols: string | null;
    eqs: Array<{ col: string; val: string }>;
    order: { col: string; opts: { ascending: boolean } } | null;
    limit: number | null;
    maybeSingleCalled: boolean;
    thenCalled: boolean;
  };
}

const state: CapturedState = {
  supabaseConfigured: true,
  adminNull: false,
  throwOnFrom: false,
  result: { data: null, error: null },
  captured: {
    from: null,
    selectCols: null,
    eqs: [],
    order: null,
    limit: null,
    maybeSingleCalled: false,
    thenCalled: false,
  },
};

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.supabaseConfigured,
  getSupabaseAdmin: () => {
    if (state.adminNull) return null;
    return {
      from(table: string) {
        state.captured.from = table;
        if (state.throwOnFrom) {
          throw new Error("boom from .from()");
        }
        const resolver = () => Promise.resolve(state.result);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          eq(col: string, val: string) {
            state.captured.eqs.push({ col, val });
            return chain;
          },
          order(col: string, opts: { ascending: boolean }) {
            state.captured.order = { col, opts };
            return chain;
          },
          limit(n: number) {
            state.captured.limit = n;
            return chain;
          },
          maybeSingle() {
            state.captured.maybeSingleCalled = true;
            return resolver();
          },
          // Thenable so `await chain` (listApplicants awaits .order() directly)
          // resolves to state.result — same terminator wire as .maybeSingle.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then(onFulfilled: any, onRejected: any) {
            state.captured.thenCalled = true;
            return resolver().then(onFulfilled, onRejected);
          },
        };
        return {
          select(cols: string) {
            state.captured.selectCols = cols;
            return chain;
          },
        };
      },
    };
  },
}));

import {
  getCohort,
  listApplicants,
  getCohortSviAvg,
  type Cohort,
  type ApplicantRow,
  type CohortSviAvg,
} from "./accelerator-portal";

beforeEach(() => {
  state.supabaseConfigured = true;
  state.adminNull = false;
  state.throwOnFrom = false;
  state.result = { data: null, error: null };
  state.captured = {
    from: null,
    selectCols: null,
    eqs: [],
    order: null,
    limit: null,
    maybeSingleCalled: false,
    thenCalled: false,
  };
});

// ---------------------------------------------------------------------------
// getCohort
// ---------------------------------------------------------------------------

describe("getCohort", () => {
  it("returns the placeholder cohort when Supabase is not configured — no query issued", async () => {
    state.supabaseConfigured = false;
    const c = await getCohort("u-1");
    expect(c.isPlaceholder).toBe(true);
    expect(c.id).toBe("cohort-preview");
    expect(c.name).toBe("Q3 2026 · BlockID Founders");
    expect(c.founderCount).toBe(12);
    expect(c.batchSviAvg).toBeCloseTo(68.4, 5);
    expect(c.batchSviTrend).toBeCloseTo(2.1, 5);
    expect(state.captured.from).toBeNull();
  });

  it("returns the placeholder cohort when the admin client is null — no query issued", async () => {
    state.adminNull = true;
    const c = await getCohort("u-1");
    expect(c.isPlaceholder).toBe(true);
    expect(state.captured.from).toBeNull();
  });

  it("propagates a caller-supplied cohortId into the placeholder id", async () => {
    state.supabaseConfigured = false;
    const c = await getCohort("u-1", "cohort-xyz");
    expect(c.id).toBe("cohort-xyz");
  });

  it("placeholder startsAt/endsAt bracket now (starts 30d ago, ends 60d out)", async () => {
    state.supabaseConfigured = false;
    const now = Date.now();
    const c = await getCohort("u-1");
    const starts = Date.parse(c.startsAt);
    const ends = Date.parse(c.endsAt);
    // 30 days back ±5s of test runtime
    expect(starts).toBeGreaterThan(now - 30 * 86_400_000 - 5_000);
    expect(starts).toBeLessThan(now - 30 * 86_400_000 + 5_000);
    expect(ends).toBeGreaterThan(now + 60 * 86_400_000 - 5_000);
    expect(ends).toBeLessThan(now + 60 * 86_400_000 + 5_000);
  });

  it("uses the .eq('id', cohortId).maybeSingle() chain when cohortId is supplied", async () => {
    state.result = { data: null, error: null };
    await getCohort("u-42", "cohort-9");
    expect(state.captured.from).toBe("cohorts");
    expect(state.captured.selectCols).toBe(
      "id,name,founder_count,starts_at,ends_at,batch_svi_avg,batch_svi_trend",
    );
    expect(state.captured.eqs).toEqual([
      { col: "owner_id", val: "u-42" },
      { col: "id", val: "cohort-9" },
    ]);
    expect(state.captured.order).toBeNull();
    expect(state.captured.limit).toBeNull();
    expect(state.captured.maybeSingleCalled).toBe(true);
  });

  it("uses the .order('starts_at' desc).limit(1).maybeSingle() chain when cohortId is omitted", async () => {
    state.result = { data: null, error: null };
    await getCohort("u-42");
    expect(state.captured.from).toBe("cohorts");
    expect(state.captured.eqs).toEqual([{ col: "owner_id", val: "u-42" }]);
    expect(state.captured.order).toEqual({
      col: "starts_at",
      opts: { ascending: false },
    });
    expect(state.captured.limit).toBe(1);
    expect(state.captured.maybeSingleCalled).toBe(true);
  });

  it("returns the placeholder when the table is missing (Postgres 42P01)", async () => {
    state.result = {
      data: null,
      error: { code: "42P01", message: 'relation "cohorts" does not exist' },
    };
    const c = await getCohort("u-1");
    expect(c.isPlaceholder).toBe(true);
    expect(c.id).toBe("cohort-preview");
  });

  it("returns the placeholder on any non-42P01 DB error — never throws", async () => {
    state.result = {
      data: null,
      error: { code: "PGRST123", message: "network" },
    };
    const c = await getCohort("u-1");
    expect(c.isPlaceholder).toBe(true);
  });

  it("returns the placeholder when data is null and no error is present", async () => {
    state.result = { data: null, error: null };
    const c = await getCohort("u-1");
    expect(c.isPlaceholder).toBe(true);
  });

  it("returns the placeholder when .from() throws — try/catch caught", async () => {
    state.throwOnFrom = true;
    const c = await getCohort("u-1");
    expect(c.isPlaceholder).toBe(true);
  });

  it("maps a full-shape row to Cohort with String/Number coercion and no isPlaceholder flag", async () => {
    state.result = {
      data: {
        id: 42, // numeric → String()
        name: "Alpha Cohort",
        founder_count: "9", // string → Number()
        starts_at: "2026-01-01T00:00:00Z",
        ends_at: "2026-04-01T00:00:00Z",
        batch_svi_avg: "71.2",
        batch_svi_trend: "-1.4",
      },
      error: null,
    };
    const c = await getCohort("u-1");
    expect(c).toEqual<Cohort>({
      id: "42",
      name: "Alpha Cohort",
      founderCount: 9,
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: "2026-04-01T00:00:00Z",
      batchSviAvg: 71.2,
      batchSviTrend: -1.4,
    });
    expect(c.isPlaceholder).toBeUndefined();
  });

  it("falls back to placeholder.name when name/starts_at/ends_at are missing but id is present", async () => {
    state.result = {
      data: {
        id: "c-only",
        // name / starts_at / ends_at absent
        founder_count: null, // → 0
        batch_svi_avg: null, // → 0
        batch_svi_trend: null, // → 0
      },
      error: null,
    };
    const c = await getCohort("u-1");
    expect(c.id).toBe("c-only");
    expect(c.name).toBe("Q3 2026 · BlockID Founders"); // placeholder fallback
    expect(c.founderCount).toBe(0);
    expect(c.batchSviAvg).toBe(0);
    expect(c.batchSviTrend).toBe(0);
    // starts_at / ends_at fall back to the placeholder ISO strings
    expect(() => new Date(c.startsAt).toISOString()).not.toThrow();
    expect(() => new Date(c.endsAt).toISOString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listApplicants
// ---------------------------------------------------------------------------

describe("listApplicants", () => {
  it("returns the demo applicants when Supabase is not configured — no query issued", async () => {
    state.supabaseConfigured = false;
    const rows = await listApplicants("cohort-x");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.id)).toEqual([
      "cohort-x-a1",
      "cohort-x-a3",
      "cohort-x-a5",
      "cohort-x-a7",
    ]);
    expect(state.captured.from).toBeNull();
  });

  it("returns the demo applicants when the admin client is null — no query issued", async () => {
    state.adminNull = true;
    const rows = await listApplicants("cohort-y");
    expect(rows.map((r) => r.startupName)).toEqual([
      "Vaultbase",
      "Signalcraft",
      "Ledgerloom",
      "Coinstash",
    ]);
    expect(rows.map((r) => r.status)).toEqual([
      "submitted",
      "reviewing",
      "accepted",
      "rejected",
    ]);
    expect(rows.map((r) => r.svi)).toEqual([71, 66, 78, 42]);
    expect(state.captured.from).toBeNull();
  });

  it("uses the select+eq+order chain shipped by the module (awaited directly, no .maybeSingle)", async () => {
    state.result = { data: [], error: null };
    await listApplicants("cohort-42");
    expect(state.captured.from).toBe("cohort_applicants");
    expect(state.captured.selectCols).toBe(
      "id,startup_name,founder_name,submitted_at,status,svi",
    );
    expect(state.captured.eqs).toEqual([
      { col: "cohort_id", val: "cohort-42" },
    ]);
    expect(state.captured.order).toEqual({
      col: "submitted_at",
      opts: { ascending: false },
    });
    expect(state.captured.limit).toBeNull();
    expect(state.captured.maybeSingleCalled).toBe(false);
    expect(state.captured.thenCalled).toBe(true);
  });

  it("returns the demo applicants when the table is missing (Postgres 42P01)", async () => {
    state.result = {
      data: null,
      error: { code: "42P01", message: 'relation "cohort_applicants" does not exist' },
    };
    const rows = await listApplicants("cohort-1");
    expect(rows).toHaveLength(4);
    expect(rows[0].id).toBe("cohort-1-a1");
  });

  it("returns [] on any non-42P01 DB error (honest empty state, not fake demo rows)", async () => {
    state.result = {
      data: null,
      error: { code: "PGRST123", message: "network" },
    };
    const rows = await listApplicants("cohort-1");
    expect(rows).toEqual([]);
  });

  it("returns [] when data is null and no error is present (?? [] fallback)", async () => {
    state.result = { data: null, error: null };
    const rows = await listApplicants("cohort-1");
    expect(rows).toEqual([]);
  });

  it("returns the demo applicants when .from() throws — try/catch caught", async () => {
    state.throwOnFrom = true;
    const rows = await listApplicants("cohort-boom");
    expect(rows.map((r) => r.id)).toEqual([
      "cohort-boom-a1",
      "cohort-boom-a3",
      "cohort-boom-a5",
      "cohort-boom-a7",
    ]);
  });

  it("maps a full-shape row to ApplicantRow with String/Number coercion", async () => {
    state.result = {
      data: [
        {
          id: 101,
          startup_name: "Northwind",
          founder_name: "Ada Nguyen",
          submitted_at: "2026-07-15T10:00:00Z",
          status: "accepted",
          svi: "88.5",
        },
      ],
      error: null,
    };
    const [row] = await listApplicants("cohort-1");
    expect(row).toEqual<ApplicantRow>({
      id: "101",
      startupName: "Northwind",
      founderName: "Ada Nguyen",
      submittedAt: "2026-07-15T10:00:00Z",
      status: "accepted",
      svi: 88.5,
    });
  });

  it("coerces missing string fields to '' and preserves null svi", async () => {
    state.result = {
      data: [
        {
          id: "a-1",
          // startup_name absent → ""
          // founder_name absent → ""
          // submitted_at absent → ""
          status: "submitted",
          svi: null,
        },
      ],
      error: null,
    };
    const [row] = await listApplicants("cohort-1");
    expect(row).toEqual<ApplicantRow>({
      id: "a-1",
      startupName: "",
      founderName: "",
      submittedAt: "",
      status: "submitted",
      svi: null,
    });
  });

  it("treats svi=undefined as null (row.svi == null covers both null and undefined)", async () => {
    state.result = {
      data: [{ id: "a-2", status: "reviewing" }], // svi absent
      error: null,
    };
    const [row] = await listApplicants("cohort-1");
    expect(row.svi).toBeNull();
  });

  it("normaliseStatus: passes 'reviewing' | 'accepted' | 'rejected' verbatim, defaults everything else to 'submitted'", async () => {
    state.result = {
      data: [
        { id: "1", status: "reviewing" },
        { id: "2", status: "accepted" },
        { id: "3", status: "rejected" },
        { id: "4", status: "submitted" },
        { id: "5", status: "REVIEWING" }, // upper-case → normalised
        { id: "6", status: null }, // → submitted
        { id: "7", status: undefined }, // → submitted
        { id: "8", status: "" }, // → submitted
        { id: "9", status: "made-up-bucket" }, // → submitted
      ],
      error: null,
    };
    const rows = await listApplicants("cohort-1");
    expect(rows.map((r) => r.status)).toEqual([
      "reviewing",
      "accepted",
      "rejected",
      "submitted",
      "reviewing",
      "submitted",
      "submitted",
      "submitted",
      "submitted",
    ]);
  });

  it("preserves data-array order (no client-side re-sort — DB order wins)", async () => {
    state.result = {
      data: [
        { id: "c", status: "submitted" },
        { id: "a", status: "submitted" },
        { id: "b", status: "submitted" },
      ],
      error: null,
    };
    const rows = await listApplicants("cohort-1");
    expect(rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("demo applicants use per-i submitted_at timestamps offset from now (chronological order desc)", async () => {
    state.supabaseConfigured = false;
    const now = Date.now();
    const rows = await listApplicants("cohort-t");
    const ts = rows.map((r) => Date.parse(r.submittedAt));
    // Row 0 is i=1 (1d ago), row 3 is i=7 (7d ago) — strictly decreasing.
    expect(ts[0]).toBeGreaterThan(ts[1]);
    expect(ts[1]).toBeGreaterThan(ts[2]);
    expect(ts[2]).toBeGreaterThan(ts[3]);
    // Rough windows (±10 min of test runtime).
    expect(ts[0]).toBeGreaterThan(now - 1 * 86_400_000 - 600_000);
    expect(ts[3]).toBeLessThan(now - 7 * 86_400_000 + 600_000);
  });
});

// ---------------------------------------------------------------------------
// getCohortSviAvg
// ---------------------------------------------------------------------------

describe("getCohortSviAvg", () => {
  it("returns the placeholder when Supabase is not configured — no query issued", async () => {
    state.supabaseConfigured = false;
    const s = await getCohortSviAvg("cohort-x");
    expect(s).toEqual<CohortSviAvg>({
      cohortId: "cohort-x",
      avg: 68.4,
      trend: 2.1,
      sampleSize: 12,
      isPlaceholder: true,
    });
    expect(state.captured.from).toBeNull();
  });

  it("returns the placeholder when the admin client is null — no query issued", async () => {
    state.adminNull = true;
    const s = await getCohortSviAvg("cohort-y");
    expect(s.isPlaceholder).toBe(true);
    expect(s.cohortId).toBe("cohort-y");
    expect(state.captured.from).toBeNull();
  });

  it("uses the shipped select+eq+order+limit+maybeSingle chain", async () => {
    state.result = { data: null, error: null };
    await getCohortSviAvg("cohort-42");
    expect(state.captured.from).toBe("cohort_svi_snapshots");
    expect(state.captured.selectCols).toBe("avg,trend,sample_size");
    expect(state.captured.eqs).toEqual([
      { col: "cohort_id", val: "cohort-42" },
    ]);
    expect(state.captured.order).toEqual({
      col: "ts",
      opts: { ascending: false },
    });
    expect(state.captured.limit).toBe(1);
    expect(state.captured.maybeSingleCalled).toBe(true);
  });

  it("returns the placeholder when the table is missing (Postgres 42P01)", async () => {
    state.result = {
      data: null,
      error: { code: "42P01", message: 'relation "cohort_svi_snapshots" does not exist' },
    };
    const s = await getCohortSviAvg("cohort-1");
    expect(s.isPlaceholder).toBe(true);
  });

  it("returns the placeholder on any non-42P01 DB error", async () => {
    state.result = {
      data: null,
      error: { code: "PGRST123", message: "network" },
    };
    const s = await getCohortSviAvg("cohort-1");
    expect(s.isPlaceholder).toBe(true);
  });

  it("returns the placeholder when data is null and no error is present", async () => {
    state.result = { data: null, error: null };
    const s = await getCohortSviAvg("cohort-1");
    expect(s.isPlaceholder).toBe(true);
  });

  it("returns the placeholder when .from() throws — try/catch caught", async () => {
    state.throwOnFrom = true;
    const s = await getCohortSviAvg("cohort-1");
    expect(s.isPlaceholder).toBe(true);
  });

  it("maps a full-shape row to CohortSviAvg with Number coercion and no isPlaceholder flag", async () => {
    state.result = {
      data: { avg: "74.6", trend: "-0.9", sample_size: "17" },
      error: null,
    };
    const s = await getCohortSviAvg("cohort-42");
    expect(s).toEqual<CohortSviAvg>({
      cohortId: "cohort-42",
      avg: 74.6,
      trend: -0.9,
      sampleSize: 17,
    });
    expect(s.isPlaceholder).toBeUndefined();
  });

  it("coerces missing avg/trend/sample_size to 0 (?? 0 fallback)", async () => {
    state.result = { data: {}, error: null };
    const s = await getCohortSviAvg("cohort-42");
    expect(s.avg).toBe(0);
    expect(s.trend).toBe(0);
    expect(s.sampleSize).toBe(0);
    expect(s.cohortId).toBe("cohort-42");
    expect(s.isPlaceholder).toBeUndefined();
  });
});
