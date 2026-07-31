import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only SVI-index snapshot populator
// (`web/src/lib/svi-index-populator.ts`), the shared write-side used by
// both `web/scripts/backfill-svi-index-snapshots.mjs` and
// `/api/cron/svi-index-populate`. Pins:
//
//   * extractSnapshotFromAnalysis — the pure, PII-safe projection of
//     `svi_analyses.analysis_json` into the columns we persist on
//     `svi_index_snapshots`. Covers the defensive branches (non-record
//     inputs, missing/null/NaN/Infinity values, stringy numbers), the
//     sector precedence (`analysis.sector` string wins, else combined
//     inputSummary text is run through `detectSector`), the stage
//     precedence (caller wins, else `analysis.stage` normalised via
//     `pickStage` to an integer in [0..7]), and the runway/burn
//     preference (`dimensions.financials.{runway_months,burn_rate}`
//     first, then camelCase, then root, with runway rounded and burn
//     preserved as-is).
//
//   * populateBatch — the batched writer. Only its top-level guards
//     are exercised without setting up a full PostgREST chain fake:
//     `isSupabaseConfigured()=false` and `getSupabaseAdmin()=null`
//     both short-circuit to `{scanned:0, inserted:0, lastId:sinceAnalysisId}`
//     with no DB call. The `projects` module is stubbed so nothing
//     accidentally reaches the network.

vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => state.supabaseConfigured,
  getSupabaseAdmin: () => (state.adminNull ? null : state.adminClient),
}));

vi.mock("./projects", () => ({
  findOrCreateSVIAccount: vi.fn(async () => "acct_stub"),
}));

interface FakeState {
  supabaseConfigured: boolean;
  adminNull: boolean;
  adminClient: unknown;
}

const state: FakeState = {
  supabaseConfigured: false,
  adminNull: true,
  adminClient: null,
};

beforeEach(() => {
  state.supabaseConfigured = false;
  state.adminNull = true;
  state.adminClient = null;
});

// ─────────────────────────────────────────────────────────────────────
// extractSnapshotFromAnalysis — non-record / defensive branches
// ─────────────────────────────────────────────────────────────────────

describe("svi-index-populator — extractSnapshotFromAnalysis defensive shape", () => {
  it("null analysis → svi=0, sector/runway/burn null, stage=caller (null)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(null, null);
    expect(out).toEqual({
      svi: 0,
      sector: null,
      stage: null,
      runway_months: null,
      burn_rate: null,
    });
  });

  it("undefined analysis → svi=0, everything null, caller stage passed through", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(undefined, 3);
    expect(out.svi).toBe(0);
    expect(out.stage).toBe(3);
    expect(out.sector).toBeNull();
    expect(out.runway_months).toBeNull();
    expect(out.burn_rate).toBeNull();
  });

  it("string analysis (isRecord=false) → identical to null", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis("garbage", null)).toEqual({
      svi: 0,
      sector: null,
      stage: null,
      runway_months: null,
      burn_rate: null,
    });
  });

  it("array analysis (typeof object) is not a record → all defaults", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    // Arrays are `typeof "object"` and non-null, but `isRecord` treats them
    // as objects too — nevertheless, none of the probed keys (totalSVI,
    // sector, dimensions, etc.) exist on the array, so we still degrade.
    const out = extractSnapshotFromAnalysis([], null);
    expect(out.svi).toBe(0);
    expect(out.sector).toBeNull();
    expect(out.stage).toBeNull();
    expect(out.runway_months).toBeNull();
    expect(out.burn_rate).toBeNull();
  });

  it("number analysis → all defaults", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis(42, null).svi).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// extractSnapshotFromAnalysis — SVI (totalSVI) picking
// ─────────────────────────────────────────────────────────────────────

describe("svi-index-populator — SVI extraction (totalSVI)", () => {
  it("numeric totalSVI is preserved verbatim", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ totalSVI: 73.2 }, null).svi).toBe(73.2);
  });

  it("string totalSVI is coerced via Number()", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ totalSVI: " 55 " }, null).svi).toBe(55);
  });

  it("missing totalSVI degrades to 0 (never null on the output)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({}, null).svi).toBe(0);
  });

  it("NaN totalSVI is rejected → 0 fallback", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ totalSVI: Number.NaN }, null).svi).toBe(0);
  });

  it("Infinity totalSVI is rejected → 0 fallback", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(
      extractSnapshotFromAnalysis({ totalSVI: Number.POSITIVE_INFINITY }, null)
        .svi,
    ).toBe(0);
  });

  it("non-numeric string totalSVI → 0 fallback", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(
      extractSnapshotFromAnalysis({ totalSVI: "not-a-number" }, null).svi,
    ).toBe(0);
  });

  it("negative totalSVI is preserved (no clamping in the pure extractor)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ totalSVI: -10 }, null).svi).toBe(-10);
  });
});

