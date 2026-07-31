import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only Knowledge Base client
// (`web/src/lib/kb-client.ts`) — pins the KB read/write surface that
// C-Level agents call to persist methodologies, insights, and research
// notes. A silent regression here (e.g. dropping the version increment
// on kbWrite, dropping the sanitisation of `%,()` from kbSearch, or
// silently failing to bump `updated_at`) would corrupt the agent-owned
// KB the platform relies on for methodology reuse.
//
// Uses a lightweight thenable fake Supabase (chain returns `this` and
// is itself thenable so `await chain` resolves without a terminal call).
// Every table operation captures its arguments into `state.captured` so
// the tests can assert both the call shape and the payload.

// ---------------------------------------------------------------------------
// Fake Supabase
// ---------------------------------------------------------------------------

interface Captured {
  from: string | null;
  selectCols: string | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
  upsertPayload: Record<string, unknown> | null;
  upsertOpts: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orCalls: string[];
  orderCalls: Array<{ col: string; opts?: { ascending?: boolean } }>;
  limitCalls: number[];
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  configured: boolean;
  data: unknown;
  error: unknown;
  captured: Captured;
}

function freshCaptured(): Captured {
  return {
    from: null,
    selectCols: null,
    insertPayload: null,
    updatePayload: null,
    upsertPayload: null,
    upsertOpts: null,
    eqCalls: [],
    orCalls: [],
    orderCalls: [],
    limitCalls: [],
    terminal: null,
  };
}

const state: FakeState = {
  configured: true,
  data: null,
  error: null,
  captured: freshCaptured(),
};

function makeChain() {
  const resolve = () => ({ data: state.data, error: state.error });
  const chain: Record<string, unknown> = {};

  chain.select = (cols?: string) => {
    state.captured.selectCols = cols ?? null;
    return chain;
  };
  chain.insert = (payload: Record<string, unknown>) => {
    state.captured.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    state.captured.updatePayload = payload;
    return chain;
  };
  chain.upsert = (payload: Record<string, unknown>, opts?: Record<string, unknown>) => {
    state.captured.upsertPayload = payload;
    state.captured.upsertOpts = opts ?? null;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    state.captured.eqCalls.push({ col, val });
    return chain;
  };
  chain.or = (expr: string) => {
    state.captured.orCalls.push(expr);
    return chain;
  };
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    state.captured.orderCalls.push({ col, opts });
    return chain;
  };
  chain.limit = (n: number) => {
    state.captured.limitCalls.push(n);
    return chain;
  };
  chain.single = () => {
    state.captured.terminal = "single";
    return Promise.resolve(resolve());
  };
  chain.maybeSingle = () => {
    state.captured.terminal = "maybeSingle";
    return Promise.resolve(resolve());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    state.captured.terminal = state.captured.terminal ?? "await";
    return Promise.resolve(resolve()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => state.configured,
  getSupabaseAdmin: () => {
    if (!state.configured) return null;
    return {
      from: (table: string) => {
        state.captured.from = table;
        return makeChain();
      },
    };
  },
}));

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

beforeEach(() => {
  state.configured = true;
  state.data = null;
  state.error = null;
  state.captured = freshCaptured();
  warnSpy.mockClear();
});

// ---------------------------------------------------------------------------
// kbSearch
// ---------------------------------------------------------------------------

