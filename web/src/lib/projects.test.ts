import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// getSupabaseAdmin is stubbed to a swappable mock so tests that need to
// exercise the actual DELETE path (purgeArchivedOlderThan) can inject a
// fake client while the plan-limit tests still see `null` (matching the
// original suite's behaviour).
const getSupabaseAdminMock = vi.fn(() => null as unknown);
vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getPlanCachedMock = vi.fn();
vi.mock("./plans-db", () => ({
  getPlanCached: (id: string) => getPlanCachedMock(id),
}));

import {
  getProjectLimit,
  purgeArchivedOlderThan,
  listProjects,
  getProject,
  getActiveProject,
  assertProjectAccess,
  ProjectAccessError,
  roleAtLeast,
  roleCanWrite,
  roleCanAdmin,
  creditChargeNote,
  resolveProjectDataEmail,
  findOrCreateSVIAccount,
  projectCookieValue,
} from "./projects";

const UNLIMITED = Number.MAX_SAFE_INTEGER;

describe("getProjectLimit — plans.usage_limits.profiles lookup", () => {
  beforeEach(() => {
    getPlanCachedMock.mockReset();
  });

  it("reads profiles from DB row for v2 plan id", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_growth", usage_limits: { profiles: 3 } });
    expect(await getProjectLimit("founder_growth")).toBe(3);
    expect(getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("maps legacy plan id via LEGACY_PLAN_MAP before lookup", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_growth", usage_limits: { profiles: 3 } });
    expect(await getProjectLimit("growth")).toBe(3);
    expect(getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("treats profiles=-1 as unlimited", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_enterprise", usage_limits: { profiles: -1 } });
    expect(await getProjectLimit("founder_enterprise")).toBe(UNLIMITED);
  });

  it("falls back to static map when plan row is missing", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("founder_scale")).toBe(10);
  });

  it("falls back to static map when plan row lacks usage_limits.profiles", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_starter", usage_limits: {} });
    expect(await getProjectLimit("founder_starter")).toBe(1);
  });

  it("falls back to static map when getPlanCached throws", async () => {
    getPlanCachedMock.mockRejectedValue(new Error("DB down"));
    expect(await getProjectLimit("founder_growth")).toBe(3);
  });

  it("defaults to founder_free (limit 1) for null/undefined plan", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit(null)).toBe(1);
    expect(await getProjectLimit(undefined)).toBe(1);
  });

  it("legacy 'free' and 'founding50' resolve to 1 via fallback", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("free")).toBe(1);
    expect(await getProjectLimit("founding50")).toBe(1);
  });

  // G12-7 (2026-09-10, T0268/T0269): evaluators create the startups they
  // evaluate, so Scout / Firm / Program (and the accelerator SKUs) mirror
  // plans.csv usage_limits.profiles and never collapse to the founder default
  // of 1 when the plans row is missing.
  it("evaluator rungs fall back to plans.csv profiles (Scout 25 / Firm 50 / Program 200)", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("investor_angel")).toBe(25);
    expect(await getProjectLimit("investor_advisor")).toBe(50);
    expect(await getProjectLimit("investor_vc_small")).toBe(200);
    expect(await getProjectLimit("investor_vc_ent")).toBe(UNLIMITED);
  });

  it("accelerator cohort SKUs fall back to plans.csv profiles (25 / 100 / unlimited)", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("accelerator_starter")).toBe(25);
    expect(await getProjectLimit("accelerator_growth")).toBe(100);
    expect(await getProjectLimit("accelerator_enterprise")).toBe(UNLIMITED);
  });

  it("evaluator rungs prefer the DB row's profiles over the fallback", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "investor_angel", usage_limits: { profiles: 30 } });
    expect(await getProjectLimit("investor_angel")).toBe(30);
  });

  it("unknown plan id defaults to 1", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("mystery_tier")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// purgeArchivedOlderThan — Iteration-18 T1 / Q4 MP #5
// ---------------------------------------------------------------------------

interface DeleteCall {
  ids: string[];
}
interface SelectCall {
  archivedIsNullFilter: "not_null" | null;
  cutoffIso: string | null;
}

function makeFakeSupabase(opts: {
  selectRows?: Array<{ id: string; user_id: string }>;
  selectError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const selectCalls: SelectCall[] = [];
  const deleteCalls: DeleteCall[] = [];

  function selectBuilder() {
    const state: SelectCall = { archivedIsNullFilter: null, cutoffIso: null };
    const builder = {
      not(col: string, op: string, val: unknown) {
        if (col === "archived_at" && op === "is" && val === null) {
          state.archivedIsNullFilter = "not_null";
        }
        return builder;
      },
      lt(col: string, val: string) {
        if (col === "archived_at") state.cutoffIso = val;
        return builder;
      },
      then(resolve: (v: unknown) => unknown) {
        selectCalls.push(state);
        return Promise.resolve({
          data: opts.selectRows ?? [],
          error: opts.selectError ?? null,
        }).then(resolve);
      },
    };
    return builder;
  }

  function deleteBuilder() {
    const builder = {
      in(col: string, ids: string[]) {
        if (col === "id") deleteCalls.push({ ids });
        return builder;
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve({ error: opts.deleteError ?? null }).then(resolve);
      },
    };
    return builder;
  }

  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return selectBuilder();
        },
        delete() {
          return deleteBuilder();
        },
      };
    },
  };
  return { client, selectCalls, deleteCalls };
}

