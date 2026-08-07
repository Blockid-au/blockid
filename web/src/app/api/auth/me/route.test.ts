// Colocated vitest for GET /api/auth/me — P9-auth-me-route-test.
//
// This is the single source of truth every client component uses to decide
// "am I logged in? what plan? Drive-linked? on a trial?". A silent regression
// here means every gated widget (dashboard, workspace, /billing) is either
// wrongly-gated (leak) or wrongly-hidden (frustrating false negative). The
// route also surfaces trial lifecycle fields (migration 0110) — the trial
// object MUST always be present as an object (never `null`, never omitted)
// so client components can `.started_at` without null-checking every render.
//
// Regressions this suite is designed to catch:
//   - dropping the `trial: {}` scaffold when Supabase is not configured
//     would break every trial-aware component with `Cannot read undefined`;
//   - flipping the eq("email", user.email) to eq("id", user.id) on
//     svi_accounts would return the wrong Drive folder for founders whose
//     app_users.id and svi_accounts.email were minted in different flows;
//   - regressing head:true/count:"exact" to a full row pull on
//     user_source_folders would blow up the /me response on power users
//     with hundreds of connected folders;
//   - dropping the ok:false, user:null shape on the anon path would
//     desync every client component that checks `data.user === null`
//     (they'd suddenly see undefined).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  plan: string | null;
  role: string;
  displayName: string | null;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

// Route import MUST come after mocks are registered.
import { GET, dynamic } from "./route";

// --- Fake supabase ---------------------------------------------------------

interface FakeState {
  accountRow: {
    drive_folder_id?: string | null;
    drive_folder_url?: string | null;
    source_folders_enabled?: boolean | null;
  } | null;
  folderCount: number;
  trialRow: {
    trial_started_at?: string | null;
    trial_end_at?: string | null;
    trial_converted_at?: string | null;
    payment_failed_at?: string | null;
  } | null;
  fromCalls: string[];
  selectCalls: Array<[string, Record<string, unknown> | undefined]>;
  eqCalls: Array<[string, string, unknown]>;
}

const state: FakeState = {
  accountRow: null,
  folderCount: 0,
  trialRow: null,
  fromCalls: [],
  selectCalls: [],
  eqCalls: [],
};

function makeChain(kind: "account" | "folders" | "trial") {
  const api: Record<string, unknown> = {};
  api.select = (cols: string, opts?: Record<string, unknown>) => {
    state.selectCalls.push([cols, opts]);
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    state.eqCalls.push([kind, col, val]);
    // For folders: chain stays chainable AND is thenable (supabase-js pattern)
    // so `await supabase.from(...).select(...).eq(...).eq(...)` resolves to
    // the { count } result regardless of how many .eq calls happen.
    return api;
  };
  api.maybeSingle = () => {
    if (kind === "account") return Promise.resolve({ data: state.accountRow, error: null });
    if (kind === "trial") return Promise.resolve({ data: state.trialRow, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  if (kind === "folders") {
    // Terminal await resolves to { count }. supabase-js chains are thenable
    // — replicate with a `then` method that Node's await machinery picks up.
    api.then = (onResolve: (v: { count: number; error: null }) => unknown) =>
      Promise.resolve({ count: state.folderCount, error: null }).then(onResolve);
  }
  return api;
}

function fakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      if (table === "svi_accounts") return makeChain("account");
      if (table === "user_source_folders") return makeChain("folders");
      if (table === "app_users") return makeChain("trial");
      return makeChain("account");
    },
  };
}

const USER: AppUser = {
  id: "user-abc",
  email: "founder@example.com",
  plan: "growth",
  role: "user",
  displayName: "Founder Fran",
};

beforeEach(() => {
  state.accountRow = null;
  state.folderCount = 0;
  state.trialRow = null;
  state.fromCalls = [];
  state.selectCalls = [];
  state.eqCalls = [];

  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
});

afterEach(() => {
  vi.clearAllMocks();
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("GET /api/auth/me — module invariants", () => {
  it("exports dynamic='force-dynamic' so /me is never statically cached", () => {
    // A cached /me would leak one founder's session to the next, defeating auth.
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Anonymous branch
// -----------------------------------------------------------------------------

describe("GET /api/auth/me — anonymous", () => {
  it("returns 200 with ok:false and user:null when not logged in", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: false, user: null });
  });

  it("does not touch Supabase on the anon path", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toEqual([]);
  });

  it("anon response is JSON content-type", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect((res.headers.get("Content-Type") ?? "").toLowerCase()).toContain(
      "application/json",
    );
  });
});

// -----------------------------------------------------------------------------
// Authenticated — no Supabase
// -----------------------------------------------------------------------------

describe("GET /api/auth/me — authenticated, no Supabase", () => {
  beforeEach(() => {
    mocks.getSupabaseAdminMock.mockReturnValue(null);
  });

  it("returns 200 with the user identity even without Supabase", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    const u = body.user as Record<string, unknown>;
    expect(u.id).toBe(USER.id);
    expect(u.email).toBe(USER.email);
    expect(u.plan).toBe(USER.plan);
    expect(u.role).toBe(USER.role);
    expect(u.displayName).toBe(USER.displayName);
  });

  it("emits null Drive fields when Supabase is unavailable (never undefined)", async () => {
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.driveFolderId).toBeNull();
    expect(u.driveFolderUrl).toBeNull();
  });

  it("emits sourceFoldersEnabled=false and count=0 without Supabase", async () => {
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.sourceFoldersEnabled).toBe(false);
    expect(u.sourceFolderCount).toBe(0);
  });

  it("ALWAYS emits a trial object (never omitted, never null)", async () => {
    // Client components read `data.user.trial.started_at` — omitting the
    // trial scaffold would break every trial-aware widget with a TypeError.
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.trial).toBeDefined();
    expect(u.trial).not.toBeNull();
    const trial = u.trial as Record<string, unknown>;
    expect(trial).toEqual({
      started_at: null,
      end_at: null,
      converted_at: null,
      payment_failed_at: null,
    });
  });
});