describe("kb-client — kbSearch", () => {
  it("returns [] when supabase is not configured", async () => {
    const { kbSearch } = await import("./kb-client");
    state.configured = false;
    const rows = await kbSearch("hello");
    expect(rows).toEqual([]);
    expect(state.captured.from).toBeNull();
  });

  it("returns [] on a whitespace-only query without hitting supabase", async () => {
    const { kbSearch } = await import("./kb-client");
    const rows = await kbSearch("   ");
    expect(rows).toEqual([]);
    expect(state.captured.from).toBeNull();
  });

  it("targets kb_articles + orders by updated_at DESC + honours a default limit of 25", async () => {
    const { kbSearch } = await import("./kb-client");
    state.data = [];
    await kbSearch("valuation");
    expect(state.captured.from).toBe("kb_articles");
    expect(state.captured.selectCols).toBe("*");
    expect(state.captured.orderCalls).toContainEqual({
      col: "updated_at",
      opts: { ascending: false },
    });
    expect(state.captured.limitCalls).toEqual([25]);
  });

  it("honours a custom limit", async () => {
    const { kbSearch } = await import("./kb-client");
    state.data = [];
    await kbSearch("valuation", 7);
    expect(state.captured.limitCalls).toEqual([7]);
  });

  it("sanitises %,() from the query so a founder cannot break the ilike expression", async () => {
    const { kbSearch } = await import("./kb-client");
    state.data = [];
    await kbSearch("50% (revenue), safe");
    // The single .or() expression is present and pins the exact shape —
    // % from the query is stripped, ( and ) are stripped, and the comma
    // inside the query is stripped too so it can't accidentally split
    // the .or() expression's comma-separated clauses.
    const expr = state.captured.orCalls[0];
    expect(expr).toBeDefined();
    expect(expr).toBe(
      "title.ilike.%50   revenue   safe%,content.ilike.%50   revenue   safe%,category.ilike.%50   revenue   safe%",
    );
    // Parentheses from the founder-supplied query never appear in the
    // resulting expression.
    expect(expr).not.toMatch(/[()]/);
    // The only % chars in the expression are the six ilike wrappers
    // (2 per column × 3 columns) — the query's own % has been stripped.
    expect((expr!.match(/%/g) || []).length).toBe(6);
  });

  it("returns [] and logs a warning on error, without throwing", async () => {
    const { kbSearch } = await import("./kb-client");
    state.error = { message: "boom" };
    const rows = await kbSearch("valuation");
    expect(rows).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns [] when supabase yields neither data nor error", async () => {
    const { kbSearch } = await import("./kb-client");
    state.data = null;
    state.error = null;
    const rows = await kbSearch("valuation");
    expect(rows).toEqual([]);
  });

  it("passes rows through verbatim when the query succeeds", async () => {
    const { kbSearch } = await import("./kb-client");
    const row = { id: "a1", slug: "s", title: "T", category: "svi", content: "" };
    state.data = [row];
    const rows = await kbSearch("t");
    expect(rows).toEqual([row]);
  });
});

// ---------------------------------------------------------------------------
// kbGet
// ---------------------------------------------------------------------------

describe("kb-client — kbGet", () => {
  it("returns null when supabase is not configured", async () => {
    const { kbGet } = await import("./kb-client");
    state.configured = false;
    const row = await kbGet("slug-1");
    expect(row).toBeNull();
    expect(state.captured.from).toBeNull();
  });

  it("targets kb_articles, filters by slug, and uses maybeSingle", async () => {
    const { kbGet } = await import("./kb-client");
    state.data = null;
    await kbGet("slug-1");
    expect(state.captured.from).toBe("kb_articles");
    expect(state.captured.eqCalls).toContainEqual({ col: "slug", val: "slug-1" });
    expect(state.captured.terminal).toBe("maybeSingle");
  });

  it("returns null and warns on error", async () => {
    const { kbGet } = await import("./kb-client");
    state.error = { message: "nope" };
    const row = await kbGet("slug-1");
    expect(row).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns null when maybeSingle resolves to null data (row-not-found)", async () => {
    const { kbGet } = await import("./kb-client");
    state.data = null;
    const row = await kbGet("missing");
    expect(row).toBeNull();
  });

  it("returns the row verbatim on a hit", async () => {
    const { kbGet } = await import("./kb-client");
    const row = { id: "a1", slug: "s", title: "T", category: "svi", version: 3 };
    state.data = row;
    const got = await kbGet("s");
    expect(got).toEqual(row);
  });
});

// ---------------------------------------------------------------------------
// kbList
// ---------------------------------------------------------------------------

