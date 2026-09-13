// Colocated vitest for /api/cron/investor-followups (S26-A). Pins: Bearer
// CRON_SECRET gate (401 unset / mismatched / lowercase scheme), 503 without
// Supabase, 503 when the candidate read throws (0355 not applied), `?dry=1`
// → decisions run but sends are dry (would_send, nothing written), skipped
// candidates carry their reason, outcomes are tallied, POST === GET, and
// the response never carries a share token or an email address.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  supabaseAvailable: true,
  listMock: vi.fn(),
  decideMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (h.supabaseAvailable ? { from: () => ({}) } : null) }));
vi.mock("@/lib/investor-drips/follow-up-server", () => ({
  MAX_FOLLOW_UPS_PER_TICK: 50,
  listFollowUpCandidates: (db: unknown, now: Date, limit: number) => h.listMock(db, now, limit),
  followUpDecision: (c: unknown, now: Date) => h.decideMock(c, now),
  sendFollowUp: (db: unknown, c: unknown, opts: unknown) => h.sendMock(db, c, opts),
}));

import { GET, POST, dynamic, maxDuration } from "./route";

const SECRET = "cron-secret-xyz";
const TOKEN = "z".repeat(48);
const EMAIL = "jane@bb.vc";

function candidate(id: string) {
  return {
    link: { id, token: TOKEN, data_room_id: "room-1", account_id: "owner-1", investor_email: EMAIL, investor_name: "Jane", auto_follow_up: true, is_active: true, last_accessed: "2026-09-07T03:00:00Z" },
    room: { id: "room-1", user_id: "owner-1", project_id: null, name: "Acme", startup_name: "Acme", nda_required: false, nda_version: 1 },
    alreadySent: false,
  };
}

function req(auth?: string, query = ""): Request {
  return new Request(`https://blockid.au/api/cron/investor-followups${query}`, { headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  h.supabaseAvailable = true;
  h.listMock.mockReset().mockResolvedValue([]);
  h.decideMock.mockReset().mockResolvedValue(null);
  h.sendMock.mockReset().mockImplementation(async (_db, c: ReturnType<typeof candidate>, opts: { dry?: boolean }) => ({
    link_id: c.link.id,
    data_room_id: c.link.data_room_id,
    outcome: opts.dry ? "would_send" : "sent",
  }));
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/investor-followups — gate", () => {
  it("exports the Next route config", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(120);
  });

  it("401 without / with the wrong / lowercase-scheme bearer; never lists candidates", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect((await GET(req(`bearer ${SECRET}`))).status).toBe(401);
    expect(h.listMock).not.toHaveBeenCalled();
  });

  it("401 when CRON_SECRET is unset even with a matching header", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req(`Bearer ${SECRET}`))).status).toBe(401);
  });

  it("503 without Supabase", async () => {
    h.supabaseAvailable = false;
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("supabase_unavailable");
  });

  it("503 candidates_unavailable when the lister throws (migration not applied)", async () => {
    h.listMock.mockRejectedValue(new Error('relation "data_room_follow_ups" does not exist'));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("candidates_unavailable");
    expect(body.detail).toContain("data_room_follow_ups");
  });
});

describe("GET /api/cron/investor-followups — work", () => {
  it("asks for at most 50 candidates, sends the due ones, records skip reasons, tallies", async () => {
    h.listMock.mockResolvedValue([candidate("a"), candidate("b"), candidate("c")]);
    h.decideMock.mockImplementation(async (c: ReturnType<typeof candidate>) => (c.link.id === "b" ? "nda_unmet" : null));
    h.sendMock.mockImplementationOnce(async (_db, c: ReturnType<typeof candidate>) => ({ link_id: c.link.id, data_room_id: "room-1", outcome: "sent" }));
    h.sendMock.mockImplementationOnce(async (_db, c: ReturnType<typeof candidate>) => ({ link_id: c.link.id, data_room_id: "room-1", outcome: "failed", reason: "not_configured" }));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(h.listMock.mock.calls[0][2]).toBe(50);
    expect(body).toMatchObject({ ok: true, dryRun: false, candidates: 3, processed: 3, sent: 1, skipped: 1, failed: 1, claimedElsewhere: 0, budgetExceeded: false });
    expect(body.links).toEqual([
      { link_id: "a", data_room_id: "room-1", outcome: "sent" },
      { link_id: "b", data_room_id: "room-1", outcome: "skipped", reason: "nda_unmet" },
      { link_id: "c", data_room_id: "room-1", outcome: "failed", reason: "not_configured" },
    ]);
    expect(h.sendMock).toHaveBeenCalledTimes(2);
    expect((h.sendMock.mock.calls[0][2] as { baseUrl: string }).baseUrl).toMatch(/^https?:\/\//);
  });

  it("?dry=1 runs the decisions and passes dry through to the sender (would_send counts as sent)", async () => {
    h.listMock.mockResolvedValue([candidate("a")]);
    const res = await GET(req(`Bearer ${SECRET}`, "?dry=1"));
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.sent).toBe(1);
    expect(body.links[0].outcome).toBe("would_send");
    expect((h.sendMock.mock.calls[0][2] as { dry?: boolean }).dry).toBe(true);
  });

  it("the response never carries a share token or an email address", async () => {
    h.listMock.mockResolvedValue([candidate("a"), candidate("b")]);
    h.decideMock.mockResolvedValueOnce(null).mockResolvedValueOnce("too_soon");
    const text = await (await GET(req(`Bearer ${SECRET}`))).text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(EMAIL);
  });

  it("POST is the same handler", async () => {
    h.listMock.mockResolvedValue([candidate("a")]);
    const res = await POST(new Request("https://blockid.au/api/cron/investor-followups", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } }));
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(1);
  });
});
