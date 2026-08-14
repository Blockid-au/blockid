import { callAI } from "@/lib/ai-client";

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

// ─── LLM-backed team plan generator ───────────────────────────────────────
// Uses `callAI()` (free provider chain). Falls back to deterministic hires
// derived from TEAM_BENCHMARKS + AU_SALARY_BENCHMARKS on any parse/LLM
// failure so the founder UI never sees a hard error.

const CHRO_TEAM_SYSTEM_PROMPT =
  "You are an Australian startup CHRO hiring advisor. Respond with valid JSON only, no markdown code fences.";

export type HirePriority = "critical" | "important" | "nice_to_have";
export type HirePhase = "current" | "next_3_months" | "next_6_months" | "next_12_months";

export interface GenerateTeamInput {
  startupName: string;
  sector: string;
  stage: number;
  currentTeamSize?: number;
  description?: string;
}

export interface TeamPlanSuggestion {
  role: string;
  priority: HirePriority;
  hire_by_phase: HirePhase;
  salary_aud_min: number;
  salary_aud_max: number;
  equity_pct_min: number;
  equity_pct_max: number;
  rationale: string;
}

const VALID_PRIORITY: HirePriority[] = ["critical", "important", "nice_to_have"];
const VALID_HIRE_PHASE: HirePhase[] = ["current", "next_3_months", "next_6_months", "next_12_months"];

