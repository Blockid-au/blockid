import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only startup-package reservation upsert
// helper (`upsertReservedAllocation`) backed by
// `startup_package_reserved_allocations` (natural key: project_id) and the
// `projects.package_ticker` mirror. Pins:
//   - `projectId` required + must be a string (rejects null/undefined/number)
//   - `pct_reserved` clamped [10, 100] AFTER `Math.round` (9.4 rejected,
//     9.6 accepted at 10, 100.4 accepted at 100, 100.6 rejected at 101)
//   - `ticker_hint` trim → uppercase → `/^[A-Z]{3,4}$/` guard
//   - `RESERVED_PACKAGE_TICKERS` frozen list rejects BID/ETH/BTC/USDT/USDC/USD/AUD
//     (mirrors the guard baked into `lib/ai-equity.ts:aiSuggestTicker` so the
//     human path cannot circumvent the AI guard)
//   - `getSupabaseAdmin() === null` → `{ok:false, error:"Service unavailable"}`
//   - upsert branch — existing.id present → UPDATE row + updated_at;
//     absent → INSERT row with created_at + updated_at
//   - `error` from either write → `{ok:false, error: "insert_failed:…" | "update_failed:…"}`
//   - `row_missing_after_write` when the write succeeds but the returned data is null
//   - projects.package_ticker mirror update fires with the sanitised ticker
//     value + is best-effort (no rethrow / no `ok:false` if it fails)
//   - `created_at` NOT touched on UPDATE (only `pct_reserved` + `ticker_hint`
//     + `updated_at`) so a re-reservation cannot rewrite creation timestamp

interface FakeState {
  adminConfigured: boolean;
  existingRow: { id: string } | null;
  existingFetchError: unknown;
  writeData: unknown;
  writeError: unknown;
  mirrorError: unknown;
  captured: {
    fromCalls: string[];
    selectCols: string | null;
    insertPayload: Record<string, unknown> | null;
    updatePayload: Record<string, unknown> | null;
    updateEqCol: string | null;
    updateEqVal: unknown;
    fetchEqCol: string | null;
    fetchEqVal: unknown;
    mirrorTable: string | null;
    mirrorPayload: Record<string, unknown> | null;
    mirrorEqCol: string | null;
    mirrorEqVal: unknown;
    terminalOnFetch: "maybeSingle" | null;
    terminalOnWrite: "maybeSingle" | null;
  };
}

function freshCaptured(): FakeState["captured"] {
  return {
    fromCalls: [],
    selectCols: null,
    insertPayload: null,
    updatePayload: null,
    updateEqCol: null,
    updateEqVal: null,
    fetchEqCol: null,
    fetchEqVal: null,
    mirrorTable: null,
    mirrorPayload: null,
    mirrorEqCol: null,
    mirrorEqVal: null,
    terminalOnFetch: null,
    terminalOnWrite: null,
  };
}

const state: FakeState = {
  adminConfigured: true,
  existingRow: null,
  existingFetchError: null,
  writeData: null,
  writeError: null,
  mirrorError: null,
  captured: freshCaptured(),
};

// The reservation module makes 3 possible `from()` calls per happy path:
//   1. `startup_package_reserved_allocations` SELECT id — the existence probe
//   2. same table INSERT|UPDATE + select() + maybeSingle() — the write
//   3. `projects` UPDATE + eq() — the ticker mirror
// A single `from()` implementation multiplexes them by table name AND by
// which chain methods the caller invokes.
function buildAdmin() {
  return {
    from: (table: string) => {
      state.captured.fromCalls.push(table);

      if (table === "projects") {
        // Mirror-only chain: update().eq()
        const chain: Record<string, unknown> = {};
        chain.update = (payload: Record<string, unknown>) => {
          state.captured.mirrorTable = table;
          state.captured.mirrorPayload = payload;
          return chain;
        };
        chain.eq = (col: string, val: unknown) => {
          state.captured.mirrorEqCol = col;
          state.captured.mirrorEqVal = val;
          // Terminal await — resolves to {error} shape (module ignores result).
          return Promise.resolve({ data: null, error: state.mirrorError });
        };
        return chain;
      }

      // startup_package_reserved_allocations — either SELECT-existence or WRITE.
      const chain: Record<string, unknown> = {};
      let mode: "read" | "write" | null = null;

      chain.select = (cols?: string) => {
        state.captured.selectCols = cols ?? null;
        return chain;
      };
      chain.insert = (payload: Record<string, unknown>) => {
        mode = "write";
        state.captured.insertPayload = payload;
        return chain;
      };
      chain.update = (payload: Record<string, unknown>) => {
        mode = "write";
        state.captured.updatePayload = payload;
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        if (mode === "write") {
          state.captured.updateEqCol = col;
          state.captured.updateEqVal = val;
        } else {
          // Read-existence path: SELECT.eq("project_id", …).maybeSingle()
          mode = "read";
          state.captured.fetchEqCol = col;
          state.captured.fetchEqVal = val;
        }
        return chain;
      };
      chain.maybeSingle = () => {
        if (mode === "write") {
          state.captured.terminalOnWrite = "maybeSingle";
          return Promise.resolve({ data: state.writeData, error: state.writeError });
        }
        state.captured.terminalOnFetch = "maybeSingle";
        return Promise.resolve({ data: state.existingRow, error: state.existingFetchError });
      };
      return chain;
    },
  };
}

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? buildAdmin() : null),
}));

