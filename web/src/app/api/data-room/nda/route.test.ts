// Colocated vitest for POST /api/data-room/nda — the NDA click-wrap accept (S21-A).
//
// Pins:
//   - a bad / revoked / expired / orphaned token 404s identically (no oracle);
//   - a room that does not ask answers not_required and writes nothing; the
//     owner's plan is never consulted (P2-5: an enabled gate survives a lapse);
//   - a stale version (founder bumped mid-read) is refused with 409 and the
//     current version, and writes nothing;
//   - the acceptance row shape: (link, version, hash of the clause shown,
//     viewer email if given, salted ip hash, UA family, ts) — never the raw
//     IP or the full UA — with ON CONFLICT DO NOTHING on (link, version);
//   - the link row gets nda_signed_at / nda_signed_ip (hash) / nda_signed_version
//     and NOTHING else — the viewer-typed email never reaches
//     `investor_email` (S21-A review P1-1: showcase-reviews trusts that
//     column as the reviewer identity);
//   - an nda_sign engagement event is written for the founder's activity;
//   - a link that already accepted the current version is a no-op 200.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  ownerTrustEntitled: vi.fn<() => Promise<boolean>>(async () => true),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/dataroom/nda-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/dataroom/nda-server")>("@/lib/dataroom/nda-server");
  return { ...real, ownerTrustEntitled: () => mocks.ownerTrustEntitled() };
});

import { POST } from "./route";
import { DEFAULT_NDA_TEXT } from "@/lib/dataroom/nda";

const TOKEN = "n".repeat(32);

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost/api/data-room/nda", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const LINK = {
  id: "link-1",
  data_room_id: "room-1",
  account_id: "owner-1",
  is_active: true,
  revoked_at: null,
  expires_at: null,
  nda_required: false,
  nda_signed_at: null,
  nda_signed_version: null,
};
const ROOM = { id: "room-1", user_id: "owner-1", nda_required: true, nda_text: null, nda_version: 2 };

let sb: FakeSupabase;
function setup(link: Record<string, unknown> | null, room: Record<string, unknown> | null = ROOM) {
  sb = fakeSupabase({
    data_room_access_tokens: link ? [link] : [],
    data_rooms: room ? [room] : [],
  });
  mocks.sb = sb;
}

beforeEach(() => {
  mocks.ownerTrustEntitled.mockReset();
  mocks.ownerTrustEntitled.mockResolvedValue(true);
  delete process.env.IP_HASH_SALT;
  setup(LINK);
});

