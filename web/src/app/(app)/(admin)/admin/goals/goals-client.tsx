"use client";

import React, { useEffect, useState } from "react";
import {
  Target,
  Users,
  BarChart3,
  TrendingUp,
  Shield,
  Code,
  DollarSign,
  Megaphone,
  UserCheck,
  Scale,
  Eye,
  Lock,
  Database,
  Settings,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  Activity,
  Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface KPI {
  metric: string;
  label: string;
  target: number;
  unit: string;
}

interface AgentStatus {
  agent: string;
  title: string;
  mission: string;
  kpis: KPI[];
  criteriaOwned: string[];
  reportSections: string[];
  researchFrequency: string;
  researchTopics: string[];
  status: "GREEN" | "YELLOW" | "RED" | "NO_REPORT";
  lastReport: string | null;
  lastReportDate: string | null;
  researchCount: number;
  lastResearchDate: string | null;
}

interface GoalsData {
  ceo: { title: string; mission: string; kpis: KPI[] };
  platformKPIs: { totalUsers: number; totalAnalyses: number; totalAccounts: number };
  agents: AgentStatus[];
  recentCronRuns: Array<{ ts: string; endpoint: string; status: string; duration_ms: number }>;
  today: string;
}

// ── Agent Icons ────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  cto: Code,
  cfo: DollarSign,
  cpo: Layers,
  cmo: Megaphone,
  cro: TrendingUp,
  clo: Scale,
  chro: UserCheck,
  ciso: Lock,
  cdo: Database,
  coo: Settings,
};

const STATUS_COLORS: Record<string, string> = {
  GREEN: "bg-emerald-100 text-emerald-700 border-emerald-300",
  YELLOW: "bg-amber-100 text-amber-700 border-amber-300",
  RED: "bg-red-100 text-red-700 border-red-300",
  NO_REPORT: "bg-gray-100 text-gray-500 border-gray-300",
};

const STATUS_DOT: Record<string, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-500",
  RED: "bg-red-500",
  NO_REPORT: "bg-gray-400",
};

