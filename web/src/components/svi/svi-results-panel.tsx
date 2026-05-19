"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";

const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  self_declared: "Self-declared (20%)",
  public_url: "Public URL (35%)",
  document_uploaded: "Document uploaded (50%)",
  connected_source: "Connected source (75%)",
  transaction_data: "Transaction data (90%)",
  third_party_verified: "Third-party verified (100%)",
};

function SVIGauge({ value }: { value: number }) {
  const label =
    value >= 140 ? "Strong"
    : value >= 120 ? "Above Average"
    : value >= 100 ? "Average"
    : value >= 80 ? "Below Average"
    : "Early Stage";

  const color =
    value >= 140 ? "text-green-400"
    : value >= 120 ? "text-brand-400"
    : value >= 100 ? "text-amber-400"
    : "text-red-400";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-end justify-center gap-1">
        <span className={cn("font-mono text-8xl font-bold tabular-nums tracking-tight leading-none", color)}>
          {value}
        </span>
        <span className="mb-2 text-sm text-slate-400 font-mono">SVI</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-medium">Base</span>
        <span className="text-xs text-slate-500 font-mono">100</span>
        <span className="text-slate-600">→</span>
        <span className={cn("text-sm font-semibold", color)}>{label}</span>
      </div>
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
  const adjColor = adjustment >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-sm font-medium text-slate-200">{label}</span>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-mono font-semibold", adjColor)}>
              {adjustment >= 0 ? "+" : ""}{adjustment}
            </span>
            <span className="text-xs text-slate-500 font-mono">{pct}/100</span>
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.75} />
            )}
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-ink-700 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-brand-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-ink-700 space-y-2">
          {evidence.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-teal-400 font-medium mb-1.5">Evidence</p>
              <ul className="space-y-1">
                {evidence.map((e) => (
                  <li key={e} className="flex items-start gap-2 text-xs text-slate-400">
                    <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400 font-medium mb-1.5">Gaps</p>
              <ul className="space-y-1">
                {gaps.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-xs text-slate-400">
                    <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
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

export function SVIResultsPanel({
  analysis,
  slug,
  onReset,
}: {
  analysis: SVIAnalysis;
  slug: string;
  onReset: () => void;
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
      <div className="rounded-2xl border border-ink-700 bg-ink-900 px-8 py-10 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-400 font-medium mb-6">
          Startup Value Index
        </p>
        <SVIGauge value={analysis.totalSVI} />
        <p className="mt-6 text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
          {analysis.summary}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-500">
          <span>Evidence confidence: <span className="text-slate-300">{Math.round(analysis.confidenceMultiplier * 100)}%</span></span>
          <span>·</span>
          <span>{EVIDENCE_LEVEL_LABELS[analysis.signals.evidenceLevel] ?? "Self-declared"}</span>
        </div>
      </div>

      {/* Risk flags */}
      {analysis.riskPenalties.length > 0 && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/5 px-5 py-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium flex items-center gap-2">
            <AlertTriangle strokeWidth={1.75} className="h-3.5 w-3.5" />
            Risk Flags ({analysis.riskPenalties.length})
          </p>
          {analysis.riskPenalties.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{r.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{r.reason}</p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-red-400">
                -{r.points}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-scores */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3">
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

      {/* Evidence gaps */}
      {analysis.evidenceGaps.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3">
            Evidence to Add (ordered by impact)
          </p>
          <div className="space-y-2">
            {analysis.evidenceGaps.map((gap) => (
              <div
                key={gap.label}
                className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3"
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    gap.priority === "P0"
                      ? "bg-red-500/20 text-red-400"
                      : gap.priority === "P1"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-slate-500/20 text-slate-400",
                  )}
                >
                  {gap.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{gap.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{gap.action}</p>
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold text-teal-400">
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
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3">
            Next Actions
          </p>
          <div className="space-y-2">
            {analysis.nextActions.map((action) => (
              <div
                key={action.title}
                className="rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Zap
                      strokeWidth={1.75}
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        action.priority === "P0" ? "text-red-400" : action.priority === "P1" ? "text-amber-400" : "text-slate-500",
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-200">{action.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{action.detail}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-teal-400 mt-0.5">
                    {action.impact}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upsell */}
      <div className="rounded-2xl border border-brand-600/30 bg-brand-900/20 px-6 py-5">
        <div className="flex items-start gap-3">
          <TrendingUp strokeWidth={1.75} className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-slate-100">
                Track your SVI over time
              </p>
              <span className="rounded-full bg-brand-700/40 border border-brand-600/40 px-2 py-0.5 text-[10px] font-medium text-brand-300 uppercase tracking-wider">
                50 spots only
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Claim a Founding 50 account to build your SVI over time — cap table, Evidence Vault, export packs, and a 30-day growth plan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="/founding-50">
                <Button variant="primary" size="sm" className="h-9 text-sm">
                  Claim Founding 50 — AUD $49
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
      <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3">
        <span className="text-xs text-slate-400 truncate font-mono">{shareUrl}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-3 shrink-0 flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 cursor-pointer transition-colors"
        >
          <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