// -----------------------------------------------------------------------------
// Authenticated — with Supabase, empty rows
// -----------------------------------------------------------------------------

describe("GET /api/auth/me — authenticated, empty Supabase rows", () => {
  it("returns null Drive fields when svi_accounts has no row for the email", async () => {
    state.accountRow = null;
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.driveFolderId).toBeNull();
    expect(u.driveFolderUrl).toBeNull();
    expect(u.sourceFoldersEnabled).toBe(false);
  });

  it("returns 0 for sourceFolderCount when count comes back null", async () => {
    state.folderCount = 0;
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.sourceFolderCount).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Authenticated — with Supabase, populated rows
// -----------------------------------------------------------------------------

describe("GET /api/auth/me — authenticated, populated Supabase", () => {
  beforeEach(() => {
    state.accountRow = {
      drive_folder_id: "drv_abc",
      drive_folder_url: "https://drive/x",
      source_folders_enabled: true,
    };
    state.folderCount = 7;
    state.trialRow = {
      trial_started_at: "2026-08-01T00:00:00Z",
      trial_end_at: "2026-08-15T00:00:00Z",
      trial_converted_at: null,
      payment_failed_at: null,
    };
  });

  it("surfaces the Drive folder id + url from svi_accounts", async () => {
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.driveFolderId).toBe("drv_abc");
    expect(u.driveFolderUrl).toBe("https://drive/x");
  });

  it("surfaces source_folders_enabled + folder count", async () => {
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.sourceFoldersEnabled).toBe(true);
    expect(u.sourceFolderCount).toBe(7);
  });

  it("emits the trial lifecycle timestamps verbatim", async () => {
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.trial).toEqual({
      started_at: "2026-08-01T00:00:00Z",
      end_at: "2026-08-15T00:00:00Z",
      converted_at: null,
      payment_failed_at: null,
    });
  });

  it("emits null-coalesced timestamps when trial fields are missing", async () => {
    state.trialRow = {};
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.trial).toEqual({
      started_at: null,
      end_at: null,
      converted_at: null,
      payment_failed_at: null,
    });
  });
});

// -----------------------------------------------------------------------------
// DB query shape
// -----------------------------------------------------------------------------

describe("GET /api/auth/me — DB query shape", () => {
  it("queries svi_accounts by email (NOT by user.id)", async () => {
    // The svi_accounts table keys on email — a refactor to user.id would
    // silently return null and hide the Drive folder from the founder.
    await GET();
    expect(state.eqCalls).toContainEqual(["account", "email", USER.email]);
  });

  it("queries user_source_folders by user_id + is_active=true", async () => {
    await GET();
    expect(state.eqCalls).toContainEqual(["folders", "user_id", USER.id]);
    expect(state.eqCalls).toContainEqual(["folders", "is_active", true]);
  });

  it("queries user_source_folders with count:'exact', head:true (no row pull)", async () => {
    // Pulling rows on the count query would balloon /me latency for founders
    // with hundreds of folders — pin the count-only shape.
    await GET();
    const foldersSelect = state.selectCalls.find(([, opts]) =>
      opts && "count" in opts,
    );
    expect(foldersSelect).toBeDefined();
    expect(foldersSelect?.[1]).toEqual({ count: "exact", head: true });
  });

  it("queries app_users trial fields by id", async () => {
    await GET();
    expect(state.eqCalls).toContainEqual(["trial", "id", USER.id]);
  });

  it("queries all three tables in parallel (all three .from calls fire)", async () => {
    await GET();
    expect(state.fromCalls).toContain("svi_accounts");
    expect(state.fromCalls).toContain("user_source_folders");
    expect(state.fromCalls).toContain("app_users");
  });

  it("app_users select pulls only the four trial columns (not the whole row)", async () => {
    await GET();
    const trialSelect = state.selectCalls.find(([cols]) =>
      cols.includes("trial_started_at"),
    );
    expect(trialSelect?.[0]).toBe(
      "trial_started_at, trial_end_at, trial_converted_at, payment_failed_at",
    );
  });
});

// -----------------------------------------------------------------------------
// Response shape — pins for client code
// -----------------------------------------------------------------------------

describe("GET /api/auth/me — response shape pins", () => {
  it("response body shape stays: {ok, user:{id,email,plan,role,displayName,driveFolderId,driveFolderUrl,sourceFoldersEnabled,sourceFolderCount,trial}}", async () => {
    const res = await GET();
    const body = await json(res);
    expect(body.ok).toBe(true);
    const u = body.user as Record<string, unknown>;
    expect(Object.keys(u).sort()).toEqual(
      [
        "displayName",
        "driveFolderId",
        "driveFolderUrl",
        "email",
        "id",
        "plan",
        "role",
        "sourceFolderCount",
        "sourceFoldersEnabled",
        "trial",
      ].sort(),
    );
  });

  it("null plan flows through as null (not 'free', not 'Free')", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ ...USER, plan: null });
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.plan).toBeNull();
  });

  it("null displayName flows through as null", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ ...USER, displayName: null });
    const res = await GET();
    const body = await json(res);
    const u = body.user as Record<string, unknown>;
    expect(u.displayName).toBeNull();
  });
});
