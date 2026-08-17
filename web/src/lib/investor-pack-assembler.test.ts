// P5-investor-pack-assembler-lib-test — colocated vitest for the
// server-only pack assembler that feeds POST /api/investor-pack and the
// /workspace/investor-pack rendering path. Pins the SVI-total → grade
// ladder, the SVI-total → valuation-stage-number ladder, the cap-table
// fully-diluted %-round + ESOP-tail contract, the contact-name three-
// step fallback (founder profile → app_users.display_name → email
// prefix), the sector-source preference (project.industry preferred over
// analysis.sector / analysis.signals.sector, then null), the raise-amount
// floor + round, and the useOfFunds trim + default-copy branch — every
// contract the investor-pack PDF renderer depends on to avoid
// fabricating numbers when a founder's dataroom is thin.
//
// P5_investor_readiness_score / P7_weekly_digest_integration touchpoint:
// this module is what the pack PDF + digest snapshot pull from, so a
// silent drift in the grade ladder or the cap-table %-round would show
// up first here.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Supabase fake — per-table dispatch via a chainable thenable. ────────

interface FakeState {
  hasAdmin: boolean;
  appUsers: Record<string, unknown> | null;
  sviAnalysis: Record<string, unknown> | null;
  sviAnalysisError: { message: string } | null;
  holders: Array<{ name: string | null; shares_held: number | null }>;
  holdersError: { message: string } | null;
  esopRow: { total_pool_shares: number | null } | null;
  // clevel_reports_v2 rows per role
  cLevelReports: Record<string, Record<string, unknown> | null>;
  // svi_accounts row
  sviAccount: { id: string } | null;
}

const state: FakeState = {
  hasAdmin: true,
  appUsers: null,
  sviAnalysis: null,
  sviAnalysisError: null,
  holders: [],
  holdersError: null,
  esopRow: null,
  cLevelReports: {},
  sviAccount: null,
};

function makeSupabase() {
  const supa = {
    from(table: string) {
      // Track role filter for clevel_reports_v2 dispatch per chain.
      let _cLevelRole: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select() {
          return chain;
        },
        eq(col: string, val: unknown) {
          if (table === "clevel_reports_v2" && col === "role") {
            _cLevelRole = String(val);
          }
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        in() {
          return chain;
        },
        async maybeSingle() {
          if (table === "app_users") return { data: state.appUsers, error: null };
          if (table === "svi_analyses")
            return { data: state.sviAnalysis, error: state.sviAnalysisError };
          if (table === "esop_pool") return { data: state.esopRow, error: null };
          if (table === "clevel_reports_v2") {
            const role = _cLevelRole ?? "cfo";
            return { data: state.cLevelReports[role] ?? null, error: null };
          }
          if (table === "svi_accounts")
            return { data: state.sviAccount, error: null };
          return { data: null, error: null };
        },
        // Awaited directly (holdersQuery) — must be thenable.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then(onResolve: any, onReject: any) {
          if (table === "shareholders") {
            return Promise.resolve({
              data: state.holders,
              error: state.holdersError,
            }).then(onResolve, onReject);
          }
          return Promise.resolve({ data: null, error: null }).then(onResolve, onReject);
        },
      };
      return chain;
    },
  };
  return supa;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.hasAdmin ? makeSupabase() : null),
}));

// ── Dep mocks ───────────────────────────────────────────────────────────

const getProjectByIdMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectById: (id: string) => getProjectByIdMock(id),
}));

const estimateValuationMock = vi.fn();
vi.mock("@/lib/valuation", () => ({
  estimateValuation: (
    svi: number,
    stage: number,
    metrics?: unknown,
    dims?: unknown,
  ) => estimateValuationMock(svi, stage, metrics, dims),
}));

const loadFounderProfileMock = vi.fn();
vi.mock("@/lib/founder-profile", () => ({
  loadFounderProfile: (id: string) => loadFounderProfileMock(id),
}));

const buildChecklistMock = vi.fn();
const computeReadinessScoreMock = vi.fn();
const groupChecklistByCategoryMock = vi.fn();
vi.mock("@/lib/fundraise-checklist", () => ({
  buildChecklist: (input: unknown) => buildChecklistMock(input),
  computeReadinessScore: (items: unknown, svi: number) =>
    computeReadinessScoreMock(items, svi),
  groupChecklistByCategory: (items: unknown) => groupChecklistByCategoryMock(items),
}));

