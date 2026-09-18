// GET /api/status — public status endpoint.
//
// Aggregates:
//   1. Internal /api/healthz probe (localhost, 2s timeout — graceful fallback).
//   2. Tail of web/content/reports/deploy-log.jsonl (last deploy).
//   3. Tail of web/content/reports/cron-health.jsonl (per-cron 24h stats).
//   4. G15-R2 v2 extras from lib/status (errors_1h, ai, queues, backups_detail,
//      slo.latency_p95_ms, crons_failed_24h) — cached 60 s, every section
//      null-safe when its report file is missing.
//
// Always returns HTTP 200 — the aggregate `ok` flag communicates degraded
// state. No auth. No PII. Safe for public consumption.
//
// Cache: s-maxage=30 with 60s stale-while-revalidate.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { cronSecret, safeEqualStrings } from "@/lib/security/cron-auth";
import { readChainStatus, type AuditChainStatus } from "@/lib/audit/chain-verify";
import { readOAuthTokenHealth, type OAuthTokensSealedStatus } from "@/lib/security/oauth-token-health";
import { readGa4EventAuditStatus } from "@/lib/analytics/ga4-event-audit";
import { readBackupHealth, type BackupStatus } from "@/lib/ops/backup-health";
import { readSchemaMigrationsStatus, type SchemaMigrationsStatus } from "@/lib/ops/schema-migrations";
import { readAiProvidersSummary, type AiProvidersSummary } from "@/lib/ai/provider-status";
import { readLastReportProvider, type LastReportProvider } from "@/lib/ai/last-report";
import { readTractionStatus, type TractionStatus } from "@/lib/traction/status";
import { readSviBacktestStatus, type SviBacktestStatus } from "@/lib/backtest/latest";
import { getAIQueueDepth } from "@/lib/ai-client";
import { publicStatusExtras, readStatusExtras, type PublicStatusExtras, type StatusExtras } from "@/lib/status";
import type { LatencyP95 } from "@/lib/status/slo";
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

/**
 * Anonymous payload (release QA-4 P2-f): enough for a status widget or an
 * uptime monitor — `ok`, `version`, per-service up/down, the 24h uptime
 * figure, the manifest `git_sha` (G15-R1 — already public via /api/healthz)
 * and the last deploy's time/gate count. Nothing that describes the
 * fleet or the operator posture: no deploy-row sha / release id, no host resource
 * percentages, no cron catalogue, and none of the S20-A / S23-A / S23-B
 * internal-telemetry verdicts (`audit_chain`, `oauth_tokens_sealed`,
 * `ga4_events`) — those keys are ABSENT, not blanked, for an untrusted caller.
 */
type PublicStatusResponse = {
  ok: boolean;
  version: string;
  /**
   * G15-R1 — the commit the live bundle was built from, read from
   * `.deploy-manifest.json` in the server's cwd (releases/<BUILD_ID>), which
   * deploy-live.sh stamps BEFORE gate 1 and copies into the release dir.
   * Gate 11 compares this against the stamped value ("verify the live
   * bundle") — a mismatch rolls the deploy back. `""` when no manifest.
   * Public on purpose: /api/healthz has always exposed the same sha and the
   * repo is public; `last_deploy.sha` / `release_id` stay trusted-only.
   */
  git_sha: string;
  updated_at: string;
  services: Array<Pick<ServiceRow, "name" | "status">>;
  slo: { uptime_pct_24h?: number; latency_p95_ms?: LatencyP95 | null };
  last_deploy: Pick<DeployRow, "ts" | "gates_passed" | "gates_expected">;
  /**
   * G14-S33 — freshness of content/reports/traction-snapshot.json (daily
   * 03:20 UTC cron): `ok` (< 26 h) | `stale` | `missing`. One word, no
   * figure, no path — safe on the anonymous payload (the live-QA lane
   * asserts the key without a bearer).
   */
  traction: TractionStatus;
  /**
   * G14-S39 — freshness of content/reports/svi-backtest-latest.json (weekly
   * `npm run backtest`, Sun 03:40 UTC): `ok` (< 8 days) | `stale` | `missing`.
   * One word, no figure, no path — the /methodology/calibration page shows
   * the numbers themselves.
   */
  svi_backtest: SviBacktestStatus;
  /**
   * G15-R2 — redacted v2 sections (lib/status publicStatusExtras): error-class
   * counts with path/host-free text, provider states, queue depths, backup
   * timestamps, failed-cron names + counts. No error detail, no reasons.
   */
  errors_1h: PublicStatusExtras["errors_1h"];
  ai: PublicStatusExtras["ai"];
  queues: PublicStatusExtras["queues"];
  backups_detail: PublicStatusExtras["backups_detail"];
  crons_failed_24h: PublicStatusExtras["crons_failed_24h"];
};

