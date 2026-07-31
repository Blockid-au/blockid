import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

// Colocated vitest for the previously-untested `startup-index-listings.ts` —
// the "Markets" view aggregator that powers the anonymous-by-default SVI
// listings table + per-ticker detail. Regressions here are user-facing:
//   (a) tickerOf drift silently reshuffles every founder's public identifier;
//   (b) hashEmail drift silently changes every `identityHash` at once;
//   (c) losing the `publicVisible` gate on publicName leaks a private
//       founder's name into the anonymous listings feed;
//   (d) stage/valuation clamps rot and a bad analysis_json crashes the page;
//   (e) sparkline day-bucketing loses the forward-fill and the chart
//       collapses to zero on days with no data.
//
// The fake Supabase mirrors the chain shapes this module walks:
//   .from("svi_analyses").select().gte().order().limit()   ← computeListings
//                                                            + computeListingDetail fallback
//                                                            (all awaited)
//   .from("founder_profiles").select()                     ← computeListings
//                                                            (awaited)
//   .from("svi_accounts").select()                         ← computeListings
//                                                            (awaited)
//   .from("svi_analyses").select().eq().maybeSingle()      ← computeListingDetail
//                                                            latest row lookup
//   .from("svi_analyses").select().eq().order()            ← computeListingDetail
//                                                            history lookup
//   .from("founder_profiles").select().eq().maybeSingle()  ← buildDetailFromRow
//                                                            (fallback path only)

interface FakeResponse {
  data?: unknown;
  error?: unknown;
}

interface CapturedCall {
  table: string;
  selectCols: string | null;
  eqs: Array<{ col: string; val: unknown }>;
  gtes: Array<{ col: string; val: unknown }>;
  order: { col: string; opts: Record<string, unknown> | null } | null;
  limit: number | null;
  terminal: "maybeSingle" | "await" | null;
}

interface FakeState {
  adminNull: boolean;
  queue: FakeResponse[];
  calls: CapturedCall[];
}

