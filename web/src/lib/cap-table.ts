/**
 * Cap Table Diff — pure compute layer.
 *
 * Models a "standard" Australian seed-to-Series-A priced round with a
 * pre-money ESOP top-up. Everything is deterministic, side-effect free, and
 * runs entirely in the browser.
 *
 * Conventions (kept aligned with the existing /tools/dilution calculator):
 * - All AUD figures are plain numbers (no cents). Share counts are integers.
 * - The ESOP top-up is treated PRE-MONEY: the pool is grown before the new
 *   investor's shares are issued, so the dilution from the top-up falls on
 *   existing holders only — this is the convention every AU institutional
 *   investor will assume.
 * - New share price is derived from the fully-diluted pre-money cap table
 *   AFTER the top-up: `price = preMoney / sharesPostTopUp`. Investor shares
 *   are then `raise / price`.
 * - All percentages are computed against the post-round total.
 * - Share counts round down to whole integers; rounding remainder is absorbed
 *   into the (unallocated) ESOP line so totals always reconcile.
 */

export type ShareClass = "common" | "preferred" | "esop" | "safe";

export interface Holder {
  /** Stable id for React keys + diff matching across before/after. */
  id: string;
  name: string;
  /** Pre-round share count (ESOP allocated, not pool). */
  shares: number;
  shareClass: ShareClass;
  isFounder?: boolean;
}

export interface Round {
  preMoneyAud: number;
  raiseAud: number;
  /** Target post-money ESOP pool, e.g. 12 means 12%. */
  esopTopUpPct: number;
  /** True = standard pre-money top-up. False = post-money (no-op for now). */
  esopTimingPreMoney: boolean;
  leadInvestorName: string;
}

export interface CapTableDiff {
  before: { holders: Holder[]; totalShares: number };
  after: { holders: Holder[]; totalShares: number };
  pricing: {
    preMoneyAud: number;
    postMoneyAud: number;
    newSharesIssued: number;
    newSharePriceAud: number;
    /** Net new ESOP shares added by the top-up (>=0). */
    esopShareesAdded: number;
    investorShares: number;
  };
  rows: Array<{
    name: string;
    sharesBefore: number;
    sharesAfter: number;
    pctBefore: number;
    pctAfter: number;
    /** percentage points (post% - pre%). Negative = dilution. */
    deltaPct: number;
    isFounder?: boolean;
    isNewInvestor?: boolean;
    isEsop?: boolean;
  }>;
  summary: {
    foundersBeforePct: number;
    foundersAfterPct: number;
    investorPct: number;
    esopAfterPct: number;
  };
  plainEnglish: string;
}

const ESOP_NAME = "ESOP pool";

/** Returns the pre-filled 4-row demo cap table used on first paint. */
export function demoCapTable(): Holder[] {
  return [
    {
      id: "founder-1",
      name: "Founder A",
      shares: 4_500_000,
      shareClass: "common",
      isFounder: true,
    },
    {
      id: "founder-2",
      name: "Founder B",
      shares: 2_500_000,
      shareClass: "common",
      isFounder: true,
    },
    {
      id: "esop",
      name: ESOP_NAME,
      shares: 800_000,
      shareClass: "esop",
    },
    {
      id: "angel-1",
      name: "Angel — Pre-seed",
      shares: 2_200_000,
      shareClass: "preferred",
    },
  ];
}

function isEsopHolder(h: Holder): boolean {
  return h.shareClass === "esop" || h.id === "esop";
}

function safeNum(n: number, min = 0): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, n);
}

/** Sum a numeric field across a list of holders. */
function sumShares(holders: Holder[]): number {
  return holders.reduce((acc, h) => acc + safeNum(h.shares), 0);
}

