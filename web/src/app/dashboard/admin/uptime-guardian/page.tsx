// /dashboard/admin/uptime-guardian — G-16: uptime + rollback console.
//
// W7b: admin-only. Server component reads:
//   • deploy_incidents (last 20)
//   • perf_samples (last 24h) — p95 latency, uptime %
//   • /tmp/blockid-uptime.log (tail 40 lines)
//   • .deploy-manifest.json (current build)
// Renders tiles + incident feed. Rollback button POSTs /api/admin/rollback
// via a small client island.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "Uptime Guardian — Admin — BlockID",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface IncidentRow {
  id: string;
  ts: string;
  kind: string;
  severity: "info" | "warn" | "alert" | "critical";
  task_id: string | null;
  git_sha: string | null;
  duration_ms: number | null;
  resolved_at: string | null;
  detail: Record<string, unknown>;
}

interface PerfRow {
  ts: string;
  route: string;
  lh_score: number | null;
  lcp_ms: number | null;
  ttfb_ms: number | null;
  inp_ms: number | null;
}

interface Manifest {
  git_sha?: string;
  sha?: string;
  deployed_at?: string;
  build_id?: string;
}

async function readManifest(): Promise<Manifest | null> {
  const candidates = [
    "/home/dovanlong/blockid.au/web/.deploy-manifest.json",
    path.join(process.cwd(), ".deploy-manifest.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      return JSON.parse(raw) as Manifest;
    } catch {
      // try next
    }
  }
  return null;
}

async function readUptimeTail(lines = 40): Promise<string[]> {
  try {
    const raw = await fs.readFile("/tmp/blockid-uptime.log", "utf8");
    const all = raw.split("\n").filter(Boolean);
    return all.slice(-lines);
  } catch {
    return [];
  }
}

function percentile(nums: number[], p: number): number | null {
  const clean = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const idx = Math.min(clean.length - 1, Math.floor((p / 100) * clean.length));
  return clean[idx];
}

