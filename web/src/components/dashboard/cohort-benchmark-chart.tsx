"use client";

import * as React from "react";

export interface CohortBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export function CohortBenchmarkChart({
  buckets,
  maxCount,
  userScore,
}: {
  buckets: CohortBucket[];
  maxCount: number;
  userScore: number | null;
}) {
  const userBucketIndex = React.useMemo(() => {
    if (userScore == null) return -1;
    return buckets.findIndex((b) => userScore >= b.min && userScore < b.max);
  }, [buckets, userScore]);

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-6">
      <h2 className="text-base font-semibold text-ink-800">
        SVI Distribution — Cohort
      </h2>
      <p className="mt-1 text-xs text-ink-500">
        Each bar is the number of startups scoring in that range. Your bucket is
        highlighted.
      </p>

      <div className="mt-6 flex items-end justify-between gap-2 h-64">
        {buckets.map((b, i) => {
          const heightPct = (b.count / Math.max(1, maxCount)) * 100;
          const isUser = i === userBucketIndex;
          return (
            <div
              key={b.label}
              className="flex-1 flex flex-col items-center justify-end gap-1"
            >
              <span
                className={`text-[10px] font-medium ${isUser ? "text-brand-700" : "text-ink-400"}`}
              >
                {b.count}
              </span>
              <div
                className={`w-full rounded-t-md transition-all ${
                  isUser ? "bg-brand-500" : "bg-surface-200"
                }`}
                style={{ height: `${Math.max(2, heightPct)}%` }}
                aria-label={`SVI ${b.label}: ${b.count} startups${isUser ? " (your bucket)" : ""}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        {buckets.map((b, i) => (
          <span
            key={b.label}
            className={`flex-1 text-center text-[10px] ${i === userBucketIndex ? "text-brand-700 font-semibold" : "text-ink-400"}`}
          >
            {b.label}
          </span>
        ))}
      </div>

      {userScore != null && userBucketIndex >= 0 && (
        <p className="mt-5 text-xs text-ink-500">
          You are in the <strong className="text-brand-700">{buckets[userBucketIndex].label}</strong> bucket
          (score {userScore}).
        </p>
      )}
    </section>
  );
}
