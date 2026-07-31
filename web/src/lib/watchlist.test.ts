import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// watchlist — colocated vitest for the previously-untested investor bookmark
// helper (docs/plans/atlassian-standard-mapping-goal.md §P9_ship). The row is
// keyed on (account_id, ticker) — a silent regression here would either
// duplicate a bookmark on every toggle (dropping the "existing → delete"
// branch) or silently wipe a user's entire watchlist (dropping the ownership
// filter on the delete). Both destroy the /investor/watchlist contract without
// throwing so nothing else catches it.
// ---------------------------------------------------------------------------

type FilterCall = { col: string; val: unknown };

interface SelectChain {
  filters: FilterCall[];
  order?: { col: string; ascending: boolean };
  op: "select";
  terminal: "list" | "maybeSingle";
}

interface DeleteChain {
  filters: FilterCall[];
  op: "delete";
}

interface InsertChain {
  op: "insert";
  row: Record<string, unknown>;
  selected: boolean;
}

type ChainRecord = SelectChain | DeleteChain | InsertChain;

interface FakeState {
  rows: Record<string, unknown>[];
  chains: Array<{ table: string; chain: ChainRecord }>;
  failSelect: { list?: string; single?: string };
  failDelete?: string;
  failInsert?: string;
  insertReturn: Record<string, unknown> | null;
}

const state: FakeState = {
  rows: [],
  chains: [],
  failSelect: {},
  insertReturn: null,
};

function applyFilters(rows: Record<string, unknown>[], filters: FilterCall[]) {
  return rows.filter((row) => filters.every((f) => row[f.col] === f.val));
}

function makeSupabaseFrom(table: string) {
  function selectBuilder(): unknown {
    const rec: SelectChain = { filters: [], op: "select", terminal: "list" };
    state.chains.push({ table, chain: rec });
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        rec.filters.push({ col, val });
        return chain;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        rec.order = { col, ascending: opts?.ascending !== false };
        return chain;
      },
      maybeSingle() {
        rec.terminal = "maybeSingle";
        if (state.failSelect.single) {
          return Promise.resolve({ data: null, error: { message: state.failSelect.single } });
        }
        const filtered = applyFilters(state.rows, rec.filters);
        return Promise.resolve({ data: filtered[0] ?? null, error: null });
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        if (state.failSelect.list) {
          resolve({ data: null, error: { message: state.failSelect.list } });
          return;
        }
        let rows = applyFilters(state.rows, rec.filters);
        if (rec.order) {
          const { col, ascending } = rec.order;
          rows = [...rows].sort((a, b) => {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        resolve({ data: rows, error: null });
      },
    };
    return chain;
  }

  function insertBuilder(row: Record<string, unknown>): unknown {
    const rec: InsertChain = { op: "insert", row, selected: false };
    state.chains.push({ table, chain: rec });
    const insertChain: Record<string, unknown> = {
      select(_cols: string) {
        rec.selected = true;
        return {
          single() {
            if (state.failInsert) {
              return Promise.resolve({ data: null, error: { message: state.failInsert } });
            }
            return Promise.resolve({ data: state.insertReturn, error: null });
          },
        };
      },
    };
    return insertChain;
  }

  function deleteBuilder(): unknown {
    const rec: DeleteChain = { filters: [], op: "delete" };
    state.chains.push({ table, chain: rec });
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        rec.filters.push({ col, val });
        return chain;
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        if (state.failDelete) {
          resolve({ data: null, error: { message: state.failDelete } });
          return;
        }
        state.rows = state.rows.filter(
          (row) => !rec.filters.every((f) => row[f.col] === f.val),
        );
        resolve({ data: null, error: null });
      },
    };
    return chain;
  }

  return {
    select(_cols: string) {
      return selectBuilder();
    },
    insert(row: Record<string, unknown>) {
      return insertBuilder(row);
    },
    delete() {
      return deleteBuilder();
    },
  };
}

let adminMode: "null" | "ok" = "ok";

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (adminMode === "null") return null;
    return {
      from(table: string) {
        return makeSupabaseFrom(table);
      },
    };
  },
}));

async function loadModule() {
  vi.resetModules();
  return import("./watchlist");
}