const state: FakeState = {
  adminNull: false,
  queue: [],
  calls: [],
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
  chain.gte = (col: string, val: unknown) => {
    op.gtes.push({ col, val });
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqs.push({ col, val });
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

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (state.adminNull) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

function expectedHash(email: string): string {
  return createHash("sha256")
    .update(`bsi-au:${email.toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 12);
}

beforeEach(() => {
  vi.resetModules();
  state.adminNull = false;
  state.queue = [];
  state.calls = [];
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper — build a plausible svi_analyses row
function analysis(over: Partial<{
  id: string;
  email: string;
  total_svi: number | null;
  created_at: string;
  sector: string;
  stage: number;
  hasRevenue: boolean;
  valuationMidAud: number;
}>): {
  id: string;
  email: string;
  total_svi: number | null;
  created_at: string;
  analysis_json: Record<string, unknown> | null;
} {
  const analysisJson: Record<string, unknown> = {};
  if (over.sector !== undefined) analysisJson.sector = over.sector;
  if (over.stage !== undefined) analysisJson.stage = over.stage;
  if (over.hasRevenue !== undefined) analysisJson.signals = { hasRevenue: over.hasRevenue };
  if (over.valuationMidAud !== undefined) {
    analysisJson.deepValuation = { blendedValuation: { midAud: over.valuationMidAud } };
  }
  return {
    id: over.id ?? "an_default",
    email: over.email ?? "founder@example.com",
    // Use `in` guard so explicit `total_svi: null` overrides survive the default
    total_svi: "total_svi" in over ? (over.total_svi as number | null) : 60,
    created_at: over.created_at ?? new Date().toISOString(),
    analysis_json: Object.keys(analysisJson).length > 0 ? analysisJson : null,
  };
}

// ---------------------------------------------------------------------------
// computeListings — guards + shape
// ---------------------------------------------------------------------------

describe("startup-index-listings — computeListings guards", () => {
  it("returns an empty envelope with generatedAt when supabase admin is null", async () => {
    state.adminNull = true;
    const { computeListings } = await import("./startup-index-listings");
    const result = await computeListings({});
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.totalPages).toBe(0);
    expect(typeof result.generatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("null-admin honours caller-supplied page + pageSize in the empty envelope", async () => {
    state.adminNull = true;
    const { computeListings } = await import("./startup-index-listings");
    const result = await computeListings({ page: 3, pageSize: 25 });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(25);
  });

  it("page clamped to a minimum of 1 (Math.max(1, page))", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [{ data: [] }, { data: [] }, { data: [] }];
    const result = await computeListings({ page: 0 });
    expect(result.page).toBe(1);
  });

  it("pageSize clamped to a minimum of 10 (Math.max(10,…))", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [{ data: [] }, { data: [] }, { data: [] }];
    const result = await computeListings({ pageSize: 3 });
    expect(result.pageSize).toBe(10);
  });

  it("pageSize clamped to a maximum of 100 (Math.min(100,…))", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [{ data: [] }, { data: [] }, { data: [] }];
    const result = await computeListings({ pageSize: 500 });
    expect(result.pageSize).toBe(100);
  });

  it("hits svi_analyses first with a 90-day since window, DESC created_at, limit 5000", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [{ data: [] }, { data: [] }, { data: [] }];
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    await computeListings({});
    const analysesCalls = callsFor("svi_analyses");
    expect(analysesCalls).toHaveLength(1);
    const c = analysesCalls[0];
    expect(c.selectCols).toContain("id");
    expect(c.selectCols).toContain("email");
    expect(c.selectCols).toContain("analysis_json");
    expect(c.gtes).toHaveLength(1);
    expect(c.gtes[0].col).toBe("created_at");
    const sinceMs = Date.parse(c.gtes[0].val as string);
    expect(now - sinceMs).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(now - sinceMs).toBeLessThan(91 * 24 * 60 * 60 * 1000);
    expect(c.order).toEqual({ col: "created_at", opts: { ascending: false } });
    expect(c.limit).toBe(5000);
  });

  it("loads founder_profiles and svi_accounts once each", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [{ data: [] }, { data: [] }, { data: [] }];
    await computeListings({});
    expect(callsFor("founder_profiles")).toHaveLength(1);
    expect(callsFor("svi_accounts")).toHaveLength(1);
  });

  it("handles null data from every table without throwing", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [{ data: null }, { data: null }, { data: null }];
    const result = await computeListings({});
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1); // Math.max(1, Math.ceil(0/pageSize))
  });

  it("skips analyses with a missing email", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "" as string, id: "an_1" }), analysis({ email: "a@x", id: "an_2" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].slug).toBe("an_2");
  });

  it("skips groups whose latest analysis has null total_svi", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_null", total_svi: null })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeListings — row shape (ticker, identityHash, labels, clamps)
// ---------------------------------------------------------------------------

describe("startup-index-listings — row shape", () => {
  it("identityHash is sha256(bsi-au:<lowercased-trimmed-email>) truncated to 12 hex", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "  Founder@Example.COM  ", id: "an_1" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].identityHash).toBe(expectedHash("Founder@Example.COM"));
    expect(result.rows[0].identityHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("ticker is <SECTOR-4 uppercased>-<slug-tail-3 uppercased>", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_abcxyz", sector: "fintech" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].ticker).toBe("FINT-XYZ");
  });

  it("ticker falls back to DEFA prefix when analysis_json omits sector", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_abcxyz" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].ticker).toBe("DEFA-XYZ");
    expect(result.rows[0].sector).toBe("default");
    expect(result.rows[0].sectorLabel).toBe("Other");
  });

  it("known sector maps to its human label (saas → SaaS)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1", sector: "saas" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].sectorLabel).toBe("SaaS");
  });

  it("unknown sector falls through to the 'default' label 'Other'", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1", sector: "quantum" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].sectorLabel).toBe("Other");
    expect(result.rows[0].sector).toBe("quantum");
  });

  it("stage is clamped to [0..7] and stageLabel comes from STAGE_LABEL", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_1", stage: 99 }),
          analysis({ email: "b@x", id: "an_2", stage: -5 }),
          analysis({ email: "c@x", id: "an_3", stage: 4 }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({ sort: "stage", order: "asc" });
    const stages = result.rows.map((r) => r.stage);
    expect(stages).toEqual([0, 4, 7]);
    const byId = new Map(result.rows.map((r) => [r.slug, r.stageLabel]));
    expect(byId.get("an_1")).toBe("Mature");
    expect(byId.get("an_2")).toBe("Concept");
    expect(byId.get("an_3")).toBe("Revenue");
  });

  it("stage defaults to 0 when analysis_json omits stage or supplies a non-number", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].stage).toBe(0);
    expect(result.rows[0].stageLabel).toBe("Concept");
  });

  it("valuation is clamped to [0..2_000_000_000]", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_hi", valuationMidAud: 5_000_000_000 }),
          analysis({ email: "b@x", id: "an_lo", valuationMidAud: -500 }),
          analysis({ email: "c@x", id: "an_ok", valuationMidAud: 1_234_000 }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({ sort: "valuation", order: "asc" });
    expect(result.rows.map((r) => r.valuationAud)).toEqual([0, 1_234_000, 2_000_000_000]);
  });

  it("valuation defaults to 0 when deepValuation is missing", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1" })] },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].valuationAud).toBe(0);
  });

  it("hasRevenue is Boolean-coerced from signals.hasRevenue", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_t", hasRevenue: true }),
          analysis({ email: "b@x", id: "an_f", hasRevenue: false }),
          analysis({ email: "c@x", id: "an_u" }), // omitted → false
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    const byId = new Map(result.rows.map((r) => [r.slug, r.hasRevenue]));
    expect(byId.get("an_t")).toBe(true);
    expect(byId.get("an_f")).toBe(false);
    expect(byId.get("an_u")).toBe(false);
  });

  it("analysesCount reflects the full group history, not the paginated slice", async () => {
    const { computeListings } = await import("./startup-index-listings");
    const now = new Date("2026-07-31T00:00:00Z").getTime();
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_new", created_at: new Date(now).toISOString() }),
          analysis({ email: "a@x", id: "an_mid", created_at: new Date(now - 3 * 86400_000).toISOString() }),
          analysis({ email: "a@x", id: "an_old", created_at: new Date(now - 20 * 86400_000).toISOString() }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].analysesCount).toBe(3);
    expect(result.rows[0].slug).toBe("an_new"); // latest wins for slug/latest fields
  });
});

// ---------------------------------------------------------------------------
// computeListings — sparkline + deltaWeek
// ---------------------------------------------------------------------------

describe("startup-index-listings — sparkline + deltaWeek", () => {
  it("deltaWeek = latest.total_svi - priorWeek.total_svi (fallback 0 when no prior)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    const now = new Date("2026-07-31T00:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_new", total_svi: 70, created_at: new Date(now).toISOString() }),
          analysis({ email: "a@x", id: "an_old", total_svi: 45, created_at: new Date(now - 10 * 86400_000).toISOString() }),
          analysis({ email: "b@x", id: "an_solo", total_svi: 55, created_at: new Date(now).toISOString() }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    const byId = new Map(result.rows.map((r) => [r.slug, r]));
    expect(byId.get("an_new")!.deltaWeek).toBe(25); // 70 - 45
    expect(byId.get("an_solo")!.deltaWeek).toBe(0); // no priorWeek
  });

  it("sparkline is a 7-slot array populated from the group history", async () => {
    const { computeListings } = await import("./startup-index-listings");
    // Pin now to midnight UTC so `today = new Date(); today.setUTCHours(0,0,0,0)`
    // stays equal to now and day-offset math is exact-integer.
    const now = new Date("2026-07-31T00:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_d0", total_svi: 70, created_at: new Date(now).toISOString() }),
          analysis({ email: "a@x", id: "an_d3", total_svi: 60, created_at: new Date(now - 3 * 86400_000).toISOString() }),
          analysis({ email: "a@x", id: "an_d6", total_svi: 50, created_at: new Date(now - 6 * 86400_000).toISOString() }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    const spark = result.rows[0].sparkline;
    expect(spark).toHaveLength(7);
    expect(spark[6]).toBe(70); // today (offset 0 → idx 6)
    expect(spark[3]).toBe(60); // 3 days ago → idx 3
    expect(spark[0]).toBe(50); // 6 days ago → idx 0
  });

  it("sparkline forward-fills empty days with the previous day's value", async () => {
    const { computeListings } = await import("./startup-index-listings");
    const now = new Date("2026-07-31T00:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_d0", total_svi: 70, created_at: new Date(now).toISOString() }),
          analysis({ email: "a@x", id: "an_d6", total_svi: 50, created_at: new Date(now - 6 * 86400_000).toISOString() }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    const spark = result.rows[0].sparkline;
    // idx 0 = 50 (day -6 recorded); idx 1..5 forward-filled from 50; idx 6 = 70
    expect(spark).toEqual([50, 50, 50, 50, 50, 50, 70]);
  });

  it("sparkline collapses same-day rows via average (Math.round(sum/n))", async () => {
    const { computeListings } = await import("./startup-index-listings");
    const now = new Date("2026-07-31T00:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_d0a", total_svi: 60, created_at: new Date(now).toISOString() }),
          // Within the same 24h bucket as `now` (module's dayOffset math is
          // floor((today - ts) / 24h) so `today - 6h` still lands at idx 6)
          analysis({ email: "a@x", id: "an_d0b", total_svi: 80, created_at: new Date(now - 6 * 3600_000).toISOString() }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].sparkline[6]).toBe(70); // (60+80)/2
  });
});

// ---------------------------------------------------------------------------
// computeListings — public name / privacy
// ---------------------------------------------------------------------------

describe("startup-index-listings — public name gate", () => {
  it("publicName is null when the founder has not opted in (publicVisible=false)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1" })] },
      { data: [{ email: "a@x", full_name: "Real Name", public_visible: false }] },
      { data: [{ email: "a@x", startup_name: "Startup Corp" }] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].publicName).toBeNull();
    expect(result.rows[0].publicVisible).toBe(false);
  });

  it("publicName resolves to profile.full_name when publicVisible=true", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1" })] },
      { data: [{ email: "a@x", full_name: "Real Name", public_visible: true }] },
      { data: [{ email: "a@x", startup_name: "Startup Corp" }] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].publicName).toBe("Real Name");
    expect(result.rows[0].publicVisible).toBe(true);
  });

  it("publicName falls back to svi_accounts.startup_name when full_name is null and publicVisible=true", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1" })] },
      { data: [{ email: "a@x", full_name: null, public_visible: true }] },
      { data: [{ email: "a@x", startup_name: "Fallback Co" }] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].publicName).toBe("Fallback Co");
  });

  it("publicName is null when opted-in but neither full_name nor startup_name exist", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "a@x", id: "an_1" })] },
      { data: [{ email: "a@x", full_name: null, public_visible: true }] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].publicName).toBeNull();
    expect(result.rows[0].publicVisible).toBe(true);
  });

  it("profile/account lookup is case-insensitive on the caller email", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      { data: [analysis({ email: "  Founder@Example.COM  ", id: "an_1" })] },
      { data: [{ email: "founder@example.com", full_name: "Alice", public_visible: true }] },
      { data: [] },
    ];
    const result = await computeListings({});
    expect(result.rows[0].publicName).toBe("Alice");
  });
});

// ---------------------------------------------------------------------------
// computeListings — filters
// ---------------------------------------------------------------------------

describe("startup-index-listings — filters", () => {
  function threeRows() {
    return {
      data: [
        analysis({ email: "a@x", id: "an_saas_rev", sector: "saas", stage: 4, hasRevenue: true, total_svi: 60 }),
        analysis({ email: "b@x", id: "an_fin_prev", sector: "fintech", stage: 2, hasRevenue: false, total_svi: 55 }),
        analysis({ email: "c@x", id: "an_saas_pre", sector: "saas", stage: 1, hasRevenue: false, total_svi: 45 }),
      ],
    };
  }

  it("filter.sector='all' or omitted keeps every row", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [threeRows(), { data: [] }, { data: [] }];
    const r1 = await computeListings({});
    expect(r1.rows).toHaveLength(3);

    state.calls = [];
    state.queue = [threeRows(), { data: [] }, { data: [] }];
    const r2 = await computeListings({ filter: { sector: "all" } });
    expect(r2.rows).toHaveLength(3);
  });

  it("filter.sector='saas' keeps only saas rows", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [threeRows(), { data: [] }, { data: [] }];
    const r = await computeListings({ filter: { sector: "saas" } });
    expect(r.rows.map((x) => x.slug).sort()).toEqual(["an_saas_pre", "an_saas_rev"]);
  });

  it("filter.stage=4 keeps only stage-4 rows", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [threeRows(), { data: [] }, { data: [] }];
    const r = await computeListings({ filter: { stage: 4 } });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].slug).toBe("an_saas_rev");
  });

  it("filter.stage='all' does not narrow", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [threeRows(), { data: [] }, { data: [] }];
    const r = await computeListings({ filter: { stage: "all" } });
    expect(r.rows).toHaveLength(3);
  });

  it("filter.publicOnly excludes rows that did not opt in", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [
      threeRows(),
      { data: [{ email: "a@x", full_name: "Alice", public_visible: true }] },
      { data: [] },
    ];
    const r = await computeListings({ filter: { publicOnly: true } });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].slug).toBe("an_saas_rev");
    expect(r.rows[0].publicName).toBe("Alice");
  });

  it("filter.revenueOnly excludes hasRevenue=false rows", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [threeRows(), { data: [] }, { data: [] }];
    const r = await computeListings({ filter: { revenueOnly: true } });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].slug).toBe("an_saas_rev");
  });

  it("filters compose (sector + stage + revenueOnly)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [threeRows(), { data: [] }, { data: [] }];
    const r = await computeListings({
      filter: { sector: "saas", stage: 4, revenueOnly: true },
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].slug).toBe("an_saas_rev");
  });
});

// ---------------------------------------------------------------------------
// computeListings — sort + pagination
// ---------------------------------------------------------------------------

describe("startup-index-listings — sort + pagination", () => {
  function fiveRows() {
    return {
      data: [
        analysis({ email: "e1@x", id: "an_e1", total_svi: 10, stage: 1, valuationMidAud: 50_000 }),
        analysis({ email: "e2@x", id: "an_e2", total_svi: 40, stage: 2, valuationMidAud: 500_000 }),
        analysis({ email: "e3@x", id: "an_e3", total_svi: 90, stage: 6, valuationMidAud: 5_000_000 }),
        analysis({ email: "e4@x", id: "an_e4", total_svi: 20, stage: 3, valuationMidAud: 200_000 }),
        analysis({ email: "e5@x", id: "an_e5", total_svi: 70, stage: 5, valuationMidAud: 1_000_000 }),
      ],
    };
  }

  it("default sort is svi desc (highest SVI first)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [fiveRows(), { data: [] }, { data: [] }];
    const r = await computeListings({});
    expect(r.rows.map((x) => x.svi)).toEqual([90, 70, 40, 20, 10]);
  });

  it("sort=svi order=asc reverses direction", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [fiveRows(), { data: [] }, { data: [] }];
    const r = await computeListings({ sort: "svi", order: "asc" });
    expect(r.rows.map((x) => x.svi)).toEqual([10, 20, 40, 70, 90]);
  });

  it("sort=valuation desc orders by valuationAud", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [fiveRows(), { data: [] }, { data: [] }];
    const r = await computeListings({ sort: "valuation" });
    expect(r.rows.map((x) => x.valuationAud)).toEqual([
      5_000_000,
      1_000_000,
      500_000,
      200_000,
      50_000,
    ]);
  });

  it("sort=stage asc orders by numeric stage", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [fiveRows(), { data: [] }, { data: [] }];
    const r = await computeListings({ sort: "stage", order: "asc" });
    expect(r.rows.map((x) => x.stage)).toEqual([1, 2, 3, 5, 6]);
  });

  it("sort=recent desc orders by lastAnalysisAt (newest first)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    const now = Date.now();
    state.queue = [
      {
        data: [
          analysis({ email: "a@x", id: "an_old", created_at: new Date(now - 10 * 86400_000).toISOString() }),
          analysis({ email: "b@x", id: "an_new", created_at: new Date(now).toISOString() }),
          analysis({ email: "c@x", id: "an_mid", created_at: new Date(now - 3 * 86400_000).toISOString() }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const r = await computeListings({ sort: "recent" });
    expect(r.rows.map((x) => x.slug)).toEqual(["an_new", "an_mid", "an_old"]);
  });

  it("sort=delta orders by deltaWeek (no prior → 0)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    state.queue = [
      {
        data: [
          analysis({ email: "up@x", id: "an_up", total_svi: 80, created_at: new Date(now).toISOString() }),
          analysis({ email: "up@x", id: "an_up_old", total_svi: 60, created_at: new Date(now - 10 * 86400_000).toISOString() }),
          analysis({ email: "dn@x", id: "an_dn", total_svi: 40, created_at: new Date(now).toISOString() }),
          analysis({ email: "dn@x", id: "an_dn_old", total_svi: 55, created_at: new Date(now - 10 * 86400_000).toISOString() }),
        ],
      },
      { data: [] },
      { data: [] },
    ];
    const r = await computeListings({ sort: "delta" });
    expect(r.rows[0].slug).toBe("an_up"); // +20 highest
    expect(r.rows[1].slug).toBe("an_dn"); // -15 lowest
    expect(r.rows[0].deltaWeek).toBe(20);
    expect(r.rows[1].deltaWeek).toBe(-15);
  });

  it("pagination slices deterministically (page 2 of pageSize 10 → offset 10)", async () => {
    const { computeListings } = await import("./startup-index-listings");
    const rows = Array.from({ length: 25 }, (_, i) =>
      analysis({ email: `e${i}@x`, id: `an_${i}`, total_svi: 100 - i }),
    );
    state.queue = [{ data: rows }, { data: [] }, { data: [] }];
    const r = await computeListings({ page: 2, pageSize: 10 });
    expect(r.total).toBe(25);
    expect(r.pageSize).toBe(10);
    expect(r.totalPages).toBe(3); // ceil(25/10)
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0].slug).toBe("an_10"); // 11th-highest (0-indexed row 10)
  });

  it("totalPages is at least 1 even when total is 0", async () => {
    const { computeListings } = await import("./startup-index-listings");
    state.queue = [{ data: [] }, { data: [] }, { data: [] }];
    const r = await computeListings({ pageSize: 50 });
    expect(r.totalPages).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeListingDetail — fast-path (ticker matches computeListings result)
// ---------------------------------------------------------------------------

describe("startup-index-listings — computeListingDetail", () => {
  it("returns null when supabase admin is null", async () => {
    state.adminNull = true;
    const { computeListingDetail } = await import("./startup-index-listings");
    const r = await computeListingDetail("SAAS-XYZ");
    expect(r).toBeNull();
  });

  it("returns the enriched detail on a matching ticker (fast path)", async () => {
    const { computeListingDetail } = await import("./startup-index-listings");
    const row = analysis({
      email: "a@x",
      id: "an_abcxyz",
      sector: "saas",
      stage: 3,
      total_svi: 65,
      valuationMidAud: 750_000,
    });
    // Attach richer analysis_json so the detail branches fire
    (row.analysis_json as Record<string, unknown>).antlerSignals = {
      signals: [{ key: "team", label: "Team", score: 82 }],
    };
    (row.analysis_json as Record<string, unknown>).acceleratorReadiness = {
      overallPct: 42,
      highLeverageGaps: [
        { entry: { criterion: "Traction", source_name: "YC Rubric" } },
        { entry: { criterion: "MRR", source_name: "500 Global" } },
        { entry: { criterion: "TAM", source_name: "Techstars" } },
        { entry: { criterion: "IP", source_name: "Startmate" } },
      ],
    };
    (row.analysis_json as Record<string, unknown>).deepValuation = {
      blendedValuation: { midAud: 750_000 },
      perspectives: [
        { label: "Investor", lowAud: 500_000, midAud: 750_000, highAud: 1_200_000, weight: 0.4 },
      ],
    };
    (row.analysis_json as Record<string, unknown>).inputSummary = { projectName: "MyCo" };

    state.queue = [
      { data: [row] }, // computeListings svi_analyses
      { data: [{ email: "a@x", full_name: "Alice", public_visible: true }] },
      { data: [{ email: "a@x", startup_name: "MyCo" }] },
      { data: row }, // .eq(id).maybeSingle() latestRow
      {
        data: [
          { id: "an_hist1", created_at: "2026-07-01T00:00:00Z", total_svi: 50 },
          { id: "an_abcxyz", created_at: row.created_at, total_svi: 65 },
        ],
      }, // .eq(email).order() history
    ];
    const r = await computeListingDetail("SAAS-XYZ");
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("SAAS-XYZ");
    expect(r!.slug).toBe("an_abcxyz");
    expect(r!.sector).toBe("saas");
    expect(r!.sectorLabel).toBe("SaaS");
    expect(r!.stage).toBe(3);
    expect(r!.stageLabel).toBe("Traction");
    expect(r!.svi).toBe(65);
    expect(r!.valuationAud).toBe(750_000);
    expect(r!.publicName).toBe("Alice");
    expect(r!.publicVisible).toBe(true);
    expect(r!.antlerSignals).toEqual([{ key: "team", label: "Team", score: 82 }]);
    expect(r!.acceleratorReadiness).not.toBeNull();
    expect(r!.acceleratorReadiness!.overallPct).toBe(42);
    // Only top 3 gaps surface
    expect(r!.acceleratorReadiness!.topGaps).toHaveLength(3);
    expect(r!.acceleratorReadiness!.topGaps[0]).toEqual({ criterion: "Traction", source: "YC Rubric" });
    expect(r!.perspectives).toHaveLength(1);
    expect(r!.perspectives![0].label).toBe("Investor");
    expect(r!.inputSummaryProjectName).toBe("MyCo");
    expect(r!.sviHistory).toEqual([
      { date: "2026-07-01", svi: 50 },
      { date: row.created_at.slice(0, 10), svi: 65 },
    ]);
    expect(r!.analysesCount).toBe(2);
  });

  it("ticker match is case-insensitive on both sides", async () => {
    const { computeListingDetail } = await import("./startup-index-listings");
    const row = analysis({ email: "a@x", id: "an_ABCxyz", sector: "saas" });
    state.queue = [
      { data: [row] },
      { data: [] },
      { data: [] },
      { data: row },
      { data: [] },
    ];
    const r = await computeListingDetail("saas-xyz"); // lowercase caller
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("SAAS-XYZ");
  });

  it("fallback path fires when the initial 100-row listings sweep misses the ticker", async () => {
    const { computeListingDetail } = await import("./startup-index-listings");
    // First computeListings call returns rows that don't include our target
    const decoy = analysis({ email: "d@x", id: "an_decoy001", sector: "fintech" });
    const target = analysis({ email: "t@x", id: "an_targxyz", sector: "saas" });
    state.queue = [
      { data: [decoy] }, // listings svi_analyses
      { data: [] }, // founder_profiles
      { data: [] }, // svi_accounts
      // Fallback sweep of svi_analyses runs next (broader pull)
      { data: [decoy, target] },
      // buildDetailFromRow then queries founder_profiles.eq().maybeSingle()
      { data: { public_visible: false, full_name: null } },
    ];
    const r = await computeListingDetail("SAAS-XYZ");
    expect(r).not.toBeNull();
    expect(r!.slug).toBe("an_targxyz");
    expect(r!.publicName).toBeNull(); // opted out
    expect(r!.publicVisible).toBe(false);
  });

  it("fallback path returns null when the broader sweep also misses the ticker", async () => {
    const { computeListingDetail } = await import("./startup-index-listings");
    const decoy = analysis({ email: "d@x", id: "an_decoy", sector: "fintech" });
    state.queue = [
      { data: [decoy] },
      { data: [] },
      { data: [] },
      { data: [decoy] }, // broader sweep still misses
    ];
    const r = await computeListingDetail("SAAS-ZZZ");
    expect(r).toBeNull();
  });

  it("fast-path returns null when maybeSingle yields no latestRow", async () => {
    const { computeListingDetail } = await import("./startup-index-listings");
    const row = analysis({ email: "a@x", id: "an_abcxyz", sector: "saas" });
    state.queue = [
      { data: [row] },
      { data: [] },
      { data: [] },
      { data: null }, // maybeSingle → not found (row deleted between calls)
    ];
    const r = await computeListingDetail("SAAS-XYZ");
    expect(r).toBeNull();
  });

  it("acceleratorReadiness/antlerSignals/perspectives are null when analysis_json omits them", async () => {
    const { computeListingDetail } = await import("./startup-index-listings");
    const row = analysis({ email: "a@x", id: "an_abcxyz", sector: "saas" });
    state.queue = [
      { data: [row] },
      { data: [] },
      { data: [] },
      { data: row },
      { data: [] },
    ];
    const r = await computeListingDetail("SAAS-XYZ");
    expect(r).not.toBeNull();
    expect(r!.antlerSignals).toBeNull();
    expect(r!.acceleratorReadiness).toBeNull();
    expect(r!.perspectives).toBeNull();
    expect(r!.inputSummaryProjectName).toBeNull();
    expect(r!.sviHistory).toEqual([]);
    expect(r!.analysesCount).toBe(0);
  });

  it("fast-path detail history query is scoped by email + ordered ascending", async () => {
    const { computeListingDetail } = await import("./startup-index-listings");
    const row = analysis({ email: "a@x", id: "an_abcxyz", sector: "saas" });
    state.queue = [
      { data: [row] },
      { data: [] },
      { data: [] },
      { data: row },
      { data: [] },
    ];
    await computeListingDetail("SAAS-XYZ");
    const analysesCalls = callsFor("svi_analyses");
    // Third + fourth svi_analyses call are the detail lookups
    const latestCall = analysesCalls[1];
    expect(latestCall.eqs).toEqual([{ col: "id", val: "an_abcxyz" }]);
    expect(latestCall.terminal).toBe("maybeSingle");
    const historyCall = analysesCalls[2];
    expect(historyCall.eqs).toEqual([{ col: "email", val: "a@x" }]);
    expect(historyCall.order).toEqual({ col: "created_at", opts: { ascending: true } });
  });
});
