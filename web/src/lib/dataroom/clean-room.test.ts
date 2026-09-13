// Colocated suite for the clean-room preparation guide (S29-A): the
// catalogue shape (7 stages, 16 tasks, every task in a stage, one "why"
// per stage, links to the existing controls), every computed task against
// its data-room signals, founder ticks with date + note, the "either"
// rule for link revocation, the stored-blob normalisation, the PATCH
// parser (computed tasks refused with 409) and the score.

import { describe, expect, it } from "vitest";
import {
  buildCleanRoomChecklist,
  CLEAN_ROOM_NOTE,
  CLEAN_ROOM_STAGES,
  CLEAN_ROOM_TASKS,
  isFounderTickable,
  normaliseStoredTasks,
  parseCleanRoomPatch,
  type CleanRoomSignals,
} from "./clean-room";

const noRoom: CleanRoomSignals = { roomExists: false, ndaRequired: false, watermarkEnabled: false, links: [], engagementEvents: 0 };
const link = (over: Partial<CleanRoomSignals["links"][number]> = {}) => ({ hasRecipient: true, sectionsRestricted: false, accessLevel: "view", active: true, ...over });
const full: CleanRoomSignals = {
  roomExists: true,
  ndaRequired: true,
  watermarkEnabled: true,
  links: [link({ sectionsRestricted: true }), link({ accessLevel: "download" })],
  engagementEvents: 12,
};

const taskById = (s: CleanRoomSignals, stored = {}) => Object.fromEntries(buildCleanRoomChecklist(s, stored).stages.flatMap((st) => st.tasks).map((t) => [t.id, t]));

describe("catalogue", () => {
  it("7 stages with a why each, 16 tasks each in a known stage, unique ids, computed tasks link to a control", () => {
    expect(CLEAN_ROOM_STAGES.map((s) => s.id)).toEqual(["scope", "classify", "redact", "access", "nda", "logging", "post-deal"]);
    for (const s of CLEAN_ROOM_STAGES) expect(s.why.length).toBeGreaterThan(120);
    expect(CLEAN_ROOM_TASKS).toHaveLength(16);
    const stageIds = new Set(CLEAN_ROOM_STAGES.map((s) => s.id));
    for (const t of CLEAN_ROOM_TASKS) {
      expect(stageIds.has(t.stage)).toBe(true);
      expect(t.detail.length).toBeGreaterThan(40);
      if (t.source !== "founder") expect(t.link?.href).toMatch(/^\/workspace\/data-room/);
    }
    expect(new Set(CLEAN_ROOM_TASKS.map((t) => t.id)).size).toBe(16);
    expect(CLEAN_ROOM_TASKS.filter((t) => t.source === "computed").map((t) => t.id)).toEqual(["classify-sections", "access-links", "access-restricted", "nda-gate", "nda-watermark", "log-engagement"]);
    expect(CLEAN_ROOM_TASKS.filter((t) => t.source === "either").map((t) => t.id)).toEqual(["post-revoke"]);
    const text = [...CLEAN_ROOM_STAGES.map((s) => s.why), ...CLEAN_ROOM_TASKS.map((t) => t.detail), CLEAN_ROOM_NOTE].join(" ");
    expect(text).not.toMatch(/PhD/);
    expect(CLEAN_ROOM_NOTE).toContain("not legal advice");
  });
});

describe("computed tasks", () => {
  it("no data room → every computed task undone with the 'No data room yet' evidence", () => {
    const t = taskById(noRoom);
    for (const id of ["classify-sections", "access-links", "access-restricted", "nda-gate", "nda-watermark", "log-engagement"]) {
      expect(t[id].done).toBe(false);
      expect(t[id].evidence).toBe("No data room yet");
      expect(t[id].doneAt).toBeNull();
    }
    expect(t["post-revoke"].done).toBe(false);
    expect(t["post-revoke"].evidence).toBe("No share links to revoke yet");
  });

  it("a fully configured room proves NDA, watermark, named links, restricted view-only tier and the log", () => {
    const t = taskById(full);
    expect(t["nda-gate"]).toMatchObject({ done: true, evidence: "NDA gate on" });
    expect(t["nda-watermark"]).toMatchObject({ done: true, evidence: "Watermark on" });
    expect(t["classify-sections"]).toMatchObject({ done: true, evidence: "1 of 2 share links restrict sections" });
    expect(t["access-restricted"]).toMatchObject({ done: true, evidence: "1 of 2 share links are view-only with restricted sections" });
    expect(t["access-links"]).toMatchObject({ done: true, evidence: "2 of 2 active links carry a named recipient" });
    expect(t["log-engagement"]).toMatchObject({ done: true, evidence: "12 engagement events logged" });
    expect(t["post-revoke"]).toMatchObject({ done: false, evidence: "2 of 2 links still active" });
  });

  it("edge rules: an unnamed active link fails access-links; a restricted download link is not view-only; no active links → nothing to attribute; revoked links satisfy post-revoke", () => {
    const unnamed = taskById({ ...full, links: [link(), link({ hasRecipient: false })] });
    expect(unnamed["access-links"]).toMatchObject({ done: false, evidence: "1 of 2 active links carry a named recipient" });
    const dl = taskById({ ...full, links: [link({ sectionsRestricted: true, accessLevel: "download" })] });
    expect(dl["classify-sections"].done).toBe(true);
    expect(dl["access-restricted"]).toMatchObject({ done: false, evidence: "0 of 1 share links are view-only with restricted sections" });
    const none = taskById({ ...full, links: [] });
    expect(none["access-links"]).toMatchObject({ done: false, evidence: "No active share links" });
    const revoked = taskById({ ...full, links: [link({ active: false }), link({ active: false })] });
    expect(revoked["post-revoke"]).toMatchObject({ done: true, evidence: "No share link is still active" });
    expect(revoked["access-links"].evidence).toBe("No active share links");
    const off = taskById({ ...full, ndaRequired: false, watermarkEnabled: false, engagementEvents: 1 });
    expect(off["nda-gate"].evidence).toBe("NDA gate off");
    expect(off["nda-watermark"].evidence).toBe("Watermark off");
    expect(off["log-engagement"].evidence).toBe("1 engagement event logged");
  });
});

