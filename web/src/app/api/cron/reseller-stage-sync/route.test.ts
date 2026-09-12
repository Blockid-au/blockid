// Colocated vitest for /api/cron/reseller-stage-sync (G2 #7, S19-B).
// Pins: Bearer CRON_SECRET gate (401), 503 without Supabase, the
// attribution → customer resolution (user + project subjects), the four
// signal → stage rules, never-backwards / terminal / manual holds, `?dry=1`
// computing everything and writing nothing, the live upsert payload, and
// POST === GET.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[] | { error: string }>,
  upserts: [] as Array<{ table: string; rows: unknown[]; opts: unknown }>,
  supabaseAvailable: true,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (h.supabaseAvailable ? { from: (t: string) => table(t) } : null),
}));

function table(name: string) {
  const b: Record<string, unknown> = {};
  const src = h.tables[name] ?? [];
  const result =
    Array.isArray(src)
      ? { data: src, error: null }
      : { data: null, error: { message: src.error } };
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    in: () => b,
    upsert: (rows: unknown[], opts: unknown) => {
      h.upserts.push({ table: name, rows, opts });
      return Promise.resolve({ data: null, error: null });
    },
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(ok, err),
  });
  return b;
}

import { GET, POST } from "./route";

const SECRET = "test-cron-secret";

function req(path = "/api/cron/reseller-stage-sync", auth: string | null = `Bearer ${SECRET}`) {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request(`https://blockid.au${path}`, { method: "POST", headers });
}

