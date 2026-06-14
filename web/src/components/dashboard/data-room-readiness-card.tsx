"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FolderOpen,
} from "lucide-react";

type Badge = "none" | "bronze" | "silver" | "gold";

interface CategoryBreakdown {
  label: string;
  weight: number;
  score: number;
  complete: number;
  total: number;
  missing: string[];
}

interface ReadinessData {
  ok: boolean;
  score: number;
  badge: Badge;
  breakdown: Record<string, CategoryBreakdown>;
  missingCategories: string[];
  dataRoomExists: boolean;
}

const BADGE_CONFIG: Record<Badge, { label: string; color: string; bg: string; border: string; bar: string }> = {
  none:   { label: "Not Started",    color: "text-ink-500",    bg: "bg-surface-100",  border: "border-surface-200",  bar: "bg-ink-300" },
  bronze: { label: "Bronze",         color: "text-amber-700",  bg: "bg-amber-50",     border: "border-amber-200",    bar: "bg-amber-500" },
  silver: { label: "Silver",         color: "text-slate-700",  bg: "bg-slate-50",     border: "border-slate-200",    bar: "bg-slate-400" },
  gold:   { label: "Gold",           color: "text-yellow-700", bg: "bg-yellow-50",    border: "border-yellow-200",   bar: "bg-yellow-500" },
};

const BADGE_EMOJI: Record<Badge, string> = {
  none:   "⬜",
  bronze: "🥉",
  silver: "🥈",
  gold:   "🥇",
};

export function DataRoomReadinessCard() {
  const [data, setData] = React.useState<ReadinessData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/data-room/readiness")
      .then((r) => r.json())
      .then((d: ReadinessData) => {
        if (d.ok) setData(d);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6 flex items-center justify-center min-h-[160px]">
        <Loader2 className="h-5 w-5 text-ink-300 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const badge = data.badge;
  const cfg = BADGE_CONFIG[badge];
  const score = data.score;
  const nextTarget = badge === "none" ? 25 : badge === "bronze" ? 50 : badge === "silver" ? 80 : 100;

  // Top missing categories (up to 3)
  const topMissing = data.missingCategories.slice(0, 3);

  // Top breakdown items sorted by lowest score first
  const breakdownItems = Object.values(data.breakdown).sort((a, b) => a.score - b.score);

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-6 space-y-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-lg ${cfg.bg} border ${cfg.border}`}>
            {BADGE_EMOJI[badge]}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider font-medium text-ink-500">
              Data Room Readiness
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-ink-900">{score}</span>
              <span className="text-sm text-ink-500">/ 100</span>
              <span className={`text-sm font-semibold ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
          </div>
        </div>
        <ShieldCheck className={`h-5 w-5 shrink-0 mt-1 ${cfg.color}`} />
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-2.5 w-full rounded-full bg-surface-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
            style={{ width: `${score}%` }}
          />
        </div>
        {badge !== "gold" && (
          <p className="text-[10px] text-ink-500 mt-1.5">
            {nextTarget - score} points to{" "}
            <span className="font-semibold">
              {badge === "none" ? "Bronze" : badge === "bronze" ? "Silver" : "Gold"}
            </span>
          </p>
        )}
      </div>

      {/* Category breakdown — mini pills */}
      <div className="grid grid-cols-2 gap-1.5">
        {breakdownItems.map((item) => {
          const done = item.score >= 50;
          return (
            <div
              key={item.label}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                done
                  ? "bg-emerald-50 border border-emerald-100"
                  : "bg-white border border-surface-200"
              }`}
            >
              {done ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
              )}
              <span className={`truncate font-medium ${done ? "text-emerald-800" : "text-ink-700"}`}>
                {item.label}
              </span>
              <span className={`ml-auto shrink-0 font-mono tabular-nums ${done ? "text-emerald-600" : "text-ink-400"}`}>
                {item.score}%
              </span>
            </div>
          );
        })}
      </div>

      {/* What's missing checklist */}
      {topMissing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-white px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 mb-2">
            Missing to unlock next badge
          </p>
          <ul className="space-y-1.5">
            {topMissing.map((label) => (
              <li key={label} className="flex items-center gap-2 text-xs text-ink-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      <Link
        href={data.dataRoomExists ? "/workspace/data-room" : "/tools/data-room"}
        className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 hover:bg-brand-100 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-brand-700">
            {data.dataRoomExists ? "Complete your Data Room" : "Build your Data Room"}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-brand-500 group-hover:text-brand-700 transition-colors" />
      </Link>
    </div>
  );
}
