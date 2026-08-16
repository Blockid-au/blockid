// Unit tests for GET /api/fundraise/readiness — P9-fundraise-readiness-route.
//
// Pins the pure-route branches over the V1 signal-driven checklist + the V2
// buildChecklist/computeReadinessScore/groupChecklistByCategory delegation
// path so a founder's Fundraising Readiness card (P5_investor_readiness_score
// exit criteria) can't silently regress on stage classification, tier
// boundaries, priority-gap sort, comparables slice, or the disclaimer text.
//
// The V2 helper trio (buildChecklist / computeReadinessScore /
// groupChecklistByCategory from lib/fundraise-checklist) and the AU
// comparable-raises pair (getComparableRaises / summariseComparables from
// lib/au-comparable-raises) are each already covered by their own colocated
// vitest — mocked here so the route contract is asserted in isolation.
//
// Covers:
//   1.  401 unauthenticated when getCurrentUser() returns null (Supabase
//       not touched — no wasted DB probe on a public curl).
//   2.  503 "Database not configured" when getSupabaseAdmin() returns null.
//   3.  Stage classification: sviScore < 50 → pre-seed; [50,70) → seed;
//       ≥ 70 → series-a. Missing analysis → sviScore 0 → pre-seed.
//   4.  signals.hasFounders → team-mvp; signals.hasTeam (alternate branch)
//       also → team-mvp; both fire the same completedItems set.
//   5.  signals.hasUsers → BOTH product-users AND traction-waitlist (the
//       one-signal-two-items branch at route.ts:125).
//   6.  hasEsop (esop_pools row present) → legal-esop; missing → not.
//   7.  hasCapTable (shareholders rows length > 0) → finance-cap-table.
//   8.  dataRoomDocs.length ≥ 5 → pitch-data-room; < 5 → not.
//   9.  Readiness tier boundaries (route.ts:169-172):
//         score < 30 → not-ready / 🔴 Not Ready
//         [30,55)   → early / 🟡 Early Stage
//         [55,75)   → getting-ready / 🔵 Getting Ready
//         ≥ 75     → investor-ready / 🟢 Investor Ready
//  10.  priorityGaps: only stage-relevant incomplete items, sorted by weight
//       desc, capped at 6 rows, `impact` formatted as `+<weight>pts`.
//  11.  comparables slice: pre-seed → AU_COMPARABLE_RAISES[0..1];
//       seed → [1..2]; series-a → [2..3].
//  12.  byCategory grouping: every checklist item lands under its category
//       key; keys match the READINESS_CHECKLIST categories.
//  13.  V2 delegation: buildChecklist called with { stage, sviAnalysis }
//       where sviAnalysis carries { score, signals, dimensions } derived
//       from the DB analysis payload; computeReadinessScore called with
//       (checklistV2, sviScore); groupChecklistByCategory called with
//       checklistV2; the return values echo verbatim into the JSON body.
//  14.  V2 comparables: getComparableRaises called with
//       stage∈{'preseed','seed','seriesA'} mapping and limit: 8;
//       summariseComparables called with the raises array.
//  15.  disclaimer text pinned bit-for-bit.
//  16.  targets pinned { preSeedReady: 50, seedReady: 70, seriesAReady: 85 }.
//  17.  totalCount + completedCount echo the stage-filtered subset.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

type Row = Record<string, unknown>;

interface FakeState {
  svi: Row | null;
  esop: Row | null;
  shareholders: Row[];
  dataRoom: Row[];
  lastEqCalls: Array<{ table: string; col: string; val: unknown }>;
}

const state: FakeState = {
  svi: null,
  esop: null,
  shareholders: [],
  dataRoom: [],
  lastEqCalls: [],
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      const record = (col: string, val: unknown) => {
        state.lastEqCalls.push({ table, col, val });
      };
      if (table === "svi_accounts") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              record(col, val);
              return {
                maybeSingle: async () => ({ data: state.svi, error: null }),
              };
            },
          }),
        };
      }
      if (table === "esop_pools") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              record(col, val);
              return {
                maybeSingle: async () => ({ data: state.esop, error: null }),
              };
            },
          }),
        };
      }
      if (table === "shareholders") {
        return {
          select: () => ({
            eq: async (col: string, val: unknown) => {
              record(col, val);
              return { data: state.shareholders, error: null };
            },
          }),
        };
      }
      if (table === "data_room_documents") {
        return {
          select: () => ({
            eq: async (col: string, val: unknown) => {
              record(col, val);
              return { data: state.dataRoom, error: null };
            },
          }),
        };
      }
      throw new Error(`fake supabase: unknown table ${table}`);
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const buildChecklistMock = vi.fn<(input: unknown) => unknown>();
const computeReadinessScoreMock = vi.fn<(...args: unknown[]) => unknown>();
const groupChecklistByCategoryMock = vi.fn<(input: unknown) => unknown>();
vi.mock("@/lib/fundraise-checklist", () => ({
  buildChecklist: (input: unknown) => buildChecklistMock(input),
  computeReadinessScore: (...args: unknown[]) => computeReadinessScoreMock(...args),
  groupChecklistByCategory: (input: unknown) => groupChecklistByCategoryMock(input),
}));

