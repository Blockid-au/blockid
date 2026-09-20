#!/usr/bin/env npx tsx
/**
 * SVI backtest v0 runner (G14-S39).
 *
 *   npm run backtest             → writes content/reports/svi-backtest-latest.json
 *                                  + appends content/reports/svi-backtest-history.jsonl
 *   npm run backtest -- --dry    → prints the report, writes nothing
 *   npm run backtest -- --json   → prints the full JSON instead of the summary
 *
 * Scores every curated comparable (`lib/data/au-comparables-backtest.ts`)
 * with `computeSVI()` at confidence `document_uploaded` and publishes
 * Spearman ρ + bootstrap CI + the quartile bucket table (pure maths in
 * `lib/backtest/run-backtest.ts`). Re-run whenever `svi-analysis.ts`
 * changes — the JSON carries `svi_version` + `git_sha` so the page can say
 * which engine the numbers belong to.
 *
 * Outcome figures: the curated rows are the source of truth. When the
 * `au_comparable_raises` table (migration 0402) is reachable — SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY in the environment or in web/.env — its verified
 * rows FILL a null `roundAud` / `valuationAud` for a curated row with the
 * same name and stage (never overwrite a curated number; never add a row,
 * because a table row has no curated pre-raise profile). The report's
 * `outcome_source` records whether that happened.
 *
 * The heavy lifting is exported (`main`) so `scripts/backtest/run.test.ts`
 * can run it against a synthetic fixture in a temp dir.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AU_COMPARABLES_BACKTEST, type BacktestRow, type BacktestStage } from "@/lib/data/au-comparables-backtest";
import { historyLine, runBacktest, type BacktestReport } from "@/lib/backtest/run-backtest";
import { SVI_BACKTEST_FILE, SVI_BACKTEST_HISTORY_FILE } from "@/lib/backtest/latest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** web/ — the directory `content/reports/` lives under. */
export const WEB_ROOT = path.resolve(HERE, "..", "..");

export interface TableRaiseRow {
  name: string;
  stage: string;
  amount_aud: number | string | null;
  post_money_aud: number | string | null;
}

export interface MainOptions {
  root?: string;
  rows?: readonly BacktestRow[];
  dry?: boolean;
  now?: Date;
  gitSha?: string;
  /** Injected for tests; default reads the verified view when env allows. */
  loadTable?: () => Promise<TableRaiseRow[] | null>;
  log?: (line: string) => void;
}

function nameKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fill null outcomes from table rows with the same (name, stage). Pure; returns the rows it changed. */
export function mergeTableOutcomes(
  rows: readonly BacktestRow[],
  table: readonly TableRaiseRow[],
): { rows: BacktestRow[]; filled: Array<{ company: string; field: "roundAud" | "valuationAud"; value: number }> } {
  const filled: Array<{ company: string; field: "roundAud" | "valuationAud"; value: number }> = [];
  const byKey = new Map<string, TableRaiseRow[]>();
  for (const t of table) {
    const k = `${nameKey(t.name)}|${t.stage}`;
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const merged = rows.map((row) => {
    const candidates = byKey.get(`${nameKey(row.company)}|${row.stage as BacktestStage}`) ?? [];
    if (!candidates.length) return row;
    let { roundAud, valuationAud } = row.outcome;
    for (const c of candidates) {
      if (roundAud === null) {
        const v = num(c.amount_aud);
        if (v !== null) {
          roundAud = v;
          filled.push({ company: row.company, field: "roundAud", value: v });
        }
      }
      if (valuationAud === null) {
        const v = num(c.post_money_aud);
        if (v !== null) {
          valuationAud = v;
          filled.push({ company: row.company, field: "valuationAud", value: v });
        }
      }
    }
    if (roundAud === row.outcome.roundAud && valuationAud === row.outcome.valuationAud) return row;
    return { ...row, outcome: { ...row.outcome, roundAud, valuationAud } };
  });
  return { rows: merged, filled };
}

/** SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the env, else from web/.env(.runtime) — never sourced as shell. */
function envKey(root: string, key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  for (const f of [".env", ".env.runtime"]) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    const line = readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (line) return line.slice(key.length + 1).replace(/^"|"$/g, "").trim();
  }
  return undefined;
}

