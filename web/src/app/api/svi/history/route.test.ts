// Colocated vitest for GET /api/svi/history.
//
// Route returns the caller's last 12 svi_snapshots (reversed into chronological
// order), plus derived week/month deltas keyed off the current_svi on the
// resolved svi_accounts row. Suite pins the silent-regression surface the
// route relies on:
//   - 401 when unauthenticated
//   - 200 empty envelope when supabase is not configured
//   - 200 empty envelope when findOrCreateSVIAccount resolves to null
//   - 200 empty envelope when svi_accounts row missing for the account id
//   - 500 when svi_snapshots fetch surfaces a supabase error
//   - happy path: snapshots reversed into chronological order (oldest first)
//   - weekDelta pulled from the most recent snapshot's delta field
//   - weekDelta defaults to 0 when the most recent snapshot has null delta
//   - monthDelta uses rows[3] as the ~4-week anchor when ≥ 4 rows exist
//   - monthDelta falls back to the oldest available row when < 4 rows exist
//   - monthDelta = 0 when no snapshots exist
//   - project_id from getProjectIdFromRequest is forwarded to findOrCreateSVIAccount
//   - svi_snapshots query is scoped to the resolved account_id (not user email)

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  getProjectIdFromRequest: vi.fn(),
  findOrCreateSVIAccount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
  isSupabaseConfigured: () => mocks.isSupabaseConfigured(),
}));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
  findOrCreateSVIAccount: (email: string, projectId: string | null) =>
    mocks.findOrCreateSVIAccount(email, projectId),
}));

import { GET } from "./route";

type AccountRow = { id: string; current_svi: number | null; current_stage: number | null } | null;
type SnapshotRow = {
  snapshot_date: string;
  svi_total: number;
  delta: number | null;
  stage?: number;
};

const USER = { id: "u-1", email: "founder@example.com" };

function makeSb(opts: {
  account?: AccountRow;
  snapshots?: SnapshotRow[] | null;
  snapshotsError?: { message: string } | null;
}) {
  const accountCalls: Array<{ op: string; args: unknown[] }> = [];
  const snapshotCalls: Array<{ op: string; args: unknown[] }> = [];

  const accountBuilder: Record<string, unknown> = {};
  const chainAccount = (op: string) =>
    (...args: unknown[]) => {
      accountCalls.push({ op, args });
      return accountBuilder;
    };
  accountBuilder.select = chainAccount("select");
  accountBuilder.eq = chainAccount("eq");
  accountBuilder.single = vi.fn(async () => ({ data: opts.account ?? null }));

  const snapshotBuilder: Record<string, unknown> = {};
  const chainSnapshot = (op: string) =>
    (...args: unknown[]) => {
      snapshotCalls.push({ op, args });
      return snapshotBuilder;
    };
  snapshotBuilder.select = chainSnapshot("select");
  snapshotBuilder.eq = chainSnapshot("eq");
  snapshotBuilder.order = chainSnapshot("order");
  // .limit(12) is the terminal call — return a thenable so `await` resolves it.
  snapshotBuilder.limit = vi.fn(async () => ({
    data: opts.snapshots ?? null,
    error: opts.snapshotsError ?? null,
  }));

  const from = vi.fn((table: string) => {
    if (table === "svi_accounts") return accountBuilder;
    if (table === "svi_snapshots") return snapshotBuilder;
    throw new Error(`unexpected supabase.from(${table})`);
  });

  return { sb: { from }, accountCalls, snapshotCalls };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.isSupabaseConfigured.mockReset();
  mocks.getProjectIdFromRequest.mockReset();
  mocks.findOrCreateSVIAccount.mockReset();

  mocks.isSupabaseConfigured.mockReturnValue(true);
  mocks.getProjectIdFromRequest.mockResolvedValue(null);
  mocks.getCurrentUser.mockResolvedValue(USER);
});

