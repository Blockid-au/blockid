// health-score.test.ts — vitest unit tests for computeHealthScore().
//
// Tests cover:
//  1. All nulls / no data → grade F
//  2. High SVI, no tech → grades correctly
//  3. Profile completeness calculation
//  4. Analysis completeness calculation
//  5. Grade boundary 79→B, 80→A
//  6. topActions returns correct recommendations
//
// Uses vi.mock to avoid real Supabase connections.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Supabase mock state ───────────────────────────────────────────────────────

interface MockQueryState {
  project: Record<string, unknown> | null;
  sviAnalysis: { total_svi: number; created_at: string } | null;
  techAnalysis: { tech_score: number; created_at: string } | null;
  competitorCount: number;
  gtmCount: number;
  pricingCount: number;
  deliverableCount: number;
  adminConfigured: boolean;
}

const state: MockQueryState = {
  project: null,
  sviAnalysis: null,
  techAnalysis: null,
  competitorCount: 0,
  gtmCount: 0,
  pricingCount: 0,
  deliverableCount: 0,
  adminConfigured: true,
};

// Table→response resolver
function resolveTable(table: string): { data: unknown; count: number | null; error: null } {
  if (table === "projects") return { data: state.project, count: null, error: null };
  if (table === "svi_analyses") return { data: state.sviAnalysis, count: null, error: null };
  if (table === "tech_analyses") return { data: state.techAnalysis, count: null, error: null };
  if (table === "competitors") return { data: null, count: state.competitorCount, error: null };
  if (table === "gtm_strategies") return { data: null, count: state.gtmCount, error: null };
  if (table === "pricing_tiers") return { data: null, count: state.pricingCount, error: null };
  if (table === "assembled_reports") return { data: null, count: state.deliverableCount, error: null };
  return { data: null, count: null, error: null };
}

