// Colocated vitest for lib/investor-drips/follow-up-server (S26-A).
//
// Pins: the candidate read narrows on auto_follow_up / is_active / email /
// last_accessed ≤ now − 2 days and joins rooms + the send ledger; the
// decision consults the unsubscribe list only after the pure vetoes pass;
// sendFollowUp claims the ledger row BEFORE sending (a UNIQUE violation →
// claimed_elsewhere, nothing sent), sends in the founder's name via the
// platform sender with unsubFooter() and the investor unsubscribe URL,
// rolls the claim back when the send fails, and a dry run writes nothing.
// The security pin: no summary and no email argument carries the share
// token beyond the room URL the investor already holds.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; reason?: string }>>(),
  unsubFooter: vi.fn<(...a: string[]) => string>(),
  isUnsubscribed: vi.fn<(e: string) => Promise<boolean>>(),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => mocks.sendEmail(...a),
  unsubFooter: (...a: string[]) => mocks.unsubFooter(...a),
}));
vi.mock("./send", async (importOriginal) => {
  const real = await importOriginal<typeof import("./send")>();
  return { ...real, isUnsubscribed: (e: string) => mocks.isUnsubscribed(e) };
});

import { followUpDecision, listFollowUpCandidates, MAX_CANDIDATE_PAGES, MAX_FOLLOW_UPS_PER_TICK, sendFollowUp } from "./follow-up-server";
import type { FollowUpLinkRow, FollowUpRoomRow } from "./follow-up";

const TOKEN = "s".repeat(48);
const LINK: FollowUpLinkRow = {
  id: "link-1",
  token: TOKEN,
  data_room_id: "room-1",
  account_id: "owner-1",
  investor_name: "Jane Chen",
  investor_email: "jane@bb.vc",
  investor_firm: "Blackbird",
  auto_follow_up: true,
  is_active: true,
  revoked_at: null,
  expires_at: null,
  first_accessed: "2026-09-07T03:00:00Z",
  last_accessed: "2026-09-07T03:00:00Z",
  nda_required: false,
  nda_signed_at: null,
  nda_signed_version: null,
};
const ROOM: FollowUpRoomRow = { id: "room-1", user_id: "owner-1", project_id: "p-1", name: "Acme room", startup_name: "Acme", nda_required: false, nda_version: 1 };
const NOW = new Date("2026-09-10T21:00:00Z");

let sb: FakeSupabase;
beforeEach(() => {
  process.env.CRON_SECRET = "secret";
  sb = fakeSupabase({
    data_room_access_tokens: [LINK],
    data_rooms: [ROOM],
    data_room_follow_ups: [],
    app_users: [{ display_name: "Sam Founder", email: "sam@acme.test" }],
    data_room_engagement: [{ section: "Team" }, { section: "Financials" }, { section: "Team" }],
  });
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true });
  mocks.unsubFooter.mockReset().mockImplementation((u) => `<footer>${u}</footer>`);
  mocks.isUnsubscribed.mockReset().mockResolvedValue(false);
});

describe("listFollowUpCandidates", () => {
  it("narrows the read to opted-in, active, emailed links viewed ≥ 2 days ago and joins room + ledger", async () => {
    const out = await listFollowUpCandidates(sb, NOW, 10);
    expect(out.length).toBe(1);
    expect(out[0].room).toEqual(ROOM);
    expect(out[0].alreadySent).toBe(false);
    expect(sb.hasEq("data_room_access_tokens", "auto_follow_up", true)).toBe(true);
    expect(sb.hasEq("data_room_access_tokens", "is_active", true)).toBe(true);
    const lte = sb.find("data_room_access_tokens", "lte")[0];
    expect(lte.args[0]).toBe("last_accessed");
    expect(lte.args[1]).toBe("2026-09-08T21:00:00.000Z");
    expect(sb.find("data_room_access_tokens", "limit")[0].args[0]).toBe(10);
    expect(sb.find("data_room_access_tokens", "range")[0].args).toEqual([0, 9]);
    expect(sb.find("data_rooms", "in")[0].args).toEqual(["id", ["room-1"]]);
    expect(sb.find("data_room_follow_ups", "in")[0].args).toEqual(["access_token_id", ["link-1"]]);
    expect(MAX_FOLLOW_UPS_PER_TICK).toBe(50);
  });

  it("drops a link with a ledger row (a sent link is never a candidate again — S26 review P1); empty read → no joins", async () => {
    sb.rows.data_room_follow_ups = [{ access_token_id: "link-1" }];
    expect(await listFollowUpCandidates(sb, NOW)).toEqual([]);
    expect(sb.find("data_rooms", "select").length).toBe(0);
    sb = fakeSupabase({ data_room_access_tokens: [] });
    expect(await listFollowUpCandidates(sb, NOW)).toEqual([]);
    expect(sb.find("data_rooms", "select").length).toBe(0);
  });

  it("pages past a full page of sent links so newer links are not starved, and stops at MAX_CANDIDATE_PAGES", async () => {
    // Every page the stub returns is the same full page of `limit` links; the
    // ledger says all of them were sent → the reader must move to the next
    // page instead of returning the same sent rows, and must give up after
    // MAX_CANDIDATE_PAGES rather than loop.
    const limit = 2;
    const sentLinks = [
      { ...LINK, id: "sent-a" },
      { ...LINK, id: "sent-b" },
    ];
    sb = fakeSupabase({ data_room_access_tokens: sentLinks, data_rooms: [ROOM], data_room_follow_ups: [{ access_token_id: "sent-a" }, { access_token_id: "sent-b" }] });
    expect(await listFollowUpCandidates(sb, NOW, limit)).toEqual([]);
    const ranges = sb.find("data_room_access_tokens", "range");
    // First page [0,1]; the stub repeats the same ids, so page 2 is empty after de-duplication → stop.
    expect(ranges[0].args).toEqual([0, 1]);
    expect(ranges[1].args).toEqual([2, 3]);
    expect(ranges.length).toBe(2);
    expect(MAX_CANDIDATE_PAGES).toBe(20);
  });

  it("returns at most `limit` unsent links even when a page holds more", async () => {
    const many = ["a", "b", "c"].map((id) => ({ ...LINK, id }));
    sb = fakeSupabase({ data_room_access_tokens: many, data_rooms: [ROOM], data_room_follow_ups: [{ access_token_id: "a" }] });
    const out = await listFollowUpCandidates(sb, NOW, 5);
    expect(out.map((c) => c.link.id)).toEqual(["b", "c"]);
    expect(out.every((c) => c.alreadySent === false)).toBe(true);
  });
});

