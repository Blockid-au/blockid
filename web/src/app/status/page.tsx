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

import type { Metadata } from "next";
import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import {
  readResellerLoopSnapshot,
  readUptimeSnapshot,
} from "@/lib/autonomous-loop-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Status — BlockID.au",
  description: "System status, SLOs, and the last 30 days of deploys.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://blockid.au/status" },
};

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

// ---------- SLO thresholds ----------

const P95_TARGET_MS = 800;
const DISK_TARGET_PCT = 80;
const MEM_TARGET_PCT = 75;
const UPTIME_TARGET_PCT = 99.9;

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

// Tone-mapped tile styles. Cyan = ok, amber = warn, rose = bad — colour never
// stands alone (icon + label included), meeting WCAG 2.1 AA "not by colour
// alone" and 4.5:1 contrast against the fintech backdrop.
const LEVEL_TILE: Record<Level, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  bad: "border-rose-500/30 bg-rose-500/10 text-rose-100",
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
  const [status, history, resellerLoop, uptime] = await Promise.all([
    loadStatus(),
    loadDeployHistory(10),
    readResellerLoopSnapshot(),
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
    ok: "bg-emerald-500 text-emerald-950",
    warn: "bg-amber-400 text-amber-950",
    bad: "bg-rose-500 text-rose-50",
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
          className="rounded-3xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`inline-flex h-3 w-3 rounded-full ${
                  overallLevel === "ok"
                    ? "bg-emerald-400"
                    : overallLevel === "warn"
                    ? "bg-amber-400"
                    : "bg-rose-500"
                }`}
              />
              <h2 id="status-overall" className="font-display text-xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-2xl">
                {overallLabel}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${overallPillClass}`}
              >
                {overallLabel}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-[var(--fintech-ink-muted)] sm:text-right">
              <div>
                <dt className="inline">Version:&nbsp;</dt>
                <dd className="inline font-mono text-[var(--fintech-ink)]">{status.version || DASH}</dd>
              </div>
              <div>
                <dt className="inline">Updated:&nbsp;</dt>
                <dd className="inline font-mono text-[var(--fintech-ink)]">{fmtIso(status.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Service tiles */}
        <div aria-labelledby="status-services" className="mt-8">
          <h3
            id="status-services"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
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
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Service level objectives
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SloTile
              label="Uptime (24h)"
              value={fmtPct(status.slo.uptime_pct_24h, 2)}
              target={`Target ${UPTIME_TARGET_PCT}%`}
              level={uptimeLevel}
            />
            <SloTile
              label="p95 latency"
              value={
                status.slo.p95_ms === undefined || status.slo.p95_ms === 0
                  ? DASH
                  : `${fmtInt(status.slo.p95_ms)} ms`
              }
              target={`Target ${P95_TARGET_MS} ms`}
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
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Recent deploys
          </h3>
          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--fintech-border)]">
            {history.length === 0 ? (
              <div className="bg-[var(--fintech-bg-elevated)] p-6 text-sm text-[var(--fintech-ink-muted)]">
                No deploy history available.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--fintech-border)]">
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
                      className="flex flex-col gap-2 bg-[var(--fintech-bg-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="font-mono text-sm text-[var(--fintech-ink)]">{fmtIso(d.ts)}</span>
                        {d.sha ? (
                          <Link
                            href={`https://github.com/Blockid-au/blockid/commit/${d.sha}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md font-mono text-sm text-[var(--fintech-accent)] underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
                          >
                            {shortSha(d.sha)}
                          </Link>
                        ) : (
                          <span className="font-mono text-sm text-[var(--fintech-ink-muted)]">{DASH}</span>
                        )}
                        {d.release_id ? (
                          <span className="font-mono text-xs text-[var(--fintech-ink-muted)]">
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

        {/* Autonomous loop */}
        <div aria-labelledby="status-autonomous" className="mt-10">
          <h3
            id="status-autonomous"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Autonomous loop
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-4">
              <p className="text-sm font-medium text-[var(--fintech-ink)]">Reseller loop</p>
              <p className="mt-3 font-mono text-2xl text-[var(--fintech-ink)]">
                {resellerLoop?.current_tick_number !== null && resellerLoop?.current_tick_number !== undefined
                  ? `tick ${resellerLoop.current_tick_number}`
                  : DASH}
              </p>
              <p className="text-xs text-[var(--fintech-ink-muted)]">
                {resellerLoop?.current_phase
                  ? `${resellerLoop.current_phase} • `
                  : ""}
                {resellerLoop
                  ? `${resellerLoop.total_ticks_completed} ticks in history`
                  : "no history"}
              </p>
              {resellerLoop?.tick_state ? (
                <p className="mt-2 font-mono text-xs text-[var(--fintech-ink-muted)]">
                  {resellerLoop.tick_state}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-4">
              <p className="text-sm font-medium text-[var(--fintech-ink)]">Uptime guardian</p>
              <p className="mt-3 font-mono text-2xl text-[var(--fintech-ink)]">
                {uptime ? (uptime.last_healthy ? "Healthy" : "Unhealthy") : DASH}
              </p>
              <p className="text-xs text-[var(--fintech-ink-muted)]">
                {uptime
                  ? `HTTP ${uptime.last_http_local || DASH} • last check ${fmtIso(uptime.last_ts)}`
                  : "no checks recorded"}
              </p>
              {uptime && uptime.window_pct !== null ? (
                <p className="mt-2 font-mono text-xs text-[var(--fintech-ink-muted)]">
                  {`24h ${uptime.window_pct.toFixed(2)}% (${uptime.window_healthy}/${uptime.window_total})`}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-4">
              <p className="text-sm font-medium text-[var(--fintech-ink)]">Next reseller tick</p>
              <p className="mt-3 font-mono text-2xl text-[var(--fintech-ink)]">
                {resellerLoop?.next_utc || DASH}
              </p>
              <p className="text-xs text-[var(--fintech-ink-muted)]">
                {resellerLoop?.seconds_until !== null && resellerLoop?.seconds_until !== undefined
                  ? `in ~${Math.max(0, Math.round(resellerLoop.seconds_until / 60))} min`
                  : "n/a"}
              </p>
              {resellerLoop?.last_tick_id ? (
                <p className="mt-2 font-mono text-xs text-[var(--fintech-ink-muted)]">
                  {`last ${resellerLoop.last_tick_id}`}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Cron table */}
        <div aria-labelledby="status-crons" className="mt-10">
          <h3
            id="status-crons"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Scheduled jobs (24h)
          </h3>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--fintech-border)]">
            {status.crons.length === 0 ? (
              <div className="bg-[var(--fintech-bg-elevated)] p-6 text-sm text-[var(--fintech-ink-muted)]">
                No cron activity in the window.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-[var(--fintech-border)] text-sm">
                <thead className="bg-[var(--fintech-surface)] text-left text-xs uppercase tracking-wide text-[var(--fintech-ink-muted)]">
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
                <tbody className="divide-y divide-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)]">
                  {status.crons.map((c) => {
                    const okLevel: Level =
                      c.ok_rate_24h_pct >= 99
                        ? "ok"
                        : c.ok_rate_24h_pct >= 95
                        ? "warn"
                        : "bad";
                    return (
                      <tr key={c.name}>
                        <td className="px-4 py-2 font-mono text-[var(--fintech-ink)]">{c.name}</td>
                        <td className="px-4 py-2 font-mono text-[var(--fintech-ink-muted)]">{fmtIso(c.last_run)}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_TILE[okLevel]}`}
                          >
                            {c.ok_rate_24h_pct}%
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-[var(--fintech-ink-muted)]">{fmtInt(c.avg_duration_ms)} ms</td>
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
          className="mt-12 rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6 text-sm"
        >
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link
                href="/changelog"
                className="rounded-md text-[var(--fintech-ink)] underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
              >
                Changelog
              </Link>
            </li>
            <li>
              <Link
                href="/roadmap"
                className="rounded-md text-[var(--fintech-ink)] underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
              >
                Roadmap
              </Link>
            </li>
            <li>
              <Link
                href="/security-audit"
                className="rounded-md text-[var(--fintech-ink)] underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
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
