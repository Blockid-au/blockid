// T0095 — Equity & ESOP Engine
//
// Pure-calculation core for the BlockID Equity pillar. No DB access here;
// the API layer is responsible for persisting and authorising inputs/outputs.
//
// All monetary values are AUD. Share counts are integers.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EquityRole =
  | "founder"
  | "cofounder"
  | "employee"
  | "advisor"
  | "investor"
  | "option_holder";

export type ScheduleType = "monthly" | "quarterly" | "annual" | "milestone";

export interface VestingInput {
  totalShares: number;
  cliffMonths: number;
  vestMonths: number;
  scheduleType: ScheduleType;
  startDate: string; // ISO YYYY-MM-DD
  milestones?: Array<{ description: string; shares: number; achievedAt?: string }>;
}

export interface VestingEvent {
  eventDate: string; // ISO YYYY-MM-DD
  sharesVested: number;
  cumulativeVested: number;
  isCliff: boolean;
}

export interface EquityPlan {
  totalShares: number;
  preMoneyValuation?: number | null;
}

export interface EquityMember {
  id?: string;
  name: string;
  role: EquityRole;
  shareClass?: string;
  sharesIssued: number;
  optionsGranted: number;
  joinDate?: string;
}

export interface CapTableRow {
  name: string;
  role: EquityRole;
  shareClass: string;
  shares: number;
  options: number;
  fullyDilutedShares: number;
  ownershipPct: number; // 0..100
  fullyDilutedPct: number; // 0..100
  valueAud: number; // at current pre-money valuation
}

export interface RoundInput {
  raiseAmountAud: number;
  preMoneyValuationAud: number;
  optionPoolTopUpPct?: number; // refresh ESOP pre-money to this %
}

export interface DilutionResult {
  preMoneyValuationAud: number;
  postMoneyValuationAud: number;
  newSharesIssued: number;
  newTotalShares: number;
  investorOwnershipPct: number;
  existingOwnershipPct: number;
  pricePerShareAud: number;
  optionPoolTopUpShares: number;
}

export interface ESOPPool {
  poolSizeShares: number;
  schemeType: "ESS" | "ESOP" | "SAR" | "phantom" | "direct";
  auTaxConcession: boolean;
}

export interface ESOPSummary {
  poolSizeShares: number;
  poolSizePct: number;
  allocatedShares: number;
  unallocatedShares: number;
  unallocatedPct: number;
  schemeType: ESOPPool["schemeType"];
  auTaxConcession: boolean;
  /** AU-specific note for the UI / generated docs. */
  auTaxNote: string;
}