describe("purgeArchivedOlderThan — retention purge helper", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
  });

  it("rejects non-positive `days` without touching the DB", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const zero = await purgeArchivedOlderThan(0);
    expect(zero.ok).toBe(false);
    const neg = await purgeArchivedOlderThan(-5);
    expect(neg.ok).toBe(false);
  });

  it("returns supabase_not_configured when the admin client is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const result = await purgeArchivedOlderThan(90);
    expect(result).toEqual({ ok: false, error: "supabase_not_configured" });
  });

  it("filters on `archived_at IS NOT NULL` AND `archived_at < now() - Xd`", async () => {
    const fake = makeFakeSupabase({
      selectRows: [
        { id: "p1", user_id: "u1" },
        { id: "p2", user_id: "u2" },
      ],
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);

    const before = Date.now();
    const result = await purgeArchivedOlderThan(90);
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.count).toBe(2);
    expect(result.purged.map((r) => r.id)).toEqual(["p1", "p2"]);

    // Age-gate assertions.
    expect(fake.selectCalls).toHaveLength(1);
    const call = fake.selectCalls[0];
    expect(call.archivedIsNullFilter).toBe("not_null");
    const cutoff = new Date(call.cutoffIso as string).getTime();
    const windowMs = 90 * 24 * 60 * 60 * 1000;
    expect(cutoff).toBeLessThanOrEqual(after - windowMs);
    expect(cutoff).toBeGreaterThanOrEqual(before - windowMs - 1000);

    // DELETE targeted exactly the ids returned by SELECT.
    expect(fake.deleteCalls).toEqual([{ ids: ["p1", "p2"] }]);
  });

  it("returns count 0 and skips DELETE when no rows match the window", async () => {
    const fake = makeFakeSupabase({ selectRows: [] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const result = await purgeArchivedOlderThan(30);
    expect(result).toEqual({ ok: true, count: 0, purged: [] });
    expect(fake.deleteCalls).toHaveLength(0);
  });

  it("propagates SELECT errors as ok:false without deleting", async () => {
    const fake = makeFakeSupabase({
      selectError: { message: "select_boom" },
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const result = await purgeArchivedOlderThan(90);
    expect(result).toEqual({ ok: false, error: "select_boom" });
    expect(fake.deleteCalls).toHaveLength(0);
  });

  it("propagates DELETE errors as ok:false", async () => {
    const fake = makeFakeSupabase({
      selectRows: [{ id: "p1", user_id: "u1" }],
      deleteError: { message: "delete_boom" },
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const result = await purgeArchivedOlderThan(90);
    expect(result).toEqual({ ok: false, error: "delete_boom" });
  });
});

// ---------------------------------------------------------------------------
// S17-A — project-level permissions: member-aware readers + access guard
// ---------------------------------------------------------------------------
//
// A tiny in-memory Postgres stand-in: rows per table, and a chainable query
// builder that honours .eq / .is / .not / .in / .order / .limit /
// .maybeSingle / .single and `await` (thenable). Enough to drive the
// member-aware helpers end-to-end without a database.

type Row = Record<string, unknown>;

function makeMemoryDb(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];

  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    let limitN: number | null = null;
    const b: Record<string, unknown> = {};
    const log = (op: string, ...args: unknown[]) => calls.push({ table, op, args });
    b.select = (...a: unknown[]) => { log("select", ...a); return b; };
    b.eq = (col: string, val: unknown) => { log("eq", col, val); rows = rows.filter((r) => r[col] === val); return b; };
    b.is = (col: string, val: unknown) => { log("is", col, val); rows = rows.filter((r) => (r[col] ?? null) === val); return b; };
    b.not = (col: string, _op: string, val: unknown) => { log("not", col, val); rows = rows.filter((r) => (r[col] ?? null) !== val); return b; };
    b.in = (col: string, vals: unknown[]) => { log("in", col, vals); rows = rows.filter((r) => vals.includes(r[col])); return b; };
    b.order = (col: string, opts?: { ascending?: boolean }) => {
      log("order", col, opts);
      const asc = opts?.ascending !== false;
      rows.sort((x, y) => String(x[col] ?? "").localeCompare(String(y[col] ?? "")) * (asc ? 1 : -1));
      return b;
    };
    b.limit = (n: number) => { log("limit", n); limitN = n; return b; };
    const resolveRows = () => (limitN === null ? rows : rows.slice(0, limitN));
    b.maybeSingle = async () => ({ data: resolveRows()[0] ?? null, error: null });
    b.single = async () => {
      const r = resolveRows()[0];
      return r ? { data: r, error: null } : { data: null, error: { message: "no rows" } };
    };
    b.insert = (row: Row) => {
      log("insert", row);
      const created = { id: `${table}-${(tables[table] ?? []).length + 1}`, ...row };
      (tables[table] ??= []).push(created);
      rows = [created];
      return b;
    };
    b.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve({ data: resolveRows(), error: null }).then(onOk, onErr);
    return b;
  }

  return { client: { from: (table: string) => query(table) }, calls, tables };
}

const OWNER = "owner-1";
const MEMBER = "member-1";
const STRANGER = "stranger-1";

function seed() {
  return makeMemoryDb({
    app_users: [
      { id: OWNER, email: "Owner@Acme.io" },
      { id: MEMBER, email: "cofounder@acme.io" },
    ],
    projects: [
      { id: "p-own", user_id: OWNER, name: "Acme", slug: "acme", is_default: true, archived_at: null, created_at: "2026-01-01" },
      { id: "p-own-2", user_id: OWNER, name: "Beta", slug: "beta", is_default: false, archived_at: null, created_at: "2026-01-02" },
      { id: "p-archived", user_id: OWNER, name: "Old", slug: "old", is_default: false, archived_at: "2026-02-01", created_at: "2026-01-03" },
      { id: "p-mine", user_id: MEMBER, name: "Side", slug: "side", is_default: true, archived_at: null, created_at: "2026-01-05" },
    ],
    project_members: [
      { id: "m1", project_id: "p-own", user_id: MEMBER, user_email: "cofounder@acme.io", role: "editor", status: "accepted" },
      { id: "m2", project_id: "p-own-2", user_id: MEMBER, user_email: "cofounder@acme.io", role: "viewer", status: "invited" },
      { id: "m3", project_id: "p-archived", user_id: MEMBER, user_email: "cofounder@acme.io", role: "admin", status: "accepted" },
      { id: "m4", project_id: "p-own", user_id: STRANGER, user_email: "x@y.io", role: "admin", status: "revoked" },
    ],
    svi_accounts: [
      { id: "acc-owner", email: "owner@acme.io", project_id: "p-own" },
    ],
  });
}

describe("S17-A role helpers", () => {
  it("ranks owner > admin > editor > viewer", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("editor", "admin")).toBe(false);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("editor", "viewer")).toBe(true);
    expect(roleCanWrite("editor")).toBe(true);
    expect(roleCanWrite("viewer")).toBe(false);
    expect(roleCanWrite(null)).toBe(false);
    expect(roleCanAdmin("admin")).toBe(true);
    expect(roleCanAdmin("editor")).toBe(false);
  });

  it("creditChargeNote makes the member's own wallet explicit", () => {
    expect(creditChargeNote(null)).toBe("Charged to your credits.");
    expect(creditChargeNote({ isOwner: true })).toBe("Charged to your credits.");
    expect(creditChargeNote({ isOwner: false })).toMatch(/your own credits — not the project owner's/);
  });

  it("ProjectAccessError maps codes to HTTP statuses", () => {
    expect(new ProjectAccessError("x", "not_found").status).toBe(404);
    expect(new ProjectAccessError("x", "forbidden").status).toBe(403);
    expect(new ProjectAccessError("x", "service_unavailable").status).toBe(503);
  });
});