// ─────────────────────────────────────────────────────────────────────
// extractSnapshotFromAnalysis — sector precedence
// ─────────────────────────────────────────────────────────────────────

describe("svi-index-populator — sector precedence", () => {
  it("explicit analysis.sector string wins over inputSummary detection", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      {
        sector: "saas",
        inputSummary: { snippet: "healthtech clinical hospital" },
      },
      null,
    );
    expect(out.sector).toBe("saas");
  });

  it("blank analysis.sector string is discarded → falls back to inputSummary", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      {
        sector: "   ",
        inputSummary: { snippet: "fintech neobank AFSL" },
      },
      null,
    );
    expect(out.sector).toBe("fintech");
  });

  it("inputSummary.snippet alone is enough to trigger detectSector", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      { inputSummary: { snippet: "we run an ecommerce store on shopify" } },
      null,
    );
    expect(out.sector).toBe("ecommerce");
  });

  it("inputSummary.scrapedTitle + scrapedDescription combined feed detectSector", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      {
        inputSummary: {
          scrapedTitle: "EdTech tutoring",
          scrapedDescription: "curriculum platform for schools",
        },
      },
      null,
    );
    expect(out.sector).toBe("edtech");
  });

  it("inputSummary present but no matchable text → sector null (no crash)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      { inputSummary: { snippet: "purely generic descriptive words" } },
      null,
    );
    expect(out.sector).toBeNull();
  });

  it("no sector + no inputSummary → sector null", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ totalSVI: 10 }, null).sector).toBeNull();
  });

  it("non-record inputSummary is ignored (does not throw)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      { inputSummary: "not an object" },
      null,
    );
    expect(out.sector).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// extractSnapshotFromAnalysis — stage precedence
// ─────────────────────────────────────────────────────────────────────

describe("svi-index-populator — stage precedence", () => {
  it("caller stage wins over analysis.stage", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(
      extractSnapshotFromAnalysis({ stage: 7 }, 2).stage,
    ).toBe(2);
  });

  it("caller null falls back to analysis.stage (numeric)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ stage: 4 }, null).stage).toBe(4);
  });

  it("analysis.stage as string number is accepted", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ stage: "5" }, null).stage).toBe(5);
  });

  it("fractional analysis.stage is rounded to nearest integer", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ stage: 3.6 }, null).stage).toBe(4);
  });

  it("analysis.stage below 0 is rejected → null", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ stage: -1 }, null).stage).toBeNull();
  });

  it("analysis.stage above 7 is rejected → null", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ stage: 8 }, null).stage).toBeNull();
  });

  it("caller stage 0 (falsy but valid) is preserved, not treated as null", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ stage: 5 }, 0).stage).toBe(0);
  });

  it("both null → stage null", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({}, null).stage).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// extractSnapshotFromAnalysis — runway / burn precedence
// ─────────────────────────────────────────────────────────────────────

