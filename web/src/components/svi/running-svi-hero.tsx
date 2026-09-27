"use client";

import { useEffect, useRef, useState } from "react";
import { valuationNotEstimable } from "@/lib/valuation/not-estimable";
import type { StreamValuation } from "@/lib/svi/stream-valuation";
import { CanonicalValuation } from "./canonical-valuation";
import { cn } from "@/lib/utils";

// Running SVI hero — Wave 23 Phase A.
// The done-state weighted total already existed, but users had to wait
// for all 8 dimensions to land before seeing any headline number. This
// component computes the weighted total from *whatever has landed so
// far* and animates it up as each new dim completes. Same math the
// done-state uses, so the number the founder sees during analysis is
// consistent with the final one.
//
// New runs display the canonical report valuation when it arrives.
// Historical missing-status results retain the earlier directional projection.

export interface RunningDim {
  key: string;
  score: number | null;
  weight: number;
  label: string;
}

interface Props {
  valuation?: StreamValuation | null;
  valuationStatus?: "pending" | "available" | "unavailable";
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
          // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration read of window.matchMedia (reduced motion) skips the rAF count-up and snaps to the target
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

export function RunningSviHero({ dims, stage, industry, totalCount, running, done, valuationStatus, valuation }: Props) {
  const scored = dims.filter((d): d is RunningDim & { score: number } => d.score !== null);

  const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
  const rawTotal =
    totalWeight > 0
      ? Math.round(scored.reduce((acc, d) => acc + (d.score * d.weight) / totalWeight, 0))
      : 0;
  const animatedSvi = useCountUp(rawTotal);
  // The idle early-return used to sit ABOVE useCountUp. The component renders
  // with zero hooks while nothing is scored and not running, then with one
  // hook the moment `running` flips — which is exactly the transition this
  // component exists for, and React throws "Rendered more hooks than during
  // the previous render" on it. Hooks first, then bail.
  if (scored.length === 0 && !running) return null;
  const showValuation = scored.length >= 3 && valuationStatus === undefined;
  const notEstimable = valuationNotEstimable();

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
        band === "strong" && "border-emerald-300 from-emerald-50/70 to-transparent",
        band === "developing" && "border-amber-300 from-amber-50/70 to-transparent",
        band === "early" && "border-red-300 from-red-50/70 to-transparent",
        band === "pending" && "border-brand-200 from-brand-50/50 to-transparent",
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {running && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-brand-200/40 overflow-hidden">
          <div className="h-full w-1/3 bg-brand-500 motion-safe:animate-[slide_1.8s_ease-in-out_infinite]" />
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-ink-600">
            {done ? "Business SVI" : "Business SVI (running)"}
          </span>
        </div>
        <span className="text-[11px] tabular-nums text-ink-500">
          {scored.length} / {totalCount} dimensions scored
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-3 flex-wrap">
        <span
          className={cn(
            "text-5xl font-bold tabular-nums leading-none tracking-tight",
            band === "strong" && "text-emerald-700",
            band === "developing" && "text-amber-700",
            band === "early" && "text-red-700",
            band === "pending" && "text-muted",
          )}
        >
          {scored.length === 0 ? "—" : animatedSvi}
          {scored.length > 0 && (
            <span className="text-2xl text-ink-500 font-normal">/100</span>
          )}
        </span>
        <span className={cn(
          "text-xs font-medium",
          band === "strong" && "text-emerald-700",
          band === "developing" && "text-amber-700",
          band === "early" && "text-red-700",
          band === "pending" && "text-ink-500",
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
          <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
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
          <p className="text-[10px] tabular-nums text-ink-500">
            {totalWeight}% of SVI weight covered
            {!done && totalWeight < 100 && " — score may shift as remaining dims land"}
          </p>
        </div>
      )}

      {valuationStatus === "available" && valuation && <CanonicalValuation valuation={valuation} />}
      {showValuation && (
        // V04a (D22): no directional range is derived from the running SVI —
        // the company value is "not estimable" until a CFO method can run.
        <div className="mt-4 border-t border-ink-200/60 pt-3" data-testid="running-svi-valuation-not-estimable">
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-600">Company value</p>
          <p className="mt-1 text-sm font-bold text-ink-800">{notEstimable.label}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">{notEstimable.line}</p>
        </div>
      )}
    </div>
  );
}