async function defaultLoadTable(root: string): Promise<TableRaiseRow[] | null> {
  const url = envKey(root, "SUPABASE_URL");
  const key = envKey(root, "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("v_au_comparable_raises_verified")
      .select("name,stage,amount_aud,post_money_aud")
      .limit(5000);
    if (error) return null;
    return (data ?? []) as TableRaiseRow[];
  } catch {
    return null;
  }
}

function gitShaOf(root: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export function summary(report: BacktestReport): string {
  const ci = (c: { low: number; high: number } | null) => (c ? `[${c.low.toFixed(2)}, ${c.high.toFixed(2)}]` : "n/a");
  const lines = [
    `SVI backtest v0 — engine ${report.svi_version} @ ${report.git_sha} — ${report.generated_at}`,
    `N = ${report.n} scorable (${report.n_with_round} with round, ${report.n_with_valuation} with valuation) of ${report.n_dataset} curated rows; ${report.n_excluded_source_rows} source rows excluded`,
    `ρ(SVI, log round)     pooled = ${report.rho.round_pooled ?? "n/a"}  95% CI ${ci(report.ci.round_pooled)}`,
    `ρ(SVI, log valuation) pooled = ${report.rho.valuation_pooled ?? "n/a"}  95% CI ${ci(report.ci.valuation_pooled)}`,
    "by stage (round):",
    ...Object.entries(report.rho.round_by_stage).map(
      ([s, c]) => `  ${s.padEnd(9)} n=${String(c.n).padStart(2)}  ρ=${c.rho ?? `n/a (${c.reason})`}  CI ${ci(report.ci.round_by_stage[s] ?? null)}  [${report.publication_by_stage[s]?.band ?? "none"}]`,
    ),
    // G21 P1-C: a bucket under the publication floor (n < 10) has no median; 10–29 is indicative.
    "buckets (SVI quartile → median round, publication band):",
    ...report.buckets.map(
      (b) => `  ${b.label.padEnd(18)} n=${b.n}  SVI ${b.svi_min}–${b.svi_max}  median ${b.median_round_aud === null ? "suppressed" : `A$${b.median_round_aud.toLocaleString("en-AU")}`}  [${b.publication.label}]`,
    ),
    `outcome_source = ${report.outcome_source}`,
  ];
  return lines.join("\n");
}

export async function main(opts: MainOptions = {}): Promise<{ report: BacktestReport; wrote: string[] }> {
  const root = opts.root ?? WEB_ROOT;
  const log = opts.log ?? ((l: string) => console.log(l));
  let rows: readonly BacktestRow[] = opts.rows ?? AU_COMPARABLES_BACKTEST;
  let outcomeSource = "static";
  const table = await (opts.loadTable ? opts.loadTable() : defaultLoadTable(root));
  if (table && table.length) {
    const merged = mergeTableOutcomes(rows, table);
    rows = merged.rows;
    outcomeSource = merged.filled.length ? `static+table(${merged.filled.length} filled)` : "static (table read, nothing to fill)";
  }
  const report = runBacktest({
    rows,
    now: opts.now,
    gitSha: opts.gitSha ?? gitShaOf(root),
    outcomeSource,
  });
  const wrote: string[] = [];
  if (!opts.dry) {
    const latest = path.join(root, SVI_BACKTEST_FILE);
    const history = path.join(root, SVI_BACKTEST_HISTORY_FILE);
    mkdirSync(path.dirname(latest), { recursive: true });
    writeFileSync(latest, `${JSON.stringify(report, null, 2)}\n`);
    appendFileSync(history, `${JSON.stringify(historyLine(report))}\n`);
    wrote.push(latest, history);
  }
  log(summary(report));
  return { report, wrote };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const dry = process.argv.includes("--dry");
  const json = process.argv.includes("--json");
  main({ dry, log: json ? () => {} : undefined })
    .then(({ report, wrote }) => {
      if (json) console.log(JSON.stringify(report, null, 2));
      else if (wrote.length) console.log(`wrote ${wrote.map((w) => path.relative(WEB_ROOT, w)).join(", ")}`);
    })
    .catch((err) => {
      console.error("[backtest] failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
