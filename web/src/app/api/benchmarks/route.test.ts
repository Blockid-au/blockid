// Colocated vitest for GET /api/benchmarks — P9-benchmarks-route-test.
//
// This route powers the SVI stage-comparison widget (avg / p25 / p75 /
// topDecile per stage + optional percentile for a founder's own score). It is
// the only place that reads the anonymised svi_analyses live pool, so silent
// regressions here become bad numbers on the founder dashboard and skew every
// "you're in the top X%" nudge downstream:
//
//   - dropping the MIN_SAMPLE=5 gate would surface noisy 1–4 row percentiles
//     as "live" data and mislead founders about their position;
//   - broadening the stage validation (currently 0–7 with clamp to 5) would
//     accept negative / >7 stages silently and hand out the wrong benchmark;
//   - flipping the analysis_json.subs walk from try/skip to try/throw would
//     turn a single malformed historical row into a 500 for every founder;
//   - reordering the projection to `dimensions: {} || staticBench` would drop
//     back to static dimensions the moment a stage's live rows lack subs,
//     which is the whole reason the fallback exists.
//
// Percentile branch is asserted against known-good getSVIPercentile()
// outputs from the static benchmarks module so a rewrite of the
// interpolation curve can't quietly drift.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SVI_STAGE_BENCHMARKS,
  getSVIBenchmark,
  getSVIPercentile,
} from "@/lib/benchmarks";

// --- Mocks (registered BEFORE route import) --------------------------------

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import MUST come after mocks are registered.
import { GET, dynamic } from "./route";

// --- Fake supabase --------------------------------------------------------
// Route chains .from("svi_analyses").select(...).not(...).order(...).limit(...)
// and awaits the result — so the terminal `.limit()` returns the { data, error }
// promise. Every intermediate step is a chainable proxy that records the call.

type Row = {
  total_svi: number | null;
  analysis_json: unknown;
};

interface FakeCalls {
  from: string[];
  select: string[];
  notArgs: Array<[string, string]>;
  order: Array<[string, { ascending: boolean }]>;
  limit: number[];
}

interface FakeState {
  rows: Row[];
  error: { message: string } | null;
  calls: FakeCalls;
}

const state: FakeState = {
  rows: [],
  error: null,
  calls: { from: [], select: [], notArgs: [], order: [], limit: [] },
};

function makeChain() {
  const api: Record<string, unknown> = {};
  api.select = (cols: string) => {
    state.calls.select.push(cols);
    return api;
  };
  api.not = (col: string, op: string) => {
    state.calls.notArgs.push([col, op]);
    return api;
  };
  api.order = (col: string, opts: { ascending: boolean }) => {
    state.calls.order.push([col, opts]);
    return api;
  };
  api.limit = (n: number) => {
    state.calls.limit.push(n);
    return Promise.resolve({ data: state.rows, error: state.error });
  };
  return api;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.calls.from.push(table);
      return makeChain();
    },
  };
}

function resetState() {
  state.rows = [];
  state.error = null;
  state.calls = { from: [], select: [], notArgs: [], order: [], limit: [] };
}

