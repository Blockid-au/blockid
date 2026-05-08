/**
 * Founder Equity Split — weighted-points model.
 *
 * Inspired by FAST / Slicing Pie, simplified for AU pre-seed founders.
 * Pure functions: no I/O, no React, no DOM.
 */

export type FounderRole =
  | "CEO"
  | "CTO"
  | "COO"
  | "CMO"
  | "Designer"
  | "Domain Expert"
  | "Other";

export type TimeCommitment =
  | "Full-time now"
  | "Full-time in 3 mo"
  | "Part-time"
  | "Advisor";

export type IdeaOrigination = "Originator" | "Joined later";

export type RiskTaken = "Quit job" | "Has runway 6mo" | "Side project";

export interface FounderInput {
  id: string;
  name: string;
  role: FounderRole;
  time: TimeCommitment;
  idea: IdeaOrigination;
  /** AUD cash put in. */
  cashAud: number;
  /** Sweat months committed in next 12 months. */
  sweatMonths: number;
  /** IP/assets brought, integer 1–5. */
  ipAssets: number;
  risk: RiskTaken;
}

export interface EquitySettings {
  /** Reserve an ESOP pool? */
  esopEnabled: boolean;
  /** ESOP percentage if enabled. Defaults to 10. */
  esopPct: number;
  /** First-hire reserve, 0–10%. */
  firstHirePct: number;
}

export interface PointBreakdown {
  role: number;
  time: number;
  idea: number;
  cash: number;
  sweat: number;
  ip: number;
  risk: number;
}

export interface FounderAllocation {
  id: string;
  name: string;
  role: FounderRole;
  /** Percent of total company (already net of ESOP + first-hire reserve). */
  pct: number;
  /** Total weighted points. */
  points: number;
  breakdown: PointBreakdown;
  /** Vesting schedule snapshots. */
  vested: { y0: number; y1: number; y2: number; y3: number; y4: number };
}

export interface FairnessFlag {
  level: "warn" | "info";
  message: string;
}

export interface EquitySplitResult {
  allocations: FounderAllocation[];
  reserves: {
    esopPct: number;
    firstHirePct: number;
    foundersPct: number;
  };
  flags: FairnessFlag[];
  vesting: {
    cliffMonths: 12;
    totalMonths: 48;
    note: string;
  };
  totalPoints: number;
}

/* -------------------------------- weights -------------------------------- */

const ROLE_WEIGHT: Record<FounderRole, number> = {
  CEO: 20,
  CTO: 18,
  "Domain Expert": 14,
  COO: 12,
  CMO: 12,
  Designer: 12,
  Other: 12,
};

const TIME_WEIGHT: Record<TimeCommitment, number> = {
  "Full-time now": 30,
  "Full-time in 3 mo": 18,
  "Part-time": 8,
  Advisor: 3,
};

const RISK_WEIGHT: Record<RiskTaken, number> = {
  "Quit job": 12,
  "Has runway 6mo": 6,
  "Side project": 0,
};

const CASH_PER_POINT_AUD = 1000;
const CASH_POINTS_CAP = 30;
const SWEAT_POINTS_CAP = 24;
const IP_POINTS_PER_ASSET = 4;
const IP_POINTS_CAP = 20;
const IDEA_BONUS = 10;

/* ------------------------------- compute -------------------------------- */

