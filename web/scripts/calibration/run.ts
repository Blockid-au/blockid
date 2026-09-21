#!/usr/bin/env npx tsx
/**
 * Score → outcome calibration runner (G21 P3-A).
 *
 *   npm run calibration             → writes content/reports/calibration-latest.json
 *                                     + appends content/reports/calibration-history.jsonl
 *   npm run calibration -- --dry    → prints the summary, writes nothing
 *   npm run calibration -- --json   → prints the full JSON instead of the summary
 *
 * Reads every `svi_snapshots` row (project_id, snapshot_date, svi_total,
 * evidence_confidence, stage) and every CONFIRMED `startup_outcomes` row
 * (migration 0427) through the service-role client (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY from the environment or web/.env), then
 * publishes per cohort (stage × quarter of T0) the observed outcome rate by
 * SVI band and by Evidence Confidence band under the n-rules — pure maths in
 * `lib/calibration/compute.ts`. The JSON carries `svi_version` +
 * `git_sha` + `method_version` so the page can say which engine and which
 * method the numbers belong to, and the `limitations` block verbatim.
 *
 * Nothing here forecasts: the words in the output are "association",
 * "observed rate", "interval". `main` is exported so
 * `scripts/calibration/run.test.ts` can run it against a synthetic fixture
 * in a temp dir.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calibrationHistoryLine, computeCalibration, type CalibrationOutcomeInput, type CalibrationReport, type CalibrationSnapshotInput } from "@/lib/calibration/compute";
import { CALIBRATION_FILE, CALIBRATION_HISTORY_FILE } from "@/lib/calibration/latest";
import { SVI_VERSION } from "@/lib/svi-analysis";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** web/ — the directory `content/reports/` lives under. */
export const WEB_ROOT = path.resolve(HERE, "..", "..");

export interface CalibrationSource {
  snapshots: CalibrationSnapshotInput[];
  outcomes: CalibrationOutcomeInput[];
  /** Which reads failed (a missing 0427 table reads as zero outcomes, never a crash). */
  warnings: string[];
}

export interface MainOptions {
  root?: string;
  dry?: boolean;
  now?: Date;
  gitSha?: string;
  /** Injected for tests; default reads the two tables when env allows. */
  load?: () => Promise<CalibrationSource>;
  log?: (line: string) => void;
}

/** SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the env, else from web/.env(.runtime) — never sourced as shell, never printed. */
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

const PAGE = 1000;

async function defaultLoad(root: string): Promise<CalibrationSource> {
  const url = envKey(root, "SUPABASE_URL");
  const key = envKey(root, "SUPABASE_SERVICE_ROLE_KEY");
  const out: CalibrationSource = { snapshots: [], outcomes: [], warnings: [] };
  if (!url || !key) {
    out.warnings.push("supabase not configured — nothing read");
    return out;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  // Page through snapshots (bounded at 50 pages = 50k rows).
  for (let from = 0; from < PAGE * 50; from += PAGE) {
    const { data, error } = await sb.from("svi_snapshots").select("project_id, snapshot_date, svi_total, evidence_confidence, stage").not("project_id", "is", null).order("snapshot_date", { ascending: true }).range(from, from + PAGE - 1);
    if (error) {
      out.warnings.push(`svi_snapshots: ${error.message}`);
      break;
    }
    const rows = (data ?? []) as CalibrationSnapshotInput[];
    out.snapshots.push(...rows);
    if (rows.length < PAGE) break;
  }
  for (let from = 0; from < PAGE * 20; from += PAGE) {
    const { data, error } = await sb.from("startup_outcomes").select("project_id, kind, observed_at, status").eq("status", "confirmed").order("observed_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) {
      out.warnings.push(`startup_outcomes: ${error.message}`);
      break;
    }
    const rows = (data ?? []) as CalibrationOutcomeInput[];
    out.outcomes.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function gitShaOf(root: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Human summary for the terminal / cron log. */
export function summary(r: CalibrationReport, warnings: string[]): string {
  const lines = [
    `calibration ${r.method_version} · SVI ${r.svi_version} · ${r.git_sha} · ${r.generated_at}`,
    `companies with a snapshot: ${r.totals.companies_with_snapshot} · eligible (≥ ${r.horizon_days} d): ${r.totals.companies_eligible} · with a confirmed outcome: ${r.totals.companies_with_outcome} · confirmed outcomes: ${r.totals.confirmed_outcomes}`,
    `cohorts: ${r.totals.cohorts_total} (published ${r.totals.cohorts_published}, suppressed under n = 10: ${r.totals.cohorts_suppressed})`,
  ];
  for (const c of r.cohorts.filter((x) => x.published)) {
    const rate = c.outcome_rate === null ? "—" : `${Math.round(c.outcome_rate * 100)}%`;
    const ci = c.ci95 ? ` [${Math.round(c.ci95.low * 100)}–${Math.round(c.ci95.high * 100)}%]` : c.companies < 30 ? " indicative" : "";
    lines.push(`  ${c.period} stage ${c.stage}: n = ${c.companies}, outcome rate ${rate}${ci} · ${c.by_svi_band.map((b) => `${b.band} ${b.label}`).join(" · ")}`);
  }
  if (r.totals.cohorts_published === 0) lines.push("  nothing published — fewer than 10 eligible companies in every cohort");
  for (const w of warnings) lines.push(`  warning: ${w}`);
  return lines.join("\n");
}

export async function main(opts: MainOptions = {}): Promise<{ report: CalibrationReport; warnings: string[]; wrote: boolean }> {
  const root = opts.root ?? WEB_ROOT;
  const log = opts.log ?? ((l: string) => console.log(l));
  const now = opts.now ?? new Date();
  const source = await (opts.load ? opts.load() : defaultLoad(root));
  const report = computeCalibration({ snapshots: source.snapshots, outcomes: source.outcomes, now }, { sviVersion: SVI_VERSION, gitSha: opts.gitSha ?? gitShaOf(root) });
  if (opts.dry) {
    log(summary(report, source.warnings));
    return { report, warnings: source.warnings, wrote: false };
  }
  const latest = path.join(root, CALIBRATION_FILE);
  mkdirSync(path.dirname(latest), { recursive: true });
  writeFileSync(latest, `${JSON.stringify(report, null, 2)}\n`);
  appendFileSync(path.join(root, CALIBRATION_HISTORY_FILE), `${calibrationHistoryLine(report)}\n`);
  log(summary(report, source.warnings));
  log(`wrote ${CALIBRATION_FILE} + ${CALIBRATION_HISTORY_FILE}`);
  return { report, warnings: source.warnings, wrote: true };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const dry = process.argv.includes("--dry");
  const json = process.argv.includes("--json");
  main({ dry, log: json ? () => {} : undefined })
    .then(({ report }) => {
      if (json) console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error("[calibration] failed", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