beforeEach(() => {
  state.adminConfigured = true;
  state.existingRow = null;
  state.existingFetchError = null;
  state.writeData = null;
  state.writeError = null;
  state.mirrorError = null;
  state.captured = freshCaptured();
});

const VALID_INPUT = { projectId: "p-1", pct_reserved: 20, ticker_hint: "acm" };

async function loadMod() {
  return import("./reservation-server");
}

describe("reservation-server — RESERVED_PACKAGE_TICKERS", () => {
  it("exports exactly the 7 shipped reserved tickers", async () => {
    const { RESERVED_PACKAGE_TICKERS } = await loadMod();
    expect([...RESERVED_PACKAGE_TICKERS].sort()).toEqual(
      ["AUD", "BID", "BTC", "ETH", "USD", "USDC", "USDT"].sort(),
    );
    expect(RESERVED_PACKAGE_TICKERS).toHaveLength(7);
  });

  it("is frozen — cannot be mutated at runtime", async () => {
    const { RESERVED_PACKAGE_TICKERS } = await loadMod();
    expect(Object.isFrozen(RESERVED_PACKAGE_TICKERS)).toBe(true);
  });
});

describe("reservation-server — projectId validation", () => {
  it("rejects blank projectId", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({ ...VALID_INPUT, projectId: "" });
    expect(res).toEqual({ ok: false, error: "projectId is required" });
    // No DB access happened.
    expect(state.captured.fromCalls).toEqual([]);
  });

  it("rejects non-string projectId (null coerced through the type)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({
      ...VALID_INPUT,
      projectId: null as unknown as string,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("projectId is required");
    expect(state.captured.fromCalls).toEqual([]);
  });
});

describe("reservation-server — pct_reserved validation", () => {
  it("rejects pct_reserved below 10 after rounding (9.4 → 9)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({ ...VALID_INPUT, pct_reserved: 9.4 });
    expect(res).toEqual({
      ok: false,
      error: "pct_reserved must be between 10 and 100.",
      field: "pct_reserved",
    });
  });

  it("accepts pct_reserved that rounds up to 10 (9.6 → 10)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.writeData = {
      id: "r-1",
      project_id: "p-1",
      pct_reserved: 10,
      ticker_hint: "ACM",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const res = await upsertReservedAllocation({ ...VALID_INPUT, pct_reserved: 9.6 });
    expect(res.ok).toBe(true);
    expect(state.captured.insertPayload?.pct_reserved).toBe(10);
  });

  it("rejects pct_reserved above 100 after rounding (100.6 → 101)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({ ...VALID_INPUT, pct_reserved: 100.6 });
    expect(res).toEqual({
      ok: false,
      error: "pct_reserved must be between 10 and 100.",
      field: "pct_reserved",
    });
  });

  it("accepts pct_reserved boundary 100 (exact)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.writeData = {
      id: "r-1",
      project_id: "p-1",
      pct_reserved: 100,
      ticker_hint: "ACM",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const res = await upsertReservedAllocation({ ...VALID_INPUT, pct_reserved: 100 });
    expect(res.ok).toBe(true);
    expect(state.captured.insertPayload?.pct_reserved).toBe(100);
  });

  it("rejects NaN pct_reserved via Number.isFinite guard", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({
      ...VALID_INPUT,
      pct_reserved: Number.NaN,
    });
    expect(res).toEqual({
      ok: false,
      error: "pct_reserved must be between 10 and 100.",
      field: "pct_reserved",
    });
  });
});

