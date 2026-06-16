"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp, Zap } from "lucide-react";

const STEP_LABELS: Record<string, string> = {
  landing_visit: "Landing Page Visit",
  signup_start: "Signup Started",
  signup_complete: "Signup Complete",
  onboarding_start: "Onboarding Started",
  idea_submitted: "Idea Submitted",
  svi_complete: "SVI Analysis Complete",
  valuation_viewed: "Valuation Viewed",
  upgrade_prompt_seen: "Upgrade Prompt Seen",
  checkout_started: "Checkout Started",
  payment_complete: "Payment Complete",
};

type DayRange = 7 | 30 | 90 | 9999;

interface StepData {
  step: string;
  count: number;
}

function barColor(retention: number): string {
  if (retention >= 50) return "bg-green-500";
  if (retention >= 20) return "bg-yellow-500";
  return "bg-red-500";
}

export default function FunnelPage() {
  const [range, setRange] = React.useState<DayRange>(30);
  const [steps, setSteps] = React.useState<StepData[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [isMock, setIsMock] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/funnel?days=${range}`)
      .then((r) => r.json())
      .then((d) => {
        setSteps(d.steps ?? []);
        setIsMock(d.mock ?? false);
      })
      .catch(() => setSteps([]))
      .finally(() => setLoading(false));
  }, [range]);

  const maxCount = steps.length > 0 ? Math.max(...steps.map((s) => s.count)) : 1;
  const topCount = steps[0]?.count ?? 1;
  const lastCount = steps[steps.length - 1]?.count ?? 0;
  const endToEnd = topCount > 0 ? ((lastCount / topCount) * 100).toFixed(2) : "0.00";

  // Biggest drop-off
  let biggestDropStep = "";
  let biggestDropPct = 0;
  let bestRetentionStep = "";
  let bestRetentionPct = 0;

  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].count;
    const curr = steps[i].count;
    const dropPct = prev > 0 ? ((prev - curr) / prev) * 100 : 0;
    const retPct = prev > 0 ? (curr / prev) * 100 : 0;
    if (dropPct > biggestDropPct) {
      biggestDropPct = dropPct;
      biggestDropStep = STEP_LABELS[steps[i].step] ?? steps[i].step;
    }
    if (retPct > bestRetentionPct) {
      bestRetentionPct = retPct;
      bestRetentionStep = STEP_LABELS[steps[i].step] ?? steps[i].step;
    }
  }

  const RANGES: { label: string; value: DayRange }[] = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
    { label: "All", value: 9999 },
  ];

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center gap-4 max-w-5xl mx-auto">
        <Link href="/admin" className="text-ink-700 hover:text-ink-800 transition-colors">
          <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
        </Link>
        <span className="font-semibold text-ink-800">Funnel Analytics</span>
        <span className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">ADMIN</span>
        {isMock && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">MOCK DATA</span>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Title + range selector */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-ink-800">Funnel Analytics</h1>
          <p className="text-sm text-ink-500">Conversion drop-off across assessment steps</p>
        </div>

        <div className="flex items-center gap-2">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={[
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                range === value
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-surface-200 text-ink-600 hover:bg-surface-50",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-ink-500">Loading funnel data…</p>}

        {!loading && steps.length > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-ink-500 flex items-center gap-1"><TrendingDown className="h-3 w-3 text-red-500" /> Biggest Drop-off</span>
                <span className="text-sm font-semibold text-red-700 mt-1">{biggestDropStep || "—"}</span>
                {biggestDropPct > 0 && <span className="text-xs text-red-500">−{biggestDropPct.toFixed(1)}% lost</span>}
              </div>
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-ink-500 flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-500" /> Best Step Retention</span>
                <span className="text-sm font-semibold text-green-700 mt-1">{bestRetentionStep || "—"}</span>
                {bestRetentionPct > 0 && <span className="text-xs text-green-500">{bestRetentionPct.toFixed(1)}% retained</span>}
              </div>
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-ink-500 flex items-center gap-1"><Zap className="h-3 w-3 text-brand-500" /> End-to-End Conversion</span>
                <span className="text-3xl font-bold text-brand-700 mt-1">{endToEnd}%</span>
                <span className="text-xs text-ink-400">Landing → Payment</span>
              </div>
            </div>

            {/* Funnel visualization */}
            <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-100">
                <h2 className="text-sm font-semibold text-ink-700">Funnel Visualization</h2>
              </div>
              <div className="p-5 flex flex-col gap-1">
                {steps.map((s, i) => {
                  const prevCount = i > 0 ? steps[i - 1].count : s.count;
                  const retention = prevCount > 0 ? (s.count / prevCount) * 100 : 100;
                  const pctOfTop = topCount > 0 ? (s.count / topCount) * 100 : 0;
                  const barW = maxCount > 0 ? (s.count / maxCount) * 100 : 0;
                  const dropped = prevCount - s.count;
                  const dropPct = prevCount > 0 ? ((dropped / prevCount) * 100).toFixed(1) : "0.0";

                  return (
                    <React.Fragment key={s.step}>
                      {/* Drop-off arrow between steps */}
                      {i > 0 && dropped > 0 && (
                        <div className="flex items-center gap-2 py-1 px-1">
                          <span className="text-red-400 text-lg leading-none">↓</span>
                          <span className="text-xs text-red-500 font-medium">
                            lost {dropped.toLocaleString()} ({dropPct}%)
                          </span>
                        </div>
                      )}
                      {i > 0 && dropped === 0 && (
                        <div className="h-2" />
                      )}

                      {/* Step bar */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs text-ink-600 mb-0.5">
                          <span className="font-medium">{STEP_LABELS[s.step] ?? s.step}</span>
                          <span className="text-ink-400">
                            {s.count.toLocaleString()} &nbsp;·&nbsp; {pctOfTop.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-surface-100 rounded-full h-8 relative overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor(i === 0 ? 100 : retention)}`}
                            style={{ width: `${barW}%` }}
                          />
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-100">
                <h2 className="text-sm font-semibold text-ink-700">Step-by-Step Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs text-ink-500 font-medium">Step</th>
                      <th className="text-right px-4 py-3 text-xs text-ink-500 font-medium">Count</th>
                      <th className="text-right px-4 py-3 text-xs text-ink-500 font-medium">% of Top</th>
                      <th className="text-right px-4 py-3 text-xs text-ink-500 font-medium">Drop from Prev</th>
                      <th className="text-right px-4 py-3 text-xs text-ink-500 font-medium">Drop %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((s, i) => {
                      const prevCount = i > 0 ? steps[i - 1].count : s.count;
                      const dropped = i > 0 ? prevCount - s.count : 0;
                      const dropPct = i > 0 && prevCount > 0 ? ((dropped / prevCount) * 100).toFixed(1) : "—";
                      const pctOfTop = topCount > 0 ? (s.count / topCount) * 100 : 0;

                      return (
                        <tr key={s.step} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                          <td className="px-5 py-3 text-ink-700 font-medium text-xs">{STEP_LABELS[s.step] ?? s.step}</td>
                          <td className="px-4 py-3 text-right text-ink-700">{s.count.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-ink-500">{pctOfTop.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right text-red-500">{dropped > 0 ? `−${dropped.toLocaleString()}` : "—"}</td>
                          <td className="px-4 py-3 text-right">
                            {dropPct !== "—"
                              ? <span className={`text-xs font-medium ${parseFloat(dropPct) > 50 ? "text-red-600" : parseFloat(dropPct) > 20 ? "text-yellow-600" : "text-green-600"}`}>
                                  {dropPct}%
                                </span>
                              : <span className="text-ink-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!loading && steps.length === 0 && (
          <div className="rounded-2xl border border-surface-200 bg-white shadow-sm px-6 py-12 text-center">
            <p className="text-sm text-ink-400">No funnel data available for this range.</p>
          </div>
        )}
      </main>
    </div>
  );
}
