"use client";

import * as React from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface CFOInput {
  mrr: number;
  burn_rate: number;
  cash_balance: number;
  team_size: number;
  stage: string;
}

interface CFOResult {
  health_score: number;
  commentary: string[];
  alerts: string[];
}

/* ─── Formatting helpers ─────────────────────────────────────────────────── */

function fmtAud(v: number): string {
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(1)}K`;
  return `A$${v.toLocaleString()}`;
}

/* ─── Financial Health Gauge ─────────────────────────────────────────────── */

function HealthGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  // SVG arc gauge: 180-degree semicircle
  const radius = 60;
  const cx = 80;
  const cy = 80;
  const startAngle = Math.PI; // left
  const endAngle = 0; // right
  const angle = Math.PI - (clamped / 100) * Math.PI;
  const x = cx + radius * Math.cos(angle);
  const y = cy + radius * Math.sin(angle);

  const trackPath = `M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`;
  const fillPath = `M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${x},${y}`;

  let color = "#10B981"; // green
  let label = "Healthy";
  if (clamped < 40) { color = "#EF4444"; label = "Critical"; }
  else if (clamped < 65) { color = "#F59E0B"; label = "At Risk"; }
  else if (clamped < 80) { color = "#3B82F6"; label = "Fair"; }

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="90" viewBox="0 0 160 90" className="overflow-visible">
        <path d={trackPath} fill="none" stroke="#E5E7EB" strokeWidth="14" strokeLinecap="round" />
        {clamped > 0 && (
          <path d={fillPath} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" className="font-bold" style={{ fontSize: 26, fill: color, fontWeight: 700 }}>
          {clamped}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11, fill: "#6B7280" }}>
          / 100
        </text>
      </svg>
      <span className="text-sm font-semibold mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

/* ─── Runway Bar ─────────────────────────────────────────────────────────── */

function RunwayBar({ months }: { months: number | null }) {
  if (months === null) return <span className="text-ink-400 text-sm">—</span>;
  const capped = Math.min(months, 24);
  const pct = (capped / 24) * 100;
  let color = "bg-emerald-500";
  let label = "Healthy";
  let textColor = "text-emerald-700";
  if (months < 6) { color = "bg-red-500"; label = "Critical"; textColor = "text-red-700"; }
  else if (months < 12) { color = "bg-amber-400"; label = "Caution"; textColor = "text-amber-700"; }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={cn("text-lg font-bold", textColor)}>
          {months === 99 ? "∞" : `${months.toFixed(1)} months`}
        </span>
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", {
          "bg-emerald-100 text-emerald-700": months >= 12,
          "bg-amber-100 text-amber-700": months >= 6 && months < 12,
          "bg-red-100 text-red-700": months < 6,
        })}>{label}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-ink-400">Bar shows up to 24 months. Green = &gt;12mo, Yellow = 6-12mo, Red = &lt;6mo</p>
    </div>
  );
}

/* ─── Widget wrapper ─────────────────────────────────────────────────────── */

function Widget({ title, icon: Icon, children, className }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white p-6", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-brand-500 shrink-0" />
        <h2 className="text-sm font-bold text-ink-800 uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/* ─── Number input ───────────────────────────────────────────────────────── */

function NumberInput({
  label,
  value,
  onChange,
  prefix = "A$",
  placeholder = "0",
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-ink-500">{label}</label>
      <div className="flex items-center rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
        {prefix && <span className="text-sm text-ink-400 mr-1 shrink-0">{prefix}</span>}
        <input
          type="number"
          min={0}
          step={100}
          value={value === 0 ? "" : value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm font-medium text-ink-800 outline-none min-w-0"
        />
      </div>
      {hint && <p className="text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}

/* ─── Stage options ──────────────────────────────────────────────────────── */

const STAGE_OPTIONS = [
  { value: "idea", label: "Idea" },
  { value: "validation", label: "Validation" },
  { value: "mvp", label: "MVP" },
  { value: "launch", label: "Launch" },
  { value: "growth", label: "Growth" },
  { value: "scale", label: "Scale" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B+" },
];

/* ─── Main component ─────────────────────────────────────────────────────── */

export function CFODashboardClient({
  userEmail: _userEmail,
  startupName,
}: {
  userEmail: string;
  startupName?: string;
}) {
  const [input, setInput] = React.useState<CFOInput>({
    mrr: 0,
    burn_rate: 0,
    cash_balance: 0,
    team_size: 1,
    stage: "idea",
  });

  const [result, setResult] = React.useState<CFOResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = React.useState(false);

  // Derived values
  const arr = input.mrr * 12;
  const runway_months =
    input.burn_rate > 0
      ? input.cash_balance / input.burn_rate
      : input.cash_balance > 0
        ? 99
        : null;

  // Local health score (instant preview)
  function localHealthScore(): number {
    let score = 100;
    const rm = runway_months ?? 0;
    if (rm < 3) score -= 40;
    else if (rm < 6) score -= 20;
    const mvpStages = ["mvp", "launch", "growth", "scale", "series_a", "series_b"];
    if (input.mrr === 0 && mvpStages.includes(input.stage)) score -= 15;
    if (input.burn_rate > 0 && input.burn_rate > input.mrr * 3) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  const displayScore = result?.health_score ?? localHealthScore();

  async function generateCommentary() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cfo-advisor/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, startup_name: startupName }),
      });
      const data = (await res.json()) as
        | { ok: true; health_score: number; commentary: string[]; alerts: string[] }
        | { ok: false; error: string };
      if (!data.ok) {
        setError(data.error);
      } else {
        setResult(data);
        setHasGenerated(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const alerts = result?.alerts ?? [];
  const commentary = result?.commentary ?? [];

  return (
    <div className="max-w-5xl mx-auto px-6 pb-24 pt-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">AI-Powered</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 tracking-tight">
          CFO Dashboard{startupName ? ` · ${startupName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Enter your financials below to get runway intelligence, health scoring, and AI CFO commentary.
        </p>
      </div>

      {/* Row 1: Health Score + Burn & Runway */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Health Score */}
        <Widget title="Financial Health Score" icon={BarChart3}>
          <div className="flex flex-col items-center py-2">
            <HealthGauge score={displayScore} />
            <p className="text-xs text-ink-400 mt-3 text-center max-w-[180px]">
              Score updates live as you enter your numbers. Click &ldquo;Generate AI Commentary&rdquo; for the full analysis.
            </p>
          </div>
        </Widget>

        {/* Burn Rate & Runway */}
        <Widget title="Burn Rate & Runway" icon={TrendingDown} className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <NumberInput
              label="Monthly Burn Rate"
              value={input.burn_rate}
              onChange={(v) => setInput((s) => ({ ...s, burn_rate: v }))}
              hint="Total monthly cash outflow"
            />
            <NumberInput
              label="Cash / Bank Balance"
              value={input.cash_balance}
              onChange={(v) => setInput((s) => ({ ...s, cash_balance: v }))}
              hint="Current cash in bank accounts"
            />
          </div>
          <RunwayBar months={runway_months} />
        </Widget>
      </div>

      {/* Row 2: MRR/ARR Tracker + Cash Flow Summary + Inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR / ARR Tracker */}
        <Widget title="MRR / ARR Tracker" icon={TrendingUp}>
          <div className="space-y-4">
            <NumberInput
              label="Monthly Recurring Revenue (MRR)"
              value={input.mrr}
              onChange={(v) => setInput((s) => ({ ...s, mrr: v }))}
              hint="Total recurring subscription revenue per month"
            />
            <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-ink-500 font-medium">ARR (Annualised)</p>
                <p className="text-xl font-bold text-ink-900 mt-0.5">{fmtAud(arr)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-500 font-medium">MRR</p>
                <p className="text-xl font-bold text-brand-600 mt-0.5">{fmtAud(input.mrr)}</p>
              </div>
            </div>
            {input.mrr === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                No revenue recorded. First revenue is a critical milestone.
              </p>
            )}
          </div>
        </Widget>

        {/* Cash Flow Summary */}
        <Widget title="Cash Flow Summary" icon={Wallet}>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-surface-100">
              <span className="text-sm text-ink-600">Monthly Revenue</span>
              <span className="text-sm font-semibold text-emerald-600">{fmtAud(input.mrr)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-surface-100">
              <span className="text-sm text-ink-600">Monthly Burn</span>
              <span className="text-sm font-semibold text-red-500">−{fmtAud(input.burn_rate)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-surface-100">
              <span className="text-sm text-ink-600">Net Monthly</span>
              <span className={cn("text-sm font-bold", input.mrr - input.burn_rate >= 0 ? "text-emerald-600" : "text-red-500")}>
                {input.mrr - input.burn_rate >= 0 ? "+" : "−"}{fmtAud(Math.abs(input.mrr - input.burn_rate))}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-ink-600">Cash Balance</span>
              <span className="text-sm font-semibold text-ink-800">{fmtAud(input.cash_balance)}</span>
            </div>
          </div>
        </Widget>
      </div>

      {/* Row 3: Additional Inputs + Generate Button */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Additional Details</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <NumberInput
            label="Team Size (headcount)"
            value={input.team_size}
            onChange={(v) => setInput((s) => ({ ...s, team_size: Math.max(1, v) }))}
            prefix=""
            placeholder="1"
            hint="Full-time equivalents including founders"
          />
          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink-500">Startup Stage</label>
            <select
              value={input.stage}
              onChange={(e) => setInput((s) => ({ ...s, stage: e.target.value }))}
              className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm font-medium text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            >
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={generateCommentary}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "Generating AI Commentary…" : "Generate AI Commentary"}
        </button>
      </div>

      {/* Alerts Section */}
      {(alerts.length > 0 || hasGenerated) && (
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Alerts</h2>
          </div>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              No critical alerts. Your financials look healthy based on the inputs.
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert, i) => (
                <li key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  {alert}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* AI CFO Commentary */}
      {(commentary.length > 0 || loading) && (
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 to-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-brand-500" />
            <h2 className="text-sm font-bold text-ink-800 uppercase tracking-wider">AI CFO Commentary</h2>
          </div>
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-ink-500 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              Analysing your financials with AI…
            </div>
          ) : (
            <ul className="space-y-3">
              {commentary.map((point, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-ink-700">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Empty state when nothing generated yet */}
      {!hasGenerated && !loading && commentary.length === 0 && (
        <div className="rounded-2xl border border-dashed border-surface-200 bg-white/50 p-8 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-brand-300 mb-3" />
          <p className="text-sm font-medium text-ink-600">AI CFO Commentary will appear here</p>
          <p className="text-xs text-ink-400 mt-1">
            Fill in your financials above and click &ldquo;Generate AI Commentary&rdquo; to get personalised CFO insights.
          </p>
        </div>
      )}
    </div>
  );
}