const getComparableRaisesMock = vi.fn();
vi.mock("@/lib/au-comparable-raises", () => ({
  getComparableRaises: (opts: unknown) => getComparableRaisesMock(opts),
}));

const assertDiv83AMock = vi.fn();
vi.mock("@/lib/compliance/div83a-funding-gate", () => ({
  assertDiv83AEligibleOrWarn: (
    supabase: unknown,
    input: unknown,
  ) => assertDiv83AMock(supabase, input),
}));

const buildEsopEligibilityMock = vi.fn();
vi.mock("@/lib/investor-pack/esop-eligibility-section", () => ({
  buildEsopEligibilitySection: (gate: unknown, locale: string) =>
    buildEsopEligibilityMock(gate, locale),
}));

const buildExitBenchmarkMock = vi.fn();
vi.mock("@/lib/investor-pack/exit-benchmark-section", () => ({
  buildExitBenchmarkSection: (opts: unknown) => buildExitBenchmarkMock(opts),
}));

const buildTractionCohortMock = vi.fn();
vi.mock("@/lib/investor-pack/traction-cohort-section", () => ({
  buildTractionCohortSection: () => buildTractionCohortMock(),
}));

const buildExitStrategyChapterMock = vi.fn();
vi.mock("@/lib/investor-pack/exit-strategy-chapter", () => ({
  buildExitStrategyChapter: (...args: unknown[]) =>
    buildExitStrategyChapterMock(...args),
}));

const buildCLevelChapterMock = vi.fn();
vi.mock("@/lib/investor-pack/c-level-chapter", () => ({
  buildCLevelChapter: (input: unknown) => buildCLevelChapterMock(input),
}));

// compute-c-level-dcf is imported transitively by c-level-chapter.
// Mock it to avoid server-only import chain issues in tests.
vi.mock("@/lib/c-level/compute-c-level-dcf", () => ({
  scanForRealNames: (text: string) => ({ ok: true, violations: [] as string[] }),
}));

// Import after mocks are registered.
import { assemblePackData } from "./investor-pack-assembler";

const DEFAULT_APP_USER = {
  email: "Ava@Example.COM",
  display_name: "Ava From App Users",
};

const DEFAULT_PROFILE = {
  full_name: "Ava Founder",
  role: "CEO",
  co_founders: [{ name: "Ben Co", role: "CTO" }],
  advisors: [{ name: "Cara Advisor", role: "" }],
};

const DEFAULT_PROJECT = {
  id: "p1",
  name: "  Fake Startup  ",
  industry: "SaaS",
};

function resetState() {
  state.hasAdmin = true;
  state.appUsers = { ...DEFAULT_APP_USER };
  state.sviAnalysis = null;
  state.sviAnalysisError = null;
  state.holders = [];
  state.holdersError = null;
  state.esopRow = null;
  state.cLevelReports = {};
  state.sviAccount = null;
}

beforeEach(() => {
  resetState();
  getProjectByIdMock.mockReset().mockResolvedValue(DEFAULT_PROJECT);
  loadFounderProfileMock.mockReset().mockResolvedValue(DEFAULT_PROFILE);
  estimateValuationMock
    .mockReset()
    .mockImplementation((svi: number, stage: number) => ({
      low: svi * 1000,
      mid: svi * 2000,
      high: svi * 3000,
      method: `stage-${stage}`,
      confidence: 0.5,
      currency: "AUD",
    }));
  buildChecklistMock.mockReset().mockReturnValue([
    { category: "story", label: "Deck", status: "done", weight: 5 },
    { category: "metrics", label: "MRR", status: "missing", weight: 4 },
  ]);
  computeReadinessScoreMock
    .mockReset()
    .mockReturnValue({ score: 42, band: "improving" });
  groupChecklistByCategoryMock.mockReset().mockImplementation((items: unknown) => {
    const arr = items as Array<{ category: string; label: string; status: string }>;
    const out: Record<string, typeof arr> = {};
    for (const it of arr) {
      out[it.category] = out[it.category] ?? [];
      out[it.category].push(it);
    }
    return out;
  });
  getComparableRaisesMock.mockReset().mockReturnValue([{ id: "c1", stage: "seed" }]);
  assertDiv83AMock.mockReset().mockResolvedValue({ ok: true, disclaimer: "d" });
  buildEsopEligibilityMock
    .mockReset()
    .mockReturnValue({ heading: "ESOP", tests: [] });
  buildExitBenchmarkMock
    .mockReset()
    .mockReturnValue({ heading: "Exit", rows: [], usedFallback: false });
  buildTractionCohortMock
    .mockReset()
    .mockReturnValue({ heading: "Traction", svg: "<svg/>", emptyState: true });
  buildExitStrategyChapterMock
    .mockReset()
    .mockResolvedValue({ present: false, reason: "no_primary_scenario" });
  buildCLevelChapterMock
    .mockReset()
    .mockReturnValue(null);
});