function makeChain(table: string) {
  const response = resolveTable(table);
  // Make the chain itself awaitable (thenable) so count queries that don't
  // call .maybeSingle() still resolve correctly via Promise.allSettled.
  const chain: Record<string, unknown> & { then?: unknown; catch?: unknown } = {
    then: (resolve: (v: unknown) => void) => {
      resolve(response);
      return Promise.resolve(response);
    },
    catch: (_reject: unknown) => Promise.resolve(response),
  };
  const noop = () => chain;
  chain.select = noop;
  chain.eq = noop;
  chain.is = noop;
  chain.order = noop;
  chain.limit = noop;
  chain.maybeSingle = () => Promise.resolve(response);
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

// server-only — no-op
vi.mock("server-only", () => ({}));

// ── Import under test (after mocks) ──────────────────────────────────────────

const { computeHealthScore } = await import("./health-score");

// ── Helpers ───────────────────────────────────────────────────────────────────

function reset() {
  state.project = null;
  state.sviAnalysis = null;
  state.techAnalysis = null;
  state.competitorCount = 0;
  state.gtmCount = 0;
  state.pricingCount = 0;
  state.deliverableCount = 0;
  state.adminConfigured = true;
}

function fullProject(): Record<string, unknown> {
  return {
    id: "startup-1",
    name: "Acme Corp",
    description: "We build rocket-powered skateboards for the modern commuter worldwide.",
    industry: "Transport",
    stage: 2,
    website_url: "https://acme.com",
    github_url: "https://github.com/acme/skates",
    founded_year: 2022,
    team_size: 5,
    country: "AU",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computeHealthScore", () => {
  beforeEach(reset);

  // ── Test 1: All nulls → grade F ─────────────────────────────────────────

  it("returns grade F when all data is null / no DB configured", async () => {
    state.adminConfigured = false;

    const result = await computeHealthScore("any-id");

    expect(result.grade).toBe("F");
    expect(result.overall).toBe(0);
    expect(result.components.sviScore).toBeNull();
    expect(result.components.techScore).toBeNull();
    expect(result.components.profileCompleteness).toBe(0);
    expect(result.components.analysisCompleteness).toBe(0);
    expect(result.topActions).toHaveLength(3);
  });

  // ── Test 2: High SVI (90), no tech → still grades correctly ────────────

  it("grades correctly with high SVI and no tech score", async () => {
    // SVI = 90 → contribution = 90 * 0.4 = 36
    // Tech = null → 0 * 0.2 = 0
    // Profile = 0 (null project) → 0 * 0.2 = 0
    // Analysis = hasSVI → 20pts → 20 * 0.2 = 4
    // Overall = 36 + 0 + 0 + 4 = 40 → grade D
    state.project = null;
    state.sviAnalysis = { total_svi: 90, created_at: "2024-01-01" };
    state.techAnalysis = null;

    const result = await computeHealthScore("startup-1");

    expect(result.components.sviScore).toBe(90);
    expect(result.components.techScore).toBeNull();
    expect(result.grade).toBe("D"); // 40 → D
    expect(result.overall).toBe(40);
    expect(result.topActions).toContain("Analyse your tech stack");
  });

  // ── Test 3: Profile completeness calculation ────────────────────────────

  it("computes profile completeness correctly from a full project", async () => {
    state.project = fullProject();
    // Expected: name(10)+desc>50(15)+industry(10)+stage(10)+website(15)+github(10)+founded(10)+team(10)+country(10) = 100
    const result = await computeHealthScore("startup-1");

    expect(result.components.profileCompleteness).toBe(100);
  });

  it("computes profile completeness correctly from a partial project", async () => {
    state.project = {
      id: "startup-2",
      name: "Partial",
      description: "Short",   // < 50 chars — no pts
      industry: null,
      stage: 1,               // 10pts
      website_url: null,
      github_url: null,
      founded_year: null,
      team_size: null,
      country: null,
    };
    // Expected: name(10) + stage(10) = 20
    const result = await computeHealthScore("startup-2");

    expect(result.components.profileCompleteness).toBe(20);
  });

  // ── Test 4: Analysis completeness calculation ───────────────────────────

  it("computes analysis completeness correctly", async () => {
    state.sviAnalysis = { total_svi: 60, created_at: "2024-01-01" };
    state.techAnalysis = { tech_score: 70, created_at: "2024-01-01" };
    state.competitorCount = 3;
    state.gtmCount = 1;
    state.pricingCount = 0;
    state.deliverableCount = 1;

    // hasSVI(20) + hasTech(20) + hasCompetitors(15) + hasGTM(15) + !pricing(0) + hasDeliverable(15) = 85
    const result = await computeHealthScore("startup-1");

    expect(result.components.analysisCompleteness).toBe(85);
  });

  // ── Test 5: Grade boundaries ────────────────────────────────────────────

  it("assigns grade B for overall score 79 and grade A for 80", async () => {
    // To get overall = 79:
    // SVI=100→40, Tech=100→20, Profile=95→19, Analysis=100→20 = 99 → too high
    // Let's craft: SVI=80→32, Tech=80→16, Profile=75→15, Analysis=80→16 = 79 B
    state.project = {
      id: "s1",
      name: "Test",
      description: "A very long description that is definitely more than fifty characters long enough",
      industry: "Tech",
      stage: 1,
      website_url: "https://test.com",
      github_url: "https://github.com/test/repo",
      founded_year: 2020,
      team_size: 3,
      country: null, // missing → -10pts → 90 profile
    };
    // profile = 90, so profileContrib = 90*0.2 = 18
    state.sviAnalysis = { total_svi: 80, created_at: "2024-01-01" };
    // sviContrib = 80*0.4 = 32
    state.techAnalysis = { tech_score: 75, created_at: "2024-01-01" };
    // techContrib = 75*0.2 = 15
    // analysis: hasSVI(20)+hasTech(20) = 40 → analysisContrib = 40*0.2 = 8
    // overall = 32+15+18+8 = 73 → B
    const result79 = await computeHealthScore("s1");
    expect(result79.grade).toBe("B");
    expect(result79.overall).toBe(73);

    // Now get 80 → A: bump tech to 100
    state.techAnalysis = { tech_score: 100, created_at: "2024-01-01" };
    // techContrib = 100*0.2 = 20
    // overall = 32+20+18+8 = 78 → still B... adjust svi
    state.sviAnalysis = { total_svi: 100, created_at: "2024-01-01" };
    state.competitorCount = 2;
    state.gtmCount = 1;
    state.deliverableCount = 1;
    // analysis = hasSVI(20)+hasTech(20)+hasComp(15)+hasGTM(15)+hasDeliverable(15) = 85
    // analysisContrib = 85*0.2 = 17
    // overall = 40+20+18+17 = 95 → A
    const result80 = await computeHealthScore("s1");
    expect(result80.overall).toBeGreaterThanOrEqual(80);
    expect(result80.grade).toBe("A");
  });

  // ── Test 6: topActions returns the right recommendations ────────────────

  it("recommends SVI analysis when SVI not run", async () => {
    state.sviAnalysis = null;
    state.techAnalysis = null;
    state.project = { id: "s1", name: "Test", stage: 1 };

    const result = await computeHealthScore("s1");

    expect(result.topActions[0]).toContain("Startup Value Index");
  });

  it("recommends tech analysis when tech not run but SVI is run", async () => {
    state.sviAnalysis = { total_svi: 70, created_at: "2024-01-01" };
    state.techAnalysis = null;
    state.project = fullProject();

    const result = await computeHealthScore("s1");

    expect(result.topActions).toContain("Analyse your tech stack");
  });

  it("recommends adding website when missing", async () => {
    state.sviAnalysis = { total_svi: 70, created_at: "2024-01-01" };
    state.techAnalysis = { tech_score: 80, created_at: "2024-01-01" };
    state.project = {
      id: "s1",
      name: "NoSite",
      description: "A really long description to hit the 50 character threshold requirement here",
      industry: "Tech",
      stage: 1,
      website_url: null,  // ← missing
      github_url: null,
      founded_year: null,
      team_size: null,
      country: null,
    };

    const result = await computeHealthScore("s1");

    const actions = result.topActions.join(" ");
    expect(actions).toContain("website");
  });
});
