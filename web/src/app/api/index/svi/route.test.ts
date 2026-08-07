// Colocated vitest for GET /api/index/svi — P9-index-svi-route-test.
//
// This route is the public, anonymised aggregates endpoint on top of the SVI
// Index snapshots (svi_index_snapshots). It powers the /dataset marketing
// surface and the "download the raw data" story that backs the
// "S&P 500 for Australian startups" positioning. Silent regressions this pins:
//   - flipping `export const dynamic` off "force-dynamic" so a stale prerender
//     misprices the aggregates after the nightly SVI index populator lands.
//   - dropping `export const revalidate = 300` so the CDN loses its 5-minute
//     TTL contract with the /dataset SSR page.
//   - dropping the "Cache-Control: public, max-age=300, stale-while-revalidate=600"
//     header so partner integrations that hit the JSON endpoint thrash the
//     Supabase scan (each miss pulls up to 50k rows out of the last 540 days).
//   - dropping the VALID_BUCKETS 400 guard so a bogus `?bucket=all` request
//     lands in the "overall" catch-all branch and returns wrong aggregates.
//   - dropping the VALID_FORMATS 400 guard so a bogus `?format=parquet` request
//     silently falls back to JSON instead of failing loud.
//   - the CSV branch losing its explicit header list so a zero-row market
//     returns a 0-byte CSV that breaks every parser (the toCsv helper is
//     tested elsewhere; here we pin the route wires the explicit headers).
//   - dropping the try/catch envelope so an unhandled Supabase throw lands as
//     a 500 with no disclaimer — the AFSL-adjacent 'general information' block
//     is required on EVERY response body, error or not.
//   - the disclaimer copy drifting off the "not investment advice / no AFSL"
//     language — the AU financial-services boundary requires this exact
//     framing when we ship market-like aggregates.
//   - a CSV filename change without a corresponding /dataset copy update.
//   - default bucket flipping off "overall" — the /dataset landing hits the
//     bare `/api/index/svi` URL and expects the overall summary card.
//   - default format flipping off JSON — same reason.
//
// The test mocks the aggregator (which itself needs Supabase) so it stays a
// pure route contract test — the aggregator's own logic is exercised by its
// colocated svi-index-aggregates.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  OverallRow,
  SectorRow,
  StageRow,
} from "@/lib/svi-index-aggregates";

// --- Mocks ------------------------------------------------------------------

const getOverallAggregatesMock = vi.fn<() => Promise<OverallRow>>();
const getSectorAggregatesMock = vi.fn<() => Promise<SectorRow[]>>();
const getStageAggregatesMock = vi.fn<() => Promise<StageRow[]>>();
const toCsvMock =
  vi.fn<
    (
      rows: Array<Record<string, string | number>>,
      explicitHeaders?: string[],
    ) => string
  >();

vi.mock("@/lib/svi-index-aggregates", () => ({
  getOverallAggregates: () => getOverallAggregatesMock(),
  getSectorAggregates: () => getSectorAggregatesMock(),
  getStageAggregates: () => getStageAggregatesMock(),
  toCsv: (
    rows: Array<Record<string, string | number>>,
    explicitHeaders?: string[],
  ) => toCsvMock(rows, explicitHeaders),
}));

// Route import must come AFTER the mocks are registered.
import { GET, dynamic, revalidate } from "./route";

// --- Helpers ----------------------------------------------------------------

