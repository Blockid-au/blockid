"use client";

import { useEffect, useState } from "react";

interface MonitorRow {
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
  last_log?: { stage?: string; ts?: string };
}

interface TickRow {
  tick_id?: string;
  ts?: string;
  stage?: string;
  elapsed_ms?: number;
  status?: number;
  head?: string;
  reason?: string;
}

interface StatusResponse {
  ok: boolean;
  complete: boolean;
  completed_at: string | null;
  snapshot: string;
  monitor_history: MonitorRow[];
  tick_history: TickRow[];
  generated_at: string;
}

function stageEmoji(stage: string | undefined): string {
  switch (stage) {
    case "tick_start": return "▶";
    case "tick_end": return "■";
    case "delegated_dispatch": return "⚙";
    case "auto_commit_started":
    case "auto_commit_finished": return "📝";
    case "auto_deploy_triggered": return "🚀";
    case "auto_deploy_finished": return "✅";
    case "auto_deploy_skipped": return "⏭";
    case "auto_deploy_failed": return "⚠";
    case "goal_completed": return "🏁";
    default: return "·";
  }
}

export default function ResellerLoopLiveClient() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/admin/reseller-loop/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StatusResponse;
        if (!alive) return;
        setData(json);
        setError(null);
        setLastFetchedAt(new Date().toISOString());
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void tick();
    const id = setInterval(tick, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Status fetch failed: {error}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-ink-500">Loading loop status…</p>;
  }

  if (data.complete) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">🏁 Goal COMPLETE</p>
        <p className="mt-1">Loop stopped at: {data.completed_at}</p>
      </div>
    );
  }

  const summary = data.monitor_history[data.monitor_history.length - 1];

  return (
    <>
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-surface-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">State</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">
            {summary?.tick_state ?? "unknown"}
          </p>
        </div>
        <div className="rounded-lg border border-surface-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Next tick</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">
            {summary?.next_utc ?? "—"} UTC
          </p>
          <p className="text-xs text-ink-500">in {summary?.seconds_until ?? 0}s</p>
        </div>
        <div className="rounded-lg border border-surface-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Last dispatch</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">
            {(summary?.last_dispatch_ms ?? 0) / 1000}s
          </p>
        </div>
        <div className="rounded-lg border border-surface-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">HEAD sha</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink-900">
            {summary?.head_sha ?? "—"}
          </p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-ink-900">Live snapshot</h2>
        <pre className="overflow-x-auto rounded-lg border border-surface-200 bg-white p-4 text-xs leading-relaxed text-ink-800">
          {data.snapshot || "(no snapshot yet — monitor cron will populate within 60s)"}
        </pre>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-ink-900">Tick timeline (last 40 events)</h2>
        <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-surface-50 text-left uppercase tracking-wide text-ink-500">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2">Timestamp</th>
                <th className="p-2">Stage</th>
                <th className="p-2">Tick id</th>
                <th className="p-2">Elapsed</th>
                <th className="p-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {[...data.tick_history].reverse().map((row, i) => (
                <tr key={`${row.tick_id}-${row.stage}-${row.ts}-${i}`}>
                  <td className="p-2 text-lg">{stageEmoji(row.stage)}</td>
                  <td className="p-2 font-mono text-ink-700">
                    {row.ts?.slice(11, 19) ?? "—"}
                  </td>
                  <td className="p-2 text-ink-900">{row.stage ?? "—"}</td>
                  <td className="p-2 font-mono text-ink-500">
                    {row.tick_id?.slice(0, 22) ?? "—"}
                  </td>
                  <td className="p-2 text-ink-700">
                    {row.elapsed_ms ? `${Math.round(row.elapsed_ms / 1000)}s` : "—"}
                  </td>
                  <td className="p-2 text-ink-600">
                    {row.head ? `head=${row.head}` : ""}
                    {row.status !== undefined ? ` status=${row.status}` : ""}
                    {row.reason ? ` reason=${row.reason}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-ink-500">
        Last fetched: {lastFetchedAt ?? "—"} · Auto-refresh every 15 s
      </p>
    </>
  );
}