describe("S17-A listProjects — owned ∪ accepted memberships", () => {
  beforeEach(() => getSupabaseAdminMock.mockReset());

  it("owner sees owned projects only (role owner), archived excluded", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    const list = await listProjects(OWNER);
    expect(list.map((p) => p.id)).toEqual(["p-own", "p-own-2"]);
    expect(list.every((p) => p.role === "owner" && p.isShared === false)).toBe(true);
  });

  it("member sees own projects first, then shared ones with their role; invited/revoked/archived memberships excluded", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    const list = await listProjects(MEMBER);
    expect(list.map((p) => [p.id, p.role, p.isShared])).toEqual([
      ["p-mine", "owner", false],
      ["p-own", "editor", true],
    ]);
  });

  it("non-member with no projects gets an empty list", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    expect(await listProjects(STRANGER)).toEqual([]);
  });
});

describe("S17-A getProject / getActiveProject — member-aware", () => {
  beforeEach(() => getSupabaseAdminMock.mockReset());

  it("owner resolves with role owner", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    const p = await getProject(OWNER, "p-own");
    expect(p?.role).toBe("owner");
    expect(p?.isShared).toBe(false);
  });

  it("accepted member resolves with the membership role", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    const p = await getProject(MEMBER, "p-own");
    expect(p?.role).toBe("editor");
    expect(p?.isShared).toBe(true);
    expect(p?.userId).toBe(OWNER);
  });

  it("invited (not yet accepted), revoked and non-members get null", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    expect(await getProject(MEMBER, "p-own-2")).toBeNull(); // invited
    expect(await getProject(STRANGER, "p-own")).toBeNull(); // revoked
    expect(await getProject(STRANGER, "p-mine")).toBeNull(); // never a member
    expect(await getProject(OWNER, "p-missing")).toBeNull();
  });

  it("getActiveProject by slug: owned first, then a shared project by slug (cookie switcher path)", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    const own = await getActiveProject(MEMBER, "side");
    expect(own?.id).toBe("p-mine");
    expect(own?.role).toBe("owner");

    const shared = await getActiveProject(MEMBER, "acme");
    expect(shared?.id).toBe("p-own");
    expect(shared?.role).toBe("editor");

    expect(await getActiveProject(MEMBER, "beta")).toBeNull(); // invited only
    expect(await getActiveProject(STRANGER, "acme")).toBeNull();
  });

  it("getActiveProject accepts a project UUID (cookie value for shared projects) so a same-slug owned project cannot shadow it", async () => {
    const db = seed();
    // Both the member's own project and the shared one are slug "default".
    db.tables.projects = db.tables.projects.map((p) =>
      p.id === "p-own" || p.id === "p-mine" ? { ...p, slug: "default" } : p,
    );
    const sharedId = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
    db.tables.projects = db.tables.projects.map((p) => (p.id === "p-own" ? { ...p, id: sharedId } : p));
    db.tables.project_members = db.tables.project_members.map((m) =>
      m.project_id === "p-own" ? { ...m, project_id: sharedId } : m,
    );
    getSupabaseAdminMock.mockReturnValue(db.client);

    // By slug → the member's OWN default wins (owned-first rule).
    expect((await getActiveProject(MEMBER, "default"))?.id).toBe("p-mine");
    // By id → the shared project resolves with the membership role.
    const shared = await getActiveProject(MEMBER, sharedId);
    expect(shared?.id).toBe(sharedId);
    expect(shared?.role).toBe("editor");
    expect(projectCookieValue(shared!)).toBe(sharedId);
    expect(projectCookieValue({ id: "p-mine", slug: "default", isShared: false })).toBe("default");
  });

  it("getActiveProject without slug falls back to the first shared project when the user owns nothing", async () => {
    const db = seed();
    // Turn the member into a pure co-founder (no owned projects).
    db.tables.projects = db.tables.projects.filter((p) => p.id !== "p-mine");
    getSupabaseAdminMock.mockReturnValue(db.client);
    const p = await getActiveProject(MEMBER);
    expect(p?.id).toBe("p-own");
    expect(p?.role).toBe("editor");
  });
});