// ── SVI grade ladder ────────────────────────────────────────────────────

describe("assemblePackData — sviGrade ladder", () => {
  it.each([
    [200, "A+"],
    [185, "A+"],
    [184, "A"],
    [168, "A"],
    [167, "A-"],
    [155, "A-"],
    [154, "B+"],
    [140, "B+"],
    [139, "B"],
    [125, "B"],
    [124, "B-"],
    [110, "B-"],
    [109, "C+"],
    [95, "C+"],
    [94, "C"],
    [80, "C"],
    [79, "C-"],
    [65, "C-"],
    [64, "D"],
    [1, "D"],
  ])("total=%i → grade=%s", async (total, grade) => {
    state.sviAnalysis = { total_svi: total, analysis_json: {} };
    const out = await assemblePackData("u1", "p1");
    expect(out.svi.grade).toBe(grade);
    expect(out.svi.total).toBe(total);
  });

  it("no SVI analysis on file → total=0, grade='—'", async () => {
    state.sviAnalysis = null;
    const out = await assemblePackData("u1", "p1");
    expect(out.svi.total).toBe(0);
    expect(out.svi.grade).toBe("—");
    expect(out.svi.dimensions).toEqual([]);
  });

  it("SVI query returns an error → treated as no analysis (total=0, grade='—')", async () => {
    state.sviAnalysis = null;
    state.sviAnalysisError = { message: "boom" };
    const out = await assemblePackData("u1", "p1");
    expect(out.svi.total).toBe(0);
    expect(out.svi.grade).toBe("—");
  });
});

// ── Stage-number ladder driving estimateValuation ───────────────────────

describe("assemblePackData — stageNumberFromSvi ladder", () => {
  it.each([
    [200, 7],
    [185, 7],
    [184, 6],
    [168, 6],
    [167, 5],
    [155, 5],
    [154, 4],
    [140, 4],
    [139, 3],
    [125, 3],
    [124, 2],
    [110, 2],
    [109, 1],
    [90, 1],
    [89, 0],
    [0, 0],
  ])("total=%i → estimateValuation stage arg=%i", async (total, stageNum) => {
    state.sviAnalysis = { total_svi: total, analysis_json: {} };
    await assemblePackData("u1", "p1");
    const call = estimateValuationMock.mock.calls[0];
    expect(call[0]).toBe(total);
    expect(call[1]).toBe(stageNum);
  });
});

// ── stageFromSvi (buildChecklist "stage" arg) ───────────────────────────

describe("assemblePackData — stageFromSvi", () => {
  it.each([
    [0, "preseed"],
    [50, "preseed"],
    [99, "preseed"],
    [100, "seed"],
    [139, "seed"],
    [140, "seriesA"],
    [200, "seriesA"],
  ])("total=%i → buildChecklist({stage:%s})", async (total, stage) => {
    state.sviAnalysis = { total_svi: total, analysis_json: {} };
    await assemblePackData("u1", "p1");
    expect(buildChecklistMock).toHaveBeenCalledWith(
      expect.objectContaining({ stage }),
    );
  });
});

// ── defaultUseOfFunds copy ──────────────────────────────────────────────

