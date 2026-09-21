import { describe, expect, it } from "vitest";
import { stageBenchmarkFromScores } from "./assessment-context";

describe("stageBenchmarkFromScores — the card's benchmark under the n-rule (G21 P1)", () => {
  it("n < 10 → null (no benchmark line at all)", () => {
    expect(stageBenchmarkFromScores([50, 60, 70, 55, 65, 40, 80, 45, 62])).toBeNull();
    expect(stageBenchmarkFromScores([])).toBeNull();
  });
  it("10–29 → indicative with the median and n", () => {
    const scores = Array.from({ length: 14 }, (_, i) => 40 + i * 2);
    expect(stageBenchmarkFromScores(scores)).toEqual({ median: 53, n: 14, label: "indicative" });
  });
  it("30+ → benchmark; 100+ → segmented", () => {
    expect(stageBenchmarkFromScores(Array.from({ length: 31 }, () => 60))?.label).toBe("benchmark");
    expect(stageBenchmarkFromScores(Array.from({ length: 120 }, () => 60))?.label).toBe("segmented");
  });
  it("ignores non-finite scores when counting n", () => {
    const scores = [...Array.from({ length: 9 }, () => 60), Number.NaN, Number.POSITIVE_INFINITY];
    expect(stageBenchmarkFromScores(scores)).toBeNull();
  });
});

import { latestScorePerProject } from "./assessment-context";

describe("latestScorePerProject — n counts companies, not analysis rows (review P0)", () => {
  it("55 rows from 3 projects → 3 scores (the newest per project), guest rows ignored", () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => ({ project_id: "p1", total_svi: 60 + (i % 3), stage: 4 })),
      { project_id: "p2", total_svi: 70, stage: 4 },
      { project_id: "p2", total_svi: 65, stage: 4 },
      { project_id: "p3", total_svi: 55, stage: 4 },
      { project_id: null, total_svi: 90, stage: 4 },
      { project_id: null, total_svi: 91, stage: 4 },
    ];
    expect(latestScorePerProject(rows, 4)).toEqual([60, 70, 55]);
    expect(stageBenchmarkFromScores(latestScorePerProject(rows, 4))).toBeNull();
  });
  it("a company whose newest analysis moved to another stage no longer counts at the old stage", () => {
    const rows = [
      { project_id: "p1", total_svi: 72, stage: 5 },
      { project_id: "p1", total_svi: 61, stage: 4 },
    ];
    expect(latestScorePerProject(rows, 4)).toEqual([]);
    expect(latestScorePerProject(rows, 5)).toEqual([72]);
  });
});

// ─── G21 P3-B: loadBenchmarkFor prefers the nightly segment table ──────────

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("@/lib/evidence/claims-db", () => ({ defaultClaimsDb: async () => null }));
const segmentsState = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, liveRows: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "benchmark_segments") return { select: () => ({ limit: async () => ({ data: segmentsState.rows, error: null }) }) };
      if (table === "svi_analyses") {
        const q = { select: () => q, not: () => q, order: () => q, limit: async () => ({ data: segmentsState.liveRows, error: null }) };
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { vi } from "vitest";
import { latestAnalysisPerProject, loadAssessmentContext, loadBenchmarkFor, loadStageBenchmark } from "./assessment-context";

function seg(segment_key: string, stage: number, sector: string | null, n: number, median: number) {
  return { segment_key, stage, sector, n, median, p25: median - 5, p75: median + 5, band: n >= 100 ? "segmented" : n >= 30 ? "benchmark" : n >= 10 ? "indicative" : "none", computed_at: "2026-09-20T03:25:00.000Z" };
}

describe("loadBenchmarkFor — segment table first, live stage benchmark before 0428 (G21 P3-B)", () => {
  it("published sector segment → its median / n / label with the segment name", async () => {
    segmentsState.rows = [seg("stage:4", 4, null, 40, 58.4), seg("stage:4|sector:saas", 4, "saas", 12, 61.2)];
    expect(await loadBenchmarkFor(4, "SaaS / Software")).toEqual({ median: 61, n: 12, label: "indicative", segment: "Stage 4 · SaaS / Software", fellBackToStage: false });
  });
  it("unpublished sector segment → the stage segment, flagged as a fallback", async () => {
    segmentsState.rows = [seg("stage:4", 4, null, 40, 58.4), seg("stage:4|sector:agtech", 4, "agtech", 3, 44)];
    expect(await loadBenchmarkFor(4, "agtech")).toEqual({ median: 58, n: 40, label: "benchmark", segment: "Stage 4", fellBackToStage: true });
    expect(await loadStageBenchmark(4)).toEqual({ median: 58, n: 40, label: "benchmark", segment: "Stage 4", fellBackToStage: false });
  });
  it("neither published → null (the card prints no benchmark line), even when the live pool would qualify", async () => {
    segmentsState.rows = [seg("stage:4", 4, null, 9, 58.4)];
    segmentsState.liveRows = Array.from({ length: 40 }, (_, i) => ({ project_id: `p${i}`, total_svi: 60, stage: "4" }));
    expect(await loadBenchmarkFor(4, "saas")).toBeNull();
  });
  it("no segment rows at all (pre-0428 / before the first cron) → the live stage benchmark", async () => {
    segmentsState.rows = [];
    segmentsState.liveRows = Array.from({ length: 40 }, (_, i) => ({ project_id: `p${i}`, total_svi: 60, stage: "4" }));
    expect(await loadBenchmarkFor(4, "saas")).toEqual({ median: 60, n: 40, label: "benchmark" });
    expect(await loadBenchmarkFor(null, "saas")).toBeNull();
  });
  it("loadAssessmentContext threads the sector through", async () => {
    segmentsState.rows = [seg("stage:2", 2, null, 15, 50), seg("stage:2|sector:fintech", 2, "fintech", 11, 47)];
    const ctx = await loadAssessmentContext(null, 2, "FinTech");
    expect(ctx.benchmark).toMatchObject({ median: 47, n: 11, segment: "Stage 2 · FinTech" });
  });
  it("latestAnalysisPerProject keeps the newest row per project and drops guest rows", () => {
    const rows = [{ project_id: "a", v: 1 }, { project_id: "b", v: 2 }, { project_id: "a", v: 3 }, { project_id: null, v: 4 }];
    expect(latestAnalysisPerProject(rows)).toEqual([{ project_id: "a", v: 1 }, { project_id: "b", v: 2 }]);
  });
});
