"use client";

import { useEffect, useState } from "react";

interface GuardianRow {
  ts: string;
  healthy: 0 | 1;
  http_local: string;
  disk_pct: number;
  mem_pct: number;
  swap_mb: number;
  load_1min: number;
  nproc: number;
  uptime_s: number;
  blockid_procs: number;
  fail_count: number;
  disk_action: string;
  mem_action: string;
  rollback_action: string;
}

interface StatusResponse {
  ok: boolean;
  latest: GuardianRow | null;
  history: GuardianRow[];
  generated_at: string;
}

function fmtUptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function pctColor(pct: number): string {
  if (pct >= 85) return "text-red-700";
  if (pct >= 75) return "text-orange-600";
  if (pct >= 60) return "text-yellow-700";
  return "text-emerald-700";
}

export default function UptimeGuardianClient() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/admin/uptime-guardian", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StatusResponse;
        if (!alive) return;
        setData(json);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Fetch failed: {error}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  const latest = data.latest;
  if (!latest) {
    return (
      <div className="rounded-lg border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-600">
        No guardian ticks yet — the cron fires every 2 min.
      </div>
    );
  }

  // Compute uptime deltas since the last state change.
  const totalRuns = data.history.length;
  const unhealthyRuns = data.history.filter((r) => r.healthy === 0).length;
  const uptimePct = totalRuns > 0 ? ((totalRuns - unhealthyRuns) / totalRuns) * 100 : 100;

  return (
    <>
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Health"
          value={latest.healthy === 1 ? "✅ Healthy" : "❌ Unhealthy"}
          hint={`HTTP ${latest.http_local}`}
          tone={latest.healthy === 1 ? "ok" : "err"}
        />
        <Stat
          label="Uptime % (last ~4h)"
          value={`${uptimePct.toFixed(2)}%`}
          hint={`${totalRuns} ticks, ${unhealthyRuns} unhealthy`}
          tone={uptimePct >= 99 ? "ok" : "warn"}
        />
        <Stat
          label="Disk"
          value={`${latest.disk_pct}%`}
          hint={latest.disk_action}
          className={pctColor(latest.disk_pct)}
        />
        <Stat
          label="Memory"
          value={`${latest.mem_pct}%`}
          hint={latest.mem_action}
          className={pctColor(latest.mem_pct)}
        />
        <Stat
          label="Server uptime"
          value={fmtUptime(latest.uptime_s)}
          hint={`load 1m: ${latest.load_1min}`}
        />
        <Stat label="CPU cores" value={String(latest.nproc)} />
        <Stat
          label="Rollback triggered"
          value={latest.rollback_action === "attempted" ? "⚠ Yes" : "— No"}
          tone={latest.rollback_action === "attempted" ? "warn" : "ok"}
        />
        <Stat label="Guardian last tick" value={latest.ts.slice(11, 19)} hint="UTC" />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">Recent ticks (last 120)</h2>
        <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-surface-50 text-left uppercase tracking-wide text-ink-500">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Health</th>
                <th className="p-2">HTTP</th>
                <th className="p-2">Disk</th>
                <th className="p-2">Mem</th>
                <th className="p-2">Load</th>
                <th className="p-2">Fail #</th>
                <th className="p-2">Disk act</th>
                <th className="p-2">Rollback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {[...data.history].reverse().slice(0, 60).map((r, i) => (
                <tr key={`${r.ts}-${i}`}>
                  <td className="p-2 font-mono text-ink-700">{r.ts.slice(11, 19)}</td>
                  <td className="p-2">{r.healthy === 1 ? "✅" : "❌"}</td>
                  <td className="p-2">{r.http_local}</td>
                  <td className={`p-2 ${pctColor(r.disk_pct)}`}>{r.disk_pct}%</td>
                  <td className={`p-2 ${pctColor(r.mem_pct)}`}>{r.mem_pct}%</td>
                  <td className="p-2">{r.load_1min}</td>
                  <td className="p-2">{r.fail_count > 0 ? r.fail_count : "—"}</td>
                  <td className="p-2 text-ink-600">
                    {r.disk_action !== "none" ? r.disk_action : "—"}
                  </td>
                  <td className="p-2 text-ink-600">
                    {r.rollback_action !== "none" ? r.rollback_action : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "err";
  className?: string;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-yellow-800"
        : tone === "err"
          ? "text-red-700"
          : className ?? "text-ink-900";
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