/** Full payload — Bearer STATUS_FULL_TOKEN (or CRON_SECRET) only. */
type StatusResponse = {
  ok: boolean;
  version: string;
  /** G15-R1 — see PublicStatusResponse.git_sha. */
  git_sha: string;
  updated_at: string;
  services: ServiceRow[];
  slo: {
    uptime_pct_24h?: number;
    p95_ms?: number;
    disk_pct?: number;
    mem_pct?: number;
    /** G15-R2 — per route class from content/reports/latency.jsonl (null until sampled / no timing format). */
    latency_p95_ms?: LatencyP95 | null;
  };
  last_deploy: DeployRow;
  crons: CronRow[];
  /**
   * S20-A — integrity of the hash-chained `audit_events` log as last
   * verified by /api/cron/audit-chain-verify (`unknown` = never run or
   * stale > 48h). Distinct from the `audit_chain` SERVICE row, which is the
   * EVM chain RPC probe.
   */
  audit_chain: AuditChainStatus;
  /**
   * S23-A — are OAuth connector tokens sealed (AES-256-GCM) at rest?
   * `no_key` = OAUTH_TOKEN_ENCRYPTION_KEY unset; `obf_rows_present` = key
   * set but unsealed rows remain (run scripts/reseal-oauth-tokens.mjs);
   * `ok` = every stored token is `gcm:`; `unknown` = DB not reachable.
   * Cached 10 min server-side. Trusted callers only (QA-4 P2-f).
   */
  oauth_tokens_sealed: OAuthTokensSealedStatus;
  /**
   * S23-B — whether the G11/G12 + hero-test GA4 events arrived in the last
   * 7 days, as last checked by /api/cron/ga4-event-audit (weekly Mon 04:30
   * UTC): `ok` | `missing:<event,event>` | `blocked` (Data API disabled /
   * no access — operator steps in content/reports/ga4-event-audit.json) |
   * `unknown` (never run or stale > 8 days). Trusted callers only.
   */
  ga4_events: string;
  /**
   * QA-3 P0-4 — Postgres backup freshness from content/reports/backup-health.jsonl:
   * `ok` = newest successful pg_dump < 26 h AND newest successful restore
   * drill < 8 days; `stale` = either threshold missed; `missing` = no
   * successful backup row at all. Public: no paths, sizes or hosts.
   */
  backups: BackupStatus;
  /**
   * QA-2 P0 — are all SQL migration files in web/supabase/migrations applied?
   * Diff of content/reports/schema-migrations.json (manifest written by
   * scripts/db/migration-status.mjs --write) against public.schema_migrations
   * (0345 ledger): `ok` | `pending:<n>` | `unknown` (no manifest / no ledger /
   * DB unreachable). Public: names no file, table or host.
   */
  schema_migrations: SchemaMigrationsStatus;
  /**
   * S31-A — per-provider AI validity from the last probe
   * (content/reports/ai-provider-status.json, ≤ 1 probe / provider / 15 min):
   * `valid | invalid_key | unreachable | quota_exceeded | low_credit |
   * not_configured` plus headroom (RPM/TPM remaining, OpenRouter credits) and
   * `quality_tier_ready` (Anthropic key present AND valid). Never key
   * material. Trusted callers only.
   */
  ai_providers: AiProvidersSummary;
  /**
   * S31-A — live depth of the in-process AI dispatcher queue (user +
   * background lanes) and running/max concurrency. Trusted callers only.
   */
  ai_queue_depth: ReturnType<typeof getAIQueueDepth>;
  /**
   * S32-C — which provider + model wrote the most recent finished first
   * analysis (content/reports/ai-last-report.json), with the per-section
   * breakdown; `null` until a report has finished. Trusted callers only.
   */
  ai_last_report_provider: LastReportProvider | null;
  /** G14-S33 — see PublicStatusResponse.traction. */
  traction: TractionStatus;
  /** G14-S39 — see PublicStatusResponse.svi_backtest. */
  svi_backtest: SviBacktestStatus;
  /**
   * G15-R2 — v2 observability sections (lib/status/*, cached 60 s):
   *   errors_1h        top-5 error classes from the 10-min error digest
   *   ai               provider cooldowns / budget exhaustion (R3 snapshot),
   *                    model-probe counters, fully_degraded reports in 24 h
   *   queues           email / webhook / report-order backlogs (head counts)
   *   backups_detail   local / offsite / restore-drill timestamps (the
   *                    one-word `backups` verdict above is unchanged)
   *   crons_failed_24h failed endpoints with count + redacted last error
   *                    (`crons` catalogue above is unchanged)
   */
  errors_1h: StatusExtras["errors_1h"];
  ai: StatusExtras["ai"];
  queues: StatusExtras["queues"];
  backups_detail: StatusExtras["backups_detail"];
  crons_failed_24h: StatusExtras["crons_failed_24h"];
};

