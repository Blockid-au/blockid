// SVI backtest v0 — pure runner (G14-S39).
//
// Takes the curated comparable rows (`lib/data/au-comparables-backtest.ts`),
// scores each pre-raise profile with `computeSVI()` at evidence confidence
// pinned to `document_uploaded`, and reports:
//
//   - Spearman ρ of SVI vs log(round size) and vs log(valuation), pooled and
//     within stage (a stage needs ≥ MIN_STAGE_N rows to get a ρ);
//   - percentile-bootstrap 95 % CIs (1,000 seeded resamples);
//   - a bucket table: SVI quartile → median / p25 / p75 round, n;
//   - the caveats the page renders verbatim.
//
// Pure: no I/O, no clock — `scripts/backtest/run.ts` supplies `now` and the
// git sha and writes the JSON. Claim scope is rank calibration only (every
// row raised → survivorship); see the goal doc F-8.

import {
  AU_COMPARABLES_BACKTEST,
  BACKTEST_STAGES,
  EXCLUDED_SOURCE_ROWS,
  scorableBacktestRows,
  type BacktestRow,
  type BacktestStage,
} from "@/lib/data/au-comparables-backtest";
import { computeSVI, SVI_VERSION, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { bootstrapSpearmanCI, median, quantile, rankBuckets, spearman, type BootstrapCI } from "./spearman";

export const BACKTEST_CONFIDENCE_LEVEL = "document_uploaded" as const;
/** A stage bucket needs this many rows before a within-stage ρ is reported. */
export const MIN_STAGE_N = 5;
export const BOOTSTRAP_RESAMPLES = 1000;
export const BOOTSTRAP_SEED = 20260916;

export type BacktestTarget = "round" | "valuation";

export interface RhoCell {
  n: number;
  rho: number | null;
  /** Why ρ is null when it is (`n<5`, `constant`); absent when ρ is a number. */
  reason?: "too_few" | "degenerate";
}

export interface CiCell {
  low: number;
  high: number;
  resamples: number;
  effective: number;
}

export interface BucketRow {
  quartile: 1 | 2 | 3 | 4;
  label: string;
  n: number;
  svi_min: number;
  svi_max: number;
  median_round_aud: number | null;
  p25_round_aud: number | null;
  p75_round_aud: number | null;
  n_valuation: number;
  median_valuation_aud: number | null;
}

export interface BacktestRowUsed {
  company: string;
  stage: BacktestStage;
  asOf: string;
  svi: number;
  svi_stage: number;
  roundAud: number | null;
  valuationAud: number | null;
  confidence: BacktestRow["confidence"];
}

export interface BacktestReport {
  generated_at: string;
  svi_version: string;
  git_sha: string;
  claim: "rank_calibration_only";
  confidence_level: typeof BACKTEST_CONFIDENCE_LEVEL;
  /** Scorable rows (≥ 1 outcome number). */
  n: number;
  n_dataset: number;
  n_excluded_source_rows: number;
  n_with_round: number;
  n_with_valuation: number;
  n_next_round_known: number;
  n_by_stage: Record<string, number>;
  rho: {
    round_pooled: number | null;
    valuation_pooled: number | null;
    round_by_stage: Record<string, RhoCell>;
    valuation_by_stage: Record<string, RhoCell>;
  };
  ci: {
    round_pooled: CiCell | null;
    valuation_pooled: CiCell | null;
    round_by_stage: Record<string, CiCell | null>;
    valuation_by_stage: Record<string, CiCell | null>;
  };
  buckets: BucketRow[];
  caveats: string[];
  outcome_source: string;
  rows_used: BacktestRowUsed[];
}

export interface RunBacktestOptions {
  rows?: readonly BacktestRow[];
  now?: Date;
  gitSha?: string;
  sviVersion?: string;
  resamples?: number;
  seed?: number;
  outcomeSource?: string;
  excludedCount?: number;
}

const DEFAULT_SIGNALS: SVIExtractedSignals = {
  hasCoFounder: false,
  founderExperience: "first-time",
  founderSectorFit: false,
  hasAdvisors: false,
  marketSize: "unknown",
  problemClarity: "vague",
  hasCustomerInterviews: false,
  isAIWrapper: false,
  hasMoat: false,
  hasNetworkEffect: false,
  hasDataAdvantage: false,
  hasSwitchingCosts: false,
  hasProduct: false,
  hasDemo: false,
  hasSourceCode: false,
  hasWebsite: false,
  hasApp: false,
  hasRevenue: false,
  revenueBand: "pre-revenue",
  hasCustomers: false,
  hasSocialProof: false,
  hasAnalytics: false,
  hasCapTable: false,
  hasVesting: false,
  hasShareholdersAgreement: false,
  hasBoardCadence: false,
  hasFinancialAudit: false,
  esopAllocated: false,
  hasPitchDeck: false,
  hasFinancialModel: false,
  hasDataRoom: false,
  targetRaiseMentioned: false,
  raiseMentioned: false,
  hasABN: false,
  hasIPProtection: false,
  hasContracts: false,
  hasLegalDocs: false,
  evidenceLevel: "self_declared",
};

/** Every key of `SVIExtractedSignals` (required + optional) — the dataset test checks profiles against it. */
export const SVI_SIGNAL_KEYS: readonly (keyof SVIExtractedSignals)[] = [
  ...(Object.keys(DEFAULT_SIGNALS) as (keyof SVIExtractedSignals)[]),
  "sector", "mrrAud", "arrAud", "revenueMonths", "revenueKind", "raiseAskAud", "statedCapAud", "statedCapKind", "pilotRevenueAud", "pilotCount",
];

/** The engine's no-evidence defaults + the curated profile, confidence pinned. */
export function profileToSignals(profile: Partial<SVIExtractedSignals>, sector?: string): SVIExtractedSignals {
  return { ...DEFAULT_SIGNALS, ...(sector ? { sector } : {}), ...profile, evidenceLevel: BACKTEST_CONFIDENCE_LEVEL };
}

/** Score one row. Deterministic: same profile → same SVI. */
export function scoreRow(row: BacktestRow): { svi: number; stage: number } {
  const analysis = computeSVI(profileToSignals(row.preRaiseProfile, row.sector));
  return { svi: analysis.totalSVI, stage: analysis.stage };
}

export function backtestCaveats(n: number, nByStage: Record<string, number>): string[] {
  const thin = BACKTEST_STAGES.filter((s) => (nByStage[s] ?? 0) > 0 && (nByStage[s] ?? 0) < MIN_STAGE_N);
  return [
    "Survivorship: every row in this set raised. It says nothing about startups that pitched and did not raise, so ρ cannot be read as predictive power; v1 adds a control group after S40.",
    "Hand-curated profiles: each pre-raise profile was written by a curator from public sources as of the raise, not from the founder's own evidence. Fields with no public fact were left at the engine's no-evidence default, which is why most rows score below the live median for their stage.",
    `N is small (${n} scorable rows). Stage buckets with fewer than ${MIN_STAGE_N} rows report no ρ${thin.length ? ` (${thin.join(", ")})` : ""}; every interval is a percentile bootstrap of ${BOOTSTRAP_RESAMPLES.toLocaleString("en-AU")} seeded resamples and is wide.`,
    "Rank-only claim: ρ measures whether a higher SVI went with a larger round or valuation inside this set. It is not a valuation model, not a prediction of any single startup's round, and not financial advice.",
    "Source figures are taken as written from the two hand-entered comparable tables (AUD approximations near the announcement date). Where the two tables disagree the row notes it; nothing was corrected or invented, and a missing figure stays null.",
    "Stage labels follow the source tables — 'Series B' is a 'Series B or later' bucket in one of them — so within-stage results mix lettered rounds.",
  ];
}

function logOf(values: readonly number[]): number[] {
  return values.map((v) => Math.log(v));
}

function rhoCell(x: number[], y: number[]): RhoCell {
  if (x.length < MIN_STAGE_N) return { n: x.length, rho: null, reason: "too_few" };
  const rho = spearman(x, logOf(y));
  return rho === null ? { n: x.length, rho: null, reason: "degenerate" } : { n: x.length, rho: round4(rho) };
}

function ciCell(x: number[], y: number[], resamples: number, seed: number): CiCell | null {
  if (x.length < MIN_STAGE_N) return null;
  const ci: BootstrapCI | null = bootstrapSpearmanCI(x, logOf(y), { resamples, seed });
  return ci ? { low: round4(ci.low), high: round4(ci.high), resamples: ci.resamples, effective: ci.effective } : null;
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

function pairs(rows: readonly BacktestRowUsed[], target: BacktestTarget): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const r of rows) {
    const v = target === "round" ? r.roundAud : r.valuationAud;
    if (v !== null && Number.isFinite(v) && v > 0) {
      x.push(r.svi);
      y.push(v);
    }
  }
  return { x, y };
}

