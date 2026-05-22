"use client";

import * as React from "react";
import { X, Zap, Search, Microscope, Loader2, CheckCircle2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIThinkingStatus, useAIThinking, EVIDENCE_ANALYSIS_STEPS } from "@/components/ui/ai-thinking-status";

interface AnalysisResult {
  ok: boolean;
  tier?: string;
  analysis?: Record<string, unknown>;
  sviBoost?: number;
  balance?: number;
  creditsUsed?: number;
  error?: string;
}

interface AnalyzeTierModalProps {
  evidenceId: string;
  evidenceLabel: string;
  onClose: () => void;
  onAnalyzed?: (result: AnalysisResult) => void;
}

const TIERS = [
  {
    id: "scan" as const,
    label: "Quick Scan",
    cost: 0.10,
    icon: Zap,
    time: "~5 seconds",
    color: "border-emerald-200 bg-emerald-50",
    iconColor: "text-emerald-600",
    desc: "Validate evidence authenticity, basic relevance scoring",
    features: ["Authenticity check", "Relevance score", "Flag issues"],
  },
  {
    id: "standard" as const,
    label: "Standard Analysis",
    cost: 0.50,
    icon: Search,
    time: "~15 seconds",
    color: "border-brand-200 bg-brand-50",
    iconColor: "text-brand-600",
    desc: "Extract signals, map to SVI dimensions, identify gaps",
    features: ["Signal extraction", "Dimension mapping", "Gap analysis", "Recommendations"],
    popular: true,
  },
  {
    id: "deep_dive" as const,
    label: "Deep Dive",
    cost: 1.50,
    icon: Microscope,
    time: "~30 seconds",
    color: "border-amber-200 bg-amber-50",
    iconColor: "text-amber-600",
    desc: "Comprehensive analysis with benchmarking and roadmap",
    features: ["Full narrative", "Benchmarking", "Investor perspective", "Action roadmap"],
  },
];

