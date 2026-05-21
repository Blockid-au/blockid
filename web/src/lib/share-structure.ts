// Share structure computation engine (server + client safe).
//
// Handles two share valuation modes:
//   1. Fixed Shares: total authorized constant, price floats with SVI
//   2. Dynamic Shares: price fixed at nominal, shares increase with valuation
//
// Integrates with the valuation engine (valuation.ts) for SVI → AUD conversion.

import { computeSharePrice as basicSharePrice } from "./vesting";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShareMode = "fixed_shares" | "dynamic_shares";

export interface ShareStructureConfig {
  mode: ShareMode;
  authorizedShares: number;
  sharePriceAud: number | null;
  valuationAud: number | null;
  lastSviScore: number | null;
  autoRecompute: boolean;
}

export interface SharePriceResult {
  pricePerShare: number;
  totalShares: number;
  valuationAud: number;
  mode: ShareMode;
  priceChangeFromLast: number | null; // percentage change
}

export interface ShareAllocation {
  shareholderName: string;
  ownershipPct: number;
  shares: number;
  valueAud: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AUTHORIZED_SHARES = 10_000_000;
const DEFAULT_NOMINAL_PRICE = 0.001;

// ---------------------------------------------------------------------------
// Compute share price from SVI and config
// ---------------------------------------------------------------------------

export function computeSharePriceFromSVI(
  sviScore: number,
  config: ShareStructureConfig,
): SharePriceResult {
  const { priceAud, valuationAud } = basicSharePrice(sviScore, config.authorizedShares || DEFAULT_AUTHORIZED_SHARES);

  if (config.mode === "fixed_shares") {
    const totalShares = config.authorizedShares || DEFAULT_AUTHORIZED_SHARES;
    const pricePerShare = totalShares > 0 ? valuationAud / totalShares : 0;
    const priceChange = config.sharePriceAud
      ? ((pricePerShare - config.sharePriceAud) / config.sharePriceAud) * 100
      : null;

    return {
      pricePerShare: round6(pricePerShare),
      totalShares,
      valuationAud,
      mode: "fixed_shares",
      priceChangeFromLast: priceChange ? round2(priceChange) : null,
    };
  }

  // Dynamic shares mode: price fixed, shares float
  const nominalPrice = DEFAULT_NOMINAL_PRICE;
  const totalShares = nominalPrice > 0 ? Math.floor(valuationAud / nominalPrice) : DEFAULT_AUTHORIZED_SHARES;
  const priceChange = config.sharePriceAud && config.sharePriceAud !== nominalPrice
    ? ((nominalPrice - config.sharePriceAud) / config.sharePriceAud) * 100
    : null;

  return {
    pricePerShare: nominalPrice,
    totalShares,
    valuationAud,
    mode: "dynamic_shares",
    priceChangeFromLast: priceChange ? round2(priceChange) : null,
  };
}

// ---------------------------------------------------------------------------
// Compute share allocation for a given ownership percentage
// ---------------------------------------------------------------------------

export function computeShareAllocation(
  ownershipPct: number,
  priceResult: SharePriceResult,
): ShareAllocation {
  const shares = Math.floor((ownershipPct / 100) * priceResult.totalShares);
  const valueAud = round2(shares * priceResult.pricePerShare);

  return {
    shareholderName: "",
    ownershipPct,
    shares,
    valueAud,
  };
}

// ---------------------------------------------------------------------------
// Compute all shareholders' allocations
// ---------------------------------------------------------------------------

export function computeAllAllocations(
  shareholders: Array<{ name: string; ownershipPct: number }>,
  priceResult: SharePriceResult,
): ShareAllocation[] {
  return shareholders.map(sh => {
    const alloc = computeShareAllocation(sh.ownershipPct, priceResult);
    return { ...alloc, shareholderName: sh.name };
  });
}

// ---------------------------------------------------------------------------
// Check if SVI change warrants recompute
// ---------------------------------------------------------------------------

export function shouldRecompute(
  currentSVI: number,
  lastSVI: number | null,
  threshold: number = 5,
): boolean {
  if (lastSVI === null) return true;
  return Math.abs(currentSVI - lastSVI) >= threshold;
}

// ---------------------------------------------------------------------------
// Default config for a new startup
// ---------------------------------------------------------------------------

export function getDefaultShareStructure(): ShareStructureConfig {
  return {
    mode: "fixed_shares",
    authorizedShares: DEFAULT_AUTHORIZED_SHARES,
    sharePriceAud: null,
    valuationAud: null,
    lastSviScore: null,
    autoRecompute: true,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function round6(val: number): number {
  return Math.round(val * 1_000_000) / 1_000_000;
}
