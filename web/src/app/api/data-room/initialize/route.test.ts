// Colocated vitest for POST + GET /api/data-room/initialize — P9-data-room-initialize-route-test.
//
// The route is the "provision the founder's professional data room" endpoint
// cited under P1_dataroom_map in docs/plans/atlassian-standard-mapping-goal.md.
// POST gates on `share_management`, materialises a data_rooms v2 row (or
// refreshes the existing one), re-seeds data_room_documents from
// getFoldersForStage(stage), seeds three default automation goals when none
// exist, and returns the founder-facing action plan the /workspace surface
// consumes. GET reports the current completeness snapshot + missing-P0 tail.
//
// Silent regressions this pins:
//   - dropping the share_management gate so a free-tier user provisions a
//     paid data room (revenue leak) — or flipping the feature key so the
//     gate always passes / always fails.
//   - dropping the getSupabaseAdmin 503 branch on either verb so the route
//     NPEs the founder's dashboard on a mis-configured env.
//   - regressing the "reuse existing v2 room" branch so every POST creates a
//     new nanoid(32) token — invalidating every previously-shared link.
//   - regressing the "template_version !== 2 → create fresh" branch so a
//     legacy v1 room is silently kept and reseeded, corrupting the schema.
//   - dropping the delete-before-insert on data_room_documents so re-runs
//     duplicate every document row (breaks completeness maths).
//   - regressing the existingGoals?.length guard so every POST re-inserts
//     the three default goals (duplicate active goals in /workspace).
//   - regressing the actionPlan cap off 8 rows so the widget renders a
//     500-item wall.
//   - flipping the actionPlan filter off `priority === "P0"` so P1/P2 tasks
//     bleed into the "high-impact next step" tile.
//   - GET reporting `overall === NaN` when total=0 (should be 0) — breaks
//     the completeness dial rendering.
//   - GET dropping the `.eq("status", "active")` on goals so archived goals
//     bleed into the active list.
//   - GET dropping the `.eq("account_id", user.id)` on either table so
//     data leaks across tenants.
//   - GET flipping the missingP0 filter off `priority === "P0" && status ===
//     "missing"` so complete or lower-priority docs surface in the tile.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// ── Feature gate ─────────────────────────────────────────────
const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

// ── Auth (used by GET) ───────────────────────────────────────
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Supabase admin ───────────────────────────────────────────
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── Data-room templates (mock the two helpers the route imports) ─
const getFoldersForStageMock = vi.fn();
const getCompletenessRequirementsMock = vi.fn();
vi.mock("@/lib/data-room-templates", () => ({
  getFoldersForStage: (stage: number) => getFoldersForStageMock(stage),
  getCompletenessRequirements: () => getCompletenessRequirementsMock(),
}));

// ── nanoid — deterministic token ─────────────────────────────
const nanoidMock = vi.fn();
vi.mock("nanoid", () => ({
  nanoid: (n?: number) => nanoidMock(n),
}));

// Route import must come AFTER every vi.mock above.
import { GET, POST } from "./route";

// ─────────────────────────────────────────────────────────────
// Fake supabase — chain-shaped fixture with per-table hooks
// ─────────────────────────────────────────────────────────────

interface Calls {
  from: string[];
  sviAccountsEq: { col: string; val: unknown } | null;
  dataRoomsSelectEq: { col: string; val: unknown } | null;
  dataRoomsUpdatePayload: Record<string, unknown> | null;
  dataRoomsUpdateEq: { col: string; val: unknown } | null;
  dataRoomsInsertPayload: Record<string, unknown> | null;
  documentsDeleteEq: { col: string; val: unknown } | null;
  documentsInsertPayload: Array<Record<string, unknown>> | null;
  documentsSelectCols: string | null;
  documentsSelectEq: { col: string; val: unknown } | null;
  documentsSelectOrder: string | null;
  goalsSelectEq: { col: string; val: unknown } | null;
  goalsSelectEq2: { col: string; val: unknown } | null;
  goalsInsertPayload: Array<Record<string, unknown>> | null;
}

interface State {
  sviAccount: Record<string, unknown> | null;
  existingRoom: Record<string, unknown> | null;
  newRoomInsertResult: { data: { id: string } | null; error: { message: string } | null };
  existingGoals: Array<{ id: string }> | null;
  documents: Array<Record<string, unknown>> | null;
  goals: Array<Record<string, unknown>> | null;
  getRoomResult: Record<string, unknown> | null;
  calls: Calls;
}