describe("assemblePackData — defaultUseOfFunds", () => {
  it("raise=0 → pending copy nudges the founder to fill a breakdown", async () => {
    const out = await assemblePackData("u1", "p1");
    expect(out.ask.raiseAmountAud).toBe(0);
    expect(out.ask.useOfFunds).toMatch(/Use-of-funds pending/);
  });

  it("raise>0 → percentage split default copy", async () => {
    const out = await assemblePackData("u1", "p1", { raiseAmountAud: 250_000 });
    expect(out.ask.raiseAmountAud).toBe(250_000);
    expect(out.ask.useOfFunds).toMatch(/Product & engineering \(40%\)/);
  });

  it("override useOfFunds — non-blank string wins over default", async () => {
    const out = await assemblePackData("u1", "p1", {
      raiseAmountAud: 500_000,
      useOfFunds: "  Bespoke split for this raise  ",
    });
    expect(out.ask.useOfFunds).toBe("Bespoke split for this raise");
  });

  it("override useOfFunds — whitespace-only falls back to default", async () => {
    const out = await assemblePackData("u1", "p1", {
      raiseAmountAud: 100_000,
      useOfFunds: "   ",
    });
    expect(out.ask.useOfFunds).toMatch(/Product & engineering \(40%\)/);
  });

  it("negative raiseAmount floored to 0 (and pending copy applied)", async () => {
    const out = await assemblePackData("u1", "p1", { raiseAmountAud: -99_999 });
    expect(out.ask.raiseAmountAud).toBe(0);
    expect(out.ask.useOfFunds).toMatch(/Use-of-funds pending/);
  });

  it("fractional raiseAmount rounded", async () => {
    const out = await assemblePackData("u1", "p1", { raiseAmountAud: 12_345.67 });
    expect(out.ask.raiseAmountAud).toBe(12_346);
  });
});

// ── Cap table % + ESOP tail ─────────────────────────────────────────────

describe("assemblePackData — cap table", () => {
  it("2 holders + no ESOP → sums to 100 with 2dp round, ordered DESC", async () => {
    state.holders = [
      { name: "Ava", shares_held: 400 },
      { name: "Ben", shares_held: 600 },
    ];
    const out = await assemblePackData("u1", "p1");
    expect(out.capTable).toEqual([
      { holder: "Ben", pctFullyDiluted: 60 },
      { holder: "Ava", pctFullyDiluted: 40 },
    ]);
  });

  it("appends 'ESOP pool (unallocated)' row when esop_pool has shares", async () => {
    state.holders = [
      { name: "Ava", shares_held: 700 },
      { name: "Ben", shares_held: 200 },
    ];
    state.esopRow = { total_pool_shares: 100 };
    const out = await assemblePackData("u1", "p1");
    expect(out.capTable).toEqual([
      { holder: "Ava", pctFullyDiluted: 70 },
      { holder: "Ben", pctFullyDiluted: 20 },
      { holder: "ESOP pool (unallocated)", pctFullyDiluted: 10 },
    ]);
  });

  it("returns [] when there are no holders and no ESOP shares (fully-diluted=0)", async () => {
    state.holders = [];
    state.esopRow = null;
    const out = await assemblePackData("u1", "p1");
    expect(out.capTable).toEqual([]);
  });

  it("holders with 0 shares are filtered out (kept in denominator only)", async () => {
    state.holders = [
      { name: "Ava", shares_held: 500 },
      { name: "Ben (dropped)", shares_held: 0 },
      { name: "Cara", shares_held: 500 },
    ];
    const out = await assemblePackData("u1", "p1");
    expect(out.capTable.map((r) => r.holder)).toEqual(["Ava", "Cara"]);
  });

  it("null / blank holder name → 'Unnamed holder'", async () => {
    state.holders = [
      { name: null, shares_held: 100 },
      { name: "   ", shares_held: 200 },
    ];
    const out = await assemblePackData("u1", "p1");
    expect(out.capTable.map((r) => r.holder)).toEqual([
      "Unnamed holder",
      "Unnamed holder",
    ]);
  });

  it("pct rounds to 2dp (333/1000 → 33.30, 667/1000 → 66.70)", async () => {
    state.holders = [
      { name: "Ava", shares_held: 333 },
      { name: "Ben", shares_held: 667 },
    ];
    const out = await assemblePackData("u1", "p1");
    expect(out.capTable).toEqual([
      { holder: "Ben", pctFullyDiluted: 66.7 },
      { holder: "Ava", pctFullyDiluted: 33.3 },
    ]);
  });
});

// ── Team assembly ───────────────────────────────────────────────────────

