"use client";

// SVI Live Meter — small horizontal 0-100 progress bar that polls the
// Startup Package snapshot endpoint every 5s while the wizard is active.
// Idle-off: as soon as `isActive` flips to false the poll cancels so the
// component costs zero once the user leaves the interview screen.
//
// The Nikkei-style SVI is unbounded (baseline 100) but for a live meter we
// clamp to a 0-200 visual band so the founder sees motion without needing
// to reason about elite-tier numbers > 200.

import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SnapshotResponse {
  ok: boolean;
  svi: number | null;
  delta: number | null;
  stage: number | null;
  empty?: boolean;
  reason?: string;
}

export interface SviLiveMeterProps {
  projectId?: string;
  /** Poll while true (default). Turn off when the user leaves the wizard. */
  isActive?: boolean;
  /** Poll interval in ms — default 5000. */
  intervalMs?: number;
  /** Optional pre-seed so the meter renders instantly on first paint. */
  initialSvi?: number | null;
  initialDelta?: number | null;
}

export function SviLiveMeter({
  projectId,
  isActive = true,
  intervalMs = 5000,
  initialSvi = null,
  initialDelta = null,
}: SviLiveMeterProps) {
  const [svi, setSvi] = React.useState<number | null>(initialSvi);
  const [delta, setDelta] = React.useState<number | null>(initialDelta);
  const [stage, setStage] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);

  const fetchOnce = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const res = await fetch(`/api/startup-package/svi-snapshot${qs}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as SnapshotResponse;
      if (data.svi !== null && data.svi !== undefined) setSvi(data.svi);
      if (data.delta !== null && data.delta !== undefined) setDelta(data.delta);
      if (data.stage !== null && data.stage !== undefined) setStage(data.stage);
    } catch {
      // Silent — meter keeps its last-good value.
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    if (!isActive) return;
    void fetchOnce();
    const id = window.setInterval(fetchOnce, Math.max(1000, intervalMs));
    return () => window.clearInterval(id);
  }, [isActive, intervalMs, fetchOnce]);

  const displaySvi = svi ?? 100;
  // Clamp to 0-200 for the horizontal bar. Anything > 200 rendered as full.
  const pct = Math.max(0, Math.min(100, (displaySvi / 200) * 100));

  const deltaLabel =
    delta === null || delta === undefined
      ? null
      : delta === 0
      ? "no change"
      : `${delta > 0 ? "+" : ""}${delta} pts`;

  const DeltaIcon = delta && delta > 0 ? TrendingUp : delta && delta < 0 ? TrendingDown : Minus;
  const deltaTone =
    delta && delta > 0
      ? "text-emerald-400"
      : delta && delta < 0
      ? "text-rose-400"
      : "text-slate-400";

  return (
    <div
      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner"
      aria-live="polite"
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
        <span>SVI (live)</span>
        <span className={`inline-flex items-center gap-1 ${deltaTone}`}>
          <DeltaIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {deltaLabel ?? "waiting for first answer…"}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-slate-100 tabular-nums">
          {svi === null ? "—" : Math.round(displaySvi)}
        </span>
        <span className="text-xs text-slate-500">
          {stage === null ? "no stage yet" : `stage ${stage}`}
        </span>
        {loading && (
          <span
            aria-hidden="true"
            className="ml-auto inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400"
          />
        )}
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={200}
        aria-valuenow={svi ?? 0}
        aria-label="Startup Value Index"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-400 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Each interview answer + agent pass updates this score. The bar caps at
        200 for readability; totals above are unbounded.
      </p>
    </div>
  );
}

export default SviLiveMeter;
