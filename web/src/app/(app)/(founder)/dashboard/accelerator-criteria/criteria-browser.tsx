"use client";

import * as React from "react";
import { Award, ChevronDown, ChevronUp, ExternalLink, Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeRow {
  id: string;
  source: string;
  source_name: string;
  topic: string;
  criterion: string;
  description: string | null;
  stage_min: number;
  stage_max: number;
  sector: string;
  evidence_required: string[];
  tactic: string[];
  valuation_lift_pct: number;
  citations: string[];
}

const STAGE_LABELS = ["Concept", "Validated", "MVP", "Traction", "Revenue", "Growth", "Scale", "Mature"];

const TOPIC_LABEL: Record<string, string> = {
  team: "Team",
  progress: "Progress",
  invention: "Invention",
  vision: "Unique Vision",
  product_10x: "10× Product",
  governance: "Governance",
};

const TOPIC_COLOR: Record<string, string> = {
  team: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  progress: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  invention: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  vision: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  product_10x: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  governance: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function CriteriaBrowser({ rows }: { rows: KnowledgeRow[] }) {
  const [query, setQuery] = React.useState("");
  const [stage, setStage] = React.useState<number | "all">("all");
  const [source, setSource] = React.useState<string>("all");
  const [topic, setTopic] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<"lift" | "source" | "stage">("lift");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const sources = React.useMemo(() => Array.from(new Set(rows.map((r) => r.source))).sort(), [rows]);
  const topics = React.useMemo(() => Array.from(new Set(rows.map((r) => r.topic))).sort(), [rows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (stage !== "all" && (r.stage_min > stage || r.stage_max < stage)) return false;
      if (source !== "all" && r.source !== source) return false;
      if (topic !== "all" && r.topic !== topic) return false;
      if (q && !`${r.criterion} ${r.description ?? ""} ${r.source_name} ${r.tactic.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === "lift") return b.valuation_lift_pct - a.valuation_lift_pct;
      if (sortBy === "source") return a.source_name.localeCompare(b.source_name);
      return a.stage_min - b.stage_min;
    });
    return list;
  }, [rows, query, stage, source, topic, sortBy]);

  const clearFilters = stage !== "all" || source !== "all" || topic !== "all" || query !== "";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search criteria, tactic, source…"
            className="w-full pl-8 pr-2 py-2 text-xs border border-border rounded-lg bg-background"
          />
        </div>
        <select value={stage} onChange={(e) => setStage(e.target.value === "all" ? "all" : Number(e.target.value))} className="text-xs border border-border rounded-lg px-2 py-2 bg-background">
          <option value="all">All stages</option>
          {STAGE_LABELS.map((label, i) => <option key={i} value={i}>Stage {i} · {label}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="text-xs border border-border rounded-lg px-2 py-2 bg-background">
          <option value="all">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{rows.find((r) => r.source === s)?.source_name ?? s}</option>)}
        </select>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="text-xs border border-border rounded-lg px-2 py-2 bg-background">
          <option value="all">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{TOPIC_LABEL[t] ?? t}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="text-xs border border-border rounded-lg px-2 py-2 bg-background">
          <option value="lift">Sort: by valuation lift</option>
          <option value="source">Sort: by source</option>
          <option value="stage">Sort: by stage</option>
        </select>
        {clearFilters && (
          <button
            onClick={() => { setQuery(""); setStage("all"); setSource("all"); setTopic("all"); }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {rows.length} criteria
        </span>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <Filter className="h-5 w-5 mx-auto mb-2" />
            No criteria match the current filters.
          </div>
        )}

        {filtered.map((r) => {
          const open = openId === r.id;
          const stageBand = r.stage_min === r.stage_max
            ? `Stage ${r.stage_min}`
            : `Stage ${r.stage_min}–${r.stage_max}`;
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setOpenId(open ? null : r.id)}
                className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-sm font-bold">{r.criterion}</span>
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted">{r.source_name}</span>
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", TOPIC_COLOR[r.topic] ?? "bg-muted")}>
                      {TOPIC_LABEL[r.topic] ?? r.topic}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{stageBand}</span>
                    {r.sector !== "any" && (
                      <span className="text-[10px] text-muted-foreground">· {r.sector}</span>
                    )}
                    {r.valuation_lift_pct > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-600 inline-flex items-center gap-0.5">
                        <Award className="h-2.5 w-2.5" /> +{r.valuation_lift_pct}% lift
                      </span>
                    )}
                  </div>
                </div>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
              </button>

              {open && (
                <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/10 space-y-3">
                  {r.description && (
                    <p className="text-xs text-foreground leading-relaxed">{r.description}</p>
                  )}

                  {r.evidence_required.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">Evidence required</p>
                      <ul className="space-y-0.5">
                        {r.evidence_required.map((e, i) => <li key={i} className="text-xs">○ {e}</li>)}
                      </ul>
                    </div>
                  )}

                  {r.tactic.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">How to lift</p>
                      <ul className="space-y-0.5">
                        {r.tactic.map((t, i) => <li key={i} className="text-xs">→ {t}</li>)}
                      </ul>
                    </div>
                  )}

                  {r.citations.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sources:</p>
                      {r.citations.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          {new URL(url).hostname.replace(/^www\./, "")}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