describe("assemblePackData — team", () => {
  it("assembles founder + co-founders + advisors with role defaults", async () => {
    loadFounderProfileMock.mockResolvedValueOnce({
      full_name: "  Ava  ",
      role: "  Founder & CEO  ",
      co_founders: [
        { name: "  Ben  ", role: "" }, // → "Co-founder" default
        { name: "Cara", role: "COO" },
      ],
      advisors: [
        { name: "Dan", role: null }, // → "Advisor" default
      ],
    });
    const out = await assemblePackData("u1", "p1");
    expect(out.team).toEqual([
      { name: "Ava", role: "Founder & CEO" },
      { name: "Ben", role: "Co-founder" },
      { name: "Cara", role: "COO" },
      { name: "Dan", role: "Advisor" },
    ]);
  });

  it("empty full_name → founder not included; blank co-founder / advisor names skipped", async () => {
    loadFounderProfileMock.mockResolvedValueOnce({
      full_name: "   ",
      role: "CEO",
      co_founders: [
        { name: "", role: "CTO" },
        { name: "Ben", role: "" },
      ],
      advisors: [
        { name: null, role: "Legal" },
        { name: "  Dan  ", role: "" },
      ],
    });
    const out = await assemblePackData("u1", "p1");
    expect(out.team).toEqual([
      { name: "Ben", role: "Co-founder" },
      { name: "Dan", role: "Advisor" },
    ]);
  });

  it("no founder profile → team is []", async () => {
    loadFounderProfileMock.mockResolvedValueOnce(null);
    const out = await assemblePackData("u1", "p1");
    expect(out.team).toEqual([]);
  });
});

// ── Contact name three-step fallback ────────────────────────────────────

describe("assemblePackData — contact.founderName fallback", () => {
  it("founder profile name wins over display_name + email prefix", async () => {
    const out = await assemblePackData("u1", "p1");
    expect(out.contact.founderName).toBe("Ava Founder");
  });

  it("no profile + display_name present → display_name", async () => {
    loadFounderProfileMock.mockResolvedValueOnce(null);
    const out = await assemblePackData("u1", "p1");
    expect(out.contact.founderName).toBe("Ava From App Users");
  });

  it("no profile + no display_name → email local-part", async () => {
    state.appUsers = { email: "someone@Example.com", display_name: null };
    loadFounderProfileMock.mockResolvedValueOnce(null);
    const out = await assemblePackData("u1", "p1");
    expect(out.contact.founderName).toBe("someone");
  });

  it("no profile + no display_name + no email → 'Founder'", async () => {
    state.appUsers = null;
    loadFounderProfileMock.mockResolvedValueOnce(null);
    const out = await assemblePackData("u1", "p1");
    expect(out.contact.founderName).toBe("Founder");
  });

  it("email is stored lowercased + trimmed", async () => {
    const out = await assemblePackData("u1", "p1");
    expect(out.contact.email).toBe("ava@example.com");
  });

  it("website is always null (not on projects table)", async () => {
    const out = await assemblePackData("u1", "p1");
    expect(out.contact.website).toBeNull();
  });
});

// ── Sector preference ──────────────────────────────────────────────────

describe("assemblePackData — sector source preference", () => {
  it("uses project.industry when set", async () => {
    state.sviAnalysis = {
      total_svi: 120,
      analysis_json: { sector: "FinTech", signals: { sector: "InsurTech" } },
    };
    const out = await assemblePackData("u1", "p1");
    expect(out.project.sector).toBe("SaaS");
  });

  it("project.sector=null → still null on the return (SVI sector NOT reflected on project.sector)", async () => {
    getProjectByIdMock.mockResolvedValueOnce({
      id: "p1",
      name: "No Industry Startup",
      industry: null,
    });
    state.sviAnalysis = {
      total_svi: 120,
      analysis_json: { sector: "HealthTech" },
    };
    const out = await assemblePackData("u1", "p1");
    expect(out.project.sector).toBeNull();
  });

  it("falls back to analysis.sector when project.industry is missing (for comparables + valuation)", async () => {
    getProjectByIdMock.mockResolvedValueOnce({
      id: "p1",
      name: "Startup",
      industry: null,
    });
    state.sviAnalysis = {
      total_svi: 120,
      analysis_json: { sector: "HealthTech" },
    };
    await assemblePackData("u1", "p1");
    expect(estimateValuationMock).toHaveBeenCalledWith(
      120,
      expect.any(Number),
      { sector: "HealthTech" },
      expect.any(Object),
    );
    expect(getComparableRaisesMock).toHaveBeenCalledWith({
      sector: "HealthTech",
      stage: "seed",
      limit: 6,
    });
  });

  it("falls back to analysis.signals.sector when neither project.industry nor analysis.sector is set", async () => {
    getProjectByIdMock.mockResolvedValueOnce({
      id: "p1",
      name: "Startup",
      industry: null,
    });
    state.sviAnalysis = {
      total_svi: 90,
      analysis_json: { signals: { sector: "AgTech" } },
    };
    await assemblePackData("u1", "p1");
    expect(getComparableRaisesMock).toHaveBeenCalledWith({
      sector: "AgTech",
      stage: "preseed",
      limit: 6,
    });
  });
});