describe("POST /api/data-room/nda", () => {
  it("503s without a database", async () => {
    mocks.sb = null;
    expect((await POST(req({ token: TOKEN, version: 2 }))).status).toBe(503);
  });

  it("400s a malformed body before any lookup", async () => {
    expect((await POST(req({ version: 2 }))).status).toBe(400);
    expect((await POST(req({ token: TOKEN, version: 0 }))).status).toBe(400);
    expect((await POST(req("nope"))).status).toBe(400);
    expect(sb.calls.length).toBe(0);
  });

  it("404s a bad, revoked, expired or orphaned token identically", async () => {
    setup(null);
    expect((await POST(req({ token: TOKEN, version: 2 }))).status).toBe(404);
    setup({ ...LINK, is_active: false, revoked_at: "2026-09-01T00:00:00Z" });
    expect((await POST(req({ token: TOKEN, version: 2 }))).status).toBe(404);
    setup({ ...LINK, expires_at: "2020-01-01T00:00:00Z" });
    expect((await POST(req({ token: TOKEN, version: 2 }))).status).toBe(404);
    setup(LINK, null);
    expect((await POST(req({ token: TOKEN, version: 2 }))).status).toBe(404);
    expect(sb.find("data_room_nda_acceptances", "upsert").length).toBe(0);
  });

  it("looks the link up by token and the room by the LINK's room id", async () => {
    await POST(req({ token: TOKEN, version: 2 }));
    expect(sb.hasEq("data_room_access_tokens", "token", TOKEN)).toBe(true);
    expect(sb.hasEq("data_rooms", "id", "room-1")).toBe(true);
  });

  it("a room that does not ask: answers not_required and writes nothing", async () => {
    setup(LINK, { ...ROOM, nda_required: false });
    const res = await POST(req({ token: TOKEN, version: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "not_required" });
    expect(sb.find("data_room_nda_acceptances", "upsert").length).toBe(0);
    expect(sb.find("data_room_access_tokens", "update").length).toBe(0);
  });

  it("owner's plan lapsed: the enabled gate still takes the acceptance — never consults the plan (P2-5)", async () => {
    mocks.ownerTrustEntitled.mockResolvedValue(false);
    const res = await POST(req({ token: TOKEN, version: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "accepted", version: 2 });
    expect(sb.find("data_room_nda_acceptances", "upsert").length).toBe(1);
    expect(mocks.ownerTrustEntitled).not.toHaveBeenCalled();
    expect(sb.find("app_users", "select").length).toBe(0);
  });

  it("409s a stale version with the current one, writing nothing", async () => {
    const res = await POST(req({ token: TOKEN, version: 1 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "nda_version_changed", version: 2 });
    expect(sb.find("data_room_nda_acceptances", "upsert").length).toBe(0);
  });

  it("records the acceptance row, the link pointer and the nda_sign event", async () => {
    process.env.IP_HASH_SALT = "unit-salt";
    const res = await POST(
      req({ token: TOKEN, version: 2, email: "Jane@Fund.VC" }, { "x-forwarded-for": "6.6.6.6, 203.0.113.9", "user-agent": "Mozilla/5.0 Chrome/120 Safari/537" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "accepted", version: 2 });
    expect(typeof body.acceptedAt).toBe("string");

    const [up] = sb.find("data_room_nda_acceptances", "upsert");
    const row = up.args[0] as Record<string, unknown>;
    const { createHash } = await import("node:crypto");
    expect(row).toMatchObject({
      data_room_id: "room-1",
      access_token_id: "link-1",
      account_id: "owner-1",
      nda_version: 2,
      nda_text_sha256: createHash("sha256").update(DEFAULT_NDA_TEXT).digest("hex"),
      viewer_email: "jane@fund.vc",
      ua_family: "chrome",
      ip_hash: createHash("sha256").update("203.0.113.9|unit-salt").digest("hex"),
      accepted_at: body.acceptedAt,
    });
    expect(JSON.stringify(row)).not.toContain("6.6.6.6");
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
    expect(JSON.stringify(row)).not.toContain("Mozilla");
    expect(up.args[1]).toEqual({ onConflict: "access_token_id,nda_version", ignoreDuplicates: true });

    const [upd] = sb.find("data_room_access_tokens", "update");
    expect(upd.args[0]).toMatchObject({ nda_signed_at: body.acceptedAt, nda_signed_version: 2 });
    expect(upd.args[0]).not.toHaveProperty("investor_email");
    expect(Object.keys(upd.args[0] as object).sort()).toEqual(["nda_signed_at", "nda_signed_ip", "nda_signed_version"]);
    expect((upd.args[0] as { nda_signed_ip: string }).nda_signed_ip).toMatch(/^[0-9a-f]{64}$/);
    expect(sb.hasEq("data_room_access_tokens", "id", "link-1")).toBe(true);

    const [ev] = sb.find("data_room_engagement", "insert");
    expect(ev.args[0]).toMatchObject({ data_room_id: "room-1", access_token_id: "link-1", event_type: "nda_sign" });
  });

  it("never writes investor_email from the body — with or without a viewer email (P1-1)", async () => {
    await POST(req({ token: TOKEN, version: 2 }));
    let [upd] = sb.find("data_room_access_tokens", "update");
    expect(upd.args[0]).not.toHaveProperty("investor_email");
    const [up] = sb.find("data_room_nda_acceptances", "upsert");
    expect((up.args[0] as { viewer_email: unknown }).viewer_email).toBeNull();

    // A token holder claiming a partner's address gets it on the ledger only.
    setup(LINK);
    await POST(req({ token: TOKEN, version: 2, email: "partner@blackbird.vc" }));
    [upd] = sb.find("data_room_access_tokens", "update");
    expect(JSON.stringify(upd.args[0])).not.toContain("partner@blackbird.vc");
    const [up2] = sb.find("data_room_nda_acceptances", "upsert");
    expect((up2.args[0] as { viewer_email: unknown }).viewer_email).toBe("partner@blackbird.vc");
  });

  it("hashes the clause the founder actually set, not the default, when one exists", async () => {
    setup(LINK, { ...ROOM, nda_text: "Keep it secret." });
    await POST(req({ token: TOKEN, version: 2 }));
    const [up] = sb.find("data_room_nda_acceptances", "upsert");
    const { createHash } = await import("node:crypto");
    expect((up.args[0] as { nda_text_sha256: string }).nda_text_sha256).toBe(createHash("sha256").update("Keep it secret.").digest("hex"));
  });

  it("is a no-op 200 for a link that already accepted the current version", async () => {
    setup({ ...LINK, nda_signed_at: "2026-09-10T00:00:00Z", nda_signed_version: 2 });
    const res = await POST(req({ token: TOKEN, version: 2 }));
    expect(await res.json()).toEqual({ ok: true, status: "accepted", version: 2 });
    expect(sb.find("data_room_nda_acceptances", "upsert").length).toBe(0);
  });

  it("re-accepts after a version bump (stale acceptance → new row for the new version)", async () => {
    setup({ ...LINK, nda_signed_at: "2026-09-10T00:00:00Z", nda_signed_version: 1 });
    const res = await POST(req({ token: TOKEN, version: 2 }));
    expect(res.status).toBe(200);
    const [up] = sb.find("data_room_nda_acceptances", "upsert");
    expect((up.args[0] as { nda_version: number }).nda_version).toBe(2);
  });
});