const getComparableRaisesMock = vi.fn<(input: unknown) => unknown>();
const summariseComparablesMock = vi.fn<(input: unknown) => unknown>();
vi.mock("@/lib/au-comparable-raises", () => ({
  getComparableRaises: (input: unknown) => getComparableRaisesMock(input),
  summariseComparables: (input: unknown) => summariseComparablesMock(input),
  anonymizeRaiseLabel: (r: { sector: string; stage: string; year: number }) =>
    `AU ${r.sector} startup (${r.stage}, ${r.year})`,
}));

import { GET } from "./route";

const USER = { id: "u-1", email: "founder@example.com" };

function resetState() {
  state.svi = null;
  state.esop = null;
  state.shareholders = [];
  state.dataRoom = [];
  state.lastEqCalls = [];
}

function seedSvi(score: number, signals: Record<string, boolean> = {}, extra: Record<string, unknown> = {}) {
  state.svi = { score, analysis: { signals, ...extra } };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  getCurrentUserMock.mockResolvedValue(USER);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  buildChecklistMock.mockReturnValue([{ id: "v2-item", label: "V2 item", category: "story", status: "missing", evidenceHint: "" }]);
  computeReadinessScoreMock.mockReturnValue({ score: 42, tier: "amber", target: "seed" });
  groupChecklistByCategoryMock.mockReturnValue({ story: [{ id: "v2-item" }] });
  getComparableRaisesMock.mockReturnValue([{ company: "X", stage: "seed", roundAud: 1_000_000, valuationAud: null, year: 2025, leadInvestor: null, sourceNote: "test", sector: "saas" }]);
  summariseComparablesMock.mockReturnValue({ count: 1, medianRoundAud: 1_000_000, medianValuationAud: null });
});

