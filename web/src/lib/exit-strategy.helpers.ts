/**
 * Exit Strategy Core Helpers — Week 2 Implementation
 *
 * Production-ready library for exit planning:
 * 1. computeDilutionProgression — multi-round cap table projection
 * 2. estimateFounderExitPayout — per-founder exit economics
 * 3. suggestAcquirers — sector-matched acquirer profiles
 * 4. computeExitReadiness — 4-checkpoint readiness scoring
 * 5. formatExitScenarioForInvestorPack — markdown/JSON export
 *
 * All functions are deterministic, side-effect-free, and tested to 70%+ coverage.
 */

import { computeDiff, type CapTableDiff, type Holder, type Round } from "./cap-table";
import { type SVIIndexResult } from "./svi-index";
import { getAuComparableExits, type AuExit, type AuExitSector } from "./exits/au-benchmark";

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface CapTableProjection {
  round: "seed" | "series-a" | "series-b" | "exit";
  preMoneyValuation: number;
  postMoneyValuation: number;
  founderStakePct: number;
  esopPct: number;
  investorPct: number;
  dilution: CapTableDiff;
}

export interface FounderExitPayout {
  founderName: string;
  stakeAtExit: number; // percentage (0-100)
  grossPayout: number; // AUD
  costBase: number; // estimated cost basis (AUD)
  cgtGain: number; // capital gain (AUD)
  cgtEstimate: number; // 50% discount + 47% rate (AUD)
  netPayout: number; // gross - CGT (AUD)
  confidence: "high" | "medium" | "low";
}

export interface AcquirerProfile {
  label: string; // e.g. "AU SaaS Strategic (2016–2024)"
  buyerType: string;
  countOfDeals: number;
  medianValuationAud: number;
  medianRevenueMultiple: number | null;
  valuationRangeMin: number;
  valuationRangeMax: number;
  structureNotes: string;
}

export interface ExitReadinessCheckpoint {
  name: string;
  score: number; // 0-100
  weight: number; // contribution to overall (0-1)
  description: string;
  gaps: string[];
}

export interface ExitReadinessAssessment {
  checkpoints: ExitReadinessCheckpoint[];
  overallScore: number; // 0-100 weighted
  band: "not_ready" | "developing" | "ready" | "exceptional";
  criticalGaps: string[];
  recommendations: string[];
}

export interface Chapter11Fragment {
  markdown: string;
  json: {
    timelineMonths: number;
    capTableMilestones: Array<{ round: string; valuation: number }>;
    founderPayouts: FounderExitPayout[];
    acquirerCount: number;
    readinessBand: string;
    riskFlags: string[];
  };
}

// ─── Constants ────────────────────────────────────────────────────────────

const CGT_DISCOUNT_RATE = 0.5; // 50% CGT discount if held > 12 months
const MARGINAL_TAX_RATE = 0.47; // 45% top rate + 2% Medicare levy
const DEFAULT_COST_BASE_PER_SHARE = 0.01; // AUD, estimated

// Readiness weights: sum to 1.0
const READINESS_WEIGHTS = {
  productMaturity: 0.25,
  revenueScale: 0.25,
  teamStability: 0.25,
  marketFit: 0.25,
};

// ─── Function 1: computeDilutionProgression ──────────────────────────────────

/**
 * Projects a multi-round cap table from seed through exit, computing
 * founder dilution evolution across rounds.
 *
 * Returns a chronological array of snapshots, each with pre/post-money
 * valuations and stakeholder percentages.
 */
