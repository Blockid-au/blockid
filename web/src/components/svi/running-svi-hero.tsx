"use client";

import { useEffect, useRef, useState } from "react";
import { computeThreeCaseValuation, formatAud } from "@/lib/svi/three-case-valuation";
import { cn } from "@/lib/utils";

// Running SVI hero — Wave 23 Phase A.
// The done-state weighted total already existed, but users had to wait
// for all 8 dimensions to land before seeing any headline number. This
// component computes the weighted total from *whatever has landed so
// far* and animates it up as each new dim completes. Same math the
// done-state uses, so the number the founder sees during analysis is
// consistent with the final one.
//
// Also shows a directional 3-case valuation range that grows/shrinks
// as more evidence arrives — genuinely useful signal for the founder
// during the ~60s analysis instead of an inert progress bar.

export interface RunningDim {
  key: string;
  score: number | null;
  weight: number;
  label: string;
}

interface Props {
  dims: RunningDim[];
  stage: string | null;
  industry: string | null;
  totalCount: number;
  running: boolean;
  done: boolean;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function useCountUp(target: number, durationMs = 500): number {
  const [displayed, setDisplayed] = useState<number>(() => Math.round(target));
  const fromRef = useRef<number>(Math.round(target));
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const roundedTarget = Math.round(target);
    if (roundedTarget === fromRef.current) return;
    if (typeof window !== "undefined") {
      try {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          fromRef.current = roundedTarget;
          setDisplayed(roundedTarget);
          return;
        }
      } catch { /* ignore */ }
    }
    const from = fromRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const value = Math.round(from + (roundedTarget - from) * easeOutCubic(t));
      setDisplayed(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = roundedTarget;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);
  return displayed;
}

export function RunningSviHero({ dims, stage, industry, totalCount, running, done }: Props) {
  const scored = dims.filter((d): d is RunningDim & { score: number } => d.score !== null);
  if (scored.length === 0 && !running) return null;

  const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
  const rawTotal =
    totalWeight > 0
      ? Math.round(scored.reduce((acc, d) => acc + (d.score * d.weight) / totalWeight, 0))
      : 0;
  const animatedSvi = useCountUp(rawTotal);
  const showValuation = scored.length >= 3;

  const band: "strong" | "developing" | "early" | "pending" =
    scored.length === 0 ? "pending" : rawTotal >= 70 ? "strong" : rawTotal >= 40 ? "developing" : "early";

  const bandCopy =
    band === "strong"
      ? "Investor-ready territory"
      : band === "developing"
      ? "Developing — gaps to close"
      : band === "early"
      ? "Early — needs stronger evidence"
      : "Warming up…";

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 relative overflow-hidden",
        "bg-gradient-to-br",
        band === "strong" && "border-emerald-300 dark:border-emerald-800 from-emerald-50/70 to-transparent dark:from-emerald-950/40",
        band === "developing" && "border-amber-300 dark:border-amber-800 from-amber-50/70 to-transparent dark:from-amber-950/30",
        band === "early" && "border-red-300 dark:border-red-800 from-red-50/70 to-transparent dark:from-red-950/30",
        band === "pending" && "border-brand-200 dark:border-brand-800 from-brand-50/50 to-transparent dark:from-brand-950/30",
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {running && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-brand-200/40 dark:bg-brand-800/40 overflow-hidden">
          <div className="h-full w-1/3 bg-brand-500 motion-safe:animate-[slide_1.8s_ease-in-out_infinite]" />
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-ink-600 dark:text-ink-400">
            {done ? "Business SVI" : "Business SVI (running)"}
          </span>
        </div>
        <span className="text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
          {scored.length} / {totalCount} dimensions scored
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-3 flex-wrap">
        <span
          className={cn(
            "text-5xl font-bold tabular-nums leading-none tracking-tight",
            band === "strong" && "text-emerald-700 dark:text-emerald-300",
            band === "developing" && "text-amber-700 dark:text-amber-300",
            band === "early" && "text-red-700 dark:text-red-300",
            band === "pending" && "text-ink-400 dark:text-ink-600",
          )}
        >
          {scored.length === 0 ? "—" : animatedSvi}
          {scored.length > 0 && (
            <span className="text-2xl text-ink-500 dark:text-ink-500 font-normal">/100</span>
          )}
        </span>
        <span className={cn(
          "text-xs font-medium",
          band === "strong" && "text-emerald-700 dark:text-emerald-400",
          band === "developing" && "text-amber-700 dark:text-amber-400",
          band === "early" && "text-red-700 dark:text-red-400",
          band === "pending" && "text-ink-500 dark:text-ink-500",
        )}>
          {bandCopy}
        </span>
      </div>

      {/* Weight coverage bar — shows what % of the SVI weight is already
          reflected in the running number. Helps founders read the score
          in context: "SVI 62 based on 55% weight coverage" is more
          trustworthy than "SVI 62" alone. */}
      {scored.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                band === "strong" && "bg-emerald-500",
                band === "developing" && "bg-amber-500",
                band === "early" && "bg-red-500",
                band === "pending" && "bg-brand-500",
              )}
              style={{ width: `${Math.min(100, totalWeight)}%` }}
            />
          </div>
          <p className="text-[10px] tabular-nums text-ink-500 dark:text-ink-500">
            {totalWeight}% of SVI weight covered
            {!done && totalWeight < 100 && " — score may shift as remaining dims land"}
          </p>
        </div>
      )}

      {showValuation && (() => {
        const v = computeThreeCaseValuation(rawTotal, stage, industry);
        return (
          <div className="mt-4 border-t border-ink-200/60 dark:border-ink-800/60 pt-3">
            <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-600 dark:text-ink-400 mb-2">
              Directional pre-money valuation ({v.stage.replace("_", " ")} · {v.sector})
            </p>
            <div className="grid grid-cols-3 gap-2">
              <ValCell tone="worst" label="Worst" mid={v.worst.mid} low={v.worst.low} high={v.worst.high} />
              <ValCell tone="avg" label="Average" mid={v.average.mid} low={v.average.low} high={v.average.high} />
              <ValCell tone="best" label="Best" mid={v.best.mid} low={v.best.low} high={v.best.high} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ValCell({
  tone,
  label,
  mid,
  low,
  high,
}: {
  tone: "worst" | "avg" | "best";
  label: string;
  mid: number;
  low: number;
  high: number;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        tone === "worst" && "border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20",
        tone === "avg" && "border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/30",
        tone === "best" && "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-600 dark:text-ink-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums leading-tight",
          tone === "worst" && "text-red-700 dark:text-red-300",
          tone === "avg" && "text-brand-700 dark:text-brand-300",
          tone === "best" && "text-emerald-700 dark:text-emerald-300",
        )}
      >
        {formatAud(mid)}
      </p>
      <p className="text-[10px] tabular-nums text-ink-500 dark:text-ink-500">
        {formatAud(low)}–{formatAud(high)}
      </p>
    </div>
  );
}
