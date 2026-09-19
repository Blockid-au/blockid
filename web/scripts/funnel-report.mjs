#!/usr/bin/env node
// G16-A — daily funnel report over analytics_events. Plain node, no deps.
//
//   node scripts/funnel-report.mjs                 # cron 02:50 UTC: daily rows → funnel-daily.jsonl
//   node scripts/funnel-report.mjs --weekly        # cron Mon 03:05 UTC: + Telegram/e-mail summary
//   node scripts/funnel-report.mjs --dry-run --days 14   # read-only: print, write nothing, send nothing
//   node scripts/funnel-report.mjs --json          # machine-readable summary on stdout
//
// What a run does:
//   1. Reads the funnel event names (scripts/lib/funnel-core.mjs FUNNEL_EVENT_NAMES)
//      from analytics_events for the last `--days` (default 28) UTC days through
//      the Supabase REST endpoint with the service-role key (envVal: exported env
//      wins, else web/.env / .env.runtime — the key is never logged).
//   2. Reduces them (QA rows excluded, distinct actors per step) into one row
//      per day → content/reports/funnel-daily.jsonl (one line per date; a
//      re-run REPLACES that date's line rather than appending a duplicate)
//      + content/reports/funnel-latest.json {yesterday, d7, d28, last_signups}
//      which /admin/funnel and the traction snapshot read.
//   3. --weekly: sends the Monday summary via scripts/lib/ops-env.mjs sendTelegram
//      (falls back to the ops e-mail when the bot token is dead).
//
// Lock: /tmp/blockid-funnel-report.lock (pid file, stale-safe). Exit 0 unless it
// genuinely crashes (exit 1) so cron-health stays readable.

