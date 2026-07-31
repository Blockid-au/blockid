"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Coins,
  Clock,
  FlaskConical,
  UserPlus,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import type {
  ActiveExperiment,
  CreditBurn,
  CronHealthEntry,
  DeployHealth,
  Growth7d,
  ReleaseInfo,
  SecurityPosture,
} from "@/lib/ops-metrics";

interface Props {
  user: { email: string; displayName: string | null };
  release: ReleaseInfo;
  deployHealth: DeployHealth;
  creditBurn: CreditBurn;
  cronHealth: CronHealthEntry[];
  experiments: ActiveExperiment[];
  growth: Growth7d;
  posture: SecurityPosture | null;
}

// ── Small utilities ────────────────────────────────────────────────────

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function fmtCredits(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function lagColor(mins: number): { pill: string; label: string } {
  if (mins < 10) {
    return {
      pill: "bg-green-50 text-green-700 border border-green-200",
      label: `${mins}m ago`,
    };
  }
  if (mins < 60) {
    return {
      pill: "bg-amber-50 text-amber-700 border border-amber-200",
      label: `${mins}m ago`,
    };
  }
  return {
    pill: "bg-red-50 text-red-700 border border-red-200",
    label: mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`,
  };
}

const SEVERITY_PILL: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border border-red-200",
  high: "bg-orange-50 text-orange-700 border border-orange-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-green-50 text-green-700 border border-green-200",
};

// ── Tile shell ─────────────────────────────────────────────────────────

function Tile({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-surface-200 bg-white p-5 flex flex-col gap-3 shadow-sm">
      <header className="flex items-center gap-2 text-ink-700">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
      </header>
      <div className="flex-1 text-sm text-ink-800">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-500 italic">{children}</p>;
}

// ── Sparkline SVG (no library) ─────────────────────────────────────────

function Sparkline({
  values,
  width = 180,
  height = 36,
  stroke = "#0ea5e9",
  fill = "rgba(14,165,233,0.12)",
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  if (values.length === 0) {
    return <div className="text-xs text-ink-500 italic">No data</div>;
  }
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className="block"
      role="img"
      aria-label="sparkline"
    >
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function Bars({
  values,
  labels,
  height = 44,
  color = "#8b5cf6",
}: {
  values: number[];
  labels: string[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1 h-[44px]" style={{ height }}>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * (height - 2));
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${labels[i]}: ${v}`}>
            <div
              className="w-full rounded-sm"
              style={{ height: `${h}px`, background: color, opacity: v === 0 ? 0.15 : 0.85 }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────

export function OpsDashboardClient({
  user,
  release,
  deployHealth,
  creditBurn,
  cronHealth,
  experiments,
  growth,
  posture,
}: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    router.refresh();
    // Clear the spinner shortly after — router.refresh() has no completion
    // signal to hook into and the request is server-side.
    window.setTimeout(() => setRefreshing(false), 1200);
  }, [router]);

  return (
    <AdminLayout user={user}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">Operational Dashboard</h1>
            <p className="text-sm text-ink-600 mt-1">
              Uptime, credit burn, deploys, cron health, active experiments, and platform load at a glance.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-100 disabled:opacity-50 cursor-pointer transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.75} />
            Refresh
          </button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Tile 1 — Uptime & Release */}
          <Tile title="Uptime & Release" icon={Activity}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink-500">BUILD_ID</dt>
              <dd className="font-mono truncate">{release.buildId ?? "—"}</dd>
              <dt className="text-ink-500">Git SHA</dt>
              <dd className="font-mono truncate">
                {release.gitSha ? release.gitSha.slice(0, 12) : "—"}
              </dd>
              <dt className="text-ink-500">Deployed</dt>
              <dd>{fmtDateTime(release.deployedAt)}</dd>
              <dt className="text-ink-500">PID</dt>
              <dd className="font-mono">{release.pid ?? "—"}</dd>
            </dl>
            <div className="mt-3 pt-3 border-t border-surface-200 flex items-center gap-4 text-xs text-ink-600">
              <span>
                <span className="font-semibold text-ink-800">{deployHealth.deploys}</span> deploys / 24h
              </span>
              <span>
                <span className="font-semibold text-red-700">{deployHealth.failures}</span> failed
              </span>
              <span>
                <span className="font-semibold text-green-700">{deployHealth.publicHttp200Count}</span> 200s
              </span>
            </div>
          </Tile>

          {/* Tile 2 — Credit burn (30d) */}
          <Tile title="Credit burn (30d)" icon={Coins}>
            {creditBurn.total === 0 ? (
              <Empty>No credit spend in the last 30 days.</Empty>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-ink-900">
                    {fmtCredits(creditBurn.total)}
                  </span>
                  <span className="text-xs text-ink-500">credits</span>
                </div>
                <div className="mt-2">
                  <Sparkline values={creditBurn.daily.map((d) => d.credits)} />
                </div>
                <ul className="mt-3 space-y-1 text-xs">
                  {creditBurn.byFeature.map((f) => (
                    <li key={f.feature} className="flex items-center justify-between gap-2">
                      <span className="truncate text-ink-700">{f.feature}</span>
                      <span className="tabular-nums text-ink-500">
                        {fmtCredits(f.credits)} · {fmtPct(f.pctOfTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Tile>

          {/* Tile 3 — Cron health (24h) */}
          <Tile title="Cron health (24h)" icon={Clock}>
            {cronHealth.length === 0 ? (
              <Empty>No cron activity in the last 24 hours.</Empty>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1 text-xs">
                {cronHealth.map((c) => {
                  const lag = lagColor(c.lagMinutes);
                  const status =
                    c.lastStatus === "ok"
                      ? "text-green-700"
                      : c.lastStatus === "fail"
                      ? "text-red-700"
                      : "text-ink-600";
                  return (
                    <li key={c.job} className="flex items-center justify-between gap-2">
                      <span className="truncate text-ink-800">{c.job}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className={`font-semibold ${status}`}>{c.lastStatus}</span>
                        <span className={`px-1.5 py-0.5 rounded ${lag.pill} tabular-nums`}>{lag.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tile>

          {/* Tile 4 — Active A/B experiments */}
          <Tile title="Active experiments" icon={FlaskConical}>
            {experiments.length === 0 ? (
              <Empty>No experiments currently running.</Empty>
            ) : (
              <ul className="space-y-3">
                {experiments.map((e) => (
                  <li key={e.id} className="border border-surface-200 rounded-lg p-2.5">
                    <div className="text-sm font-medium text-ink-900 truncate">{e.name}</div>
                    {e.hypothesis ? (
                      <div className="text-xs text-ink-500 mt-0.5 line-clamp-2">{e.hypothesis}</div>
                    ) : null}
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-ink-500">
                          <th className="text-left font-normal">variant</th>
                          <th className="text-right font-normal">impr</th>
                          <th className="text-right font-normal">conv</th>
                          <th className="text-right font-normal">rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.variants.map((v) => (
                          <tr key={v.key} className="border-t border-surface-100">
                            <td className="py-1 font-mono text-ink-800 truncate">{v.key}</td>
                            <td className="py-1 text-right tabular-nums text-ink-700">{v.impressions}</td>
                            <td className="py-1 text-right tabular-nums text-ink-700">{v.conversions}</td>
                            <td className="py-1 text-right tabular-nums text-ink-800 font-medium">
                              {v.impressions > 0 ? fmtPct(v.conversionRate) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </li>
                ))}
              </ul>
            )}
          </Tile>

          {/* Tile 5 — Fresh signups & analyses (7d) */}
          <Tile title="Signups & analyses (7d)" icon={UserPlus}>
            {growth.signupsDaily.length === 0 && growth.analysesDaily.length === 0 ? (
              <Empty>No growth data available.</Empty>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-ink-600 mb-1">
                    <span>New signups</span>
                    <span className="tabular-nums font-semibold text-ink-800">
                      {growth.signupsDaily.reduce((s, d) => s + d.count, 0)}
                    </span>
                  </div>
                  <Bars
                    values={growth.signupsDaily.map((d) => d.count)}
                    labels={growth.signupsDaily.map((d) => d.day)}
                    color="#2563eb"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-ink-600 mb-1">
                    <span>SVI analyses</span>
                    <span className="tabular-nums font-semibold text-ink-800">
                      {growth.analysesDaily.reduce((s, d) => s + d.count, 0)}
                    </span>
                  </div>
                  <Bars
                    values={growth.analysesDaily.map((d) => d.count)}
                    labels={growth.analysesDaily.map((d) => d.day)}
                    color="#059669"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-ink-400 font-mono">
                  {growth.signupsDaily.map((d) => (
                    <span key={d.day}>{d.day.slice(5)}</span>
                  ))}
                </div>
              </div>
            )}
          </Tile>

          {/* Tile 6 — Security posture */}
          <Tile title="Security posture" icon={ShieldAlert}>
            {!posture ? (
              <Empty>No security posture snapshot yet.</Empty>
            ) : (
              <>
                <div className="text-xs text-ink-600">
                  Last audit: <span className="text-ink-800">{fmtDate(posture.lastAuditAt)}</span>
                </div>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {posture.topIssues.length === 0 ? (
                    <li className="text-ink-500 italic">No issues flagged.</li>
                  ) : (
                    posture.topIssues.map((i, idx) => (
                      <li key={`${i.title}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="truncate text-ink-800">{i.title}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-semibold tracking-wide ${
                            SEVERITY_PILL[i.severity] ?? "bg-surface-100 text-ink-700"
                          }`}
                        >
                          {i.severity}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </Tile>
        </div>

        <footer className="text-xs text-ink-500">
          Data cached for 60 seconds. JSON mirror available at{" "}
          <code className="font-mono text-ink-700">/api/admin/ops</code>.
        </footer>
      </div>
    </AdminLayout>
  );
}