describe("founder ticks, either, score", () => {
  it("founder tasks take their state from the stored row; computed ids in the store are ignored; 'either' is done by tick OR by the room", () => {
    const stored = normaliseStoredTasks({
      "scope-team": { done: true, at: "2026-09-01T00:00:00Z", note: "Counsel: Firm A; buyer CFO office" },
      "nda-gate": { done: true, at: "2026-09-01T00:00:00Z" }, // computed — must not count
      "post-revoke": { done: true, at: "2026-09-10T00:00:00Z" },
      "redact-people": { done: false, at: "2026-09-02T00:00:00Z", note: "pending" },
      bogus: { done: true },
      "log-retention": "yes",
    });
    expect(Object.keys(stored).sort()).toEqual(["nda-gate", "post-revoke", "redact-people", "scope-team"]);
    const t = taskById(noRoom, stored);
    expect(t["scope-team"]).toMatchObject({ done: true, doneAt: "2026-09-01T00:00:00Z", note: "Counsel: Firm A; buyer CFO office", evidence: null });
    expect(t["nda-gate"].done).toBe(false);
    expect(t["post-revoke"]).toMatchObject({ done: true, doneAt: "2026-09-10T00:00:00Z", evidence: "No share links to revoke yet" });
    expect(t["redact-people"]).toMatchObject({ done: false, doneAt: null, note: "pending" });
    expect(normaliseStoredTasks(null)).toEqual({});
    expect(normaliseStoredTasks([1])).toEqual({});
  });

  it("score: done ÷ total across stages; stage counts", () => {
    const empty = buildCleanRoomChecklist(noRoom, {});
    expect(empty).toMatchObject({ done: 0, total: 16, pct: 0, roomExists: false });
    expect(empty.stages.map((s) => [s.id, s.total])).toEqual([
      ["scope", 2],
      ["classify", 2],
      ["redact", 3],
      ["access", 2],
      ["nda", 3],
      ["logging", 2],
      ["post-deal", 2],
    ]);
    const some = buildCleanRoomChecklist(full, { "scope-team": { done: true, at: null, note: null }, "scope-protocol": { done: true, at: null, note: null } });
    // computed done: classify-sections, access-links, access-restricted, nda-gate, nda-watermark, log-engagement = 6; + 2 founder = 8.
    expect(some.done).toBe(8);
    expect(some.pct).toBe(50);
    expect(some.stages.find((s) => s.id === "scope")).toMatchObject({ done: 2, total: 2 });
    expect(some.stages.find((s) => s.id === "nda")).toMatchObject({ done: 2, total: 3 });
  });
});

describe("parseCleanRoomPatch", () => {
  it("accepts a founder task with a trimmed note; refuses unknown ids, non-boolean done, bad notes and computed tasks (409)", () => {
    expect(parseCleanRoomPatch({ taskId: "scope-team", done: true, note: "  Firm A  " })).toEqual({ ok: true, taskId: "scope-team", done: true, note: "Firm A" });
    expect(parseCleanRoomPatch({ taskId: "post-revoke", done: false })).toEqual({ ok: true, taskId: "post-revoke", done: false, note: null });
    expect(parseCleanRoomPatch({ taskId: "scope-team", done: true, note: "" })).toEqual({ ok: true, taskId: "scope-team", done: true, note: null });
    expect(parseCleanRoomPatch({ taskId: "nope", done: true })).toEqual({ ok: false, error: "unknown taskId", status: 400 });
    expect(parseCleanRoomPatch({ taskId: "scope-team", done: "yes" })).toMatchObject({ ok: false, status: 400 });
    expect(parseCleanRoomPatch({ taskId: "scope-team", done: true, note: 5 })).toMatchObject({ ok: false, status: 400 });
    expect(parseCleanRoomPatch({ taskId: "nda-gate", done: true })).toEqual({ ok: false, error: "computed_task", status: 409 });
    expect(parseCleanRoomPatch(null)).toMatchObject({ ok: false, status: 400 });
    expect(isFounderTickable("nda-watermark")).toBe(false);
    expect(isFounderTickable("post-revoke")).toBe(true);
    const long = parseCleanRoomPatch({ taskId: "scope-team", done: true, note: "x".repeat(600) });
    expect(long.ok && long.note?.length).toBe(500);
  });
});