describe("kb-client — kbList", () => {
  it("returns [] when supabase is not configured", async () => {
    const { kbList } = await import("./kb-client");
    state.configured = false;
    const rows = await kbList();
    expect(rows).toEqual([]);
  });

  it("targets kb_articles, orders by updated_at DESC, default limit 200", async () => {
    const { kbList } = await import("./kb-client");
    state.data = [];
    await kbList();
    expect(state.captured.from).toBe("kb_articles");
    expect(state.captured.orderCalls).toContainEqual({
      col: "updated_at",
      opts: { ascending: false },
    });
    expect(state.captured.limitCalls).toEqual([200]);
    // No category filter by default.
    expect(state.captured.eqCalls).toEqual([]);
  });

  it("adds an .eq('category', …) filter when a category is supplied", async () => {
    const { kbList } = await import("./kb-client");
    state.data = [];
    await kbList("legal");
    expect(state.captured.eqCalls).toContainEqual({ col: "category", val: "legal" });
  });

  it("honours a custom limit", async () => {
    const { kbList } = await import("./kb-client");
    state.data = [];
    await kbList(undefined, 5);
    expect(state.captured.limitCalls).toEqual([5]);
  });

  it("returns [] and warns on error", async () => {
    const { kbList } = await import("./kb-client");
    state.error = { message: "fail" };
    const rows = await kbList();
    expect(rows).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns [] when data is null and no error", async () => {
    const { kbList } = await import("./kb-client");
    state.data = null;
    const rows = await kbList();
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// kbWrite
// ---------------------------------------------------------------------------

describe("kb-client — kbWrite (insert branch)", () => {
  it("returns null when supabase is not configured", async () => {
    const { kbWrite } = await import("./kb-client");
    state.configured = false;
    const row = await kbWrite({
      slug: "s",
      title: "T",
      category: "svi",
      content: "c",
    });
    expect(row).toBeNull();
  });

  it("inserts with defaults when the slug is new (kbGet returns null → insert branch)", async () => {
    const { kbWrite } = await import("./kb-client");
    // Both the .maybeSingle() call inside kbGet AND the terminal .single()
    // on the insert-select resolve against the same `state.data`. Using a
    // mock that returns a real row satisfies both — but kbGet reads it as
    // the existing row and takes the UPDATE branch. To force the INSERT
    // branch we must have kbGet return null (state.data = null), then the
    // subsequent insert().select().single() also resolves against
    // state.data. To differentiate, we drive kbGet null-first and re-set
    // state.data before the insert resolves.
    //
    // Simpler: the state resolver is called lazily inside the terminal, and
    // each promise resolves synchronously in the microtask queue. So we
    // start with state.data=null for the kbGet lookup, then flip it to a
    // row for the insert path — this works because kbWrite awaits kbGet
    // FIRST before invoking supabase.from(...).insert().
    state.data = null;
    const inserted = {
      id: "new-1",
      slug: "s",
      title: "T",
      category: "svi",
      content: "c",
      metadata: {},
      author: "system",
      version: 1,
      is_public: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    // Queue the flip: the kbGet .maybeSingle terminal reads state.data = null,
    // then we swap state.data to the inserted row before the next terminal
    // (the .single() on insert-select) reads it.
    let call = 0;
    const originalDataDescriptor = { value: state.data, ok: true };
    Object.defineProperty(state, "data", {
      configurable: true,
      get() {
        return call++ === 0 ? null : inserted;
      },
      set(_v: unknown) {
        // ignore — the tests below re-drive state.data via re-assignment.
        originalDataDescriptor.value = _v;
      },
    });

    const row = await kbWrite({
      slug: "s",
      title: "T",
      category: "svi",
      content: "c",
    });

    expect(row).toEqual(inserted);
    // The captured insertPayload has the defaults applied.
    expect(state.captured.insertPayload).toEqual({
      slug: "s",
      title: "T",
      category: "svi",
      content: "c",
      metadata: {},
      author: "system",
      is_public: false,
    });

    // Restore state.data to a plain writable field for the next tests.
    Object.defineProperty(state, "data", {
      configurable: true,
      writable: true,
      value: null,
    });
  });

  it("returns null and warns on insert error", async () => {
    const { kbWrite } = await import("./kb-client");
    // kbGet path returns null (no existing row), insert path errors.
    let call = 0;
    Object.defineProperty(state, "data", {
      configurable: true,
      get() {
        return call++ === 0 ? null : null;
      },
      set() {},
    });
    state.error = null;
    // Only the insert-terminal should surface the error. We use a call-
    // counter to error only on the 2nd resolve (the insert path).
    let errCall = 0;
    Object.defineProperty(state, "error", {
      configurable: true,
      get() {
        return errCall++ === 0 ? null : { message: "insert boom" };
      },
      set() {},
    });

    const row = await kbWrite({
      slug: "s",
      title: "T",
      category: "svi",
      content: "c",
    });
    expect(row).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    // Restore.
    Object.defineProperty(state, "data", {
      configurable: true,
      writable: true,
      value: null,
    });
    Object.defineProperty(state, "error", {
      configurable: true,
      writable: true,
      value: null,
    });
  });

  it("honours explicit metadata, author, is_public overrides on the insert path", async () => {
    const { kbWrite } = await import("./kb-client");
    let call = 0;
    Object.defineProperty(state, "data", {
      configurable: true,
      get() {
        return call++ === 0 ? null : { id: "x" };
      },
      set() {},
    });
    await kbWrite({
      slug: "s",
      title: "T",
      category: "market",
      content: "c",
      metadata: { origin: "cfo" },
      author: "cfo",
      is_public: true,
    });
    expect(state.captured.insertPayload).toEqual({
      slug: "s",
      title: "T",
      category: "market",
      content: "c",
      metadata: { origin: "cfo" },
      author: "cfo",
      is_public: true,
    });

    Object.defineProperty(state, "data", {
      configurable: true,
      writable: true,
      value: null,
    });
  });
});

describe("kb-client — kbWrite (update branch)", () => {
  it("increments version and bumps updated_at to a fresh ISO string", async () => {
    const { kbWrite } = await import("./kb-client");
    const existing = {
      id: "row-1",
      slug: "s",
      title: "OldT",
      category: "svi",
      content: "old",
      metadata: { keep: 1 },
      author: "prev",
      is_public: false,
      version: 4,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-06-01T00:00:00Z",
    };
    let call = 0;
    Object.defineProperty(state, "data", {
      configurable: true,
      get() {
        // First terminal (kbGet.maybeSingle) → existing.
        // Second terminal (update.select.single) → the updated row.
        if (call++ === 0) return existing;
        return { ...existing, title: "NewT", version: 5 };
      },
      set() {},
    });

    const before = Date.now();
    const row = await kbWrite({
      slug: "s",
      title: "NewT",
      category: "svi",
      content: "c",
    });
    const after = Date.now();

    expect(row).not.toBeNull();
    expect(row?.title).toBe("NewT");
    expect(row?.version).toBe(5);

    // The update payload carries version = existing.version + 1 and a fresh
    // ISO timestamp bounded by [before, after]. It preserves metadata /
    // author / is_public from `existing` when the input omits them.
    const payload = state.captured.updatePayload;
    expect(payload).toBeTruthy();
    expect(payload?.version).toBe(5);
    expect(payload?.metadata).toEqual({ keep: 1 });
    expect(payload?.author).toBe("prev");
    expect(payload?.is_public).toBe(false);
    const stamped = Date.parse(payload?.updated_at as string);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);

    // Update path filters by the existing row's id.
    expect(state.captured.eqCalls).toContainEqual({ col: "id", val: "row-1" });

    Object.defineProperty(state, "data", {
      configurable: true,
      writable: true,
      value: null,
    });
  });

  it("returns null and warns on update error", async () => {
    const { kbWrite } = await import("./kb-client");
    const existing = { id: "r", slug: "s", title: "T", category: "svi", content: "c", metadata: {}, author: "a", is_public: false, version: 1 };
    let call = 0;
    Object.defineProperty(state, "data", {
      configurable: true,
      get() {
        return call++ === 0 ? existing : null;
      },
      set() {},
    });
    let errCall = 0;
    Object.defineProperty(state, "error", {
      configurable: true,
      get() {
        return errCall++ === 0 ? null : { message: "update boom" };
      },
      set() {},
    });

    const row = await kbWrite({
      slug: "s",
      title: "T",
      category: "svi",
      content: "c",
    });
    expect(row).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    Object.defineProperty(state, "data", {
      configurable: true,
      writable: true,
      value: null,
    });
    Object.defineProperty(state, "error", {
      configurable: true,
      writable: true,
      value: null,
    });
  });

  it("honours override metadata / author / is_public over the existing row on the update path", async () => {
    const { kbWrite } = await import("./kb-client");
    const existing = { id: "r", slug: "s", title: "T", category: "svi", content: "c", metadata: { old: 1 }, author: "prev", is_public: false, version: 2 };
    let call = 0;
    Object.defineProperty(state, "data", {
      configurable: true,
      get() {
        return call++ === 0 ? existing : { ...existing, version: 3 };
      },
      set() {},
    });
    await kbWrite({
      slug: "s",
      title: "T",
      category: "svi",
      content: "c",
      metadata: { fresh: 1 },
      author: "cto",
      is_public: true,
    });
    const payload = state.captured.updatePayload;
    expect(payload?.metadata).toEqual({ fresh: 1 });
    expect(payload?.author).toBe("cto");
    expect(payload?.is_public).toBe(true);
    expect(payload?.version).toBe(3);

    Object.defineProperty(state, "data", {
      configurable: true,
      writable: true,
      value: null,
    });
  });
});

// ---------------------------------------------------------------------------
// kbLogResearch
// ---------------------------------------------------------------------------

describe("kb-client — kbLogResearch", () => {
  it("is a no-op when supabase is not configured", async () => {
    const { kbLogResearch } = await import("./kb-client");
    state.configured = false;
    await kbLogResearch({ agent: "cfo", topic: "t", findings: "f" });
    expect(state.captured.from).toBeNull();
  });

  it("targets kb_research_notes and passes the note through with optional fields", async () => {
    const { kbLogResearch } = await import("./kb-client");
    await kbLogResearch({
      agent: "cfo",
      topic: "SaaS multiples",
      findings: "Median 8x",
      confidence: 0.7,
      applied_to: "valuation",
      source_url: "https://example.com",
    });
    expect(state.captured.from).toBe("kb_research_notes");
    expect(state.captured.insertPayload).toEqual({
      agent: "cfo",
      topic: "SaaS multiples",
      findings: "Median 8x",
      confidence: 0.7,
      applied_to: "valuation",
      source_url: "https://example.com",
    });
  });

  it("passes undefined for absent optional fields (never invents values)", async () => {
    const { kbLogResearch } = await import("./kb-client");
    await kbLogResearch({ agent: "cfo", topic: "t", findings: "f" });
    expect(state.captured.insertPayload).toEqual({
      agent: "cfo",
      topic: "t",
      findings: "f",
      confidence: undefined,
      applied_to: undefined,
      source_url: undefined,
    });
  });

  it("swallows insert errors and logs a warning (fire-and-forget)", async () => {
    const { kbLogResearch } = await import("./kb-client");
    state.error = { message: "boom" };
    await expect(
      kbLogResearch({ agent: "cfo", topic: "t", findings: "f" }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// kbListMethodologies
// ---------------------------------------------------------------------------

describe("kb-client — kbListMethodologies", () => {
  it("returns [] when supabase is not configured", async () => {
    const { kbListMethodologies } = await import("./kb-client");
    state.configured = false;
    const rows = await kbListMethodologies();
    expect(rows).toEqual([]);
  });

  it("targets kb_methodologies, orders by name, no filter by default", async () => {
    const { kbListMethodologies } = await import("./kb-client");
    state.data = [];
    await kbListMethodologies();
    expect(state.captured.from).toBe("kb_methodologies");
    expect(state.captured.orderCalls).toContainEqual({ col: "name", opts: undefined });
    expect(state.captured.eqCalls).toEqual([]);
  });

  it("adds an .eq('type', …) filter when a type is supplied", async () => {
    const { kbListMethodologies } = await import("./kb-client");
    state.data = [];
    await kbListMethodologies("valuation_method");
    expect(state.captured.eqCalls).toContainEqual({
      col: "type",
      val: "valuation_method",
    });
  });

  it("returns [] and warns on error", async () => {
    const { kbListMethodologies } = await import("./kb-client");
    state.error = { message: "fail" };
    const rows = await kbListMethodologies();
    expect(rows).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns rows verbatim on a hit", async () => {
    const { kbListMethodologies } = await import("./kb-client");
    const rows = [{ id: "m1", name: "Berkus", type: "valuation_method" }];
    state.data = rows;
    const got = await kbListMethodologies();
    expect(got).toEqual(rows);
  });
});

// ---------------------------------------------------------------------------
// kbWriteMethodology
// ---------------------------------------------------------------------------

describe("kb-client — kbWriteMethodology", () => {
  it("returns null when supabase is not configured", async () => {
    const { kbWriteMethodology } = await import("./kb-client");
    state.configured = false;
    const row = await kbWriteMethodology({
      name: "Berkus",
      type: "valuation_method",
      description: "d",
    });
    expect(row).toBeNull();
  });

  it("upserts with onConflict:'name' and stamps a fresh updated_at", async () => {
    const { kbWriteMethodology } = await import("./kb-client");
    state.data = { id: "m1", name: "Berkus" };
    const before = Date.now();
    await kbWriteMethodology({
      name: "Berkus",
      type: "valuation_method",
      description: "5-factor pre-revenue valuation",
    });
    const after = Date.now();

    expect(state.captured.from).toBe("kb_methodologies");
    expect(state.captured.upsertOpts).toEqual({ onConflict: "name" });

    const payload = state.captured.upsertPayload!;
    expect(payload.name).toBe("Berkus");
    expect(payload.type).toBe("valuation_method");
    expect(payload.description).toBe("5-factor pre-revenue valuation");
    // Defaults on omitted optional fields.
    expect(payload.inputs).toEqual([]);
    expect(payload.formula).toBeNull();
    expect(payload.formula_code).toBeNull();
    expect(payload.examples).toEqual([]);
    expect(payload.refs).toEqual([]);
    expect(payload.created_by).toBe("cfo");

    const stamped = Date.parse(payload.updated_at as string);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("honours all explicit overrides on the upsert payload", async () => {
    const { kbWriteMethodology } = await import("./kb-client");
    state.data = { id: "m1" };
    const inputs = [{ name: "x", type: "number", description: "d", required: true }];
    const examples = [{ input: 1, output: 2, notes: "ok" }];
    const refs = [{ source: "SEC", url: "https://sec.gov", date: "2015" }];
    await kbWriteMethodology({
      name: "Scorecard",
      type: "valuation_method",
      description: "Region + team + market...",
      inputs,
      formula: "value = base * mult",
      formula_code: "return base * mult;",
      examples,
      refs,
      created_by: "cto",
    });
    const payload = state.captured.upsertPayload!;
    expect(payload.inputs).toBe(inputs);
    expect(payload.formula).toBe("value = base * mult");
    expect(payload.formula_code).toBe("return base * mult;");
    expect(payload.examples).toBe(examples);
    expect(payload.refs).toBe(refs);
    expect(payload.created_by).toBe("cto");
  });

  it("returns null and warns on upsert error", async () => {
    const { kbWriteMethodology } = await import("./kb-client");
    state.error = { message: "upsert boom" };
    const row = await kbWriteMethodology({
      name: "Berkus",
      type: "valuation_method",
      description: "d",
    });
    expect(row).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns the upserted row on success", async () => {
    const { kbWriteMethodology } = await import("./kb-client");
    const row = { id: "m1", name: "Berkus", type: "valuation_method" };
    state.data = row;
    const got = await kbWriteMethodology({
      name: "Berkus",
      type: "valuation_method",
      description: "d",
    });
    expect(got).toEqual(row);
  });
});
