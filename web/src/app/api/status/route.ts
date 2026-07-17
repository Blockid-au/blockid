// GET /api/status — public status endpoint.
//
// Aggregates:
//   1. Internal /api/healthz probe (localhost, 2s timeout — graceful fallback).
//   2. Tail of web/content/reports/deploy-log.jsonl (last deploy).
//   3. Tail of web/content/reports/cron-health.jsonl (per-cron 24h stats).
//
// Always returns HTTP 200 — the aggregate `ok` flag communicates degraded
// state. No auth. No PII. Safe for public consumption.
//
// Cache: s-maxage=30 with 60s stale-while-revalidate.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- Types ----------

type ServiceName = "db" | "stripe" | "audit_chain" | "ga4";
type ServiceStatus = "ok" | "degraded" | "down";

type ServiceRow = {
  name: ServiceName;
  status: ServiceStatus;
  latency_ms?: number;
};

type DeployRow = {
  ts: string;
  sha: string;
  release_id: string;
  gates_passed: number;
  gates_expected: number;
};

type CronRow = {
  name: string;
  last_run: string;
  ok_rate_24h_pct: number;
  avg_duration_ms: number;
};

type StatusResponse = {
  ok: boolean;
  version: string;
  updated_at: string;
  services: ServiceRow[];
  slo: {
    uptime_pct_24h?: number;
    p95_ms?: number;
    disk_pct?: number;
    mem_pct?: number;
  };
  last_deploy: DeployRow;
  crons: CronRow[];
};

// Shape returned by /api/healthz (kept in sync with web/src/app/api/healthz).
type HealthzCheck = { ok: boolean; latency_ms?: number; error?: string };
type HealthzBody = {
  ok: boolean;
  version: string;
  git_sha: string;
  uptime_s: number;
  checks: {
    db: HealthzCheck;
    stripe: HealthzCheck;
    chain: HealthzCheck;
    ga4: HealthzCheck;
    disk_pct: number;
    mem_pct: number;
    p95_ms: number;
  };
};

// ---------- Constants ----------

const REPO_ROOT = process.cwd();
const DEPLOY_LOG = path.join(REPO_ROOT, "content", "reports", "deploy-log.jsonl");
const CRON_LOG = path.join(REPO_ROOT, "content", "reports", "cron-health.jsonl");

const EMPTY_DEPLOY: DeployRow = {
  ts: "",
  sha: "",
  release_id: "",
  gates_passed: 0,
  gates_expected: 0,
};

// SLO thresholds derived from docs/IMPLEMENTATION-PLAN-v2.md §13.3.
const P95_TARGET_MS = 800;
const DISK_TARGET_PCT = 80;
const MEM_TARGET_PCT = 75;

// ---------- Helpers ----------

async function readTailLines(file: string, n: number): Promise<string[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

function safeParse<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

function parseGates(input: unknown): { passed: number; expected: number } {
  // Accepts "10/10" (existing deploy-log format) or numeric fields.
  if (typeof input === "string") {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(input.trim());
    if (m) return { passed: Number(m[1]), expected: Number(m[2]) };
  }
  return { passed: 0, expected: 0 };
}

function toIso(ts: unknown): string {
  if (typeof ts !== "string") return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

async function fetchHealthz(timeoutMs = 2000): Promise<HealthzBody | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("http://localhost:4001/api/healthz", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      // healthz returns 503 when unhealthy but body is still valid — accept it.
      const body = (await res.json()) as HealthzBody;
      return body ?? null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

async function readVersionFallback(): Promise<string> {
  for (const rel of [
    "content/reports/version.json",
    ".deploy-manifest.json",
    "package.json",
  ]) {
    try {
      const raw = await fs.readFile(path.join(REPO_ROOT, rel), "utf8");
      const j = JSON.parse(raw) as { version?: string };
      if (j?.version) return String(j.version);
    } catch {
      // continue
    }
  }
  return "unknown";
}

async function readGitShaFallback(): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(REPO_ROOT, ".deploy-manifest.json"), "utf8");
    const j = JSON.parse(raw) as { git_sha?: string };
    if (j?.git_sha) return String(j.git_sha);
  } catch {
    // ignore
  }
  return "";
}

function checkToStatus(c: HealthzCheck | undefined): ServiceStatus {
  if (!c) return "degraded";
  if (c.ok) return "ok";
  // Distinguish "unreachable" (down) from "responding but not-ok" (degraded).
  if (c.error && /timeout|econn|fetch failed|unreachable/i.test(c.error)) return "down";
  return "degraded";
}

function servicesFromHealthz(h: HealthzBody | null): ServiceRow[] {
  if (!h) return [];
  return [
    { name: "db", status: checkToStatus(h.checks.db), latency_ms: h.checks.db.latency_ms },
    { name: "stripe", status: checkToStatus(h.checks.stripe), latency_ms: h.checks.stripe.latency_ms },
    { name: "audit_chain", status: checkToStatus(h.checks.chain), latency_ms: h.checks.chain.latency_ms },
    { name: "ga4", status: checkToStatus(h.checks.ga4), latency_ms: h.checks.ga4.latency_ms },
  ];
}

// ---------- Log readers ----------

type DeployLine = {
  ts?: string;
  status?: string;
  gates?: string;
  pid?: string;
  note?: string;
  sha?: string;
  release_id?: string;
  gates_passed?: number;
  gates_expected?: number;
  event?: string;
};

