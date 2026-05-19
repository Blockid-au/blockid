"use client";

import * as React from "react";
import {
  Search, ExternalLink, TrendingUp,
  Globe, BarChart3, Zap, AlertCircle, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ResearchResult {
  marketScore: number;
  competitiveScore: number;
  growthScore: number;
  competitors: Array<{
    name: string;
    url: string;
    description: string;
    threat: "high" | "medium" | "low";
  }>;
  marketInsights: string[];
  competitiveInsights: string[];
  growthInsights: string[];
  sources: Array<{ title: string; url: string }>;
  summary: string;
}

function ScorePill({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const color = score >= 70 ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : score >= 50 ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-red-600 bg-red-50 border-red-200";
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-xl border px-4 py-3", color)}>
      <Icon strokeWidth={1.75} className="h-4 w-4" />
      <span className="font-mono text-xl font-bold">{score}</span>
      <span className="text-[10px] uppercase tracking-[0.12em] font-medium opacity-80">{label}</span>
    </div>
  );
}

function ThreatBadge({ threat }: { threat: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-red-50 text-red-600 border-red-200",
    medium: "bg-amber-50 text-amber-600 border-amber-200",
    low: "bg-emerald-50 text-emerald-600 border-emerald-200",
  };
  const labels = { high: "High threat", medium: "Med threat", low: "Low threat" };
  return (
    <span className={cn("text-[10px] font-medium rounded px-1.5 py-0.5 border", styles[threat])}>
      {labels[threat]}
    </span>
  );
}

interface ResearchPanelProps {
  description: string;
  keywords?: string;
  websiteUrl?: string;
}

export function ResearchPanel({ description, keywords, websiteUrl }: ResearchPanelProps) {
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = React.useState<ResearchResult | null>(null);
  const [errorMsg, setErrorMsg] = React.useState("");

  const runResearch = async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/svi/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, keywords, websiteUrl }),
      });
      const data = await res.json() as { ok: boolean } & Partial<ResearchResult> & { error?: string };
      if (data.ok && data.marketScore !== undefined) {
        setResult({
          marketScore: data.marketScore ?? 50,
          competitiveScore: data.competitiveScore ?? 50,
          growthScore: data.growthScore ?? 50,
          competitors: data.competitors ?? [],
          marketInsights: data.marketInsights ?? [],
          competitiveInsights: data.competitiveInsights ?? [],
          growthInsights: data.growthInsights ?? [],
          sources: data.sources ?? [],
          summary: data.summary ?? "",
        });
        setState("done");
      } else {
        setErrorMsg(data.error ?? "Research failed");
        setState("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  };

  if (state === "idle") {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink-800 flex items-center gap-2">
              <Search strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              Competitive Intelligence Research
            </p>
            <p className="text-xs text-ink-600 mt-1">
              Tim doi thu canh tranh, validate thi truong va phan tich co hoi tang truong tu du lieu web thuc te.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void runResearch(); }}
            className="shrink-0 h-9 px-4 rounded-[10px] bg-brand-700 text-white text-xs font-semibold hover:bg-brand-800 transition-colors cursor-pointer"
          >
            Nghien cuu ngay &rarr;
          </button>
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white px-5 py-8 text-center shadow-sm">
        <div className="inline-flex items-center gap-3 text-sm text-ink-600">
          <span className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
          <span>
            <span className="font-medium text-ink-800">AI dang tim kiem web...</span>
            <br />
            <span className="text-xs">Dang tim doi thu, du lieu thi truong va xu huong tang truong. ~15-30 giay.</span>
          </span>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-3">
        <AlertCircle strokeWidth={1.75} className="h-4 w-4 text-red-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-red-600">{errorMsg}</p>
        </div>
        <button type="button" onClick={() => setState("idle")} className="text-xs text-ink-600 hover:text-ink-800 cursor-pointer">Retry</button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium flex items-center gap-2">
          <Globe strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" />
          Competitive Intelligence
        </p>
        <button type="button" onClick={() => setState("idle")} className="text-xs text-ink-600 hover:text-ink-800 cursor-pointer">Refresh</button>
      </div>

      <div className="p-5 space-y-5">
        {/* 3 Score pills */}
        <div className="grid grid-cols-3 gap-3">
          <ScorePill label="Market" score={result.marketScore} icon={BarChart3} />
          <ScorePill label="Competitive" score={result.competitiveScore} icon={Zap} />
          <ScorePill label="Growth" score={result.growthScore} icon={TrendingUp} />
        </div>

        {/* Summary */}
        {result.summary && (
          <p className="text-xs text-ink-600 leading-relaxed border-l-2 border-brand-200 pl-3">
            {result.summary}
          </p>
        )}

        {/* Competitors */}
        {result.competitors.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-700 font-medium mb-2">
              Doi thu canh tranh / Competitors ({result.competitors.length})
            </p>
            <div className="space-y-2">
              {result.competitors.slice(0, 5).map((c) => (
                <div key={c.name} className="flex items-start gap-3 rounded-xl border border-surface-200 bg-surface-100 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink-800">{c.name}</span>
                      <ThreatBadge threat={c.threat} />
                    </div>
                    <p className="text-xs text-ink-600 mt-0.5">{c.description}</p>
                  </div>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-brand-600 hover:text-brand-700 transition-colors mt-0.5"
                    >
                      <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3 insight columns */}
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { label: "Market Insights", items: result.marketInsights, color: "text-brand-600" },
            { label: "Competitive Insights", items: result.competitiveInsights, color: "text-amber-600" },
            { label: "Growth Insights", items: result.growthInsights, color: "text-emerald-600" },
          ].map(({ label, items, color }) => (
            items.length > 0 && (
              <div key={label}>
                <p className={cn("text-[10px] uppercase tracking-[0.12em] font-medium mb-2", color)}>{label}</p>
                <ul className="space-y-1.5">
                  {items.slice(0, 3).map(item => (
                    <li key={item} className="flex items-start gap-1.5 text-xs text-ink-600">
                      <CheckCircle2 strokeWidth={1.75} className={cn("h-3 w-3 mt-0.5 shrink-0", color)} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          ))}
        </div>

        {/* Sources */}
        {result.sources.length > 0 && (
          <div className="pt-3 border-t border-surface-200">
            <p className="text-[10px] uppercase tracking-[0.12em] text-ink-700 font-medium mb-2">Sources</p>
            <div className="flex flex-wrap gap-2">
              {result.sources.slice(0, 6).map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-ink-600 hover:text-brand-600 flex items-center gap-1 transition-colors"
                >
                  <ExternalLink strokeWidth={1.75} className="h-2.5 w-2.5" />
                  {s.title.slice(0, 30)}{s.title.length > 30 ? "…" : ""}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