beforeEach(() => {
  resetState();
  isSupabaseConfiguredMock.mockReset();
  getSupabaseAdminMock.mockReset();
  // Default: no supabase — force static path.
  isSupabaseConfiguredMock.mockReturnValue(false);
  getSupabaseAdminMock.mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/benchmarks?${qs}`);
}

async function callGet(qs: string): Promise<{ res: Response; body: Record<string, unknown> }> {
  const res = await GET(req(qs));
  const body = (await res.json()) as Record<string, unknown>;
  return { res, body };
}

// A stage-3 row producing subs that mirror the static dimension keys so we
// can assert the aggregation preserves the whitelist.
function stage3Row(sviTotal: number, subs?: Array<{ key: string; value: number }>): Row {
  return {
    total_svi: sviTotal,
    analysis_json: { stage: 3, subs: subs ?? [
      { key: "ftv", value: 60 },
      { key: "mpc", value: 65 },
      { key: "ptd", value: 55 },
      { key: "tre", value: 40 },
      { key: "cgh", value: 45 },
      { key: "iri", value: 40 },
      { key: "lco", value: 45 },
      { key: "svm", value: 40 },
    ] },
  };
}

describe("GET /api/benchmarks — validation", () => {
  it("returns 400 when stage is missing", async () => {
    const { res, body } = await callGet("");
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/stage must be an integer 0-7/);
  });

  it("returns 400 when stage is non-numeric", async () => {
    const { res, body } = await callGet("stage=abc");
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/stage must be an integer 0-7/);
  });

  it("returns 400 when stage is negative", async () => {
    const { res } = await callGet("stage=-1");
    expect(res.status).toBe(400);
  });

  it("returns 400 when stage is above 7", async () => {
    const { res } = await callGet("stage=8");
    expect(res.status).toBe(400);
  });

  it("accepts stage=0 (Idea)", async () => {
    const { res, body } = await callGet("stage=0");
    expect(res.status).toBe(200);
    expect(body.stage).toBe(0);
    expect(body.stageLabel).toBe("Idea");
  });

  it("accepts stage=5 (highest defined static stage — Revenue)", async () => {
    const { res, body } = await callGet("stage=5");
    expect(res.status).toBe(200);
    expect(body.stage).toBe(5);
    expect(body.stageLabel).toBe("Revenue");
  });

  it("accepts stage=7 (validation upper bound; clamps to the last defined benchmark)", async () => {
    // The validator allows 0–7 but SVI_STAGE_BENCHMARKS only covers 0–5, so
    // getSVIBenchmark clamps stages 6/7 to the last entry (Revenue).
    const { res, body } = await callGet("stage=7");
    expect(res.status).toBe(200);
    expect(body.stage).toBe(7); // echoed as requested
    expect(body.stageLabel).toBe("Revenue"); // clamped label
  });

  it("parses stage using base-10 (rejects hex-shaped input)", async () => {
    const { res } = await callGet("stage=0x3");
    expect(res.status).toBe(200);
    // parseInt("0x3", 10) === 0, so it's accepted as stage 0.
    // (Guards against a rewrite dropping the explicit radix and letting
    // "0x8" through as stage 8.)
    const body = (await GET(req("stage=0x8"))).status;
    expect(body).toBe(200);
  });
});

describe("GET /api/benchmarks — static fallback", () => {
  it("returns source='static' with sampleSize=0 when supabase is not configured", async () => {
    const { body } = await callGet("stage=2");
    expect(body.source).toBe("static");
    expect(body.sampleSize).toBe(0);
  });

  it("returns the static benchmark numbers unchanged for stage 2", async () => {
    const bench = getSVIBenchmark(2);
    const { body } = await callGet("stage=2");
    expect(body.avgSVI).toBe(bench.avgSVI);
    expect(body.medianSVI).toBe(bench.medianSVI);
    expect(body.p25).toBe(bench.p25);
    expect(body.p75).toBe(bench.p75);
    expect(body.topDecile).toBe(bench.topDecile);
  });

  it("returns the static dimensions map verbatim in the static fallback", async () => {
    const bench = getSVIBenchmark(4);
    const { body } = await callGet("stage=4");
    expect(body.dimensions).toEqual(bench.dimensions);
  });

  it("does not call supabase when isSupabaseConfigured() is false", async () => {
    await callGet("stage=1");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.calls.from.length).toBe(0);
  });

  it("falls back to static when supabase is configured but returns fewer than MIN_SAMPLE rows overall", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = [stage3Row(120), stage3Row(130), stage3Row(140)]; // 3 < 5
    const { body } = await callGet("stage=3");
    expect(body.source).toBe("static");
    expect(body.sampleSize).toBe(0);
  });

  it("falls back to static when the overall pool has ≥5 rows but the stage-matched slice has <5", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // 6 rows total, only 2 at stage 3 — should NOT go live.
    state.rows = [
      stage3Row(120),
      stage3Row(130),
      { total_svi: 100, analysis_json: { stage: 1 } },
      { total_svi: 110, analysis_json: { stage: 1 } },
      { total_svi: 200, analysis_json: { stage: 5 } },
      { total_svi: 210, analysis_json: { stage: 5 } },
    ];
    const { body } = await callGet("stage=3");
    expect(body.source).toBe("static");
    expect(body.sampleSize).toBe(0);
  });

  it("falls back to static when the DB call returns an error", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.error = { message: "boom" };
    state.rows = []; // rows null-ish + error present
    const { body } = await callGet("stage=2");
    expect(body.source).toBe("static");
  });
});

describe("GET /api/benchmarks — live pool", () => {
  function seed5AtStage3() {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // 5 sorted-ish rows so the percentile idx math is deterministic:
    // sorted = [110, 120, 130, 140, 150] → n=5
    // idx(50)=round(0.5*5)-1=1 → sorted[1]=120 wait no:
    //   round(2.5)-1 = 3-1 = 2 → sorted[2]=130
    // idx(25)=round(1.25)-1=0 → sorted[0]=110
    // idx(75)=round(3.75)-1=3 → sorted[3]=140
    // idx(90)=round(4.5)-1=4 → sorted[4]=150
    // avg=(110+120+130+140+150)/5=130
    state.rows = [
      stage3Row(150),
      stage3Row(110),
      stage3Row(140),
      stage3Row(120),
      stage3Row(130),
    ];
  }

  it("goes live once the stage-matched slice has ≥5 rows", async () => {
    seed5AtStage3();
    const { body } = await callGet("stage=3");
    expect(body.source).toBe("live");
    expect(body.sampleSize).toBe(5);
  });

  it("returns computed avg / median / p25 / p75 / topDecile from the live pool", async () => {
    seed5AtStage3();
    const { body } = await callGet("stage=3");
    expect(body.avgSVI).toBe(130);
    expect(body.medianSVI).toBe(130);
    expect(body.p25).toBe(110);
    expect(body.p75).toBe(140);
    expect(body.topDecile).toBe(150);
  });

  it("aggregates per-dimension averages from analysis_json.subs and preserves every seeded key", async () => {
    seed5AtStage3();
    const { body } = await callGet("stage=3");
    const dims = body.dimensions as Record<string, { avg: number; top: number }>;
    for (const key of ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"]) {
      expect(dims).toHaveProperty(key);
      expect(typeof dims[key]!.avg).toBe("number");
      expect(typeof dims[key]!.top).toBe("number");
    }
    // All 5 rows share identical subs, so the aggregated avg matches the seed.
    expect(dims.ftv!.avg).toBe(60);
    expect(dims.mpc!.avg).toBe(65);
  });

  it("filters non-stage-matching rows before computing percentiles", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = [
      stage3Row(120),
      stage3Row(120),
      stage3Row(120),
      stage3Row(120),
      stage3Row(120),
      // Stage-5 outlier — must NOT influence stage-3 stats.
      { total_svi: 500, analysis_json: { stage: 5, subs: [{ key: "ftv", value: 999 }] } },
    ];
    const { body } = await callGet("stage=3");
    expect(body.sampleSize).toBe(5);
    expect(body.avgSVI).toBe(120);
    const dims = body.dimensions as Record<string, { avg: number; top: number }>;
    expect(dims.ftv!.avg).toBe(60); // stage-5 outlier excluded
  });

  it("skips rows whose analysis_json.subs is missing (no throw, no NaN)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = [
      stage3Row(120),
      stage3Row(120),
      stage3Row(120),
      stage3Row(120),
      // 5th row has no subs at all — still stage-matched via analysis_json.stage.
      { total_svi: 120, analysis_json: { stage: 3 } },
    ];
    const { body } = await callGet("stage=3");
    expect(body.source).toBe("live");
    const dims = body.dimensions as Record<string, { avg: number; top: number }>;
    // Aggregation ran over 4 rows with subs — no NaN from the missing-subs row.
    expect(Number.isFinite(dims.ftv!.avg)).toBe(true);
  });

  it("falls back to static dimensions when NO live rows contribute subs", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = [
      { total_svi: 130, analysis_json: { stage: 3 } },
      { total_svi: 130, analysis_json: { stage: 3 } },
      { total_svi: 130, analysis_json: { stage: 3 } },
      { total_svi: 130, analysis_json: { stage: 3 } },
      { total_svi: 130, analysis_json: { stage: 3 } },
    ];
    const bench = getSVIBenchmark(3);
    const { body } = await callGet("stage=3");
    expect(body.source).toBe("live");
    expect(body.dimensions).toEqual(bench.dimensions);
  });

  it("skips rows with malformed sub entries (non-number value) without throwing", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = [
      stage3Row(120),
      stage3Row(120),
      stage3Row(120),
      stage3Row(120),
      {
        total_svi: 120,
        analysis_json: {
          stage: 3,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          subs: [{ key: "ftv", value: "not-a-number" as any }, { key: "", value: 10 }],
        },
      },
    ];
    const { res, body } = await callGet("stage=3");
    expect(res.status).toBe(200);
    expect(body.source).toBe("live");
  });

  it("computes topDecile from the sorted pool (p90 index)", async () => {
    seed5AtStage3();
    const { body } = await callGet("stage=3");
    expect(body.topDecile).toBe(150);
  });

  it("echoes the requested stage number even when the pool is live", async () => {
    seed5AtStage3();
    const { body } = await callGet("stage=3");
    expect(body.stage).toBe(3);
  });

  it("uses the static label for stage in the live response (the label is not recomputed)", async () => {
    seed5AtStage3();
    const staticLabel = getSVIBenchmark(3).label;
    const { body } = await callGet("stage=3");
    expect(body.stageLabel).toBe(staticLabel);
  });
});

describe("GET /api/benchmarks — DB call shape", () => {
  it("queries the svi_analyses table with the total_svi projection when supabase is available", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = []; // triggers fallback, but the call shape is still recorded
    await callGet("stage=2");
    expect(state.calls.from).toEqual(["svi_analyses"]);
    expect(state.calls.select).toEqual(["total_svi, analysis_json"]);
  });

  it("filters out NULL total_svi rows at the DB layer via .not('total_svi', 'is')", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    await callGet("stage=2");
    expect(state.calls.notArgs).toEqual([["total_svi", "is"]]);
  });

  it("orders by created_at DESC and caps the pull at 500 rows", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    await callGet("stage=2");
    expect(state.calls.order).toEqual([["created_at", { ascending: false }]]);
    expect(state.calls.limit).toEqual([500]);
  });
});

describe("GET /api/benchmarks — percentile query", () => {
  it("does not include a percentile field when svi is omitted (static path)", async () => {
    const { body } = await callGet("stage=2");
    expect(body).not.toHaveProperty("percentile");
  });

  it("returns a percentile field when svi is provided (static path)", async () => {
    const { body } = await callGet("stage=2&svi=110");
    expect(body).toHaveProperty("percentile");
    expect(body.percentile).toBe(getSVIPercentile(110, 2));
  });

  it("clamps svi<=0 to a low percentile in the static path (pins the 5-floor)", async () => {
    const { body } = await callGet("stage=2&svi=0");
    expect(body.percentile).toBe(5);
  });

  it("caps very-high svi to the 95 top-decile ceiling in the static path", async () => {
    // stage 2 topDecile=160; anything at/above should hit 95.
    const { body } = await callGet("stage=2&svi=999");
    expect(body.percentile).toBe(95);
  });

  it("computes percentile from the live pool when live data is available", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // Values: [100, 110, 120, 130, 140] — svi=125 → 3 below → round(3/5*100)=60
    state.rows = [
      stage3Row(100),
      stage3Row(110),
      stage3Row(120),
      stage3Row(130),
      stage3Row(140),
    ];
    const { body } = await callGet("stage=3&svi=125");
    expect(body.source).toBe("live");
    expect(body.percentile).toBe(60);
  });

  it("returns percentile=0 in the live path when svi is below every pool value", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = [
      stage3Row(100),
      stage3Row(110),
      stage3Row(120),
      stage3Row(130),
      stage3Row(140),
    ];
    // 0 rows below 100 → 0/5 = 0
    const { body } = await callGet("stage=3&svi=50");
    expect(body.percentile).toBe(0);
  });

  it("returns percentile=100 in the live path when svi exceeds every pool value", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.rows = [
      stage3Row(100),
      stage3Row(110),
      stage3Row(120),
      stage3Row(130),
      stage3Row(140),
    ];
    const { body } = await callGet("stage=3&svi=999");
    expect(body.percentile).toBe(100);
  });
});

describe("GET /api/benchmarks — export surface", () => {
  it("exports dynamic='force-dynamic' so Next never caches percentile queries", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns application/json content-type on the happy path", async () => {
    const { res } = await callGet("stage=1");
    expect((res.headers.get("Content-Type") ?? "").toLowerCase()).toContain("application/json");
  });

  it("returns application/json content-type on the 400 path", async () => {
    const { res } = await callGet("stage=99");
    expect(res.status).toBe(400);
    expect((res.headers.get("Content-Type") ?? "").toLowerCase()).toContain("application/json");
  });

  it("static-response shape matches SVI_STAGE_BENCHMARKS for every defined stage", async () => {
    // Regression net: if a rewrite renamed avgSVI → averageSvi (or similar) the
    // dashboard would silently render blanks — pin the keys for every stage.
    for (const bench of SVI_STAGE_BENCHMARKS) {
      const { body } = await callGet(`stage=${bench.stage}`);
      expect(body.stage).toBe(bench.stage);
      expect(body.stageLabel).toBe(bench.label);
      expect(body.avgSVI).toBe(bench.avgSVI);
      expect(body.medianSVI).toBe(bench.medianSVI);
      expect(body.p25).toBe(bench.p25);
      expect(body.p75).toBe(bench.p75);
      expect(body.topDecile).toBe(bench.topDecile);
    }
  });
});
