"use client";

import { useRouter } from "next/navigation";
import { WeeklyReportCard } from "@/components/workspace/weekly-report-card";
import { SVIChart } from "@/components/workspace/svi-chart";

export interface SnapshotRow {
  id: string;
  snapshot_date: string;
  svi_total: number;
  delta: number | null;
  ai_summary?: string | null;
  tier?: "preview" | "standard" | "premium" | null;
}

const TIER_BADGE_STYLES: Record<"preview" | "standard" | "premium", { label: string; className: string }> = {
  preview: {
    label: "Free Preview",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  standard: {
    label: "Standard",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  premium: {
    label: "Premium",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
};

function TierBadge({ tier }: { tier: "preview" | "standard" | "premium" }) {
  const style = TIER_BADGE_STYLES[tier];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${style.className}`}
    >
      {style.label}
    </span>
  );
}

interface ReportsClientProps {
  snapshots: SnapshotRow[];
  currentSVI: number;
  previousSVI: number;
  currentStage: number;
  wins: string[];
  gaps: string[];
  latestAISummary?: string | null;
}

export function ReportsClient({
  snapshots,
  currentSVI,
  previousSVI,
  currentStage,
  wins,
  gaps,
  latestAISummary,
}: ReportsClientProps) {
  const router = useRouter();

  // Prepare chart data in chronological order
  const chartData = [...snapshots]
    .reverse()
    .map((s) => ({
      date: s.snapshot_date,
      svi: s.svi_total,
      delta: s.delta,
    }));

  return (
    <div className="space-y-8">
      {/* Weekly Report Card */}
      <WeeklyReportCard
        currentSVI={currentSVI}
        previousSVI={previousSVI}
        currentStage={currentStage}
        wins={wins}
        gaps={gaps}
        onAddEvidence={() => router.push("/workspace/evidence")}
        reportHref="/workspace/reports"
      />

      {/* AI-generated weekly insight */}
      {latestAISummary && (
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <h3 className="text-[10px] uppercase tracking-[0.14em] text-brand-600 font-medium mb-2">
            Weekly Insight
          </h3>
          <p className="text-sm text-ink-600 leading-relaxed">
            {latestAISummary}
          </p>
        </div>
      )}

      {/* SVI Score History Chart */}
      <SVIChart snapshots={chartData} />

      {/* Score History Table */}
      <div>
        <h2 className="text-sm font-semibold text-ink-800 mb-3">
          Score History
        </h2>
        <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
                  Date
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
                  Tier
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
                  SVI
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-surface-200 last:border-0"
                >
                  <td className="px-4 py-2.5 text-ink-600 font-mono text-xs">
                    {new Date(s.snapshot_date).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.tier ? <TierBadge tier={s.tier} /> : <span className="text-ink-700 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-800 font-mono font-semibold">
                    {s.svi_total}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {s.delta != null ? (
                      <span
                        className={
                          s.delta >= 0 ? "text-emerald-600" : "text-red-500"
                        }
                      >
                        {s.delta >= 0 ? "+" : ""}
                        {s.delta}
                      </span>
                    ) : (
                      <span className="text-ink-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
