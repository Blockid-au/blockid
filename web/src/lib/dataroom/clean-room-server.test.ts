// Colocated suite for the clean-room server assembly (S29-A): link rows →
// signals (recipient, restricted sections, access level, active vs
// revoked / expired / inactive), the room lookup (project room first, the
// owner's legacy room as fallback, none → no signals), the engagement
// count, stored-task load / save (upsert keyed on the project) and the
// full checklist assembly.

import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

import { linkSignal, loadCleanRoomChecklist, loadCleanRoomSignals, loadStoredCleanRoomTasks, saveCleanRoomTask } from "./clean-room-server";

const NOW = new Date("2026-09-13T00:00:00Z");
const scope = { projectId: "proj-1", ownerUserId: "user-owner" };
const room = { id: "room-1", user_id: "user-owner", project_id: "proj-1", nda_required: true, watermark_enabled: false, updated_at: "2026-09-01T00:00:00Z" };
const link = (over: Record<string, unknown> = {}) => ({ id: "l1", data_room_id: "room-1", investor_email: "cfo@buyer.test", investor_name: null, sections_allowed: null, access_level: "view", is_active: true, expires_at: null, revoked_at: null, ...over });

describe("linkSignal", () => {
  it("recipient by email or name; restricted only for a non-empty list; access level lower-cased; active honours is_active, expiry and revocation", () => {
    expect(linkSignal(link(), NOW)).toEqual({ hasRecipient: true, sectionsRestricted: false, accessLevel: "view", active: true });
    expect(linkSignal(link({ investor_email: " ", investor_name: "Jo" }), NOW).hasRecipient).toBe(true);
    expect(linkSignal(link({ investor_email: null, investor_name: null }), NOW).hasRecipient).toBe(false);
    expect(linkSignal(link({ sections_allowed: [] }), NOW).sectionsRestricted).toBe(false);
    expect(linkSignal(link({ sections_allowed: ["Financials", ""] }), NOW).sectionsRestricted).toBe(true);
    expect(linkSignal(link({ access_level: "DOWNLOAD" }), NOW).accessLevel).toBe("download");
    expect(linkSignal(link({ access_level: null }), NOW).accessLevel).toBe("view");
    expect(linkSignal(link({ is_active: false }), NOW).active).toBe(false);
    expect(linkSignal(link({ expires_at: "2026-09-12T00:00:00Z" }), NOW).active).toBe(false);
    expect(linkSignal(link({ expires_at: "2026-09-14T00:00:00Z" }), NOW).active).toBe(true);
    expect(linkSignal(link({ revoked_at: "2026-09-10T00:00:00Z" }), NOW).active).toBe(false);
  });
});

describe("loadCleanRoomSignals", () => {
  it("project room → settings, links and the engagement count", async () => {
    const sb = fakeSupabase({
      data_rooms: [room],
      data_room_access_tokens: [link(), link({ id: "l2", sections_allowed: ["Financials"], is_active: false }), { id: "other", data_room_id: "room-2", investor_email: "x@y.test", investor_name: null, sections_allowed: null, access_level: "view", is_active: true, expires_at: null }],
      data_room_engagement: [{ id: "e1" }, { id: "e2" }, { id: "e3" }],
    });
    const s = await loadCleanRoomSignals(sb as never, scope, NOW);
    expect(s).toEqual({
      roomId: "room-1",
      roomExists: true,
      ndaRequired: true,
      watermarkEnabled: false,
      links: [
        { hasRecipient: true, sectionsRestricted: false, accessLevel: "view", active: true },
        { hasRecipient: true, sectionsRestricted: true, accessLevel: "view", active: false },
      ],
      engagementEvents: 3,
    });
    expect(sb.hasEq("data_rooms", "project_id", "proj-1")).toBe(true);
    expect(sb.hasEq("data_room_access_tokens", "data_room_id", "room-1")).toBe(true);
    expect(sb.hasEq("data_room_engagement", "data_room_id", "room-1")).toBe(true);
  });

  it("no room → empty signals; a legacy owner room (no project_id) is the fallback; another owner's room is not", async () => {
    expect(await loadCleanRoomSignals(fakeSupabase({ data_rooms: [] }) as never, scope, NOW)).toEqual({ roomId: null, roomExists: false, ndaRequired: false, watermarkEnabled: false, links: [], engagementEvents: 0 });
    const legacy = fakeSupabase({ data_rooms: [{ ...room, project_id: null, watermark_enabled: true }], data_room_access_tokens: [], data_room_engagement: [] });
    const s = await loadCleanRoomSignals(legacy as never, scope, NOW);
    expect(s).toMatchObject({ roomId: "room-1", roomExists: true, watermarkEnabled: true });
    expect(legacy.hasEq("data_rooms", "user_id", "user-owner")).toBe(true);
    const foreign = fakeSupabase({ data_rooms: [{ ...room, user_id: "someone-else", project_id: null }] });
    expect((await loadCleanRoomSignals(foreign as never, scope, NOW)).roomExists).toBe(false);
  });
});