// ── Components ─────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, icon: Icon }: { label: string; value: number | string; unit?: string; icon: React.ElementType }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-brand-50 p-2">
          <Icon className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-xl font-bold text-gray-900">
            {typeof value === "number" ? value.toLocaleString() : value}
            {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent, expanded, onToggle }: { agent: AgentStatus; expanded: boolean; onToggle: () => void }) {
  const Icon = AGENT_ICONS[agent.agent.toLowerCase()] ?? Shield;
  const statusClass = STATUS_COLORS[agent.status] ?? STATUS_COLORS.NO_REPORT;
  const dotClass = STATUS_DOT[agent.status] ?? STATUS_DOT.NO_REPORT;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-brand-50 p-2 shrink-0">
            <Icon className="h-5 w-5 text-brand-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
              <h3 className="font-semibold text-gray-900 text-sm">{agent.agent.toUpperCase()}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusClass}`}>
                {agent.status === "NO_REPORT" ? "No Report" : agent.status}
              </span>
            </div>
            <p className="text-xs text-gray-600 truncate">{agent.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-400">Research</p>
            <p className="text-xs font-medium text-gray-700">{agent.researchCount} entries</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          <p className="text-sm text-gray-600">{agent.mission}</p>

          {/* KPIs */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">KPIs</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {agent.kpis.map((kpi) => (
                <div key={kpi.metric} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">{kpi.label}</p>
                  <p className="text-sm font-semibold text-gray-800">
                    Target: {kpi.target.toLocaleString()} {kpi.unit}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Criteria & Sections */}
          <div className="flex gap-4 flex-wrap">
            {agent.criteriaOwned.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Criteria Owned</h4>
                <div className="flex flex-wrap gap-1">
                  {agent.criteriaOwned.map((c) => (
                    <span key={c} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{c}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Report Sections</h4>
              <div className="flex flex-wrap gap-1">
                {agent.reportSections.map((s) => (
                  <span key={s} className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Research */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Research ({agent.researchFrequency})
            </h4>
            <div className="flex flex-wrap gap-1">
              {agent.researchTopics.map((t) => (
                <span key={t} className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{t}</span>
              ))}
            </div>
            {agent.lastResearchDate && (
              <p className="text-[10px] text-gray-400 mt-1">Last research: {agent.lastResearchDate}</p>
            )}
          </div>

          {/* Today's Report */}
          {agent.lastReport && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Today&apos;s Report ({agent.lastReportDate})
              </h4>
              <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto font-mono">
                {agent.lastReport}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────

export function GoalsClient() {
  const [data, setData] = useState<GoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/goals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleAgent = (agent: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      next.has(agent) ? next.delete(agent) : next.add(agent);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-brand-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading CEO Goals...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-2">Error: {error}</p>
          <button onClick={fetchData} className="text-brand-600 text-sm hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const greenCount = data.agents.filter((a) => a.status === "GREEN").length;
  const yellowCount = data.agents.filter((a) => a.status === "YELLOW").length;
  const redCount = data.agents.filter((a) => a.status === "RED").length;
  const noReportCount = data.agents.filter((a) => a.status === "NO_REPORT").length;

  return (
    <div className="min-h-svh bg-surface-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* CEO Header */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-6 w-6" />
                <h1 className="text-2xl font-bold">CEO Goal Tree</h1>
              </div>
              <h2 className="text-lg font-medium opacity-90 mb-1">{data.ceo.title}</h2>
              <p className="text-sm opacity-75 max-w-2xl">{data.ceo.mission}</p>
            </div>
            <button
              onClick={fetchData}
              className="bg-white/20 hover:bg-white/30 rounded-lg p-2 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* CEO KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {data.ceo.kpis.map((kpi) => {
            let currentValue: number | string = "—";
            if (kpi.metric === "total_users") currentValue = data.platformKPIs.totalUsers;
            else if (kpi.metric === "mrr_aud") currentValue = "—";
            else if (kpi.metric === "report_quality_avg") currentValue = "—";
            else if (kpi.metric === "nps") currentValue = "—";

            return (
              <div key={kpi.metric} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">
                    {typeof currentValue === "number" ? currentValue.toLocaleString() : currentValue}
                  </span>
                  <span className="text-xs text-gray-400">
                    / {kpi.target.toLocaleString()} {kpi.unit}
                  </span>
                </div>
                {typeof currentValue === "number" && (
                  <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-brand-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (currentValue / kpi.target) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Platform Stats */}
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Total Users" value={data.platformKPIs.totalUsers} icon={Users} />
          <MetricCard label="SVI Analyses" value={data.platformKPIs.totalAnalyses} icon={BarChart3} />
          <MetricCard label="Active Accounts" value={data.platformKPIs.totalAccounts} icon={Activity} />
        </div>

        {/* Agent Status Summary */}
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900">C-Level Agents</h2>
          <div className="flex gap-2 text-xs">
            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">{greenCount} Green</span>
            <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">{yellowCount} Yellow</span>
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">{redCount} Red</span>
            <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">{noReportCount} No Report</span>
          </div>
        </div>

        {/* Agent Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.agents.map((agent) => (
            <AgentCard
              key={agent.agent}
              agent={agent}
              expanded={expandedAgents.has(agent.agent)}
              onToggle={() => toggleAgent(agent.agent)}
            />
          ))}
        </div>

        {/* Recent Cron Activity */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            Recent Cron Activity
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-1 px-2 text-gray-500 font-medium">Time (UTC)</th>
                  <th className="text-left py-1 px-2 text-gray-500 font-medium">Endpoint</th>
                  <th className="text-left py-1 px-2 text-gray-500 font-medium">Status</th>
                  <th className="text-right py-1 px-2 text-gray-500 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCronRuns.slice(0, 20).map((run, i) => (
                  <tr key={`${run.ts}-${i}`} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 px-2 text-gray-600 font-mono">{run.ts.slice(11, 19)}</td>
                    <td className="py-1 px-2 text-gray-800 font-medium">{run.endpoint}</td>
                    <td className="py-1 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        run.status === "ok" ? "bg-emerald-50 text-emerald-700" :
                        run.status === "rate_limited" ? "bg-amber-50 text-amber-700" :
                        "bg-red-50 text-red-700"
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-right text-gray-500 font-mono">{run.duration_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          CEO Goal Tree — {data.today} — {data.agents.length} agents active
        </p>
      </div>
    </div>
  );
}