function teamTryParseJSON<T>(raw: string): T | null {
  if (!raw) return null;
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const match = stripped.match(/[\[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

/** Look up an AU salary band {p25, p75} for a role title. */
function salaryBandForRole(role: string): { min: number; max: number } {
  const lower = role.toLowerCase();
  const pick = (key: string, seniority: string) => {
    const band = AU_SALARY_BENCHMARKS[key]?.[seniority];
    if (!band) return null;
    return { min: band.p25, max: band.p75 };
  };
  if (lower.includes("engineer") || lower.includes("developer") || lower.includes("cto")) {
    return pick("Software Engineer", "senior") ?? { min: 130000, max: 180000 };
  }
  if (lower.includes("product")) {
    return pick("Product Manager", "senior") ?? { min: 140000, max: 195000 };
  }
  if (lower.includes("design")) {
    return pick("Designer", "senior") ?? { min: 115000, max: 160000 };
  }
  if (lower.includes("market")) {
    return pick("Marketing", "senior") ?? { min: 110000, max: 165000 };
  }
  if (lower.includes("data")) {
    return pick("Data Scientist", "senior") ?? { min: 140000, max: 200000 };
  }
  if (lower.includes("advisor") || lower.includes("founder") || lower.includes("ceo")) {
    return { min: 0, max: 0 };
  }
  return { min: 90000, max: 140000 };
}

/**
 * Enrich a suggestion's salary with AU_SALARY_BENCHMARKS so we never surface
 * wildly off-market numbers. If the LLM output falls inside the AU band we
 * keep it; otherwise we clamp to the benchmark band.
 */
function enrichSalary(s: TeamPlanSuggestion): TeamPlanSuggestion {
  const band = salaryBandForRole(s.role);
  if (band.min === 0 && band.max === 0) {
    // Advisor / founder — no cash salary.
    return { ...s, salary_aud_min: 0, salary_aud_max: 0 };
  }
  const min = Math.max(band.min, Math.min(s.salary_aud_min || band.min, band.max));
  const max = Math.min(band.max, Math.max(s.salary_aud_max || band.max, band.min));
  return {
    ...s,
    salary_aud_min: Math.min(min, max),
    salary_aud_max: Math.max(min, max),
  };
}

/** Deterministic fallback derived from TEAM_BENCHMARKS + AU_SALARY_BENCHMARKS. */
function teamFallback(input: GenerateTeamInput): TeamPlanSuggestion[] {
  const stage = input.stage;
  const benchmark = TEAM_BENCHMARKS[stage] ?? TEAM_BENCHMARKS[0];
  const keyRoles = benchmark?.keyRoles ?? ["CEO/Founder"];
  const optionalRoles = benchmark?.optionalRoles ?? [];

  const buildFor = (role: string, isKey: boolean, index: number): TeamPlanSuggestion => {
    const band = salaryBandForRole(role);
    const isFounder = /founder|ceo|advisor/i.test(role);
    const equityMin = isFounder ? (role.toLowerCase().includes("advisor") ? 0.1 : 5) : 0.1;
    const equityMax = isFounder ? (role.toLowerCase().includes("advisor") ? 1 : 25) : 1;
    const phase: HirePhase =
      isKey && index === 0
        ? "current"
        : isKey
          ? "next_3_months"
          : index < 2
            ? "next_6_months"
            : "next_12_months";
    return {
      role,
      priority: isKey ? "critical" : "important",
      hire_by_phase: phase,
      salary_aud_min: band.min,
      salary_aud_max: band.max,
      equity_pct_min: equityMin,
      equity_pct_max: equityMax,
      rationale: isKey
        ? `Key role for stage ${stage}: AU startups typically fill this before Series A.`
        : `Optional at stage ${stage}: hire once revenue supports it.`,
    };
  };

  const items: TeamPlanSuggestion[] = [];
  keyRoles.forEach((r, i) => items.push(buildFor(r, true, i)));
  optionalRoles.forEach((r, i) => items.push(buildFor(r, false, i)));
  return items.slice(0, 6);
}

/**
 * LLM-backed team plan generator. Falls back to deterministic hires derived
 * from TEAM_BENCHMARKS + AU_SALARY_BENCHMARKS on failure. Always enriches
 * salaries against AU_SALARY_BENCHMARKS so numbers stay on-market.
 */
export async function generateTeamPlan(
  input: GenerateTeamInput,
): Promise<TeamPlanSuggestion[]> {
  const benchmark = TEAM_BENCHMARKS[input.stage] ?? TEAM_BENCHMARKS[0];
  const user =
    `Startup: ${input.startupName}\n` +
    `Sector: ${input.sector}\n` +
    `Lifecycle stage (0-5): ${input.stage}\n` +
    (input.currentTeamSize !== undefined ? `Current team size: ${input.currentTeamSize}\n` : "") +
    (input.description ? `Description: ${input.description}\n` : "") +
    `\nAU benchmark for this stage: min team ${benchmark?.minTeam ?? 1}, ` +
    `key roles ${(benchmark?.keyRoles ?? []).join(", ")}, ` +
    `optional roles ${(benchmark?.optionalRoles ?? []).join(", ")}.\n\n` +
    `Return 4-6 hires as a JSON array. Each item must be an object with keys:\n` +
    `- role (short title, e.g. "Senior Full-Stack Engineer")\n` +
    `- priority (one of "critical" | "important" | "nice_to_have")\n` +
    `- hire_by_phase (one of "current" | "next_3_months" | "next_6_months" | "next_12_months")\n` +
    `- salary_aud_min (number in AUD; use 0 for equity-only advisors)\n` +
    `- salary_aud_max (number in AUD)\n` +
    `- equity_pct_min (number, e.g. 0.1)\n` +
    `- equity_pct_max (number, e.g. 1.0)\n` +
    `- rationale (one-sentence why grounded in AU startup context)\n` +
    `Anchor salaries to AU market rates. JSON only.`;

  try {
    const result = await callAI({
      system: CHRO_TEAM_SYSTEM_PROMPT,
      user,
      maxTokens: 2000,
      temperature: 0.4,
    });
    const parsed = teamTryParseJSON<TeamPlanSuggestion[]>(result.text);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      return teamFallback(input).map(enrichSalary);
    }
    const filtered = parsed
      .filter(
        (r): r is TeamPlanSuggestion =>
          !!r &&
          typeof r.role === "string" &&
          typeof r.rationale === "string" &&
          VALID_PRIORITY.includes(r.priority as HirePriority) &&
          VALID_HIRE_PHASE.includes(r.hire_by_phase as HirePhase) &&
          typeof r.salary_aud_min === "number" &&
          typeof r.salary_aud_max === "number" &&
          typeof r.equity_pct_min === "number" &&
          typeof r.equity_pct_max === "number",
      )
      .map(enrichSalary);
    if (filtered.length === 0) return teamFallback(input).map(enrichSalary);
    return filtered;
  } catch {
    return teamFallback(input).map(enrichSalary);
  }
}
