"use client";

import Link from "next/link";
import { FileText, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportEntry {
  id: string;
  total_svi: number;
  created_at: string;
  input_type: string | null;
}

interface Props {
  reports: ReportEntry[];
}

function timeAgo(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function ActivityFeed({ reports }: Props) {
  if (reports.length === 0) return null;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-200">
        <h3 className="text-sm font-semibold text-ink-900">Recent Activity</h3>
      </div>

      <div className="divide-y divide-surface-100">
        {reports.slice(0, 8).map((r, i) => {
          const prev = reports[i + 1];
          const delta = prev ? r.total_svi - prev.total_svi : undefined;
          const typeLabel = r.input_type === "url" ? "URL Analysis" : r.input_type === "deep_dive" ? "Deep Dive" : "SVI Analysis";

          return (
            <Link
              key={r.id}
              href={`/s/${r.id}`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-surface-50 transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <FileText strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink-800">{typeLabel}</p>
                <p className="text-[11px] text-ink-500">{timeAgo(r.created_at)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm font-mono font-semibold text-ink-700">{r.total_svi}</span>
                {delta != null && delta !== 0 && (
                  <span className={cn("flex items-center gap-0.5 text-[10px] font-mono font-semibold",
                    delta > 0 ? "text-emerald-600" : "text-red-500",
                  )}>
                    {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {delta > 0 ? "+" : ""}{delta}
                  </span>
                )}
                {(delta == null || delta === 0) && (
                  <Minus className="h-3 w-3 text-ink-300" />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {reports.length > 8 && (
        <div className="px-5 py-3 border-t border-surface-200">
          <Link href="/workspace/reports" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            View all reports <ArrowRight strokeWidth={1.75} className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
