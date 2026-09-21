// /status — public system status page.
//
// Server component. Pulls the aggregate view from /api/status (which itself
// probes localhost /api/healthz and reads deploy + cron logs). Reads a
// slightly deeper slice of the deploy log directly for the 10-row history.
//
// Rendering rules:
//   - Missing / empty values render as an em-dash rather than crashing.
//   - No emoji. Pragmatic Australian tone. No hype.
//   - Reskinned to the shared fintech marketing shell.
//   - G15-R2: the v2 sections (errors, AI providers, queues, backups, p95 by
//     route class, failed jobs) come from the anonymous /api/status payload,
//     which is already redacted (publicStatusExtras) — this page never reads
//     a report file for them and never prints a path, host or secret.

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { readUptimeSnapshot } from "@/lib/platform-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = pageMetadata({
  title: "Status — SLOs and recent deploys",
  description: "BlockID.au system status: uptime SLOs, incident notes, and the last 30 days of production deploys.",
  path: "/status",
});

// ---------- Types (mirror /api/status response) ----------

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

// G15-R2 v2 sections — the shape of lib/status publicStatusExtras.
type LatencyClass = "marketing" | "workspace" | "api_ai" | "api_other" | "tbr";
type Errors1h = { total: number; classes: Array<{ tag: string; msg: string; count: number }> } | null;
type AiPublic = {
  providers: Array<{ name: string; state: string }> | null;
  budget_exhausted_1h: number | null;
  models_healthy: number | null;
  models_total: number | null;
  fully_degraded_24h: number;
} | null;
type Queues = { email_queued: number | null; email_failed_24h: number | null; webhook_failed_24h: number | null; report_orders_pending: number | null };
type BackupsDetail = { local_last_ok_at: string | null; local_age_h: number | null; offsite_status: string; offsite_last_at: string | null; restore_drill_last_ok_at: string | null };
type CronFailure = { endpoint: string; count: number };

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
    latency_p95_ms?: Partial<Record<LatencyClass, number | null>> | null;
  };
  last_deploy: DeployRow;
  crons: CronRow[];
  errors_1h?: Errors1h;
  ai?: AiPublic;
  queues?: Queues;
  backups_detail?: BackupsDetail;
  crons_failed_24h?: CronFailure[];
};

// ---------- SLO thresholds ----------

const P95_TARGET_MS = 800;
const DISK_TARGET_PCT = 80;
const MEM_TARGET_PCT = 75;
const UPTIME_TARGET_PCT = 99.9;

// G15-R2 per-class p95 targets — docs/ops/slo.md § 1 (mirrors scripts/lib/latency-core.mjs SLO).
const LATENCY_CLASSES: Array<{ key: LatencyClass; label: string; target_ms: number }> = [
  { key: "marketing", label: "Marketing pages", target_ms: 800 },
  { key: "workspace", label: "Workspace", target_ms: 1500 },
  { key: "api_ai", label: "AI routes", target_ms: 60_000 },
  { key: "api_other", label: "Other API", target_ms: 2000 },
  { key: "tbr", label: "Public reports", target_ms: 1500 },
];
const BACKUP_LOCAL_MAX_AGE_H = 26;

// ---------- Data fetching ----------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://blockid.au";

const EMPTY_STATUS: StatusResponse = {
  ok: false,
  version: "unknown",
  updated_at: new Date(0).toISOString(),
  services: [],
  slo: {},
  last_deploy: { ts: "", sha: "", release_id: "", gates_passed: 0, gates_expected: 0 },
  crons: [],
};

async function loadStatus(): Promise<StatusResponse> {
  try {
    const res = await fetch(`${APP_URL}/api/status`, { cache: "no-store" });
    if (!res.ok) return EMPTY_STATUS;
    const data = (await res.json()) as StatusResponse;
    return { ...EMPTY_STATUS, ...data };
  } catch {
    return EMPTY_STATUS;
  }
}

type RawDeployLine = {
  ts?: string;
  status?: string;
  gates?: string;
  pid?: string;
  note?: string;
  event?: string;
  sha?: string;
  release_id?: string;
};

