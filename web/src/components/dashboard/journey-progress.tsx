"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const stages = [
  { icon: "\u{1F4A1}", label: "Idea", min: 0, max: 40 },
  { icon: "\u2705", label: "Validate", min: 40, max: 80 },
  { icon: "\u{1F527}", label: "Build", min: 80, max: 120 },
  { icon: "\u{1F680}", label: "Launch", min: 120, max: 160 },
  { icon: "\u{1F4C8}", label: "Grow", min: 160, max: Infinity },
] as const;

function getStageIndex(svi: number): number {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (svi >= stages[i].min) return i;
  }
  return 0;
}

export function JourneyProgress({
  email,
  initialSvi,
}: {
  email: string;
  initialSvi?: number | null;
}) {
  const [svi, setSvi] = useState<number | null>(initialSvi ?? null);

  useEffect(() => {
    if (svi !== null) return;
    fetch(`/api/svi/latest?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; analysis?: { totalSvi?: number } | null }) => {
        if (d.ok && d.analysis?.totalSvi != null) {
          setSvi(d.analysis.totalSvi);
        }
      })
      .catch(() => {});
  }, [email, svi]);

  if (svi === null) return null;

  const currentIdx = getStageIndex(svi);

  return (
    <section className="mt-8 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-700">
          Startup Journey
        </p>
        <p className="text-sm font-semibold text-brand-600">SVI {svi}</p>
      </div>
      <div className="flex items-center gap-0 w-full">
        {stages.map((stage, i) => {
          const completed = i < currentIdx;
          const current = i === currentIdx;
          return (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className={cn(
                  "h-2 w-full rounded-sm",
                  completed
                    ? "bg-emerald-500"
                    : current
                      ? "bg-brand-500 animate-pulse"
                      : "bg-surface-200",
                )}
              />
              <span
                className={cn(
                  "text-xs mt-1",
                  completed
                    ? "text-emerald-600 font-medium"
                    : current
                      ? "text-brand-600 font-semibold"
                      : "text-ink-500",
                )}
              >
                {completed ? "\u2714\uFE0F" : stage.icon} {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