export function bucketTable(rows: readonly BacktestRowUsed[]): BucketRow[] {
  const withRound = rows.filter((r) => r.roundAud !== null && r.roundAud > 0);
  if (withRound.length === 0) return [];
  const buckets = rankBuckets(withRound.map((r) => r.svi), 4);
  const LABEL: Record<number, string> = { 1: "Q1 (lowest SVI)", 2: "Q2", 3: "Q3", 4: "Q4 (highest SVI)" };
  const out: BucketRow[] = [];
  for (const q of [1, 2, 3, 4] as const) {
    const members = withRound.filter((_, i) => buckets[i] === q);
    if (members.length === 0) continue;
    const rounds = members.map((r) => r.roundAud as number);
    const vals = members.map((r) => r.valuationAud).filter((v): v is number => v !== null && v > 0);
    out.push({
      quartile: q,
      label: LABEL[q],
      n: members.length,
      svi_min: Math.min(...members.map((r) => r.svi)),
      svi_max: Math.max(...members.map((r) => r.svi)),
      median_round_aud: Math.round(median(rounds) as number),
      p25_round_aud: Math.round(quantile(rounds, 0.25)),
      p75_round_aud: Math.round(quantile(rounds, 0.75)),
      n_valuation: vals.length,
      median_valuation_aud: vals.length ? Math.round(median(vals) as number) : null,
    });
  }
  return out;
}

