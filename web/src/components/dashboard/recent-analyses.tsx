"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SavedAnalysis {
  slug: string;
  totalSVI: number;
  stage: number;
  stageLabel: string;
  summary: string;
  createdAt: string;
  inputPreview: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RecentAnalyses({ className }: { className?: string }) {
  const [analyses, setAnalyses] = React.useState<SavedAnalysis[]>([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("blockid_analyses");
      if (raw) setAnalyses(JSON.parse(raw));
    } catch {}
  }, []);

  const remove = (slug: string) => {
    const updated = analyses.filter(a => a.slug !== slug);
    setAnalyses(updated);
    try { localStorage.setItem("blockid_analyses", JSON.stringify(updated)); } catch {}
  };

  if (analyses.length === 0) return null;

  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-900">Recent Analyses</h3>
        </div>
        <span className="text-xs text-ink-500">{analyses.length} saved</span>
      </div>
      <div className="divide-y divide-surface-100">
        {analyses.slice(0, 5).map(a => (
          <div key={a.slug} className="px-5 py-3.5 flex items-start gap-3 hover:bg-surface-50 transition-colors group">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
              a.totalSVI >= 150 ? "bg-emerald-50 text-emerald-700" :
              a.totalSVI >= 100 ? "bg-brand-50 text-brand-700" :
              "bg-amber-50 text-amber-700"
            )}>
              {a.totalSVI}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-800 truncate">{a.inputPreview || "Untitled analysis"}</span>
                <span className="text-[10px] text-ink-400">{relativeTime(a.createdAt)}</span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5 truncate">{a.summary || `Stage ${a.stage}: ${a.stageLabel}`}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/s/${a.slug}`} className="h-7 w-7 rounded-lg flex items-center justify-center text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors opacity-0 group-hover:opacity-100">
                <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
              </Link>
              <button type="button" onClick={() => remove(a.slug)} className="h-7 w-7 rounded-lg flex items-center justify-center text-ink-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer">
                <Trash2 strokeWidth={1.75} className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {analyses.length > 5 && (
        <div className="px-5 py-2.5 border-t border-surface-200 text-center">
          <Link href="/workspace/reports" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all {analyses.length} analyses →</Link>
        </div>
      )}
    </div>
  );
}