import path from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { acquireLock, envVal, sendTelegram, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import {
  FUNNEL_EVENT_NAMES,
  dayString,
  formatWeeklySummary,
  lastSignups,
  reduceDaily,
  reduceFunnel,
  rowsInWindow,
} from "./lib/funnel-core.mjs";

const DAILY = path.join(WEB_DIR, "content", "reports", "funnel-daily.jsonl");
const LATEST = path.join(WEB_DIR, "content", "reports", "funnel-latest.json");
const LOCK = "/tmp/blockid-funnel-report.lock";
const PAGE = 1000;
const MAX_ROWS = 200_000;

export function parseArgs(argv) {
  const out = { dryRun: false, json: false, weekly: false, days: 28, envDir: WEB_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--weekly") out.weekly = true;
    else if (a === "--days") out.days = Math.max(1, Math.min(365, Number(argv[++i]) || 28));
    // Where web/.env lives when running from a worktree that has none.
    else if (a === "--env-dir") out.envDir = path.resolve(argv[++i] ?? WEB_DIR);
  }
  // The weekly summary compares 7 d with the 7 before and quotes 28 d.
  if (out.weekly && out.days < 28) out.days = 28;
  return out;
}

/** Supabase REST base + headers from env (never logged). */
export function restConfig(env = process.env, envDir = WEB_DIR) {
  const url = (envVal("SUPABASE_URL", env, envDir) || envVal("NEXT_PUBLIC_SUPABASE_URL", env, envDir)).replace("supabase-kong", "localhost").replace(/\/$/, "");
  const key = envVal("SUPABASE_SERVICE_ROLE_KEY", env, envDir);
  if (!url || !key) return null;
  return { url, headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" } };
}

/**
 * Page through analytics_events for the funnel event names since `sinceIso`.
 * Exported for the test (fetchImpl injectable).
 */
export async function fetchFunnelRows({ sinceIso, config, fetchImpl = globalThis.fetch, pageSize = PAGE, maxRows = MAX_ROWS }) {
  const names = FUNNEL_EVENT_NAMES.join(",");
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const qs = new URLSearchParams({
      select: "event_id,event_name,user_id,session_id,params,ts,source",
      event_name: `in.(${names})`,
      ts: `gte.${sinceIso}`,
      order: "ts.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const res = await fetchImpl(`${config.url}/rest/v1/analytics_events?${qs.toString()}`, { headers: config.headers });
    if (!res.ok) throw new Error(`analytics_events read failed: HTTP ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error("analytics_events read failed: non-array body");
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/** Existing daily lines keyed by date (malformed lines dropped). */
export function readDaily(file = DAILY) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row.date === "string") map.set(row.date, row);
    } catch {
      // skip
    }
  }
  return map;
}

/** Merge new rows over the existing file (same date → replaced), sorted, atomic. */
export function writeDaily(existing, rows, file = DAILY) {
  const merged = new Map(existing);
  for (const r of rows) merged.set(r.date, r);
  const lines = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => JSON.stringify(r));
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, lines.join("\n") + "\n");
  renameSync(tmp, file);
  return merged.size;
}

/** Build everything the files carry from raw rows — pure, exported for the test. */
export function buildReport(rows, { days, now, generatedAt }) {
  const daily = reduceDaily(rows, { days, now });
  const yesterday = daily[daily.length - 1];
  const d7 = reduceFunnel(rowsInWindow(rows, { days: 7, now }));
  const prev7 = reduceFunnel(rowsInWindow(rows, { days: 7, now, shift: 7 }));
  const d28 = reduceFunnel(rowsInWindow(rows, { days: 28, now }));
  const latest = {
    schema_version: 1,
    generated_at: generatedAt,
    days,
    window: { from: dayString(now, days), to: dayString(now, 1) },
    yesterday,
    d7,
    prev7,
    d28,
    last_signups: lastSignups(rows, 20),
  };
  return { daily, latest };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const now = deps.now ?? Date.now();
  const generatedAt = new Date(now).toISOString();
  const log = deps.log ?? ((m) => process.stdout.write(`${m}\n`));

  const release = args.dryRun ? () => {} : acquireLock(LOCK);
  if (!release) {
    log(`[funnel-report] ${generatedAt} skip: previous run still holds ${LOCK}`);
    return { skipped: "locked" };
  }
  try {
    const config = deps.config !== undefined ? deps.config : restConfig(process.env, args.envDir);
    if (!config) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required (web/.env)");
    // Read one extra day so the oldest daily row is complete whatever the run time.
    const sinceIso = `${dayString(now, args.days)}T00:00:00.000Z`;
    const rows = await fetchFunnelRows({ sinceIso, config, fetchImpl: deps.fetchImpl });
    const { daily, latest } = buildReport(rows, { days: args.days, now, generatedAt });

    const summary = {
      ts: generatedAt,
      dry_run: args.dryRun,
      days: args.days,
      rows: rows.length,
      qa_excluded: latest.d28.qa_excluded,
      window: latest.window,
      totals: {
        signups: daily.reduce((a, r) => a + r.signups, 0),
        analyses: daily.reduce((a, r) => a + r.analyses, 0),
        first_analyses: daily.reduce((a, r) => a + r.first_analyses, 0),
        report_views: daily.reduce((a, r) => a + r.report_views, 0),
        paywall_views: daily.reduce((a, r) => a + r.paywall_views, 0),
        checkouts: daily.reduce((a, r) => a + r.checkouts, 0),
        paid: daily.reduce((a, r) => a + r.paid, 0),
      },
      yesterday: latest.yesterday,
      d7: latest.d7,
      d28: latest.d28,
      gate_hits_28d: latest.d28.gate_hits,
      wrote: null,
      telegram: null,
    };

    if (!args.dryRun) {
      const existing = readDaily();
      const total = writeDaily(existing, daily);
      writeJsonAtomic(LATEST, latest);
      summary.wrote = { daily_rows: daily.length, file_rows: total, latest: LATEST };
    }
    if (args.weekly) {
      const text = formatWeeklySummary({ d7: latest.d7, prev7: latest.prev7, d28: latest.d28, generatedAt });
      summary.telegram = await (deps.sendTelegram ?? sendTelegram)(text, { dryRun: args.dryRun });
      if (args.dryRun) log(`--- weekly summary (not sent) ---\n${text}\n---`);
    }

    if (args.json) log(JSON.stringify(summary));
    else {
      log(`[funnel-report] ${generatedAt}${args.dryRun ? " (dry-run)" : ""} ${rows.length} rows (${summary.qa_excluded} QA excluded in 28 d) → ${daily.length} daily rows ${summary.window.from}..${summary.window.to}`);
      const t = summary.totals;
      log(`  ${args.days} d totals: signups ${t.signups} · analyses ${t.analyses} (first ${t.first_analyses}) · report views ${t.report_views} · paywall ${t.paywall_views} · checkouts ${t.checkouts} · paid ${t.paid}`);
      const y = latest.yesterday;
      log(`  yesterday ${y.date}: signups ${y.signups} · analyses ${y.analyses} · report views ${y.report_views} · paywall ${y.paywall_views} · checkouts ${y.checkouts} · paid ${y.paid}`);
      const c = latest.d7.conv;
      const pct = (v) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);
      log(`  7 d conv: signup→analysis ${pct(c.signup_to_analysis)} · analysis→report ${pct(c.analysis_to_report)} · report→paywall ${pct(c.report_to_paywall)} · paywall→checkout ${pct(c.paywall_to_checkout)} · checkout→paid ${pct(c.checkout_to_paid)}`);
      const gates = Object.entries(latest.d28.gate_hits).slice(0, 6).map(([f, n]) => `${f} ${n}`).join(" · ");
      log(`  gate hits 28 d: ${gates || "none"}`);
      if (summary.wrote) log(`  wrote ${summary.wrote.daily_rows} rows (${summary.wrote.file_rows} in file) + funnel-latest.json`);
      if (summary.telegram) log(`  telegram: ${summary.telegram.sent ? `sent${summary.telegram.via ? ` via ${summary.telegram.via}` : ""}` : `not sent (${summary.telegram.reason})`}`);
    }
    return summary;
  } finally {
    release();
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then(
    () => process.exit(0),
    (err) => {
      process.stderr.write(`[funnel-report] crashed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