// Whether the caller is trusted enough to see the full internal telemetry
// (git sha, release id, disk %, mem %, cron catalogue). Public callers get
// a minimal payload so we don't hand attackers commit SHAs for CVE targeting
// or infra footprints for capacity planning.
async function isTrustedCaller(): Promise<boolean> {
  const secret = process.env.STATUS_FULL_TOKEN ?? cronSecret() ?? "";
  if (!secret) return false;
  try {
    const h = await headers();
    const auth = h.get("authorization") ?? "";
    return safeEqualStrings(auth, `Bearer ${secret}`);
  } catch {
    // headers() is only available inside request scope — tests / SSG don't
    // have one. Fall back to untrusted so the public payload is served.
    return false;
  }
}

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

// G15-R2 fallbacks when lib/status itself is unavailable (never expected —
// every reader inside is null-safe — but the route must not 500).
const NULL_QUEUES: StatusExtras["queues"] = { email_queued: null, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: null };
const NULL_BACKUPS_DETAIL: StatusExtras["backups_detail"] = { local_last_ok_at: null, local_age_h: null, offsite_status: "never", offsite_last_at: null, restore_drill_last_ok_at: null };

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
    const j = JSON.parse(raw) as { git_sha?: string; build_sha?: string };
    // G15 follow-up: `build_sha` is what the bundle was BUILT from (differs
    // from git_sha only on a --skip-build promotion) — that is the truth a
    // "verify the live bundle" check needs.
    if (j?.build_sha) return String(j.build_sha);
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

function safeQueueDepth(): ReturnType<typeof getAIQueueDepth> {
  try {
    return getAIQueueDepth();
  } catch {
    return { queued: 0, queued_user: 0, queued_background: 0, running: 0, max_concurrent: 0 };
  }
}

// ---------- Handler ----------