describe("GET /api/svi/history", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.findOrCreateSVIAccount).not.toHaveBeenCalled();
  });

  it("returns an empty envelope when supabase is not configured", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      snapshots: [],
      currentSVI: null,
      weekDelta: null,
      monthDelta: null,
    });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.findOrCreateSVIAccount).not.toHaveBeenCalled();
  });

  it("returns an empty envelope when findOrCreateSVIAccount resolves to null", async () => {
    const { sb } = makeSb({});
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      snapshots: [],
      currentSVI: null,
      weekDelta: null,
      monthDelta: null,
    });
    // svi_accounts + svi_snapshots must NOT be queried when there is no account.
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("returns an empty envelope when svi_accounts lookup returns no row", async () => {
    const { sb } = makeSb({ account: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      snapshots: [],
      currentSVI: null,
      weekDelta: null,
      monthDelta: null,
    });
    // svi_snapshots must not be queried when the account row is missing.
    expect(sb.from).toHaveBeenCalledWith("svi_accounts");
    expect(sb.from).not.toHaveBeenCalledWith("svi_snapshots");
  });

  it("returns 500 when svi_snapshots fetch surfaces a supabase error", async () => {
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 70, current_stage: 3 },
      snapshotsError: { message: "boom" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Failed to load history" });
  });

  it("reverses snapshots into chronological order (oldest first) and exposes only whitelisted fields", async () => {
    // DB returns snapshots newest-first (order desc); response reverses them.
    const dbRows: SnapshotRow[] = [
      { snapshot_date: "2026-08-08", svi_total: 74, delta: 4, stage: 3 },
      { snapshot_date: "2026-08-01", svi_total: 70, delta: 2, stage: 3 },
      { snapshot_date: "2026-07-25", svi_total: 68, delta: 3, stage: 2 },
    ];
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 74, current_stage: 3 },
      snapshots: dbRows,
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.currentSVI).toBe(74);
    expect(body.snapshots).toEqual([
      { date: "2026-07-25", svi: 68, delta: 3, stage: 2 },
      { date: "2026-08-01", svi: 70, delta: 2, stage: 3 },
      { date: "2026-08-08", svi: 74, delta: 4, stage: 3 },
    ]);
  });

  it("uses the newest snapshot's delta as weekDelta", async () => {
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 74, current_stage: 3 },
      snapshots: [
        { snapshot_date: "2026-08-08", svi_total: 74, delta: 7 },
        { snapshot_date: "2026-08-01", svi_total: 67, delta: 1 },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const body = await (await GET()).json();
    expect(body.weekDelta).toBe(7);
  });

  it("defaults weekDelta to 0 when the newest snapshot has a null delta", async () => {
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 74, current_stage: 3 },
      snapshots: [{ snapshot_date: "2026-08-08", svi_total: 74, delta: null }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const body = await (await GET()).json();
    expect(body.weekDelta).toBe(0);
  });

  it("computes monthDelta against rows[3] when ≥ 4 snapshots exist", async () => {
    // Newest → oldest; rows[3] is the ~4-week anchor.
    const rows: SnapshotRow[] = [
      { snapshot_date: "2026-08-08", svi_total: 80, delta: 2 }, // rows[0] newest
      { snapshot_date: "2026-08-01", svi_total: 78, delta: 3 },
      { snapshot_date: "2026-07-25", svi_total: 75, delta: 4 },
      { snapshot_date: "2026-07-18", svi_total: 71, delta: 2 }, // rows[3] anchor
      { snapshot_date: "2026-07-11", svi_total: 69, delta: 1 }, // must be ignored
    ];
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 80, current_stage: 3 },
      snapshots: rows,
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const body = await (await GET()).json();
    expect(body.monthDelta).toBe(80 - 71); // 9
  });

  it("falls back to the oldest available snapshot for monthDelta when < 4 rows exist", async () => {
    // Only 2 rows → anchor is rows.at(-1) (oldest).
    const rows: SnapshotRow[] = [
      { snapshot_date: "2026-08-08", svi_total: 74, delta: 4 },
      { snapshot_date: "2026-08-01", svi_total: 60, delta: 3 }, // fallback anchor
    ];
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 74, current_stage: 3 },
      snapshots: rows,
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const body = await (await GET()).json();
    expect(body.monthDelta).toBe(74 - 60); // 14
  });

  it("returns zeroed deltas when no snapshots exist", async () => {
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 60, current_stage: 2 },
      snapshots: [],
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    const body = await (await GET()).json();
    expect(body.snapshots).toEqual([]);
    expect(body.weekDelta).toBe(0);
    expect(body.monthDelta).toBe(0);
    expect(body.currentSVI).toBe(60);
  });

  it("forwards the resolved project_id to findOrCreateSVIAccount", async () => {
    const { sb } = makeSb({
      account: { id: "acc-1", current_svi: 60, current_stage: 2 },
      snapshots: [],
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-42");
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    await GET();

    expect(mocks.findOrCreateSVIAccount).toHaveBeenCalledWith(
      USER.email,
      "proj-42",
    );
  });

  it("scopes the svi_snapshots query to the resolved account_id (not user email)", async () => {
    const { sb, snapshotCalls } = makeSb({
      account: { id: "acc-99", current_svi: 60, current_stage: 2 },
      snapshots: [],
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    // findOrCreateSVIAccount returns one id; the account row select then
    // returns a different id — the snapshot query must key off the ROW id,
    // matching the route's `account.id` reference.
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    await GET();

    const accountEq = snapshotCalls.find(
      (c) => c.op === "eq" && c.args[0] === "account_id",
    );
    expect(accountEq).toBeDefined();
    expect(accountEq!.args[1]).toBe("acc-99");
  });

  it("orders svi_snapshots newest-first and caps the read at 12 rows", async () => {
    const { sb, snapshotCalls } = makeSb({
      account: { id: "acc-1", current_svi: 60, current_stage: 2 },
      snapshots: [],
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.findOrCreateSVIAccount.mockResolvedValue("acc-1");

    await GET();

    const order = snapshotCalls.find((c) => c.op === "order");
    expect(order).toBeDefined();
    expect(order!.args[0]).toBe("snapshot_date");
    expect(order!.args[1]).toEqual({ ascending: false });
    // limit is the terminal call; verify the mock captured the count.
    const builder = sb.from("svi_snapshots") as unknown as {
      limit: ReturnType<typeof vi.fn>;
    };
    expect(builder.limit).toHaveBeenCalledWith(12);
  });
});
