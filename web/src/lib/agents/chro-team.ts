// CHRO Domain: Team Assessment & Hiring Benchmarks
//
// AU startup team composition analysis, salary benchmarks,
// ESOP modeling, and org structure evaluation.

export interface TeamMemberProfile {
  role: string;
  seniority: "junior" | "mid" | "senior" | "lead" | "executive";
  isFounder: boolean;
  equity: number;
  salary: number;
  location: "au" | "remote" | "offshore";
}

export interface TeamAssessment {
  score: number;
  teamSize: number;
  hasCoFounder: boolean;
  diversityScore: number;
  gaps: string[];
  recommendations: string[];
  benchmarkComparison: { metric: string; current: number; benchmark: number; status: string }[];
}

export interface ESOPModel {
  poolSize: number;
  totalShares: number;
  vestingSchedule: { cliff: number; duration: number; frequency: string };
  allocations: ESOPAllocation[];
  remainingPool: number;
  taxImplications: string;
}

export interface ESOPAllocation {
  role: string;
  shares: number;
  percentOfPool: number;
  vestingStart: string;
  currentlyVested: number;
}

// ── AU Salary Benchmarks by Role and Stage ─────────────────────────────

export const AU_SALARY_BENCHMARKS: Record<string, Record<string, { p25: number; p50: number; p75: number }>> = {
  "Software Engineer": {
    junior: { p25: 70000, p50: 82000, p75: 95000 },
    mid: { p25: 95000, p50: 115000, p75: 135000 },
    senior: { p25: 130000, p50: 155000, p75: 180000 },
    lead: { p25: 160000, p50: 185000, p75: 220000 },
  },
  "Product Manager": {
    mid: { p25: 100000, p50: 120000, p75: 145000 },
    senior: { p25: 140000, p50: 165000, p75: 195000 },
    lead: { p25: 170000, p50: 200000, p75: 240000 },
  },
  "Designer": {
    junior: { p25: 60000, p50: 72000, p75: 85000 },
    mid: { p25: 85000, p50: 100000, p75: 120000 },
    senior: { p25: 115000, p50: 135000, p75: 160000 },
  },
  "Marketing": {
    junior: { p25: 55000, p50: 65000, p75: 78000 },
    mid: { p25: 80000, p50: 95000, p75: 115000 },
    senior: { p25: 110000, p50: 135000, p75: 165000 },
  },
  "Data Scientist": {
    mid: { p25: 100000, p50: 120000, p75: 145000 },
    senior: { p25: 140000, p50: 170000, p75: 200000 },
  },
};

// ── Team Composition Benchmarks by Stage ───────────────────────────────

export const TEAM_BENCHMARKS: Record<number, { minTeam: number; keyRoles: string[]; optionalRoles: string[] }> = {
  0: { minTeam: 1, keyRoles: ["CEO/Founder"], optionalRoles: ["Co-Founder/CTO"] },
  1: { minTeam: 2, keyRoles: ["CEO", "CTO/Technical Co-Founder"], optionalRoles: ["Designer", "Advisor"] },
  2: { minTeam: 3, keyRoles: ["CEO", "CTO", "Product/Design"], optionalRoles: ["Marketing", "Sales"] },
  3: { minTeam: 5, keyRoles: ["CEO", "CTO", "Product", "Sales/BD"], optionalRoles: ["Designer", "Marketing", "Data"] },
  4: { minTeam: 8, keyRoles: ["CEO", "CTO", "VP Sales", "VP Product"], optionalRoles: ["HR", "Finance", "Legal"] },
  5: { minTeam: 15, keyRoles: ["CEO", "CTO", "CFO", "VP Sales", "VP Product", "VP Marketing"], optionalRoles: ["CISO", "CDO", "COO"] },
};

// ── ESOP Model (Division 83A) ──────────────────────────────────────────

export function modelESOP(input: {
  totalShares: number;
  poolPercent: number;
  allocations: { role: string; shares: number; vestingStart: string }[];
  cliffMonths?: number;
  vestingMonths?: number;
}): ESOPModel {
  const poolSize = Math.round(input.totalShares * (input.poolPercent / 100));
  const allocated = input.allocations.reduce((s, a) => s + a.shares, 0);

  const now = new Date();
  const cliff = input.cliffMonths ?? 12;
  const duration = input.vestingMonths ?? 48;

  return {
    poolSize,
    totalShares: input.totalShares,
    vestingSchedule: {
      cliff,
      duration,
      frequency: "monthly after cliff",
    },
    allocations: input.allocations.map((a) => {
      const start = new Date(a.vestingStart);
      const monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
      const vestedMonths = Math.max(0, monthsElapsed < cliff ? 0 : Math.min(duration, monthsElapsed));
      const currentlyVested = Math.round((a.shares * vestedMonths) / duration);

      return {
        role: a.role,
        shares: a.shares,
        percentOfPool: Math.round((a.shares / poolSize) * 10000) / 100,
        vestingStart: a.vestingStart,
        currentlyVested,
      };
    }),
    remainingPool: poolSize - allocated,
    taxImplications: "Division 83A: Options taxed at exercise if ESS conditions met. 15-year maximum exercise period. Startup concession available if company < 10 years old, turnover < $50M, unlisted.",
  };
}

export function assessTeam(input: {
  members: TeamMemberProfile[];
  stage: number;
}): TeamAssessment {
  const benchmark = TEAM_BENCHMARKS[input.stage] ?? TEAM_BENCHMARKS[0];
  if (!benchmark) {
    return { score: 50, teamSize: input.members.length, hasCoFounder: false, diversityScore: 0, gaps: [], recommendations: [], benchmarkComparison: [] };
  }
  const gaps: string[] = [];
  const recs: string[] = [];

  const hasCoFounder = input.members.filter((m) => m.isFounder).length >= 2;
  if (!hasCoFounder && input.stage >= 1) {
    gaps.push("No co-founder");
    recs.push("Find a technical co-founder to share the load and increase investor confidence");
  }

  if (input.members.length < benchmark.minTeam) {
    gaps.push(`Team size (${input.members.length}) below stage benchmark (${benchmark.minTeam})`);
    recs.push(`Hire ${benchmark.minTeam - input.members.length} more team members for this stage`);
  }

  const roles = input.members.map((m) => m.role.toLowerCase());
  for (const key of benchmark.keyRoles) {
    if (!roles.some((r) => r.includes(key.toLowerCase().split("/")[0]))) {
      gaps.push(`Missing key role: ${key}`);
    }
  }

  const diversityScore = Math.min(100, new Set(input.members.map((m) => m.role)).size * 20);

  const score = Math.max(0, Math.min(100,
    50
    + (hasCoFounder ? 15 : 0)
    + Math.min(20, (input.members.length / Math.max(1, benchmark.minTeam)) * 20)
    + Math.min(15, diversityScore / 7)
    - gaps.length * 5
  ));

  return {
    score: Math.round(score),
    teamSize: input.members.length,
    hasCoFounder,
    diversityScore,
    gaps,
    recommendations: recs,
    benchmarkComparison: [
      { metric: "Team Size", current: input.members.length, benchmark: benchmark.minTeam, status: input.members.length >= benchmark.minTeam ? "OK" : "Below" },
      { metric: "Key Roles Filled", current: benchmark.keyRoles.length - gaps.filter((g) => g.startsWith("Missing")).length, benchmark: benchmark.keyRoles.length, status: gaps.some((g) => g.startsWith("Missing")) ? "Gaps" : "OK" },
    ],
  };
}