async function loadDeployHistory(limit: number): Promise<DeployRow[]> {
  try {
    const file = path.join(process.cwd(), "content", "reports", "deploy-log.jsonl");
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const out: DeployRow[] = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      let row: RawDeployLine | null = null;
      try {
        row = JSON.parse(lines[i]) as RawDeployLine;
      } catch {
        continue;
      }
      if (!row || row.event) continue;
      if (!row.status && !row.gates) continue;
      const gates = typeof row.gates === "string" ? /^(\d+)\s*\/\s*(\d+)$/.exec(row.gates.trim()) : null;
      out.push({
        ts: row.ts ?? "",
        sha: (row.sha ?? "").toString(),
        release_id: (row.release_id ?? row.pid ?? "").toString(),
        gates_passed: gates ? Number(gates[1]) : 0,
        gates_expected: gates ? Number(gates[2]) : 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ---------- Formatters ----------

const DASH = "—";

function fmtIso(iso: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function fmtLatency(ms?: number): string {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return DASH;
  return `${Math.round(ms)} ms`;
}

function fmtPct(v: number | undefined, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return DASH;
  return `${v.toFixed(digits)}%`;
}

function fmtInt(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return DASH;
  return String(Math.round(v));
}

function shortSha(sha: string): string {
  if (!sha) return DASH;
  return sha.slice(0, 7);
}

function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH;
  return String(v);
}

function fmtAgeH(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return DASH;
  return h < 1 ? `${Math.round(h * 60)} min ago` : `${h.toFixed(1)} h ago`;
}

const OFFSITE_LABEL: Record<string, string> = {
  ok: "Ok",
  fail: "Failing",
  founder_action_required: "Needs operator action",
  never: "Not configured",
};

// ---------- Status classification ----------

type Level = "ok" | "warn" | "bad";

function levelForRatio(value: number | undefined, target: number): Level {
  if (value === undefined) return "ok";
  if (value >= target) return "bad";
  if (value >= target * 0.8) return "warn";
  return "ok";
}

function levelForLatency(ms: number | undefined, target: number): Level {
  if (ms === undefined || ms === 0) return "ok";
  if (ms >= target) return "bad";
  if (ms >= target * 0.8) return "warn";
  return "ok";
}

function levelForUptime(pct: number | undefined): Level {
  if (pct === undefined) return "ok";
  if (pct < UPTIME_TARGET_PCT) return "bad";
  if (pct < 99.95) return "warn";
  return "ok";
}

// Tone-mapped tile styles. bull = ok, warn = warn, bear = bad — colour never
// stands alone (icon + label included), meeting WCAG 2.1 AA "not by colour
// alone". The ink was emerald-100 / amber-100 / rose-100, values chosen for
// the deep-navy ground; on the light surface those are ~1.2:1 and the tiles
// rendered as blocks of pale colour with no readable text at all.
const LEVEL_TILE: Record<Level, string> = {
  ok: "border-bull/30 bg-bull/10 text-bull",
  warn: "border-warn/30 bg-warn/10 text-warn",
  bad: "border-bear/30 bg-bear/10 text-bear",
};

const SERVICE_LEVEL: Record<ServiceStatus, Level> = {
  ok: "ok",
  degraded: "warn",
  down: "bad",
};

const SERVICE_LABEL: Record<ServiceName, string> = {
  db: "Database",
  stripe: "Stripe",
  audit_chain: "Audit chain",
  ga4: "GA4",
};

const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
};

// ---------- Component ----------

export default async function StatusPage() {
  const [status, history, uptime] = await Promise.all([
    loadStatus(),
    loadDeployHistory(10),
    readUptimeSnapshot(),
  ]);

  const overallLevel: Level = (() => {
    if (status.services.length === 0) return "warn";
    if (status.services.some((s) => s.status === "down")) return "bad";
    if (status.services.some((s) => s.status === "degraded") || !status.ok) return "warn";
    return "ok";
  })();

  const overallLabel = {
    ok: "All systems normal",
    warn: "Degraded",
    bad: "Down",
  }[overallLevel];

  const overallPillClass = {
    ok: "bg-bull text-on-action",
    warn: "bg-warn text-on-action",
    bad: "bg-bear text-on-action",
  }[overallLevel];

  const uptimeLevel = levelForUptime(status.slo.uptime_pct_24h);
  const p95Level = levelForLatency(status.slo.p95_ms, P95_TARGET_MS);
  const diskLevel = levelForRatio(status.slo.disk_pct, DISK_TARGET_PCT);
  const memLevel = levelForRatio(status.slo.mem_pct, MEM_TARGET_PCT);

  const serviceRows: ServiceRow[] =
    status.services.length > 0
      ? status.services
      : (["db", "stripe", "audit_chain", "ga4"] as ServiceName[]).map((name) => ({
          name,
          status: "degraded" as ServiceStatus,
        }));

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Status"
        title="System status"
        subtitle="Real-time service health, service level objectives, and the last 10 deploys. Every value is pulled from live probes and log tails — nothing here is manually maintained."
      />

      <section
        aria-label="Status detail"
        className="mx-auto w-full max-w-6xl px-6 pb-12"
      >
        {/* Top strip */}
        <div
          aria-labelledby="status-overall"
          className="rounded-3xl border border-line-subtle bg-surface-sunken p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`inline-flex h-3 w-3 rounded-full ${
                  overallLevel === "ok"
                    ? "bg-bull"
                    : overallLevel === "warn"
                    ? "bg-warn"
                    : "bg-bear"
                }`}
              />
              <h2 id="status-overall" className="font-display text-xl font-semibold tracking-tight text-primary sm:text-2xl">
                {overallLabel}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${overallPillClass}`}
              >
                {overallLabel}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-secondary sm:text-right">
              <div>
                <dt className="inline">Version:&nbsp;</dt>
                <dd className="inline font-mono text-primary">{status.version || DASH}</dd>
              </div>
              <div>
                <dt className="inline">Updated:&nbsp;</dt>
                <dd className="inline font-mono text-primary">{fmtIso(status.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Service tiles */}
        <div aria-labelledby="status-services" className="mt-8">
          <h3
            id="status-services"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent"
          >
            Services
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {serviceRows.map((s) => {
              const level = SERVICE_LEVEL[s.status];
              return (
                <div
                  key={s.name}
                  className={`rounded-xl border p-4 ${LEVEL_TILE[level]}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{SERVICE_LABEL[s.name]}</p>
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      {SERVICE_STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-lg">{fmtLatency(s.latency_ms)}</p>
                  <p className="text-xs opacity-80">Latency (last probe)</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* SLO tiles */}
        <div aria-labelledby="status-slo" className="mt-10">
          <h3
            id="status-slo"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent"
          >
            Service level objectives
          </h3>
          {/* QA-3 P2 (2026-09-12): these are internal targets, not a contractual SLA. */}
          <p className="mt-2 text-xs text-secondary">
            Internal SLO targets we hold ourselves to. They are not a service-level
            agreement and no plan includes uptime credits.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SloTile
              label="Uptime (24h)"
              value={fmtPct(status.slo.uptime_pct_24h, 2)}
              target={`Internal SLO target ${UPTIME_TARGET_PCT}%`}
              level={uptimeLevel}
            />
            <SloTile
              label="p95 latency"
              value={
                status.slo.p95_ms === undefined || status.slo.p95_ms === 0
                  ? DASH
                  : `${fmtInt(status.slo.p95_ms)} ms`
              }
              target={`Internal SLO target ${P95_TARGET_MS} ms`}
              level={p95Level}
            />
            <SloTile
              label="Disk usage"
              value={fmtPct(status.slo.disk_pct, 0)}
              target={`Budget ${DISK_TARGET_PCT}%`}
              level={diskLevel}
            />
            <SloTile
              label="Memory usage"
              value={fmtPct(status.slo.mem_pct, 0)}
              target={`Budget ${MEM_TARGET_PCT}%`}
              level={memLevel}
            />
          </div>
        </div>

        {/* Deploy history */}
        <div aria-labelledby="status-deploys" className="mt-10">
          <h3
            id="status-deploys"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent"
          >
            Recent deploys
          </h3>
          <div className="mt-3 overflow-hidden rounded-2xl border border-line-subtle">
            {history.length === 0 ? (
              <div className="bg-surface-sunken p-6 text-sm text-secondary">
                No deploy history available.
              </div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {history.map((d, idx) => {
                  const ratio =
                    d.gates_expected > 0
                      ? `${d.gates_passed}/${d.gates_expected}`
                      : DASH;
                  const ratioLevel: Level =
                    d.gates_expected === 0
                      ? "warn"
                      : d.gates_passed === d.gates_expected
                      ? "ok"
                      : d.gates_passed >= d.gates_expected * 0.8
                      ? "warn"
                      : "bad";
                  return (
                    <li
                      key={`${d.ts}-${idx}`}
                      className="flex flex-col gap-2 bg-surface-sunken p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="font-mono text-sm text-primary">{fmtIso(d.ts)}</span>
                        {d.sha ? (
                          <Link
                            href={`https://github.com/Blockid-au/blockid/commit/${d.sha}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md font-mono text-sm text-action underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          >
                            {shortSha(d.sha)}
                          </Link>
                        ) : (
                          <span className="font-mono text-sm text-secondary">{DASH}</span>
                        )}
                        {d.release_id ? (
                          <span className="font-mono text-xs text-secondary">
                            rel {d.release_id}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_TILE[ratioLevel]}`}
                      >
                        Gates {ratio}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Uptime guardian */}
        <div aria-labelledby="status-uptime-guardian" className="mt-10">
          <h3
            id="status-uptime-guardian"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent"
          >
            Uptime guardian
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-line-subtle bg-surface-sunken p-4">
              <p className="text-sm font-medium text-primary">Current state</p>
              <p className="mt-3 font-mono text-2xl text-primary">
                {uptime ? (uptime.last_healthy ? "Healthy" : "Unhealthy") : DASH}
              </p>
              <p className="text-xs text-secondary">
                {uptime
                  ? `HTTP ${uptime.last_http_local || DASH} • last check ${fmtIso(uptime.last_ts)}`
                  : "no checks recorded"}
              </p>
              {uptime && uptime.window_pct !== null ? (
                <p className="mt-2 font-mono text-xs text-secondary">
                  {`24h ${uptime.window_pct.toFixed(2)}% (${uptime.window_healthy}/${uptime.window_total})`}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* G15-R2: latency by route class */}
        <div aria-labelledby="status-latency" className="mt-10">
          <h3
            id="status-latency"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent"
          >
            Latency by route class (p95, last 10 min)
          </h3>
          <p className="mt-2 text-xs text-secondary">
            Sampled every 10 minutes from the edge access log. A dash means no timing data in the window.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {LATENCY_CLASSES.map((c) => {
              const ms = status.slo.latency_p95_ms?.[c.key] ?? null;
              return (
                <SloTile
                  key={c.key}
                  label={c.label}
                  value={ms === null ? DASH : `${fmtInt(ms)} ms`}
                  target={`Internal SLO target ${c.target_ms >= 1000 ? `${c.target_ms / 1000} s` : `${c.target_ms} ms`}`}
                  level={levelForLatency(ms ?? undefined, c.target_ms)}
                />
              );
            })}
          </div>
        </div>

        {/* G15-R2: errors, AI, queues, backups */}
        <div aria-labelledby="status-ops" className="mt-10">
          <h3
            id="status-ops"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent"
          >
            Operations
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OpsTile
              label="Application errors (1 h)"
              value={status.errors_1h ? fmtCount(status.errors_1h.total) : DASH}
              level={!status.errors_1h ? "ok" : status.errors_1h.total >= 50 ? "bad" : status.errors_1h.total >= 10 ? "warn" : "ok"}
              note={status.errors_1h ? `${status.errors_1h.classes.length} class${status.errors_1h.classes.length === 1 ? "" : "es"}` : "digest not yet running"}
            />
            <OpsTile
              label="AI providers"
              value={status.ai?.providers ? `${status.ai.providers.filter((p) => p.state === "ok").length}/${status.ai.providers.length} ok` : status.ai?.models_total !== null && status.ai?.models_total !== undefined ? `${fmtCount(status.ai.models_healthy)}/${fmtCount(status.ai.models_total)} models` : DASH}
              level={!status.ai ? "ok" : status.ai.fully_degraded_24h > 0 || (status.ai.providers?.some((p) => p.state === "blocked") ?? false) ? "bad" : (status.ai.providers?.some((p) => p.state === "cooldown") ?? false) || (status.ai.budget_exhausted_1h ?? 0) > 0 ? "warn" : "ok"}
              note={status.ai ? `${fmtCount(status.ai.fully_degraded_24h)} degraded report${status.ai.fully_degraded_24h === 1 ? "" : "s"} (24 h)` : "no data"}
            />
            <OpsTile
              label="Queues"
              value={status.queues ? fmtCount(status.queues.email_queued) : DASH}
              level={!status.queues ? "ok" : (status.queues.email_failed_24h ?? 0) + (status.queues.webhook_failed_24h ?? 0) > 0 ? "warn" : "ok"}
              note={status.queues ? `emails queued · ${fmtCount(status.queues.email_failed_24h)} email / ${fmtCount(status.queues.webhook_failed_24h)} webhook failures (24 h) · ${fmtCount(status.queues.report_orders_pending)} orders pending` : "no data"}
            />
            <OpsTile
              label="Database backup"
              value={status.backups_detail ? fmtAgeH(status.backups_detail.local_age_h) : DASH}
              level={!status.backups_detail || status.backups_detail.local_age_h === null ? "warn" : status.backups_detail.local_age_h > BACKUP_LOCAL_MAX_AGE_H ? "bad" : status.backups_detail.offsite_status === "ok" ? "ok" : "warn"}
              note={status.backups_detail ? `off-site: ${OFFSITE_LABEL[status.backups_detail.offsite_status] ?? status.backups_detail.offsite_status} · restore drill: ${status.backups_detail.restore_drill_last_ok_at ? fmtIso(status.backups_detail.restore_drill_last_ok_at) : "never"}` : "no data"}
            />
          </div>
          {status.errors_1h && status.errors_1h.classes.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-line-subtle">
              <ul className="divide-y divide-line-subtle bg-surface-sunken text-sm">
                {status.errors_1h.classes.map((c, idx) => (
                  <li key={`${c.tag}-${idx}`} className="flex items-baseline gap-3 p-3">
                    <span className="font-mono text-xs text-secondary">{`×${c.count}`}</span>
                    <span className="font-mono text-xs text-action">{`[${c.tag}]`}</span>
                    <span className="truncate font-mono text-xs text-primary">{c.msg || DASH}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {status.ai?.providers && status.ai.providers.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {status.ai.providers.map((p) => (
                <li
                  key={p.name}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${LEVEL_TILE[p.state === "ok" ? "ok" : p.state === "cooldown" ? "warn" : "bad"]}`}
                >
                  <span className="font-mono">{p.name}</span>
                  <span className="uppercase tracking-wide">{p.state}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {status.crons_failed_24h && status.crons_failed_24h.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm">
              <p className="font-medium text-primary">Scheduled jobs that failed in the last 24 h</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-primary">
                {status.crons_failed_24h.map((c) => (
                  <li key={c.endpoint}>
                    {`${c.endpoint} `}
                    <span className="text-secondary">{`×${c.count}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Cron table */}
        <div aria-labelledby="status-crons" className="mt-10">
          <h3
            id="status-crons"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent"
          >
            Scheduled jobs (24h)
          </h3>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line-subtle">
            {status.crons.length === 0 ? (
              <div className="bg-surface-sunken p-6 text-sm text-secondary">
                No cron activity in the window.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-line-subtle text-sm">
                <thead className="bg-surface-raised text-left text-xs uppercase tracking-wide text-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Job
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Last run
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Ok rate
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Avg duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle bg-surface-sunken">
                  {status.crons.map((c) => {
                    const okLevel: Level =
                      c.ok_rate_24h_pct >= 99
                        ? "ok"
                        : c.ok_rate_24h_pct >= 95
                        ? "warn"
                        : "bad";
                    return (
                      <tr key={c.name}>
                        <td className="px-4 py-2 font-mono text-primary">{c.name}</td>
                        <td className="px-4 py-2 font-mono text-secondary">{fmtIso(c.last_run)}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_TILE[okLevel]}`}
                          >
                            {c.ok_rate_24h_pct}%
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-secondary">{fmtInt(c.avg_duration_ms)} ms</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Related links */}
        <nav
          aria-label="Related pages"
          className="mt-12 rounded-2xl border border-line-subtle bg-surface-sunken p-6 text-sm"
        >
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link
                href="/changelog"
                className="rounded-md text-primary underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Changelog
              </Link>
            </li>
            <li>
              <Link
                href="/roadmap"
                className="rounded-md text-primary underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Roadmap
              </Link>
            </li>
            <li>
              <Link
                href="/security-audit"
                className="rounded-md text-primary underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Security audit summary
              </Link>
            </li>
          </ul>
        </nav>
      </section>
    </MarketingShell>
  );
}

// ---------- Sub-components ----------

function OpsTile(props: { label: string; value: string; note: string; level: Level }) {
  const { label, value, note, level } = props;
  return (
    <div className={`rounded-xl border p-4 ${LEVEL_TILE[level]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-3 font-mono text-2xl">{value}</p>
      <p className="mt-1 text-xs opacity-80">{note}</p>
    </div>
  );
}

function SloTile(props: {
  label: string;
  value: string;
  target: string;
  level: Level;
}) {
  const { label, value, target, level } = props;
  return (
    <div className={`rounded-xl border p-4 ${LEVEL_TILE[level]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-3 font-mono text-2xl">{value}</p>
      <p className="text-xs opacity-80">{target}</p>
    </div>
  );
}
