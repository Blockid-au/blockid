// AIEvaluationSummary — consolidated AI-evaluation snapshot per startup.
//
// Renders the output of getStartupAISummary() so the founder home dashboard
// (and the admin per-user drill-in) can see EVERY AI evaluation a startup
// has produced without opening the score history page: total runs, latest
// score with 7d/30d delta, valuation, agent list, deep-dive count, top
// recommendations distilled from all deep-dives.

import Link from "next/link";
import { Brain, TrendingDown, TrendingUp, Minus, Zap, Compass } from "lucide-react";
import type { StartupAISummary } from "@/lib/analysis/aggregate-startup-summary";

function fmtAud(n: number | null | undefined): string | null {
  if (!n) return null;
  return n >= 1_000_000 ? `A$${(n / 1_000_000).toFixed(1)}M` : `A$${(n / 1_000).toFixed(0)}K`;
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
function scoreColor(s: number): string {
  return s >= 70 ? "text-green-400" : s >= 45 ? "text-amber-400" : "text-red-400";
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const cls = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-ink-400";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium tabular-nums ${cls}`}>
      <Icon className="h-3 w-3" />{sign}{delta}
    </span>
  );
}

export function AIEvaluationSummary({
  summary,
  href = "/dashboard/history",
}: {
  summary: StartupAISummary;
  href?: string;
}) {
  const val = summary.latestValuationLowAud && summary.latestValuationHighAud
    ? `${fmtAud(summary.latestValuationLowAud)} – ${fmtAud(summary.latestValuationHighAud)}`
    : fmtAud(summary.latestValuationLowAud) ?? fmtAud(summary.latestValuationHighAud) ?? "not yet computed";

  return (
    <div className="rounded-2xl border border-line-subtle bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line-subtle">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-action" />
          <h2 className="text-sm font-semibold text-primary">AI evaluation summary</h2>
        </div>
        <Link href={href} className="text-xs text-muted hover:text-primary transition-colors">
          Full history →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-line-subtle">
        <div className="px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">Latest SVI</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-2xl font-bold tabular-nums ${summary.latestTotalScore != null ? scoreColor(summary.latestTotalScore) : "text-ink-500"}`}>
              {summary.latestTotalScore ?? "—"}
            </div>
            <DeltaChip delta={summary.scoreDelta7d} />
          </div>
          <div className="text-xs text-tertiary mt-1">
            {summary.scoreDelta30d != null ? `${summary.scoreDelta30d >= 0 ? "+" : ""}${summary.scoreDelta30d} vs 30d` : "no 30d baseline"}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">Valuation</div>
          <div className="text-sm font-semibold text-primary">{val}</div>
          {summary.latestConfidence != null && (
            <div className="text-xs text-tertiary mt-1">
              confidence {Number(summary.latestConfidence).toFixed(0)}%
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">AI runs</div>
          <div className="text-sm font-semibold text-primary">
            {summary.totalScoreRuns} scoring · {summary.totalDeepDives} deep-dive
          </div>
          <div className="text-xs text-tertiary mt-1">
            since {fmtDate(summary.firstAnalysisAt)}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">Agents run</div>
          <div className="text-sm font-semibold text-primary">
            {summary.agentsRun.length > 0 ? summary.agentsRun.length : summary.totalAiCallsLogged}
          </div>
          <div className="text-xs text-tertiary mt-1 truncate">
            {summary.agentsRun.slice(0, 3).join(", ") || "auto-logged calls"}
          </div>
        </div>
      </div>

      {summary.deepDiveDimensions.length > 0 && (
        <div className="px-5 py-3 border-t border-line-subtle">
          <div className="flex items-center gap-2 mb-2">
            <Compass className="h-3.5 w-3.5 text-ink-400" />
            <span className="text-xs uppercase tracking-wider text-muted">
              Dimensions you deep-dived
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {summary.deepDiveDimensions.map((d) => (
              <span
                key={d}
                className="rounded-full bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 text-[10px] font-medium text-action uppercase"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.topRecommendations.length > 0 && (
        <div className="px-5 py-4 border-t border-line-subtle">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs uppercase tracking-wider text-muted">
              Top recommendations from all AI analyses
            </span>
          </div>
          <ol className="space-y-2">
            {summary.topRecommendations.map((rec, i) => (
              <li key={i} className="flex gap-3 text-xs text-ink-200">
                <span className="flex-shrink-0 rounded-full bg-amber-400/10 border border-amber-400/20 h-5 w-5 flex items-center justify-center text-[10px] font-semibold text-amber-400">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{rec}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
