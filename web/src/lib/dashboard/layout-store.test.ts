// layout-store — app_users.dashboard_layout read/write via the service role.
// Pins: scoped to the given user id, re-validates on read, degrades quietly
// when Supabase is unconfigured or migration 0326 has not been applied.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { getDashboardLayout, setDashboardLayout } from "./layout-store";

const STAMP = "2026-09-01T00:00:00.000Z";

interface FakeChain {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

function fakeClient(opts: { readResult?: unknown; writeResult?: unknown }): FakeChain {
  const chain: FakeChain = {
    from: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  // select().eq().maybeSingle() → readResult ; update().eq() → writeResult
  chain.eq.mockImplementation(() =>
    Object.assign(Promise.resolve(opts.writeResult ?? { error: null }), {
      maybeSingle: chain.maybeSingle,
    }),
  );
  chain.maybeSingle.mockResolvedValue(opts.readResult ?? { data: null, error: null });
  return chain;
}

beforeEach(() => {
  getSupabaseAdminMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getDashboardLayout", () => {
  it("returns null when Supabase is not configured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    expect(await getDashboardLayout("u-1")).toBeNull();
  });

  it("reads the caller's row only and re-validates the blob", async () => {
    const client = fakeClient({
      readResult: {
        data: { dashboard_layout: { v: 1, order: ["metrics", "retired-widget"], pinned: [], updated_at: STAMP } },
        error: null,
      },
    });
    getSupabaseAdminMock.mockReturnValue(client);
    const out = await getDashboardLayout("u-1");
    expect(client.from).toHaveBeenCalledWith("app_users");
    expect(client.select).toHaveBeenCalledWith("dashboard_layout");
    expect(client.eq).toHaveBeenCalledWith("id", "u-1");
    expect(out).toEqual({ v: 1, order: ["metrics"], pinned: [], updated_at: STAMP });
  });

  it("returns null for a NULL column or a malformed blob", async () => {
    getSupabaseAdminMock.mockReturnValue(fakeClient({ readResult: { data: { dashboard_layout: null }, error: null } }));
    expect(await getDashboardLayout("u-1")).toBeNull();
    getSupabaseAdminMock.mockReturnValue(fakeClient({ readResult: { data: { dashboard_layout: { v: 9 } }, error: null } }));
    expect(await getDashboardLayout("u-1")).toBeNull();
  });

  it("returns null quietly when the column is missing, logs other errors", async () => {
    getSupabaseAdminMock.mockReturnValue(
      fakeClient({ readResult: { data: null, error: { message: 'column app_users.dashboard_layout does not exist' } } }),
    );
    expect(await getDashboardLayout("u-1")).toBeNull();
    expect(console.error).not.toHaveBeenCalled();

    getSupabaseAdminMock.mockReturnValue(fakeClient({ readResult: { data: null, error: { message: "boom" } } }));
    expect(await getDashboardLayout("u-1")).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("setDashboardLayout", () => {
  const layout = { v: 1 as const, order: ["metrics"], pinned: [], updated_at: STAMP };

  it("not_configured when Supabase is unavailable", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    expect(await setDashboardLayout("u-1", layout)).toEqual({ ok: false, reason: "not_configured" });
  });

  it("updates only the caller's row", async () => {
    const client = fakeClient({ writeResult: { error: null } });
    getSupabaseAdminMock.mockReturnValue(client);
    expect(await setDashboardLayout("u-1", layout)).toEqual({ ok: true });
    expect(client.from).toHaveBeenCalledWith("app_users");
    expect(client.update).toHaveBeenCalledWith({ dashboard_layout: layout });
    expect(client.eq).toHaveBeenCalledWith("id", "u-1");
  });

  it("column_missing vs db_error", async () => {
    getSupabaseAdminMock.mockReturnValue(
      fakeClient({ writeResult: { error: { message: 'column "dashboard_layout" of relation "app_users" does not exist' } } }),
    );
    expect(await setDashboardLayout("u-1", layout)).toEqual({ ok: false, reason: "column_missing" });

    getSupabaseAdminMock.mockReturnValue(fakeClient({ writeResult: { error: { message: "deadlock" } } }));
    expect(await setDashboardLayout("u-1", layout)).toEqual({ ok: false, reason: "db_error" });
  });
});