function fixtureOverall(overrides: Partial<OverallRow> = {}): OverallRow {
  return {
    count: 138,
    medianSvi: 105,
    mean: 104.5,
    p10: 82.1,
    p25: 92.4,
    p50: 105,
    p75: 118.6,
    p90: 129.9,
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function fixtureSectorRows(): SectorRow[] {
  return [
    { sector: "saas", count: 42, medianSvi: 108, p25: 95.4, p75: 121.3, medianStage: 3 },
    { sector: "fintech", count: 21, medianSvi: 101, p25: 89.2, p75: 115.7, medianStage: 2 },
  ];
}

function fixtureStageRows(): StageRow[] {
  return [
    { stage: 0, count: 30, medianSvi: 95, p25: 82.4, p75: 110.5 },
    { stage: 4, count: 12, medianSvi: 118, p25: 108.1, p75: 128.7 },
  ];
}

function makeRequest(qs: string): Request {
  return new Request(`https://blockid.au/api/index/svi${qs}`);
}

async function callGet(qs: string): Promise<{
  status: number;
  headers: Headers;
  text: string;
}> {
  const res = await GET(makeRequest(qs));
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

async function callGetJson(qs: string): Promise<{
  status: number;
  headers: Headers;
  body: Record<string, unknown>;
}> {
  const { status, headers, text } = await callGet(qs);
  return { status, headers, body: JSON.parse(text) as Record<string, unknown> };
}

const EXPECTED_DISCLAIMER =
  "General information only. Aggregated from anonymised SVI snapshots. Not investment, financial, or legal advice. Blockid.au and Auschain Pty Ltd (ACN 659 615 111) do not hold an Australian Financial Services Licence.";
const EXPECTED_CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=600";

// --- Setup ------------------------------------------------------------------

beforeEach(() => {
  getOverallAggregatesMock.mockReset();
  getSectorAggregatesMock.mockReset();
  getStageAggregatesMock.mockReset();
  toCsvMock.mockReset();
  getOverallAggregatesMock.mockResolvedValue(fixtureOverall());
  getSectorAggregatesMock.mockResolvedValue(fixtureSectorRows());
  getStageAggregatesMock.mockResolvedValue(fixtureStageRows());
  // toCsv is exercised by its own colocated test; here we just want a
  // predictable return value so we can assert the route wires args correctly.
  toCsvMock.mockImplementation((_rows, _headers) => "CSV-FIXTURE\r\n");
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── module invariants ───────────────────────────────────────────────────

describe("module invariants", () => {
  it("dynamic is force-dynamic (aggregates rely on the nightly svi-index-populator cron; a stale prerender would misprice the /dataset surface)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("revalidate is exactly 300 seconds (matches the Cache-Control TTL so edge caches and Next's ISR stay in lockstep)", () => {
    expect(revalidate).toBe(300);
  });
});

// ─── validation guards ───────────────────────────────────────────────────

describe("validation guards", () => {
  it("rejects unknown bucket with 400 + allowed list (bogus ?bucket=all must fail loud, not silently fall through to overall)", async () => {
    const { status, body } = await callGetJson("?bucket=all");
    expect(status).toBe(400);
    expect(body.error).toBe("invalid bucket");
    expect(body.allowed).toEqual(["overall", "sector", "stage"]);
  });

  it("rejects unknown format with 400 + allowed list (bogus ?format=parquet must fail loud, not silently fall through to json)", async () => {
    const { status, body } = await callGetJson("?format=parquet");
    expect(status).toBe(400);
    expect(body.error).toBe("invalid format");
    expect(body.allowed).toEqual(["json", "csv"]);
  });

  it("bucket param is case-insensitive (?bucket=OVERALL lowercased → still valid, keeps partner integrations forgiving)", async () => {
    const { status } = await callGet("?bucket=OVERALL");
    expect(status).toBe(200);
    expect(getOverallAggregatesMock).toHaveBeenCalledTimes(1);
  });

  it("format param is case-insensitive (?format=CSV lowercased → CSV branch fires)", async () => {
    const { status, headers } = await callGet("?format=CSV");
    expect(status).toBe(200);
    expect(headers.get("Content-Type") ?? "").toMatch(/^text\/csv/);
  });

  it("bucket validation short-circuits BEFORE format validation (both invalid → bucket wins so the caller fixes the more consequential arg first)", async () => {
    const { body } = await callGetJson("?bucket=all&format=parquet");
    expect(body.error).toBe("invalid bucket");
  });

  it("400 responses do NOT hit any aggregator (guard is pre-fetch — invalid params must not consume a Supabase round-trip)", async () => {
    await callGet("?bucket=all");
    expect(getOverallAggregatesMock).not.toHaveBeenCalled();
    expect(getSectorAggregatesMock).not.toHaveBeenCalled();
    expect(getStageAggregatesMock).not.toHaveBeenCalled();
  });

  it("400 responses do NOT hit toCsv (guard is pre-serialiser — invalid params must not spin the CSV assembler)", async () => {
    await callGet("?format=parquet");
    expect(toCsvMock).not.toHaveBeenCalled();
  });
});

// ─── defaults ────────────────────────────────────────────────────────────

describe("defaults", () => {
  it("default bucket is 'overall' (the /dataset landing hits the bare URL and expects the overall summary card)", async () => {
    const { status, body } = await callGetJson("");
    expect(status).toBe(200);
    expect(body.bucket).toBe("overall");
    expect(getOverallAggregatesMock).toHaveBeenCalledTimes(1);
  });

  it("default format is JSON (partners hitting the bare URL expect application/json, not text/csv)", async () => {
    const { headers } = await callGet("");
    expect(headers.get("Content-Type") ?? "").toMatch(/^application\/json/);
  });
});

// ─── overall bucket / JSON ───────────────────────────────────────────────

describe("overall / JSON", () => {
  it("returns 200 with bucket='overall' and the OverallRow verbatim under `data`", async () => {
    const { status, body } = await callGetJson("?bucket=overall");
    expect(status).toBe(200);
    expect(body.bucket).toBe("overall");
    expect(body.data).toEqual(fixtureOverall());
  });

  it("body.disclaimer is the exact AFSL-adjacent 'general information only' string (statutory boundary — do not paraphrase)", async () => {
    const { body } = await callGetJson("?bucket=overall");
    expect(body.disclaimer).toBe(EXPECTED_DISCLAIMER);
  });

  it("body.source names svi_index_snapshots (anonymised) so partners know the exact table lineage", async () => {
    const { body } = await callGetJson("?bucket=overall");
    expect(body.source).toBe("svi_index_snapshots (anonymised)");
  });

  it("Cache-Control is 'public, max-age=300, stale-while-revalidate=600' — the exact string edge caches key on", async () => {
    const { headers } = await callGet("?bucket=overall");
    expect(headers.get("Cache-Control")).toBe(EXPECTED_CACHE_CONTROL);
  });

  it("invokes ONLY getOverallAggregates (sector + stage aggregators must not be called — each is a full Supabase scan)", async () => {
    await callGet("?bucket=overall");
    expect(getOverallAggregatesMock).toHaveBeenCalledTimes(1);
    expect(getSectorAggregatesMock).not.toHaveBeenCalled();
    expect(getStageAggregatesMock).not.toHaveBeenCalled();
  });
});

// ─── overall bucket / CSV ────────────────────────────────────────────────

describe("overall / CSV", () => {
  it("returns text/csv with the overall-CSV filename", async () => {
    const { status, headers, text } = await callGet("?bucket=overall&format=csv");
    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(headers.get("Content-Disposition")).toBe(
      'attachment; filename="svi-index-overall.csv"',
    );
    expect(text).toBe("CSV-FIXTURE\r\n");
  });

  it("CSV branch shares the same Cache-Control TTL as JSON (edge caches key on the URL — both format flavours must age out together)", async () => {
    const { headers } = await callGet("?bucket=overall&format=csv");
    expect(headers.get("Cache-Control")).toBe(EXPECTED_CACHE_CONTROL);
  });

  it("toCsv receives a single-row array with the DENORMALISED overall keys (count/mean/median/p10..p90/updated_at) — the JSON `medianSvi` is renamed to `median` and `updatedAt` to `updated_at` for CSV consumers", async () => {
    await callGet("?bucket=overall&format=csv");
    expect(toCsvMock).toHaveBeenCalledTimes(1);
    const [rows] = toCsvMock.mock.calls[0]!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      count: 138,
      mean: 104.5,
      median: 105,
      p10: 82.1,
      p25: 92.4,
      p50: 105,
      p75: 118.6,
      p90: 129.9,
      updated_at: "2026-08-07T00:00:00.000Z",
    });
  });
});

// ─── sector bucket / JSON ────────────────────────────────────────────────

describe("sector / JSON", () => {
  it("returns 200 with bucket='sector' and the SectorRow[] verbatim under `data`", async () => {
    const { status, body } = await callGetJson("?bucket=sector");
    expect(status).toBe(200);
    expect(body.bucket).toBe("sector");
    expect(body.data).toEqual(fixtureSectorRows());
  });

  it("body.source names the k-anon ≥ 5 guarantee (partners rely on this to confirm no micro-cohort re-identification)", async () => {
    const { body } = await callGetJson("?bucket=sector");
    expect(body.source).toBe("svi_index_snapshots (anonymised, k-anon ≥ 5)");
  });

  it("body.disclaimer matches the AFSL-adjacent string (same statutory boundary as the overall bucket)", async () => {
    const { body } = await callGetJson("?bucket=sector");
    expect(body.disclaimer).toBe(EXPECTED_DISCLAIMER);
  });

  it("invokes ONLY getSectorAggregates (overall + stage must not be called)", async () => {
    await callGet("?bucket=sector");
    expect(getSectorAggregatesMock).toHaveBeenCalledTimes(1);
    expect(getOverallAggregatesMock).not.toHaveBeenCalled();
    expect(getStageAggregatesMock).not.toHaveBeenCalled();
  });

  it("empty sector aggregate returns an empty `data` array, not null (a null would break the /dataset table's `.map` render path)", async () => {
    getSectorAggregatesMock.mockResolvedValueOnce([]);
    const { status, body } = await callGetJson("?bucket=sector");
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ─── sector bucket / CSV ─────────────────────────────────────────────────

describe("sector / CSV", () => {
  it("returns text/csv with the by-sector CSV filename", async () => {
    const { headers } = await callGet("?bucket=sector&format=csv");
    expect(headers.get("Content-Disposition")).toBe(
      'attachment; filename="svi-index-by-sector.csv"',
    );
  });

  it("toCsv receives the SectorRow[] projected onto DENORMALISED column names (medianSvi → median_svi, medianStage → median_stage — sector CSV consumers expect snake_case)", async () => {
    await callGet("?bucket=sector&format=csv");
    const [rows] = toCsvMock.mock.calls[0]!;
    expect(rows).toEqual([
      { sector: "saas", count: 42, median_svi: 108, p25: 95.4, p75: 121.3, median_stage: 3 },
      { sector: "fintech", count: 21, median_svi: 101, p25: 89.2, p75: 115.7, median_stage: 2 },
    ]);
  });

  it("toCsv receives the EXPLICIT header list so a zero-row market still emits a valid header-only CSV (parsers break on 0-byte responses)", async () => {
    await callGet("?bucket=sector&format=csv");
    const [, headers] = toCsvMock.mock.calls[0]!;
    expect(headers).toEqual([
      "sector",
      "count",
      "median_svi",
      "p25",
      "p75",
      "median_stage",
    ]);
  });

  it("sector CSV survives an empty aggregate — toCsv is still invoked with the explicit headers so the response body is 'header row only' not empty", async () => {
    getSectorAggregatesMock.mockResolvedValueOnce([]);
    await callGet("?bucket=sector&format=csv");
    const [rows, headers] = toCsvMock.mock.calls[0]!;
    expect(rows).toEqual([]);
    expect(headers).toEqual([
      "sector",
      "count",
      "median_svi",
      "p25",
      "p75",
      "median_stage",
    ]);
  });
});

// ─── stage bucket / JSON ─────────────────────────────────────────────────

describe("stage / JSON", () => {
  it("returns 200 with bucket='stage' and the StageRow[] verbatim under `data`", async () => {
    const { status, body } = await callGetJson("?bucket=stage");
    expect(status).toBe(200);
    expect(body.bucket).toBe("stage");
    expect(body.data).toEqual(fixtureStageRows());
  });

  it("body.source names the k-anon ≥ 5 guarantee (same as sector — micro-cohort suppression pinned)", async () => {
    const { body } = await callGetJson("?bucket=stage");
    expect(body.source).toBe("svi_index_snapshots (anonymised, k-anon ≥ 5)");
  });

  it("invokes ONLY getStageAggregates (overall + sector must not be called)", async () => {
    await callGet("?bucket=stage");
    expect(getStageAggregatesMock).toHaveBeenCalledTimes(1);
    expect(getOverallAggregatesMock).not.toHaveBeenCalled();
    expect(getSectorAggregatesMock).not.toHaveBeenCalled();
  });
});

// ─── stage bucket / CSV ──────────────────────────────────────────────────

describe("stage / CSV", () => {
  it("returns text/csv with the by-stage CSV filename", async () => {
    const { headers } = await callGet("?bucket=stage&format=csv");
    expect(headers.get("Content-Disposition")).toBe(
      'attachment; filename="svi-index-by-stage.csv"',
    );
  });

  it("toCsv receives the StageRow[] with medianSvi renamed to median_svi (stage CSV consumers expect snake_case)", async () => {
    await callGet("?bucket=stage&format=csv");
    const [rows] = toCsvMock.mock.calls[0]!;
    expect(rows).toEqual([
      { stage: 0, count: 30, median_svi: 95, p25: 82.4, p75: 110.5 },
      { stage: 4, count: 12, median_svi: 118, p25: 108.1, p75: 128.7 },
    ]);
  });

  it("toCsv receives the EXPLICIT stage-CSV header list (matches the JSON projection, no `median_stage` column — that's sector-only)", async () => {
    await callGet("?bucket=stage&format=csv");
    const [, headers] = toCsvMock.mock.calls[0]!;
    expect(headers).toEqual(["stage", "count", "median_svi", "p25", "p75"]);
  });
});

// ─── error envelope ──────────────────────────────────────────────────────

describe("error envelope", () => {
  it("aggregator throw → 500 with error + disclaimer (the AFSL block must ship on EVERY response body, error or not — partners key on it)", async () => {
    getOverallAggregatesMock.mockRejectedValueOnce(new Error("supabase down"));
    const { status, body } = await callGetJson("?bucket=overall");
    expect(status).toBe(500);
    expect(body.error).toBe("aggregate read failed");
    expect(body.disclaimer).toBe(EXPECTED_DISCLAIMER);
  });

  it("sector aggregator throw → 500 (try/catch wraps every branch — not just overall)", async () => {
    getSectorAggregatesMock.mockRejectedValueOnce(new Error("boom"));
    const { status, body } = await callGetJson("?bucket=sector");
    expect(status).toBe(500);
    expect(body.error).toBe("aggregate read failed");
  });

  it("stage aggregator throw → 500 (same try/catch envelope for the third branch)", async () => {
    getStageAggregatesMock.mockRejectedValueOnce(new Error("boom"));
    const { status, body } = await callGetJson("?bucket=stage");
    expect(status).toBe(500);
    expect(body.error).toBe("aggregate read failed");
  });

  it("CSV branch throw also lands in the JSON error envelope (partners hitting ?format=csv still get a parseable error body, not a broken CSV)", async () => {
    getOverallAggregatesMock.mockRejectedValueOnce(new Error("boom"));
    const { status, headers, text } = await callGet(
      "?bucket=overall&format=csv",
    );
    expect(status).toBe(500);
    expect(headers.get("Content-Type") ?? "").toMatch(/^application\/json/);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body.error).toBe("aggregate read failed");
    expect(body.disclaimer).toBe(EXPECTED_DISCLAIMER);
  });

  it("error responses do NOT set the public Cache-Control (a cached 500 poisons every partner for 5 minutes; the fallback response omits the header entirely)", async () => {
    getOverallAggregatesMock.mockRejectedValueOnce(new Error("boom"));
    const { headers } = await callGet("?bucket=overall");
    expect(headers.get("Cache-Control")).not.toBe(EXPECTED_CACHE_CONTROL);
  });
});