describe("stored tasks + assembly", () => {
  it("load: absent → empty; wrong project → empty; save upserts the project row with the tick date and note", async () => {
    expect(await loadStoredCleanRoomTasks(fakeSupabase({ clean_room_checklists: [] }) as never, "proj-1")).toEqual({ tasks: {}, updatedAt: null });
    expect(await loadStoredCleanRoomTasks(fakeSupabase({ clean_room_checklists: [{ project_id: "proj-2", tasks: { "scope-team": { done: true } } }] }) as never, "proj-1")).toEqual({ tasks: {}, updatedAt: null });
    const sb = fakeSupabase({ clean_room_checklists: [{ project_id: "proj-1", tasks: { "scope-team": { done: true, at: "2026-09-01T00:00:00Z", note: null } }, updated_at: "2026-09-01T00:00:00Z" }] });
    const next = await saveCleanRoomTask(sb as never, "proj-1", "redact-code", true, "Escrow via NCC", NOW);
    expect(next).toEqual({
      "scope-team": { done: true, at: "2026-09-01T00:00:00Z", note: null },
      "redact-code": { done: true, at: "2026-09-13T00:00:00.000Z", note: "Escrow via NCC" },
    });
    const up = sb.find("clean_room_checklists", "upsert");
    expect(up).toHaveLength(1);
    expect(up[0].args[0]).toMatchObject({ project_id: "proj-1", tasks: next });
    expect(up[0].args[1]).toEqual({ onConflict: "project_id" });
    const untick = await saveCleanRoomTask(sb as never, "proj-1", "scope-team", false, null, NOW);
    expect(untick?.["scope-team"]).toEqual({ done: false, at: null, note: null });
  });

  it("assembly: computed from the room + founder ticks", async () => {
    const sb = fakeSupabase({
      data_rooms: [{ ...room, watermark_enabled: true }],
      data_room_access_tokens: [link({ sections_allowed: ["Financials"] })],
      data_room_engagement: [{ id: "e1" }],
      clean_room_checklists: [{ project_id: "proj-1", tasks: { "scope-team": { done: true, at: "2026-09-01T00:00:00Z", note: "Firm A" } }, updated_at: "2026-09-01T00:00:00Z" }],
    });
    const { checklist, roomId, updatedAt } = await loadCleanRoomChecklist(sb as never, scope, NOW);
    expect(roomId).toBe("room-1");
    expect(updatedAt).toBe("2026-09-01T00:00:00Z");
    // computed: classify-sections, access-links, access-restricted, nda-gate, nda-watermark, log-engagement = 6; founder scope-team = 1.
    expect(checklist).toMatchObject({ done: 7, total: 16, pct: 44, roomExists: true });
  });
});