export function computeDilutionProgression(
  currentCapTable: Holder[],
  seriesAParams?: {
    preMoneyAud: number;
    raiseAud: number;
    esopTopUpPct?: number;
    leadInvestorName?: string;
  },
  seriesBParams?: {
    preMoneyAud: number;
    raiseAud: number;
    esopTopUpPct?: number;
    leadInvestorName?: string;
  },
  targetExitValuation?: number,
  targetEsopPoolPct?: number,
): CapTableProjection[] {
  const projections: CapTableProjection[] = [];

  // Snapshot 0: Seed (current cap table)
  const seedTotal = currentCapTable.reduce((acc, h) => acc + h.shares, 0) || 1;
  const seedEsop = currentCapTable.find((h) => h.id === "esop")?.shares || 0;
  const seedFounders = currentCapTable
    .filter((h) => h.isFounder)
    .reduce((acc, h) => acc + h.shares, 0);

  projections.push({
    round: "seed",
    preMoneyValuation: 0, // no pre-money at seed
    postMoneyValuation: 0, // placeholder; we'll infer from later rounds if available
    founderStakePct: (seedFounders / seedTotal) * 100,
    esopPct: (seedEsop / seedTotal) * 100,
    investorPct: 0, // founders + ESOP at seed
    dilution: {
      before: { holders: [], totalShares: 0 },
      after: { holders: currentCapTable, totalShares: seedTotal },
      pricing: {
        preMoneyAud: 0,
        postMoneyAud: 0,
        newSharesIssued: 0,
        newSharePriceAud: 0,
        esopShareesAdded: 0,
        investorShares: 0,
      },
      rows: [],
      summary: {
        foundersBeforePct: 0,
        foundersAfterPct: (seedFounders / seedTotal) * 100,
        investorPct: 0,
        esopAfterPct: (seedEsop / seedTotal) * 100,
      },
      plainEnglish: "Seed stage cap table (founder + angel + ESOP)",
    },
  });

  let workingCapTable = currentCapTable;
  let workingValuation = 0;

  // Series A
  if (seriesAParams) {
    const round: Round = {
      preMoneyAud: seriesAParams.preMoneyAud,
      raiseAud: seriesAParams.raiseAud,
      esopTopUpPct: seriesAParams.esopTopUpPct ?? (targetEsopPoolPct || 12),
      esopTimingPreMoney: true,
      leadInvestorName: seriesAParams.leadInvestorName || "Series A Investor",
    };

    const diff = computeDiff(workingCapTable, round);
    workingCapTable = diff.after.holders;
    workingValuation = round.preMoneyAud + round.raiseAud;

    projections.push({
      round: "series-a",
      preMoneyValuation: round.preMoneyAud,
      postMoneyValuation: workingValuation,
      founderStakePct: diff.summary.foundersAfterPct,
      esopPct: diff.summary.esopAfterPct,
      investorPct: diff.summary.investorPct,
      dilution: diff,
    });
  }

  // Series B
  if (seriesBParams) {
    const round: Round = {
      preMoneyAud: seriesBParams.preMoneyAud,
      raiseAud: seriesBParams.raiseAud,
      esopTopUpPct: seriesBParams.esopTopUpPct ?? (targetEsopPoolPct || 12),
      esopTimingPreMoney: true,
      leadInvestorName: seriesBParams.leadInvestorName || "Series B Investor",
    };

    const diff = computeDiff(workingCapTable, round);
    workingCapTable = diff.after.holders;
    workingValuation = round.preMoneyAud + round.raiseAud;

    projections.push({
      round: "series-b",
      preMoneyValuation: round.preMoneyAud,
      postMoneyValuation: workingValuation,
      founderStakePct: diff.summary.foundersAfterPct,
      esopPct: diff.summary.esopAfterPct,
      investorPct: diff.summary.investorPct,
      dilution: diff,
    });
  }

  // Exit snapshot
  if (targetExitValuation && targetExitValuation > 0) {
    const exitTotal = workingCapTable.reduce((acc, h) => acc + h.shares, 0) || 1;
    const exitFounders = workingCapTable
      .filter((h) => h.isFounder)
      .reduce((acc, h) => acc + h.shares, 0);
    const exitEsop = workingCapTable
      .filter((h) => h.id === "esop")
      .reduce((acc, h) => acc + h.shares, 0);

    projections.push({
      round: "exit",
      preMoneyValuation: targetExitValuation, // at exit, pre-money ≈ valuation
      postMoneyValuation: targetExitValuation,
      founderStakePct: (exitFounders / exitTotal) * 100,
      esopPct: (exitEsop / exitTotal) * 100,
      investorPct: 100 - (exitFounders / exitTotal) * 100 - (exitEsop / exitTotal) * 100,
      dilution: {
        before: { holders: [], totalShares: 0 },
        after: { holders: workingCapTable, totalShares: exitTotal },
        pricing: {
          preMoneyAud: targetExitValuation,
          postMoneyAud: targetExitValuation,
          newSharesIssued: 0,
          newSharePriceAud: exitTotal > 0 ? targetExitValuation / exitTotal : 0,
          esopShareesAdded: 0,
          investorShares: 0,
        },
        rows: [],
        summary: {
          foundersBeforePct: 0,
          foundersAfterPct: (exitFounders / exitTotal) * 100,
          investorPct: 0,
          esopAfterPct: (exitEsop / exitTotal) * 100,
        },
        plainEnglish: `Exit at A$${(targetExitValuation / 1_000_000).toFixed(1)}M valuation`,
      },
    });
  }

  return projections;
}