describe("S17-A assertProjectAccess — single chokepoint", () => {
  beforeEach(() => getSupabaseAdminMock.mockReset());

  it("owner passes every minRole and is reported as owner", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    const a = await assertProjectAccess(OWNER, "p-own", "admin");
    expect(a.role).toBe("owner");
    expect(a.isOwner).toBe(true);
    expect(a.ownerUserId).toBe(OWNER);
  });

  it("editor member passes viewer/editor and is refused admin with 403", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    expect((await assertProjectAccess(MEMBER, "p-own", "viewer")).role).toBe("editor");
    expect((await assertProjectAccess(MEMBER, "p-own", "editor")).isOwner).toBe(false);
    await expect(assertProjectAccess(MEMBER, "p-own", "admin")).rejects.toMatchObject({
      name: "ProjectAccessError",
      code: "forbidden",
      status: 403,
    });
  });

  it("non-member and missing project → not_found (404), never forbidden (no existence leak)", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    await expect(assertProjectAccess(STRANGER, "p-own", "viewer")).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(assertProjectAccess(OWNER, "p-nope", "viewer")).rejects.toMatchObject({ code: "not_found" });
  });

  it("service_unavailable when supabase is not configured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await expect(assertProjectAccess(OWNER, "p-own")).rejects.toMatchObject({ code: "service_unavailable", status: 503 });
  });
});

