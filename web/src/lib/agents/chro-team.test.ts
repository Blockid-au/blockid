import { describe, it, expect } from "vitest";
import {
  modelESOP,
  assessTeam,
  AU_SALARY_BENCHMARKS,
  TEAM_BENCHMARKS,
  type TeamMemberProfile,
} from "./chro-team";

// ── AU_SALARY_BENCHMARKS registry invariants ─────────────────────────────

describe("AU_SALARY_BENCHMARKS registry", () => {
  it("declares the five canonical roles", () => {
    expect(Object.keys(AU_SALARY_BENCHMARKS).sort()).toEqual(
      ["Data Scientist", "Designer", "Marketing", "Product Manager", "Software Engineer"].sort(),
    );
  });

  it("orders p25 < p50 < p75 for every (role, seniority) triple", () => {
    for (const [role, bands] of Object.entries(AU_SALARY_BENCHMARKS)) {
      for (const [seniority, tri] of Object.entries(bands)) {
        expect(tri.p25, `${role}/${seniority} p25 < p50`).toBeLessThan(tri.p50);
        expect(tri.p50, `${role}/${seniority} p50 < p75`).toBeLessThan(tri.p75);
      }
    }
  });

  it("keeps every salary a positive integer AUD figure", () => {
    for (const bands of Object.values(AU_SALARY_BENCHMARKS)) {
      for (const tri of Object.values(bands)) {
        for (const v of [tri.p25, tri.p50, tri.p75]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps senior Software Engineer p50 within a reasonable AU 2026 band", () => {
    const seniorSE = AU_SALARY_BENCHMARKS["Software Engineer"].senior;
    expect(seniorSE.p50).toBeGreaterThan(120_000);
    expect(seniorSE.p50).toBeLessThan(220_000);
  });
});

// ── TEAM_BENCHMARKS registry invariants ──────────────────────────────────

describe("TEAM_BENCHMARKS registry", () => {
  it("covers stages 0..5 with monotonically non-decreasing minTeam", () => {
    const stages = Object.keys(TEAM_BENCHMARKS).map(Number).sort((a, b) => a - b);
    expect(stages).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < stages.length; i++) {
      const prev = TEAM_BENCHMARKS[stages[i - 1]].minTeam;
      const cur = TEAM_BENCHMARKS[stages[i]].minTeam;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it("stage 0 requires the solo founder only", () => {
    expect(TEAM_BENCHMARKS[0].minTeam).toBe(1);
    expect(TEAM_BENCHMARKS[0].keyRoles).toContain("CEO/Founder");
  });

  it("stage 5 introduces the executive suite (CFO + VP Sales + VP Product)", () => {
    const s5 = TEAM_BENCHMARKS[5];
    expect(s5.keyRoles).toContain("CFO");
    expect(s5.keyRoles).toContain("VP Sales");
    expect(s5.keyRoles).toContain("VP Product");
    expect(s5.minTeam).toBe(15);
  });
});

// ── modelESOP arithmetic ─────────────────────────────────────────────────

describe("modelESOP", () => {
  const now = new Date();
  const isoMonthsAgo = (n: number): string => {
    const d = new Date(now.getFullYear(), now.getMonth() - n, 15);
    return d.toISOString().slice(0, 10);
  };

  it("computes poolSize = round(totalShares × poolPercent/100)", () => {
    const r = modelESOP({
      totalShares: 10_000_000,
      poolPercent: 15,
      allocations: [],
    });
    expect(r.poolSize).toBe(1_500_000);
    expect(r.totalShares).toBe(10_000_000);
    expect(r.remainingPool).toBe(1_500_000);
  });

  it("subtracts allocated shares from remainingPool", () => {
    const r = modelESOP({
      totalShares: 10_000_000,
      poolPercent: 10,
      allocations: [
        { role: "Head of Engineering", shares: 200_000, vestingStart: isoMonthsAgo(0) },
        { role: "Head of Product", shares: 150_000, vestingStart: isoMonthsAgo(0) },
      ],
    });
    expect(r.poolSize).toBe(1_000_000);
    expect(r.remainingPool).toBe(1_000_000 - 200_000 - 150_000);
  });

  it("defaults cliff to 12 months and duration to 48 months", () => {
    const r = modelESOP({ totalShares: 100, poolPercent: 10, allocations: [] });
    expect(r.vestingSchedule.cliff).toBe(12);
    expect(r.vestingSchedule.duration).toBe(48);
    expect(r.vestingSchedule.frequency).toBe("monthly after cliff");
  });

  it("honours caller-supplied cliff + vesting override", () => {
    const r = modelESOP({
      totalShares: 100,
      poolPercent: 10,
      allocations: [],
      cliffMonths: 6,
      vestingMonths: 36,
    });
    expect(r.vestingSchedule.cliff).toBe(6);
    expect(r.vestingSchedule.duration).toBe(36);
  });

  it("returns 0 currentlyVested when grant is inside the cliff window", () => {
    const r = modelESOP({
      totalShares: 10_000_000,
      poolPercent: 10,
      allocations: [
        { role: "Senior Eng", shares: 96_000, vestingStart: isoMonthsAgo(3) },
      ],
      cliffMonths: 12,
      vestingMonths: 48,
    });
    expect(r.allocations[0].currentlyVested).toBe(0);
  });

  it("vests linearly after cliff — 24 months of a 48-month grant = 50%", () => {
    const r = modelESOP({
      totalShares: 10_000_000,
      poolPercent: 10,
      allocations: [
        { role: "Founding Eng", shares: 96_000, vestingStart: isoMonthsAgo(24) },
      ],
      cliffMonths: 12,
      vestingMonths: 48,
    });
    // 24 months elapsed, past 12-month cliff → 24/48 vested.
    expect(r.allocations[0].currentlyVested).toBe(48_000);
  });

  it("caps vestedMonths at duration (100% vested at 48+ months)", () => {
    const r = modelESOP({
      totalShares: 10_000_000,
      poolPercent: 10,
      allocations: [
        { role: "Founding Eng", shares: 96_000, vestingStart: isoMonthsAgo(60) },
      ],
      cliffMonths: 12,
      vestingMonths: 48,
    });
    expect(r.allocations[0].currentlyVested).toBe(96_000);
  });

  it("computes percentOfPool = round((shares/poolSize) × 10000) / 100 so 0.5% resolves cleanly", () => {
    const r = modelESOP({
      totalShares: 10_000_000,
      poolPercent: 10,
      allocations: [
        { role: "Head of Design", shares: 5_000, vestingStart: isoMonthsAgo(0) },
      ],
    });
    // 5_000 / 1_000_000 = 0.005 → 0.5%.
    expect(r.allocations[0].percentOfPool).toBe(0.5);
  });

  it("preserves allocation input order + role/shares/vestingStart round-trip", () => {
    const start1 = isoMonthsAgo(2);
    const start2 = isoMonthsAgo(30);
    const r = modelESOP({
      totalShares: 100,
      poolPercent: 10,
      allocations: [
        { role: "Alpha", shares: 3, vestingStart: start1 },
        { role: "Beta", shares: 4, vestingStart: start2 },
      ],
    });
    expect(r.allocations.map((a) => a.role)).toEqual(["Alpha", "Beta"]);
    expect(r.allocations[0].shares).toBe(3);
    expect(r.allocations[0].vestingStart).toBe(start1);
    expect(r.allocations[1].vestingStart).toBe(start2);
  });

  it("cites Division 83A and the AU startup concession thresholds in taxImplications", () => {
    const r = modelESOP({ totalShares: 100, poolPercent: 10, allocations: [] });
    expect(r.taxImplications).toContain("Division 83A");
    expect(r.taxImplications).toContain("15-year");
    expect(r.taxImplications).toMatch(/\$50M/);
    expect(r.taxImplications).toMatch(/10 years/);
  });
});

// ── assessTeam ───────────────────────────────────────────────────────────

const solo: TeamMemberProfile[] = [
  { role: "CEO", seniority: "executive", isFounder: true, equity: 60, salary: 60_000, location: "au" },
];

const twoFounders: TeamMemberProfile[] = [
  { role: "CEO", seniority: "executive", isFounder: true, equity: 45, salary: 60_000, location: "au" },
  { role: "CTO", seniority: "executive", isFounder: true, equity: 45, salary: 60_000, location: "au" },
];

describe("assessTeam", () => {
  it("flags 'No co-founder' when only one founder at stage 1", () => {
    const r = assessTeam({ members: solo, stage: 1 });
    expect(r.hasCoFounder).toBe(false);
    expect(r.gaps).toContain("No co-founder");
    expect(r.recommendations.some((rec) => rec.toLowerCase().includes("technical co-founder"))).toBe(true);
  });

  it("does NOT flag 'No co-founder' at stage 0 (solo founders are ok at Day 0)", () => {
    const r = assessTeam({ members: solo, stage: 0 });
    expect(r.gaps).not.toContain("No co-founder");
  });

  it("hasCoFounder=true when ≥ 2 members carry isFounder=true", () => {
    const r = assessTeam({ members: twoFounders, stage: 1 });
    expect(r.hasCoFounder).toBe(true);
  });

  it("flags 'Team size ... below stage benchmark' when under minTeam", () => {
    const r = assessTeam({ members: solo, stage: 2 });
    expect(r.gaps.some((g) => g.startsWith("Team size"))).toBe(true);
    expect(r.recommendations.some((rec) => rec.startsWith("Hire "))).toBe(true);
  });

  it("emits 'Missing key role' for every uncovered stage-role", () => {
    const r = assessTeam({ members: solo, stage: 1 });
    // stage 1 requires CEO + CTO/Technical Co-Founder; solo has CEO only.
    const missing = r.gaps.filter((g) => g.startsWith("Missing key role"));
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing.some((g) => g.includes("CTO"))).toBe(true);
  });

  it("matches key-role via case-insensitive first-slash-segment substring", () => {
    // TEAM_BENCHMARKS[1].keyRoles includes "CTO/Technical Co-Founder" — the
    // matcher splits on "/" and uses the FIRST segment lower-cased for the
    // substring probe. So a member role of "cto" satisfies it.
    const members: TeamMemberProfile[] = [
      { role: "ceo", seniority: "executive", isFounder: true, equity: 50, salary: 60_000, location: "au" },
      { role: "cto", seniority: "executive", isFounder: true, equity: 50, salary: 60_000, location: "au" },
    ];
    const r = assessTeam({ members, stage: 1 });
    expect(r.gaps.some((g) => g.startsWith("Missing key role"))).toBe(false);
  });

  it("diversityScore = min(100, distinct-roles × 20)", () => {
    const roles: TeamMemberProfile[] = [
      { role: "CEO", seniority: "executive", isFounder: true, equity: 40, salary: 60_000, location: "au" },
      { role: "CTO", seniority: "executive", isFounder: true, equity: 40, salary: 60_000, location: "au" },
      { role: "Designer", seniority: "senior", isFounder: false, equity: 5, salary: 120_000, location: "au" },
    ];
    const r = assessTeam({ members: roles, stage: 2 });
    expect(r.diversityScore).toBe(60);
  });

  it("caps diversityScore at 100 for six or more distinct roles", () => {
    const many: TeamMemberProfile[] = Array.from({ length: 6 }, (_, i) => ({
      role: `Role-${i}`,
      seniority: "mid" as const,
      isFounder: i === 0,
      equity: 5,
      salary: 100_000,
      location: "au" as const,
    }));
    const r = assessTeam({ members: many, stage: 2 });
    expect(r.diversityScore).toBe(100);
  });

  it("teamSize echoes members.length exactly", () => {
    const r = assessTeam({ members: twoFounders, stage: 1 });
    expect(r.teamSize).toBe(2);
  });

  it("score is a rounded integer clamped to [0, 100]", () => {
    // 3 well-rounded members at a stage-2 benchmark to keep score positive
    const members: TeamMemberProfile[] = [
      { role: "CEO", seniority: "executive", isFounder: true, equity: 40, salary: 60_000, location: "au" },
      { role: "CTO", seniority: "executive", isFounder: true, equity: 40, salary: 60_000, location: "au" },
      { role: "Product", seniority: "senior", isFounder: false, equity: 5, salary: 140_000, location: "au" },
    ];
    const r = assessTeam({ members, stage: 2 });
    expect(Number.isInteger(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("benchmarkComparison exposes Team Size row with OK/Below status", () => {
    const okRow = assessTeam({ members: twoFounders, stage: 1 }).benchmarkComparison
      .find((b) => b.metric === "Team Size");
    expect(okRow?.status).toBe("OK");
    expect(okRow?.current).toBe(2);
    expect(okRow?.benchmark).toBe(2);

    const belowRow = assessTeam({ members: solo, stage: 2 }).benchmarkComparison
      .find((b) => b.metric === "Team Size");
    expect(belowRow?.status).toBe("Below");
  });

  it("benchmarkComparison Key Roles row flips to 'Gaps' when any key role missing", () => {
    const r = assessTeam({ members: solo, stage: 1 });
    const row = r.benchmarkComparison.find((b) => b.metric === "Key Roles Filled");
    expect(row?.status).toBe("Gaps");
  });

  it("Key Roles row status is 'OK' when every key role covered", () => {
    const r = assessTeam({ members: twoFounders, stage: 1 });
    const row = r.benchmarkComparison.find((b) => b.metric === "Key Roles Filled");
    expect(row?.status).toBe("OK");
    expect(row?.current).toBe(row?.benchmark);
  });

  it("unknown stage falls back to the stage-0 benchmark instead of throwing", () => {
    const r = assessTeam({ members: solo, stage: 999 });
    // stage 999 is not registered → TEAM_BENCHMARKS[999] is undefined; the
    // fallback path uses TEAM_BENCHMARKS[0] and continues normally.
    expect(r.teamSize).toBe(1);
    expect(r.gaps.some((g) => g.startsWith("Team size"))).toBe(false);
  });

  it("empty team at stage 0 still returns a valid shape (no throws)", () => {
    const r = assessTeam({ members: [], stage: 0 });
    expect(r.teamSize).toBe(0);
    expect(r.hasCoFounder).toBe(false);
    expect(r.benchmarkComparison.length).toBeGreaterThan(0);
  });

  it("score penalises 5 points per gap emitted", () => {
    // Same 2-member team, one at stage 4 (many gaps) vs stage 1 (no gaps).
    // The stage-4 result should score strictly less than stage-1 because
    // gaps.length × 5 subtracts from the base.
    const stage1 = assessTeam({ members: twoFounders, stage: 1 }).score;
    const stage4 = assessTeam({ members: twoFounders, stage: 4 }).score;
    expect(stage4).toBeLessThan(stage1);
  });
});