// ─── Function 2: estimateFounderExitPayout ───────────────────────────────────

/**
 * Estimates a single founder's exit payout: gross, CGT, and net.
 *
 * Assumes 50% CGT discount if held > 12 months and applies 47% marginal
 * tax rate (45% top rate + 2% Medicare levy).
 */
export function estimateFounderExitPayout(
  founderName: string,
  dilutionProgression: CapTableProjection[],
  exitValuation: number,
): FounderExitPayout {
  if (!dilutionProgression.length) {
    return {
      founderName,
      stakeAtExit: 0,
      grossPayout: 0,
      costBase: 0,
      cgtGain: 0,
      cgtEstimate: 0,
      netPayout: 0,
      confidence: "low",
    };
  }

  const exitRound = dilutionProgression.find((p) => p.round === "exit") ||
    dilutionProgression[dilutionProgression.length - 1] || { founderStakePct: 0 };

  // Find the founder's specific stake percentage from the cap table
  const exitCapTable =
    dilutionProgression.find((p) => p.round === "exit")?.dilution.after.holders ||
    dilutionProgression[dilutionProgression.length - 1]?.dilution.after.holders || [];
  const founderExitShares = exitCapTable
    .filter((h) => h.isFounder && h.name === founderName)
    .reduce((acc, h) => acc + h.shares, 0);

  const exitTotal = exitCapTable.reduce((acc, h) => acc + h.shares, 0) || 1;
  const stakeAtExit = (founderExitShares / exitTotal) * 100;
  const grossPayout = (stakeAtExit / 100) * exitValuation;

  // Estimate cost base: founders typically hold from seed (≈$0 cost) but we
  // conservatively estimate at a small per-share cost from any early rounds.
  const seedCapTable =
    dilutionProgression.find((p) => p.round === "seed")?.dilution.after.holders || [];
  const founderSeedShares = seedCapTable
    .filter((h) => h.isFounder && h.name === founderName)
    .reduce((acc, h) => acc + h.shares, 0);

  const totalFounderCostBase = Math.max(
    founderSeedShares,
    founderExitShares,
  ) * DEFAULT_COST_BASE_PER_SHARE;

  const cgtGain = Math.max(0, grossPayout - totalFounderCostBase);
  const taxableGain = CGT_DISCOUNT_RATE * cgtGain;
  const cgtEstimate = taxableGain * MARGINAL_TAX_RATE;
  const netPayout = grossPayout - cgtEstimate;

  return {
    founderName,
    stakeAtExit,
    grossPayout: Math.round(grossPayout * 100) / 100,
    costBase: Math.round(totalFounderCostBase * 100) / 100,
    cgtGain: Math.round(cgtGain * 100) / 100,
    cgtEstimate: Math.round(cgtEstimate * 100) / 100,
    netPayout: Math.round(netPayout * 100) / 100,
    confidence: founderExitShares > 0 ? "high" : "low",
  };
}

// ─── Function 3: suggestAcquirers ────────────────────────────────────────────

/**
 * Suggests 2–3 anonymized acquirer profiles matched to sector and valuation.
 *
 * Filters AU_EXITS benchmark data by sector, computes aggregate stats,
 * and returns anonymized labels ("AU SaaS Strategic (2016–2024)" not "Atlassian").
 */
