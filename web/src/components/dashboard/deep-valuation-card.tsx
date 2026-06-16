"use client";

import * as React from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";

type DeepValuation = NonNullable<SVIAnalysis["deepValuation"]>;
type InputSummary = NonNullable<SVIAnalysis["inputSummary"]>;

interface Props {
  analysis: SVIAnalysis;
}

function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

const PERSPECTIVE_ICONS = {
  investor: TrendingUp,
  market: Target,
  operational: BarChart3,
  ecosystem: Users,
} as const;

function ProjectIntro({ summary }: { summary: InputSummary }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-600 uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            Project · {summary.sourceType} · auto-named ({summary.projectNameConfidence})
          </div>
          <h2 className="text-2xl font-bold mt-1">{summary.projectName}</h2>
        </div>
      </div>

      {summary.scrapedDescription && (
        <p className="text-sm text-muted-foreground italic leading-relaxed border-l-2 border-blue-300 pl-3">
          &ldquo;{summary.scrapedDescription.slice(0, 300)}
          {summary.scrapedDescription.length > 300 ? "..." : ""}&rdquo;
        </p>
      )}

      {summary.keyFindings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Key Findings</p>
          <ul className="space-y-1.5">
            {summary.keyFindings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PerspectiveRow({ p }: { p: DeepValuation["perspectives"][number] }) {
  const Icon = PERSPECTIVE_ICONS[p.code] ?? BarChart3;
  const confColor = p.confidence === "high" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
    : p.confidence === "medium" ? "text-blue-600 bg-blue-50 dark:bg-blue-950/20"
    : "text-amber-600 bg-amber-50 dark:bg-amber-950/20";

  const [open, setOpen] = React.useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{p.label}</p>
          <p className="text-xs text-muted-foreground">{Math.round(p.weight * 100)}% weight &middot; <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", confColor)}>{p.confidence}</span></p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-blue-600">{fmtAud(p.midAud)}</p>
          <p className="text-[10px] text-muted-foreground">{fmtAud(p.lowAud)} – {fmtAud(p.highAud)}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 bg-muted/10 space-y-2 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">{p.rationale}</p>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Assumptions</p>
            <ul className="space-y-0.5">
              {p.assumptions.map((a, i) => (
                <li key={i} className="text-xs text-foreground">&bull; {a}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function DeepValuationCard({ analysis }: Props) {
  const dv = analysis.deepValuation;
  const summary = analysis.inputSummary;

  if (!dv && !summary) return null;

  return (
    <div className="space-y-6">
      {/* Project intro */}
      {summary && <ProjectIntro summary={summary} />}

      {/* Multi-perspective valuation */}
      {dv && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Multi-Perspective Valuation
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              4 independent methods triangulated. Higher data quality → higher weight.
            </p>
          </div>

          {/* Blended hero */}
          <div className="rounded-lg bg-gradient-to-br from-blue-500/10 to-emerald-500/10 dark:from-blue-500/15 dark:to-emerald-500/15 border border-blue-200 dark:border-blue-800/40 p-4">
            <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Blended Valuation Estimate</p>
            <p className="text-3xl font-bold text-foreground mt-1">{fmtAud(dv.blendedValuation.midAud)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Range: {fmtAud(dv.blendedValuation.lowAud)} – {fmtAud(dv.blendedValuation.highAud)} &middot; <span className="font-medium capitalize">{dv.blendedValuation.confidence}</span> confidence
            </p>
          </div>

          <div className="space-y-2">
            {dv.perspectives.map((p) => <PerspectiveRow key={p.code} p={p} />)}
          </div>
        </div>
      )}

      {/* Market sizing + peers */}
      {dv && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-blue-500" />
              Market Sizing (AU)
            </h4>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { l: "TAM", v: dv.marketSizing.tamAud, color: "text-muted-foreground" },
                { l: "SAM", v: dv.marketSizing.samAud, color: "text-foreground" },
                { l: "SOM (Y3)", v: dv.marketSizing.somAud, color: "text-blue-600" },
              ].map((m) => (
                <div key={m.l}>
                  <p className="text-[10px] text-muted-foreground uppercase">{m.l}</p>
                  <p className={cn("text-base font-bold", m.color)}>{fmtAud(m.v)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic leading-relaxed">{dv.marketSizing.methodology}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {dv.marketSizing.sources.map((s) => (
                <span key={s} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{s}</span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-blue-500" />
              AU Peer Comparables
            </h4>
            <div className="space-y-2">
              {dv.peerComparables.map((peer) => (
                <div key={peer.name} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{peer.name}</p>
                    <p className="text-[11px] text-muted-foreground">{peer.stageGuess} &middot; sim {peer.similarityScore}%</p>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground shrink-0 text-right">
                    {fmtAud(peer.estValuationLowAud)}–{fmtAud(peer.estValuationHighAud)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue scenarios */}
      {dv && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="text-sm font-bold mb-3">3-Year Revenue Scenarios</h4>
          <div className="grid grid-cols-3 gap-3">
            {dv.revenueScenarios.map((scn) => (
              <div key={scn.scenario} className={cn(
                "rounded-lg p-3",
                scn.scenario === "base" ? "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40" : "bg-muted/30"
              )}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{scn.scenario}</p>
                <p className="text-xs text-muted-foreground mt-1">Year-3 ARR</p>
                <p className="text-xl font-bold">{fmtAud(scn.year3ArrAud)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{scn.payingCustomers.toLocaleString("en-AU")} customers</p>
                <p className="text-[10px] text-muted-foreground italic mt-2 leading-snug">{scn.assumptions}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk flags */}
      {dv && dv.riskFlags.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/10 p-4">
          <h4 className="text-sm font-bold mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Valuation Risk Flags
          </h4>
          <ul className="space-y-1">
            {dv.riskFlags.map((flag, i) => (
              <li key={i} className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">&bull; {flag}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Method notes */}
      {dv && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            Methodology notes &amp; assumptions
          </summary>
          <ul className="mt-3 space-y-1.5">
            {dv.methodNotes.map((note, i) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed">&bull; {note}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
