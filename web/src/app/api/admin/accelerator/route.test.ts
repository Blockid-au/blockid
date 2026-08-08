// Colocated vitest for /api/admin/accelerator — P9-admin-accelerator-route-test.
//
// The route backs the admin "Accelerator cohorts" console: GET lists every
// cohort with member counts + average SVI + a 4-bucket score distribution,
// POST provisions a new cohort. Regressions here are the usual admin-route
// pattern: (a) dropping the admin gate so any signed-in user can enumerate
// or create cohorts, (b) letting Supabase misconfig 500 instead of 503,
// (c) drifting the aggregation math the console dashboard keys off (avg,
// distribution buckets, member_count), (d) generating a bad slug on POST
// so uniqueness collisions surface as 500s instead of 409s, and
// (e) forgetting to accept a role="admin" caller (route allows either
// admin@blockid.au OR role="admin").

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock plumbing (hoisted so module-eval sees the mocks) --------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{
    id: string;
    email: string;
    role?: "user" | "admin";
  } | null>>(),
  getSupabaseAdmin: vi.fn<() => unknown>(),
  // Per-test fixtures (reset in beforeEach)
  cohortRows: [] as unknown[],
  cohortErr: null as null | { message: string },
  memberRows: [] as unknown[],
  memberErr: null as null | { message: string },
  sviRows: [] as unknown[],
  insertPayload: null as unknown,
  insertReturn: null as unknown,
  insertError: null as null | { message: string; code?: string },
  sviInFilterCaptured: null as null | string[],
  cohortsOrderCaptured: null as null | { column: string; opts: unknown },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));

import { GET, POST } from "./route";

// --- Fixture helpers -----------------------------------------------------

const ADMIN_EMAIL = { id: "u-1", email: "admin@blockid.au" };
const ADMIN_ROLE = { id: "u-2", email: "someone@else.io", role: "admin" as const };
const NON_ADMIN = { id: "u-42", email: "not-admin@example.com", role: "user" as const };

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/admin/accelerator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// Build a thenable that resolves to {data, error} — matches how the route
// awaits every supabase call (it never calls .then explicitly).
function resolved<T>(value: T): PromiseLike<T> {
  return { then: (fn: (v: T) => unknown) => Promise.resolve(fn(value)) } as PromiseLike<T>;
}