// ── Project name fallback ──────────────────────────────────────────────

describe("assemblePackData — project name", () => {
  it("trims project name", async () => {
    const out = await assemblePackData("u1", "p1");
    expect(out.project.name).toBe("Fake Startup");
  });

  it("blank project name → falls back to email local-part", async () => {
    getProjectByIdMock.mockResolvedValueOnce({
      id: "p1",
      name: "   ",
      industry: null,
    });
    const out = await assemblePackData("u1", "p1");
    expect(out.project.name).toBe("ava");
  });

  it("no projectId → getProjectById NOT called, uses email local-part as name", async () => {
    const out = await assemblePackData("u1", null);
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(out.project.name).toBe("ava");
  });

  it("no projectId + no user email → 'Untitled startup'", async () => {
    state.appUsers = null;
    const out = await assemblePackData("u1", null);
    expect(out.project.name).toBe("Untitled startup");
  });
});

// ── SVI dimensions mapping ─────────────────────────────────────────────

describe("assemblePackData — SVI dimensions", () => {
  it("dimensions come from analysis.subs with round + clamp [0, 100]", async () => {
    state.sviAnalysis = {
      total_svi: 100,
      analysis_json: {
        subs: [
          { label: "Team", key: "ftv", value: 87.7 }, // → 88
          { label: "Market", key: "mpc", value: -5 }, // → 0
          { label: "Product", key: "ptd", value: 150 }, // → 100
          { key: "missing_label", value: 50 }, // dropped — no label
          { label: "no_value" }, // dropped — no value
        ],
      },
    };
    const out = await assemblePackData("u1", "p1");
    expect(out.svi.dimensions).toEqual([
      { label: "Team", score: 88 },
      { label: "Market", score: 0 },
      { label: "Product", score: 100 },
    ]);
  });

  it("dimensionsMap keys forwarded to estimateValuation as dims arg", async () => {
    state.sviAnalysis = {
      total_svi: 120,
      analysis_json: {
        subs: [
          { label: "Team", key: "ftv", value: 70 },
          { label: "Market", key: "mpc", value: 55 },
        ],
      },
    };
    await assemblePackData("u1", "p1");
    expect(estimateValuationMock).toHaveBeenCalledWith(
      120,
      expect.any(Number),
      expect.any(Object),
      expect.objectContaining({ ftv: 70, mpc: 55 }),
    );
  });

  it("dimensionScores overrides subs values in the map", async () => {
    state.sviAnalysis = {
      total_svi: 130,
      analysis_json: {
        subs: [{ label: "Team", key: "ftv", value: 40 }],
        dimensionScores: { ftv: 90 },
      },
    };
    await assemblePackData("u1", "p1");
    expect(estimateValuationMock).toHaveBeenCalledWith(
      130,
      expect.any(Number),
      expect.any(Object),
      expect.objectContaining({ ftv: 90 }),
    );
  });

  it("SVI total rounded on the return payload", async () => {
    state.sviAnalysis = { total_svi: 127.6, analysis_json: {} };
    const out = await assemblePackData("u1", "p1");
    expect(out.svi.total).toBe(128);
  });
});

// ── Checklist / valuation / comparables pass-through ───────────────────

