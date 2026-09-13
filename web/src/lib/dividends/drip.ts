// Dividend reinvestment plan (DRIP) — pure allocation maths (S28-A).
//
// For one shareholder's distribution statement:
//
//   reinvestable = net cash × participation %          (rounded to cents)
//   shares       = floor(reinvestable ÷ price)         (whole shares only)
//   reinvested   = shares × price                      (cents)
//   residual     = reinvestable − reinvested           (paid in cash)
//   cash paid    = net cash − reinvested
//
// Guards: a zero / negative / non-finite price, a 0 % election or no net
// cash never allocates a share — the whole dividend is paid in cash and
// `reason` says why. No `server-only`, no I/O: the issue flow, the DRIP
// panel preview and the suites all call `computeDripAllocation` on plain
// numbers.

import { formatSharePriceAud, roundCents } from "./statement";

export { formatSharePriceAud };

export type DripPriceBasis = "share_price_mid" | "manual";

export const DRIP_PRICE_BASES: readonly DripPriceBasis[] = ["share_price_mid", "manual"] as const;

export interface DripAllocationInput {
  /** The shareholder's net cash dividend (gross − TFN withheld), AUD. */
  netCashAud: number;
  /** 0–100. */
  participationPct: number;
  /** A$ per share; null / 0 / non-finite → nothing is reinvested. */
  priceAud: number | null | undefined;
}

export type DripSkipReason = "no_price" | "zero_participation" | "no_cash" | "below_one_share";

export interface DripAllocation {
  /** True when at least one share is allotted. */
  ok: boolean;
  reason: DripSkipReason | null;
  participationPct: number;
  netCashAud: number;
  /** net cash × participation %, cents. */
  reinvestableAud: number;
  priceAud: number;
  shares: number;
  /** shares × price, cents. */
  reinvestedAud: number;
  /** reinvestable − reinvested, paid in cash. */
  residualAud: number;
  /** net cash − reinvested — what the shareholder actually receives in cash. */
  cashPaidAud: number;
}

export function clampParticipation(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/** A usable DRIP price: finite and strictly positive, else null. */
export function usablePrice(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cashOnly(net: number, pct: number, price: number, reason: DripSkipReason): DripAllocation {
  return { ok: false, reason, participationPct: pct, netCashAud: net, reinvestableAud: 0, priceAud: price, shares: 0, reinvestedAud: 0, residualAud: 0, cashPaidAud: net };
}

export function computeDripAllocation(input: DripAllocationInput): DripAllocation {
  const net = roundCents(Math.max(0, Number.isFinite(input.netCashAud) ? input.netCashAud : 0));
  const pct = clampParticipation(input.participationPct);
  const price = usablePrice(input.priceAud);
  if (price === null) return cashOnly(net, pct, 0, "no_price");
  if (pct <= 0) return cashOnly(net, pct, price, "zero_participation");
  if (net <= 0) return cashOnly(net, pct, price, "no_cash");

  const reinvestable = roundCents(net * (pct / 100));
  // 1e-9 nudge: 0.30 / 0.10 is 2.9999999999999996 in binary floating point.
  const shares = Math.floor(reinvestable / price + 1e-9);
  if (shares < 1) return { ...cashOnly(net, pct, price, "below_one_share"), reinvestableAud: reinvestable, residualAud: reinvestable };
  const reinvested = roundCents(shares * price);
  const residual = roundCents(reinvestable - reinvested);
  return {
    ok: true,
    reason: null,
    participationPct: pct,
    netCashAud: net,
    reinvestableAud: reinvestable,
    priceAud: price,
    shares,
    reinvestedAud: reinvested,
    residualAud: Math.max(0, residual),
    cashPaidAud: roundCents(net - reinvested),
  };
}

/** The price an election resolves to: its manual price, or the market mid. */
export function electionPrice(election: { priceBasis: DripPriceBasis; manualPriceAud: number | null }, marketMidAud: number | null | undefined): number | null {
  if (election.priceBasis === "manual") return usablePrice(election.manualPriceAud);
  return usablePrice(marketMidAud);
}

/** Plain-English skip reason for the panel / statement. */
export function dripSkipLabel(reason: DripSkipReason | null): string | null {
  switch (reason) {
    case "no_price":
      return "no usable share price — paid in cash";
    case "zero_participation":
      return "0% participation — paid in cash";
    case "no_cash":
      return "no net cash to reinvest";
    case "below_one_share":
      return "reinvestable amount is below one share — paid in cash";
    default:
      return null;
  }
}