// Fake supabase-admin router. GET path selects three tables; POST path
// runs .insert().select().single(). The fake dispatches on the table
// argument and returns the fixtures configured in mocks.*.
function fakeSupabase(): unknown {
  return {
    from(table: string) {
      if (table === "accelerator_cohorts") {
        return {
          select() {
            return {
              order(column: string, opts: unknown) {
                mocks.cohortsOrderCaptured = { column, opts };
                return resolved({ data: mocks.cohortRows, error: mocks.cohortErr });
              },
            };
          },
          insert(payload: unknown) {
            mocks.insertPayload = payload;
            return {
              select() {
                return {
                  single() {
                    return resolved({
                      data: mocks.insertReturn,
                      error: mocks.insertError,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "cohort_members") {
        return {
          select() {
            return resolved({ data: mocks.memberRows, error: mocks.memberErr });
          },
        };
      }
      if (table === "svi_accounts") {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                mocks.sviInFilterCaptured = ids;
                return resolved({ data: mocks.sviRows, error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected supabase.from(${table})`);
    },
  };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset().mockResolvedValue(ADMIN_EMAIL);
  mocks.getSupabaseAdmin.mockReset().mockReturnValue(fakeSupabase());
  mocks.cohortRows = [];
  mocks.cohortErr = null;
  mocks.memberRows = [];
  mocks.memberErr = null;
  mocks.sviRows = [];
  mocks.insertPayload = null;
  mocks.insertReturn = null;
  mocks.insertError = null;
  mocks.sviInFilterCaptured = null;
  mocks.cohortsOrderCaptured = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
describe("GET auth gate", () => {
  it("returns 401 when getCurrentUser() is null and never touches supabase", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "Unauthorized" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 401 when caller is authenticated but role !== 'admin' and email !== admin@blockid.au", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "Unauthorized" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("admits admin@blockid.au even without an explicit role field", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", email: "admin@blockid.au" });
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("admits any user whose role === 'admin' regardless of email", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN_ROLE);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------------------------
describe("GET supabase availability", () => {
  it("returns 503 when getSupabaseAdmin() returns null (not 500) so ops can distinguish misconfig from bug", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ error: "Supabase not configured" });
  });
});

// -------------------------------------------------------------------------
describe("GET supabase failures surface as 500 with the driver message", () => {
  it("returns 500 with the cohorts fetch error message", async () => {
    mocks.cohortErr = { message: "relation accelerator_cohorts does not exist" };
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({
      error: "relation accelerator_cohorts does not exist",
    });
  });

  it("returns 500 with the members fetch error message (and never falls through to svi lookup)", async () => {
    mocks.cohortRows = [{ id: "c1", name: "A", slug: "a" }];
    mocks.memberErr = { message: "permission denied on cohort_members" };
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({
      error: "permission denied on cohort_members",
    });
    expect(mocks.sviInFilterCaptured).toBeNull();
  });
});

// -------------------------------------------------------------------------
describe("GET aggregation math", () => {
  it("returns { ok: true, cohorts: [] } when the cohorts table is empty (and never queries svi_accounts)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: true, cohorts: [] });
    expect(mocks.sviInFilterCaptured).toBeNull();
  });

  it("orders cohorts by created_at descending (newest first — matches the admin UI table)", async () => {
    await GET();
    expect(mocks.cohortsOrderCaptured).toEqual({
      column: "created_at",
      opts: { ascending: false },
    });
  });

  it("reports member_count=0 and avg_svi=0 for a cohort with no members", async () => {
    mocks.cohortRows = [{ id: "c1", name: "Empty", slug: "empty" }];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ member_count: number; avg_svi: number }>)[0];
    expect(cohort.member_count).toBe(0);
    expect(cohort.avg_svi).toBe(0);
  });

  it("counts members even when their svi_account_id is null (member_count is total members, not scored members)", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [
      { cohort_id: "c1", email: "a@x", startup_name: "A", svi_account_id: null },
      { cohort_id: "c1", email: "b@x", startup_name: "B", svi_account_id: null },
    ];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ member_count: number; avg_svi: number }>)[0];
    expect(cohort.member_count).toBe(2);
    expect(cohort.avg_svi).toBe(0);
    // No svi_account_ids to look up → never hit svi_accounts.
    expect(mocks.sviInFilterCaptured).toBeNull();
  });

  it("computes avg_svi as rounded mean over members with score > 0 (score=0 members are excluded from the mean)", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [
      { cohort_id: "c1", email: "a@x", startup_name: "A", svi_account_id: "s1" },
      { cohort_id: "c1", email: "b@x", startup_name: "B", svi_account_id: "s2" },
      { cohort_id: "c1", email: "c@x", startup_name: "C", svi_account_id: "s3" },
    ];
    mocks.sviRows = [
      { id: "s1", current_svi: 90 },
      { id: "s2", current_svi: 110 },
      { id: "s3", current_svi: 0 }, // filtered by (s) => s > 0
    ];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ member_count: number; avg_svi: number }>)[0];
    expect(cohort.member_count).toBe(3);
    expect(cohort.avg_svi).toBe(100); // (90 + 110) / 2 = 100
  });

  it("rounds the average with Math.round half-to-even semantics of JS (90.5 → 91)", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [
      { cohort_id: "c1", email: "a@x", startup_name: "A", svi_account_id: "s1" },
      { cohort_id: "c1", email: "b@x", startup_name: "B", svi_account_id: "s2" },
    ];
    mocks.sviRows = [
      { id: "s1", current_svi: 90 },
      { id: "s2", current_svi: 91 },
    ];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ avg_svi: number }>)[0];
    expect(cohort.avg_svi).toBe(91); // 90.5 → JS Math.round → 91
  });

  it("treats a missing svi_accounts row (id present but no join match) as score 0 → excluded from avg", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [
      { cohort_id: "c1", email: "a@x", startup_name: "A", svi_account_id: "s1" },
      { cohort_id: "c1", email: "b@x", startup_name: "B", svi_account_id: "s2" },
    ];
    mocks.sviRows = [{ id: "s1", current_svi: 120 }]; // s2 unmapped
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ avg_svi: number }>)[0];
    expect(cohort.avg_svi).toBe(120); // only s1 counted
  });

  it("treats a null current_svi on svi_accounts as 0 (nullish coalescing at route.ts:52)", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [
      { cohort_id: "c1", email: "a@x", startup_name: "A", svi_account_id: "s1" },
    ];
    mocks.sviRows = [{ id: "s1", current_svi: null }];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ member_count: number; avg_svi: number }>)[0];
    expect(cohort.member_count).toBe(1);
    expect(cohort.avg_svi).toBe(0);
  });

  it("computes svi_distribution with the four canonical buckets: <80, 80-100, 100-120, >=120", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [
      { cohort_id: "c1", svi_account_id: "s1" },
      { cohort_id: "c1", svi_account_id: "s2" },
      { cohort_id: "c1", svi_account_id: "s3" },
      { cohort_id: "c1", svi_account_id: "s4" },
      { cohort_id: "c1", svi_account_id: "s5" },
    ];
    mocks.sviRows = [
      { id: "s1", current_svi: 60 }, // <80
      { id: "s2", current_svi: 85 }, // 80-100
      { id: "s3", current_svi: 100 }, // 100-120
      { id: "s4", current_svi: 130 }, // >=120
      { id: "s5", current_svi: 120 }, // >=120 boundary
    ];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ svi_distribution: Record<string, number> }>)[0];
    expect(cohort.svi_distribution).toEqual({
      below80: 1,
      range80to100: 1,
      range100to120: 1,
      above120: 2,
    });
  });

  it("bucket 100to120 is half-open: 100 inclusive, 120 exclusive (matches range80to100 semantics)", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [{ cohort_id: "c1", svi_account_id: "s1" }];
    mocks.sviRows = [{ id: "s1", current_svi: 120 }];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<{ svi_distribution: Record<string, number> }>)[0];
    expect(cohort.svi_distribution.range100to120).toBe(0);
    expect(cohort.svi_distribution.above120).toBe(1);
  });

  it("scopes members strictly by cohort_id — cross-cohort members do not bleed into another cohort's stats", async () => {
    mocks.cohortRows = [
      { id: "c1", name: "One", slug: "one" },
      { id: "c2", name: "Two", slug: "two" },
    ];
    mocks.memberRows = [
      { cohort_id: "c1", svi_account_id: "sA" },
      { cohort_id: "c2", svi_account_id: "sB" },
      { cohort_id: "c2", svi_account_id: "sC" },
    ];
    mocks.sviRows = [
      { id: "sA", current_svi: 100 },
      { id: "sB", current_svi: 60 },
      { id: "sC", current_svi: 200 },
    ];
    const body = await jsonOf(await GET());
    const cohorts = body.cohorts as Array<{
      id: string;
      member_count: number;
      avg_svi: number;
    }>;
    const c1 = cohorts.find((c) => c.id === "c1")!;
    const c2 = cohorts.find((c) => c.id === "c2")!;
    expect(c1.member_count).toBe(1);
    expect(c1.avg_svi).toBe(100);
    expect(c2.member_count).toBe(2);
    expect(c2.avg_svi).toBe(130); // (60 + 200) / 2
  });

  it("preserves every original cohort field via spread (name, slug, organization, etc.) alongside the computed fields", async () => {
    const original = {
      id: "c1",
      name: "Techstars Sydney",
      slug: "techstars-sydney",
      organization: "Techstars",
      manager_email: "mgr@techstars.com",
      start_date: "2026-01-01",
      end_date: "2026-04-01",
      created_at: "2026-01-01T00:00:00Z",
    };
    mocks.cohortRows = [original];
    const body = await jsonOf(await GET());
    const cohort = (body.cohorts as Array<Record<string, unknown>>)[0];
    for (const [k, v] of Object.entries(original)) {
      expect(cohort[k]).toEqual(v);
    }
    expect(cohort.member_count).toBe(0);
    expect(cohort.avg_svi).toBe(0);
    expect(cohort.svi_distribution).toBeDefined();
  });

  it("only requests svi_accounts rows for the ids actually referenced by members (no over-fetch)", async () => {
    mocks.cohortRows = [{ id: "c1", name: "C", slug: "c" }];
    mocks.memberRows = [
      { cohort_id: "c1", svi_account_id: "s1" },
      { cohort_id: "c1", svi_account_id: null },
      { cohort_id: "c1", svi_account_id: "s2" },
    ];
    mocks.sviRows = [
      { id: "s1", current_svi: 80 },
      { id: "s2", current_svi: 100 },
    ];
    await GET();
    expect(mocks.sviInFilterCaptured).toEqual(["s1", "s2"]);
  });
});

// -------------------------------------------------------------------------
describe("POST auth gate", () => {
  it("returns 401 when getCurrentUser() is null and never touches supabase", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(jsonReq({ name: "X", managerEmail: "m@x" }));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "Unauthorized" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.insertPayload).toBeNull();
  });

  it("returns 401 for a signed-in non-admin — never inserts a cohort", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN);
    const res = await POST(jsonReq({ name: "X", managerEmail: "m@x" }));
    expect(res.status).toBe(401);
    expect(mocks.insertPayload).toBeNull();
  });
});

// -------------------------------------------------------------------------
describe("POST supabase availability", () => {
  it("returns 503 when getSupabaseAdmin() returns null (not 500)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(jsonReq({ name: "X", managerEmail: "m@x" }));
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ error: "Supabase not configured" });
  });
});

// -------------------------------------------------------------------------
describe("POST payload validation", () => {
  it("returns 400 when name is missing", async () => {
    const res = await POST(jsonReq({ managerEmail: "m@x" }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({
      error: "name and managerEmail are required",
    });
    expect(mocks.insertPayload).toBeNull();
  });

  it("returns 400 when managerEmail is missing", async () => {
    const res = await POST(jsonReq({ name: "Antler AU" }));
    expect(res.status).toBe(400);
    expect(mocks.insertPayload).toBeNull();
  });

  it("returns 400 when name is an empty string (falsy)", async () => {
    const res = await POST(jsonReq({ name: "", managerEmail: "m@x" }));
    expect(res.status).toBe(400);
    expect(mocks.insertPayload).toBeNull();
  });
});

// -------------------------------------------------------------------------
describe("POST slug generation", () => {
  it("lowercases, replaces non-alphanumerics with dashes, and trims leading/trailing dashes", async () => {
    mocks.insertReturn = { id: "c1", slug: "techstars-sydney-2026" };
    await POST(
      jsonReq({ name: "Techstars Sydney 2026!", managerEmail: "mgr@techstars.com" }),
    );
    const payload = mocks.insertPayload as { slug: string; name: string };
    expect(payload.slug).toBe("techstars-sydney-2026");
    expect(payload.name).toBe("Techstars Sydney 2026!");
  });

  it("collapses runs of non-alphanumeric characters into a single dash", async () => {
    mocks.insertReturn = { id: "c1", slug: "a-b-c" };
    await POST(jsonReq({ name: "A  &&  B -- C", managerEmail: "m@x" }));
    const payload = mocks.insertPayload as { slug: string };
    expect(payload.slug).toBe("a-b-c");
  });

  it("strips leading and trailing dashes produced by leading/trailing punctuation", async () => {
    mocks.insertReturn = { id: "c1", slug: "middle" };
    await POST(jsonReq({ name: "!!!Middle!!!", managerEmail: "m@x" }));
    const payload = mocks.insertPayload as { slug: string };
    expect(payload.slug).toBe("middle");
  });
});

// -------------------------------------------------------------------------
describe("POST payload shape sent to supabase", () => {
  it("defaults optional organization/start_date/end_date to null when the caller omits them", async () => {
    mocks.insertReturn = { id: "c1" };
    await POST(jsonReq({ name: "X", managerEmail: "m@x" }));
    const p = mocks.insertPayload as Record<string, unknown>;
    expect(p.organization).toBeNull();
    expect(p.start_date).toBeNull();
    expect(p.end_date).toBeNull();
    expect(p.manager_email).toBe("m@x");
  });

  it("passes through organization/start_date/end_date verbatim when provided", async () => {
    mocks.insertReturn = { id: "c1" };
    await POST(
      jsonReq({
        name: "X",
        managerEmail: "m@x",
        organization: "Antler",
        startDate: "2026-02-01",
        endDate: "2026-05-01",
      }),
    );
    const p = mocks.insertPayload as Record<string, unknown>;
    expect(p.organization).toBe("Antler");
    expect(p.start_date).toBe("2026-02-01");
    expect(p.end_date).toBe("2026-05-01");
  });

  it("treats an empty-string organization as null (falsy → null via the || fallback)", async () => {
    mocks.insertReturn = { id: "c1" };
    await POST(jsonReq({ name: "X", managerEmail: "m@x", organization: "" }));
    const p = mocks.insertPayload as Record<string, unknown>;
    expect(p.organization).toBeNull();
  });
});

// -------------------------------------------------------------------------
describe("POST supabase result handling", () => {
  it("returns 409 with a friendly message when insert fails with the unique-violation code 23505", async () => {
    mocks.insertError = { message: "duplicate key value", code: "23505" };
    const res = await POST(jsonReq({ name: "X", managerEmail: "m@x" }));
    expect(res.status).toBe(409);
    expect(await jsonOf(res)).toEqual({
      error: "A cohort with this name/slug already exists",
    });
  });

  it("returns 500 with the driver message on any non-23505 insert error", async () => {
    mocks.insertError = { message: "connection refused", code: "08001" };
    const res = await POST(jsonReq({ name: "X", managerEmail: "m@x" }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ error: "connection refused" });
  });

  it("returns 201 with { ok: true, cohort } on success (matches the admin UI envelope)", async () => {
    const created = {
      id: "c1",
      name: "Antler AU",
      slug: "antler-au",
      organization: "Antler",
      manager_email: "mgr@antler.co",
      start_date: null,
      end_date: null,
    };
    mocks.insertReturn = created;
    const res = await POST(jsonReq({ name: "Antler AU", managerEmail: "mgr@antler.co" }));
    expect(res.status).toBe(201);
    expect(await jsonOf(res)).toEqual({ ok: true, cohort: created });
  });
});