describe("reservation-server — ticker_hint validation", () => {
  it("rejects too-short ticker (2 chars)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({ ...VALID_INPUT, ticker_hint: "ab" });
    expect(res).toEqual({
      ok: false,
      error: "ticker_hint must be 3-4 uppercase letters (A-Z).",
      field: "ticker_hint",
    });
  });

  it("rejects too-long ticker (5 chars)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({ ...VALID_INPUT, ticker_hint: "abcde" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("ticker_hint");
  });

  it("rejects ticker with non-letter characters (digit)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({ ...VALID_INPUT, ticker_hint: "ab1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("ticker_hint");
  });

  it("trims + uppercases the ticker before writing", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.writeData = {
      id: "r-1",
      project_id: "p-1",
      pct_reserved: 20,
      ticker_hint: "ACM",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const res = await upsertReservedAllocation({
      projectId: "p-1",
      pct_reserved: 20,
      ticker_hint: "  aCm  ",
    });
    expect(res.ok).toBe(true);
    expect(state.captured.insertPayload?.ticker_hint).toBe("ACM");
    // Mirror also fires with the sanitised value.
    expect(state.captured.mirrorPayload?.package_ticker).toBe("ACM");
  });

  it("rejects null/undefined ticker_hint (coerces to blank, fails regex)", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({
      projectId: "p-1",
      pct_reserved: 20,
      ticker_hint: null as unknown as string,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("ticker_hint");
  });
});

describe("reservation-server — reserved-ticker guard", () => {
  it.each(["BID", "ETH", "BTC", "USDT", "USDC", "USD", "AUD"])(
    "rejects reserved ticker %s with a helpful error message",
    async (ticker) => {
      const { upsertReservedAllocation } = await loadMod();
      const res = await upsertReservedAllocation({
        projectId: "p-1",
        pct_reserved: 20,
        ticker_hint: ticker,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.field).toBe("ticker_hint");
        expect(res.error).toContain(`"${ticker}"`);
        expect(res.error).toContain("reserved");
      }
      // No DB access — validation short-circuits before supabase resolves.
      expect(state.captured.fromCalls).toEqual([]);
    },
  );

  it("reserved-ticker guard is case-insensitive via the uppercase normaliser", async () => {
    const { upsertReservedAllocation } = await loadMod();
    const res = await upsertReservedAllocation({
      projectId: "p-1",
      pct_reserved: 20,
      ticker_hint: "  btc  ",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('"BTC"');
      expect(res.field).toBe("ticker_hint");
    }
  });
});

describe("reservation-server — supabase availability", () => {
  it("returns Service unavailable when getSupabaseAdmin returns null", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.adminConfigured = false;
    const res = await upsertReservedAllocation(VALID_INPUT);
    expect(res).toEqual({ ok: false, error: "Service unavailable" });
    expect(state.captured.fromCalls).toEqual([]);
  });
});

describe("reservation-server — insert branch (no existing row)", () => {
  it("targets the correct table, stamps created_at + updated_at, echoes the row", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.existingRow = null;
    state.writeData = {
      id: "r-1",
      project_id: "p-1",
      pct_reserved: 20,
      ticker_hint: "ACM",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const res = await upsertReservedAllocation(VALID_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.row.id).toBe("r-1");
      expect(res.row.pct_reserved).toBe(20);
      expect(res.row.ticker_hint).toBe("ACM");
    }
    // Two reservation-table calls (SELECT existence + INSERT) plus 1 projects mirror.
    expect(state.captured.fromCalls.filter((t) => t === "startup_package_reserved_allocations")).toHaveLength(2);
    expect(state.captured.fromCalls).toContain("projects");
    // INSERT payload shape.
    expect(state.captured.insertPayload).toMatchObject({
      project_id: "p-1",
      pct_reserved: 20,
      ticker_hint: "ACM",
    });
    // created_at + updated_at both stamped as ISO strings.
    const created = state.captured.insertPayload?.created_at;
    const updated = state.captured.insertPayload?.updated_at;
    expect(typeof created).toBe("string");
    expect(typeof updated).toBe("string");
    expect(Number.isFinite(Date.parse(created as string))).toBe(true);
    expect(created).toBe(updated); // Same `now` used for both on insert.
  });

  it("surfaces insert_failed:<message> when the insert errors", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.existingRow = null;
    state.writeError = { message: "unique_violation" };
    const res = await upsertReservedAllocation(VALID_INPUT);
    expect(res).toEqual({ ok: false, error: "insert_failed:unique_violation" });
    // Mirror never runs after a failed write.
    expect(state.captured.mirrorTable).toBeNull();
  });

  it("returns row_missing_after_write when insert succeeds but data is null", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.existingRow = null;
    state.writeData = null;
    state.writeError = null;
    const res = await upsertReservedAllocation(VALID_INPUT);
    expect(res).toEqual({ ok: false, error: "row_missing_after_write" });
    // Mirror never runs when the row can't be echoed back.
    expect(state.captured.mirrorTable).toBeNull();
  });
});

