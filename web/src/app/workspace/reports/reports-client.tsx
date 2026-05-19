"use client";

import { useRouter } from "next/navigation";
import { WeeklyReportCard } from "@/components/workspace/weekly-report-card";

export interface SnapshotRow {
  id: string;
  snapshot_date: string;
  svi_total: number;
  delta: number | null;
}

interface ReportsClientProps {
  snapshots: SnapshotRow[];
  currentSVI: number;
  previousSVI: number;
  currentStage: number;
  wins: string[];
  gaps: string[];
}

export function ReportsClient({
  snapshots,
  currentSVI,
  previousSVI,
  currentStage,
  wins,
  gaps,
}: ReportsClientProps) {
  const router = useRouter();

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

      {/* Score History */}
      <div>
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          Score History
        </h2>
        <div className="rounded-xl border border-ink-700 bg-ink-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-slate-500 font-medium">
                  Date
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-slate-500 font-medium">
                  SVI
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-slate-500 font-medium">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-ink-700/50 last:border-0"
                >
                  <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">
                    {new Date(s.snapshot_date).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-200 font-mono font-semibold">
                    {s.svi_total}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {s.delta != null ? (
                      <span
                        className={
                          s.delta >= 0 ? "text-green-400" : "text-red-400"
                        }
                      >
                        {s.delta >= 0 ? "+" : ""}
                        {s.delta}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
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