describe("assemblePackData — pass-throughs", () => {
  it("valuation payload copied verbatim from estimateValuation return", async () => {
    estimateValuationMock.mockReturnValueOnce({
      low: 1_000_000,
      mid: 2_000_000,
      high: 3_000_000,
      method: "custom-blend",
      confidence: 0.75,
      currency: "AUD",
    });
    const out = await assemblePackData("u1", "p1");
    expect(out.valuation).toEqual({
      lowAud: 1_000_000,
      midAud: 2_000_000,
      highAud: 3_000_000,
      method: "custom-blend",
    });
  });

  it("checklist grouping only includes the 6 canonical categories", async () => {
    groupChecklistByCategoryMock.mockReturnValueOnce({
      story: [{ label: "s", status: "done" }],
      metrics: [{ label: "m", status: "missing" }],
      team: [{ label: "t", status: "done" }],
      // absent: cap-table, legal, data-room, unknown
      unknown: [{ label: "u", status: "done" }],
    });
    const out = await assemblePackData("u1", "p1");
    expect(Object.keys(out.checklist.groupedItems).sort()).toEqual(
      ["cap-table", "data-room", "legal", "metrics", "story", "team"].sort(),
    );
    expect(out.checklist.groupedItems["cap-table"]).toEqual([]);
    expect(out.checklist.groupedItems["unknown"]).toBeUndefined();
    expect(out.checklist.score).toBe(42);
    expect(out.checklist.band).toBe("improving");
  });

  it("Div 83A gate called in warn-only 'investor_pack_assemble' action", async () => {
    await assemblePackData("u1", "p1");
    expect(assertDiv83AMock).toHaveBeenCalledWith(
      expect.anything(),
      { projectId: "p1", userId: "u1", action: "investor_pack_assemble" },
    );
    expect(buildEsopEligibilityMock).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      "en",
    );
  });

  it("comparables + esopEligibility + exitBenchmark + tractionCohort forwarded verbatim", async () => {
    const out = await assemblePackData("u1", "p1");
    expect(out.comparables).toEqual([{ id: "c1", stage: "seed" }]);
    expect(out.esopEligibility).toEqual({ heading: "ESOP", tests: [] });
    expect(out.exitBenchmark).toEqual({
      heading: "Exit",
      rows: [],
      usedFallback: false,
    });
    expect(out.tractionCohort).toEqual({
      heading: "Traction",
      svg: "<svg/>",
      emptyState: true,
    });
  });

  it("generatedAt is an ISO 8601 UTC string", async () => {
    const out = await assemblePackData("u1", "p1");
    expect(out.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
    );
  });
});

// ── Exit strategy + c-level chapter wiring (v3.8.1) ─────────────────────

describe("assemblePackData — exitStrategy chapter (v3.8.1)", () => {
  it("exitStrategy present:true forwarded verbatim when buildExitStrategyChapter returns it", async () => {
    const chapter = {
      present: true,
      scenarioName: "IPO by 2030",
      exitType: "ipo",
      timelineYears: 5,
      targetExitValuationAud: 50_000_000,
      dilutionTable: [],
      founderPayouts: [],
      acquirerLandscape: [],
      readinessScore: 72,
      readinessBand: "nearly_ready",
      criticalGaps: [],
      narrative: "Strong growth trajectory.",
      markdown: "## Chapter 11\n\nIPO by 2030.",
      disclaimer: "General info only.",
    };
    // Provide a svi_accounts row so the assembler attempts the chapter call.
    state.sviAccount = { id: "acct-123" };
    buildExitStrategyChapterMock.mockResolvedValueOnce(chapter);
    const out = await assemblePackData("u1", "p1");
    expect(out.exitStrategy).toMatchObject({ present: true, scenarioName: "IPO by 2030" });
  });

  it("exitStrategy present:false when no svi_accounts row (no chapter call made)", async () => {
    state.sviAccount = null;
    const out = await assemblePackData("u1", "p1");
    expect(out.exitStrategy).toEqual({ present: false, reason: "no_primary_scenario" });
    // buildExitStrategyChapter should NOT have been called
    expect(buildExitStrategyChapterMock).not.toHaveBeenCalled();
  });

  it("exitStrategy present:false gracefully when buildExitStrategyChapter throws", async () => {
    state.sviAccount = { id: "acct-err" };
    buildExitStrategyChapterMock.mockRejectedValueOnce(new Error("DB timeout"));
    const out = await assemblePackData("u1", "p1");
    expect(out.exitStrategy).toEqual({ present: false, reason: "query_error" });
  });

  it("exitStrategy narrative must not contain any real AU company names", async () => {
    const REAL_NAMES = /\b(canva|atlassian|afterpay|airtree|blackbird|xero)\b/gi;
    state.sviAccount = { id: "acct-ok" };
    buildExitStrategyChapterMock.mockResolvedValueOnce({
      present: true,
      scenarioName: "Trade sale",
      exitType: "trade_sale",
      timelineYears: 3,
      targetExitValuationAud: 10_000_000,
      dilutionTable: [],
      founderPayouts: [],
      acquirerLandscape: [],
      readinessScore: 60,
      readinessBand: "not_ready",
      criticalGaps: [],
      narrative: "The company targets a strategic buyer.",
      markdown: "## Chapter 11\n\nTrade sale plan.",
      disclaimer: "General info only.",
    });
    const out = await assemblePackData("u1", "p1");
    if (out.exitStrategy.present) {
      expect(REAL_NAMES.test(out.exitStrategy.narrative)).toBe(false);
      expect(REAL_NAMES.test(out.exitStrategy.markdown)).toBe(false);
    }
  });
});