const state: State = {} as State;

function resetState() {
  state.sviAccount = null;
  state.existingRoom = null;
  state.newRoomInsertResult = { data: { id: "new-room-id" }, error: null };
  state.existingGoals = null;
  state.documents = null;
  state.goals = null;
  state.getRoomResult = null;
  state.calls = {
    from: [],
    sviAccountsEq: null,
    dataRoomsSelectEq: null,
    dataRoomsUpdatePayload: null,
    dataRoomsUpdateEq: null,
    dataRoomsInsertPayload: null,
    documentsDeleteEq: null,
    documentsInsertPayload: null,
    documentsSelectCols: null,
    documentsSelectEq: null,
    documentsSelectOrder: null,
    goalsSelectEq: null,
    goalsSelectEq2: null,
    goalsInsertPayload: null,
  };
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.calls.from.push(table);

      if (table === "svi_accounts") {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: unknown) {
                state.calls.sviAccountsEq = { col, val };
                return {
                  single: () => Promise.resolve({ data: state.sviAccount }),
                };
              },
            };
          },
        };
      }

      if (table === "data_rooms") {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: unknown) {
                state.calls.dataRoomsSelectEq = { col, val };
                return {
                  order(_c: string, _o?: { ascending?: boolean }) {
                    return {
                      limit(_n: number) {
                        return {
                          single: () =>
                            Promise.resolve({ data: state.existingRoom }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            state.calls.dataRoomsUpdatePayload = payload;
            return {
              eq(col: string, val: unknown) {
                state.calls.dataRoomsUpdateEq = { col, val };
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            state.calls.dataRoomsInsertPayload = payload;
            return {
              select(_c: string) {
                return {
                  single: () => Promise.resolve(state.newRoomInsertResult),
                };
              },
            };
          },
        };
      }

      if (table === "data_room_documents") {
        return {
          delete() {
            return {
              eq(col: string, val: unknown) {
                state.calls.documentsDeleteEq = { col, val };
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          insert(payload: Array<Record<string, unknown>>) {
            state.calls.documentsInsertPayload = payload;
            return Promise.resolve({ data: null, error: null });
          },
          select(cols: string) {
            state.calls.documentsSelectCols = cols;
            return {
              eq(col: string, val: unknown) {
                state.calls.documentsSelectEq = { col, val };
                return {
                  order(c: string) {
                    state.calls.documentsSelectOrder = c;
                    return Promise.resolve({ data: state.documents });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "data_room_goals") {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: unknown) {
                // POST uses one .eq(account_id, …) then returns; GET chains a
                // second .eq("status", "active"). Model both by returning an
                // awaitable that ALSO exposes .eq for the second chain link.
                state.calls.goalsSelectEq = { col, val };
                const thenable: any = {
                  then: (fn: (v: { data: typeof state.existingGoals }) => unknown) =>
                    Promise.resolve({ data: state.existingGoals }).then(fn),
                  eq(col2: string, val2: unknown) {
                    state.calls.goalsSelectEq2 = { col: col2, val: val2 };
                    return Promise.resolve({ data: state.goals });
                  },
                };
                return thenable;
              },
            };
          },
          insert(payload: Array<Record<string, unknown>>) {
            state.calls.goalsInsertPayload = payload;
            return Promise.resolve({ data: null, error: null });
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────

function fixtureFolders() {
  return [
    {
      section: "corporate",
      name: "1. Corporate & Legal",
      documents: [
        {
          name: "Constitution",
          type: "upload",
          priority: "P0",
          templateContent: null,
          dueDiligenceNotes: "ASIC pack",
        },
        {
          name: "Board Minutes",
          type: "template",
          priority: "P1",
          templateContent: "# Board Minutes\n",
          dueDiligenceNotes: null,
        },
      ],
    },
    {
      section: "financials",
      name: "2. Financials",
      documents: [
        {
          name: "Cap Table",
          type: "template",
          priority: "P0",
          templateContent: "# Cap Table\n",
          dueDiligenceNotes: "post-money",
        },
        {
          name: "3-Year P&L",
          type: "upload",
          priority: "P0",
          templateContent: null,
          dueDiligenceNotes: null,
        },
        {
          name: "Bank Statements",
          type: "upload",
          priority: "P2",
          templateContent: null,
          dueDiligenceNotes: null,
        },
      ],
    },
  ];
}

function completenessFixture() {
  return {
    sections: [
      { section: "corporate", name: "1. Corporate & Legal", investorImpact: "critical", totalDocs: 2, p0Docs: 1, p1Docs: 1, p2Docs: 0 },
      { section: "financials", name: "2. Financials", investorImpact: "high", totalDocs: 3, p0Docs: 2, p1Docs: 0, p2Docs: 1 },
      { section: "unused", name: "3. Not in stage", investorImpact: "medium", totalDocs: 4, p0Docs: 0, p1Docs: 4, p2Docs: 0 },
    ],
    totalDocs: 9,
    p0Docs: 3,
  };
}

function successGate(overrides: Partial<{ id: string; email: string }> = {}) {
  return {
    ok: true,
    user: { id: overrides.id ?? "user-1", email: overrides.email ?? "founder@example.com" },
    uwp: { id: overrides.id ?? "user-1", plan: "growth", segment: "founder" },
  };
}

beforeEach(() => {
  resetState();
  gateMock.mockReset();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getFoldersForStageMock.mockReset();
  getCompletenessRequirementsMock.mockReset();
  nanoidMock.mockReset();

  // Sensible defaults — each test overrides what it needs.
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  getFoldersForStageMock.mockReturnValue(fixtureFolders());
  getCompletenessRequirementsMock.mockReturnValue(completenessFixture());
  nanoidMock.mockReturnValue("static-token-32-chars-xxxxxxxxxxxx");
});

// ─────────────────────────────────────────────────────────────
// POST /api/data-room/initialize
// ─────────────────────────────────────────────────────────────

describe("POST /api/data-room/initialize", () => {
  it("gates on the `share_management` feature key (never touches DB when the gate fails)", async () => {
    gateMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 }),
    });
    const res = await POST();
    expect(gateMock).toHaveBeenCalledWith("share_management");
    expect(res.status).toBe(401);
    // Zero DB traffic when the gate short-circuits.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls.from.length).toBe(0);
  });

  it("forwards the 402 feature_locked response verbatim when the gate rejects on entitlement", async () => {
    gateMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "feature_locked", feature: "share_management" },
        { status: 402 },
      ),
    });
    const res = await POST();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
  });

  it("503s when getSupabaseAdmin returns null (db not configured)", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Database not configured" });
    // No table touched — the fake was never wired in.
    expect(state.calls.from.length).toBe(0);
  });

  it("looks up the svi_accounts row scoped to the authenticated user_id", async () => {
    gateMock.mockResolvedValueOnce(successGate({ id: "u-42" }));
    state.sviAccount = { startup_name: "Acme", current_stage: 3, current_svi: 68 };
    state.existingRoom = null;
    const res = await POST();
    expect(res.status).toBe(200);
    expect(state.calls.sviAccountsEq).toEqual({ col: "user_id", val: "u-42" });
  });

  it("falls back to stage=0 and 'My Startup' when the svi_accounts row is missing", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = null;
    state.existingRoom = null;
    const res = await POST();
    const body = await res.json();
    expect(body.dataRoom.stage).toBe(0);
    expect(body.dataRoom.startupName).toBe("My Startup");
    // Folders were fetched for the fallback stage (0).
    expect(getFoldersForStageMock).toHaveBeenCalledWith(0);
  });

  it("scopes the existing-room lookup to account_id + newest-first + limit 1", async () => {
    gateMock.mockResolvedValueOnce(successGate({ id: "u-9" }));
    state.sviAccount = { startup_name: "Zed", current_stage: 2 };
    state.existingRoom = null;
    await POST();
    expect(state.calls.dataRoomsSelectEq).toEqual({ col: "account_id", val: "u-9" });
  });

  it("REUSES the existing v2 room (no nanoid, no insert, refresh timestamp + stage)", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 4 };
    state.existingRoom = {
      id: "existing-room-id",
      token: "keep-me-token",
      completeness_score: 42,
      template_version: 2,
    };
    const res = await POST();
    const body = await res.json();
    expect(body.dataRoom.id).toBe("existing-room-id");
    expect(body.dataRoom.token).toBe("keep-me-token");
    expect(body.dataRoom.shareUrl).toBe("/data-room/keep-me-token");
    // No fresh token minted, no insert on data_rooms.
    expect(nanoidMock).not.toHaveBeenCalled();
    expect(state.calls.dataRoomsInsertPayload).toBeNull();
    // Refresh path stamped last_generated_at + stage on the existing row.
    expect(state.calls.dataRoomsUpdatePayload).not.toBeNull();
    expect(typeof state.calls.dataRoomsUpdatePayload!.last_generated_at).toBe("string");
    expect(state.calls.dataRoomsUpdatePayload!.stage).toBe(4);
    expect(state.calls.dataRoomsUpdateEq).toEqual({ col: "id", val: "existing-room-id" });
  });

  it("CREATES a fresh v2 room when the existing row is a legacy v1 (template_version !== 2)", async () => {
    gateMock.mockResolvedValueOnce(successGate({ id: "u-1", email: "f@x.io" }));
    state.sviAccount = { startup_name: "Legacy Co", current_stage: 1 };
    state.existingRoom = {
      id: "legacy-room",
      token: "legacy-token",
      completeness_score: 10,
      template_version: 1,
    };
    nanoidMock.mockReturnValueOnce("brand-new-token-xxxxxxxxxxxxxxxxxxx");
    state.newRoomInsertResult = { data: { id: "new-room-id" }, error: null };
    const res = await POST();
    const body = await res.json();
    // A fresh nanoid was requested (route calls nanoid(32)).
    expect(nanoidMock).toHaveBeenCalledWith(32);
    // The new room row was inserted with the v2 marker + the fresh token + the founder's email + starting stage.
    const payload = state.calls.dataRoomsInsertPayload!;
    expect(payload.account_id).toBe("u-1");
    expect(payload.email).toBe("f@x.io");
    expect(payload.token).toBe("brand-new-token-xxxxxxxxxxxxxxxxxxx");
    expect(payload.template_version).toBe(2);
    expect(payload.is_active).toBe(true);
    expect(payload.startup_name).toBe("Legacy Co");
    expect(payload.stage).toBe(1);
    expect(payload.title).toBe("Legacy Co — Investor Data Room");
    expect(typeof payload.last_generated_at).toBe("string");
    // Response reflects the fresh row, not the legacy one.
    expect(body.dataRoom.id).toBe("new-room-id");
    expect(body.dataRoom.token).toBe("brand-new-token-xxxxxxxxxxxxxxxxxxx");
    expect(body.dataRoom.templateVersion).toBe(2);
  });

  it("CREATES a fresh v2 room when there is no existing room at all", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Greenfield", current_stage: 2 };
    state.existingRoom = null;
    nanoidMock.mockReturnValueOnce("greenfield-token-xxxxxxxxxxxxxxxxx");
    state.newRoomInsertResult = { data: { id: "gf-room-id" }, error: null };
    const res = await POST();
    expect(nanoidMock).toHaveBeenCalledWith(32);
    const body = await res.json();
    expect(body.dataRoom.id).toBe("gf-room-id");
    expect(body.dataRoom.shareUrl).toBe("/data-room/greenfield-token-xxxxxxxxxxxxxxxxx");
  });

  it("500s when the data_rooms insert returns an error", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 0 };
    state.existingRoom = null;
    state.newRoomInsertResult = { data: null, error: { message: "duplicate key" } };
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("duplicate key");
    // Documents were NOT seeded when the parent insert failed.
    expect(state.calls.documentsDeleteEq).toBeNull();
    expect(state.calls.documentsInsertPayload).toBeNull();
  });

  it("500s with a generic message when the insert error has no message", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 0 };
    state.existingRoom = null;
    state.newRoomInsertResult = { data: null, error: null };
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create data room");
  });

  it("re-seeds documents from getFoldersForStage(stage) — delete then insert (idempotent)", async () => {
    gateMock.mockResolvedValueOnce(successGate({ id: "u-77" }));
    state.sviAccount = { startup_name: "Acme", current_stage: 5 };
    state.existingRoom = {
      id: "room-abc",
      token: "tok-abc",
      completeness_score: 10,
      template_version: 2,
    };
    await POST();
    // Folders fetched for the founder's live stage.
    expect(getFoldersForStageMock).toHaveBeenCalledWith(5);
    // Delete before insert on the same room_id (idempotent re-seed).
    expect(state.calls.documentsDeleteEq).toEqual({ col: "data_room_id", val: "room-abc" });
    // Insert payload row count == Σ documents across fixture folders (2 + 3 = 5).
    const rows = state.calls.documentsInsertPayload!;
    expect(rows.length).toBe(5);
    // Every row is stamped with the room + account + status='missing' + folder shape.
    for (const row of rows) {
      expect(row.data_room_id).toBe("room-abc");
      expect(row.account_id).toBe("u-77");
      expect(row.status).toBe("missing");
      expect(typeof row.section).toBe("string");
      expect(typeof row.folder).toBe("string");
      expect(typeof row.document_name).toBe("string");
    }
    // Row shape carries template_content + notes forwarded from the taxonomy
    // (nulls when the source field is absent).
    const capTable = rows.find(r => r.document_name === "Cap Table")!;
    expect(capTable.template_content).toBe("# Cap Table\n");
    expect(capTable.notes).toBe("post-money");
    const constitution = rows.find(r => r.document_name === "Constitution")!;
    expect(constitution.template_content).toBeNull();
    expect(constitution.notes).toBe("ASIC pack");
    const bank = rows.find(r => r.document_name === "Bank Statements")!;
    expect(bank.template_content).toBeNull();
    expect(bank.notes).toBeNull();
  });

  it("seeds the three default automation goals when none exist", async () => {
    gateMock.mockResolvedValueOnce(successGate({ id: "u-3" }));
    state.sviAccount = { startup_name: "Acme", current_stage: 0 };
    state.existingRoom = null;
    state.existingGoals = null; // no goals yet
    await POST();
    const goals = state.calls.goalsInsertPayload!;
    expect(goals.length).toBe(3);
    const byType = Object.fromEntries(goals.map(g => [g.goal_type, g])) as Record<string, any>;
    expect(byType.completeness).toMatchObject({
      account_id: "u-3",
      target_value: 80,
      current_value: 0,
      unit: "%",
      status: "active",
    });
    expect(byType.investor_views).toMatchObject({
      account_id: "u-3",
      target_value: 5,
      current_value: 0,
      unit: "count",
      status: "active",
    });
    expect(byType.nda_signed).toMatchObject({
      account_id: "u-3",
      target_value: 3,
      current_value: 0,
      unit: "count",
      status: "active",
    });
    expect(state.calls.goalsSelectEq).toEqual({ col: "account_id", val: "u-3" });
  });

  it("SKIPS the default-goal seed when the founder already has goals (no duplicates)", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 0 };
    state.existingRoom = null;
    state.existingGoals = [{ id: "g-1" }];
    await POST();
    expect(state.calls.goalsInsertPayload).toBeNull();
  });

  it("SKIPS the default-goal seed when the founder has an empty (non-null) goals array — matches !existingGoals?.length", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 0 };
    state.existingRoom = null;
    // Empty array — the current route treats [] as `!length` truthy → seeds
    // defaults. Pin the observed behaviour so a future author who flips the
    // check to `existingGoals === null` gets a heads-up.
    state.existingGoals = [];
    await POST();
    expect(state.calls.goalsInsertPayload).not.toBeNull();
    expect(state.calls.goalsInsertPayload!.length).toBe(3);
  });

  it("reports the completeness snapshot filtered to the stage's folders (totalDocuments + p0Documents + sectionCount)", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 3 };
    state.existingRoom = null;
    const res = await POST();
    const body = await res.json();
    // Fixture has 2 folders / (2 + 3) = 5 documents; P0 count = 1 + 2 = 3.
    expect(body.completeness.overall).toBe(0);
    expect(body.completeness.totalDocuments).toBe(5);
    expect(body.completeness.p0Documents).toBe(3);
    expect(body.completeness.sectionCount).toBe(2);
  });

  it("builds actionPlan from the missing-P0 tail (cap 8, step index 1-based, impact='high')", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 0 };
    state.existingRoom = null;
    // Swap the folder fixture for one with 12 P0s so the cap can bite.
    const bigFolder = {
      section: "financials",
      name: "Financials",
      documents: Array.from({ length: 12 }, (_, i) => ({
        name: `Doc P0 ${i + 1}`,
        type: "upload",
        priority: "P0",
        templateContent: null,
        dueDiligenceNotes: null,
      })).concat([
        {
          name: "Ignored P1",
          type: "upload",
          priority: "P1",
          templateContent: null,
          dueDiligenceNotes: null,
        } as any,
      ]),
    };
    getFoldersForStageMock.mockReturnValue([bigFolder]);
    const res = await POST();
    const body = await res.json();
    expect(body.actionPlan.length).toBe(8);
    expect(body.actionPlan[0]).toEqual({
      step: 1,
      action: "Upload Doc P0 1",
      section: "Financials",
      type: "upload",
      impact: "high",
    });
    expect(body.actionPlan[7]).toEqual({
      step: 8,
      action: "Upload Doc P0 8",
      section: "Financials",
      type: "upload",
      impact: "high",
    });
    // No P1 leaked into the action plan.
    expect(body.actionPlan.some((a: any) => a.action.includes("Ignored P1"))).toBe(false);
  });

  it("actionPlan is empty when the stage has no P0 documents", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 0 };
    state.existingRoom = null;
    getFoldersForStageMock.mockReturnValue([
      {
        section: "misc",
        name: "Misc",
        documents: [
          { name: "Nice-to-have", type: "upload", priority: "P2", templateContent: null, dueDiligenceNotes: null },
        ],
      },
    ]);
    const res = await POST();
    const body = await res.json();
    expect(body.actionPlan).toEqual([]);
  });

  it("filters the returned `sections[]` down to sections present in getFoldersForStage (drops 'unused')", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Acme", current_stage: 2 };
    state.existingRoom = null;
    const res = await POST();
    const body = await res.json();
    const returnedSections = body.sections.map((s: any) => s.section);
    expect(returnedSections).toEqual(["corporate", "financials"]);
    expect(returnedSections).not.toContain("unused");
  });

  it("response envelope carries every documented field (ok, dataRoom{}, completeness{}, actionPlan[], sections[])", async () => {
    gateMock.mockResolvedValueOnce(successGate());
    state.sviAccount = { startup_name: "Envelope", current_stage: 0 };
    state.existingRoom = null;
    nanoidMock.mockReturnValueOnce("env-token-32-xxxxxxxxxxxxxxxxxxxx");
    const res = await POST();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Object.keys(body).sort()).toEqual(
      ["actionPlan", "completeness", "dataRoom", "ok", "sections"].sort(),
    );
    expect(body.dataRoom).toMatchObject({
      id: "new-room-id",
      token: "env-token-32-xxxxxxxxxxxxxxxxxxxx",
      shareUrl: "/data-room/env-token-32-xxxxxxxxxxxxxxxxxxxx",
      startupName: "Envelope",
      stage: 0,
      templateVersion: 2,
    });
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/data-room/initialize
// ─────────────────────────────────────────────────────────────

describe("GET /api/data-room/initialize", () => {
  it("401s when getCurrentUser returns null (unauthenticated)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    // No DB touched when the auth guard fires.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("503s when getSupabaseAdmin returns null", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Database not configured");
  });

  it("404s when the founder has no data room yet", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    state.existingRoom = null;
    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No data room found");
  });

  it("scopes the room lookup to the caller's account_id", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-tenant-A", email: "a@x.io" });
    state.existingRoom = {
      id: "room-A",
      token: "tok-A",
      startup_name: "A",
      stage: 1,
      completeness_score: 0,
      last_generated_at: null,
      investor_count: 0,
    };
    state.documents = [];
    state.goals = [];
    await GET();
    expect(state.calls.dataRoomsSelectEq).toEqual({ col: "account_id", val: "u-tenant-A" });
    // Documents are scoped to the room, goals to the account — cross-tenant leaks caught here.
    expect(state.calls.documentsSelectEq).toEqual({ col: "data_room_id", val: "room-A" });
    expect(state.calls.goalsSelectEq).toEqual({ col: "account_id", val: "u-tenant-A" });
    expect(state.calls.goalsSelectEq2).toEqual({ col: "status", val: "active" });
  });

  it("orders documents by priority (P0 first) so the missingP0 tile is monotonic", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    state.existingRoom = {
      id: "r-1", token: "t-1", startup_name: "s", stage: 0,
      completeness_score: 0, last_generated_at: null, investor_count: 0,
    };
    state.documents = [];
    state.goals = [];
    await GET();
    expect(state.calls.documentsSelectOrder).toBe("priority");
  });

  it("returns overall=0 when there are zero documents (guards NaN from divide-by-zero)", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    state.existingRoom = {
      id: "r-1", token: "t-1", startup_name: "s", stage: 0,
      completeness_score: 0, last_generated_at: null, investor_count: 0,
    };
    state.documents = [];
    state.goals = [];
    const res = await GET();
    const body = await res.json();
    expect(body.room.completenessScore).toBe(0);
    expect(body.sectionStats).toEqual({});
    expect(body.missingP0).toEqual([]);
  });

  it("computes overall completeness as round((complete/total)*100) across every section", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    state.existingRoom = {
      id: "r-1", token: "t-1", startup_name: "s", stage: 0,
      completeness_score: 0, last_generated_at: null, investor_count: 0,
    };
    state.documents = [
      { section: "corporate", folder: "F1", document_name: "d1", status: "complete", priority: "P0" },
      { section: "corporate", folder: "F1", document_name: "d2", status: "missing", priority: "P1" },
      { section: "financials", folder: "F2", document_name: "d3", status: "complete", priority: "P0" },
      { section: "financials", folder: "F2", document_name: "d4", status: "missing", priority: "P0" },
      { section: "financials", folder: "F2", document_name: "d5", status: "in_progress", priority: "P2" },
    ];
    state.goals = [];
    const res = await GET();
    const body = await res.json();
    // 2 complete out of 5 → round(40) === 40.
    expect(body.room.completenessScore).toBe(40);
    expect(body.sectionStats).toEqual({
      corporate: { total: 2, complete: 1 },
      financials: { total: 3, complete: 1 },
    });
  });

  it("only counts status==='complete' as complete (in_progress + missing + review do NOT count)", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    state.existingRoom = {
      id: "r-1", token: "t-1", startup_name: "s", stage: 0,
      completeness_score: 0, last_generated_at: null, investor_count: 0,
    };
    state.documents = [
      { section: "a", folder: "A", document_name: "d1", status: "in_progress", priority: "P0" },
      { section: "a", folder: "A", document_name: "d2", status: "review", priority: "P0" },
      { section: "a", folder: "A", document_name: "d3", status: "missing", priority: "P0" },
    ];
    state.goals = [];
    const res = await GET();
    const body = await res.json();
    expect(body.room.completenessScore).toBe(0);
    expect(body.sectionStats.a).toEqual({ total: 3, complete: 0 });
  });

  it("missingP0 filters strictly on priority==='P0' && status==='missing'", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    state.existingRoom = {
      id: "r-1", token: "t-1", startup_name: "s", stage: 0,
      completeness_score: 0, last_generated_at: null, investor_count: 0,
    };
    state.documents = [
      { section: "a", folder: "A", document_name: "keep-me",       status: "missing",     priority: "P0" },
      { section: "a", folder: "A", document_name: "wrong-priority", status: "missing",    priority: "P1" },
      { section: "a", folder: "A", document_name: "wrong-status",   status: "complete",   priority: "P0" },
      { section: "a", folder: "A", document_name: "in-progress",    status: "in_progress", priority: "P0" },
    ];
    state.goals = [];
    const res = await GET();
    const body = await res.json();
    const names = body.missingP0.map((d: any) => d.document_name);
    expect(names).toEqual(["keep-me"]);
  });

  it("returns the shareUrl derived from the room's token and inlines completenessScore into the room envelope", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u-1", email: "f@x.io" });
    state.existingRoom = {
      id: "r-1", token: "share-token-123", startup_name: "s", stage: 2,
      completeness_score: 99, last_generated_at: "2026-08-01T00:00:00Z", investor_count: 4,
    };
    state.documents = [];
    state.goals = [
      { id: "g1", account_id: "u-1", goal_type: "completeness", target_value: 80, current_value: 0, unit: "%", status: "active" },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.room.shareUrl).toBe("/data-room/share-token-123");
    expect(body.room.startup_name).toBe("s");
    expect(body.room.investor_count).toBe(4);
    // completenessScore is derived from documents (empty here), not the DB `completeness_score` column.
    expect(body.room.completenessScore).toBe(0);
    // Goals passed through untouched.
    expect(body.goals).toEqual(state.goals);
  });
});
