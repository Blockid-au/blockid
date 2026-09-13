// Colocated vitest for lib/investors/crm-server (S28-B).
//
// Pins: the scope resolver (denied passes through, no project → 409
// no_project, otherwise the project id + owner); list pagination (limit+1
// probe → nextCursor); getContact / findContactByEmail re-check the pair
// so a wrong project never reads another founder's row; appendTouchpoint
// inserts and bumps last_touch_at only forwards; changeStage writes the
// status_change row; the two S26-A hooks match by lower-cased email, never
// throw, and a cheque advances the stage forwards only.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ scope: vi.fn<(...a: unknown[]) => Promise<unknown>>() }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) }));

import {
  appendTouchpoint,
  changeStage,
  findContactByEmail,
  getContact,
  linkCommitment,
  linkDataRoomView,
  listContacts,
  listProjectCommitments,
  resolveCrmScope,
  stageForCommitmentStatus,
} from "./crm-server";
import type { ContactRow } from "./crm";

const PID = "proj-1";
const OWNER = "owner-1";
const C1 = "9f1c2e6a-1b2c-4d3e-8f90-123456789abc";

function contact(over: Partial<ContactRow> = {}): ContactRow {
  return {
    id: C1,
    project_id: PID,
    name: "Jane Chen",
    email: "jane@bb.vc",
    org: "Blackbird",
    role: null,
    type: "vc",
    stage: "meeting",
    source: null,
    tags: [],
    last_touch_at: "2026-09-01T00:00:00.000Z",
    next_step: null,
    next_step_due: null,
    owner_user_id: null,
    created_by: null,
    archived_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

let sb: FakeSupabase;
beforeEach(() => {
  sb = fakeSupabase({ investor_contacts: [contact()], investor_touchpoints: [], fundraise_rounds: [], fundraise_commitments: [] });
  mocks.scope.mockReset().mockResolvedValue({
    scope: { projectId: PID, role: "editor", isOwner: false, ownerUserId: OWNER, dataEmail: "o@x.test", userId: "m", email: "m@x.test" },
    denied: null,
  });
});

describe("resolveCrmScope", () => {
  it("passes a denial through, 409 no_project without a scope, else the project + owner", async () => {
    mocks.scope.mockResolvedValueOnce({ scope: null, denied: new Response("no", { status: 403 }) });
    const d = await resolveCrmScope("editor");
    expect(d.ok).toBe(false);
    expect(!d.ok && d.response.status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");

    mocks.scope.mockResolvedValueOnce({ scope: null, denied: null });
    const n = await resolveCrmScope("viewer");
    expect(!n.ok && n.response.status).toBe(409);
    expect(!n.ok && (await n.response.json()).error).toBe("no_project");

    const ok = await resolveCrmScope("viewer");
    expect(ok).toMatchObject({ ok: true, projectId: PID, ownerUserId: OWNER });
  });
});

describe("listContacts", () => {
  it("keys on the project, hides archived by default, probes limit+1 and hands back a cursor", async () => {
    sb.rows.investor_contacts = [contact({ id: "a" }), contact({ id: "b" }), contact({ id: C1 })];
    const page = await listContacts(sb as never, PID, { stage: "meeting", type: null, tag: "lead", search: "bla", includeArchived: false, limit: 2, cursor: null });
    expect(page.contacts.map((c) => c.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).not.toBeNull();
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    expect(sb.hasEq("investor_contacts", "stage", "meeting")).toBe(true);
    expect(sb.find("investor_contacts", "is")[0].args).toEqual(["archived_at", null]);
    expect(sb.find("investor_contacts", "contains")[0].args).toEqual(["tags", ["lead"]]);
    expect(sb.find("investor_contacts", "limit")[0].args).toEqual([3]);
    expect(String(sb.find("investor_contacts", "or")[0].args[0])).toContain("name.ilike.%bla%");
  });

  it("applies the keyset cursor as an or() filter", async () => {
    await listContacts(sb as never, PID, { stage: null, type: null, tag: null, search: null, includeArchived: true, limit: 50, cursor: { createdAt: "T", id: "I" } });
    expect(sb.find("investor_contacts", "is").length).toBe(0);
    expect(sb.find("investor_contacts", "or")[0].args[0]).toBe("created_at.lt.T,and(created_at.eq.T,id.lt.I)");
  });
});

describe("getContact / findContactByEmail", () => {
  it("re-checks the (id, project) pair and the lower-cased email", async () => {
    expect(await getContact(sb as never, PID, C1)).toMatchObject({ id: C1 });
    expect(await getContact(sb as never, "proj-2", C1)).toBeNull();
    expect(await getContact(sb as never, PID, "other")).toBeNull();
    expect(await findContactByEmail(sb as never, PID, " Jane@BB.vc ")).toMatchObject({ id: C1 });
    expect(sb.hasEq("investor_contacts", "email", "jane@bb.vc")).toBe(true);
    expect(await findContactByEmail(sb as never, PID, "sam@x.co")).toBeNull();
    expect(await findContactByEmail(sb as never, PID, "")).toBeNull();
    expect(await findContactByEmail(sb as never, "proj-2", "jane@bb.vc")).toBeNull();
  });
});

describe("appendTouchpoint", () => {
  it("inserts the row and moves last_touch_at forward only", async () => {
    const c = contact();
    await appendTouchpoint(sb as never, { contact: c, kind: "note", body: "Hi", occurredAt: "2026-09-05T00:00:00.000Z", createdBy: "u1" });
    const ins = sb.find("investor_touchpoints", "insert");
    expect(ins.length).toBe(1);
    expect(ins[0].args[0]).toMatchObject({ contact_id: C1, project_id: PID, kind: "note", body: "Hi", created_by: "u1", meta: {} });
    expect(sb.find("investor_contacts", "update")[0].args[0]).toMatchObject({ last_touch_at: "2026-09-05T00:00:00.000Z" });

    sb.calls.length = 0;
    await appendTouchpoint(sb as never, { contact: c, kind: "note", body: "Old", occurredAt: "2026-08-01T00:00:00.000Z", createdBy: "u1" });
    expect(sb.find("investor_contacts", "update").length).toBe(0);

    sb.calls.length = 0;
    await appendTouchpoint(sb as never, { contact: c, kind: "status_change", body: "x", createdBy: null, touch: false });
    expect(sb.find("investor_contacts", "update").length).toBe(0);
  });
});

describe("changeStage", () => {
  it("updates the stage and writes a status_change row with from/to; no-op when unchanged", async () => {
    const c = contact();
    expect(await changeStage(sb as never, { contact: c, to: "meeting", actorUserId: "u1" })).toBe(c);
    expect(sb.calls.length).toBe(0);
    await changeStage(sb as never, { contact: c, to: "diligence", actorUserId: "u1" });
    expect(sb.find("investor_contacts", "update")[0].args[0]).toMatchObject({ stage: "diligence" });
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    const tp = sb.find("investor_touchpoints", "insert")[0].args[0] as Record<string, unknown>;
    expect(tp).toMatchObject({ kind: "status_change", meta: { from: "meeting", to: "diligence" }, created_by: "u1" });
    expect(tp.body).toBe("Moved from Meeting to Diligence");
  });
});

describe("linkDataRoomView", () => {
  it("writes a data_room_view row for a matching contact, leaves the stage alone, never throws", async () => {
    const r = await linkDataRoomView(sb as never, { projectId: PID, email: "JANE@bb.vc", linkId: "link-1", trigger: "first_open", roomName: "Seed room", sections: 3 });
    expect(r).toEqual({ matched: true, contactId: C1, stageMovedTo: null });
    const tp = sb.find("investor_touchpoints", "insert")[0].args[0] as Record<string, unknown>;
    expect(tp).toMatchObject({ kind: "data_room_view", created_by: null, meta: { link_id: "link-1", trigger: "first_open", sections: 3 } });
    expect(tp.body).toContain("opened the data room");
    expect(sb.find("investor_contacts", "update").every((u) => !("stage" in (u.args[0] as object)))).toBe(true);

    expect(await linkDataRoomView(sb as never, { projectId: null, email: "jane@bb.vc", linkId: "l", trigger: "first_open" })).toEqual({ matched: false, contactId: null, stageMovedTo: null });
    expect(await linkDataRoomView(sb as never, { projectId: PID, email: "nobody@x.co", linkId: "l", trigger: "first_open" })).toMatchObject({ matched: false });

    const boom = { from: () => { throw new Error("db down"); } };
    expect(await linkDataRoomView(boom as never, { projectId: PID, email: "jane@bb.vc", linkId: "l", trigger: "deep_read" })).toMatchObject({ matched: false });
  });

  // S28-review P1: the engage beacon fires the hook on every event and every
  // event after the deep-read threshold is a `deep_read` trigger — one row
  // per (link, trigger) per 24 h, never one per beacon.
  it("writes at most one row per (link, trigger) inside 24 h; a different trigger, link or an older row still writes", async () => {
    const now = new Date("2026-09-13T10:00:00.000Z");
    const recent = (over: Record<string, unknown>) => ({
      id: "tp-1",
      contact_id: C1,
      project_id: PID,
      kind: "data_room_view",
      body: "x",
      occurred_at: "2026-09-13T09:30:00.000Z",
      created_by: null,
      meta: { link_id: "link-1", trigger: "deep_read", sections: 4 },
      created_at: "2026-09-13T09:30:00.000Z",
      ...over,
    });

    sb = fakeSupabase({ investor_contacts: [contact()], investor_touchpoints: [recent({})] });
    const again = await linkDataRoomView(sb as never, { projectId: PID, email: "jane@bb.vc", linkId: "link-1", trigger: "deep_read", sections: 5, now });
    expect(again).toEqual({ matched: true, contactId: C1, stageMovedTo: null, throttled: true });
    expect(sb.find("investor_touchpoints", "insert")).toHaveLength(0);
    expect(sb.hasEq("investor_touchpoints", "kind", "data_room_view")).toBe(true);
    expect(sb.find("investor_touchpoints", "contains")[0]?.args).toEqual(["meta", { link_id: "link-1", trigger: "deep_read" }]);

    // A different trigger on the same link is a new signal (first_open → deep_read).
    sb = fakeSupabase({ investor_contacts: [contact()], investor_touchpoints: [recent({ meta: { link_id: "link-1", trigger: "first_view" } })] });
    const other = await linkDataRoomView(sb as never, { projectId: PID, email: "jane@bb.vc", linkId: "link-1", trigger: "deep_read", now });
    expect(other).toEqual({ matched: true, contactId: C1, stageMovedTo: null });
    expect(other.throttled).toBeUndefined();
    expect(sb.find("investor_touchpoints", "insert")).toHaveLength(1);

    // Another link for the same investor writes.
    sb = fakeSupabase({ investor_contacts: [contact()], investor_touchpoints: [recent({ meta: { link_id: "link-2", trigger: "deep_read" } })] });
    expect(await linkDataRoomView(sb as never, { projectId: PID, email: "jane@bb.vc", linkId: "link-1", trigger: "deep_read", now })).toMatchObject({ matched: true });
    expect(sb.find("investor_touchpoints", "insert")).toHaveLength(1);

    // A row older than the window does not throttle (a return visit next week is news).
    sb = fakeSupabase({ investor_contacts: [contact()], investor_touchpoints: [recent({ occurred_at: "2026-09-11T09:30:00.000Z" })] });
    expect(await linkDataRoomView(sb as never, { projectId: PID, email: "jane@bb.vc", linkId: "link-1", trigger: "deep_read", now })).toMatchObject({ matched: true });
    expect(sb.find("investor_touchpoints", "insert")).toHaveLength(1);

    // A row of another contact / project never throttles this one (the fake ignores filters — the re-check must).
    sb = fakeSupabase({ investor_contacts: [contact()], investor_touchpoints: [recent({ contact_id: "other" }), recent({ project_id: "proj-2" })] });
    expect(await linkDataRoomView(sb as never, { projectId: PID, email: "jane@bb.vc", linkId: "link-1", trigger: "deep_read", now })).toMatchObject({ matched: true });
    expect(sb.find("investor_touchpoints", "insert")).toHaveLength(1);
  });
});

describe("linkCommitment", () => {
  it("writes a commitment row and advances the stage forwards only", async () => {
    const r = await linkCommitment(sb as never, {
      projectId: PID,
      email: "jane@bb.vc",
      commitmentId: "k1",
      roundId: "round-1",
      roundName: "Seed",
      amountAud: "250000",
      status: "signed",
      event: "created",
      actorUserId: "u1",
    });
    expect(r).toEqual({ matched: true, contactId: C1, stageMovedTo: "committed" });
    const inserts = sb.find("investor_touchpoints", "insert").map((c) => c.args[0] as Record<string, unknown>);
    expect(inserts[0]).toMatchObject({ kind: "commitment", meta: { commitment_id: "k1", round_id: "round-1", status: "signed", amount_aud: 250000 } });
    expect(String(inserts[0].body)).toContain("$250,000");
    expect(inserts[1]).toMatchObject({ kind: "status_change", meta: { from: "meeting", to: "committed", auto: "cheque signed" } });
    expect(sb.find("investor_contacts", "update").some((u) => (u.args[0] as { stage?: string }).stage === "committed")).toBe(true);
  });

  it("a soft / withdrawn cheque only writes the row; an invested contact is never moved back", async () => {
    sb.rows.investor_contacts = [contact({ stage: "invested" })];
    const r = await linkCommitment(sb as never, { projectId: PID, email: "jane@bb.vc", commitmentId: "k", roundId: "r", amountAud: 1, status: "committed", event: "updated", actorUserId: null });
    expect(r.stageMovedTo).toBeNull();
    expect(sb.find("investor_touchpoints", "insert").length).toBe(1);
    sb.calls.length = 0;
    sb.rows.investor_contacts = [contact({ stage: "researching" })];
    const s = await linkCommitment(sb as never, { projectId: PID, email: "jane@bb.vc", commitmentId: "k", roundId: "r", amountAud: 1, status: "soft", event: "created", actorUserId: null });
    expect(s.stageMovedTo).toBeNull();
    expect(stageForCommitmentStatus("funded")).toBe("invested");
    expect(stageForCommitmentStatus("withdrawn")).toBeNull();
  });
});

describe("listProjectCommitments", () => {
  it("reads the owner's rounds for the project (legacy null project_id included) then the cheques on them", async () => {
    sb.rows.fundraise_rounds = [
      { id: "r1", project_id: PID },
      { id: "r2", project_id: null },
      { id: "r3", project_id: "proj-2" },
    ];
    sb.rows.fundraise_commitments = [
      { investor_email: "a@x.co", amount_aud: 1, status: "committed", round_id: "r1" },
      { investor_email: "b@x.co", amount_aud: 2, status: "committed", round_id: "r3" },
    ];
    const rows = await listProjectCommitments(sb as never, { ownerUserId: OWNER, projectId: PID });
    expect(rows.map((r) => r.round_id)).toEqual(["r1"]);
    expect(sb.hasEq("fundraise_rounds", "account_id", OWNER)).toBe(true);
    expect(sb.hasEq("fundraise_commitments", "account_id", OWNER)).toBe(true);
    expect(sb.find("fundraise_commitments", "in")[0].args).toEqual(["round_id", ["r1", "r2"]]);
    sb.rows.fundraise_rounds = [];
    expect(await listProjectCommitments(sb as never, { ownerUserId: OWNER, projectId: PID })).toEqual([]);
  });
});
