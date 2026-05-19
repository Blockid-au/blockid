"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  LayoutDashboard,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { ResearchPanel } from "@/components/svi/research-panel";

const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  self_declared: "Self-declared (20%)",
  public_url: "Public URL (35%)",
  document_uploaded: "Document uploaded (50%)",
  connected_source: "Connected source (75%)",
  transaction_data: "Transaction data (90%)",
  third_party_verified: "Third-party verified (100%)",
};

function SVIGauge({ value, stage, stageLabel }: { value: number; stage?: number; stageLabel?: string }) {
  const label =
    value >= 200 ? "Elite"
    : value >= 170 ? "Exceptional"
    : value >= 140 ? "Strong"
    : value >= 120 ? "Above Average"
    : value >= 100 ? "Average"
    : value >= 80 ? "Below Average"
    : value >= 60 ? "Early Stage"
    : "Critical";

  const color =
    value >= 140 ? "text-emerald-600"
    : value >= 120 ? "text-brand-600"
    : value >= 100 ? "text-amber-600"
    : "text-red-600";

  const resolvedStageLabel = stageLabel ?? (stage !== undefined ? SVI_STAGE_LABELS[stage] : undefined);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-end justify-center gap-1">
        <span className={cn("font-mono text-8xl font-bold tabular-nums tracking-tight leading-none", color)}>
          {value}
        </span>
        <span className="mb-2 text-sm text-ink-600 font-mono">SVI</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-700 font-medium">Base</span>
        <span className="text-xs text-ink-700 font-mono">100</span>
        <span className="text-ink-600">→</span>
        <span className={cn("text-sm font-semibold", color)}>{label}</span>
      </div>
      {resolvedStageLabel && (
        <span className="mt-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-brand-600">
          Stage {stage ?? "?"} — {resolvedStageLabel}
        </span>
      )}
    </div>
  );
}

function SubScoreBar({
  label,
  value,
  adjustment,
  evidence,
  gaps,
}: {
  label: string;
  value: number;
  adjustment: number;
  evidence: string[];
  gaps: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const pct = Math.round(value);
  const adjColor = adjustment >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-sm font-medium text-ink-800">{label}</span>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-mono font-semibold", adjColor)}>
              {adjustment >= 0 ? "+" : ""}{adjustment}
            </span>
            <span className="text-xs text-ink-600 font-mono">{pct}/100</span>
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 text-ink-600" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ink-600" strokeWidth={1.75} />
            )}
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-200 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-surface-200 space-y-2">
          {evidence.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-teal-600 font-medium mb-1.5">Evidence</p>
              <ul className="space-y-1">
                {evidence.map((e) => (
                  <li key={e} className="flex items-start gap-2 text-xs text-ink-600">
                    <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-1.5">Gaps</p>
              <ul className="space-y-1">
                {gaps.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-xs text-ink-600">
                    <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AIScorePanel({ analysis, rawText }: { analysis: SVIAnalysis; rawText?: string }) {
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = React.useState<{
    aiSVI: number;
    comparison: string;
    discrepancy: number;
    strengths: string[];
    weaknesses: string[];
    recommendation: string;
    transparencyNote: string;
  } | null>(null);

  const getAIScore = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/svi/ai-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: rawText ?? analysis.summary,
          deterministicSVI: analysis.totalSVI,
          deterministicAnalysis: analysis,
        }),
      });
      const data = await res.json() as { ok: boolean; aiSVI?: number; comparison?: string; discrepancy?: number; strengths?: string[]; weaknesses?: string[]; recommendation?: string; transparencyNote?: string };
      if (data.ok) {
        setResult({
          aiSVI: data.aiSVI ?? 0,
          comparison: data.comparison ?? "agree",
          discrepancy: data.discrepancy ?? 0,
          strengths: data.strengths ?? [],
          weaknesses: data.weaknesses ?? [],
          recommendation: data.recommendation ?? "",
          transparencyNote: data.transparencyNote ?? "",
        });
        setState("done");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => { void getAIScore(); }}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-600 hover:bg-brand-100 transition-colors cursor-pointer"
      >
        <span className="h-4 w-4 rounded-full border border-brand-600 flex items-center justify-center text-xs font-bold">AI</span>
        Get independent AI verification score
      </button>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-ink-600">
        <span className="h-4 w-4 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
        AI is independently scoring your startup…
      </div>
    );
  }

  if (state === "error") {
    return <p className="text-center text-xs text-red-600 py-2">AI scoring unavailable. Try again later.</p>;
  }

  if (!result) return null;

  const compColor = result.comparison === "agree" ? "text-emerald-600" : result.comparison === "higher" ? "text-teal-600" : "text-amber-600";
  const compLabel = result.comparison === "agree" ? "AI agrees" : result.comparison === "higher" ? `AI scored ${result.discrepancy} points higher` : `AI scored ${result.discrepancy} points lower`;

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.15em] text-brand-600 font-medium">AI Verification Score</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xl font-bold text-brand-600">{result.aiSVI}</span>
          <span className={`text-xs font-medium ${compColor}`}>{compLabel}</span>
        </div>
      </div>
      <p className="text-xs text-ink-600 italic">{result.recommendation}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-600 font-medium mb-1.5">AI Strengths</p>
          <ul className="space-y-1">
            {result.strengths.map(s => <li key={s} className="text-xs text-ink-600 flex items-start gap-1"><span className="text-emerald-600 shrink-0 mt-0.5">+</span>{s}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-amber-600 font-medium mb-1.5">AI Concerns</p>
          <ul className="space-y-1">
            {result.weaknesses.map(w => <li key={w} className="text-xs text-ink-600 flex items-start gap-1"><span className="text-amber-600 shrink-0 mt-0.5">!</span>{w}</li>)}
          </ul>
        </div>
      </div>
      <p className="text-[10px] text-ink-700 border-t border-surface-200 pt-2 mt-2">{result.transparencyNote}</p>
    </div>
  );
}