describe("svi-index-populator — runway_months + burn_rate", () => {
  it("dimensions.financials.runway_months (snake) is preferred over camelCase", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      {
        dimensions: {
          financials: { runway_months: 9, runwayMonths: 99 },
        },
      },
      null,
    );
    expect(out.runway_months).toBe(9);
  });

  it("falls back to dimensions.financials.runwayMonths (camel) when snake missing", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      { dimensions: { financials: { runwayMonths: 14 } } },
      null,
    );
    expect(out.runway_months).toBe(14);
  });

  it("falls back to root analysis.runway_months when dimensions has no runway", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis({ runway_months: 6 }, null);
    expect(out.runway_months).toBe(6);
  });

  it("falls back to root analysis.runwayMonths (camel) at root as well", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis({ runwayMonths: 11 }, null);
    expect(out.runway_months).toBe(11);
  });

  it("runway_months output is Math.round-ed (fractional input)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      { dimensions: { financials: { runway_months: 6.4 } } },
      null,
    );
    expect(out.runway_months).toBe(6);
    const out2 = extractSnapshotFromAnalysis(
      { dimensions: { financials: { runway_months: 6.6 } } },
      null,
    );
    expect(out2.runway_months).toBe(7);
  });

  it("dimensions.financials.burn_rate (snake) is preferred over camelCase", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      {
        dimensions: {
          financials: { burn_rate: 15000, burnRate: 99999 },
        },
      },
      null,
    );
    expect(out.burn_rate).toBe(15000);
  });

  it("burn_rate is NOT rounded (preserves fractional AUD)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      { dimensions: { financials: { burn_rate: 12345.67 } } },
      null,
    );
    expect(out.burn_rate).toBe(12345.67);
  });

  it("falls back to root analysis.burn_rate / burnRate when dimensions missing", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    expect(extractSnapshotFromAnalysis({ burn_rate: 8000 }, null).burn_rate).toBe(8000);
    expect(extractSnapshotFromAnalysis({ burnRate: "9500" }, null).burn_rate).toBe(9500);
  });

  it("no runway or burn signals → both null", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis({ totalSVI: 60 }, null);
    expect(out.runway_months).toBeNull();
    expect(out.burn_rate).toBeNull();
  });

  it("non-record dimensions / financials are ignored (no crash)", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const out = extractSnapshotFromAnalysis(
      { dimensions: "oops", runway_months: 3 },
      null,
    );
    expect(out.runway_months).toBe(3); // root fallback still applies
    const out2 = extractSnapshotFromAnalysis(
      { dimensions: { financials: "nope" }, burnRate: 500 },
      null,
    );
    expect(out2.burn_rate).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────
// extractSnapshotFromAnalysis — realistic composite shape
// ─────────────────────────────────────────────────────────────────────

describe("svi-index-populator — realistic composite shape", () => {
  it("full analysis blob projects a complete snapshot with caller stage winning", async () => {
    const { extractSnapshotFromAnalysis } = await import(
      "./svi-index-populator"
    );
    const analysis = {
      totalSVI: 68,
      sector: "saas",
      stage: 7, // caller wins → not this
      dimensions: {
        financials: { runway_months: 12.4, burn_rate: 22000 },
      },
      inputSummary: { snippet: "irrelevant — sector already set" },
    };
    expect(extractSnapshotFromAnalysis(analysis, 3)).toEqual({
      svi: 68,
      sector: "saas",
      stage: 3,
      runway_months: 12,
      burn_rate: 22000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// populateBatch — top-level guards (no DB set-up required)
// ─────────────────────────────────────────────────────────────────────

describe("svi-index-populator — populateBatch guards", () => {
  it("isSupabaseConfigured()=false → {scanned:0, inserted:0, lastId echoed}", async () => {
    state.supabaseConfigured = false;
    state.adminNull = false; // even if admin is available, config false wins
    const { populateBatch } = await import("./svi-index-populator");
    const res = await populateBatch("last-cursor-id", 25);
    expect(res).toEqual({ scanned: 0, inserted: 0, lastId: "last-cursor-id" });
  });

  it("isSupabaseConfigured()=false + null cursor → lastId null echoed", async () => {
    state.supabaseConfigured = false;
    const { populateBatch } = await import("./svi-index-populator");
    const res = await populateBatch(null, 25);
    expect(res).toEqual({ scanned: 0, inserted: 0, lastId: null });
  });

  it("admin client null → same short-circuit shape", async () => {
    state.supabaseConfigured = true;
    state.adminNull = true;
    const { populateBatch } = await import("./svi-index-populator");
    const res = await populateBatch("cursor-x", 10);
    expect(res).toEqual({ scanned: 0, inserted: 0, lastId: "cursor-x" });
  });

  it("query error path → {scanned:0, inserted:0, lastId echoed} (no rows processed)", async () => {
    state.supabaseConfigured = true;
    state.adminNull = false;
    // Minimal chain that resolves the initial cursor lookup then errors on
    // the paginated select. `sinceAnalysisId=null` means the cursor lookup
    // is skipped entirely, so only the paginated select needs scripting.
    state.adminClient = {
      from: () => ({
        select: () => ({
          order: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({ data: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    };
    const { populateBatch } = await import("./svi-index-populator");
    const res = await populateBatch(null, 5);
    expect(res).toEqual({ scanned: 0, inserted: 0, lastId: null });
  });

  it("query returns [] → {scanned:0, inserted:0, lastId echoed}", async () => {
    state.supabaseConfigured = true;
    state.adminNull = false;
    state.adminClient = {
      from: () => ({
        select: () => ({
          order: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    };
    const { populateBatch } = await import("./svi-index-populator");
    const res = await populateBatch(null, 5);
    expect(res).toEqual({ scanned: 0, inserted: 0, lastId: null });
  });
});