async function readLastDeploy(fallbackSha: string): Promise<DeployRow> {
  const lines = await readTailLines(DEPLOY_LOG, 30);
  // Scan newest-first for the last real deploy row (has a status/gates field).
  for (let i = lines.length - 1; i >= 0; i--) {
    const row = safeParse<DeployLine>(lines[i]);
    if (!row) continue;
    // Skip github-webhook event rows — they don't represent a deploy.
    if (row.event) continue;
    if (!row.status && !row.gates) continue;

    const { passed, expected } = parseGates(row.gates);
    return {
      ts: toIso(row.ts),
      sha: (row.sha ?? fallbackSha ?? "").toString(),
      release_id: (row.release_id ?? row.pid ?? "").toString(),
      gates_passed: typeof row.gates_passed === "number" ? row.gates_passed : passed,
      gates_expected: typeof row.gates_expected === "number" ? row.gates_expected : expected,
    };
  }
  return { ...EMPTY_DEPLOY, sha: fallbackSha };
}

type CronLine = {
  ts?: string;
  // Existing corpus uses `endpoint` + `status: ok|fail`; spec allows `cron` + `ok`.
  cron?: string;
  endpoint?: string;
  ok?: boolean;
  status?: string;
  duration_ms?: number;
};

function normaliseCronLine(row: CronLine): {
  name: string;
  ts: string;
  ok: boolean;
  duration_ms: number;
} | null {
  const name = (row.cron ?? row.endpoint ?? "").toString().trim();
  if (!name) return null;
  const ts = toIso(row.ts);
  if (!ts) return null;
  const ok = typeof row.ok === "boolean" ? row.ok : (row.status ?? "").toLowerCase() === "ok";
  const duration_ms = Number.isFinite(row.duration_ms) ? Number(row.duration_ms) : 0;
  return { name, ts, ok, duration_ms };
}

async function summariseCrons(): Promise<CronRow[]> {
  const lines = await readTailLines(CRON_LOG, 200);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  type Bucket = { last_run: string; last_ms: number; total: number; ok: number; sumMs: number };
  const buckets = new Map<string, Bucket>();

  for (const raw of lines) {
    const parsed = safeParse<CronLine>(raw);
    if (!parsed) continue;
    const row = normaliseCronLine(parsed);
    if (!row) continue;
    const t = new Date(row.ts).getTime();
    if (Number.isNaN(t) || t < cutoff) {
      // Still keep for last_run if we've never seen this cron, but skip stats.
      const existing = buckets.get(row.name);
      if (!existing) {
        buckets.set(row.name, {
          last_run: row.ts,
          last_ms: t,
          total: 0,
          ok: 0,
          sumMs: 0,
        });
      }
      continue;
    }
    const existing = buckets.get(row.name) ?? {
      last_run: row.ts,
      last_ms: t,
      total: 0,
      ok: 0,
      sumMs: 0,
    };
    existing.total += 1;
    if (row.ok) existing.ok += 1;
    existing.sumMs += row.duration_ms;
    if (t >= existing.last_ms) {
      existing.last_run = row.ts;
      existing.last_ms = t;
    }
    buckets.set(row.name, existing);
  }

  const rows: CronRow[] = [];
  for (const [name, b] of buckets) {
    rows.push({
      name,
      last_run: b.last_run,
      ok_rate_24h_pct: b.total > 0 ? Math.round((b.ok / b.total) * 100) : 0,
      avg_duration_ms: b.total > 0 ? Math.round(b.sumMs / b.total) : 0,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

function computeUptimeFromCrons(crons: CronRow[]): number | undefined {
  if (crons.length === 0) return undefined;
  // Weighted-by-count is nicer but we do not carry counts on the row.
  // Simple mean of ok-rates is a reasonable public proxy.
  const total = crons.reduce((acc, r) => acc + r.ok_rate_24h_pct, 0);
  return Math.round((total / crons.length) * 10) / 10;
}

// ---------- Handler ----------

export async function GET(): Promise<Response> {
  const [healthz, crons, fallbackSha, fallbackVersion] = await Promise.all([
    fetchHealthz(2000),
    summariseCrons().catch(() => [] as CronRow[]),
    readGitShaFallback(),
    readVersionFallback(),
  ]);

  const last_deploy = await readLastDeploy(fallbackSha).catch(() => ({
    ...EMPTY_DEPLOY,
    sha: fallbackSha,
  }));

  const services = servicesFromHealthz(healthz);

  const slo = {
    uptime_pct_24h: computeUptimeFromCrons(crons),
    p95_ms: healthz?.checks.p95_ms,
    disk_pct: healthz?.checks.disk_pct,
    mem_pct: healthz?.checks.mem_pct,
  };

  // Aggregate ok: all known services ok AND no SLO breach.
  const servicesOk = services.length === 0 ? true : services.every((s) => s.status === "ok");
  const sloOk =
    (slo.p95_ms === undefined || slo.p95_ms === 0 || slo.p95_ms <= P95_TARGET_MS) &&
    (slo.disk_pct === undefined || slo.disk_pct <= DISK_TARGET_PCT) &&
    (slo.mem_pct === undefined || slo.mem_pct <= MEM_TARGET_PCT);

  const body: StatusResponse = {
    ok: servicesOk && sloOk,
    version: healthz?.version ?? fallbackVersion,
    updated_at: new Date().toISOString(),
    services,
    slo,
    last_deploy,
    crons,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "cache-control": "s-maxage=30, stale-while-revalidate=60",
    },
  });
}