describe("S17-A shared startup record — owner email is the data key", () => {
  beforeEach(() => getSupabaseAdminMock.mockReset());

  it("resolveProjectDataEmail returns the caller's email for the owner and the owner's (lowercased) email for a member", async () => {
    getSupabaseAdminMock.mockReturnValue(seed().client);
    expect(await resolveProjectDataEmail("owner@acme.io", "p-own")).toBe("owner@acme.io");
    expect(await resolveProjectDataEmail("cofounder@acme.io", "p-own")).toBe("owner@acme.io");
    expect(await resolveProjectDataEmail("cofounder@acme.io", null)).toBe("cofounder@acme.io");
  });

  it("findOrCreateSVIAccount for a member returns the OWNER's existing account instead of creating a split row", async () => {
    const db = seed();
    getSupabaseAdminMock.mockReturnValue(db.client);
    const id = await findOrCreateSVIAccount("cofounder@acme.io", "p-own");
    expect(id).toBe("acc-owner");
    expect(db.calls.some((c) => c.table === "svi_accounts" && c.op === "insert")).toBe(false);
  });

  it("findOrCreateSVIAccount for the owner takes the fast path (no app_users lookup)", async () => {
    const db = seed();
    getSupabaseAdminMock.mockReturnValue(db.client);
    const id = await findOrCreateSVIAccount("owner@acme.io", "p-own");
    expect(id).toBe("acc-owner");
    expect(db.calls.some((c) => c.table === "app_users")).toBe(false);
  });
});
