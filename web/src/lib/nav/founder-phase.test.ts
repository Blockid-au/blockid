// S7-A — pins the one founder nav-phase resolver:
//   • the SVI band table (moved verbatim from /dashboard's computePhase)
//   • the 12 → 6 growth-phase bucketing (G13-W1-IA1 folded the former
//     workflow-steps.ts into founder-phase-shared.ts: the table is pinned
//     against GROWTH_PHASE_ORDER and clampNavPhase() directly)
//   • the max rule (a founder never loses menu either way)
//   • the sidebar fallback order: prop > context > 0
//   • the loader's non-fatal paths + read-only SVI query shape

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_FOUNDER_NAV_CONTEXT,
  GROWTH_PHASE_TO_NAV_PHASE,
  NAV_PHASE_NAMES,
  NAV_PHASES,
  clampNavPhase,
  getFounderNavContext,
  growthPhaseFromNavPhase,
  isNavPhase,
  navPhaseFromGrowthPhase,
  navPhaseFromSvi,
  pickNavPhase,
  resolveFounderNavPhase,
  sviTotalFromRow,
} from "./founder-phase";
import { GROWTH_PHASE_IDS, GROWTH_PHASE_ORDER, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";

// ─── SVI band table ──────────────────────────────────────────────────────────

describe("navPhaseFromSvi — band table pinned (was /dashboard computePhase)", () => {
  it.each<[number | null | undefined, number]>([
    [null, 0],
    [undefined, 0],
    [Number.NaN, 0],
    [0, 0],
    [29.9, 0],
    [30, 1],
    [50, 1],
    [50.1, 2],
    [70, 2],
    [70.5, 3],
    [85, 3],
    [86, 4],
    [120, 4],
    [120.01, 5],
    [200, 5],
  ])("svi %s → phase %s", (svi, phase) => {
    expect(navPhaseFromSvi(svi)).toBe(phase);
  });

  it("NAV_PHASE_NAMES keeps the dashboard's six labels, index == phase", () => {
    expect([...NAV_PHASE_NAMES]).toEqual(["Idea", "Validation", "Equity", "Fundraise", "Traction", "Growth"]);
    expect(NAV_PHASE_NAMES[navPhaseFromSvi(75)]).toBe("Fundraise");
  });
});

// ─── 12 → 6 bucketing ────────────────────────────────────────────────────────

describe("navPhaseFromGrowthPhase — 12-phase id → 0..5", () => {
  it("covers every growth phase id exactly once with a valid 0..5 band", () => {
    expect(Object.keys(GROWTH_PHASE_TO_NAV_PHASE).sort()).toEqual([...GROWTH_PHASE_IDS].sort());
    for (const id of GROWTH_PHASE_IDS) expect(isNavPhase(GROWTH_PHASE_TO_NAV_PHASE[id]), id).toBe(true);
    expect([...NAV_PHASES]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("agrees with clampNavPhase() for ordinals 6..12 (the legacy 1..12 domain)", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const ordinal = GROWTH_PHASE_ORDER[id];
      if (ordinal < 6) continue;
      expect(GROWTH_PHASE_TO_NAV_PHASE[id], id).toBe(clampNavPhase(ordinal));
    }
  });

  it("uses the documented 1..2 → 1, 3..5 → 2 buckets for the low ordinals", () => {
    const documented: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2 };
    for (const id of GROWTH_PHASE_IDS) {
      const ordinal = GROWTH_PHASE_ORDER[id];
      if (ordinal > 5) continue;
      expect(GROWTH_PHASE_TO_NAV_PHASE[id], id).toBe(documented[ordinal]);
    }
  });

  it("clampNavPhase: 0..5 pass through, legacy 6..12 bucket, junk → 0", () => {
    for (const p of NAV_PHASES) expect(clampNavPhase(p)).toBe(p);
    expect(clampNavPhase(6)).toBe(3);
    expect(clampNavPhase(8)).toBe(3);
    expect(clampNavPhase(9)).toBe(4);
    expect(clampNavPhase(11)).toBe(4);
    expect(clampNavPhase(12)).toBe(5);
    expect(clampNavPhase(99)).toBe(5);
    expect(clampNavPhase(-3)).toBe(0);
    expect(clampNavPhase(null)).toBe(0);
    expect(clampNavPhase(undefined)).toBe(0);
    expect(clampNavPhase(Number.NaN)).toBe(0);
  });

  it("is monotone non-decreasing along the 12-phase order", () => {
    let prev = 0;
    for (const id of GROWTH_PHASE_IDS) {
      const p = navPhaseFromGrowthPhase(id);
      expect(p, id).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it.each<[GrowthPhaseId, number]>([
    ["vision", 1],
    ["customer_dev", 1],
    ["revenue_model", 2],
    ["mentor_review", 2],
    ["legal_equity", 3],
    ["product_dev", 3],
    ["investor_review", 4],
    ["growth", 4],
    ["funding", 5],
  ])("%s → %s", (id, phase) => {
    expect(navPhaseFromGrowthPhase(id)).toBe(phase);
  });

  it("null / unknown ids → 0 (no declared phase)", () => {
    expect(navPhaseFromGrowthPhase(null)).toBe(0);
    expect(navPhaseFromGrowthPhase(undefined)).toBe(0);
    expect(navPhaseFromGrowthPhase("")).toBe(0);
    expect(navPhaseFromGrowthPhase("not_a_phase")).toBe(0);
  });

  // G13-W3-IA3 — inverse bridge for the landing recommender.
  it("growthPhaseFromNavPhase picks the EARLIEST phase of each band and round-trips", () => {
    expect(growthPhaseFromNavPhase(0)).toBe("vision");
    expect(growthPhaseFromNavPhase(1)).toBe("vision");
    expect(growthPhaseFromNavPhase(2)).toBe("revenue_model");
    expect(growthPhaseFromNavPhase(3)).toBe("legal_equity");
    expect(growthPhaseFromNavPhase(4)).toBe("investor_review");
    expect(growthPhaseFromNavPhase(5)).toBe("funding");
    for (const band of NAV_PHASES) {
      if (band === 0) continue;
      const id = growthPhaseFromNavPhase(band);
      expect(navPhaseFromGrowthPhase(id), `band ${band} round-trip`).toBe(band);
      const earlier = GROWTH_PHASE_IDS.filter((p) => GROWTH_PHASE_ORDER[p] < GROWTH_PHASE_ORDER[id]);
      for (const p of earlier) expect(GROWTH_PHASE_TO_NAV_PHASE[p], `${p} is earlier than ${id}`).toBeLessThan(band);
    }
    expect(growthPhaseFromNavPhase(null)).toBe("vision");
    expect(growthPhaseFromNavPhase(99)).toBe("funding");
  });
});

// ─── max rule ────────────────────────────────────────────────────────────────

describe("resolveFounderNavPhase — max(SVI band, growth phase)", () => {
  it("low SVI + declared fundraise phase keeps the Fundraise menu (growth wins)", () => {
    expect(resolveFounderNavPhase({ svi: 12, growthPhaseId: "legal_equity" })).toBe(3);
  });

  it("high SVI + early declared phase keeps the earned menu (SVI wins)", () => {
    expect(resolveFounderNavPhase({ svi: 90, growthPhaseId: "vision" })).toBe(4);
  });

  it("no inputs → 0; each input alone → its own value", () => {
    expect(resolveFounderNavPhase({})).toBe(0);
    expect(resolveFounderNavPhase({ svi: null, growthPhaseId: null })).toBe(0);
    expect(resolveFounderNavPhase({ svi: 60 })).toBe(2);
    expect(resolveFounderNavPhase({ growthPhaseId: "funding" })).toBe(5);
  });

  it("is symmetric: equals Math.max of the two parts for every combination", () => {
    const svis = [null, 0, 35, 60, 80, 100, 150];
    for (const svi of svis) {
      for (const id of [null, ...GROWTH_PHASE_IDS]) {
        expect(resolveFounderNavPhase({ svi, growthPhaseId: id })).toBe(
          Math.max(navPhaseFromSvi(svi), navPhaseFromGrowthPhase(id)),
        );
      }
    }
  });
});

// ─── fallback order ──────────────────────────────────────────────────────────

describe("pickNavPhase — prop > context > 0", () => {
  it("prop wins over context, including an explicit 0", () => {
    expect(pickNavPhase(2, 4)).toBe(2);
    expect(pickNavPhase(0, 4)).toBe(0);
  });
  it("undefined / null prop defers to context", () => {
    expect(pickNavPhase(undefined, 3)).toBe(3);
    expect(pickNavPhase(null, 3)).toBe(3);
  });
  it("no prop, no context → 0", () => {
    expect(pickNavPhase(undefined, undefined)).toBe(0);
    expect(pickNavPhase(undefined, null)).toBe(0);
  });
  it("non-finite prop is treated as absent", () => {
    expect(pickNavPhase(Number.NaN, 3)).toBe(3);
    expect(pickNavPhase(Number.NaN, undefined)).toBe(0);
  });
});

// ─── row → SVI total ─────────────────────────────────────────────────────────

describe("sviTotalFromRow — analysis_json.totalSVI first, total_svi fallback", () => {
  it("prefers analysis_json.totalSVI (what /dashboard renders)", () => {
    expect(sviTotalFromRow({ total_svi: 40, analysis_json: { totalSVI: 62 } })).toBe(62);
  });
  it("falls back to the column, and null-safe (a null column is not 0)", () => {
    expect(sviTotalFromRow({ total_svi: 40, analysis_json: null })).toBe(40);
    expect(sviTotalFromRow({ total_svi: "55", analysis_json: {} })).toBe(55);
    expect(sviTotalFromRow({ total_svi: null, analysis_json: null })).toBeNull();
    expect(sviTotalFromRow(null)).toBeNull();
  });
});

// ─── loader ──────────────────────────────────────────────────────────────────

const getActiveProjectMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (...a: unknown[]) => getActiveProjectMock(...a),
}));

const cookieGetMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieGetMock(name) }),
}));