export function AnalyzeTierModal({ evidenceId, evidenceLabel, onClose, onAnalyzed }: AnalyzeTierModalProps) {
  const [balance, setBalance] = React.useState<number | null>(null);
  const [analyzing, setAnalyzing] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AnalysisResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const thinking = useAIThinking(EVIDENCE_ANALYSIS_STEPS);

  // Fetch credit balance
  React.useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setBalance(d.balance ?? 0); })
      .catch(() => {});
  }, []);

  const handleAnalyze = async (tier: "scan" | "standard" | "deep_dive") => {
    setAnalyzing(tier);
    setError(null);
    thinking.start();

    // Step progression timers (simulate while API processes)
    const stepDelays = tier === "scan"
      ? [500, 1000, 1800, 2500, 3500]
      : tier === "standard"
        ? [800, 2500, 5000, 8000, 12000]
        : [1000, 4000, 8000, 15000, 22000];

    const timers: ReturnType<typeof setTimeout>[] = [];
    const stepIds = ["parse", "extract", "map", "score", "recommend"];
    stepIds.forEach((id, i) => {
      timers.push(setTimeout(() => thinking.advance(id, undefined), stepDelays[i]));
    });

    try {
      const res = await fetch("/api/evidence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId, tier }),
      });
      const data: AnalysisResult = await res.json();

      // Clear pending timers — real response arrived
      timers.forEach(clearTimeout);

      if (!data.ok) {
        thinking.fail("recommend", data.error ?? "Analysis failed");
        if (res.status === 402) {
          setError(`Insufficient credits. You need ${data.creditsUsed ?? TIERS.find(t => t.id === tier)?.cost} credits.`);
        } else {
          setError(data.error ?? "Analysis failed");
        }
        return;
      }

      thinking.completeAll();
      setResult(data);
      if (data.balance != null) setBalance(data.balance);
      onAnalyzed?.(data);
    } catch {
      timers.forEach(clearTimeout);
      thinking.fail("parse", "Network error");
      setError("Network error — please try again");
    } finally {
      setAnalyzing(null);
    }
  };

  // Render analysis result
  if (result?.ok && result.analysis) {
    const a = result.analysis;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white shadow-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-brand-600 font-medium">Analysis Complete</p>
              <p className="text-sm font-semibold text-ink-800 mt-0.5">{evidenceLabel}</p>
            </div>
            <button type="button" onClick={onClose} className="text-ink-600 hover:text-ink-800 cursor-pointer">
              <X strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>

          {/* SVI boost badge */}
          {result.sviBoost != null && result.sviBoost > 0 ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2">
              <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-teal-600" />
              <span className="text-sm font-semibold text-teal-700">SVI +{result.sviBoost} points</span>
              <span className="text-xs text-teal-600 ml-auto">{result.creditsUsed} credits used</span>
            </div>
          ) : null}

          {/* Summary */}
          {(a.summary || a.executiveSummary) ? (
            <div className="mb-4">
              <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">
                {String(a.summary ?? a.executiveSummary)}
              </p>
            </div>
          ) : null}

          {/* Strengths & Gaps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {Array.isArray(a.strengths) && a.strengths.length > 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-2">Strengths</p>
                <ul className="space-y-1">
                  {(a.strengths as string[]).map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-800">
                      <CheckCircle2 strokeWidth={1.75} className="h-3 w-3 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Array.isArray(a.gaps) && a.gaps.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-xs font-semibold text-amber-700 mb-2">Gaps to Address</p>
                <ul className="space-y-1">
                  {(a.gaps as string[]).map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
                      <span className="shrink-0 mt-0.5">!</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Recommendations */}
          {Array.isArray(a.recommendations) && a.recommendations.length > 0 ? (
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-3 mb-4">
              <p className="text-xs font-semibold text-ink-700 mb-2">Recommendations</p>
              <ul className="space-y-1.5">
                {(a.recommendations as Array<string | Record<string, unknown>>).map((r, i) => (
                  <li key={i} className="text-xs text-ink-700">
                    {typeof r === "string" ? r : `${r.action} (${r.impact} impact, ${r.effort} effort)`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Investor perspective */}
          {a.investorPerspective ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 mb-4">
              <p className="text-xs font-semibold text-blue-700 mb-1">Investor Perspective</p>
              <p className="text-xs text-blue-800">{String(a.investorPerspective)}</p>
            </div>
          ) : null}

          {/* Balance */}
          <div className="text-center pt-2 border-t border-surface-200">
            <p className="text-xs text-ink-500">Remaining balance: <span className="font-mono font-semibold">{balance ?? "—"}</span> credits</p>
          </div>
        </div>
      </div>
    );
  }

  // Tier selection view
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-surface-200 bg-white shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-600 font-medium">Analyze with BlockID AI</p>
            <p className="text-sm font-semibold text-ink-800 mt-0.5 truncate max-w-[350px]">{evidenceLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-600 hover:text-ink-800 cursor-pointer">
            <X strokeWidth={1.75} className="h-5 w-5" />
          </button>
        </div>

        {balance !== null && (
          <p className="text-xs text-ink-500 mb-4">
            Your balance: <span className="font-mono font-semibold text-ink-800">{balance.toFixed(2)}</span> credits
          </p>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const canAffordTier = balance !== null && balance >= tier.cost;
            const isAnalyzing = analyzing === tier.id;

            return (
              <button
                key={tier.id}
                type="button"
                disabled={!!analyzing || !canAffordTier}
                onClick={() => void handleAnalyze(tier.id)}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-all cursor-pointer",
                  "hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed",
                  tier.popular ? "border-brand-300 ring-1 ring-brand-100" : "border-surface-200",
                  tier.color,
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", tier.iconColor, "bg-white border border-surface-200")}>
                    <Icon strokeWidth={1.75} className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink-800">{tier.label}</p>
                      {tier.popular && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded">Popular</span>
                      )}
                      <span className="text-xs text-ink-500 ml-auto">{tier.time}</span>
                    </div>
                    <p className="text-xs text-ink-600 mt-0.5">{tier.desc}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tier.features.map((f) => (
                        <span key={f} className="text-[10px] font-medium text-ink-600 bg-white/80 border border-surface-200 rounded-full px-2 py-0.5">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-ink-800">{tier.cost.toFixed(2)}</p>
                    <p className="text-[10px] text-ink-500">credits</p>
                    {isAnalyzing && (
                      <Loader2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 animate-spin mt-1 ml-auto" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* AI Thinking Status — shows step-by-step progress during analysis */}
        <AIThinkingStatus
          steps={thinking.steps}
          isActive={thinking.isActive}
          title={`Analyzing ${evidenceLabel}`}
          className="mt-4"
        />

        {balance !== null && balance < 0.10 && !analyzing && (
          <div className="mt-4 text-center">
            <a href="/workspace/billing#credits" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Buy more credits →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