export function runBacktest(opts: RunBacktestOptions = {}): BacktestReport {
  const dataset = opts.rows ?? AU_COMPARABLES_BACKTEST;
  const scorable = scorableBacktestRows(dataset);
  const resamples = opts.resamples ?? BOOTSTRAP_RESAMPLES;
  const seed = opts.seed ?? BOOTSTRAP_SEED;

  const used: BacktestRowUsed[] = scorable.map((row) => {
    const { svi, stage } = scoreRow(row);
    return {
      company: row.company,
      stage: row.stage,
      asOf: row.asOf,
      svi,
      svi_stage: stage,
      roundAud: row.outcome.roundAud,
      valuationAud: row.outcome.valuationAud,
      confidence: row.confidence,
    };
  });

  const nByStage: Record<string, number> = {};
  for (const s of BACKTEST_STAGES) {
    const n = used.filter((r) => r.stage === s).length;
    if (n > 0) nByStage[s] = n;
  }

  const pooledRound = pairs(used, "round");
  const pooledVal = pairs(used, "valuation");

  const roundByStage: Record<string, RhoCell> = {};
  const valByStage: Record<string, RhoCell> = {};
  const roundCiByStage: Record<string, CiCell | null> = {};
  const valCiByStage: Record<string, CiCell | null> = {};
  for (const s of BACKTEST_STAGES) {
    const rows = used.filter((r) => r.stage === s);
    if (rows.length === 0) continue;
    const pr = pairs(rows, "round");
    const pv = pairs(rows, "valuation");
    roundByStage[s] = rhoCell(pr.x, pr.y);
    valByStage[s] = rhoCell(pv.x, pv.y);
    roundCiByStage[s] = roundByStage[s].rho === null ? null : ciCell(pr.x, pr.y, resamples, seed);
    valCiByStage[s] = valByStage[s].rho === null ? null : ciCell(pv.x, pv.y, resamples, seed);
  }

  const pooledRoundRho = rhoCell(pooledRound.x, pooledRound.y);
  const pooledValRho = rhoCell(pooledVal.x, pooledVal.y);

  return {
    generated_at: (opts.now ?? new Date()).toISOString(),
    svi_version: opts.sviVersion ?? SVI_VERSION,
    git_sha: opts.gitSha ?? "unknown",
    claim: "rank_calibration_only",
    confidence_level: BACKTEST_CONFIDENCE_LEVEL,
    n: used.length,
    n_dataset: dataset.length,
    n_excluded_source_rows: opts.excludedCount ?? EXCLUDED_SOURCE_ROWS.length,
    n_with_round: pooledRound.x.length,
    n_with_valuation: pooledVal.x.length,
    n_next_round_known: scorable.filter((r) => r.outcome.nextRoundWithin24m !== null).length,
    n_by_stage: nByStage,
    rho: {
      round_pooled: pooledRoundRho.rho,
      valuation_pooled: pooledValRho.rho,
      round_by_stage: roundByStage,
      valuation_by_stage: valByStage,
    },
    ci: {
      round_pooled: pooledRoundRho.rho === null ? null : ciCell(pooledRound.x, pooledRound.y, resamples, seed),
      valuation_pooled: pooledValRho.rho === null ? null : ciCell(pooledVal.x, pooledVal.y, resamples, seed),
      round_by_stage: roundCiByStage,
      valuation_by_stage: valCiByStage,
    },
    buckets: bucketTable(used),
    caveats: backtestCaveats(used.length, nByStage),
    outcome_source: opts.outcomeSource ?? "static",
    rows_used: used,
  };
}

/** One JSONL history line — the headline numbers only. */
export function historyLine(report: BacktestReport): Record<string, unknown> {
  return {
    ts: report.generated_at,
    svi_version: report.svi_version,
    git_sha: report.git_sha,
    n: report.n,
    n_with_round: report.n_with_round,
    n_with_valuation: report.n_with_valuation,
    rho_round: report.rho.round_pooled,
    rho_valuation: report.rho.valuation_pooled,
    ci_round: report.ci.round_pooled ? [report.ci.round_pooled.low, report.ci.round_pooled.high] : null,
    ci_valuation: report.ci.valuation_pooled ? [report.ci.valuation_pooled.low, report.ci.valuation_pooled.high] : null,
    outcome_source: report.outcome_source,
  };
}