beforeEach(() => {
  adminMode = "ok";
  state.rows = [];
  state.chains = [];
  state.failSelect = {};
  state.failDelete = undefined;
  state.failInsert = undefined;
  state.insertReturn = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── listWatchlist ─────────────────────────────────────────────────────────

describe("listWatchlist", () => {
  it("returns [] when getSupabaseAdmin() is null (dev fallback — no throw, no query)", async () => {
    adminMode = "null";
    const mod = await loadModule();
    await expect(mod.listWatchlist("acct-1")).resolves.toEqual([]);
    expect(state.chains).toEqual([]);
  });

  it("targets the watchlist table with the exact column projection", async () => {
    const mod = await loadModule();
    await mod.listWatchlist("acct-1");
    expect(state.chains).toHaveLength(1);
    expect(state.chains[0].table).toBe("watchlist");
    expect(state.chains[0].chain.op).toBe("select");
  });

  it("filters on account_id (RLS-parity ownership guard — never returns cross-account bookmarks)", async () => {
    state.rows = [
      { id: "r1", account_id: "acct-1", ticker: "BID", slug: null, notes: null, created_at: "2026-07-01" },
      { id: "r2", account_id: "acct-OTHER", ticker: "OTH", slug: null, notes: null, created_at: "2026-07-02" },
    ];
    const mod = await loadModule();
    const rows = await mod.listWatchlist("acct-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe("BID");
    const rec = state.chains[0].chain as SelectChain;
    expect(rec.filters).toEqual([{ col: "account_id", val: "acct-1" }]);
  });

  it("orders by created_at DESC so newest bookmarks top the UI", async () => {
    state.rows = [
      { id: "r-old", account_id: "acct-1", ticker: "OLD", slug: null, notes: null, created_at: "2026-07-01" },
      { id: "r-new", account_id: "acct-1", ticker: "NEW", slug: null, notes: null, created_at: "2026-07-31" },
      { id: "r-mid", account_id: "acct-1", ticker: "MID", slug: null, notes: null, created_at: "2026-07-15" },
    ];
    const mod = await loadModule();
    const rows = await mod.listWatchlist("acct-1");
    expect(rows.map((r) => r.ticker)).toEqual(["NEW", "MID", "OLD"]);
    const rec = state.chains[0].chain as SelectChain;
    expect(rec.order).toEqual({ col: "created_at", ascending: false });
  });

  it("returns [] on Supabase error (never throws — /investor/watchlist stays live on a hiccup)", async () => {
    state.failSelect.list = "connection reset";
    const mod = await loadModule();
    await expect(mod.listWatchlist("acct-1")).resolves.toEqual([]);
  });

  it("returns [] when Supabase yields empty rows (no throw on the null-data path either)", async () => {
    const mod = await loadModule();
    await expect(mod.listWatchlist("acct-1")).resolves.toEqual([]);
  });
});

// ── toggleWatchlist — no-admin degrade ────────────────────────────────────

describe("toggleWatchlist — degraded modes", () => {
  it("returns {added:false, removed:false} + no queries when getSupabaseAdmin() is null", async () => {
    adminMode = "null";
    const mod = await loadModule();
    const res = await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    expect(res).toEqual({ added: false, removed: false });
    expect(state.chains).toEqual([]);
  });
});

// ── toggleWatchlist — remove existing branch ──────────────────────────────

describe("toggleWatchlist — existing row → delete branch", () => {
  it("looks up (account_id, ticker) via maybeSingle before deciding branch", async () => {
    state.rows = [
      { id: "row-1", account_id: "acct-1", ticker: "BID", slug: "blockid-au", notes: "watch pre-raise", created_at: "2026-07-01" },
    ];
    const mod = await loadModule();
    await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    const first = state.chains[0].chain as SelectChain;
    expect(first.op).toBe("select");
    expect(first.terminal).toBe("maybeSingle");
    expect(first.filters).toEqual([
      { col: "account_id", val: "acct-1" },
      { col: "ticker", val: "BID" },
    ]);
  });

  it("deletes by row id (NOT by account_id/ticker) so a fresh index-only path removes exactly one row", async () => {
    state.rows = [
      { id: "row-1", account_id: "acct-1", ticker: "BID", slug: null, notes: null, created_at: "2026-07-01" },
    ];
    const mod = await loadModule();
    const res = await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    expect(res).toEqual({ added: false, removed: true });
    const del = state.chains.find((c) => c.chain.op === "delete");
    expect(del).toBeTruthy();
    expect((del!.chain as DeleteChain).filters).toEqual([{ col: "id", val: "row-1" }]);
    expect(state.rows).toEqual([]);
  });

  it("never fires an insert on the delete branch — only two chain calls (select + delete)", async () => {
    state.rows = [
      { id: "row-1", account_id: "acct-1", ticker: "BID", slug: null, notes: null, created_at: "2026-07-01" },
    ];
    const mod = await loadModule();
    await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    expect(state.chains).toHaveLength(2);
    expect(state.chains[0].chain.op).toBe("select");
    expect(state.chains[1].chain.op).toBe("delete");
    expect(state.chains.some((c) => c.chain.op === "insert")).toBe(false);
  });
});

// ── toggleWatchlist — add-new branch ──────────────────────────────────────

describe("toggleWatchlist — new row → insert branch", () => {
  it("inserts a row with slug/notes coerced to null when caller omits them", async () => {
    state.insertReturn = {
      id: "new-1",
      ticker: "BID",
      slug: null,
      notes: null,
      created_at: "2026-07-31T00:00:00Z",
    };
    const mod = await loadModule();
    const res = await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    expect(res.added).toBe(true);
    expect(res.removed).toBe(false);
    expect(res.row).toEqual(state.insertReturn);
    const insert = state.chains.find((c) => c.chain.op === "insert");
    expect(insert).toBeTruthy();
    expect((insert!.chain as InsertChain).row).toEqual({
      account_id: "acct-1",
      ticker: "BID",
      slug: null,
      notes: null,
    });
  });

  it("passes through caller-supplied slug + notes bit-for-bit onto the insert payload", async () => {
    state.insertReturn = {
      id: "new-2",
      ticker: "BID",
      slug: "blockid-au",
      notes: "watch pre-raise",
      created_at: "2026-07-31T00:00:00Z",
    };
    const mod = await loadModule();
    await mod.toggleWatchlist({
      accountId: "acct-1",
      ticker: "BID",
      slug: "blockid-au",
      notes: "watch pre-raise",
    });
    const insert = state.chains.find((c) => c.chain.op === "insert")!;
    expect((insert.chain as InsertChain).row).toEqual({
      account_id: "acct-1",
      ticker: "BID",
      slug: "blockid-au",
      notes: "watch pre-raise",
    });
  });

  it("selects the inserted row before .single() so the caller can hydrate the returned row shape", async () => {
    state.insertReturn = {
      id: "new-3",
      ticker: "BID",
      slug: null,
      notes: null,
      created_at: "2026-07-31T00:00:00Z",
    };
    const mod = await loadModule();
    await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    const insert = state.chains.find((c) => c.chain.op === "insert")!;
    expect((insert.chain as InsertChain).selected).toBe(true);
  });

  it("skips the delete step on the insert branch — chains are exactly [select, insert]", async () => {
    state.insertReturn = {
      id: "new-4",
      ticker: "BID",
      slug: null,
      notes: null,
      created_at: "2026-07-31T00:00:00Z",
    };
    const mod = await loadModule();
    await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    expect(state.chains.map((c) => c.chain.op)).toEqual(["select", "insert"]);
  });

  it("targets the watchlist table on both the lookup + the insert", async () => {
    state.insertReturn = {
      id: "new-5",
      ticker: "BID",
      slug: null,
      notes: null,
      created_at: "2026-07-31T00:00:00Z",
    };
    const mod = await loadModule();
    await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    expect(state.chains.every((c) => c.table === "watchlist")).toBe(true);
  });
});

// ── toggleWatchlist — cross-account isolation guard ───────────────────────

describe("toggleWatchlist — cross-account isolation", () => {
  it("scopes the initial lookup by account_id so a colliding ticker from another account does NOT trigger the delete branch", async () => {
    state.rows = [
      { id: "row-other", account_id: "acct-OTHER", ticker: "BID", slug: null, notes: null, created_at: "2026-07-01" },
    ];
    state.insertReturn = {
      id: "new-mine",
      ticker: "BID",
      slug: null,
      notes: null,
      created_at: "2026-07-31T00:00:00Z",
    };
    const mod = await loadModule();
    const res = await mod.toggleWatchlist({ accountId: "acct-1", ticker: "BID" });
    expect(res.added).toBe(true);
    expect(res.removed).toBe(false);
    // Cross-account row survives — a broken filter would have removed it.
    expect(state.rows.some((r) => r.id === "row-other")).toBe(true);
  });
});