const R1 = "res-1";
const U_LEAD = "u-lead";
const U_SCORED = "u-scored";
const U_ROOM = "u-room";
const U_FUND = "u-fund";
const U_MANUAL = "u-manual";
const U_INVESTED = "u-invested";
const U_BACK = "u-back";

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  h.supabaseAvailable = true;
  h.upserts = [];
  h.tables = {
    resellers: [{ id: R1 }, { id: "res-2" }],
    reseller_attributions: [
      { reseller_id: R1, subject_type: "user", subject_user_id: U_LEAD, subject_project_id: null },
      { reseller_id: R1, subject_type: "user", subject_user_id: U_SCORED, subject_project_id: null },
      // Project-attributed → resolves to its owner U_ROOM.
      { reseller_id: R1, subject_type: "project", subject_user_id: null, subject_project_id: "p-room" },
      { reseller_id: R1, subject_type: "user", subject_user_id: U_FUND, subject_project_id: null },
      { reseller_id: R1, subject_type: "user", subject_user_id: U_MANUAL, subject_project_id: null },
      { reseller_id: R1, subject_type: "user", subject_user_id: U_INVESTED, subject_project_id: null },
      { reseller_id: R1, subject_type: "user", subject_user_id: U_BACK, subject_project_id: null },
      // Dangling project attribution — no owner → skipped, not crashed.
      { reseller_id: R1, subject_type: "project", subject_user_id: null, subject_project_id: "p-orphan" },
    ],
    projects: [
      { id: "p-room", user_id: U_ROOM, created_at: "2026-08-01T00:00:00Z" },
      { id: "p-s", user_id: U_SCORED, created_at: "2026-08-02T00:00:00Z" },
      { id: "p-f", user_id: U_FUND, created_at: "2026-08-03T00:00:00Z" },
      { id: "p-m", user_id: U_MANUAL, created_at: "2026-08-04T00:00:00Z" },
      { id: "p-i", user_id: U_INVESTED, created_at: "2026-08-05T00:00:00Z" },
    ],
    svi_analyses: [
      { user_id: U_SCORED, created_at: "2026-08-10T00:00:00Z" },
      { user_id: U_SCORED, created_at: "2026-08-05T00:00:00Z" },
      { user_id: U_MANUAL, created_at: "2026-08-06T00:00:00Z" },
    ],
    data_rooms: [{ user_id: U_ROOM, created_at: "2026-08-20T00:00:00Z", last_generated_at: "2026-08-19T00:00:00Z" }],
    funding_reports: [{ user_id: U_FUND, created_at: "2026-08-21T00:00:00Z" }],
    fundraise_rounds: [{ account_id: U_INVESTED, created_at: "2026-08-22T00:00:00Z" }],
    reseller_customers: [
      // Manual downgrade on Sep 5 — the Aug SVI run must NOT bounce it.
      { reseller_id: R1, customer_user_id: U_MANUAL, stage: "onboarded", stage_source: "manual", stage_updated_at: "2026-09-05T00:00:00Z" },
      // Terminal — fundraise signal must not move it.
      { reseller_id: R1, customer_user_id: U_INVESTED, stage: "invested", stage_source: "manual", stage_updated_at: "2026-09-01T00:00:00Z" },
      // Already further than the signals say — never backwards.
      { reseller_id: R1, customer_user_id: U_BACK, stage: "fundraising", stage_source: "auto", stage_updated_at: "2026-08-01T00:00:00Z" },
      { reseller_id: R1, customer_user_id: U_SCORED, stage: "onboarded", stage_source: "auto", stage_updated_at: "2026-08-02T00:00:00Z" },
    ],
  };
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("/api/cron/reseller-stage-sync", () => {
  it("401 without / with the wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await POST(req("/api/cron/reseller-stage-sync", null))).status).toBe(401);
    expect((await POST(req("/api/cron/reseller-stage-sync", "Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await POST(req())).status).toBe(401);
    expect(h.upserts).toHaveLength(0);
  });

  it("503 when Supabase is not configured", async () => {
    h.supabaseAvailable = false;
    const res = await POST(req());
    expect(res.status).toBe(503);
  });

  it("dry run computes every transition and writes nothing", async () => {
    const res = await POST(req("/api/cron/reseller-stage-sync?dry=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.dry).toBe(true);
    expect(json.resellers).toBe(2);
    expect(json.customers).toBe(7);
    expect(h.upserts).toHaveLength(0);

    const byUser = Object.fromEntries(
      (json.moves as Array<{ customer_user_id: string; from: string; to: string; seeded: boolean }>).map((m) => [m.customer_user_id, m]),
    );
    // Seeded rows land straight on what the signals support.
    expect(byUser[U_ROOM]).toMatchObject({ from: "lead", to: "data_room", seeded: true });
    expect(byUser[U_FUND]).toMatchObject({ from: "lead", to: "fundraising", seeded: true });
    // Existing auto row advances forward (project → first SVI).
    expect(byUser[U_SCORED]).toMatchObject({ from: "onboarded", to: "scored", seeded: false });
    // Holds.
    expect(byUser[U_MANUAL]).toBeUndefined();
    expect(byUser[U_INVESTED]).toBeUndefined();
    expect(byUser[U_BACK]).toBeUndefined();
    expect(byUser[U_LEAD]).toBeUndefined();
    expect(json.held).toEqual({ terminal: 1, manual: 1, backwards: 1 });
    expect(json.moved).toBe(3);
    // U_LEAD (no signals, no row) is seeded at lead without counting as a move.
    expect(json.seeded).toBe(3);
    expect(json.errors).toEqual([]);
  });

  it("live run upserts auto rows for moved + seeded customers only, keyed on (reseller_id, customer_user_id)", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dry).toBe(false);
    expect(h.upserts).toHaveLength(1);
    const { table: t, rows, opts } = h.upserts[0];
    expect(t).toBe("reseller_customers");
    expect(opts).toEqual({ onConflict: "reseller_id,customer_user_id" });
    const stages = Object.fromEntries(
      (rows as Array<{ customer_user_id: string; stage: string; stage_source: string; stage_set_by: unknown }>).map((r) => [r.customer_user_id, r]),
    );
    expect(Object.keys(stages).sort()).toEqual([U_FUND, U_LEAD, U_ROOM, U_SCORED].sort());
    expect(stages[U_LEAD]).toMatchObject({ stage: "lead", stage_source: "auto", stage_set_by: null });
    expect(stages[U_ROOM]).toMatchObject({ stage: "data_room", stage_source: "auto" });
    expect(stages[U_FUND]).toMatchObject({ stage: "fundraising", stage_source: "auto" });
    expect(stages[U_SCORED]).toMatchObject({ stage: "scored", stage_source: "auto" });
    for (const r of rows as Array<{ reseller_id: string }>) expect(r.reseller_id).toBe(R1);
  });

  it("advances past a manual stage only on evidence dated after the override", async () => {
    (h.tables.data_rooms as unknown[]).push({ user_id: U_MANUAL, created_at: "2026-09-08T00:00:00Z", last_generated_at: null });
    const json = await (await POST(req("/api/cron/reseller-stage-sync?dry=1"))).json();
    const m = (json.moves as Array<{ customer_user_id: string; from: string; to: string }>).find((x) => x.customer_user_id === U_MANUAL);
    expect(m).toMatchObject({ from: "onboarded", to: "data_room" });
  });

  it("returns 500 when the reseller_customers table cannot be read (0333 not applied)", async () => {
    h.tables.reseller_customers = { error: 'relation "reseller_customers" does not exist' };
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, reason: "reseller_customers_query_failed" });
    expect(h.upserts).toHaveLength(0);
  });

  it("collects signal-table errors without aborting, and reports them", async () => {
    h.tables.fundraise_rounds = { error: "timeout" };
    const json = await (await POST(req("/api/cron/reseller-stage-sync?dry=1"))).json();
    expect(json.ok).toBe(true);
    expect(json.errors).toEqual(["fundraise_rounds: timeout"]);
  });

  it("no active resellers → empty summary", async () => {
    h.tables.resellers = [];
    const json = await (await POST(req())).json();
    expect(json).toMatchObject({ ok: true, resellers: 0, customers: 0, moved: 0 });
  });

  it("GET behaves like POST", async () => {
    const headers = new Headers({ authorization: `Bearer ${SECRET}` });
    const res = await GET(new Request("https://blockid.au/api/cron/reseller-stage-sync?dry=1", { headers }));
    expect(res.status).toBe(200);
    expect((await res.json()).dry).toBe(true);
  });
});