export interface TimelinePoint {
  date: string; // ISO YYYY-MM-DD
  cumulativeVested: number;
  isCliff: boolean;
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function parseISO(date: string): Date {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return d;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCMonth(out.getUTCMonth() + months);
  // Clamp end-of-month overflow (e.g. Jan 31 + 1 month → Feb 28).
  if (out.getUTCDate() < day) out.setUTCDate(0);
  return out;
}

// ---------------------------------------------------------------------------
// 1. Vesting schedule calculator
// ---------------------------------------------------------------------------

/**
 * Generate all vesting events for one grant, honouring cliff + cadence.
 *
 * - Monthly / quarterly / annual: shares vest in equal periods after cliff.
 *   The cliff event releases all shares earned up to the cliff date.
 * - Milestone: events come from the provided `milestones` array; only
 *   milestones with `achievedAt` are emitted.
 *
 * Rounding: per-period shares are floored; the final period absorbs any
 * remainder so the total always reconciles to `totalShares`.
 */
export function calculateVestingSchedule(input: VestingInput): VestingEvent[] {
  if (input.totalShares <= 0) return [];
  if (input.cliffMonths < 0 || input.vestMonths <= 0) return [];
  if (input.cliffMonths > input.vestMonths) {
    throw new Error("cliffMonths cannot exceed vestMonths");
  }

  if (input.scheduleType === "milestone") {
    const events: VestingEvent[] = [];
    let cumulative = 0;
    const milestones = (input.milestones ?? [])
      .filter((m) => m.achievedAt)
      .sort((a, b) => (a.achievedAt! < b.achievedAt! ? -1 : 1));
    for (const m of milestones) {
      cumulative += m.shares;
      events.push({
        eventDate: m.achievedAt!,
        sharesVested: m.shares,
        cumulativeVested: cumulative,
        isCliff: false,
      });
    }
    return events;
  }

  const start = parseISO(input.startDate);
  const periodMonths =
    input.scheduleType === "monthly" ? 1 :
    input.scheduleType === "quarterly" ? 3 : 12;

  const totalPeriods = Math.floor(input.vestMonths / periodMonths);
  if (totalPeriods === 0) return [];

  const cliffPeriods = Math.floor(input.cliffMonths / periodMonths);
  const perPeriod = Math.floor(input.totalShares / totalPeriods);

  const events: VestingEvent[] = [];
  let cumulative = 0;

  for (let i = 1; i <= totalPeriods; i++) {
    if (i < cliffPeriods) continue; // suppressed by cliff

    const isCliff = i === cliffPeriods && cliffPeriods > 0;
    const isFinal = i === totalPeriods;

    let shares = isCliff
      ? perPeriod * cliffPeriods
      : perPeriod;
    if (isFinal) {
      // Final tranche absorbs rounding remainder
      shares = input.totalShares - cumulative - (isCliff ? 0 : 0);
      // (kept verbose for readability — final = remainder of totalShares)
    }

    cumulative += shares;
    events.push({
      eventDate: toISO(addMonths(start, i * periodMonths)),
      sharesVested: shares,
      cumulativeVested: cumulative,
      isCliff,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// 2. Cap table
// ---------------------------------------------------------------------------

export function calculateCapTable(
  plan: EquityPlan,
  members: EquityMember[],
): CapTableRow[] {
  const totalShares = Math.max(plan.totalShares, 1);
  const fullyDilutedTotal = members.reduce(
    (sum, m) => sum + m.sharesIssued + m.optionsGranted,
    0,
  ) || totalShares;
  const pricePerShare =
    plan.preMoneyValuation && plan.preMoneyValuation > 0
      ? plan.preMoneyValuation / totalShares
      : 0;

  return members.map((m) => {
    const fdShares = m.sharesIssued + m.optionsGranted;
    return {
      name: m.name,
      role: m.role,
      shareClass: m.shareClass ?? "Ordinary",
      shares: m.sharesIssued,
      options: m.optionsGranted,
      fullyDilutedShares: fdShares,
      ownershipPct: round2((m.sharesIssued / totalShares) * 100),
      fullyDilutedPct: round2((fdShares / fullyDilutedTotal) * 100),
      valueAud: round2(m.sharesIssued * pricePerShare),
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Dilution
// ---------------------------------------------------------------------------

export function calculateDilution(
  plan: EquityPlan,
  round: RoundInput,
): DilutionResult {
  const pre = round.preMoneyValuationAud;
  const post = pre + round.raiseAmountAud;
  const pricePerShare = pre / plan.totalShares;
  if (pricePerShare <= 0) {
    throw new Error("preMoneyValuationAud and totalShares must be positive");
  }

  // Option pool top-up (pre-money): grow pool so that post-issue pool == target %
  let topUpShares = 0;
  if (round.optionPoolTopUpPct && round.optionPoolTopUpPct > 0) {
    const target = round.optionPoolTopUpPct / 100;
    // newTotal × target = pool; assume existing pool ≈ 0 for this calculation
    // newTotal = plan.totalShares + topUp + investorShares
    const investorShares = round.raiseAmountAud / pricePerShare;
    // topUp = target × (plan.totalShares + topUp + investorShares)
    // topUp × (1 - target) = target × (plan.totalShares + investorShares)
    topUpShares = Math.round(
      (target * (plan.totalShares + investorShares)) / (1 - target),
    );
  }

  const newShares = Math.round(round.raiseAmountAud / pricePerShare);
  const newTotal = plan.totalShares + newShares + topUpShares;

  return {
    preMoneyValuationAud: round2(pre),
    postMoneyValuationAud: round2(post),
    newSharesIssued: newShares,
    newTotalShares: newTotal,
    investorOwnershipPct: round2((newShares / newTotal) * 100),
    existingOwnershipPct: round2((plan.totalShares / newTotal) * 100),
    pricePerShareAud: round4(pricePerShare),
    optionPoolTopUpShares: topUpShares,
  };
}

// ---------------------------------------------------------------------------
// 4. ESOP summary
// ---------------------------------------------------------------------------

export function calculateESOP(
  pool: ESOPPool,
  totalShares: number,
  allocatedShares = 0,
): ESOPSummary {
  const pct = totalShares > 0 ? (pool.poolSizeShares / totalShares) * 100 : 0;
  const unallocated = Math.max(pool.poolSizeShares - allocatedShares, 0);
  const unallocatedPct =
    pool.poolSizeShares > 0 ? (unallocated / pool.poolSizeShares) * 100 : 0;

  return {
    poolSizeShares: pool.poolSizeShares,
    poolSizePct: round2(pct),
    allocatedShares,
    unallocatedShares: unallocated,
    unallocatedPct: round2(unallocatedPct),
    schemeType: pool.schemeType,
    auTaxConcession: pool.auTaxConcession,
    auTaxNote: pool.auTaxConcession
      ? "Eligible for Division 83A ITAA 1997 startup ESS tax concession (aggregated turnover < $50M, < 10 yrs old, unlisted) — recipients defer tax until sale (max 15 yrs)."
      : "Standard Division 83A ITAA 1997 ESS treatment: discount taxable in year of grant unless real risk of forfeiture; deferred for genuine startups meeting eligibility.",
  };
}

// ---------------------------------------------------------------------------
// 5. Timeline for charts
// ---------------------------------------------------------------------------

export function generateVestingTimeline(events: VestingEvent[]): TimelinePoint[] {
  return events.map((e) => ({
    date: e.eventDate,
    cumulativeVested: e.cumulativeVested,
    isCliff: e.isCliff,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