export function suggestAcquirers(
  sector: string,
  targetExitValuation: number,
  auExitsFixture: AuExit[] = getAuComparableExits(),
): AcquirerProfile[] {
  // Map sector string to AuExitSector
  const sectorMap: Record<string, AuExitSector> = {
    saas: "saas",
    fintech: "fintech",
    marketplace: "marketplace",
    healthtech: "healthtech",
    edtech: "edtech",
    deeptech: "deeptech",
    cyber: "cyber",
    logistics: "logistics",
    media: "media",
    adtech: "adtech",
  };

  const mappedSector = sectorMap[sector.toLowerCase()] || sector.toLowerCase();

  // Filter by sector
  const sectorExits = auExitsFixture.filter((e) =>
    e.sector === mappedSector || e.sector === (mappedSector as AuExitSector),
  );

  if (sectorExits.length === 0) {
    return [];
  }

  // Group by buyer type
  const byBuyerType: Record<string, AuExit[]> = {};
  for (const exit of sectorExits) {
    if (!byBuyerType[exit.buyerType]) {
      byBuyerType[exit.buyerType] = [];
    }
    byBuyerType[exit.buyerType].push(exit);
  }

  // Generate profiles
  const profiles: AcquirerProfile[] = [];

  // Sort buyer types by frequency (most common first)
  const sortedBuyerTypes = Object.entries(byBuyerType)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3) // top 3 buyer types
    .map(([type]) => type);

  for (const buyerType of sortedBuyerTypes) {
    const exits = byBuyerType[buyerType];
    const valuations = exits.map((e) => e.valuationAud);
    const multiples = exits
      .map((e) => e.revenueMultiple)
      .filter((m): m is number => m !== null);

    const sorted = [...valuations].sort((a, b) => a - b);
    const median = (arr: number[]) => {
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 === 0
        ? (arr[mid - 1] + arr[mid]) / 2
        : arr[mid];
    };

    const medianValuation = median(sorted);
    const medianMultiple = multiples.length > 0 ? median([...multiples].sort((a, b) => a - b)) : null;
    const minVal = sorted[0] || 0;
    const maxVal = sorted[sorted.length - 1] || 0;

    // Label anonymization
    const yearRange = `${Math.min(...exits.map((e) => e.year))}-${Math.max(...exits.map((e) => e.year))}`;
    const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1);
    const typeLabel = buyerType.charAt(0).toUpperCase() + buyerType.slice(1);
    const label = `AU ${sectorLabel} ${typeLabel} (${yearRange})`;

    // Structure notes
    const structures = Array.from(new Set(exits.map((e) => e.structure))).slice(0, 2);
    const structureNotes = structures.join(", ");

    profiles.push({
      label,
      buyerType,
      countOfDeals: exits.length,
      medianValuationAud: Math.round(medianValuation),
      medianRevenueMultiple: medianMultiple ? Math.round(medianMultiple * 10) / 10 : null,
      valuationRangeMin: Math.round(minVal),
      valuationRangeMax: Math.round(maxVal),
      structureNotes,
    });
  }

  return profiles.slice(0, 3);
}

// ─── Function 4: computeExitReadiness ────────────────────────────────────────

/**
 * Scores exit readiness across 4 checkpoints: product maturity, revenue scale,
 * team stability, and market fit. Returns band classification and critical gaps.
 *
 * Band: <55 = not_ready, 55–70 = developing, 70–85 = ready, 85+ = exceptional
 */