type QueryLog = { table: string; filters: Array<[string, string, unknown]>; select: string };
const queryLog: QueryLog[] = [];
let analysisRow: Record<string, unknown> | null = null;
let supabaseAvailable = true;
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!supabaseAvailable) return null;
    return {
      from(table: string) {
        const entry: QueryLog = { table, filters: [], select: "" };
        queryLog.push(entry);
        const chain = {
          select(cols: string) {
            entry.select = cols;
            return chain;
          },
          eq(col: string, v: unknown) {
            entry.filters.push([col, "eq", v]);
            return chain;
          },
          is(col: string, v: unknown) {
            entry.filters.push([col, "is", v]);
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          async maybeSingle() {
            return { data: analysisRow, error: null };
          },
          update() {
            throw new Error("loader must be read-only");
          },
        };
        return chain;
      },
    };
  },
}));

const USER = { id: "u-1", email: "founder@example.com" };

describe("getFounderNavContext — loader", () => {
  beforeEach(() => {
    getActiveProjectMock.mockReset();
    cookieGetMock.mockReset();
    queryLog.length = 0;
    analysisRow = null;
    supabaseAvailable = true;
  });

  it("no user → empty context (phase 0) without touching the DB", async () => {
    expect(await getFounderNavContext(null)).toBe(EMPTY_FOUNDER_NAV_CONTEXT);
    expect(await getFounderNavContext(undefined)).toBe(EMPTY_FOUNDER_NAV_CONTEXT);
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(queryLog).toHaveLength(0);
  });

  it("resolves the cookie-scoped project, reads the latest analysis for (email, project_id), and maxes", async () => {
    cookieGetMock.mockReturnValue({ value: "acme" });
    getActiveProjectMock.mockResolvedValue({ id: "proj-1", growth_phase_current: "legal_equity" });
    analysisRow = { total_svi: 20, analysis_json: { totalSVI: 20 } };

    const ctx = await getFounderNavContext(USER);

    expect(getActiveProjectMock).toHaveBeenCalledWith("u-1", "acme");
    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].table).toBe("svi_analyses");
    expect(queryLog[0].filters).toEqual([
      ["email", "eq", "founder@example.com"],
      ["project_id", "eq", "proj-1"],
    ]);
    expect(ctx).toEqual({ navPhase: 3, svi: 20, growthPhaseId: "legal_equity" });
  });

  it("no project → legacy analyses (project_id IS NULL), SVI band alone decides", async () => {
    cookieGetMock.mockReturnValue(undefined);
    getActiveProjectMock.mockResolvedValue(null);
    analysisRow = { total_svi: 75, analysis_json: null };

    const ctx = await getFounderNavContext(USER);

    expect(getActiveProjectMock).toHaveBeenCalledWith("u-1", undefined);
    expect(queryLog[0].filters).toEqual([
      ["email", "eq", "founder@example.com"],
      ["project_id", "is", null],
    ]);
    expect(ctx).toEqual({ navPhase: 3, svi: 75, growthPhaseId: null });
  });

  it("opts.project skips the project lookup (funding page already has it)", async () => {
    analysisRow = { total_svi: 55, analysis_json: { totalSVI: 55 } };
    const ctx = await getFounderNavContext(USER, { project: { id: "p-9", growth_phase_current: "vision" } });
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(queryLog[0].filters).toContainEqual(["project_id", "eq", "p-9"]);
    expect(ctx).toEqual({ navPhase: 2, svi: 55, growthPhaseId: "vision" });
  });

  it("opts.project = null means 'no project' (legacy scope), not 'look it up'", async () => {
    analysisRow = null;
    const ctx = await getFounderNavContext(USER, { project: null });
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(queryLog[0].filters).toContainEqual(["project_id", "is", null]);
    expect(ctx).toEqual({ navPhase: 0, svi: null, growthPhaseId: null });
  });

  it("unknown growth_phase_current is dropped, not treated as a phase", async () => {
    getActiveProjectMock.mockResolvedValue({ id: "proj-1", growth_phase_current: "bogus" });
    analysisRow = { total_svi: 40, analysis_json: { totalSVI: 40 } };
    const ctx = await getFounderNavContext(USER);
    expect(ctx).toEqual({ navPhase: 1, svi: 40, growthPhaseId: null });
  });

  it("no DB → growth phase still resolves; project lookup throwing → empty context", async () => {
    supabaseAvailable = false;
    getActiveProjectMock.mockResolvedValue({ id: "proj-1", growth_phase_current: "funding" });
    expect(await getFounderNavContext(USER)).toEqual({ navPhase: 5, svi: null, growthPhaseId: "funding" });

    supabaseAvailable = true;
    getActiveProjectMock.mockRejectedValue(new Error("boom"));
    expect(await getFounderNavContext(USER)).toBe(EMPTY_FOUNDER_NAV_CONTEXT);
  });
});
