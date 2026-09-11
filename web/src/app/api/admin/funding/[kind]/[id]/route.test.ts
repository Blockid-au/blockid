// Colocated vitest for GET + PATCH /api/admin/funding/[kind]/[id] (T0239).
//
//   - 401 for anonymous / non-admin
//   - 400 bad kind, invalid JSON, invalid patch (validator wired)
//   - 503 when the admin client is unavailable
//   - 404 when the row does not exist
//   - 500 on DB error
//   - happy path: update issued against the right table/id with the
//     verified_by='human' stamp, row echoed back

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
  ADMIN_EMAIL: "admin@blockid.au",
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { GET, PATCH } from "./route";

const ADMIN = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const USER = { id: "user-2", email: "user@example.com", plan: "free", role: "user" };

interface Captured {
  table: string | null;
  update: Record<string, unknown> | null;
  eq: [string, string] | null;
  selected: boolean;
}

function makeSb(result: { data: unknown; error: { message: string } | null }) {
  const captured: Captured = { table: null, update: null, eq: null, selected: false };
  const builder = {
    select: () => {
      captured.selected = true;
      return builder;
    },
    update: (u: Record<string, unknown>) => {
      captured.update = u;
      return builder;
    },
    eq: (col: string, val: string) => {
      captured.eq = [col, val];
      return builder;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  const sb = {
    from: vi.fn((table: string) => {
      captured.table = table;
      return builder;
    }),
  };
  return { sb, captured };
}

const params = (kind: string, id: string) => ({ params: Promise.resolve({ kind, id }) });

function patchReq(body: unknown, raw = false) {
  return new Request("http://x/api/admin/funding/grants/rdti", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("PATCH /api/admin/funding/[kind]/[id] — S8-C guards", () => {
  it("413s an oversize body (cross-site refusal moved to the S9-A proxy gate — src/proxy.test.ts)", async () => {
    const big = await PATCH(patchReq({ next_round_note: "n".repeat(20 * 1024) }), params("grants", "rdti"));
    expect([401, 413]).toContain(big.status);
  });
});

describe("PATCH /api/admin/funding/[kind]/[id]", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.getSupabaseAdmin.mockReset();
  });

  it("401 for anonymous and for non-admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    let res = await PATCH(patchReq({ status: "closed" }), params("grants", "rdti"));
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ ok: false, reason: "no_user" });

    mocks.getCurrentUser.mockResolvedValue(USER);
    res = await PATCH(patchReq({ status: "closed" }), params("grants", "rdti"));
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ ok: false, reason: "not_admin" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("400 for an unknown kind, an empty id, invalid JSON and an invalid patch", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const { sb } = makeSb({ data: null, error: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);

    let res = await PATCH(patchReq({ status: "closed" }), params("au_grants", "rdti"));
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ reason: "bad_kind" });

    res = await PATCH(patchReq({ status: "closed" }), params("grants", "  "));
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ reason: "id_required" });

    res = await PATCH(patchReq("{not json", true), params("grants", "rdti"));
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ reason: "invalid_json" });

    res = await PATCH(patchReq({ official_url: "https://evil" }), params("grants", "rdti"));
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ reason: "invalid_patch", error: "unknown field(s): official_url" });

    expect(sb.from).not.toHaveBeenCalled();
  });

  it("503 when the admin client is not configured", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await PATCH(patchReq({ status: "closed" }), params("grants", "rdti"));
    expect(res.status).toBe(503);
  });

  it("404 when no row matches, 500 on a DB error", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ data: null, error: null }).sb);
    let res = await PATCH(patchReq({ status: "closed" }), params("grants", "nope"));
    expect(res.status).toBe(404);

    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ data: null, error: { message: "boom" } }).sb);
    res = await PATCH(patchReq({ status: "closed" }), params("grants", "rdti"));
    expect(res.status).toBe(500);
    expect(await json(res)).toMatchObject({ reason: "update_failed", error: "boom" });
  });

  it("updates the grant row with the human-verified stamp and echoes it", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const row = { id: "rdti", status: "paused", verified_by: "human" };
    const { sb, captured } = makeSb({ data: row, error: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);

    const res = await PATCH(
      patchReq({ status: "paused", closes_at: "2027-04-30", next_round_note: "Budget 2026-27" }),
      params("grants", "rdti"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, kind: "grants", row });

    expect(captured.table).toBe("au_grants");
    expect(captured.eq).toEqual(["id", "rdti"]);
    expect(captured.selected).toBe(true);
    expect(captured.update).toMatchObject({
      status: "paused",
      closes_at: "2027-04-30",
      next_round_note: "Budget 2026-27",
      verified_by: "human",
    });
    expect(captured.update?.last_verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.applied).toEqual(captured.update);
  });

  it("routes programs to au_programs and aliases closes_at → applications_close", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const { sb, captured } = makeSb({ data: { id: "syd-startmate-accelerator" }, error: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);

    const res = await PATCH(patchReq({ closes_at: "Nov 2026" }), params("programs", "syd-startmate-accelerator"));
    expect(res.status).toBe(200);
    expect(captured.table).toBe("au_programs");
    expect(captured.update).toMatchObject({ applications_close: "Nov 2026", verified_by: "human" });
    expect(captured.update).not.toHaveProperty("closes_at");
  });
});

describe("GET /api/admin/funding/[kind]/[id]", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.getSupabaseAdmin.mockReset();
  });

  it("401 for non-admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await GET(new Request("http://x"), params("grants", "rdti"));
    expect(res.status).toBe(401);
  });

  it("returns the row for admin, 404 when missing", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const row = { id: "rdti", name: "R&DTI" };
    const { sb, captured } = makeSb({ data: row, error: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    let res = await GET(new Request("http://x"), params("grants", "rdti"));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, kind: "grants", row });
    expect(captured.table).toBe("au_grants");
    expect(captured.eq).toEqual(["id", "rdti"]);

    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ data: null, error: null }).sb);
    res = await GET(new Request("http://x"), params("programs", "missing"));
    expect(res.status).toBe(404);
  });
});