export function computeExitReadiness(
  sviAnalysis: SVIIndexResult | null,
  currentRevenue: number,
  targetExitValuation: number,
  targetRevenueAtExit: number,
  teamSize: number,
  keyPersonRisks: string[] = [],
): ExitReadinessAssessment {
  const checkpoints: ExitReadinessCheckpoint[] = [];

  // Checkpoint 1: Product Maturity (PTD + TRE avg, inferred from SVI tier)
  let productMaturityScore = 50;
  const productGaps: string[] = [];

  if (sviAnalysis) {
    // Map SVI tier to product maturity
    const tier = sviAnalysis.tier;
    if (tier.includes("Unicorn")) productMaturityScore = 95;
    else if (tier.includes("Exceptional")) productMaturityScore = 85;
    else if (tier.includes("Elite")) productMaturityScore = 75;
    else if (tier.includes("Outstanding")) productMaturityScore = 70;
    else if (tier.includes("Strong")) productMaturityScore = 65;
    else if (tier.includes("Baseline")) productMaturityScore = 60;
    else if (tier.includes("Developing")) productMaturityScore = 50;
    else productMaturityScore = 40;
  } else {
    productGaps.push("Missing SVI analysis — product maturity unverified");
  }

  if (productMaturityScore < 60) {
    productGaps.push("Product-market fit indicators weak");
  }

  checkpoints.push({
    name: "Product Maturity",
    score: productMaturityScore,
    weight: READINESS_WEIGHTS.productMaturity,
    description: `SVI tier-based assessment: ${sviAnalysis?.tier || "unknown"}`,
    gaps: productGaps,
  });

  // Checkpoint 2: Revenue Scale (current revenue / target at exit)
  let revenueScaleScore = 50;
  const revenueGaps: string[] = [];

  if (currentRevenue > 0 && targetRevenueAtExit > 0) {
    const revenueRatio = currentRevenue / targetRevenueAtExit;
    if (revenueRatio >= 0.75) {
      revenueScaleScore = 90;
    } else if (revenueRatio >= 0.5) {
      revenueScaleScore = 75;
    } else if (revenueRatio >= 0.25) {
      revenueScaleScore = 60;
    } else if (revenueRatio > 0) {
      revenueScaleScore = 40;
    }
  } else if (currentRevenue === 0) {
    revenueScaleScore = 30;
    revenueGaps.push("Zero revenue — no operating scale");
  } else {
    revenueGaps.push("Target exit revenue not set");
  }

  checkpoints.push({
    name: "Revenue Scale",
    score: revenueScaleScore,
    weight: READINESS_WEIGHTS.revenueScale,
    description: `Current revenue A$${(currentRevenue / 1_000_000).toFixed(1)}M vs target A$${(targetRevenueAtExit / 1_000_000).toFixed(1)}M`,
    gaps: revenueGaps,
  });

  // Checkpoint 3: Team Stability (team size and key-person risk penalties)
  let teamStabilityScore = 60 + Math.min(20, teamSize / 2); // base 60 + up to 20 for size
  const teamGaps: string[] = [];

  if (teamSize < 3) {
    teamStabilityScore = Math.max(30, teamStabilityScore - 20);
    teamGaps.push("Small team — succession risk");
  }

  // Deduct for each key-person risk
  for (const risk of keyPersonRisks) {
    teamStabilityScore = Math.max(20, teamStabilityScore - 5);
    teamGaps.push(`Key-person risk: ${risk}`);
  }

  checkpoints.push({
    name: "Team Stability",
    score: Math.min(100, teamStabilityScore),
    weight: READINESS_WEIGHTS.teamStability,
    description: `${teamSize} team members; ${keyPersonRisks.length} key-person risks`,
    gaps: teamGaps,
  });

  // Checkpoint 4: Market Fit (valuation multiple check)
  let marketFitScore = 50;
  const marketGaps: string[] = [];

  if (currentRevenue > 0) {
    const currentMultiple = targetExitValuation / currentRevenue;
    // AU SaaS typically exits at 5-15x revenue; fintech/deeptech 3-8x
    if (currentMultiple >= 12) {
      marketFitScore = 90;
    } else if (currentMultiple >= 10) {
      marketFitScore = 85;
    } else if (currentMultiple >= 7) {
      marketFitScore = 75;
    } else if (currentMultiple >= 3) {
      marketFitScore = 65;
    } else if (currentMultiple >= 1) {
      marketFitScore = 50;
    } else {
      marketFitScore = 30;
      marketGaps.push("Valuation multiple < 1x revenue — below market");
    }
  } else {
    marketGaps.push("Cannot compute exit valuation multiple (zero revenue)");
  }

  checkpoints.push({
    name: "Market Fit",
    score: marketFitScore,
    weight: READINESS_WEIGHTS.marketFit,
    description: currentRevenue > 0
      ? `Exit valuation ${(targetExitValuation / currentRevenue).toFixed(1)}x current revenue`
      : "Pre-revenue or zero revenue",
    gaps: marketGaps,
  });

  // Compute overall weighted score
  const overallScore = checkpoints.reduce(
    (acc, cp) => acc + cp.score * cp.weight,
    0,
  );

  // Determine band
  let band: "not_ready" | "developing" | "ready" | "exceptional";
  if (overallScore < 55) {
    band = "not_ready";
  } else if (overallScore < 70) {
    band = "developing";
  } else if (overallScore < 85) {
    band = "ready";
  } else {
    band = "exceptional";
  }

  // Collect critical gaps
  const criticalGaps = checkpoints
    .filter((cp) => cp.score < 60 || cp.gaps.length > 0)
    .flatMap((cp) => cp.gaps);

  // Generate recommendations
  const recommendations: string[] = [];
  if (band === "not_ready") {
    recommendations.push(
      "Extend runway — not in exit-ready state yet.",
      "Focus on product-market fit and revenue scale.",
    );
  }
  if (band === "developing") {
    recommendations.push(
      "Strengthen revenue scale and product maturity.",
      "Build deeper team and reduce key-person risks.",
    );
  }
  if (band === "ready") {
    recommendations.push(
      "Good exit readiness — prepare buyer conversations.",
      "Audit cap table and clean up any legal issues.",
    );
  }
  if (band === "exceptional") {
    recommendations.push(
      "Strong exit position — consider strategic outreach to potential acquirers.",
      "Begin exit process with legal counsel and investment banker.",
    );
  }

  return {
    checkpoints,
    overallScore: Math.round(overallScore * 10) / 10,
    band,
    criticalGaps,
    recommendations,
  };
}