/**
 * Compute the before/after diff for a priced round with pre-money ESOP top-up.
 *
 * Math:
 *   currentShares     = sum(holders.shares)
 *   currentEsop       = ESOP-row shares (allocated + unallocated)
 *   target            = esopTopUpPct / 100
 *   sharesAfter       = currentShares + esopAdded + investorShares  (the goal)
 *
 * Pre-money top-up means: solve for esopAdded so that
 *   (currentEsop + esopAdded) / sharesAfter = target
 * AND new shares price off the post-top-up cap:
 *   price = preMoney / (currentShares + esopAdded)
 *   investorShares = raise / price
 *
 * Sub raise=preMoney*k where k=raise/preMoney ⇒ investorShares = k*(currentShares+esopAdded).
 * Let S = currentShares + esopAdded. Then total = S + k*S = S*(1+k).
 * Required: (currentEsop + esopAdded) / (S*(1+k)) = target
 *   currentEsop + esopAdded = target * S * (1+k)
 *   currentEsop + esopAdded = target * (currentShares + esopAdded) * (1+k)
 *   esopAdded * (1 - target*(1+k)) = target*(1+k)*currentShares - currentEsop
 *   esopAdded = [target*(1+k)*currentShares - currentEsop] / [1 - target*(1+k)]
 *
 * If target*(1+k) >= 1 the math is degenerate (target too high relative to
 * raise multiple) — we clamp to 0 in that case. If the formula yields a
 * negative number the existing pool already exceeds the target post-money;
 * we also clamp to 0 (no shrinkage of an existing pool).
 */
export function computeDiff(holders: Holder[], round: Round): CapTableDiff {
  const cleaned: Holder[] = holders.map((h) => ({
    ...h,
    shares: Math.max(0, Math.floor(safeNum(h.shares))),
  }));

  const preMoney = safeNum(round.preMoneyAud);
  const raise = safeNum(round.raiseAud);
  const targetEsop = Math.max(0, Math.min(0.6, safeNum(round.esopTopUpPct) / 100));
  const investorName = round.leadInvestorName?.trim() || "New investor";

  const currentShares = Math.max(1, sumShares(cleaned));
  const currentEsop = cleaned
    .filter(isEsopHolder)
    .reduce((acc, h) => acc + h.shares, 0);

  // Round multiple: raise / preMoney (k). When preMoney is 0 we degrade
  // gracefully — investorShares becomes 0, esop top-up still solvable.
  const k = preMoney > 0 ? raise / preMoney : 0;
  const denom = 1 - targetEsop * (1 + k);

  let esopAdded = 0;
  if (denom > 0.0001) {
    const raw =
      (targetEsop * (1 + k) * currentShares - currentEsop) / denom;
    esopAdded = Math.max(0, Math.floor(raw));
  }

  // Post top-up cap (pre-investor) drives the price.
  const sharesPostTopUp = currentShares + esopAdded;
  const newSharePrice = sharesPostTopUp > 0 ? preMoney / sharesPostTopUp : 0;
  const investorShares =
    newSharePrice > 0 ? Math.max(0, Math.floor(raise / newSharePrice)) : 0;

  const totalAfter = sharesPostTopUp + investorShares;
  const safeTotal = Math.max(1, totalAfter);

  // Build the "after" holders list.
  // Each existing row keeps its shares unchanged EXCEPT the ESOP row which
  // absorbs the top-up. We also append a new investor row.
  const afterHolders: Holder[] = cleaned.map((h) =>
    isEsopHolder(h)
      ? { ...h, shares: h.shares + esopAdded }
      : { ...h },
  );

  // If there was no ESOP row to absorb the top-up (founder-only cap table),
  // synthesize one. Defensive: this also catches typos in shareClass.
  const hasEsop = cleaned.some(isEsopHolder);
  if (!hasEsop && esopAdded > 0) {
    afterHolders.push({
      id: "esop",
      name: ESOP_NAME,
      shares: esopAdded,
      shareClass: "esop",
    });
  }

  if (investorShares > 0) {
    afterHolders.push({
      id: "new-investor",
      name: investorName,
      shares: investorShares,
      shareClass: "preferred",
    });
  }

  const beforeTotal = Math.max(1, currentShares);

  // Per-holder diff rows. We match by id; new investor rows have no "before".
  const rows: CapTableDiff["rows"] = afterHolders.map((after) => {
    const before = cleaned.find((c) => c.id === after.id);
    const sharesBefore = before?.shares ?? 0;
    const sharesAfter = after.shares;
    const pctBefore = (sharesBefore / beforeTotal) * 100;
    const pctAfter = (sharesAfter / safeTotal) * 100;
    return {
      name: after.name,
      sharesBefore,
      sharesAfter,
      pctBefore,
      pctAfter,
      deltaPct: pctAfter - pctBefore,
      isFounder: after.isFounder,
      isNewInvestor: after.id === "new-investor",
      isEsop: isEsopHolder(after),
    };
  });

  const foundersBeforeShares = cleaned
    .filter((h) => h.isFounder)
    .reduce((acc, h) => acc + h.shares, 0);
  const foundersAfterShares = afterHolders
    .filter((h) => h.isFounder)
    .reduce((acc, h) => acc + h.shares, 0);
  const esopAfterShares = afterHolders
    .filter(isEsopHolder)
    .reduce((acc, h) => acc + h.shares, 0);

  const foundersBeforePct = (foundersBeforeShares / beforeTotal) * 100;
  const foundersAfterPct = (foundersAfterShares / safeTotal) * 100;
  const investorPct = (investorShares / safeTotal) * 100;
  const esopAfterPct = (esopAfterShares / safeTotal) * 100;

  const plainEnglish = buildPlainEnglish({
    preMoney,
    raise,
    foundersBeforePct,
    foundersAfterPct,
    targetEsopPct: targetEsop * 100,
    esopAfterPct,
    investorPct,
    investorName,
  });

  return {
    before: { holders: cleaned, totalShares: currentShares },
    after: { holders: afterHolders, totalShares: totalAfter },
    pricing: {
      preMoneyAud: preMoney,
      postMoneyAud: preMoney + raise,
      newSharesIssued: investorShares + esopAdded,
      newSharePriceAud: newSharePrice,
      esopShareesAdded: esopAdded,
      investorShares,
    },
    rows,
    summary: {
      foundersBeforePct,
      foundersAfterPct,
      investorPct,
      esopAfterPct,
    },
    plainEnglish,
  };
}

