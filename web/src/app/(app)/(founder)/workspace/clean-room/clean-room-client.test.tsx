// Colocated render test for the clean-room guide client (S29-A).
//
// Pins the progress strip, the seven stages in order with a "why" each,
// every task row with its done / source markers, computed rows locked with
// their evidence + control link, founder rows tickable for editor+ only
// (viewer: read-only line, no tick buttons), the no-project / no-room
// hints, the practical-not-legal note and the copy rule (no "PhD").

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCleanRoomChecklist, CLEAN_ROOM_NOTE, CLEAN_ROOM_STAGES } from "@/lib/dataroom/clean-room";
import { canTick, CleanRoomClient, taskStatusLine, type CleanRoomState } from "./clean-room-client";

const signals = {
  roomExists: true,
  ndaRequired: true,
  watermarkEnabled: false,
  links: [{ hasRecipient: true, sectionsRestricted: true, accessLevel: "view", active: true }],
  engagementEvents: 4,
};

function state(over: Partial<CleanRoomState> = {}): CleanRoomState {
  return {
    role: "owner",
    roomId: "room-1",
    updatedAt: "2026-09-01T00:00:00Z",
    checklist: buildCleanRoomChecklist(signals, { "scope-team": { done: true, at: "2026-09-01T00:00:00Z", note: "Firm A" } }),
    ...over,
  };
}

const html = (s: CleanRoomState) => renderToStaticMarkup(<CleanRoomClient initial={s} />);

describe("CleanRoomClient", () => {
  it("helpers", () => {
    expect(canTick("editor")).toBe(true);
    expect(canTick("viewer")).toBe(false);
    const t = state().checklist.stages.flatMap((s) => s.tasks);
    expect(taskStatusLine(t.find((x) => x.id === "nda-gate")!)).toBe("Room shows: NDA gate on");
    expect(taskStatusLine(t.find((x) => x.id === "scope-team")!)).toBe("Ticked 1 Sept 2026");
    expect(taskStatusLine(t.find((x) => x.id === "redact-code")!)).toBe("Not yet");
  });

  it("owner: progress, seven stages with why, 16 task rows, computed rows locked with evidence + link, founder rows tickable", () => {
    const out = html(state());
    expect(out).toContain("38 %"); // 5 computed (watermark off) + 1 founder
    expect(out).toContain("6 of 16 tasks");
    for (const s of CLEAN_ROOM_STAGES) expect(out).toContain(`data-stage="${s.id}"`);
    expect((out.match(/data-testid="clean-room-why"/g) ?? []).length).toBe(7);
    expect((out.match(/data-testid="clean-room-task"/g) ?? []).length).toBe(16);
    expect(out).toContain('data-task="nda-gate" data-done="1" data-source="computed"');
    expect(out).toContain('data-task="nda-watermark" data-done="0" data-source="computed"');
    expect(out).toContain("Decided by the data room · Room shows: Watermark off");
    expect(out).toContain('href="/workspace/data-room#trust"');
    expect(out).toContain('href="/workspace/data-room#share"');
    expect(out).toContain('data-task="scope-team" data-done="1" data-source="founder"');
    expect(out).toContain("Ticked 1 Sept 2026");
    expect(out).toContain('data-task="post-revoke" data-done="0" data-source="either"');
    expect(out).toContain("Room or your tick · Room shows: 1 of 1 links still active");
    // 10 tickable rows (9 founder + 1 either) → 10 tick buttons; computed rows have none.
    expect((out.match(/data-testid="clean-room-tick"/g) ?? []).length).toBe(10);
    expect(out).toContain(CLEAN_ROOM_NOTE.replace(/'/g, "&#x27;"));
    expect(out).not.toContain('data-testid="clean-room-no-room"');
    expect(out).not.toMatch(/PhD/);
  });

  it("viewer: read-only, no tick buttons, note shown as text; no project / no room hints", () => {
    const viewer = html(state({ role: "viewer" }));
    expect(viewer).toContain('data-testid="clean-room-readonly"');
    expect(viewer).not.toContain('data-testid="clean-room-tick"');
    expect(viewer).toContain("Firm A");
    const none = html(state({ role: null, roomId: null, updatedAt: null, checklist: buildCleanRoomChecklist({ ...signals, roomExists: false, links: [], engagementEvents: 0, ndaRequired: false }, {}) }));
    expect(none).toContain('data-testid="clean-room-no-project"');
    expect(none).toContain("0 of 16 tasks");
    const noRoom = html(state({ checklist: buildCleanRoomChecklist({ ...signals, roomExists: false, links: [], engagementEvents: 0 }, {}) }));
    expect(noRoom).toContain('data-testid="clean-room-no-room"');
    expect(noRoom).toContain("Room shows: No data room yet");
  });
});