// ─── Function 5: formatExitScenarioForInvestorPack ──────────────────────────────

/**
 * Formats an exit scenario into a markdown fragment + JSON suitable for
 * investor pack PDF rendering. Includes timeline, cap table, founder payouts,
 * acquirer landscape, readiness, and tax disclaimer.
 */
export function formatExitScenarioForInvestorPack(
  scenario: {
    name: string;
    timelineMonths: number;
    targetExitValuation: number;
    targetRevenueAtExit: number;
  },
  dilutionProgression: CapTableProjection[],
  acquirerLandscape: AcquirerProfile[],
  readiness: ExitReadinessAssessment,
): Chapter11Fragment {
  const { name, timelineMonths, targetExitValuation, targetRevenueAtExit } = scenario;

  // Build markdown
  let md = "";

  // Header
  md += `## Exit Scenario: ${name}\n\n`;

  // Timeline
  md += `### Timeline\n\n`;
  md += `**Target exit in ${timelineMonths} months**\n\n`;
  md += `- **Current stage**: Seed/Early\n`;
  md += `- **Target valuation**: A$${(targetExitValuation / 1_000_000).toFixed(1)}M\n`;
  md += `- **Target revenue at exit**: A$${(targetRevenueAtExit / 1_000_000).toFixed(1)}M\n\n`;

  // Cap table progression
  md += `### Cap Table Progression\n\n`;
  md += `| Round | Valuation (Pre) | Valuation (Post) | Founder % | ESOP % | Investor % |\n`;
  md += `|-------|-----------------|------------------|-----------|--------|------------|\n`;

  for (const proj of dilutionProgression) {
    const preM = proj.preMoneyValuation > 0 ? `A$${(proj.preMoneyValuation / 1_000_000).toFixed(1)}M` : "—";
    const postM = proj.postMoneyValuation > 0 ? `A$${(proj.postMoneyValuation / 1_000_000).toFixed(1)}M` : "—";
    const founderPct = proj.founderStakePct.toFixed(1);
    const esopPct = proj.esopPct.toFixed(1);
    const investorPct = proj.investorPct.toFixed(1);

    md += `| ${proj.round.toUpperCase()} | ${preM} | ${postM} | ${founderPct}% | ${esopPct}% | ${investorPct}% |\n`;
  }

  md += `\n`;

  // Founder exit payouts
  md += `### Founder Exit Payouts\n\n`;

  const allFounders = new Set<string>();
  for (const proj of dilutionProgression) {
    for (const holder of proj.dilution.after.holders) {
      if (holder.isFounder && holder.name) {
        allFounders.add(holder.name);
      }
    }
  }

  const founderPayouts: FounderExitPayout[] = [];
  for (const founderName of Array.from(allFounders)) {
    const payout = estimateFounderExitPayout(founderName, dilutionProgression, targetExitValuation);
    founderPayouts.push(payout);
  }

  md += `| Founder | Stake | Gross (A$) | CGT Est. (A$) | Net (A$) |\n`;
  md += `|---------|-------|-----------|---------------|----------|\n`;

  for (const payout of founderPayouts) {
    const stake = payout.stakeAtExit.toFixed(1);
    const gross = (payout.grossPayout / 1_000_000).toFixed(2);
    const cgt = (payout.cgtEstimate / 1_000_000).toFixed(2);
    const net = (payout.netPayout / 1_000_000).toFixed(2);
    md += `| ${payout.founderName} | ${stake}% | $${gross}M | $${cgt}M | $${net}M |\n`;
  }

  md += `\n`;

  // Acquirer landscape
  if (acquirerLandscape.length > 0) {
    md += `### Acquirer Landscape\n\n`;
    md += `Based on AU comparable exits (2016–2024):\n\n`;

    for (const acquirer of acquirerLandscape) {
      md += `**${acquirer.label}** (${acquirer.countOfDeals} deals)\n`;
      md += `- Valuation range: A$${(acquirer.valuationRangeMin / 1_000_000).toFixed(1)}M – A$${(acquirer.valuationRangeMax / 1_000_000).toFixed(1)}M\n`;
      if (acquirer.medianRevenueMultiple !== null) {
        md += `- Median revenue multiple: ${acquirer.medianRevenueMultiple.toFixed(1)}x\n`;
      }
      md += `- Structure: ${acquirer.structureNotes}\n\n`;
    }
  } else {
    md += `### Acquirer Landscape\n\n`;
    md += `No direct comparables found in AU exit benchmark data.\n\n`;
  }

  // Readiness summary
  md += `### Exit Readiness\n\n`;
  md += `**Overall score: ${readiness.overallScore}/100 (${readiness.band})**\n\n`;

  for (const checkpoint of readiness.checkpoints) {
    md += `- **${checkpoint.name}**: ${checkpoint.score}/100 — ${checkpoint.description}\n`;
    if (checkpoint.gaps.length > 0) {
      for (const gap of checkpoint.gaps) {
        md += `  - Gap: ${gap}\n`;
      }
    }
  }

  md += `\n`;

  // Recommendations
  if (readiness.recommendations.length > 0) {
    md += `### Recommendations\n\n`;
    for (const rec of readiness.recommendations) {
      md += `- ${rec}\n`;
    }
    md += `\n`;
  }

  // Tax disclaimer
  md += `### Tax Disclaimer\n\n`;
  md += `This analysis is general information only and does not constitute financial, tax, or legal advice. `;
  md += `CGT estimates assume 50% discount on long-term holdings and 47% top marginal rate (45% + 2% Medicare levy). `;
  md += `Actual outcomes depend on individual circumstances. Consult a qualified tax advisor.\n\n`;

  // Build JSON export
  const jsonData = {
    timelineMonths,
    capTableMilestones: dilutionProgression
      .filter((p) => p.round !== "seed") // exclude seed from milestones
      .map((p) => ({
        round: p.round,
        valuation: p.postMoneyValuation,
      })),
    founderPayouts,
    acquirerCount: acquirerLandscape.length,
    readinessBand: readiness.band,
    riskFlags: readiness.criticalGaps,
  };

  return {
    markdown: md,
    json: jsonData,
  };
}
