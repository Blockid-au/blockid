"use client";

import * as React from "react";
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthIssue {
  severity: "red" | "amber" | "green";
  code: string;
  message: string;
  recommendation: string;
}

interface HealthResult {
  score: number;
  issues: HealthIssue[];
  recommendations: string[];
}

const SEVERITY_ICON = {
  red: <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />,
  amber: <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />,
  green: <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />,
};

export function CapTableHealthWidget() {
  const [expanded, setExpanded] = React.useState(false);
  const [founderPct, setFounderPct] = React.useState("");
  const [investorPct, setInvestorPct] = React.useState("");
  const [employeeOptionsPct, setEmployeeOptionsPct] = React.useState("");
  const [hasVestingCliff, setHasVestingCliff] = React.useState<"yes" | "no" | "">("");
  const [shareholderCount, setShareholderCount] = React.useState("");
  const [result, setResult] = React.useState<HealthResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cap-table/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          founderPct: parseFloat(founderPct) || 0,
          investorPct: parseFloat(investorPct) || 0,
          employeeOptionsPct: parseFloat(employeeOptionsPct) || 0,
          hasVestingCliff: hasVestingCliff === "yes" ? true : hasVestingCliff === "no" ? false : undefined,
          optionPoolPct: parseFloat(employeeOptionsPct) || 0,
          shareholderCount: shareholderCount ? parseInt(shareholderCount) : undefined,
        }),
      });
      const data = await res.json() as HealthResult;
      setResult(data);
    } catch {
      setError("Failed to check cap table health. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const scoreColor = result
    ? result.score >= 80 ? "text-emerald-600" : result.score >= 50 ? "text-amber-600" : "text-red-600"
    : "text-ink-400";

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <div className="text-left">
            <p className="text-sm font-semibold text-ink-800">Cap Table Health Check</p>
            <p className="text-xs text-ink-500">Diagnose dilution, vesting, option pool &amp; ASIC thresholds</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
      </button>

      {expanded && (
        <div className="border-t border-surface-100 px-5 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-600 mb-1 block">Founder %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={founderPct}
                onChange={(e) => setFounderPct(e.target.value)}
                placeholder="e.g. 65"
                className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-600 mb-1 block">Investor %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={investorPct}
                onChange={(e) => setInvestorPct(e.target.value)}
                placeholder="e.g. 20"
                className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-600 mb-1 block">Employee Options %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={employeeOptionsPct}
                onChange={(e) => setEmployeeOptionsPct(e.target.value)}
                placeholder="e.g. 15"
                className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-600 mb-1 block">Vesting Cliff in Place?</span>
              <select
                value={hasVestingCliff}
                onChange={(e) => setHasVestingCliff(e.target.value as "yes" | "no" | "")}
                className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">Not sure</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-600 mb-1 block">Total Shareholders</span>
              <input
                type="number"
                min="0"
                value={shareholderCount}
                onChange={(e) => setShareholderCount(e.target.value)}
                placeholder="e.g. 12"
                className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleCheck}
            disabled={loading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Checking…" : "Run Health Check"}
          </button>

          {result && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold tabular-nums">
                  <span className={scoreColor}>{result.score}</span>
                  <span className="text-lg text-ink-400">/100</span>
                </span>
                <span className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  result.score >= 80 ? "bg-emerald-50 text-emerald-700" : result.score >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                )}>
                  {result.score >= 80 ? "Healthy" : result.score >= 50 ? "Needs Attention" : "At Risk"}
                </span>
              </div>

              <div className="space-y-2">
                {result.issues.map((issue) => (
                  <div key={issue.code} className={cn(
                    "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
                    issue.severity === "red" ? "bg-red-50" : issue.severity === "amber" ? "bg-amber-50" : "bg-emerald-50"
                  )}>
                    {SEVERITY_ICON[issue.severity]}
                    <div>
                      <p className={cn("font-medium text-xs",
                        issue.severity === "red" ? "text-red-800" : issue.severity === "amber" ? "text-amber-800" : "text-emerald-800"
                      )}>{issue.message}</p>
                      {issue.severity !== "green" && (
                        <p className="text-[11px] text-ink-500 mt-0.5">{issue.recommendation}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
