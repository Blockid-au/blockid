"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3, TrendingUp, DollarSign, Zap, PieChart, Target,
  ChevronDown, ArrowRight, Info, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { VcValuationReport } from "@/lib/agents/cfo-valuation";

/* ─── Formatting ──────────────────────────────────────────────────────────── */
function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${v.toFixed(0)}`;
}
function fmtPct(v: number): string { return `${v.toFixed(1)}%`; }
function fmtX(v: number): string { return `${v.toFixed(1)}x`; }

/* ─── CSV Export ──────────────────────────────────────────────────────────── */
function exportCsv(report: VcValuationReport) {
  const rows: string[][] = [];
  const row = (...cols: (string | number)[]) => rows.push(cols.map(String));

  row("BlockID.au — VC Valuation Report");
  row("Generated", new Date().toISOString().slice(0, 10));
  row("Stage", report.stage, "Sector", report.sector, "Currency", report.currency);
  row("");

  row("BLENDED VALUATION");
  row("Bear", report.blended.lowAud, "Base", report.blended.midAud, "Bull", report.blended.highAud);
  row("Confidence %", report.blended.confidence);
  row("");

  row("MARKET SIZING");
  row("TAM (AUD)", report.market.tamAud);
  row("SAM (AUD)", report.market.samAud);
  row("SOM (AUD)", report.market.somAud);
  row("CAGR %", report.market.cagrPct);
  row("");

  row("VALUATION METHODS");
  row("Method", "Low AUD", "Mid AUD", "High AUD", "Weight %", "Rationale");
  for (const m of report.methods) {
    row(m.method, m.lowAud, m.midAud, m.highAud, (m.weight * 100).toFixed(1), m.rationale);
  }
  row("");

  row("36-MONTH PROJECTIONS");
  row("Month", "MRR (AUD)", "Revenue (AUD)", "COGS (AUD)", "OPEX (AUD)", "EBITDA (AUD)", "Cash Balance (AUD)");
  for (const p of report.projection) {
    row(p.month, p.mrrAud, p.revenueAud, p.cogsAud, p.opexAud, p.ebitdaAud, p.cashBalanceAud);
  }
  row("");

  row("UNIT ECONOMICS");
  const u = report.unitEconomics;
  row("CAC (AUD)", u.cacAud, "LTV (AUD)", u.ltvAud, "LTV:CAC", u.ltvCacRatio.toFixed(2));
  row("Gross Margin %", u.grossMarginPct, "Rule of 40", u.ruleOf40, "CAC Payback (mo)", u.cacPaybackMonths ?? "N/A");
  row("Verdict", u.verdict);
  row("");

  row("RAISE PLAN");
  const inj = report.injection;
  row("Raise (AUD)", inj.raiseAud, "Pre-money (AUD)", inj.preMoneyAud, "Post-money (AUD)", inj.postMoneyAud);
  row("Dilution %", inj.dilutionPct, "Runway Extension (mo)", inj.runwayExtensionMonths);
  row("Next Milestone", inj.nextMilestone);
  row("Use of Funds (Category)", "% Allocation", "AUD Amount");
  for (const f of inj.useOfFunds) {
    row(f.category, f.pct, f.aud);
  }

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blockid-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Tabs ────────────────────────────────────────────────────────────────── */
const TABS = [
  { key: "summary", label: "Summary", icon: BarChart3 },
  { key: "market", label: "Market", icon: Target },
  { key: "methods", label: "Methods", icon: PieChart },
  { key: "projections", label: "Projections", icon: TrendingUp },
  { key: "unit-economics", label: "Unit Economics", icon: Zap },
  { key: "injection", label: "Raise Plan", icon: DollarSign },
] as const;

type Tab = (typeof TABS)[number]["key"];

/* ─── Component ───────────────────────────────────────────────────────────── */
export function VcValuationDashboard() {
  const [tab, setTab] = React.useState<Tab>("summary");
  const [report, setReport] = React.useState<VcValuationReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [svi, setSvi] = React.useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);

  const handlePdfExport = React.useCallback(async () => {
    if (!report || pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/valuation/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blockid-valuation-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    } finally {
      setPdfLoading(false);
    }
  }, [report, pdfLoading]);

  React.useEffect(() => {
    fetch("/api/valuation/vc")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setReport(d.report);
          setSvi(d.svi ?? null);
        } else {
          setError(d.error ?? "Could not load valuation");
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-surface-100 rounded-xl w-full" />
        <div className="h-48 bg-surface-100 rounded-2xl" />
        <div className="h-32 bg-surface-100 rounded-2xl" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-sm text-amber-800 mb-4">
          {error === "No SVI account found. Complete an SVI analysis first."
            ? "Complete your SVI analysis first to unlock the VC-grade valuation report."
            : (error ?? "Valuation unavailable")}
        </p>
        <Link
          href="/score"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Get your SVI Score <ArrowRight strokeWidth={2} className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Blended valuation hero */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-ink-900 text-white p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-300 font-semibold">
              VC-Grade Valuation · {report.stage} · {report.sector}
            </p>
            <p className="mt-2 text-4xl md:text-5xl font-bold tabular-nums">
              {fmtAud(report.blended.midAud)}
            </p>
            <p className="mt-1 text-sm text-brand-200">
              {fmtAud(report.blended.lowAud)} – {fmtAud(report.blended.highAud)} range
            </p>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div>
              <p className="text-xs text-brand-300">Confidence</p>
              <p className="text-3xl font-bold tabular-nums">{report.blended.confidence}%</p>
              {svi && <p className="text-xs text-brand-300 mt-0.5">SVI {svi}</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => exportCsv(report)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors"
              >
                <Download strokeWidth={1.75} className="h-3 w-3" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void handlePdfExport()}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-60"
              >
                <Download strokeWidth={1.75} className="h-3 w-3" />
                {pdfLoading ? "Generating..." : "Export PDF"}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Bear Case", value: fmtAud(report.scenarios.bear), color: "bg-red-500/20" },
            { label: "Base Case", value: fmtAud(report.scenarios.base), color: "bg-white/10" },
            { label: "Bull Case", value: fmtAud(report.scenarios.bull), color: "bg-emerald-500/20" },
          ].map((s) => (
            <div key={s.label} className={cn("rounded-xl p-3 text-center", s.color)}>
              <p className="text-xs text-brand-200">{s.label}</p>
              <p className="text-base font-bold tabular-nums mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-surface-200 bg-surface-50 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                tab === t.key
                  ? "bg-white shadow-sm text-ink-800"
                  : "text-ink-500 hover:text-ink-700"
              )}
            >
              <Icon strokeWidth={1.75} className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {tab === "summary" && <SummaryTab report={report} />}
      {tab === "market" && <MarketTab report={report} />}
      {tab === "methods" && <MethodsTab report={report} />}
      {tab === "projections" && <ProjectionsTab report={report} />}
      {tab === "unit-economics" && <UnitEconomicsTab report={report} />}
      {tab === "injection" && <InjectionTab report={report} />}

      {/* Sources */}
      <details className="rounded-xl border border-surface-200 bg-surface-50 p-4">
        <summary className="flex items-center gap-2 text-xs font-semibold text-ink-600 cursor-pointer list-none">
          <Info strokeWidth={1.75} className="h-3.5 w-3.5" />
          Data Sources & Methodology
          <ChevronDown strokeWidth={1.75} className="h-3.5 w-3.5 ml-auto" />
        </summary>
        <ul className="mt-3 space-y-0.5">
          {[...new Set([...report.sources])].map((s, i) => (
            <li key={i} className="text-[11px] text-ink-500">• {s}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/* ─── Summary Tab ──────────────────────────────────────────────────────────── */
function SummaryTab({ report }: { report: VcValuationReport }) {
  const top = report.methods.reduce((a, b) => (a.weight > b.weight ? a : b), report.methods[0]);
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "Pre-money (mid)", value: fmtAud(report.blended.midAud), sub: "blended 4-method" },
          { label: "TAM", value: fmtAud(report.market.tamAud), sub: "total addressable" },
          { label: "SAM", value: fmtAud(report.market.samAud), sub: "serviceable" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-surface-200 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{c.label}</p>
            <p className="text-2xl font-bold text-ink-800 mt-1 tabular-nums">{c.value}</p>
            <p className="text-xs text-ink-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-surface-200 bg-white p-5">
        <p className="text-sm font-semibold text-ink-800 mb-2">
          Strongest method: {top.method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </p>
        <p className="text-sm text-ink-500 leading-relaxed">{top.rationale}</p>
      </div>
      {report.notes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">Notes</p>
          <ul className="space-y-1">
            {report.notes.map((n, i) => <li key={i} className="text-xs text-amber-700">• {n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Market Tab ───────────────────────────────────────────────────────────── */
function MarketTab({ report }: { report: VcValuationReport }) {
  const m = report.market;
  const bars = [
    { label: "TAM", value: m.tamAud, color: "bg-brand-600" },
    { label: "SAM", value: m.samAud, color: "bg-brand-400" },
    { label: "SOM", value: m.somAud, color: "bg-emerald-500" },
  ];
  const max = m.tamAud;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <p className="text-sm font-semibold text-ink-700 mb-4">{m.methodology}</p>
        <div className="space-y-4">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-ink-700">{b.label}</span>
                <span className="text-sm font-bold tabular-nums text-ink-800">{fmtAud(b.value)}</span>
              </div>
              <div className="h-3 rounded-full bg-surface-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full", b.color)}
                  style={{ width: `${Math.min(100, (b.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-50 px-4 py-2.5">
          <span className="text-xs text-ink-500">Market CAGR</span>
          <span className="text-sm font-bold text-emerald-600">{fmtPct(m.cagrPct)}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Methods Tab ──────────────────────────────────────────────────────────── */
function MethodsTab({ report }: { report: VcValuationReport }) {
  return (
    <div className="space-y-3">
      {report.methods.map((m) => (
        <div key={m.method} className="rounded-xl border border-surface-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-800">
                {m.method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
              <p className="text-xs text-ink-400 mt-0.5">Weight: {fmtPct(m.weight * 100)}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-brand-600 tabular-nums">{fmtAud(m.midAud)}</p>
              <p className="text-[10px] text-ink-400">
                {fmtAud(m.lowAud)} – {fmtAud(m.highAud)}
              </p>
            </div>
          </div>
          {/* Weight bar */}
          <div className="mt-3 h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.round(m.weight * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-500 leading-relaxed">{m.rationale}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Projections Tab ──────────────────────────────────────────────────────── */
function ProjectionsTab({ report }: { report: VcValuationReport }) {
  const rows = report.projection.filter((_, i) => i % 3 === 0 || i === report.projection.length - 1);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-surface-200">
        <table className="w-full text-xs">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              {["Month", "MRR", "Revenue", "EBITDA", "OPEX", "Cash Balance"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-ink-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-surface-100 hover:bg-surface-50">
                <td className="px-3 py-2 font-semibold text-ink-700">M{r.month}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-700">{fmtAud(r.mrrAud)}</td>
                <td className="px-3 py-2 tabular-nums text-ink-700">{fmtAud(r.revenueAud)}</td>
                <td className={cn("px-3 py-2 tabular-nums", r.ebitdaAud >= 0 ? "text-emerald-600" : "text-red-500")}>
                  {r.ebitdaAud >= 0 ? "" : "("}{fmtAud(Math.abs(r.ebitdaAud))}{r.ebitdaAud < 0 ? ")" : ""}
                </td>
                <td className="px-3 py-2 tabular-nums text-red-500">({fmtAud(r.opexAud)})</td>
                <td className={cn(
                  "px-3 py-2 tabular-nums font-semibold",
                  r.cashBalanceAud >= 0 ? "text-ink-700" : "text-red-600"
                )}>
                  {fmtAud(Math.abs(r.cashBalanceAud))}{r.cashBalanceAud < 0 ? " (neg)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-surface-200 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-1">Break-even</p>
          {report.breakEven.month ? (
            <>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">Month {report.breakEven.month}</p>
              <p className="text-xs text-ink-500 mt-0.5">MRR at break-even: {fmtAud(report.breakEven.mrrAtBreakEvenAud ?? 0)}</p>
            </>
          ) : (
            <p className="text-sm text-ink-500">Not reached in 36-month projection</p>
          )}
        </div>
        <div className="rounded-xl border border-surface-200 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-1">Payback Period</p>
          {report.payback.months ? (
            <>
              <p className="text-2xl font-bold text-brand-600 tabular-nums">{report.payback.months} months</p>
              <p className="text-xs text-ink-500 mt-0.5">ROI: {fmtPct(report.payback.roiPct)}</p>
            </>
          ) : (
            <p className="text-sm text-ink-500">No raise modelled yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Unit Economics Tab ───────────────────────────────────────────────────── */
function UnitEconomicsTab({ report }: { report: VcValuationReport }) {
  const u = report.unitEconomics;
  const VERDICT_COLOR = {
    strong: "text-emerald-600 bg-emerald-50 border-emerald-200",
    healthy: "text-blue-600 bg-blue-50 border-blue-200",
    watch: "text-amber-600 bg-amber-50 border-amber-200",
    weak: "text-red-600 bg-red-50 border-red-200",
  }[u.verdict];
  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border px-5 py-3 flex items-center justify-between", VERDICT_COLOR)}>
        <span className="text-sm font-semibold">Unit Economics</span>
        <span className="text-sm font-bold capitalize">{u.verdict}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { label: "CAC", value: fmtAud(u.cacAud), sub: "customer acquisition cost" },
          { label: "LTV", value: fmtAud(u.ltvAud), sub: "lifetime value" },
          { label: "LTV:CAC", value: fmtX(u.ltvCacRatio), sub: u.ltvCacRatio >= 3 ? "✓ ≥3x target" : "below 3x target" },
          { label: "Gross Margin", value: fmtPct(u.grossMarginPct), sub: u.grossMarginPct >= 60 ? "✓ healthy" : "improve margin" },
          { label: "Rule of 40", value: u.ruleOf40.toFixed(0), sub: u.ruleOf40 >= 40 ? "✓ passes" : "below target" },
          {
            label: "CAC Payback",
            value: u.cacPaybackMonths ? `${u.cacPaybackMonths}mo` : "N/A",
            sub: "months to recover CAC",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-surface-200 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{c.label}</p>
            <p className="text-2xl font-bold text-ink-800 mt-1 tabular-nums">{c.value}</p>
            <p className="text-xs text-ink-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Injection / Raise Plan Tab ───────────────────────────────────────────── */
function InjectionTab({ report }: { report: VcValuationReport }) {
  const inj = report.injection;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <p className="text-sm font-semibold text-ink-800 mb-4">Recommended Raise</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: "Raise Amount", value: fmtAud(inj.raiseAud) },
            { label: "Pre-money", value: fmtAud(inj.preMoneyAud) },
            { label: "Post-money", value: fmtAud(inj.postMoneyAud) },
            { label: "Founder Dilution", value: fmtPct(inj.dilutionPct) },
            { label: "Runway Extension", value: `${inj.runwayExtensionMonths}mo` },
          ].map((c) => (
            <div key={c.label} className="flex items-center justify-between rounded-lg bg-surface-50 px-4 py-2.5">
              <span className="text-xs text-ink-500">{c.label}</span>
              <span className="text-sm font-bold text-ink-800 tabular-nums">{c.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <p className="text-sm font-semibold text-ink-800 mb-3">Use of Funds</p>
        <div className="space-y-2">
          {inj.useOfFunds.map((f) => (
            <div key={f.category} className="flex items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-surface-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${f.pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-ink-700 w-24 shrink-0">{f.category}</span>
              <span className="text-xs tabular-nums text-ink-500 w-12 text-right shrink-0">{fmtPct(f.pct)}</span>
              <span className="text-xs tabular-nums text-ink-600 w-16 text-right shrink-0">{fmtAud(f.aud)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-surface-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Next Milestone</p>
        <p className="text-sm text-ink-600">{inj.nextMilestone}</p>
      </div>
    </div>
  );
}
