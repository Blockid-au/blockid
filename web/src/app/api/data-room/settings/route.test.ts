// Colocated vitest for /api/data-room/settings (S21-A) — member-aware trust
// settings with plan gating.
//
// Pins:
//   - 401 anonymous, 503 no db, 400 bad body (before any lookup);
//   - the OWNER reads and writes; a project ADMIN writes; an EDITOR / VIEWER
//     reads with canEdit:false and gets 403 on PUT; a stranger gets 404 on
//     both (a room id is not an oracle);
//   - PUT is 402 feature_locked when the OWNER's plan lacks
//     investor_links.premium, even for the owner; GET still returns the
//     stored values with entitled:false;
//   - the PUT patch maps to the data_rooms columns, bumpVersion increments
//     nda_version from the stored value, and the update is scoped to the room id;
//   - GET returns the acceptance ledger scoped to the room.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  user: { id: "owner-1", email: "owner@x.test" } as { id: string; email: string } | null,
  ownerTrustEntitled: vi.fn<() => Promise<boolean>>(async () => true),
  assertProjectScope: vi.fn<(...a: unknown[]) => Promise<{ role: string }>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/dataroom/nda-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/dataroom/nda-server")>("@/lib/dataroom/nda-server");
  return { ...real, ownerTrustEntitled: () => mocks.ownerTrustEntitled() };
});
vi.mock("@/lib/projects", () => ({
  assertProjectScope: (...a: unknown[]) => mocks.assertProjectScope(...a),
  roleCanAdmin: (r: string) => r === "admin" || r === "owner",
  ProjectAccessError: class ProjectAccessError extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.name = "ProjectAccessError";
      this.code = code;
    }
  },
}));

import { GET, PUT } from "./route";

const ROOM = {
  id: "room-1",
  user_id: "owner-1",
  project_id: "proj-1",
  nda_required: false,
  nda_text: null,
  nda_version: 3,
  watermark_enabled: false,
};

let sb: FakeSupabase;
function setup(room: Record<string, unknown> | null = ROOM, acceptances: Record<string, unknown>[] = []) {
  sb = fakeSupabase({ data_rooms: room ? [room] : [], data_room_nda_acceptances: acceptances });
  mocks.sb = sb;
}

const getReq = (roomId?: string) =>
  new Request(`http://localhost/api/data-room/settings${roomId ? `?dataRoomId=${roomId}` : ""}`) as unknown as NextRequest;