/**
 * Round-Sizing Simulator (T0180) — companion to computeDiff().
 *
 * Given today's cash position and monthly burn, recommend a raise size that
 * hits the founder's target runway. Follows the standard AU seed-to-Series-A
 * convention: aim for 18–24 months post-close, size for the target midpoint,
 * and add a buffer for burn-rate creep as headcount scales after the raise.
 *
 * Pure, deterministic, side-effect free. No AI or network calls.
 */

export type RunwayVerdict = "critical" | "tight" | "healthy" | "comfortable";

export interface RoundSizingInput {
  /** Current monthly burn in AUD (opex - revenue, positive number). */
  monthlyBurnAud: number;
  /** Cash in the bank right now, AUD. */
  currentCashAud: number;
  /**
   * Target runway after closing the round, in months. Defaults to 21 —
   * midpoint of the AU 18–24 month convention.
   */
  targetRunwayMonths?: number;
  /**
   * Expected post-raise monthly burn multiplier (headcount scales after
   * capital lands). Defaults to 1.5x today's burn — a conservative-but-
   * standard assumption for a seed/Series-A hire ramp.
   */
  postRaiseBurnMultiplier?: number;
  /**
   * Safety buffer above the modelled requirement (e.g. 0.2 = 20% extra).
   * Defaults to 0.15 — enough for one bad quarter without a bridge.
   */
  bufferPct?: number;
}

export interface RoundSizingResult {
  /** Recommended raise (AUD), midpoint of the low/high band. */
  recommendedRaiseAud: number;
  /** Minimum viable raise — hits 18 months at today's burn (no scale-up). */
  minRaiseAud: number;
  /** Comfort raise — hits 24 months at post-raise burn with buffer. */
  maxRaiseAud: number;
  /** Runway months implied by the recommended raise at post-raise burn. */
  targetRunwayMonths: number;
  /** Runway months implied by today's cash alone (no raise). */
  currentRunwayMonths: number;
  currentRunwayVerdict: RunwayVerdict;
  rationale: string;
  assumptions: {
    postRaiseBurnAud: number;
    bufferPct: number;
    postRaiseBurnMultiplier: number;
  };
}

/**
 * Recommend a raise size for a given burn + runway target. Handles
 * pre-revenue (currentCashAud=0), no-burn (returns comfortable verdict with
 * zero raise), and NaN/negative inputs (clamped to 0) defensively.
 */