describe("reservation-server — update branch (existing row)", () => {
  it("routes through UPDATE + does NOT stamp created_at", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.existingRow = { id: "existing-1" };
    state.writeData = {
      id: "existing-1",
      project_id: "p-1",
      pct_reserved: 30,
      ticker_hint: "NEW",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-01-01T00:00:00Z", // untouched
      updated_at: "2026-08-01T00:00:00Z",
    };
    const res = await upsertReservedAllocation({
      projectId: "p-1",
      pct_reserved: 30,
      ticker_hint: "new",
    });
    expect(res.ok).toBe(true);
    expect(state.captured.insertPayload).toBeNull();
    expect(state.captured.updatePayload).toMatchObject({
      pct_reserved: 30,
      ticker_hint: "NEW",
    });
    // Critically NOT rewriting created_at.
    expect(state.captured.updatePayload).not.toHaveProperty("created_at");
    expect(typeof state.captured.updatePayload?.updated_at).toBe("string");
    // UPDATE targets the existing row's id.
    expect(state.captured.updateEqCol).toBe("id");
    expect(state.captured.updateEqVal).toBe("existing-1");
  });

  it("surfaces update_failed:<message> when the update errors", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.existingRow = { id: "existing-1" };
    state.writeError = { message: "constraint_broken" };
    const res = await upsertReservedAllocation(VALID_INPUT);
    expect(res).toEqual({ ok: false, error: "update_failed:constraint_broken" });
  });
});

describe("reservation-server — projects.package_ticker mirror", () => {
  it("mirrors the ticker onto projects.package_ticker after a successful write", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.writeData = {
      id: "r-1",
      project_id: "p-99",
      pct_reserved: 25,
      ticker_hint: "ZED",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    await upsertReservedAllocation({
      projectId: "p-99",
      pct_reserved: 25,
      ticker_hint: "zed",
    });
    expect(state.captured.mirrorTable).toBe("projects");
    expect(state.captured.mirrorPayload).toEqual({ package_ticker: "ZED" });
    expect(state.captured.mirrorEqCol).toBe("id");
    expect(state.captured.mirrorEqVal).toBe("p-99");
  });

  it("mirror is best-effort — a mirror error does NOT flip the result to ok:false", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.writeData = {
      id: "r-1",
      project_id: "p-1",
      pct_reserved: 20,
      ticker_hint: "ACM",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    state.mirrorError = { message: "projects_rls_denied" };
    const res = await upsertReservedAllocation(VALID_INPUT);
    // The mirror error is intentionally swallowed — write succeeded.
    expect(res.ok).toBe(true);
    // Mirror still attempted.
    expect(state.captured.mirrorTable).toBe("projects");
  });
});

describe("reservation-server — SELECT-existence probe shape", () => {
  it("looks up the existing row by natural key project_id via maybeSingle", async () => {
    const { upsertReservedAllocation } = await loadMod();
    state.writeData = {
      id: "r-1",
      project_id: "p-42",
      pct_reserved: 20,
      ticker_hint: "ACM",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    await upsertReservedAllocation({ ...VALID_INPUT, projectId: "p-42" });
    expect(state.captured.fetchEqCol).toBe("project_id");
    expect(state.captured.fetchEqVal).toBe("p-42");
    expect(state.captured.terminalOnFetch).toBe("maybeSingle");
    // Fetch only asks for the id column (small payload).
    expect(state.captured.selectCols).toContain("id");
  });
});