export function SVIResultsPanel({
  analysis,
  slug,
  onReset,
  rawText,
}: {
  analysis: SVIAnalysis;
  slug: string;
  onReset: () => void;
  rawText?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/svi/${slug}`
      : `/svi/${slug}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* SVI Gauge */}
      <div className="rounded-2xl border border-surface-200 bg-white px-8 py-10 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-medium mb-6">
          Startup Value Index
        </p>
        <SVIGauge value={analysis.totalSVI} stage={analysis.stage} stageLabel={analysis.stageLabel} />
        <p className="mt-6 text-sm text-ink-600 max-w-xs mx-auto leading-relaxed">
          {analysis.summary}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-ink-600">
          <span>Evidence confidence: <span className="text-ink-800">{Math.round(analysis.confidenceMultiplier * 100)}%</span></span>
          <span>·</span>
          <span>{EVIDENCE_LEVEL_LABELS[analysis.signals.evidenceLevel] ?? "Self-declared"}</span>
        </div>
      </div>

      {/* Risk flags */}
      {analysis.riskPenalties.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-red-600 font-medium flex items-center gap-2">
            <AlertTriangle strokeWidth={1.75} className="h-3.5 w-3.5" />
            Risk Flags ({analysis.riskPenalties.length})
          </p>
          {analysis.riskPenalties.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink-800">{r.label}</p>
                <p className="text-xs text-ink-600 mt-0.5">{r.reason}</p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-red-600">
                -{r.points}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-scores */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">
          Index Breakdown
        </p>
        <div className="space-y-2">
          {analysis.subs.map((sub) => (
            <SubScoreBar
              key={sub.key}
              label={sub.label}
              value={sub.value}
              adjustment={sub.adjustment}
              evidence={sub.evidence}
              gaps={sub.gaps}
            />
          ))}
        </div>
      </div>

      {/* Competitive Research */}
      <ResearchPanel
        description={rawText ?? analysis.summary}
        keywords={analysis.signals?.marketSize ? `${analysis.signals.marketSize} market` : undefined}
      />

      {/* Evidence gaps */}
      {analysis.evidenceGaps.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">
            Evidence to Add (ordered by impact)
          </p>
          <div className="space-y-2">
            {analysis.evidenceGaps.map((gap) => (
              <div
                key={gap.label}
                className="flex items-start gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm"
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    gap.priority === "P0"
                      ? "bg-red-50 text-red-600"
                      : gap.priority === "P1"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-surface-200 text-ink-600",
                  )}
                >
                  {gap.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-800">{gap.label}</p>
                  <p className="text-xs text-ink-600 mt-0.5">{gap.action}</p>
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold text-teal-600">
                  +{gap.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next actions */}
      {analysis.nextActions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">
            Next Actions
          </p>
          <div className="space-y-2">
            {analysis.nextActions.map((action) => (
              <div
                key={action.title}
                className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Zap
                      strokeWidth={1.75}
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        action.priority === "P0" ? "text-red-600" : action.priority === "P1" ? "text-amber-600" : "text-ink-600",
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium text-ink-800">{action.title}</p>
                      <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">{action.detail}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-teal-600 mt-0.5">
                    {action.impact}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Second Opinion */}
      <AIScorePanel analysis={analysis} rawText={rawText} />

      {/* Upsell */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50 px-6 py-5">
        <div className="flex items-start gap-3">
          <TrendingUp strokeWidth={1.75} className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-ink-800">
                Track your SVI over time
              </p>
              <span className="rounded-full bg-brand-100 border border-brand-200 px-2 py-0.5 text-[10px] font-medium text-brand-600 uppercase tracking-wider">
                50 spots only
              </span>
            </div>
            <p className="text-xs text-ink-600 mt-1 leading-relaxed">
              Claim a Founding 50 account to build your SVI over time — cap table, Evidence Vault, export packs, and a 30-day growth plan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="/founding-50">
                <Button variant="primary" size="sm" className="h-9 text-sm">
                  Claim Founding 50 — AUD $49
                </Button>
              </a>
              <a href="/dashboard/svi">
                <Button variant="secondary" size="sm" className="h-9 text-sm gap-1.5">
                  <LayoutDashboard strokeWidth={1.75} className="h-3.5 w-3.5" />
                  View Full Dashboard
                </Button>
              </a>
              <Button variant="secondary" size="sm" className="h-9 text-sm" onClick={onReset}>
                Analyze another idea
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Share */}
      <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs text-ink-600 truncate font-mono">{shareUrl}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-3 shrink-0 flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 cursor-pointer transition-colors"
        >
          <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