const putReq = (body: unknown) =>
  new Request("http://localhost/api/data-room/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

function asMember(role: string, id = "member-1") {
  mocks.user = { id, email: `${id}@x.test` };
  mocks.assertProjectScope.mockResolvedValue({ role });
}
function asStranger() {
  mocks.user = { id: "stranger-1", email: "s@x.test" };
  mocks.assertProjectScope.mockRejectedValue(Object.assign(new Error("not_found"), { name: "ProjectAccessError", code: "not_found" }));
}

beforeEach(() => {
  mocks.user = { id: "owner-1", email: "owner@x.test" };
  mocks.ownerTrustEntitled.mockReset();
  mocks.ownerTrustEntitled.mockResolvedValue(true);
  mocks.assertProjectScope.mockReset();
  setup();
});

describe("GET /api/data-room/settings", () => {
  it("401s anonymous and 503s without a db", async () => {
    mocks.user = null;
    expect((await GET(getReq("room-1"))).status).toBe(401);
    mocks.user = { id: "owner-1", email: "owner@x.test" };
    mocks.sb = null;
    expect((await GET(getReq("room-1"))).status).toBe(503);
  });

  it("owner: returns the stored settings, the default clause, entitled and canEdit", async () => {
    const res = await GET(getReq("room-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({
      dataRoomId: "room-1",
      ndaRequired: false,
      ndaText: null,
      ndaVersion: 3,
      watermarkEnabled: false,
      entitled: true,
      feature: "investor_links.premium",
      canEdit: true,
      role: "owner",
    });
    expect(body.settings.defaultNdaText).toMatch(/^Mutual confidentiality\./);
    expect(sb.hasEq("data_rooms", "id", "room-1")).toBe(true);
    expect(mocks.assertProjectScope).not.toHaveBeenCalled();
  });

  it("owner without dataRoomId: resolves their newest room by user_id", async () => {
    await GET(getReq());
    expect(sb.hasEq("data_rooms", "user_id", "owner-1")).toBe(true);
  });

  it("returns the acceptance ledger scoped to the room, newest first", async () => {
    setup(ROOM, [
      { id: "a1", access_token_id: "l1", nda_version: 3, viewer_email: "j@x.vc", ua_family: "chrome", accepted_at: "2026-09-11T00:00:00Z" },
    ]);
    const body = await (await GET(getReq("room-1"))).json();
    expect(body.acceptances).toEqual([{ id: "a1", linkId: "l1", version: 3, viewerEmail: "j@x.vc", uaFamily: "chrome", acceptedAt: "2026-09-11T00:00:00Z" }]);
    expect(sb.hasEq("data_room_nda_acceptances", "data_room_id", "room-1")).toBe(true);
    expect(sb.find("data_room_nda_acceptances", "order")[0].args).toEqual(["accepted_at", { ascending: false }]);
  });

  it("Free owner: still reads, with entitled:false so the UI can explain the upgrade", async () => {
    mocks.ownerTrustEntitled.mockResolvedValue(false);
    const body = await (await GET(getReq("room-1"))).json();
    expect(body.settings.entitled).toBe(false);
    expect(body.settings.ndaVersion).toBe(3);
  });

  it("viewer / editor members read with canEdit:false; admin reads with canEdit:true", async () => {
    asMember("viewer");
    let body = await (await GET(getReq("room-1"))).json();
    expect(body.settings).toMatchObject({ canEdit: false, role: "viewer" });
    expect(mocks.assertProjectScope).toHaveBeenCalledWith(expect.objectContaining({ id: "member-1" }), "proj-1", "viewer");
    asMember("editor");
    body = await (await GET(getReq("room-1"))).json();
    expect(body.settings.canEdit).toBe(false);
    asMember("admin");
    body = await (await GET(getReq("room-1"))).json();
    expect(body.settings).toMatchObject({ canEdit: true, role: "admin" });
  });

  it("stranger: 404, and the acceptance ledger is never read", async () => {
    asStranger();
    expect((await GET(getReq("room-1"))).status).toBe(404);
    expect(sb.find("data_room_nda_acceptances", "select").length).toBe(0);
  });

  it("a room with no project_id is 404 for anyone but the owner", async () => {
    setup({ ...ROOM, project_id: null });
    asMember("admin");
    expect((await GET(getReq("room-1"))).status).toBe(404);
    expect(mocks.assertProjectScope).not.toHaveBeenCalled();
  });
});

describe("PUT /api/data-room/settings", () => {
  it("401s anonymous, 503s without a db, 400s a bad / empty body before any lookup", async () => {
    mocks.user = null;
    expect((await PUT(putReq({ ndaRequired: true }))).status).toBe(401);
    mocks.user = { id: "owner-1", email: "owner@x.test" };
    mocks.sb = null;
    expect((await PUT(putReq({ ndaRequired: true }))).status).toBe(503);
    setup();
    expect((await PUT(putReq({}))).status).toBe(400);
    expect((await PUT(putReq({ ndaRequired: "yes" }))).status).toBe(400);
    expect((await PUT(putReq("junk"))).status).toBe(400);
    expect(sb.calls.length).toBe(0);
  });

  it("owner: writes the mapped columns scoped to the room and returns the new settings", async () => {
    const res = await PUT(putReq({ dataRoomId: "room-1", ndaRequired: true, ndaText: " Custom clause. ", watermarkEnabled: true }));
    expect(res.status).toBe(200);
    const [upd] = sb.find("data_rooms", "update");
    expect(upd.args[0]).toMatchObject({ nda_required: true, nda_text: "Custom clause.", watermark_enabled: true });
    expect(upd.args[0]).not.toHaveProperty("nda_version");
    expect(sb.hasEq("data_rooms", "id", "room-1")).toBe(true);
    const body = await res.json();
    expect(body.settings).toMatchObject({ ndaRequired: true, ndaText: "Custom clause.", watermarkEnabled: true, canEdit: true });
  });

  it("bumpVersion increments nda_version from the STORED value (3 → 4)", async () => {
    await PUT(putReq({ dataRoomId: "room-1", bumpVersion: true }));
    const [upd] = sb.find("data_rooms", "update");
    expect((upd.args[0] as { nda_version: number }).nda_version).toBe(4);
  });

  it("402 feature_locked for a Free owner — the gate is Starter+ — and nothing is written", async () => {
    mocks.ownerTrustEntitled.mockResolvedValue(false);
    const res = await PUT(putReq({ dataRoomId: "room-1", ndaRequired: true }));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, error: "feature_locked", feature: "investor_links.premium" });
    expect(sb.find("data_rooms", "update").length).toBe(0);
  });

  it("admin member: may write (checked against the OWNER's plan, via the room's project)", async () => {
    asMember("admin");
    const res = await PUT(putReq({ dataRoomId: "room-1", watermarkEnabled: true }));
    expect(res.status).toBe(200);
    expect(mocks.assertProjectScope).toHaveBeenCalledWith(expect.objectContaining({ id: "member-1" }), "proj-1", "viewer");
    expect(sb.find("data_rooms", "update").length).toBe(1);
  });

  it("editor and viewer members: 403, nothing written", async () => {
    for (const role of ["editor", "viewer"]) {
      setup();
      asMember(role);
      const res = await PUT(putReq({ dataRoomId: "room-1", ndaRequired: true }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("forbidden");
      expect(sb.find("data_rooms", "update").length).toBe(0);
    }
  });

  it("stranger: 404, nothing written — indistinguishable from a room that does not exist", async () => {
    asStranger();
    expect((await PUT(putReq({ dataRoomId: "room-1", ndaRequired: true }))).status).toBe(404);
    setup(null);
    mocks.user = { id: "owner-1", email: "owner@x.test" };
    expect((await PUT(putReq({ dataRoomId: "room-x", ndaRequired: true }))).status).toBe(404);
    expect(sb.find("data_rooms", "update").length).toBe(0);
  });
});