export default async function UptimeGuardianPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/uptime-guardian");
  if (user.role !== "admin") redirect("/dashboard");

  const supabase = isSupabaseConfigured() ? getSupabaseAdmin() : null;

  const incidents: IncidentRow[] = [];
  const perfSamples: PerfRow[] = [];
  if (supabase) {
    const [{ data: iData }, { data: pData }] = await Promise.all([
      supabase
        .from("deploy_incidents")
        .select("id, ts, kind, severity, task_id, git_sha, duration_ms, resolved_at, detail")
        .order("ts", { ascending: false })
        .limit(20),
      supabase
        .from("perf_samples")
        .select("ts, route, lh_score, lcp_ms, ttfb_ms, inp_ms")
        .gte("ts", new Date(Date.now() - 24 * 3_600_000).toISOString())
        .order("ts", { ascending: false })
        .limit(500),
    ]);
    incidents.push(...((iData ?? []) as IncidentRow[]));
    perfSamples.push(...((pData ?? []) as PerfRow[]));
  }

  const manifest = await readManifest();
  const uptimeTail = await readUptimeTail();

  const p95Latency = percentile(
    perfSamples.map((s) => Number(s.lcp_ms ?? s.ttfb_ms ?? NaN)),
    95,
  );

  // Uptime % from incidents: minutes of critical/alert downtime in the last
  // 24h. Falls back to "n/a" if we lack duration data.
  const downtimeMs = incidents
    .filter((i) => (i.severity === "critical" || i.severity === "alert") && i.kind === "downtime")
    .filter((i) => Date.now() - new Date(i.ts).getTime() < 24 * 3_600_000)
    .reduce((sum, i) => sum + Math.max(0, i.duration_ms ?? 0), 0);
  const dayMs = 24 * 3_600_000;
  const uptimePct = ((dayMs - Math.min(downtimeMs, dayMs)) / dayMs) * 100;

  // Disk / mem are read once at build via /proc. Best-effort.
  const [diskPct, memPct] = await Promise.all([readDiskPct(), readMemPct()]);

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Uptime Guardian</h1>
            <p className="text-sm text-ink-500 mt-1">
              Current build{" "}
              <span className="font-mono">
                {manifest?.git_sha ?? manifest?.sha ?? "?"}
              </span>
              {manifest?.deployed_at ? (
                <> · deployed {new Date(manifest.deployed_at).toLocaleString("en-AU")}</>
              ) : null}
            </p>
          </div>
          <form
            action="/api/admin/rollback"
            method="post"
            className="inline-block"
          >
            <input type="hidden" name="reason" value="admin_ui_button" />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Rollback to previous build
            </button>
          </form>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="Uptime (24h)" value={`${uptimePct.toFixed(2)}%`} tone={uptimePct >= 99.9 ? "ok" : uptimePct >= 99 ? "warn" : "bad"} />
          <Tile label="p95 latency" value={p95Latency == null ? "n/a" : `${p95Latency.toFixed(0)} ms`} tone={p95Latency == null ? "muted" : p95Latency < 800 ? "ok" : p95Latency < 2500 ? "warn" : "bad"} />
          <Tile label="Disk used" value={diskPct == null ? "n/a" : `${diskPct.toFixed(0)}%`} tone={diskPct == null ? "muted" : diskPct < 70 ? "ok" : diskPct < 90 ? "warn" : "bad"} />
          <Tile label="Memory used" value={memPct == null ? "n/a" : `${memPct.toFixed(0)}%`} tone={memPct == null ? "muted" : memPct < 70 ? "ok" : memPct < 90 ? "warn" : "bad"} />
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Recent incidents (last 20)</h2>
          {incidents.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500 italic">No incidents recorded.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {incidents.map((inc) => (
                <li key={inc.id} className="py-3 flex items-start gap-3">
                  <SeverityDot severity={inc.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {inc.kind} · <span className="font-normal text-ink-500">{inc.task_id ?? "—"}</span>
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {new Date(inc.ts).toLocaleString("en-AU")}
                      {inc.git_sha ? <> · sha <span className="font-mono">{inc.git_sha.slice(0, 8)}</span></> : null}
                      {inc.duration_ms ? <> · {inc.duration_ms} ms</> : null}
                      {inc.resolved_at ? <> · resolved</> : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Uptime probe log</h2>
          <p className="text-xs text-ink-500 mt-1">
            Tail of <span className="font-mono">/tmp/blockid-uptime.log</span>
          </p>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 text-slate-100 text-xs p-3 whitespace-pre-wrap">
            {uptimeTail.length === 0 ? "(no probe log yet)" : uptimeTail.join("\n")}
          </pre>
        </section>
      </div>
    </WorkspaceLayout>
  );
}

async function readDiskPct(): Promise<number | null> {
  try {
    const { spawnSync } = await import("node:child_process");
    const out = spawnSync("df", ["-P", "/"], { encoding: "utf8" });
    if (out.status !== 0) return null;
    const line = out.stdout.split("\n")[1] ?? "";
    const cols = line.trim().split(/\s+/);
    const pctCol = cols[4] ?? "";
    const n = Number(pctCol.replace("%", ""));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function readMemPct(): Promise<number | null> {
  try {
    const raw = await fs.readFile("/proc/meminfo", "utf8");
    const total = Number(raw.match(/MemTotal:\s+(\d+)/)?.[1] ?? 0);
    const avail = Number(raw.match(/MemAvailable:\s+(\d+)/)?.[1] ?? 0);
    if (!total) return null;
    return ((total - avail) / total) * 100;
  } catch {
    return null;
  }
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "muted";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
      ? "text-amber-600"
      : tone === "bad"
      ? "text-rose-600"
      : "text-slate-400";
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function SeverityDot({ severity }: { severity: IncidentRow["severity"] }) {
  const color =
    severity === "critical"
      ? "bg-rose-500"
      : severity === "alert"
      ? "bg-amber-500"
      : severity === "warn"
      ? "bg-yellow-400"
      : "bg-slate-300";
  return (
    <span
      className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${color}`}
      aria-label={severity}
      title={severity}
    />
  );
}
