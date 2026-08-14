"use client";

// GA4 Traffic Report — admin dashboard client component.
//
// Fetches GET /api/admin/ga4-report and renders a table of the top 10 pages
// by pageviews (last 30 days) with sessions, bounce rate, and avg session
// duration. Uses glassmorphism card styling consistent with the rest of the
// admin dashboard.
//
// Mounts inside admin pages that import it. Degrades gracefully when GA4
// is not configured — shows a friendly "not connected" message.

import { useEffect, useState } from "react";
import { BarChart3, AlertTriangle, RefreshCw } from "lucide-react";

interface Ga4ReportRow {
  page: string;
  pageviews: number;
  sessions: number;
  bounceRate: number;
  avgSessionDurationSec: number;
}

interface Ga4ReportData {
  ok: boolean;
  connected: boolean;
  rangeLabel: string;
  rows: Ga4ReportRow[];
  generatedAt: string;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-AU");
}

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtPct(rate: number): string {
  if (!Number.isFinite(rate)) return "0%";
  // GA4 returns bounce rate as a decimal (0–1); multiply for display.
  return `${Math.round(rate * 100)}%`;
}

export function Ga4TrafficReport() {
  const [data, setData] = useState<Ga4ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ga4-report", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as Ga4ReportData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">
            GA4 Page Traffic
          </h2>
          {data && (
            <span className="ml-2 text-xs text-ink-400 dark:text-slate-400">
              {data.rangeLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { void load(); }}
          disabled={loading}
          aria-label="Refresh GA4 report"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-ink-600 dark:text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Body */}
      <div className="px-6 py-4">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && data && !data.connected && (
          <div className="flex items-start gap-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-6 text-sm text-ink-500 text-center justify-center">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            <span>
              GA4 not configured. Set{" "}
              <code className="font-mono text-xs">GA4_PROPERTY_ID</code> and{" "}
              <code className="font-mono text-xs">GOOGLE_APPLICATION_CREDENTIALS_JSON</code> in{" "}
              <code className="font-mono text-xs">.env</code> to enable live traffic data.
            </span>
          </div>
        )}

        {!loading && !error && data && data.connected && data.rows.length === 0 && (
          <p className="text-sm text-ink-400 text-center py-6">No data available for this period.</p>
        )}

        {!loading && !error && data && data.connected && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold text-ink-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="pb-2 text-left pr-4">Page</th>
                  <th className="pb-2 text-right pr-4">Pageviews</th>
                  <th className="pb-2 text-right pr-4">Sessions</th>
                  <th className="pb-2 text-right pr-4">Bounce Rate</th>
                  <th className="pb-2 text-right">Avg Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.rows.map((row) => (
                  <tr key={row.page} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-brand-700 dark:text-cyan-400 truncate max-w-[220px]" title={row.page}>
                      {row.page}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-ink-900 dark:text-white">
                      {fmt(row.pageviews)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink-600 dark:text-slate-300">
                      {fmt(row.sessions)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink-600 dark:text-slate-300">
                      {fmtPct(row.bounceRate)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-ink-600 dark:text-slate-300">
                      {fmtDuration(row.avgSessionDurationSec)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <p className="mt-3 text-[10px] text-ink-400 dark:text-slate-500 text-right">
            Generated {new Date(data.generatedAt).toLocaleString("en-AU")}
          </p>
        )}
      </div>
    </div>
  );
}
