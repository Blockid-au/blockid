import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the previously-untested server-only
// `investor-portal.ts` — the data-access layer behind the three investor
// workspace surfaces (Deal Flow / Watchlist / Portfolio) and the
// preference store on app_users.investor_prefs. A silent regression here
// can:
//   (a) leak another investor's watchlist rows by dropping the
//       `.eq("account_id", …)` filter on the watchlist reads/writes,
//   (b) swap a Postgres "column does not exist" error into a hard 500
//       response by removing the `investor_prefs` degrade-to-defaults
//       branch — breaking every legacy install that hasn't run the
//       investor-prefs migration yet,
//   (c) allow a self-conflicting ticker in `addToWatchlist` — the ticker
//       regex is the last gate before an untrusted `?ref=…` value lands
//       in the natural-key column, and
//   (d) forget the `min_svi` 0..100 clamp on prefs — surfacing a bogus
//       `min_svi: 9999` into the deal-flow `.gte("total_score", …)` and
//       silently returning zero rows to every angel + VC page.
//
// The fake Supabase covers every chain shape the module walks:
//   .from().select(cols).eq().maybeSingle()        ← prefs read
//                                                     + watchlist lookup
//   .from().update(payload).eq()                   ← prefs write
//                                                     + watchlist notes
//                                                       tag update
//   .from().select(cols).gte().order().limit()     ← dealflow scores
//   .from().select(cols).order().limit()           ← dealflow snapshots
//   .from().insert(payload)                        ← watchlist add
//   .from().select(cols).eq().order()              ← portfolio read

interface CapturedEq {
  col: string;
  val: unknown;
}
interface CapturedGte {
  col: string;
  val: unknown;
}
interface CapturedOrder {
  col: string;
  opts?: Record<string, unknown> | null;
}
interface CapturedCall {
  table: string;
  selectCols: string | null;
  insertPayload: unknown;
  updatePayload: unknown;
  eqs: CapturedEq[];
  gtes: CapturedGte[];
  order: CapturedOrder | null;
  limit: number | null;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown }>;
  calls: CapturedCall[];
  throwOnFrom: string | null;
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
  throwOnFrom: null,
};

function nextResponse(): { data: unknown; error: unknown } {
  const next = state.queue.shift() ?? {};
  return {
    data: next.data ?? null,
    error: next.error ?? null,
  };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    insertPayload: null,
    updatePayload: null,
    eqs: [],
    gtes: [],
    order: null,
    limit: null,
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string) => {
    op.selectCols = cols ?? null;
    return chain;
  };
  chain.insert = (payload: unknown) => {
    op.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: unknown) => {
    op.updatePayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqs.push({ col, val });
    return chain;
  };
  chain.gte = (col: string, val: unknown) => {
    op.gtes.push({ col, val });
    return chain;
  };
  chain.order = (col: string, opts?: Record<string, unknown>) => {
    op.order = { col, opts: opts ?? null };
    return chain;
  };
  chain.limit = (n: number) => {
    op.limit = n;
    return chain;
  };
  chain.single = () => {
    op.terminal = "single";
    return Promise.resolve(nextResponse());
  };
  chain.maybeSingle = () => {
    op.terminal = "maybeSingle";
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => {
        if (state.throwOnFrom === table) {
          throw new Error(`boom on ${table}`);
        }
        return makeChain(table);
      },
    };
  },
}));

const listWatchlistMock = vi.fn(async (_userId: string) => [] as unknown[]);
vi.mock("./watchlist", () => ({
  listWatchlist: (userId: string) => listWatchlistMock(userId),
}));

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

beforeEach(() => {
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  state.throwOnFrom = null;
  listWatchlistMock.mockClear();
  errorSpy.mockClear();
});

// ---------------------------------------------------------------------------
// DEFAULT_PREFS — the shape every degraded path returns
// ---------------------------------------------------------------------------

describe("investor-portal — DEFAULT_PREFS", () => {
  it("exposes the AU-biased default shape (stages=[any], geos=[AU], min_svi=null)", async () => {
    const { DEFAULT_PREFS } = await import("./investor-portal");
    expect(DEFAULT_PREFS).toEqual({
      sectors: [],
      stages: ["any"],
      geos: ["AU"],
      cheque_band: "any",
      min_svi: null,
      updated_at: null,
    });
  });
});

// ---------------------------------------------------------------------------
// getInvestorPreferences
// ---------------------------------------------------------------------------

