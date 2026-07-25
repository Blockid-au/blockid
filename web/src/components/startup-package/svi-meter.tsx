"use client";

// Startup Package — live SVI meter (right rail).
//
// Server-hydrated numeric value; simple radial + delta chip. No fetching
// here — the parent RSC page owns the freshness contract.

import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  score: number;
  grade: string;
  stageLabel?: string;
  delta?: number;
  snapshotDate?: string;
}

const SCALE = 200; // display cap; SVI is open-ended but the ring maxes here

export function SviMeter({ score, grade, stageLabel, delta, snapshotDate }: Props) {
  const pct = Math.min(100, Math.max(0, (score / SCALE) * 100));
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Live SVI
      </p>
      <div className="relative mx-auto mt-3 h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="fill-none stroke-surface-200"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="fill-none stroke-brand-500 transition-all"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold text-ink-900">{Math.round(score)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Grade {grade}
          </p>
        </div>
      </div>
      {stageLabel && (
        <p className="mt-3 text-xs font-medium text-ink-700">{stageLabel}</p>
      )}
      {typeof delta === "number" && delta !== 0 && (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
            delta > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
          )}
        >
          <TrendingUp aria-hidden="true" className="h-3 w-3" />
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}
        </p>
      )}
      {snapshotDate && (
        <p className="mt-2 text-[10px] text-ink-400">as of {snapshotDate}</p>
      )}
    </div>
  );
}