describe("followUpDecision", () => {
  it("reads the unsubscribe list only after the pure vetoes pass", async () => {
    expect(await followUpDecision({ link: { ...LINK, auto_follow_up: false }, room: ROOM, alreadySent: false }, NOW)).toBe("opt_out");
    expect(mocks.isUnsubscribed).not.toHaveBeenCalled();
    expect(await followUpDecision({ link: LINK, room: ROOM, alreadySent: false }, NOW)).toBeNull();
    expect(mocks.isUnsubscribed).toHaveBeenCalledWith("jane@bb.vc");
    mocks.isUnsubscribed.mockResolvedValue(true);
    expect(await followUpDecision({ link: LINK, room: ROOM, alreadySent: false }, NOW)).toBe("unsubscribed");
  });
});

describe("sendFollowUp", () => {
  const cand = { link: LINK, room: ROOM, alreadySent: false };
  const opts = { baseUrl: "https://blockid.au/", now: NOW };

  it("claims the ledger row first, then sends in the founder's name with unsubFooter + the investor unsubscribe URL", async () => {
    const s = await sendFollowUp(sb, cand, opts);
    expect(s).toEqual({ link_id: "link-1", data_room_id: "room-1", outcome: "sent" });
    const claim = sb.find("data_room_follow_ups", "insert")[0].args[0] as Record<string, unknown>;
    expect(claim).toMatchObject({ access_token_id: "link-1", data_room_id: "room-1", account_id: "owner-1", investor_email: "jane@bb.vc", viewed_at: LINK.last_accessed, sent_at: NOW.toISOString() });
    expect(sb.hasEq("app_users", "id", "owner-1")).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const arg = mocks.sendEmail.mock.calls[0][0] as Record<string, string>;
    expect(arg.to).toBe("jane@bb.vc");
    expect(arg.fromName).toBe("Sam Founder");
    expect(arg.subject).toBe("Following up on the Acme data room");
    expect(arg.unsubscribeUrl).toMatch(/\/api\/investor-unsubscribe\?email=jane%40bb\.vc&token=[0-9a-f]{32}$/);
    expect(mocks.unsubFooter).toHaveBeenCalledWith(arg.unsubscribeUrl, arg.unsubscribeUrl, "en", "light");
    expect(arg.html).toContain(`<footer>${arg.unsubscribeUrl}</footer>`);
    expect(arg.html).toContain("Hi Jane,");
    expect(arg.html).toContain("opened 2 sections");
    expect(arg.html).toContain(`https://blockid.au/s/dr/${TOKEN}`);
    expect(arg.html).toContain("Sam Founder");
    // the summary never carries the token
    expect(JSON.stringify(s)).not.toContain(TOKEN);
    expect(sb.find("data_room_follow_ups", "delete").length).toBe(0);
  });

  it("a UNIQUE violation on the claim → claimed_elsewhere, nothing sent", async () => {
    const claimed = {
      ...sb,
      from: (table: string) => {
        if (table === "data_room_follow_ups") {
          return { insert: async () => ({ error: { code: "23505", message: "duplicate" } }) };
        }
        return sb.from(table);
      },
    } as unknown as FakeSupabase;
    const s = await sendFollowUp(claimed, cand, opts);
    expect(s.outcome).toBe("claimed_elsewhere");
    expect(s.reason).toBe("23505");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("a failed send rolls the claim back so the next tick retries", async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, reason: "not_configured" });
    const s = await sendFollowUp(sb, cand, opts);
    expect(s).toEqual({ link_id: "link-1", data_room_id: "room-1", outcome: "failed", reason: "not_configured" });
    expect(sb.find("data_room_follow_ups", "delete").length).toBe(1);
    expect(sb.hasEq("data_room_follow_ups", "access_token_id", "link-1")).toBe(true);
  });

  it("dry run writes nothing and sends nothing", async () => {
    const s = await sendFollowUp(sb, cand, { ...opts, dry: true });
    expect(s.outcome).toBe("would_send");
    expect(sb.find("data_room_follow_ups", "insert").length).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("falls back to the email local part when the founder has no display name, and to the room name for the startup", async () => {
    sb.rows.app_users = [{ display_name: null, email: "sam@acme.test" }];
    await sendFollowUp(sb, { ...cand, room: { ...ROOM, startup_name: null } }, opts);
    const arg = mocks.sendEmail.mock.calls[0][0] as Record<string, string>;
    expect(arg.fromName).toBe("sam");
    expect(arg.subject).toBe("Following up on the Acme room data room");
  });
});