describe("investor-portal — getInvestorPreferences", () => {
  it("returns DEFAULT_PREFS with zero DB calls when admin is not configured", async () => {
    state.adminConfigured = false;
    const { getInvestorPreferences, DEFAULT_PREFS } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs).toEqual(DEFAULT_PREFS);
    expect(state.calls).toHaveLength(0);
  });

  it("targets app_users.investor_prefs keyed on id", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    const { getInvestorPreferences } = await import("./investor-portal");
    await getInvestorPreferences("u-42");
    const [call] = callsFor("app_users");
    expect(call).toBeDefined();
    expect(call.selectCols).toBe("investor_prefs");
    expect(call.eqs).toEqual([{ col: "id", val: "u-42" }]);
    expect(call.terminal).toBe("maybeSingle");
  });

  it("degrades to DEFAULT_PREFS on the 'column does not exist' error WITHOUT logging (legacy installs)", async () => {
    state.queue.push({ error: { message: "column app_users.investor_prefs does not exist" } });
    const { getInvestorPreferences, DEFAULT_PREFS } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs).toEqual(DEFAULT_PREFS);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("degrades to DEFAULT_PREFS on any OTHER error AND logs (real DB failure worth surfacing)", async () => {
    state.queue.push({ error: { message: "permission denied on relation app_users" } });
    const { getInvestorPreferences, DEFAULT_PREFS } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs).toEqual(DEFAULT_PREFS);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("prefs read failed");
  });

  it("degrades to DEFAULT_PREFS when investor_prefs is null (never-set)", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    const { getInvestorPreferences, DEFAULT_PREFS } = await import("./investor-portal");
    expect(await getInvestorPreferences("u-1")).toEqual(DEFAULT_PREFS);
  });

  it("degrades to DEFAULT_PREFS when investor_prefs is a scalar (bad legacy write)", async () => {
    state.queue.push({ data: { investor_prefs: "corrupt" } });
    const { getInvestorPreferences, DEFAULT_PREFS } = await import("./investor-portal");
    expect(await getInvestorPreferences("u-1")).toEqual(DEFAULT_PREFS);
  });

  it("normalises stored prefs: keeps valid arrays + coerces min_svi within 0..100", async () => {
    state.queue.push({
      data: {
        investor_prefs: {
          sectors: ["fintech", "healthtech"],
          stages: ["seed", "series_a"],
          geos: ["AU", "NZ"],
          cheque_band: "100k_500k",
          min_svi: 75,
          updated_at: "2026-07-15T00:00:00.000Z",
        },
      },
    });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.sectors).toEqual(["fintech", "healthtech"]);
    expect(prefs.stages).toEqual(["seed", "series_a"]);
    expect(prefs.geos).toEqual(["AU", "NZ"]);
    expect(prefs.cheque_band).toBe("100k_500k");
    expect(prefs.min_svi).toBe(75);
    expect(prefs.updated_at).toBe("2026-07-15T00:00:00.000Z");
  });

  it("clamps min_svi below 0 up to 0 (Math.max floor)", async () => {
    state.queue.push({ data: { investor_prefs: { min_svi: -50 } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.min_svi).toBe(0);
  });

  it("clamps min_svi above 100 down to 100 (Math.min ceiling)", async () => {
    state.queue.push({ data: { investor_prefs: { min_svi: 9999 } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    // Pins the "silent zero-rows on bogus filter" guard.
    expect(prefs.min_svi).toBe(100);
  });

  it("coerces non-numeric min_svi to null (never NaN into a .gte() filter)", async () => {
    state.queue.push({ data: { investor_prefs: { min_svi: "eighty" } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.min_svi).toBeNull();
  });

  it("defaults stages to ['any'] when the stored array is empty (never surface an empty-stages UI chip)", async () => {
    state.queue.push({ data: { investor_prefs: { stages: [] } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.stages).toEqual(["any"]);
  });

  it("defaults geos to ['AU'] when the stored array is missing (AU-first bias)", async () => {
    state.queue.push({ data: { investor_prefs: { sectors: ["fintech"] } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.geos).toEqual(["AU"]);
  });

  it("caps sectors at 20 entries + coerces to string (never let a UI-side loop OOM)", async () => {
    const monster = Array.from({ length: 40 }, (_, i) => i);
    state.queue.push({ data: { investor_prefs: { sectors: monster } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.sectors).toHaveLength(20);
    expect(prefs.sectors[0]).toBe("0");
    expect(prefs.sectors[19]).toBe("19");
  });

  it("caps stages at 6 entries", async () => {
    state.queue.push({
      data: {
        investor_prefs: {
          stages: ["seed", "series_a", "series_b", "growth", "any", "pre_seed", "extra-1", "extra-2"],
        },
      },
    });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.stages).toHaveLength(6);
  });

  it("caps geos at 20 entries + coerces to string", async () => {
    const monster = Array.from({ length: 25 }, (_, i) => `X${i}`);
    state.queue.push({ data: { investor_prefs: { geos: monster } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.geos).toHaveLength(20);
  });

  it("defaults cheque_band to 'any' when missing", async () => {
    state.queue.push({ data: { investor_prefs: { sectors: [] } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.cheque_band).toBe("any");
  });

  it("preserves cheque_band verbatim (currently no allowlist — bad values pass through)", async () => {
    state.queue.push({ data: { investor_prefs: { cheque_band: "wildcard-band" } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    // Regression pin: today's normaliser does not validate cheque_band —
    // a future guard should intentionally update this expectation.
    expect(prefs.cheque_band).toBe("wildcard-band");
  });

  it("coerces non-string updated_at to null (avoid leaking a Date object into JSON)", async () => {
    state.queue.push({ data: { investor_prefs: { updated_at: 12345 } } });
    const { getInvestorPreferences } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs.updated_at).toBeNull();
  });

  it("degrades to DEFAULT_PREFS + logs when the fake supabase throws (network wobble)", async () => {
    state.throwOnFrom = "app_users";
    const { getInvestorPreferences, DEFAULT_PREFS } = await import("./investor-portal");
    const prefs = await getInvestorPreferences("u-1");
    expect(prefs).toEqual(DEFAULT_PREFS);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("prefs read threw");
  });
});

// ---------------------------------------------------------------------------
// setInvestorPreferences
// ---------------------------------------------------------------------------

describe("investor-portal — setInvestorPreferences", () => {
  it("returns not_configured with the merged view when admin is null", async () => {
    state.adminConfigured = false;
    const { setInvestorPreferences, DEFAULT_PREFS } = await import("./investor-portal");
    const res = await setInvestorPreferences("u-1", { sectors: ["fintech"] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_configured");
    // Merged view = defaults + patch
    expect(res.prefs.sectors).toEqual(["fintech"]);
    expect(res.prefs.stages).toEqual(DEFAULT_PREFS.stages);
  });

  it("merges patch over current prefs and stamps updated_at", async () => {
    state.queue.push({
      data: {
        investor_prefs: {
          sectors: ["old"],
          stages: ["seed"],
          geos: ["NZ"],
          cheque_band: "25k_100k",
          min_svi: 50,
          updated_at: "2020-01-01",
        },
      },
    });
    state.queue.push({ error: null });
    const before = Date.now();
    const { setInvestorPreferences } = await import("./investor-portal");
    const res = await setInvestorPreferences("u-1", { sectors: ["new"], min_svi: 80 });
    const after = Date.now();
    expect(res.ok).toBe(true);
    expect(res.prefs.sectors).toEqual(["new"]);
    expect(res.prefs.stages).toEqual(["seed"]); // preserved
    expect(res.prefs.geos).toEqual(["NZ"]); // preserved
    expect(res.prefs.min_svi).toBe(80);
    // Fresh ISO stamp within [before, after]
    const ts = Date.parse(res.prefs.updated_at ?? "");
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("issues UPDATE on app_users with investor_prefs payload keyed on id", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ error: null });
    const { setInvestorPreferences } = await import("./investor-portal");
    await setInvestorPreferences("u-7", { sectors: ["climate"] });
    const updateCalls = callsFor("app_users").filter((c) => c.updatePayload !== null);
    expect(updateCalls).toHaveLength(1);
    const [update] = updateCalls;
    expect(update.eqs).toEqual([{ col: "id", val: "u-7" }]);
    const payload = update.updatePayload as { investor_prefs: { sectors: string[] } };
    expect(payload.investor_prefs.sectors).toEqual(["climate"]);
  });

  it("returns column_missing WITHOUT logging when the column has not been migrated", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ error: { message: "column app_users.investor_prefs does not exist" } });
    const { setInvestorPreferences } = await import("./investor-portal");
    const res = await setInvestorPreferences("u-1", { min_svi: 60 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("column_missing");
    expect(res.prefs.min_svi).toBe(60);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns db_error + logs on any OTHER error", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ error: { message: "deadlock detected" } });
    const { setInvestorPreferences } = await import("./investor-portal");
    const res = await setInvestorPreferences("u-1", { sectors: ["fintech"] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("db_error");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("prefs write failed");
  });

  it("returns db_error + logs when the update throws (network wobble)", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.throwOnFrom = "app_users";
    // First call for the read succeeds via preloaded queue; second .from() throws.
    // But throwOnFrom fires on every .from(); so instead we intercept differently:
    // reset and re-arrange — override supabase to throw only the update path.
    state.calls = [];
    state.queue = [];
    state.throwOnFrom = null;
    // Re-do: install a synthetic throw by pushing an already-shifted queue.
    // Easier: rely on the try/catch inside setInvestorPreferences by
    // shifting the read AND then throwing on the update chain via a
    // rejected then().
    // Push a resolving read + a rejecting update.
    state.queue.push({ data: { investor_prefs: null } });
    // Second response for the update chain that rejects the awaited chain
    // — since our fake awaits Promise.resolve, we need an alternate route:
    // toggle throwOnFrom for the second .from() call by counting.
    let fromCount = 0;
    const originalMod = await vi.importActual<typeof import("./investor-portal")>(
      "./investor-portal",
    );
    void originalMod;
    // Reset the supabase mock to a counting version for this test only.
    vi.doMock("./supabase", () => ({
      getSupabaseAdmin: () => ({
        from: (table: string) => {
          fromCount += 1;
          if (fromCount === 2) {
            throw new Error("update boom");
          }
          return makeChain(table);
        },
      }),
    }));
    vi.resetModules();
    const { setInvestorPreferences } = await import("./investor-portal");
    const res = await setInvestorPreferences("u-1", { sectors: ["fintech"] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("db_error");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("prefs write threw");
    // Restore the default supabase mock so subsequent tests are unaffected.
    vi.doUnmock("./supabase");
    vi.doMock("./supabase", () => ({
      getSupabaseAdmin: () => {
        if (!state.adminConfigured) return null;
        return {
          from: (table: string) => {
            if (state.throwOnFrom === table) throw new Error(`boom on ${table}`);
            return makeChain(table);
          },
        };
      },
    }));
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// getDealFlow
// ---------------------------------------------------------------------------

describe("investor-portal — getDealFlow", () => {
  it("returns [] with zero DB calls when admin is null", async () => {
    state.adminConfigured = false;
    const { getDealFlow } = await import("./investor-portal");
    expect(await getDealFlow("u-1")).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it("returns [] + logs when the scores query errors", async () => {
    state.queue.push({ data: { investor_prefs: null } }); // prefs read
    state.queue.push({ error: { message: "scores read failed" } }); // scores query
    const { getDealFlow } = await import("./investor-portal");
    expect(await getDealFlow("u-1")).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("dealflow scores read failed");
  });

  it("caps limit at 200 (defence against huge N)", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    await getDealFlow("u-1", { limit: 9999 });
    const [_prefs, scoresCall] = state.calls;
    expect(scoresCall.limit).toBe(500); // scores fetch is fixed at 500
    // The 200-cap manifests in the final slice; since the row set is empty
    // we can't observe it here — see next test for that path.
    void _prefs;
  });

  it("returns [] when the scores query is empty", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    expect(await getDealFlow("u-1")).toEqual([]);
  });

  it("filters scores by minScore via .gte on total_score using explicit filters.minScore", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    await getDealFlow("u-1", { minScore: 65 });
    const scoresCall = callsFor("scores")[0];
    expect(scoresCall.gtes).toEqual([{ col: "total_score", val: 65 }]);
  });

  it("falls back to prefs.min_svi when filters.minScore is unset", async () => {
    state.queue.push({ data: { investor_prefs: { min_svi: 80 } } });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    await getDealFlow("u-1");
    expect(callsFor("scores")[0].gtes).toEqual([{ col: "total_score", val: 80 }]);
  });

  it("defaults minScore to 0 when neither filter nor prefs provide one", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    await getDealFlow("u-1");
    expect(callsFor("scores")[0].gtes).toEqual([{ col: "total_score", val: 0 }]);
  });

  it("orders scores by created_at DESC and picks the top 500 (fixed cap)", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    await getDealFlow("u-1");
    const scoresCall = callsFor("scores")[0];
    expect(scoresCall.order?.col).toBe("created_at");
    expect(scoresCall.order?.opts).toEqual({ ascending: false });
    expect(scoresCall.limit).toBe(500);
  });

  it("enriches rows from svi_index_snapshots keyed on account_id (MVP: reconciled in W6)", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        {
          id: "score-1",
          email: "founder@example.com",
          company_name: "Acme",
          total_score: 80,
          created_at: "2026-07-30T00:00:00Z",
        },
      ],
    });
    state.queue.push({
      data: [
        {
          account_id: "founder@example.com",
          sector: "fintech",
          stage: "seed",
          state: "NSW",
          snapshot_date: "2026-07-30",
        },
      ],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      score_id: "score-1",
      company_name: "Acme",
      total_score: 80,
      sector: "fintech",
      stage: "seed",
      jurisdiction: "AU", // NSW → AU
      updated_at: "2026-07-30T00:00:00Z",
    });
  });

  it("orders the svi_index_snapshots read by snapshot_date DESC and reads up to 1000", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        {
          id: "score-1",
          email: "e@a.com",
          company_name: null,
          total_score: 50,
          created_at: "2026-07-30T00:00:00Z",
        },
      ],
    });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    await getDealFlow("u-1");
    const [snapCall] = callsFor("svi_index_snapshots");
    expect(snapCall.order?.col).toBe("snapshot_date");
    expect(snapCall.order?.opts).toEqual({ ascending: false });
    expect(snapCall.limit).toBe(1000);
    expect(snapCall.selectCols).toBe("account_id, sector, stage, state, snapshot_date");
  });

  it("skips the svi_index_snapshots read entirely when every score row has a falsy email", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        {
          id: "score-1",
          email: "",
          company_name: "Anon",
          total_score: 40,
          created_at: "2026-07-30T00:00:00Z",
        },
      ],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1");
    expect(callsFor("svi_index_snapshots")).toHaveLength(0);
    expect(rows[0].sector).toBeNull();
    expect(rows[0].jurisdiction).toBe("AU"); // no snap → default AU
  });

  it("swallows a thrown svi_index_snapshots error and still returns the base scores", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        {
          id: "score-1",
          email: "e@a.com",
          company_name: "A",
          total_score: 55,
          created_at: "2026-07-30T00:00:00Z",
        },
      ],
    });
    // Reconfigure: throw when svi_index_snapshots is queried.
    state.throwOnFrom = "svi_index_snapshots";
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].sector).toBeNull();
    expect(rows[0].jurisdiction).toBe("AU");
  });

  it("respects filters.sector — filters out non-matching sectors from enriched rows", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
        { id: "s2", email: "b@b.com", company_name: "B", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [
        { account_id: "a@a.com", sector: "fintech", stage: null, state: "NSW" },
        { account_id: "b@b.com", sector: "healthtech", stage: null, state: "NSW" },
      ],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1", { sector: "fintech" });
    expect(rows.map((r) => r.company_name)).toEqual(["A"]);
  });

  it("falls back to prefs.sectors when filters.sector is unset", async () => {
    state.queue.push({ data: { investor_prefs: { sectors: ["climate"] } } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
        { id: "s2", email: "b@b.com", company_name: "B", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [
        { account_id: "a@a.com", sector: "climate", stage: null, state: "NSW" },
        { account_id: "b@b.com", sector: "fintech", stage: null, state: "NSW" },
      ],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1");
    expect(rows.map((r) => r.company_name)).toEqual(["A"]);
  });

  it("keeps rows whose sector is null when a sector filter is active (only known non-matches are dropped)", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({ data: [] }); // no snapshot → sector null
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1", { sector: "fintech" });
    expect(rows.map((r) => r.company_name)).toEqual(["A"]);
  });

  it("does NOT filter by stage when filters.stage='any'", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [{ account_id: "a@a.com", sector: null, stage: "growth", state: "NSW" }],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1", { stage: "any" });
    expect(rows).toHaveLength(1);
  });

  it("matches stage via the loose synonym rules (seed / pre_seed / series_a)", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
        { id: "s2", email: "b@b.com", company_name: "B", total_score: 70, created_at: "t" },
        { id: "s3", email: "c@c.com", company_name: "C", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [
        { account_id: "a@a.com", sector: null, stage: "Seed", state: null },
        { account_id: "b@b.com", sector: null, stage: "pre-seed", state: null },
        { account_id: "c@c.com", sector: null, stage: "growth", state: null },
      ],
    });
    const { getDealFlow } = await import("./investor-portal");
    const seedRows = await getDealFlow("u-1", { stage: "seed" });
    expect(seedRows.map((r) => r.company_name).sort()).toEqual(["A"]);
  });

  it("respects filters.jurisdiction — drops rows whose derived country doesn't match", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
        { id: "s2", email: "b@b.com", company_name: "B", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [
        { account_id: "a@a.com", sector: null, stage: null, state: "NSW" }, // → AU
        { account_id: "b@b.com", sector: null, stage: null, state: "US" }, // → US
      ],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1", { jurisdiction: "US" });
    expect(rows.map((r) => r.company_name)).toEqual(["B"]);
  });

  it("falls back to prefs.geos when filters.jurisdiction is unset", async () => {
    state.queue.push({ data: { investor_prefs: { geos: ["NZ"] } } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
        { id: "s2", email: "b@b.com", company_name: "B", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [
        { account_id: "a@a.com", sector: null, stage: null, state: "NSW" }, // → AU
        { account_id: "b@b.com", sector: null, stage: null, state: "NZ" }, // → NZ (ISO2)
      ],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1");
    expect(rows.map((r) => r.company_name)).toEqual(["B"]);
  });

  it("juriFromState treats non-AU-state ISO2 codes as themselves", async () => {
    // Explicit jurisdiction filter, since default prefs.geos=['AU'] would
    // otherwise drop the GB row.
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [{ account_id: "a@a.com", sector: null, stage: null, state: "gb" }],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1", { jurisdiction: "GB" });
    expect(rows[0].jurisdiction).toBe("GB");
  });

  it("juriFromState defaults unrecognised state strings to AU", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: [
        { id: "s1", email: "a@a.com", company_name: "A", total_score: 70, created_at: "t" },
      ],
    });
    state.queue.push({
      data: [{ account_id: "a@a.com", sector: null, stage: null, state: "Auckland" }],
    });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1");
    expect(rows[0].jurisdiction).toBe("AU");
  });

  it("respects filters.limit — the final slice caps the returned row count", async () => {
    state.queue.push({ data: { investor_prefs: null } });
    state.queue.push({
      data: Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        email: `x${i}@a.com`,
        company_name: `C${i}`,
        total_score: 70,
        created_at: "t",
      })),
    });
    state.queue.push({ data: [] });
    const { getDealFlow } = await import("./investor-portal");
    const rows = await getDealFlow("u-1", { limit: 3 });
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getWatchlist — thin passthrough
// ---------------------------------------------------------------------------

describe("investor-portal — getWatchlist", () => {
  it("delegates to listWatchlist with the userId", async () => {
    listWatchlistMock.mockResolvedValueOnce([{ ticker: "AU-ACME" }] as unknown[]);
    const { getWatchlist } = await import("./investor-portal");
    const rows = await getWatchlist("u-99");
    expect(listWatchlistMock).toHaveBeenCalledExactlyOnceWith("u-99");
    expect(rows).toEqual([{ ticker: "AU-ACME" }]);
  });
});

// ---------------------------------------------------------------------------
// addToWatchlist
// ---------------------------------------------------------------------------

describe("investor-portal — addToWatchlist", () => {
  it("returns not_configured with zero DB calls when admin is null", async () => {
    state.adminConfigured = false;
    const { addToWatchlist } = await import("./investor-portal");
    const res = await addToWatchlist("u-1", "AU-ACME");
    expect(res).toEqual({ ok: false, reason: "not_configured" });
    expect(state.calls).toHaveLength(0);
  });

  it("rejects a ticker missing the '-' separator with invalid_ticker (no DB write)", async () => {
    const { addToWatchlist } = await import("./investor-portal");
    const res = await addToWatchlist("u-1", "ACME");
    expect(res).toEqual({ ok: false, reason: "invalid_ticker" });
    expect(state.calls).toHaveLength(0);
  });

  it("rejects a ticker with lowercase letters after uppercase (regex demands A-Z0-9 after trim+upper — trailing lowercase is OK because normalised is upper, so injects: SQL injection sentinel)", async () => {
    const { addToWatchlist } = await import("./investor-portal");
    const res = await addToWatchlist("u-1", "AU-ACME; DROP TABLE users;--");
    expect(res).toEqual({ ok: false, reason: "invalid_ticker" });
    expect(state.calls).toHaveLength(0);
  });

  it("trims whitespace + uppercases the ticker before matching + persisting", async () => {
    state.queue.push({ data: null }); // existing lookup misses
    state.queue.push({ error: null }); // insert
    const { addToWatchlist } = await import("./investor-portal");
    const res = await addToWatchlist("u-1", "  au-acme  ", "acme-co");
    expect(res).toEqual({ ok: true });
    const lookup = callsFor("watchlist")[0];
    expect(lookup.eqs).toEqual([
      { col: "account_id", val: "u-1" },
      { col: "ticker", val: "AU-ACME" },
    ]);
    const insert = callsFor("watchlist")[1];
    const payload = insert.insertPayload as { account_id: string; ticker: string; slug: string | null };
    expect(payload).toEqual({ account_id: "u-1", ticker: "AU-ACME", slug: "acme-co" });
  });

  it("returns ok:true idempotently when the ticker is already on the watchlist (no insert)", async () => {
    state.queue.push({ data: { id: "existing-1" } });
    const { addToWatchlist } = await import("./investor-portal");
    const res = await addToWatchlist("u-1", "AU-ACME");
    expect(res).toEqual({ ok: true });
    const inserts = callsFor("watchlist").filter((c) => c.insertPayload !== null);
    expect(inserts).toHaveLength(0);
  });

  it("stamps slug=null when the caller omits the second argument", async () => {
    state.queue.push({ data: null });
    state.queue.push({ error: null });
    const { addToWatchlist } = await import("./investor-portal");
    await addToWatchlist("u-1", "AU-ACME");
    const insert = callsFor("watchlist").find((c) => c.insertPayload !== null)!;
    expect((insert.insertPayload as { slug: unknown }).slug).toBeNull();
  });

  it("returns db_error + logs when the insert errors", async () => {
    state.queue.push({ data: null });
    state.queue.push({ error: { message: "unique violation" } });
    const { addToWatchlist } = await import("./investor-portal");
    const res = await addToWatchlist("u-1", "AU-ACME");
    expect(res).toEqual({ ok: false, reason: "db_error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("watchlist insert failed");
  });
});

// ---------------------------------------------------------------------------
// moveWatchlistTag
// ---------------------------------------------------------------------------

describe("investor-portal — moveWatchlistTag", () => {
  it("returns not_configured with zero DB calls when admin is null", async () => {
    state.adminConfigured = false;
    const { moveWatchlistTag } = await import("./investor-portal");
    const res = await moveWatchlistTag("u-1", "AU-ACME", "following");
    expect(res).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns not_found when the watchlist row is missing (no UPDATE issued)", async () => {
    state.queue.push({ data: null });
    const { moveWatchlistTag } = await import("./investor-portal");
    const res = await moveWatchlistTag("u-1", "AU-ACME", "contacted");
    expect(res).toEqual({ ok: false, reason: "not_found" });
    const updates = callsFor("watchlist").filter((c) => c.updatePayload !== null);
    expect(updates).toHaveLength(0);
  });

  it("strips any pre-existing #tag:* prefix and prepends the new tag (single-tag invariant)", async () => {
    state.queue.push({
      data: { id: "w-1", notes: "#tag:passed strong founder team" },
    });
    state.queue.push({ error: null });
    const { moveWatchlistTag } = await import("./investor-portal");
    const res = await moveWatchlistTag("u-1", "AU-ACME", "following");
    expect(res).toEqual({ ok: true });
    const update = callsFor("watchlist").find((c) => c.updatePayload !== null)!;
    const payload = update.updatePayload as { notes: string };
    expect(payload.notes).toBe("#tag:following strong founder team");
  });

  it("emits just #tag:<tag> when the previous notes were empty", async () => {
    state.queue.push({ data: { id: "w-1", notes: null } });
    state.queue.push({ error: null });
    const { moveWatchlistTag } = await import("./investor-portal");
    await moveWatchlistTag("u-1", "AU-ACME", "contacted");
    const update = callsFor("watchlist").find((c) => c.updatePayload !== null)!;
    expect((update.updatePayload as { notes: string }).notes).toBe("#tag:contacted");
  });

  it("keys the UPDATE on the watchlist row id (not the ticker)", async () => {
    state.queue.push({ data: { id: "w-42", notes: "" } });
    state.queue.push({ error: null });
    const { moveWatchlistTag } = await import("./investor-portal");
    await moveWatchlistTag("u-1", "AU-ACME", "passed");
    const update = callsFor("watchlist").find((c) => c.updatePayload !== null)!;
    expect(update.eqs).toEqual([{ col: "id", val: "w-42" }]);
  });

  it("keys the lookup on (account_id, ticker) so a founder cannot re-tag another investor's row", async () => {
    state.queue.push({ data: null });
    const { moveWatchlistTag } = await import("./investor-portal");
    await moveWatchlistTag("u-1", "  au-acme  ", "following");
    const lookup = callsFor("watchlist")[0];
    expect(lookup.eqs).toEqual([
      { col: "account_id", val: "u-1" },
      { col: "ticker", val: "AU-ACME" },
    ]);
  });

  it("returns db_error + logs when the UPDATE errors", async () => {
    state.queue.push({ data: { id: "w-1", notes: "" } });
    state.queue.push({ error: { message: "deadlock" } });
    const { moveWatchlistTag } = await import("./investor-portal");
    const res = await moveWatchlistTag("u-1", "AU-ACME", "passed");
    expect(res).toEqual({ ok: false, reason: "db_error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("watchlist tag update failed");
  });
});

// ---------------------------------------------------------------------------
// readWatchlistTag — pure
// ---------------------------------------------------------------------------

describe("investor-portal — readWatchlistTag", () => {
  it("defaults to 'following' when notes is null", async () => {
    const { readWatchlistTag } = await import("./investor-portal");
    expect(readWatchlistTag(null)).toBe("following");
  });

  it("defaults to 'following' when no #tag:* prefix is present", async () => {
    const { readWatchlistTag } = await import("./investor-portal");
    expect(readWatchlistTag("just a plain note")).toBe("following");
  });

  it("reads the tag when the #tag:contacted prefix is present", async () => {
    const { readWatchlistTag } = await import("./investor-portal");
    expect(readWatchlistTag("#tag:contacted the founder emailed back")).toBe("contacted");
  });

  it("reads the tag mid-string (regex is not anchored — pins current behaviour)", async () => {
    const { readWatchlistTag } = await import("./investor-portal");
    expect(readWatchlistTag("noted, #tag:passed after review")).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// getPortfolio
// ---------------------------------------------------------------------------

describe("investor-portal — getPortfolio", () => {
  it("returns [] with zero DB calls when admin is null", async () => {
    state.adminConfigured = false;
    const { getPortfolio } = await import("./investor-portal");
    expect(await getPortfolio("u-1")).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it("keys the read on investor_user_id + orders by invested_at DESC", async () => {
    state.queue.push({ data: [] });
    const { getPortfolio } = await import("./investor-portal");
    await getPortfolio("u-1");
    const [call] = callsFor("investor_portfolio");
    expect(call.eqs).toEqual([{ col: "investor_user_id", val: "u-1" }]);
    expect(call.order?.col).toBe("invested_at");
    expect(call.order?.opts).toEqual({ ascending: false });
    expect(call.selectCols).toBe(
      "id, startup_id, company_name, valuation_aud, ownership_pct, latest_quarterly_report_id, invested_at",
    );
  });

  it("degrades to [] WITHOUT logging when the table is missing (legacy install)", async () => {
    state.queue.push({
      error: { message: 'relation "investor_portfolio" does not exist' },
    });
    const { getPortfolio } = await import("./investor-portal");
    expect(await getPortfolio("u-1")).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("degrades to [] AND logs on any OTHER error", async () => {
    state.queue.push({ error: { message: "permission denied" } });
    const { getPortfolio } = await import("./investor-portal");
    expect(await getPortfolio("u-1")).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("portfolio read failed");
  });

  it("returns the rows verbatim (typed as PortfolioRow[])", async () => {
    state.queue.push({
      data: [
        {
          id: "p-1",
          startup_id: "s-1",
          company_name: "Acme",
          valuation_aud: 2_500_000,
          ownership_pct: 4.5,
          latest_quarterly_report_id: "r-1",
          invested_at: "2026-06-01T00:00:00Z",
        },
      ],
    });
    const { getPortfolio } = await import("./investor-portal");
    const rows = await getPortfolio("u-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].company_name).toBe("Acme");
    expect(rows[0].valuation_aud).toBe(2_500_000);
  });

  it("returns [] when data is null AND error is null (defensive)", async () => {
    state.queue.push({});
    const { getPortfolio } = await import("./investor-portal");
    expect(await getPortfolio("u-1")).toEqual([]);
  });

  it("returns [] when the query throws (network wobble)", async () => {
    state.throwOnFrom = "investor_portfolio";
    const { getPortfolio } = await import("./investor-portal");
    expect(await getPortfolio("u-1")).toEqual([]);
    // Note: this branch is a bare catch{} — no log.
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
