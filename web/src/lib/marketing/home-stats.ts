/** Snapshot-backed statistics. Legacy property names are retained, but
 * startupsScored counts analysis rows and evaluatorOrgs counts user accounts,
 * never distinct companies/organisations. Unmeasured or stale traction is null.
 * Per-source timestamps keep historical research figures separate from traction.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { countersFromSnapshot, nonNegInt, sumCountRecord, hasSnapshotWarning } from "@/lib/traction/platform-counters";
import { TRACTION_MAX_AGE_MS } from "@/lib/traction/status";

export interface HomeStatFigures {
  /** Stored svi_analyses rows, including reruns and potentially QA records. */
  startupsScored: number | null;
  /** Open AU register rows ingested (ABR bulk etc.). */
  registerSignals: number | null;
  /** Spearman ρ, pooled: round stage / valuation. */
  backtestRhoRound: number | null;
  backtestRhoValuation: number | null;
  /** Evaluator user accounts bucketed by plan; not distinct organisations. */
  evaluatorOrgs: number | null;
  /** Oldest contributing source date; never presents an old figure as new. */
  asAt: string | null;
  sourceDates: { traction: string | null; signals: string | null; backtest: string | null };
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
  now: number = Date.now(),
): HomeStatFigures {
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value))
    && Date.parse(value) <= now ? value : null;
  const counters = countersFromSnapshot(traction, now);
  const users = (traction?.users ?? {}) as Record<string, unknown>;
  const evaluatorOrgs = counters && traction && nonNegInt(users.total) !== null
    && !hasSnapshotWarning(traction, ["app_users:"]) ? sumCountRecord(users.evaluators_by_plan) : null;
  // Inserted rows in one run are not the total register inventory. An unknown
  // source count means the combined total is unavailable, not silently partial.
  const sources = signals?.sources;
  const counts = Array.isArray(sources) ? sources.map(s => nonNegInt(s?.row_count)) : null;
  const signalDate = date(signals?.ran_at);
  const registerSignals = signalDate && counts && counts.every(c => c !== null)
    ? nonNegInt(counts.reduce<number>((sum, c) => sum + c!, 0)) : null;
  const rho = (backtest?.rho ?? {}) as Record<string, unknown>;
  const validRho = (v: unknown) => { const n = num(v); return n !== null && Math.abs(n) <= 1 ? n : null; };
  const backtestDate = date(backtest?.generated_at);
  const backtestRhoRound = backtestDate ? validRho(rho.round_pooled) : null;
  const backtestRhoValuation = backtestDate ? validRho(rho.valuation_pooled) : null;
  const sourceDates = {
    traction: counters && (counters.analyses !== null || evaluatorOrgs !== null) ? date(traction?.generated_at) : null,
    signals: registerSignals === null ? null : signalDate,
    backtest: backtestRhoRound === null && backtestRhoValuation === null ? null : backtestDate,
  };
  const dates = Object.values(sourceDates).filter((d): d is string => d !== null).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { startupsScored: counters?.analyses ?? null, registerSignals,
    backtestRhoRound, backtestRhoValuation, evaluatorOrgs,
    asAt: dates[0]?.slice(0, 10) ?? null, sourceDates };

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

let cached: { key: string; figures: HomeStatFigures; at: number; expires: number } | undefined;

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
export function readHomeStats(root: string = process.cwd(), now: number = Date.now()): HomeStatFigures {
  const key = `${root}|${statsCacheKey(root)}`;
  if (cached && cached.key === key && now >= cached.at && now < cached.expires) return cached.figures;
  const figures = homeStatsFrom(
    readJson(root, HOME_STATS_FILES.traction),
    readJson(root, HOME_STATS_FILES.signals),
    readJson(root, HOME_STATS_FILES.backtest),
    now,
  );
  const tractionDate = figures.sourceDates.traction;
  cached = { key, figures, at: now, expires: tractionDate ? Date.parse(tractionDate) + TRACTION_MAX_AGE_MS : now + 60_000 };
  return figures;
}
