"use client";

import {
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Lightbulb,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { valuationNotEstimable } from "@/lib/valuation/not-estimable";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";

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

export function DeepValuationCard({ analysis }: Props) {
  const dv = analysis.deepValuation;
  const summary = analysis.inputSummary;

  if (!dv && !summary) return null;
  const notEstimable = valuationNotEstimable();

  return (
    <div className="space-y-6">
      {/* Project intro */}
      {summary && <ProjectIntro summary={summary} />}

      {/* Company value — V04a / D22: the 4-lens blend multiplied the SVI into
          dollars; it is never shown. Market sizing and scenarios stay. */}
      {dv && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-2" data-testid="deep-valuation-not-estimable">
          <h3 className="text-base font-bold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            Company value
          </h3>
          <p className="text-2xl font-bold text-foreground">{notEstimable.label}</p>
          <p className="text-sm text-muted-foreground">{notEstimable.line}</p>
          <p className="text-xs text-muted-foreground">{notEstimable.why}</p>
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
                scn.scenario === "base" ? "bg-blue-50 border border-blue-200" : "bg-muted/30"
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
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h4 className="text-sm font-bold mb-2 flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            Valuation Risk Flags
          </h4>
          <ul className="space-y-1">
            {dv.riskFlags.map((flag, i) => (
              <li key={i} className="text-xs text-amber-900 leading-relaxed">&bull; {flag}</li>
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
