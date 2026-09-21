// G21 P3-B — /api/cron/benchmark-segments over a fake DB: CRON_SECRET gate,
// one latest score per company feeds the segments (the refresh uses the
// shared dedupe rule), every segment upserted (n < 10 included), the report
// file carries published rows only, `?dry=1` writes nothing, 503 before 0428.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const state = vi.hoisted(() => ({
  analyses: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Array<Record<string, unknown>>>,
  upsertError: null as { code?: string; message?: string } | null,
  selectError: null as { code?: string; message?: string } | null,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "svi_analyses") {
        const q = {
          select: () => q,
          not: () => q,
          order: () => q,
          limit: async () => (state.selectError ? { data: null, error: state.selectError } : { data: state.analyses, error: null }),
        };
        return q;
      }
      if (table === "benchmark_segments") {
        return {
          upsert: async (rows: Array<Record<string, unknown>>) => {
            state.upserts.push(rows);
            return { error: state.upsertError };
          },
          select: () => ({ limit: async () => ({ data: [], error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const written = vi.hoisted(() => ({ files: [] as Array<{ path: string; body: string }> }));
vi.mock("node:fs", () => ({
  default: {
    mkdirSync: () => undefined,
    writeFileSync: (p: string, body: string) => written.files.push({ path: p, body }),
  },
}));

import { GET, POST, dynamic, maxDuration } from "./route";

function analysis(project: string, stage: number, sector: string | null, svi: number): Record<string, unknown> {
  return { project_id: project, total_svi: String(svi), stage: String(stage), sector, signal_sector: null };
}

function req(qs = "", auth: string | null = "Bearer s3cret") {
  return new Request(`http://localhost/api/cron/benchmark-segments${qs}`, { headers: auth ? { authorization: auth } : {} });
}

describe("benchmark-segments cron", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    state.analyses = [];
    state.upserts = [];
    state.upsertError = null;
    state.selectError = null;
    written.files = [];
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("module: force-dynamic, 120 s budget, POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(120);
    expect(POST).toBe(GET);
  });

  it("401 without the bearer / with the wrong bearer / when CRON_SECRET is unset", async () => {
    expect((await GET(req("", null))).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req())).status).toBe(401);
    expect(state.upserts).toEqual([]);
  });

  it("counts ONE latest score per company, stores every segment (n < 10 too) and publishes only n ≥ 10", async () => {
    // 12 saas companies at stage 4 (the newest row wins; the older duplicate
    // of p-0 at stage 2 never counts), 3 agtech companies at stage 4.
    for (let i = 0; i < 12; i++) state.analyses.push(analysis(`p-${i}`, 4, "SaaS / Software", 50 + i));
    state.analyses.push(analysis("p-0", 2, "saas", 20)); // older duplicate → ignored
    for (let i = 0; i < 3; i++) state.analyses.push(analysis(`a-${i}`, 4, "agtech", 40 + i));
    state.analyses.push({ project_id: null, total_svi: "99", stage: "4", sector: "saas", signal_sector: null }); // guest row → ignored

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, companies: 15, segments: 3, published: 2, written: true });

    expect(state.upserts).toHaveLength(1);
    const rows = state.upserts[0]!;
    const byKey = Object.fromEntries(rows.map((r) => [r.segment_key as string, r]));
    expect(Object.keys(byKey).sort()).toEqual(["stage:4", "stage:4|sector:agtech", "stage:4|sector:saas"]);
    expect(byKey["stage:4"]).toMatchObject({ stage: 4, sector: null, n: 15, band: "indicative" });
    expect(byKey["stage:4|sector:saas"]).toMatchObject({ n: 12, band: "indicative" });
    expect(byKey["stage:4|sector:agtech"]).toMatchObject({ n: 3, band: "none" });
    // No stage:2 segment — the older p-0 row never counted the company at another stage.
    expect(byKey["stage:2"]).toBeUndefined();

    expect(written.files).toHaveLength(1);
    expect(written.files[0]!.path).toMatch(/benchmark-segments-latest\.json$/);
    const report = JSON.parse(written.files[0]!.body) as { published: number; rows: Array<{ segment_key: string; n: number; band: string }> };
    expect(report.published).toBe(2);
    expect(report.rows.map((r) => r.segment_key)).toEqual(["stage:4", "stage:4|sector:saas"]);
    for (const r of report.rows) expect(r.n).toBeGreaterThanOrEqual(10);
  });

  it("?dry=1 computes the counts and writes nothing", async () => {
    for (let i = 0; i < 11; i++) state.analyses.push(analysis(`p-${i}`, 3, "fintech", 60 + i));
    const res = await GET(req("?dry=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, companies: 11, segments: 2, published: 2, written: false });
    expect(state.upserts).toEqual([]);
    expect(written.files).toEqual([]);
  });

  it("503 with the migration hint when benchmark_segments is missing; 500 on another upsert error", async () => {
    state.analyses.push(analysis("p-1", 4, "saas", 55));
    state.upsertError = { code: "42P01", message: 'relation "public.benchmark_segments" does not exist' };
    const missing = await GET(req());
    expect(missing.status).toBe(503);
    expect((await missing.json()).error).toMatch(/0428/);
    expect(written.files).toEqual([]);

    state.upsertError = { code: "23514", message: "check violation" };
    expect((await GET(req())).status).toBe(500);
  });

  it("500 when the analyses read fails; nothing is written", async () => {
    state.selectError = { message: "boom" };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
    expect(state.upserts).toEqual([]);
  });
});
