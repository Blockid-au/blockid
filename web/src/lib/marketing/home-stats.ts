/**
 * Homepage proof strip — four live figures read at BUILD/ISR time from the
 * content JSONs that the crons already publish (G17 D3 block 5). No client
 * fetch: the band is static, CLS-free and cannot show a spinner.
 *
 *   startups scored     content/reports/traction-snapshot.json   analyses.svi_analyses
 *   register signals    content/reports/external-signals-latest.json  Σ sources[].row_count
 *   backtest ρ          content/reports/svi-backtest-latest.json  rho.round_pooled / valuation_pooled
 *   evaluator orgs      traction-snapshot.json                    Σ users.evaluators_by_plan
 *
 * The same sources feed /api/platform-stats (traction) and /methodology
 * (backtest, signals), so the homepage can never disagree with them. A
 * figure whose file is missing or malformed renders as "—" with its label
 * intact; `null` never throws (SOURCE-OF-TRUTH: empty until real).
 *
 * Pure reducers are exported for the colocated test; `readHomeStats()` is
 * the only fs touch.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface HomeStatFigures {
  /** Startup Value Index analyses on the platform (QA / seeded excluded). */
  startupsScored: number | null;
  /** Open AU register rows ingested (ABR bulk etc.). */
  registerSignals: number | null;
  /** Spearman ρ, pooled: round stage / valuation. */
  backtestRhoRound: number | null;
  backtestRhoValuation: number | null;
  /** Evaluator organisations on a plan (angel / advisor / VC / accelerator). */
  evaluatorOrgs: number | null;
  /** ISO date of the newest source file, for the caption. */
  asAt: string | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readJson(root: string, rel: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path.join(root, rel), "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Pure — reduce the three JSONs to the figures. Any of them may be null. */
export function homeStatsFrom(
  traction: Record<string, unknown> | null,
  signals: Record<string, unknown> | null,
  backtest: Record<string, unknown> | null,
): HomeStatFigures {
  const analyses = (traction?.analyses ?? {}) as Record<string, unknown>;
  const users = (traction?.users ?? {}) as Record<string, unknown>;
  const byPlan = users.evaluators_by_plan;
  let evaluatorOrgs: number | null = null;
  if (byPlan && typeof byPlan === "object" && !Array.isArray(byPlan)) {
    evaluatorOrgs = 0;
    for (const v of Object.values(byPlan as Record<string, unknown>)) evaluatorOrgs += Math.max(0, num(v) ?? 0);
  }

  let registerSignals: number | null = null;
  const sources = signals?.sources;
  if (Array.isArray(sources)) {
    registerSignals = 0;
    for (const s of sources) {
      const row = (s ?? {}) as Record<string, unknown>;
      registerSignals += Math.max(0, num(row.row_count) ?? num(row.inserted) ?? 0);
    }
  }

  const rho = (backtest?.rho ?? {}) as Record<string, unknown>;

  const dates = [traction?.generated_at, signals?.ran_at, backtest?.generated_at]
    .filter((d): d is string => typeof d === "string" && !Number.isNaN(Date.parse(d)))
    .sort();

  return {
    startupsScored: num(analyses.svi_analyses),
    registerSignals,
    backtestRhoRound: num(rho.round_pooled),
    backtestRhoValuation: num(rho.valuation_pooled),
    evaluatorOrgs,
    asAt: dates.length ? dates[dates.length - 1]!.slice(0, 10) : null,
  };
}

/** "12,827" — en-AU grouping, no decimals; "—" for null. */
export function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(n);
}

/** "0.76 / 0.94" — two decimals each; "—" when neither is known. */
export function formatRhoPair(round: number | null, valuation: number | null): string {
  if (round === null && valuation === null) return "—";
  const f = (v: number | null) => (v === null ? "—" : v.toFixed(2));
  return `${f(round)} / ${f(valuation)}`;
}

export const HOME_STATS_FILES = {
  traction: path.join("content", "reports", "traction-snapshot.json"),
  signals: path.join("content", "reports", "external-signals-latest.json"),
  backtest: path.join("content", "reports", "svi-backtest-latest.json"),
} as const;

let cached: { key: string; figures: HomeStatFigures } | undefined;

function statsCacheKey(root: string): string {
  // Keyed on the three files' mtimes so ISR (`revalidate = 300`) picks up the
  // crons' daily rewrites instead of freezing figures until the next deploy
  // (review 2026-09-19).
  return Object.values(HOME_STATS_FILES)
    .map((rel) => {
      try {
        return String(statSync(path.join(root, rel)).mtimeMs);
      } catch {
        return "0";
      }
    })
    .join("|");
}

/** Cached per (root, file mtimes) — the page is static + ISR. */
export function readHomeStats(root: string = process.cwd()): HomeStatFigures {
  const key = `${root}|${statsCacheKey(root)}`;
  if (cached && cached.key === key) return cached.figures;
  const figures = homeStatsFrom(
    readJson(root, HOME_STATS_FILES.traction),
    readJson(root, HOME_STATS_FILES.signals),
    readJson(root, HOME_STATS_FILES.backtest),
  );
  cached = { key, figures };
  return figures;
}