export async function GET(): Promise<Response> {
  const [healthz, crons, fallbackSha, fallbackVersion, trusted, auditChain, oauthTokens, ga4Events, backups, schemaMigrations, aiProviders, aiLastReport, traction, sviBacktest, extras] = await Promise.all([
    fetchHealthz(2000),
    summariseCrons().catch(() => [] as CronRow[]),
    readGitShaFallback(),
    readVersionFallback(),
    isTrustedCaller(),
    readChainStatus(REPO_ROOT).catch(() => ({ status: "unknown" as const })),
    readOAuthTokenHealth().catch(() => ({ status: "unknown" as const })),
    readGa4EventAuditStatus(REPO_ROOT).catch(() => "unknown"),
    readBackupHealth(REPO_ROOT).catch(() => ({ status: "missing" as const, last_backup: "", last_restore_test: "" })),
    readSchemaMigrationsStatus(REPO_ROOT).catch(() => "unknown" as const),
    readAiProvidersSummary(REPO_ROOT).catch(() => ({ updated_at: "", providers: {}, usable: 0, quality_tier_ready: false } as AiProvidersSummary)),
    readLastReportProvider(REPO_ROOT).catch(() => null),
    readTractionStatus(REPO_ROOT).catch(() => "missing" as const),
    readSviBacktestStatus(REPO_ROOT).catch(() => "missing" as const),
    // G15 review: default root = the live web checkout (getStatusRoot), never the release-dir copy.
    readStatusExtras().catch(() => null),
  ]);
  const publicExtras = extras ? publicStatusExtras(extras) : null;

  const last_deploy = await readLastDeploy(fallbackSha).catch(() => ({
    ...EMPTY_DEPLOY,
    sha: fallbackSha,
  }));

  const services = servicesFromHealthz(healthz);

  const slo = {
    // G15 follow-up: guardian probes (2-min HTTP checks) are the truth; the
    // cron ok-rate mean is only a fallback when the guardian file is thin.
    uptime_pct_24h: extras?.uptime?.uptime_pct_24h ?? computeUptimeFromCrons(crons),
    p95_ms: healthz?.checks.p95_ms,
    disk_pct: healthz?.checks.disk_pct,
    mem_pct: healthz?.checks.mem_pct,
    latency_p95_ms: extras?.latency ? extras.latency.latency_p95_ms : null,
  };

  // Aggregate ok: all known services ok AND no SLO breach.
  const servicesOk = services.length === 0 ? true : services.every((s) => s.status === "ok");
  const sloOk =
    (slo.p95_ms === undefined || slo.p95_ms === 0 || slo.p95_ms <= P95_TARGET_MS) &&
    (slo.disk_pct === undefined || slo.disk_pct <= DISK_TARGET_PCT) &&
    (slo.mem_pct === undefined || slo.mem_pct <= MEM_TARGET_PCT);

  // Public payload is deliberately minimal — enough for a status widget /
  // uptime monitor, but nothing that helps a would-be attacker map the fleet.
  // Bearer STATUS_FULL_TOKEN (or CRON_SECRET fallback) unlocks the full
  // telemetry: git sha, release id, host resource %, per-cron catalogue.
  // QA-4 P2-f: the internal-telemetry verdicts (audit_chain,
  // oauth_tokens_sealed, ga4_events), the cron catalogue and sha/release are
  // not on the anonymous payload at all.
  const publicBody: PublicStatusResponse = {
    ok: servicesOk && sloOk,
    version: healthz?.version ?? fallbackVersion,
    git_sha: fallbackSha,
    updated_at: new Date().toISOString(),
    services: services.map((s) => ({ name: s.name, status: s.status })),
    slo: { uptime_pct_24h: slo.uptime_pct_24h, latency_p95_ms: slo.latency_p95_ms },
    last_deploy: {
      ts: last_deploy.ts,
      gates_passed: last_deploy.gates_passed,
      gates_expected: last_deploy.gates_expected,
    },
    traction,
    svi_backtest: sviBacktest,
    errors_1h: publicExtras?.errors_1h ?? null,
    ai: publicExtras?.ai ?? null,
    queues: publicExtras?.queues ?? NULL_QUEUES,
    backups_detail: publicExtras?.backups_detail ?? NULL_BACKUPS_DETAIL,
    crons_failed_24h: publicExtras?.crons_failed_24h ?? [],
  };

  const fullBody: StatusResponse = {
    ok: servicesOk && sloOk,
    version: healthz?.version ?? fallbackVersion,
    git_sha: fallbackSha,
    updated_at: new Date().toISOString(),
    services,
    slo,
    last_deploy,
    crons,
    audit_chain: auditChain.status,
    oauth_tokens_sealed: oauthTokens.status,
    ga4_events: ga4Events,
    backups: backups.status,
    schema_migrations: schemaMigrations,
    ai_providers: aiProviders,
    ai_queue_depth: safeQueueDepth(),
    ai_last_report_provider: aiLastReport,
    traction,
    svi_backtest: sviBacktest,
    errors_1h: extras?.errors_1h ?? null,
    ai: extras?.ai ?? null,
    queues: extras?.queues ?? NULL_QUEUES,
    backups_detail: extras?.backups_detail ?? NULL_BACKUPS_DETAIL,
    crons_failed_24h: extras?.crons_failed_24h ?? [],
  };

  return NextResponse.json(trusted ? fullBody : publicBody, {
    status: 200,
    headers: {
      "cache-control": trusted ? "no-store" : "s-maxage=30, stale-while-revalidate=60",
    },
  });
}
