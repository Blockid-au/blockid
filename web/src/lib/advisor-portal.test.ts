import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only advisor-portal helpers used by the
// /workspace/advisor surface. Sibling accelerator-portal.ts has the same
// "degrade to empty state until migration lands" shape but was untested;
// this pins the four public-surface contracts:
//   * isSupabaseConfigured()=false → empty/null with no query issued
//   * 42P01 (table missing) → empty/null (page still renders)
//   * other DB errors → empty/null (never throws to caller)
//   * happy paths return the mapped shape with null-safe field coercion
// A silent regression here would either 500 the /workspace/advisor page
// (throwing instead of degrading) or write orphan advisor_notes rows the
// migration cannot reconcile.

type Row = Record<string, unknown>;

interface FakeState {
  supabaseConfigured: boolean;
  adminConfigured: boolean;
  selectRows: Row[] | null;
  selectError: { code?: string; message: string } | null;
  insertRow: Row | null;
  insertError: { code?: string; message: string } | null;
  throwOnFrom: boolean;
  captured: {
    from: string | null;
    selectCols: string | null;
    eqs: Array<{ col: string; val: string }>;
    order: { col: string; opts: { ascending: boolean } } | null;
    insertPayload: Record<string, unknown> | null;
    insertSelectCols: string | null;
    singleCalled: boolean;
  };
}

const state: FakeState = {
  supabaseConfigured: true,
  adminConfigured: true,
  selectRows: null,
  selectError: null,
  insertRow: null,
  insertError: null,
  throwOnFrom: false,
  captured: {
    from: null,
    selectCols: null,
    eqs: [],
    order: null,
    insertPayload: null,
    insertSelectCols: null,
    singleCalled: false,
  },
};

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.supabaseConfigured,
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from(table: string) {
        state.captured.from = table;
        if (state.throwOnFrom) {
          throw new Error("boom from .from()");
        }
        const selectChain = {
          eq(col: string, val: string) {
            state.captured.eqs.push({ col, val });
            return selectChain;
          },
          order(col: string, opts: { ascending: boolean }) {
            state.captured.order = { col, opts };
            return Promise.resolve({
              data: state.selectError ? null : state.selectRows,
              error: state.selectError,
            });
          },
        };
        const insertChain = {
          select(cols: string) {
            state.captured.insertSelectCols = cols;
            return {
              single() {
                state.captured.singleCalled = true;
                return Promise.resolve({
                  data: state.insertError ? null : state.insertRow,
                  error: state.insertError,
                });
              },
            };
          },
        };
        return {
          select(cols: string) {
            state.captured.selectCols = cols;
            return selectChain;
          },
          insert(payload: Record<string, unknown>) {
            state.captured.insertPayload = payload;
            return insertChain;
          },
        };
      },
    };
  },
}));

import {
  getClientRoster,
  getClientNotes,
  saveNote,
  type ClientRow,
  type ClientNote,
} from "./advisor-portal";

beforeEach(() => {
  state.supabaseConfigured = true;
  state.adminConfigured = true;
  state.selectRows = null;
  state.selectError = null;
  state.insertRow = null;
  state.insertError = null;
  state.throwOnFrom = false;
  state.captured = {
    from: null,
    selectCols: null,
    eqs: [],
    order: null,
    insertPayload: null,
    insertSelectCols: null,
    singleCalled: false,
  };
});