describe("assemblePackData — cLevelChapter (v3.8.1)", () => {
  it("cLevelChapter forwarded verbatim when buildCLevelChapter returns a chapter", async () => {
    const chapter = {
      title: "Chapter X — C-Level Financial Advisory",
      markdown: "# Chapter X\n\n## CFO — DCF Valuation\n\nEV: A$5M",
      complianceOk: true,
      complianceViolations: [],
    };
    // Provide CFO body_markdown in the fake supabase so loadCLevelChapter
    // triggers buildCLevelChapter.
    state.cLevelReports["cfo"] = {
      body_markdown: "## CFO — DCF Valuation\n\nEV: A$5M",
      generated_at: "2026-08-17T00:00:00Z",
    };
    buildCLevelChapterMock.mockReturnValueOnce(chapter);
    const out = await assemblePackData("u1", "p1");
    expect(out.cLevelChapter).toMatchObject({
      complianceOk: true,
      title: "Chapter X — C-Level Financial Advisory",
    });
  });

  it("cLevelChapter is null when no clevel_reports_v2 rows exist (fail-soft)", async () => {
    state.cLevelReports = {};
    // buildCLevelChapter should not be called (no markdown to pass in)
    const out = await assemblePackData("u1", "p1");
    expect(out.cLevelChapter).toBeNull();
  });

  it("cLevelChapter compliance-blocked stub returned without throw when complianceOk=false", async () => {
    state.cLevelReports["cfo"] = {
      body_markdown: "Canva-style growth trajectory.",
      generated_at: "2026-08-17T00:00:00Z",
    };
    buildCLevelChapterMock.mockReturnValueOnce({
      title: "Chapter X — C-Level Financial Advisory",
      markdown: "# Chapter X\n\n_Blocked by compliance scanner._",
      complianceOk: false,
      complianceViolations: ["canva"],
    });
    const out = await assemblePackData("u1", "p1");
    // Must not throw — just return the blocked stub
    expect(out.cLevelChapter).not.toBeNull();
    expect(out.cLevelChapter?.complianceOk).toBe(false);
    expect(out.cLevelChapter?.markdown).toMatch(/Blocked by compliance scanner/);
  });

  it("cLevelChapter output markdown must not contain real AU company names (compliance check)", async () => {
    const REAL_NAMES = /\b(canva|atlassian|afterpay|blackbird|xero|airtree)\b/gi;
    state.cLevelReports["cfo"] = {
      body_markdown: "Strong AU SaaS comparable exits.",
      generated_at: "2026-08-17T00:00:00Z",
    };
    buildCLevelChapterMock.mockReturnValueOnce({
      title: "Chapter X — C-Level Financial Advisory",
      markdown: "# Chapter X\n\nStrong AU SaaS comparable exits.",
      complianceOk: true,
      complianceViolations: [],
    });
    const out = await assemblePackData("u1", "p1");
    if (out.cLevelChapter) {
      expect(REAL_NAMES.test(out.cLevelChapter.markdown)).toBe(false);
    }
  });
});