export function suggestRoundSize(input: RoundSizingInput): RoundSizingResult {
  const burn = safeNum(input.monthlyBurnAud);
  const cash = safeNum(input.currentCashAud);
  const finiteOr = (n: number | undefined, fallback: number): number =>
    typeof n === "number" && Number.isFinite(n) ? n : fallback;
  const targetMonths = Math.max(6, Math.min(36, finiteOr(input.targetRunwayMonths, 21)));
  const multiplier = Math.max(1, Math.min(3, finiteOr(input.postRaiseBurnMultiplier, 1.5)));
  const buffer = Math.max(0, Math.min(0.5, finiteOr(input.bufferPct, 0.15)));

  // No burn → the founder is default-alive; recommend nothing.
  if (burn <= 0) {
    return {
      recommendedRaiseAud: 0,
      minRaiseAud: 0,
      maxRaiseAud: 0,
      targetRunwayMonths: targetMonths,
      currentRunwayMonths: cash > 0 ? Number.POSITIVE_INFINITY : 0,
      currentRunwayVerdict: "comfortable",
      rationale:
        "Zero monthly burn — you're default-alive. No raise required. Revisit once headcount or infrastructure costs kick in.",
      assumptions: { postRaiseBurnAud: 0, bufferPct: buffer, postRaiseBurnMultiplier: multiplier },
    };
  }

  const postRaiseBurn = burn * multiplier;
  const currentRunway = cash / burn;
  const currentRunwayVerdict: RunwayVerdict =
    currentRunway < 6 ? "critical"
    : currentRunway < 12 ? "tight"
    : currentRunway < 18 ? "healthy"
    : "comfortable";

  // Min: 18 months of runway at today's burn (assumes team stays flat).
  const minNeed = Math.max(0, 18 * burn - cash);
  // Recommended: targetMonths at post-raise burn, with buffer.
  const midNeed = Math.max(0, targetMonths * postRaiseBurn * (1 + buffer) - cash);
  // Max: 24 months at post-raise burn with buffer.
  const maxNeed = Math.max(0, 24 * postRaiseBurn * (1 + buffer) - cash);

  const round = (n: number): number => Math.round(n / 50_000) * 50_000;
  const recommended = round(midNeed);
  const impliedRunway = postRaiseBurn > 0 ? (cash + recommended) / postRaiseBurn : targetMonths;

  const m = (n: number): string => `A$${(n / 1_000_000).toFixed(2)}M`;
  const rationale =
    `At A$${Math.round(burn / 1_000)}k/mo burn today you have ${currentRunway.toFixed(1)} months of runway ` +
    `(${currentRunwayVerdict}). Sized for ${targetMonths} months post-close at ${multiplier.toFixed(1)}x burn ` +
    `(A$${Math.round(postRaiseBurn / 1_000)}k/mo) plus ${Math.round(buffer * 100)}% buffer, ` +
    `you should raise ${m(recommended)} (band: ${m(round(minNeed))}–${m(round(maxNeed))}).`;

  return {
    recommendedRaiseAud: recommended,
    minRaiseAud: round(minNeed),
    maxRaiseAud: round(maxNeed),
    targetRunwayMonths: Math.round(impliedRunway * 10) / 10,
    currentRunwayMonths: Math.round(currentRunway * 10) / 10,
    currentRunwayVerdict,
    rationale,
    assumptions: {
      postRaiseBurnAud: Math.round(postRaiseBurn),
      bufferPct: buffer,
      postRaiseBurnMultiplier: multiplier,
    },
  };
}

function buildPlainEnglish(args: {
  preMoney: number;
  raise: number;
  foundersBeforePct: number;
  foundersAfterPct: number;
  targetEsopPct: number;
  esopAfterPct: number;
  investorPct: number;
  investorName: string;
}): string {
  const m = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
  const p = (n: number) => `${n.toFixed(1)}%`;
  const founderDelta = args.foundersBeforePct - args.foundersAfterPct;
  const top = `At a ${m(args.preMoney)} pre-money raising ${m(args.raise)}, founders dilute from ${p(args.foundersBeforePct)} to ${p(args.foundersAfterPct)} (a ${p(founderDelta)} drop).`;
  const esop = `The ESOP pool lands at ${p(args.esopAfterPct)} post-money (target ${p(args.targetEsopPct)}), funded pre-money so existing holders absorb the top-up.`;
  const inv = `${args.investorName} receives ${p(args.investorPct)} of the post-money cap table — board seat assumed but not modelled.`;
  const close = founderDelta > 25
    ? `Heavy round for the founder team — consider negotiating a smaller pool or a higher pre-money.`
    : founderDelta > 15
      ? `Standard AU seed-to-Series-A dilution — within market range.`
      : `Light dilution for this raise — likely a strong pre-money or small round.`;
  return [top, esop, inv, close].join(" ");
}