describe("getClientRoster", () => {
  it("returns [] when Supabase is not configured — no query issued", async () => {
    state.supabaseConfigured = false;
    const rows = await getClientRoster("adv-1");
    expect(rows).toEqual([]);
    expect(state.captured.from).toBeNull();
  });

  it("returns [] when the admin client is null — no query issued", async () => {
    state.adminConfigured = false;
    const rows = await getClientRoster("adv-1");
    expect(rows).toEqual([]);
    expect(state.captured.from).toBeNull();
  });

  it("queries advisor_portal with the shipped select+eq+order chain", async () => {
    state.selectRows = [];
    await getClientRoster("adv-42");
    expect(state.captured.from).toBe("advisor_portal");
    expect(state.captured.selectCols).toBe(
      "client_id,startup_name,founder_name,svi,last_activity_at,engagement",
    );
    expect(state.captured.eqs).toEqual([{ col: "advisor_id", val: "adv-42" }]);
    expect(state.captured.order).toEqual({
      col: "last_activity_at",
      opts: { ascending: false },
    });
  });

  it("returns [] when the table is missing (Postgres 42P01)", async () => {
    state.selectError = { code: "42P01", message: 'relation "advisor_portal" does not exist' };
    const rows = await getClientRoster("adv-1");
    expect(rows).toEqual([]);
  });

  it("returns [] on any other DB error — never throws to caller", async () => {
    state.selectError = { code: "PGRST123", message: "network" };
    const rows = await getClientRoster("adv-1");
    expect(rows).toEqual([]);
  });

  it("returns [] when data is null and no error is present", async () => {
    state.selectRows = null;
    const rows = await getClientRoster("adv-1");
    expect(rows).toEqual([]);
  });

  it("returns [] when a thrown error escapes the .from() call — try/catch caught", async () => {
    state.throwOnFrom = true;
    const rows = await getClientRoster("adv-1");
    expect(rows).toEqual([]);
  });

  it("maps a full-shape row to ClientRow with String/Number coercion", async () => {
    state.selectRows = [
      {
        client_id: 42, // numeric id → String()
        startup_name: "Acme Co",
        founder_name: "Ada Lovelace",
        svi: "72.5", // Supabase numeric → string → Number()
        last_activity_at: "2026-07-30T12:34:56Z",
        engagement: "active",
      },
    ];
    const rows = await getClientRoster("adv-1");
    expect(rows).toEqual<ClientRow[]>([
      {
        id: "42",
        startupName: "Acme Co",
        founderName: "Ada Lovelace",
        svi: 72.5,
        lastActivityAt: "2026-07-30T12:34:56Z",
        engagement: "active",
      },
    ]);
  });

  it("coerces missing string fields to empty string and missing scalars to null", async () => {
    state.selectRows = [
      {
        client_id: "c-1",
        // startup_name absent → ""
        // founder_name absent → null
        // svi absent → null
        // last_activity_at absent → null
        engagement: "unknown-bucket", // → normalised to 'active'
      },
    ];
    const [row] = await getClientRoster("adv-1");
    expect(row).toEqual<ClientRow>({
      id: "c-1",
      startupName: "",
      founderName: null,
      svi: null,
      lastActivityAt: null,
      engagement: "active",
    });
  });

  it("preserves null for founder_name / svi / last_activity_at when explicitly null", async () => {
    state.selectRows = [
      {
        client_id: "c-2",
        startup_name: "N Startup",
        founder_name: null,
        svi: null,
        last_activity_at: null,
        engagement: "at_risk",
      },
    ];
    const [row] = await getClientRoster("adv-1");
    expect(row.founderName).toBeNull();
    expect(row.svi).toBeNull();
    expect(row.lastActivityAt).toBeNull();
    expect(row.engagement).toBe("at_risk");
  });

  it("normalises engagement — accepts 'at_risk' + 'dormant' verbatim, else 'active'", async () => {
    state.selectRows = [
      { client_id: "1", engagement: "at_risk" },
      { client_id: "2", engagement: "dormant" },
      { client_id: "3", engagement: "active" },
      { client_id: "4", engagement: "AT_RISK" }, // case-insensitive
      { client_id: "5", engagement: null }, // → 'active'
      { client_id: "6", engagement: undefined }, // → 'active'
      { client_id: "7", engagement: "" }, // → 'active'
      { client_id: "8", engagement: "made-up-bucket" }, // → 'active'
    ];
    const rows = await getClientRoster("adv-1");
    expect(rows.map((r) => r.engagement)).toEqual([
      "at_risk",
      "dormant",
      "active",
      "at_risk",
      "active",
      "active",
      "active",
      "active",
    ]);
  });

  it("preserves data-array order (no client-side re-sort — DB order wins)", async () => {
    state.selectRows = [
      { client_id: "b", startup_name: "B", engagement: "active" },
      { client_id: "a", startup_name: "A", engagement: "active" },
      { client_id: "c", startup_name: "C", engagement: "active" },
    ];
    const rows = await getClientRoster("adv-1");
    expect(rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("getClientNotes", () => {
  it("returns [] when Supabase is not configured — no query issued", async () => {
    state.supabaseConfigured = false;
    const rows = await getClientNotes("adv-1", "c-1");
    expect(rows).toEqual([]);
    expect(state.captured.from).toBeNull();
  });

  it("returns [] when the admin client is null — no query issued", async () => {
    state.adminConfigured = false;
    const rows = await getClientNotes("adv-1", "c-1");
    expect(rows).toEqual([]);
    expect(state.captured.from).toBeNull();
  });

  it("queries advisor_notes with the two-eq (advisor_id + client_id) ownership filter", async () => {
    state.selectRows = [];
    await getClientNotes("adv-9", "c-42");
    expect(state.captured.from).toBe("advisor_notes");
    expect(state.captured.selectCols).toBe(
      "id,client_id,advisor_id,body,created_at,updated_at",
    );
    expect(state.captured.eqs).toEqual([
      { col: "advisor_id", val: "adv-9" },
      { col: "client_id", val: "c-42" },
    ]);
    expect(state.captured.order).toEqual({
      col: "created_at",
      opts: { ascending: false },
    });
  });

  it("returns [] when the table is missing (Postgres 42P01)", async () => {
    state.selectError = { code: "42P01", message: 'relation "advisor_notes" does not exist' };
    const rows = await getClientNotes("adv-1", "c-1");
    expect(rows).toEqual([]);
  });

  it("returns [] on any other DB error — never throws to caller", async () => {
    state.selectError = { code: "PGRST123", message: "network" };
    const rows = await getClientNotes("adv-1", "c-1");
    expect(rows).toEqual([]);
  });

  it("returns [] when data is null and no error is present", async () => {
    state.selectRows = null;
    const rows = await getClientNotes("adv-1", "c-1");
    expect(rows).toEqual([]);
  });

  it("returns [] when the fake .from() throws — try/catch caught", async () => {
    state.throwOnFrom = true;
    const rows = await getClientNotes("adv-1", "c-1");
    expect(rows).toEqual([]);
  });

  it("maps a full-shape row to ClientNote with String coercion", async () => {
    state.selectRows = [
      {
        id: "note-1",
        client_id: "c-1",
        advisor_id: "adv-1",
        body: "First engagement call went well.",
        created_at: "2026-07-30T09:00:00Z",
        updated_at: "2026-07-30T10:00:00Z",
      },
    ];
    const [note] = await getClientNotes("adv-1", "c-1");
    expect(note).toEqual<ClientNote>({
      id: "note-1",
      clientId: "c-1",
      advisorId: "adv-1",
      body: "First engagement call went well.",
      createdAt: "2026-07-30T09:00:00Z",
      updatedAt: "2026-07-30T10:00:00Z",
    });
  });

  it("falls back updated_at → created_at when updated_at is null", async () => {
    state.selectRows = [
      {
        id: "note-2",
        client_id: "c-1",
        advisor_id: "adv-1",
        body: "Note",
        created_at: "2026-07-30T09:00:00Z",
        updated_at: null,
      },
    ];
    const [note] = await getClientNotes("adv-1", "c-1");
    expect(note.updatedAt).toBe("2026-07-30T09:00:00Z");
  });

  it("coerces missing body → empty string and missing timestamps → empty string", async () => {
    state.selectRows = [
      {
        id: "note-3",
        client_id: "c-1",
        advisor_id: "adv-1",
        // body absent → ""
        // created_at absent → ""
        // updated_at absent, created_at also absent → ""
      },
    ];
    const [note] = await getClientNotes("adv-1", "c-1");
    expect(note.body).toBe("");
    expect(note.createdAt).toBe("");
    expect(note.updatedAt).toBe("");
  });

  it("preserves data-array order (no client-side re-sort)", async () => {
    state.selectRows = [
      { id: "n-c", client_id: "c-1", advisor_id: "adv-1", body: "third" },
      { id: "n-a", client_id: "c-1", advisor_id: "adv-1", body: "first" },
      { id: "n-b", client_id: "c-1", advisor_id: "adv-1", body: "second" },
    ];
    const rows = await getClientNotes("adv-1", "c-1");
    expect(rows.map((r) => r.id)).toEqual(["n-c", "n-a", "n-b"]);
  });
});

describe("saveNote", () => {
  it("returns null when body is empty — no DB round-trip", async () => {
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "" });
    expect(res).toBeNull();
    expect(state.captured.from).toBeNull();
  });

  it("returns null when body is whitespace-only — trim() collapses it", async () => {
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "   \n\t  " });
    expect(res).toBeNull();
    expect(state.captured.from).toBeNull();
  });

  it("returns null when Supabase is not configured — no DB round-trip", async () => {
    state.supabaseConfigured = false;
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "note" });
    expect(res).toBeNull();
    expect(state.captured.from).toBeNull();
  });

  it("returns null when the admin client is null — no DB round-trip", async () => {
    state.adminConfigured = false;
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "note" });
    expect(res).toBeNull();
    expect(state.captured.from).toBeNull();
  });

  it("inserts into advisor_notes with the trimmed body + ownership fields", async () => {
    state.insertRow = {
      id: "note-99",
      client_id: "c-1",
      advisor_id: "adv-1",
      body: "trimmed body",
      created_at: "2026-07-30T09:00:00Z",
      updated_at: "2026-07-30T09:00:00Z",
    };
    const res = await saveNote({
      advisorId: "adv-1",
      clientId: "c-1",
      body: "   trimmed body   ",
    });
    expect(state.captured.from).toBe("advisor_notes");
    expect(state.captured.insertPayload).toEqual({
      advisor_id: "adv-1",
      client_id: "c-1",
      body: "trimmed body",
    });
    expect(state.captured.insertSelectCols).toBe(
      "id,client_id,advisor_id,body,created_at,updated_at",
    );
    expect(state.captured.singleCalled).toBe(true);
    expect(res).toEqual<ClientNote>({
      id: "note-99",
      clientId: "c-1",
      advisorId: "adv-1",
      body: "trimmed body",
      createdAt: "2026-07-30T09:00:00Z",
      updatedAt: "2026-07-30T09:00:00Z",
    });
  });

  it("returns null when the table is missing (Postgres 42P01)", async () => {
    state.insertError = { code: "42P01", message: 'relation "advisor_notes" does not exist' };
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "note" });
    expect(res).toBeNull();
  });

  it("returns null on any other insert error — never throws to caller", async () => {
    state.insertError = { code: "PGRST123", message: "unique_violation" };
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "note" });
    expect(res).toBeNull();
  });

  it("returns null when .from() throws — try/catch caught", async () => {
    state.throwOnFrom = true;
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "note" });
    expect(res).toBeNull();
  });

  it("falls back updated_at → created_at when the DB row is missing updated_at", async () => {
    state.insertRow = {
      id: "note-100",
      client_id: "c-1",
      advisor_id: "adv-1",
      body: "b",
      created_at: "2026-07-30T09:00:00Z",
      // updated_at absent
    };
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "b" });
    expect(res?.updatedAt).toBe("2026-07-30T09:00:00Z");
  });

  it("coerces missing body / timestamps in the returned row to empty string", async () => {
    state.insertRow = {
      id: "note-101",
      client_id: "c-1",
      advisor_id: "adv-1",
      // body absent → ""
      // created_at absent → ""
      // updated_at absent → falls back to created_at ("") → ""
    };
    const res = await saveNote({ advisorId: "adv-1", clientId: "c-1", body: "b" });
    expect(res).toEqual<ClientNote>({
      id: "note-101",
      clientId: "c-1",
      advisorId: "adv-1",
      body: "",
      createdAt: "",
      updatedAt: "",
    });
  });
});