function clampPct(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function computeBreakdown(f: FounderInput, isOriginator: boolean): PointBreakdown {
  const cash = Math.min(
    CASH_POINTS_CAP,
    Math.max(0, Math.floor((f.cashAud || 0) / CASH_PER_POINT_AUD)),
  );
  const sweat = Math.min(SWEAT_POINTS_CAP, Math.max(0, f.sweatMonths || 0));
  const ip = Math.min(
    IP_POINTS_CAP,
    Math.max(0, Math.min(5, Math.round(f.ipAssets || 0))) * IP_POINTS_PER_ASSET,
  );
  return {
    role: ROLE_WEIGHT[f.role] ?? 12,
    time: TIME_WEIGHT[f.time] ?? 0,
    idea: isOriginator ? IDEA_BONUS : 0,
    cash,
    sweat,
    ip,
    risk: RISK_WEIGHT[f.risk] ?? 0,
  };
}

function sumBreakdown(b: PointBreakdown): number {
  return b.role + b.time + b.idea + b.cash + b.sweat + b.ip + b.risk;
}

/**
 * Compute equity split.
 *
 * - Only the FIRST founder marked "Originator" receives the +10 idea bonus,
 *   to keep semantics tight ("the one who had the idea").
 */
export function computeEquitySplit(
  founders: FounderInput[],
  settings: EquitySettings,
): EquitySplitResult {
  const esopPct = settings.esopEnabled ? clampPct(settings.esopPct, 0, 30) : 0;
  const firstHirePct = clampPct(settings.firstHirePct, 0, 10);
  const foundersPct = Math.max(0, 100 - esopPct - firstHirePct);

  // Only credit the first originator (in row order).
  let originatorSeen = false;

  const enriched = founders.map((f) => {
    const isOriginator = f.idea === "Originator" && !originatorSeen;
    if (isOriginator) originatorSeen = true;
    const breakdown = computeBreakdown(f, isOriginator);
    const points = sumBreakdown(breakdown);
    return { f, breakdown, points };
  });

  const totalPoints = enriched.reduce((acc, e) => acc + e.points, 0);

  const allocations: FounderAllocation[] = enriched.map(
    ({ f, breakdown, points }) => {
      const share = totalPoints > 0 ? points / totalPoints : 0;
      const pct = share * foundersPct;
      // 4-year vest, 1-year cliff: 0% at y0, 25% at y1 (cliff), 50/75/100 thereafter.
      const v = (mult: number) => +(pct * mult).toFixed(2);
      return {
        id: f.id,
        name: f.name,
        role: f.role,
        pct: +pct.toFixed(2),
        points,
        breakdown,
        vested: {
          y0: 0,
          y1: v(0.25),
          y2: v(0.5),
          y3: v(0.75),
          y4: v(1),
        },
      };
    },
  );

  return {
    allocations,
    reserves: { esopPct, firstHirePct, foundersPct },
    flags: deriveFlags(founders, allocations),
    vesting: {
      cliffMonths: 12,
      totalMonths: 48,
      note: "4-year vesting with 1-year cliff is the AU/US market standard.",
    },
    totalPoints,
  };
}

/* ------------------------------- flags ---------------------------------- */

function deriveFlags(
  founders: FounderInput[],
  allocations: FounderAllocation[],
): FairnessFlag[] {
  const flags: FairnessFlag[] = [];

  // 1. Anyone < 10% — likely an employee, not a founder.
  for (const a of allocations) {
    if (a.pct > 0 && a.pct < 10) {
      flags.push({
        level: "warn",
        message: `${a.name || "Unnamed founder"} gets ${a.pct.toFixed(1)}% — under 10% looks like an employee, not a cofounder. Consider ESOP grant instead.`,
      });
    }
  }

  // 2. Originator full-time getting < 30%.
  const originatorIdx = founders.findIndex((f) => f.idea === "Originator");
  if (originatorIdx >= 0) {
    const o = founders[originatorIdx];
    const a = allocations[originatorIdx];
    if (
      o.time === "Full-time now" &&
      a &&
      a.pct > 0 &&
      a.pct < 30
    ) {
      flags.push({
        level: "warn",
        message: `${a.name || "Originator"} originated the idea AND is full-time, but only gets ${a.pct.toFixed(1)}%. Originators usually keep ≥30% in early teams.`,
      });
    }
  }

  // 3. Equal split flagged when contributions differ wildly.
  if (allocations.length >= 2) {
    const points = allocations.map((a) => a.points);
    const max = Math.max(...points);
    const min = Math.min(...points);
    const equalSplit = Math.abs(
      Math.max(...allocations.map((a) => a.pct)) -
        Math.min(...allocations.map((a) => a.pct)),
    );
    // Inputs differ if (max - min) / max > 30%.
    const contributionsDiffer = max > 0 && (max - min) / max > 0.3;
    // We never produce a literally equal split from points, but warn if the
    // user has near-equal points despite very uneven inputs (e.g. one full-time,
    // one advisor). Detect: equalSplit < 1pp BUT contributionsDiffer.
    if (equalSplit < 1 && contributionsDiffer) {
      flags.push({
        level: "warn",
        message:
          "Founders are getting near-equal splits but contributions differ significantly — re-check time, cash and risk inputs.",
      });
    }
    // Detect: user manually wants equal-by-default — heuristic: same points
    // exactly across ≥2 founders despite different roles or time.
    const samePoints = points.every((p) => p === points[0]);
    const variedTime =
      new Set(founders.map((f) => f.time)).size > 1 ||
      new Set(founders.map((f) => f.cashAud > 0 ? "cash" : "no")).size > 1;
    if (samePoints && variedTime && allocations.length > 1) {
      flags.push({
        level: "warn",
        message:
          "Equal split despite different time commitments or cash. Equal splits often breed resentment when reality doesn't stay equal.",
      });
    }
  }

  if (flags.length === 0) {
    flags.push({
      level: "info",
      message: "No fairness red flags. Sense-check with each cofounder before signing.",
    });
  }

  return flags;
}

/* ------------------------------- defaults ------------------------------- */

export const DEFAULT_SETTINGS: EquitySettings = {
  esopEnabled: true,
  esopPct: 10,
  firstHirePct: 0,
};

/** Founder Agreement seed bullets to bring to a lawyer. Pure text. */
export const FOUNDER_AGREEMENT_SEEDS: string[] = [
  "Vesting: 4-year vesting with a 1-year cliff for all founders, monthly thereafter, with double-trigger acceleration on change-of-control.",
  "IP assignment: every founder assigns all pre-incorporation IP, code, brand and customer relationships to the company on day one.",
  "Decision rights: define which decisions are CEO-call, which are board-supermajority, and which require unanimous founder consent (e.g. share issuance, sale).",
  "Exit & departure: leaver provisions — good leaver keeps vested shares, bad leaver forfeits unvested + buyback at fair value on vested.",
  "Confidentiality & non-compete: 12-month non-compete and perpetual confidentiality, scoped to AU and direct competitors only.",
];

export function makeEmptyFounder(id: string, idx: number): FounderInput {
  const defaultRole: FounderRole = idx === 0 ? "CEO" : idx === 1 ? "CTO" : "Other";
  return {
    id,
    name: idx === 0 ? "Alex (CEO)" : idx === 1 ? "Sam (CTO)" : `Founder ${idx + 1}`,
    role: defaultRole,
    time: "Full-time now",
    idea: idx === 0 ? "Originator" : "Joined later",
    cashAud: idx === 0 ? 10_000 : 0,
    sweatMonths: 12,
    ipAssets: idx === 0 ? 2 : 1,
    risk: idx === 0 ? "Quit job" : "Has runway 6mo",
  };
}
