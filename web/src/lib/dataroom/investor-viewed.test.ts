// Colocated vitest for lib/dataroom/investor-viewed (S26-A).
//
// Pins: nothing fires below the trigger; a first open writes ONE
// `investor_viewed` row for the ROOM OWNER (data_rooms.user_id) with the
// per-link dedupe key + 24 h throttle and the founder-typed label (never
// the token); the email goes to the owner only when the row was written
// (throttled → no email); a room without an owner notifies nobody; the
// helper never throws into the caller.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  insert: vi.fn<(...a: unknown[]) => Promise<boolean>>(),
  email: vi.fn<(...a: unknown[]) => Promise<{ ok: boolean }>>(),
}));
vi.mock("@/lib/notifications", () => ({ insertNotification: (...a: unknown[]) => mocks.insert(...a) }));
vi.mock("@/lib/email", () => ({ sendInvestorViewedEmail: (...a: unknown[]) => mocks.email(...a) }));

import { investorLabel, maybeNotifyInvestorViewed } from "./investor-viewed";

const LINK = { id: "link-1", data_room_id: "room-1", first_accessed: null, investor_name: "Jane Chen", investor_firm: "Blackbird", investor_email: "j@bb.vc" };
const ROOM = { id: "room-1", user_id: "owner-1", project_id: "proj-1", name: "Acme" };

let sb: FakeSupabase;
beforeEach(() => {
  sb = fakeSupabase({ data_room_engagement: [], data_rooms: [ROOM], app_users: [{ email: "founder@x.test" }] });
  mocks.insert.mockReset().mockResolvedValue(true);
  mocks.email.mockReset().mockResolvedValue({ ok: true });
});

describe("investorLabel", () => {
  it("name · firm, then name, firm, email, then a neutral fallback — never a token", () => {
    expect(investorLabel(LINK)).toBe("Jane Chen · Blackbird");
    expect(investorLabel({ investor_name: "Jane" })).toBe("Jane");
    expect(investorLabel({ investor_firm: "Blackbird" })).toBe("Blackbird");
    expect(investorLabel({ investor_email: "j@bb.vc" })).toBe("j@bb.vc");
    expect(investorLabel({})).toBe("An investor");
  });
});

describe("maybeNotifyInvestorViewed", () => {
  it("does nothing for a repeat open below the depth threshold", async () => {
    const out = await maybeNotifyInvestorViewed(sb, {
      link: { ...LINK, first_accessed: "2026-09-01T00:00:00Z" },
      event: { eventType: "open", section: null, durationMs: null },
    });
    expect(out).toEqual({ trigger: null, notified: false, emailed: false });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
    expect(sb.find("data_rooms", "select").length).toBe(0);
  });

  it("first open → one notification for the room owner (dedupe per link, 24 h) + the email", async () => {
    const out = await maybeNotifyInvestorViewed(sb, { link: LINK, event: { eventType: "open", section: null, durationMs: null } });
    expect(out).toEqual({ trigger: "first_view", notified: true, emailed: true });
    expect(sb.hasEq("data_room_engagement", "access_token_id", "link-1")).toBe(true);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        projectId: "proj-1",
        kind: "investor_viewed",
        dedupeKey: "investor_viewed:link-1",
        throttleMs: 24 * 60 * 60_000,
        payload: expect.objectContaining({ investor: "Jane Chen · Blackbird", trigger: "first_view", link_id: "link-1", room: "Acme" }),
      }),
    );
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ to: "founder@x.test", investorLabel: "Jane Chen · Blackbird", trigger: "first_view", roomName: "Acme" }));
    expect(sb.hasEq("app_users", "id", "owner-1")).toBe(true);
  });

  it("deep read: stored events + the incoming one cross 3 sections → deep_read with the depth in the payload", async () => {
    sb.rows.data_room_engagement = [
      { event_type: "section_view", section: "Team", duration_ms: 40_000 },
      { event_type: "section_view", section: "Financials", duration_ms: 50_000 },
    ];
    const out = await maybeNotifyInvestorViewed(sb, {
      link: { ...LINK, first_accessed: "2026-09-01T00:00:00Z" },
      event: { eventType: "section_view", section: "Legal", durationMs: 10_000 },
    });
    expect(out.trigger).toBe("deep_read");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ trigger: "deep_read", sections: 3, dwell_ms: 100_000 }) }));
  });

  it("does not double-count the incoming event when the route already stored it at the head", async () => {
    sb.rows.data_room_engagement = [
      { event_type: "section_view", section: "Legal", duration_ms: 10_000 },
      { event_type: "section_view", section: "Team", duration_ms: 40_000 },
    ];
    const out = await maybeNotifyInvestorViewed(sb, {
      link: { ...LINK, first_accessed: "2026-09-01T00:00:00Z" },
      event: { eventType: "section_view", section: "Legal", durationMs: 10_000 },
    });
    expect(out.trigger).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("throttled (row not written) → no email", async () => {
    mocks.insert.mockResolvedValue(false);
    const out = await maybeNotifyInvestorViewed(sb, { link: LINK, event: { eventType: "open", section: null, durationMs: null } });
    expect(out).toEqual({ trigger: "first_view", notified: false, emailed: false });
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it("a room without an owner notifies nobody; an owner without an email gets the in-app row only", async () => {
    sb.rows.data_rooms = [{ ...ROOM, user_id: null }];
    const a = await maybeNotifyInvestorViewed(sb, { link: LINK, event: { eventType: "open", section: null, durationMs: null } });
    expect(a).toEqual({ trigger: "first_view", notified: false, emailed: false });
    expect(mocks.insert).not.toHaveBeenCalled();

    sb.rows.data_rooms = [ROOM];
    sb.rows.app_users = [];
    const b = await maybeNotifyInvestorViewed(sb, { link: LINK, event: { eventType: "open", section: null, durationMs: null } });
    expect(b).toEqual({ trigger: "first_view", notified: true, emailed: false });
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it("never throws into the caller", async () => {
    const broken = { from: () => { throw new Error("boom"); } } as unknown as FakeSupabase;
    await expect(maybeNotifyInvestorViewed(broken, { link: LINK, event: { eventType: "open", section: null, durationMs: null } })).resolves.toEqual({ trigger: null, notified: false, emailed: false });
  });
});
