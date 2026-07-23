// Shared readers for the autonomous-loop counter surfaces (/status, /stats).
//
// Every number is derived from a file that the loop itself writes:
//   - web/content/reports/uptime-guardian.jsonl   — one row per minute-ish
//   - web/content/reports/cron-health.jsonl       — one row per cron probe
//   - web/content/reports/reseller-monitor.jsonl  — last row = current tick state
//   - web/content/reports/reseller-goal-history.jsonl — per-tick timeline
//   - web/content/reports/deploy-log.jsonl        — every push + deploy row
//   - git log (via child_process)                 — commit counters
//
// Every helper is defensive: if a file is missing or malformed, the reader
// returns null / [] rather than throwing so the page can render "n/a".

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const REPO_ROOT = process.cwd();
const REPORTS_DIR = path.join(REPO_ROOT, "content", "reports");

// ---------------------------------------------------------------------------
// Low-level tail reader
// ---------------------------------------------------------------------------

async function readAllLines(file: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

async function readTailLines(file: string, n: number): Promise<string[]> {
  const lines = await readAllLines(file);
  return lines.slice(-n);
}

function safeParse<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Uptime guardian
// ---------------------------------------------------------------------------

export type UptimeSnapshot = {
  last_ts: string;
  last_healthy: boolean;
  last_http_local: string;
  last_disk_pct: number | null;
  last_mem_pct: number | null;
  last_load_1min: number | null;
  last_uptime_s: number | null;
  window_total: number;
  window_healthy: number;
  window_pct: number | null;
  total_rows: number;
  total_healthy: number;
  all_time_pct: number | null;
};

type UptimeRow = {
  ts?: string;
  healthy?: number;
  http_local?: string;
  disk_pct?: number;
  mem_pct?: number;
  load_1min?: number;
  uptime_s?: number;
};

export async function readUptimeSnapshot(): Promise<UptimeSnapshot | null> {
  const lines = await readAllLines(path.join(REPORTS_DIR, "uptime-guardian.jsonl"));
  if (lines.length === 0) return null;

  let total_rows = 0;
  let total_healthy = 0;
  // Last 24h window
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let window_total = 0;
  let window_healthy = 0;

  let last: UptimeRow | null = null;
  for (const line of lines) {
    const row = safeParse<UptimeRow>(line);
    if (!row) continue;
    total_rows += 1;
    const isHealthy = row.healthy === 1;
    if (isHealthy) total_healthy += 1;
    last = row;
    const t = row.ts ? new Date(row.ts).getTime() : NaN;
    if (Number.isFinite(t) && t >= cutoff) {
      window_total += 1;
      if (isHealthy) window_healthy += 1;
    }
  }

  if (!last) return null;

  return {
    last_ts: last.ts ?? "",
    last_healthy: last.healthy === 1,
    last_http_local: last.http_local ?? "",
    last_disk_pct: typeof last.disk_pct === "number" ? last.disk_pct : null,
    last_mem_pct: typeof last.mem_pct === "number" ? last.mem_pct : null,
    last_load_1min: typeof last.load_1min === "number" ? last.load_1min : null,
    last_uptime_s: typeof last.uptime_s === "number" ? last.uptime_s : null,
    window_total,
    window_healthy,
    window_pct: window_total > 0 ? (window_healthy / window_total) * 100 : null,
    total_rows,
    total_healthy,
    all_time_pct: total_rows > 0 ? (total_healthy / total_rows) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Cron health
// ---------------------------------------------------------------------------

export type CronHealthSummary = {
  last_ts: string;
  last_endpoint: string;
  last_status: string;
  last_duration_ms: number | null;
  ok_count_24h: number;
  fail_count_24h: number;
  ok_rate_24h: number | null;
  level: "ok" | "warn" | "bad";
};

type CronRow = {
  ts?: string;
  endpoint?: string;
  status?: string;
  duration_ms?: number;
};

export async function readCronHealthSummary(): Promise<CronHealthSummary | null> {
  const lines = await readAllLines(path.join(REPORTS_DIR, "cron-health.jsonl"));
  if (lines.length === 0) return null;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let ok = 0;
  let fail = 0;
  let last: CronRow | null = null;

  for (const line of lines) {
    const row = safeParse<CronRow>(line);
    if (!row) continue;
    last = row;
    const t = row.ts ? new Date(row.ts).getTime() : NaN;
    if (!Number.isFinite(t) || t < cutoff) continue;
    if ((row.status ?? "").toLowerCase() === "ok") ok += 1;
    else fail += 1;
  }

  if (!last) return null;

  const total = ok + fail;
  const rate = total > 0 ? (ok / total) * 100 : null;
  const level: "ok" | "warn" | "bad" =
    rate === null ? "warn" : rate >= 99 ? "ok" : rate >= 95 ? "warn" : "bad";

  return {
    last_ts: last.ts ?? "",
    last_endpoint: last.endpoint ?? "",
    last_status: last.status ?? "",
    last_duration_ms: typeof last.duration_ms === "number" ? last.duration_ms : null,
    ok_count_24h: ok,
    fail_count_24h: fail,
    ok_rate_24h: rate,
    level,
  };
}

// ---------------------------------------------------------------------------
// Reseller autonomous loop
// ---------------------------------------------------------------------------

export type ResellerLoopSnapshot = {
  monitor_ts: string;
  head_sha: string;
  now_utc: string;
  next_utc: string;
  seconds_until: number | null;
  tick_state: string;
  last_tick_id: string;
  last_stage: string;
  last_deployed: string;
  last_dispatch_ms: number | null;
  human_review_minutes_7d: number | null;
  current_tick_number: number | null;
  current_phase: string | null;
  total_ticks_completed: number;
};

type ResellerMonitorRow = {
  monitor_ts?: string;
  head_sha?: string;
  now_utc?: string;
  next_utc?: string;
  seconds_until?: number;
  tick_state?: string;
  last_tick_id?: string;
  last_dispatch_ms?: number;
  last_deploy_stage?: string;
  last_deploy_status?: number;
  last_log?: {
    tick_id?: string;
    ts?: string;
    human_review_minutes_7d?: number;
    stage?: string;
    head?: string;
    last_deployed?: string;
  };
};

export async function readResellerLoopSnapshot(): Promise<ResellerLoopSnapshot | null> {
  const monitorLines = await readTailLines(
    path.join(REPORTS_DIR, "reseller-monitor.jsonl"),
    1,
  );
  const monitor = monitorLines.length > 0 ? safeParse<ResellerMonitorRow>(monitorLines[0]) : null;

  // Fall back to goal-history for last stage if monitor absent.
  const goalLines = await readAllLines(path.join(REPORTS_DIR, "reseller-goal-history.jsonl"));
  const uniqueTickIds = new Set<string>();
  for (const line of goalLines) {
    const row = safeParse<{ tick_id?: string }>(line);
    if (row?.tick_id) uniqueTickIds.add(row.tick_id);
  }

  // Current tick number + phase from git log — the loop writes it into the commit subject.
  let current_tick_number: number | null = null;
  let current_phase: string | null = null;
  try {
    const { stdout } = await execFileP(
      "git",
      ["log", "--pretty=%s", "-n", "500"],
      { cwd: REPO_ROOT, timeout: 5000, maxBuffer: 2_000_000 },
    );
    const re = /feat\(reseller\): tick (\d+)\s+—\s+(P\d+(?:\.\d+)?)/;
    for (const line of stdout.split("\n")) {
      const m = re.exec(line);
      if (m) {
        current_tick_number = Number(m[1]);
        current_phase = m[2];
        break;
      }
    }
  } catch {
    // git unavailable — leave nulls
  }

  if (!monitor && current_tick_number === null && uniqueTickIds.size === 0) {
    return null;
  }

  return {
    monitor_ts: monitor?.monitor_ts ?? "",
    head_sha: monitor?.head_sha ?? "",
    now_utc: monitor?.now_utc ?? "",
    next_utc: monitor?.next_utc ?? "",
    seconds_until:
      typeof monitor?.seconds_until === "number" ? monitor.seconds_until : null,
    tick_state: monitor?.tick_state ?? "",
    last_tick_id: monitor?.last_log?.tick_id ?? monitor?.last_tick_id ?? "",
    last_stage: monitor?.last_log?.stage ?? monitor?.last_deploy_stage ?? "",
    last_deployed: monitor?.last_log?.last_deployed ?? "",
    last_dispatch_ms:
      typeof monitor?.last_dispatch_ms === "number" ? monitor.last_dispatch_ms : null,
    human_review_minutes_7d:
      typeof monitor?.last_log?.human_review_minutes_7d === "number"
        ? monitor.last_log.human_review_minutes_7d
        : null,
    current_tick_number,
    current_phase,
    total_ticks_completed: uniqueTickIds.size,
  };
}

// ---------------------------------------------------------------------------
// Deploy log
// ---------------------------------------------------------------------------

export type DeploySummary = {
  last_deploy_ts: string;
  last_deploy_note: string;
  last_deploy_gates: string;
  last_push_ts: string;
  last_push_detail: string;
  deploys_24h: number;
  pushes_24h: number;
};

type DeployLogRow = {
  ts?: string;
  status?: string;
  gates?: string;
  pid?: string;
  note?: string;
  event?: string;
  detail?: string;
  source?: string;
};

export async function readDeploySummary(): Promise<DeploySummary | null> {
  const lines = await readAllLines(path.join(REPORTS_DIR, "deploy-log.jsonl"));
  if (lines.length === 0) return null;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let deploys_24h = 0;
  let pushes_24h = 0;
  let lastDeploy: DeployLogRow | null = null;
  let lastPush: DeployLogRow | null = null;

  for (const raw of lines) {
    const row = safeParse<DeployLogRow>(raw);
    if (!row) continue;
    const t = row.ts ? new Date(row.ts).getTime() : NaN;
    const isPushEvent = typeof row.event === "string" && row.event.length > 0;
    if (isPushEvent) {
      lastPush = row;
      if (Number.isFinite(t) && t >= cutoff) pushes_24h += 1;
    } else if (row.status) {
      lastDeploy = row;
      if (Number.isFinite(t) && t >= cutoff) deploys_24h += 1;
    }
  }

  return {
    last_deploy_ts: lastDeploy?.ts ?? "",
    last_deploy_note: lastDeploy?.note ?? "",
    last_deploy_gates: lastDeploy?.gates ?? "",
    last_push_ts: lastPush?.ts ?? "",
    last_push_detail: lastPush?.detail ?? "",
    deploys_24h,
    pushes_24h,
  };
}

// ---------------------------------------------------------------------------
// Git commit counters
// ---------------------------------------------------------------------------

export type CommitCounters = {
  last_24h: number | null;
  last_7d: number | null;
  total: number | null;
  head_sha: string;
  head_short: string;
  branch: string;
};

async function gitCount(since?: string): Promise<number | null> {
  try {
    const args = ["log", "--oneline"];
    if (since) args.push(`--since=${since}`);
    const { stdout } = await execFileP("git", args, {
      cwd: REPO_ROOT,
      timeout: 8000,
      maxBuffer: 20_000_000,
    });
    if (!stdout) return 0;
    return stdout.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    return null;
  }
}

export async function readCommitCounters(): Promise<CommitCounters> {
  const [last24, last7, total, headOut, branchOut] = await Promise.all([
    gitCount("24 hours ago"),
    gitCount("7 days ago"),
    gitCount(),
    execFileP("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, timeout: 4000 })
      .then((r) => r.stdout.trim())
      .catch(() => ""),
    execFileP("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: REPO_ROOT, timeout: 4000 })
      .then((r) => r.stdout.trim())
      .catch(() => ""),
  ]);
  return {
    last_24h: last24,
    last_7d: last7,
    total,
    head_sha: headOut,
    head_short: headOut ? headOut.slice(0, 7) : "",
    branch: branchOut,
  };
}