async function getJson() {
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("GET /api/fundraise/readiness", () => {
  it("returns 401 when getCurrentUser() returns null and never probes Supabase", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const { status, body } = await getJson();
    expect(status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.lastEqCalls).toEqual([]);
  });

  it("returns 503 'Database not configured' when getSupabaseAdmin() returns null", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const { status, body } = await getJson();
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, error: "Database not configured" });
    expect(state.lastEqCalls).toEqual([]);
  });

  it("stage=pre-seed when sviScore < 50 (score 49)", async () => {
    seedSvi(49);
    const { body } = await getJson();
    expect(body.currentStage).toBe("pre-seed");
    expect(body.sviScore).toBe(49);
  });

  it("stage=seed when sviScore in [50, 70) — boundary 50 inclusive", async () => {
    seedSvi(50);
    const { body } = await getJson();
    expect(body.currentStage).toBe("seed");
  });

  it("stage=seed at score 69 (upper bound exclusive on 70)", async () => {
    seedSvi(69);
    const { body } = await getJson();
    expect(body.currentStage).toBe("seed");
  });

  it("stage=series-a when sviScore >= 70 — boundary 70 inclusive", async () => {
    seedSvi(70);
    const { body } = await getJson();
    expect(body.currentStage).toBe("series-a");
  });

  it("missing svi row → sviScore 0 → pre-seed", async () => {
    // svi stays null — analysis + score both fall through to defaults
    const { body } = await getJson();
    expect(body.sviScore).toBe(0);
    expect(body.currentStage).toBe("pre-seed");
  });

  it("signals.hasFounders → team-mvp completed; signals.hasTeam alone also → team-mvp", async () => {
    seedSvi(60, { hasFounders: true });
    const first = await getJson();
    const teamCatFirst = (first.body.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Team;
    expect(teamCatFirst.find((i) => i.id === "team-mvp")?.completed).toBe(true);

    resetState();
    seedSvi(60, { hasTeam: true });
    const second = await getJson();
    const teamCatSecond = (second.body.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Team;
    expect(teamCatSecond.find((i) => i.id === "team-mvp")?.completed).toBe(true);
  });

  it("signals.hasUsers fires BOTH product-users AND traction-waitlist (one-signal-two-items branch)", async () => {
    seedSvi(60, { hasUsers: true });
    const { body } = await getJson();
    const productCat = (body.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Product;
    const tractionCat = (body.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Traction;
    expect(productCat.find((i) => i.id === "product-users")?.completed).toBe(true);
    expect(tractionCat.find((i) => i.id === "traction-waitlist")?.completed).toBe(true);
  });

  it("hasEsop (esop_pools row present) → legal-esop completed; missing → not completed", async () => {
    state.esop = { total_shares: 1000, allocated_shares: 100 };
    const { body: withEsop } = await getJson();
    const legalWith = (withEsop.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Legal;
    expect(legalWith.find((i) => i.id === "legal-esop")?.completed).toBe(true);

    resetState();
    const { body: withoutEsop } = await getJson();
    const legalWithout = (withoutEsop.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Legal;
    expect(legalWithout.find((i) => i.id === "legal-esop")?.completed).toBe(false);
  });

  it("hasCapTable (shareholders rows length > 0) → finance-cap-table completed", async () => {
    state.shareholders = [{ id: "s1" }, { id: "s2" }];
    const { body } = await getJson();
    const finance = (body.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Financials;
    expect(finance.find((i) => i.id === "finance-cap-table")?.completed).toBe(true);
  });

  it("dataRoomDocs.length >= 5 → pitch-data-room completed; < 5 → not", async () => {
    state.dataRoom = Array.from({ length: 5 }, (_, i) => ({ name: `doc${i}.pdf`, status: "uploaded" }));
    const { body: five } = await getJson();
    const pitchFive = (five.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Pitch;
    expect(pitchFive.find((i) => i.id === "pitch-data-room")?.completed).toBe(true);

    resetState();
    state.dataRoom = Array.from({ length: 4 }, (_, i) => ({ name: `doc${i}.pdf`, status: "uploaded" }));
    const { body: four } = await getJson();
    const pitchFour = (four.checklist as Record<string, Array<{ id: string; completed: boolean }>>).Pitch;
    expect(pitchFour.find((i) => i.id === "pitch-data-room")?.completed).toBe(false);
  });

  it("readiness tier: score < 30 → not-ready / 🔴 Not Ready", async () => {
    const { body } = await getJson();
    expect(body.readinessTier).toBe("not-ready");
    expect(body.readinessBadge).toBe("🔴 Not Ready");
    expect(body.readinessScore).toBeLessThan(30);
  });

  it("readiness tier: score in [30, 55) → early / 🟡 Early Stage", async () => {
    // Complete high-weight pre-seed items until score lands in [30, 55).
    // Pre-seed total weight = 109; 39/109 = 35.8% → tier=early.
    seedSvi(10, {
      hasFounders: true,        // team-mvp weight 8
      hasProblemStatement: true, // market-problem weight 7
      hasPitchDeck: true,       // pitch-deck weight 8
      hasAbn: true,             // legal-incorporated weight 8
      hasIpAssignment: true,    // legal-ip weight 8
    });
    const { body } = await getJson();
    expect(body.readinessScore).toBeGreaterThanOrEqual(30);
    expect(body.readinessScore).toBeLessThan(55);
    expect(body.readinessTier).toBe("early");
    expect(body.readinessBadge).toBe("🟡 Early Stage");
  });

  it("readiness tier: score in [55, 75) → getting-ready / 🔵 Getting Ready", async () => {
    // Series-A stage total weight = 171; ~110/171 ≈ 64% → tier=getting-ready.
    seedSvi(70, {
      hasFounders: true,        // team-mvp 8
      hasDomainExpert: true,    // team-domain 6
      hasAdvisors: true,        // team-advisors 4
      hasLinkedIn: true,        // team-linkedin 3
      hasMvp: true,             // product-mvp 8 + product-demo 6
      hasUsers: true,           // product-users 7
      hasRevenue: true,         // traction-revenue 10
      hasGrowth: true,          // traction-growth 8
      hasProblemStatement: true, // market-problem 7
      hasAbn: true,             // legal-incorporated 8
      hasSha: true,             // legal-sha 7
      hasProjections: true,     // finance-projections 7
      hasBurnRate: true,        // finance-burn 6
      hasPitchDeck: true,       // pitch-deck 8
      hasFundingAsk: true,      // pitch-ask 7
    });
    const { body } = await getJson();
    expect(body.readinessScore).toBeGreaterThanOrEqual(55);
    expect(body.readinessScore).toBeLessThan(75);
    expect(body.readinessTier).toBe("getting-ready");
    expect(body.readinessBadge).toBe("🔵 Getting Ready");
  });

  it("readiness tier: score >= 75 → investor-ready / 🟢 Investor Ready", async () => {
    // Flip every stage-relevant signal — enough to push score >= 75.
    seedSvi(80, {
      hasFounders: true, hasDomainExpert: true, hasAdvisors: true, hasLinkedIn: true,
      hasMvp: true, hasUsers: true, hasDemo: true,
      hasRevenue: true, hasGrowth: true, hasTestimonials: true,
      hasTam: true, hasCompetitiveAnalysis: true, hasProblemStatement: true,
      hasAbn: true, hasSha: true, hasIpAssignment: true, hasPrivacyPolicy: true,
      hasProjections: true, hasBurnRate: true, hasUseOfFunds: true,
      hasPitchDeck: true, hasExecutiveSummary: true, hasFundingAsk: true,
    });
    state.esop = { total_shares: 1000, allocated_shares: 100 };
    state.shareholders = [{ id: "s1" }];
    state.dataRoom = Array.from({ length: 6 }, (_, i) => ({ name: `d${i}`, status: "uploaded" }));
    const { body } = await getJson();
    expect(body.readinessScore).toBeGreaterThanOrEqual(75);
    expect(body.readinessTier).toBe("investor-ready");
    expect(body.readinessBadge).toBe("🟢 Investor Ready");
  });

  it("priorityGaps: only stage-relevant + incomplete items, sorted by weight desc, capped at 6, impact=+<weight>pts", async () => {
    // Pre-seed with no completions — every pre-seed item is a gap.
    const { body } = await getJson();
    const gaps = body.priorityGaps as Array<{ id: string; category: string; item: string; weight: number; impact: string }>;
    expect(gaps.length).toBeLessThanOrEqual(6);
    // Sorted DESC by weight — pairwise check.
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1].weight).toBeGreaterThanOrEqual(gaps[i].weight);
    }
    // Impact string format.
    for (const g of gaps) {
      expect(g.impact).toBe(`+${g.weight}pts`);
    }
    // No completed items should appear.
    for (const g of gaps) {
      expect(g.id).toBeTypeOf("string");
    }
  });

  it("priorityGaps excludes items not relevant to current stage", async () => {
    // Pre-seed: series-a-only items like traction-revenue (tier seed+seriesA)
    // must not appear even though they're incomplete.
    seedSvi(10); // pre-seed
    const { body } = await getJson();
    const gaps = body.priorityGaps as Array<{ id: string }>;
    expect(gaps.find((g) => g.id === "traction-revenue")).toBeUndefined();
    expect(gaps.find((g) => g.id === "traction-growth")).toBeUndefined();
    expect(gaps.find((g) => g.id === "team-advisors")).toBeUndefined();
  });

  it("comparables slice: pre-seed → 2 rows starting at Pre-Seed", async () => {
    seedSvi(10);
    const { body } = await getJson();
    const comps = body.comparables as Array<{ stage: string }>;
    expect(comps).toHaveLength(2);
    expect(comps[0].stage).toBe("Pre-Seed");
    expect(comps[1].stage).toBe("Seed");
  });

  it("comparables slice: seed → 2 rows starting at Seed", async () => {
    seedSvi(60);
    const { body } = await getJson();
    const comps = body.comparables as Array<{ stage: string }>;
    expect(comps).toHaveLength(2);
    expect(comps[0].stage).toBe("Seed");
    expect(comps[1].stage).toBe("Series A");
  });

  it("comparables slice: series-a → 2 rows starting at Series A", async () => {
    seedSvi(80);
    const { body } = await getJson();
    const comps = body.comparables as Array<{ stage: string }>;
    expect(comps).toHaveLength(2);
    expect(comps[0].stage).toBe("Series A");
    expect(comps[1].stage).toBe("Series B");
  });

  it("byCategory grouping: every checklist item lands under its category key", async () => {
    const { body } = await getJson();
    const cats = body.checklist as Record<string, Array<{ category: string }>>;
    // Every category in the READINESS_CHECKLIST must show up as a key.
    for (const cat of ["Team", "Product", "Traction", "Market", "Legal", "Financials", "Pitch"]) {
      expect(cats[cat]).toBeDefined();
      expect(cats[cat].length).toBeGreaterThan(0);
      // Every item under a key must self-report the same category.
      for (const item of cats[cat]) {
        expect(item.category).toBe(cat);
      }
    }
  });

  it("V2 delegation: buildChecklist called with { stage, sviAnalysis } derived from DB payload", async () => {
    const dimensions = { team: 80, market: 60 };
    seedSvi(72, { hasFounders: true }, { dimensions });
    await getJson();
    expect(buildChecklistMock).toHaveBeenCalledTimes(1);
    const call = buildChecklistMock.mock.calls[0][0] as {
      stage: string;
      sviAnalysis: { score: number; signals: Record<string, boolean>; dimensions: Record<string, number> };
    };
    expect(call.stage).toBe("series-a");
    expect(call.sviAnalysis.score).toBe(72);
    expect(call.sviAnalysis.signals).toEqual({ hasFounders: true });
    expect(call.sviAnalysis.dimensions).toEqual(dimensions);
  });

  it("V2 delegation: computeReadinessScore(checklistV2, sviScore) + groupChecklistByCategory(checklistV2) chained", async () => {
    seedSvi(55);
    const { body } = await getJson();
    expect(computeReadinessScoreMock).toHaveBeenCalledTimes(1);
    const readinessArgs = computeReadinessScoreMock.mock.calls[0];
    expect(readinessArgs[0]).toEqual(buildChecklistMock.mock.results[0]!.value);
    expect(readinessArgs[1]).toBe(55);
    expect(groupChecklistByCategoryMock).toHaveBeenCalledTimes(1);
    expect(groupChecklistByCategoryMock.mock.calls[0][0]).toEqual(buildChecklistMock.mock.results[0]!.value);
    // Return values echo verbatim.
    expect(body.checklistV2).toEqual(buildChecklistMock.mock.results[0]!.value);
    expect(body.readinessV2).toEqual({ score: 42, tier: "amber", target: "seed" });
    expect(body.checklistV2ByCategory).toEqual({ story: [{ id: "v2-item" }] });
  });

  it("V2 comparables: stage mapping pre-seed→'preseed' with limit 8, summariseComparables called with the raises", async () => {
    seedSvi(10);
    const { body } = await getJson();
    expect(getComparableRaisesMock).toHaveBeenCalledWith({ stage: "preseed", limit: 8 });
    expect(summariseComparablesMock).toHaveBeenCalledTimes(1);
    expect(summariseComparablesMock.mock.calls[0][0]).toEqual(getComparableRaisesMock.mock.results[0]!.value);
    // comparablesV2 is anonymized — company name replaced with generic label
    expect(body.comparablesV2[0].company).toBe("AU saas startup (seed, 2025)");
    expect(body.comparablesSummary).toEqual({ count: 1, medianRoundAud: 1_000_000, medianValuationAud: null });
  });

  it("V2 comparables: stage mapping seed→'seed'", async () => {
    seedSvi(60);
    await getJson();
    expect(getComparableRaisesMock).toHaveBeenCalledWith({ stage: "seed", limit: 8 });
  });

  it("V2 comparables: stage mapping series-a→'seriesA' (camelCase, not 'series-a')", async () => {
    seedSvi(80);
    await getJson();
    expect(getComparableRaisesMock).toHaveBeenCalledWith({ stage: "seriesA", limit: 8 });
  });

  it("disclaimer pinned bit-for-bit — 'Not investment advice' wording is load-bearing for AFSL posture", async () => {
    const { body } = await getJson();
    expect(body.disclaimer).toBe(
      "General information only. Not investment advice. Comparables from public reporting.",
    );
  });

  it("targets pinned to { preSeedReady: 50, seedReady: 70, seriesAReady: 85 }", async () => {
    const { body } = await getJson();
    expect(body.targets).toEqual({ preSeedReady: 50, seedReady: 70, seriesAReady: 85 });
  });

  it("totalCount + completedCount echo the stage-filtered subset (pre-seed baseline no completions)", async () => {
    seedSvi(10);
    const { body } = await getJson();
    const cats = body.checklist as Record<string, Array<{ relevantForStage: boolean; completed: boolean }>>;
    const relevantCount = Object.values(cats).flat().filter((i) => i.relevantForStage).length;
    expect(body.totalCount).toBe(relevantCount);
    // No signals set → no auto-detected completions.
    expect(body.completedCount).toBe(0);
  });

  it("all four table probes filter on account_id=user.id (defence against user-id leak regression)", async () => {
    seedSvi(50);
    await getJson();
    const calls = state.lastEqCalls;
    // Route fires exactly four .eq calls — one per table — in Promise.all order.
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.col).toBe("account_id");
      expect(c.val).toBe(USER.id);
    }
    const tables = new Set(calls.map((c) => c.table));
    expect(tables).toEqual(new Set(["svi_accounts", "esop_pools", "shareholders", "data_room_documents"]));
  });
});
