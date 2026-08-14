/**
 * TechIntelligenceRow — shows a Tech Score summary row in the SVI dashboard.
 *
 * Rendered as a server-safe pure component (no "use client" needed).
 * Only displayed when a tech_analyses row exists for the current startup.
 */

import Link from "next/link";
import { Cpu, ArrowRight } from "lucide-react";

interface TechAnalysisSummary {
  tech_score: number;
  svi_contribution: number;
  valuation_multiplier_boost: number;
}

interface TechIntelligenceRowProps {
  techAnalysis: TechAnalysisSummary | null;
}

function techScoreColour(score: number): string {
  if (score > 75) return "text-[#00D4FF]";
  if (score > 60) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-500";
}

function techScoreBg(score: number): string {
  if (score > 75) return "bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.2)]";
  if (score > 60) return "bg-emerald-50 border-emerald-200";
  if (score >= 40) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

export function TechIntelligenceRow({ techAnalysis }: TechIntelligenceRowProps) {
  if (!techAnalysis) {
    // No tech analysis — show a lightweight nudge to run one
    return (
      <div className="rounded-2xl border border-surface-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
              <Cpu strokeWidth={1.75} className="h-4 w-4 text-ink-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-800">Tech Intelligence</p>
              <p className="text-xs text-ink-500 mt-0.5">
                Analyse your website and GitHub to get a Tech Score that boosts your SVI.
              </p>
            </div>
          </div>
          <Link
            href="/workspace/tech-analysis"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            Run Tech Analysis
            <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const score = techAnalysis.tech_score;
  const sviPts = techAnalysis.svi_contribution;
  const boost = Math.round((techAnalysis.valuation_multiplier_boost ?? 0) * 100);

  return (
    <div className={`rounded-2xl border px-5 py-4 ${techScoreBg(score)}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white border border-surface-200 flex items-center justify-center shrink-0 shadow-sm">
            <Cpu strokeWidth={1.75} className={`h-4 w-4 ${techScoreColour(score)}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-800">Tech Intelligence</p>
            <p className="text-xs text-ink-500 mt-0.5">
              Contributes{" "}
              <span className="font-semibold text-ink-700">+{sviPts} pts</span> to your SVI
              {boost > 0 && (
                <>
                  {" "}· Valuation Boost:{" "}
                  <span className="font-semibold text-fuchsia-600">+{boost}%</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Score pill */}
          <div className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${techScoreColour(score)}`}>
            {score}/100
          </div>

          <Link
            href="/workspace/tech-analysis"
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50 transition-colors"
          >
            Run Tech Analysis
            <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
