// /status — public system status page.
//
// Server component. Pulls the aggregate view from /api/status (which itself
// probes localhost /api/healthz and reads deploy + cron logs). Reads a
// slightly deeper slice of the deploy log directly for the 10-row history.
//
// Rendering rules:
//   - Missing / empty values render as an em-dash rather than crashing.
//   - No emoji. Pragmatic Australian tone. No hype.
//   - Full dark-mode support via `dark:` utility classes.

import type { Metadata } from "next";
import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

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

// ---------- SLO thresholds (from docs/IMPLEMENTATION-PLAN-v2.md §13.3) ----------

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
    // Walk newest-first, skip webhook events.
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
  // Consistent, sortable, timezone-explicit — pragmatic UTC.
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

// Tailwind-safe class strings for each level.
const LEVEL_TILE: Record<Level, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100",
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
  bad: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100",
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
  const [status, history] = await Promise.all([loadStatus(), loadDeployHistory(10)]);

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
    ok: "bg-emerald-600 text-white dark:bg-emerald-500",
    warn: "bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950",
    bad: "bg-rose-600 text-white dark:bg-rose-500",
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
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Top strip */}
        <section
          aria-labelledby="status-overall"
          className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`inline-flex h-3 w-3 rounded-full ${
                  overallLevel === "ok"
                    ? "bg-emerald-500"
                    : overallLevel === "warn"
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
              />
              <h1 id="status-overall" className="text-xl font-semibold tracking-tight sm:text-2xl">
                {overallLabel}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${overallPillClass}`}
              >
                {overallLabel}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400 sm:text-right">
              <div>
                <dt className="inline">Version:&nbsp;</dt>
                <dd className="inline font-mono">{status.version || DASH}</dd>
              </div>
              <div>
                <dt className="inline">Updated:&nbsp;</dt>
                <dd className="inline font-mono">{fmtIso(status.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Service tiles */}
        <section aria-labelledby="status-services" className="mt-8">
          <h2
            id="status-services"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Services
          </h2>
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
        </section>

        {/* SLO tiles */}
        <section aria-labelledby="status-slo" className="mt-10">
          <h2
            id="status-slo"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Service level objectives
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SloTile
              label="Uptime (24h)"
              value={fmtPct(status.slo.uptime_pct_24h, 2)}
              target={`Target ${UPTIME_TARGET_PCT}%`}
              level={uptimeLevel}
            />
            <SloTile
              label="p95 latency /"
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
        </section>

        {/* Deploy history */}
        <section aria-labelledby="status-deploys" className="mt-10">
          <h2
            id="status-deploys"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Recent deploys
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            {history.length === 0 ? (
              <div className="p-6 text-sm text-neutral-500 dark:text-neutral-400">
                No deploy history available.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
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
                      className="flex flex-col gap-2 bg-white p-4 dark:bg-neutral-900 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="font-mono text-sm">{fmtIso(d.ts)}</span>
                        {d.sha ? (
                          <Link
                            href={`https://github.com/Blockid-au/blockid/commit/${d.sha}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-sm text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-300"
                          >
                            {shortSha(d.sha)}
                          </Link>
                        ) : (
                          <span className="font-mono text-sm text-neutral-500">{DASH}</span>
                        )}
                        {d.release_id ? (
                          <span className="font-mono text-xs text-neutral-500 dark:text-neutral-500">
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
        </section>

        {/* Cron table */}
        <section aria-labelledby="status-crons" className="mt-10">
          <h2
            id="status-crons"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Scheduled jobs (24h)
          </h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            {status.crons.length === 0 ? (
              <div className="p-6 text-sm text-neutral-500 dark:text-neutral-400">
                No cron activity in the window.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
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
                <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                  {status.crons.map((c) => {
                    const okLevel: Level =
                      c.ok_rate_24h_pct >= 99
                        ? "ok"
                        : c.ok_rate_24h_pct >= 95
                        ? "warn"
                        : "bad";
                    return (
                      <tr key={c.name}>
                        <td className="px-4 py-2 font-mono">{c.name}</td>
                        <td className="px-4 py-2 font-mono">{fmtIso(c.last_run)}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_TILE[okLevel]}`}
                          >
                            {c.ok_rate_24h_pct}%
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono">{fmtInt(c.avg_duration_ms)} ms</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Inline footer summary */}
        <section
          aria-labelledby="status-links"
          className="mt-12 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 id="status-links" className="sr-only">
            Related pages
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link
                href="/changelog"
                className="text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-300"
              >
                Changelog
              </Link>
            </li>
            <li>
              <Link
                href="/roadmap"
                className="text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-300"
              >
                Roadmap
              </Link>
            </li>
            <li>
              <Link
                href="/security-audit"
                className="text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-300"
              >
                Security audit summary
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500">
            Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW.
          </p>
        </section>
      </main>

      <Footer />
    </div>
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
