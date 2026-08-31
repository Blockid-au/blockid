"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Users,
  Target,
  Cog,
  TrendingUp,
  Landmark,
  Briefcase,
  Scale,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Dimension metadata ────────────────────────────────────────────────────────

const DIMS: Record<string, { label: string; Icon: LucideIcon; weight: number }> = {
  ftv: { label: "Founder & Team", Icon: Users, weight: 15 },
  mpc: { label: "Market & Problem", Icon: Target, weight: 18 },
  ptd: { label: "Product & Tech", Icon: Cog, weight: 12 },
  tre: { label: "Traction & Revenue", Icon: TrendingUp, weight: 20 },
  cgh: { label: "Cap Table & Governance", Icon: Landmark, weight: 12 },
  iri: { label: "Investor Readiness", Icon: Briefcase, weight: 10 },
  lco: { label: "Legal & Compliance", Icon: Scale, weight: 8 },
  svm: { label: "Strategic Vision & Moat", Icon: Sparkles, weight: 5 },
};

const DIM_KEYS = Object.keys(DIMS);

// ── Types ─────────────────────────────────────────────────────────────────────

type DimStatus = "idle" | "loading" | "complete" | "error";

interface DimState {
  status: DimStatus;
  score: number | null;
  markdown: string | null;
  insights: string[];
  priority: "high" | "medium" | "low" | null;
  errorMsg: string | null;
  expanded: boolean;
}

type SSEEvent =
  | { type: "context"; industry: string; stage: string }
  | { type: "dimension_start"; dimension: string; label: string }
  | {
      type: "dimension_complete";
      dimension: string;
      label: string;
      score: number;
      markdown: string;
      insights: string[];
      priority: "high" | "medium" | "low";
    }
  | { type: "progress"; completed: number; total: number }
  | { type: "done"; totalMs: number }
  | { type: "error"; dimension: string; message: string }
  | { type: "fatal_error"; message: string };

// ── Persistence helpers ───────────────────────────────────────────────────────
// A completed SVI stream costs the founder minutes + provider quota — reload
// mid-flight or right after must not wipe results. Snapshot per-project state
// to localStorage on every dimension_complete + restore on mount if fresh.

const STORAGE_PREFIX = "svi-stream:";
const STORAGE_MAX_AGE_MS = 30 * 60_000; // 30 min

interface PersistedState {
  savedAt: number;
  dimStates: Record<string, DimState>;
  completed: number;
  total: number;
  totalMs: number | null;
  done: boolean;
  industry: string | null;
}

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId || "default"}`;
}

function loadPersisted(projectId: string): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(projectId: string, state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // quota exceeded / disabled — silent
  }
}

function clearPersisted(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(projectId));
  } catch {
    /* no-op */
  }
}

// ── Score colour helpers ──────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return "bg-ink-100 border-ink-200 dark:bg-ink-800 dark:border-ink-700";
  if (score >= 70) return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800";
  if (score >= 40) return "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800";
  return "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800";
}

function scoreBadgeColor(score: number | null): string {
  if (score === null) return "bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-300";
  if (score >= 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  if (score >= 40) return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

function priorityBadge(priority: string | null): string {
  if (priority === "high") return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  if (priority === "medium") return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400";
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-brand-500"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="20 50"
        opacity="0.3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Markdown renderer (lightweight — just handles **bold** and \n\n) ──────────

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split(/\n\n+/);
  return (
    <div className="space-y-2">
      {lines.map((block, i) => {
        // Handle **Heading:** pattern
        const headingMatch = block.match(/^\*\*([^*]+)\*\*/);
        if (headingMatch) {
          const heading = headingMatch[1];
          const rest = block.slice(headingMatch[0].length).replace(/^:\s*/, "");
          return (
            <div key={i}>
              <p className="text-xs font-semibold text-ink-700 dark:text-ink-200">{heading}</p>
              {rest && (
                <p className="text-xs text-ink-600 dark:text-ink-400 mt-0.5 leading-relaxed">
                  {rest}
                </p>
              )}
            </div>
          );
        }
        // Bullet list items starting with -
        if (block.startsWith("- ")) {
          const items = block.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} className="space-y-0.5">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-ink-600 dark:text-ink-400">
                  <span className="mt-1 h-1 w-1 rounded-full bg-ink-400 shrink-0" />
                  {item.slice(2)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-xs text-ink-600 dark:text-ink-400 leading-relaxed">
            {block}
          </p>
        );
      })}
    </div>
  );
}

// ── Single dimension card ─────────────────────────────────────────────────────

function DimCard({
  dimKey,
  state,
  onToggle,
  onRetry,
  canRetry,
}: {
  dimKey: string;
  state: DimState;
  onToggle: (key: string) => void;
  onRetry: (key: string) => void;
  canRetry: boolean;
}) {
  const meta = DIMS[dimKey];

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-300",
        // Scope pulse to a subtle background so the label + spinner stay
        // readable, and skip motion entirely for users with reduced-motion.
        state.status === "loading" && "motion-safe:animate-pulse border-brand-200 bg-brand-50/50 dark:bg-brand-950/20",
        state.status === "idle" && "border-ink-200 bg-white dark:bg-ink-900 dark:border-ink-800",
        // Error uses red + dashed so it never gets mistaken for the amber
        // "medium score" complete state.
        state.status === "error" && "border-red-300 border-dashed bg-red-50 dark:bg-red-950/20 dark:border-red-800",
        state.status === "complete" && scoreColor(state.score),
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <meta.Icon
          className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-800 dark:text-ink-100 truncate">
              {meta.label}
            </span>
            <span className="text-[10px] text-ink-400 dark:text-ink-500 tabular-nums">
              {meta.weight}% weight
            </span>
          </div>

          {/* Status line */}
          {state.status === "idle" && (
            <p className="text-xs text-ink-400 dark:text-ink-500 mt-0.5">Waiting…</p>
          )}
          {state.status === "loading" && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Spinner />
              <span className="text-xs text-brand-600 dark:text-brand-400">Analysing…</span>
            </div>
          )}
          {state.status === "error" && (
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {state.errorMsg ?? "Skipped (rate limited)"}
            </p>
          )}
          {state.status === "complete" && state.score !== null && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                  scoreBadgeColor(state.score),
                )}
              >
                {state.score}/100
              </span>
              {state.priority && (
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                    priorityBadge(state.priority),
                  )}
                >
                  {state.priority} priority
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expand toggle (complete state only) */}
        {state.status === "complete" && (
          <button
            type="button"
            onClick={() => onToggle(dimKey)}
            aria-expanded={state.expanded}
            aria-label={state.expanded ? `Collapse ${meta.label} details` : `View full ${meta.label} details`}
            className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md px-3 text-xs font-medium text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
          >
            {state.expanded ? "Collapse" : "View full"}
          </button>
        )}
        {/* Retry (error state only) — retries just this dimension without
            wiping the other 7 completed scores or burning full API quota. */}
        {state.status === "error" && canRetry && (
          <button
            type="button"
            onClick={() => onRetry(dimKey)}
            aria-label={`Retry ${meta.label} analysis`}
            className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md px-3 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      {/* Insights (always visible when complete) */}
      {state.status === "complete" && state.insights.length > 0 && (
        <div className="px-4 pb-2 space-y-1 animate-in fade-in duration-300">
          {state.insights.slice(0, 2).map((insight, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
              <p className="text-xs text-ink-600 dark:text-ink-400 leading-snug">{insight}</p>
            </div>
          ))}
        </div>
      )}

      {/* Full markdown (expandable) */}
      {state.status === "complete" && state.expanded && state.markdown && (
        <div className="border-t border-ink-100 dark:border-ink-800 px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <SimpleMarkdown text={state.markdown} />
        </div>
      )}
    </div>
  );
}

// ── Sector cohort widget ──────────────────────────────────────────────────────
// Fetches the anonymised sector aggregate published at /api/index/svi and
// tells the founder where they sit — "your SVI 63 vs SaaS median 58, top 42%".
// Anchor validation that costs zero extra AI budget.

interface SectorRow {
  sector: string;
  count: number;
  medianSvi: number;
  p25?: number;
  p50?: number;
  p75?: number;
}

// Linear-interpolate the founder's percentile given the sector's p25/p50/p75.
// Returns null when we don't have enough shape to place them meaningfully.
function computeTopPercent(x: number, row: SectorRow): number | null {
  const p25 = row.p25 ?? null;
  const p50 = row.p50 ?? row.medianSvi ?? null;
  const p75 = row.p75 ?? null;
  if (p50 == null) return null;
  // If the p25/p75 spread is zero (small sample all identical), fall back
  // to "top 50%" if above the median and "bottom 50%" otherwise — coarse
  // but honest.
  if (p25 == null || p75 == null || p25 === p75) {
    return x >= p50 ? 50 : null;
  }
  let percentile: number;
  if (x <= p25) percentile = (x / Math.max(p25, 1)) * 25;
  else if (x <= p50) percentile = 25 + ((x - p25) / (p50 - p25)) * 25;
  else if (x <= p75) percentile = 50 + ((x - p50) / (p75 - p50)) * 25;
  else percentile = Math.min(95, 75 + ((x - p75) / Math.max(p75 * 0.3, 1)) * 25);
  const top = Math.round((100 - percentile) / 5) * 5;
  return Math.max(5, Math.min(95, top));
}

function SectorCohortWidget({ userTotal, industry }: { userTotal: number; industry: string | null }) {
  const [row, setRow] = useState<SectorRow | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!industry) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/index/svi?bucket=sector&format=json");
        if (!res.ok) throw new Error(`http ${res.status}`);
        const body = await res.json() as { data?: SectorRow[]; sectors?: SectorRow[] };
        const arr = body.data ?? body.sectors ?? [];
        const key = industry.toLowerCase().trim();
        const match = arr.find((r) => r.sector?.toLowerCase() === key);
        if (!cancelled) setRow(match ?? null);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [industry]);

  if (!industry || failed) return null;
  if (!row) return null;

  const median = row.medianSvi ?? row.p50 ?? null;
  if (median == null) return null;
  const sectorLabel = row.sector.charAt(0).toUpperCase() + row.sector.slice(1);

  if (row.count < 5) {
    return (
      <p className="text-xs text-ink-500 dark:text-ink-500 border-t border-brand-200/50 dark:border-brand-800/50 pt-3">
        {sectorLabel} sample too small to compare (n={row.count}).
      </p>
    );
  }

  const topPct = computeTopPercent(userTotal, row);
  return (
    <p className="text-xs text-brand-700 dark:text-brand-300 border-t border-brand-200/50 dark:border-brand-800/50 pt-3">
      Your SVI <strong className="font-semibold tabular-nums">{userTotal}</strong>{" "}
      vs {sectorLabel} median{" "}
      <strong className="font-semibold tabular-nums">{Math.round(median)}</strong>
      {topPct !== null && (
        <>
          {" "}— top{" "}
          <strong className="font-semibold tabular-nums">{topPct}%</strong>
        </>
      )}{" "}
      of {row.count} peers
    </p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SviStreamAnalysisProps {
  projectId?: string;
}

export function SviStreamAnalysis({ projectId }: SviStreamAnalysisProps) {
  const [dimStates, setDimStates] = useState<Record<string, DimState>>(() =>
    Object.fromEntries(
      DIM_KEYS.map((k) => [
        k,
        {
          status: "idle",
          score: null,
          markdown: null,
          insights: [],
          priority: null,
          errorMsg: null,
          expanded: false,
        },
      ]),
    ),
  );

  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(8);
  const [done, setDone] = useState(false);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Restore a recent (< 30 min) run on mount so a page refresh mid-analysis
  // or immediately after done doesn't discard the founder's results.
  useEffect(() => {
    const saved = loadPersisted(projectId ?? "");
    if (!saved) return;
    setDimStates(saved.dimStates);
    setCompleted(saved.completed);
    setTotal(saved.total);
    setTotalMs(saved.totalMs);
    setDone(saved.done);
    setIndustry(saved.industry);
    setRestoredFromCache(true);
  }, [projectId]);

  // Snapshot to localStorage whenever a scored dimension lands or we hit done,
  // so the restore-on-mount above has something to hydrate from.
  useEffect(() => {
    const anyComplete = Object.values(dimStates).some((d) => d.status === "complete");
    if (!anyComplete && !done) return;
    savePersisted(projectId ?? "", {
      savedAt: Date.now(),
      dimStates,
      completed,
      total,
      totalMs,
      done,
      industry,
    });
  }, [dimStates, completed, total, totalMs, done, industry, projectId]);

  const updateDim = useCallback(
    (key: string, patch: Partial<DimState>) => {
      setDimStates((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));
    },
    [],
  );

  const toggleExpand = useCallback((key: string) => {
    setDimStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: !prev[key].expanded },
    }));
  }, []);

  const reset = useCallback(() => {
    setDimStates(
      Object.fromEntries(
        DIM_KEYS.map((k) => [
          k,
          {
            status: "idle",
            score: null,
            markdown: null,
            insights: [],
            priority: null,
            errorMsg: null,
            expanded: false,
          },
        ]),
      ),
    );
    setCompleted(0);
    setTotal(8);
    setDone(false);
    setTotalMs(null);
    setFatalError(null);
    setIndustry(null);
    setRestoredFromCache(false);
    clearPersisted(projectId ?? "");
  }, [projectId]);

  const startAnalysis = useCallback(async (dimsFilter?: string[]) => {
    // Full-run: clear all cards. Retry: only touch the cards being re-run so
    // we don't wipe the other 7 completed scores.
    if (dimsFilter && dimsFilter.length > 0) {
      setFatalError(null);
      setDimStates((prev) => {
        const next: Record<string, DimState> = { ...prev };
        for (const k of dimsFilter) {
          next[k] = { ...next[k], status: "loading", errorMsg: null };
        }
        return next;
      });
      setTotal(dimsFilter.length);
      setCompleted(0);
      setDone(false);
    } else {
      reset();
      // Prime every card to "loading" immediately so the grid shows pulsing
      // placeholders during the ~500ms round-trip before the server emits its
      // first dimension_start event — otherwise users stare at 8 idle cards.
      setDimStates((prev) => {
        const primed: Record<string, DimState> = { ...prev };
        for (const k of DIM_KEYS) {
          primed[k] = { ...primed[k], status: "loading" };
        }
        return primed;
      });
    }
    setRunning(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/svi/dimensions/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...(dimsFilter && dimsFilter.length > 0 ? { dims: dimsFilter } : {}),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        setFatalError(`Request failed (${res.status}): ${text.slice(0, 200)}`);
        setRunning(false);
        return;
      }

      if (!res.body) {
        setFatalError("No response stream received");
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newlines (SSE message boundary)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw) as SSEEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case "context":
              setIndustry(event.industry || null);
              break;

            case "dimension_start":
              updateDim(event.dimension, { status: "loading" });
              break;

            case "dimension_complete":
              updateDim(event.dimension, {
                status: "complete",
                score: event.score,
                markdown: event.markdown,
                insights: event.insights,
                priority: event.priority,
              });
              break;

            case "error":
              updateDim(event.dimension, {
                status: "error",
                errorMsg: event.message,
              });
              break;

            case "progress":
              setCompleted(event.completed);
              setTotal(event.total);
              break;

            case "done":
              setDone(true);
              setTotalMs(event.totalMs);
              break;

            case "fatal_error":
              setFatalError(event.message);
              break;
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setFatalError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
    }
  }, [projectId, reset, updateDim]);

  const stopAnalysis = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const retryDim = useCallback((key: string) => {
    void startAnalysis([key]);
  }, [startAnalysis]);

  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4">
        <div aria-live="polite" aria-atomic="true">
          {!running && !done && (
            <p className="text-sm text-ink-600 dark:text-ink-400">
              Run instant AI analysis across all 8 SVI dimensions in parallel — free preview.
            </p>
          )}
          {running && (
            <p className="text-sm text-brand-700 dark:text-brand-400">
              Analysing {completed} of {total} dimensions…
            </p>
          )}
          {done && totalMs !== null && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              All {total} dimensions analysed in {(totalMs / 1000).toFixed(1)}s
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {running && (
            <button
              type="button"
              onClick={stopAnalysis}
              className="inline-flex items-center justify-center min-h-[44px] rounded-lg border border-ink-200 dark:border-ink-700 px-4 text-sm text-ink-600 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={running ? undefined : done ? () => { reset(); void startAnalysis(); } : () => void startAnalysis()}
            disabled={running}
            className={cn(
              "inline-flex items-center justify-center min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900",
              running
                ? "bg-brand-300 text-white cursor-not-allowed opacity-70"
                : "bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md active:scale-95",
            )}
          >
            {running ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Analysing…
              </span>
            ) : done ? (
              "Re-analyse"
            ) : (
              "Analyse All Dimensions"
            )}
          </button>
        </div>
      </div>

      {/* Fatal error */}
      {fatalError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <strong>Error:</strong> {fatalError}
        </div>
      )}

      {/* Restored from cache — lets the founder know these numbers are from
          an earlier run and give them one click to start fresh instead. */}
      {restoredFromCache && !running && (
        <div className="rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20 px-4 py-2.5 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-300">
          <span className="text-brand-700 dark:text-brand-300">
            Showing your most recent analysis. Re-analyse to refresh.
          </span>
          <button
            type="button"
            onClick={() => { reset(); }}
            className="inline-flex items-center justify-center min-h-[32px] rounded-md px-3 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Progress bar (visible once started) */}
      {(running || done) && !fatalError && (
        <div className="space-y-1.5 animate-in fade-in duration-300">
          <div className="flex justify-between text-xs text-ink-500 dark:text-ink-400">
            <span>{completed}/{total} dimensions complete</span>
            <span>{progressPct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`SVI analysis progress: ${completed} of ${total} dimensions`}
            className="h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden"
          >
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Dimension cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DIM_KEYS.map((key) => (
          <DimCard
            key={key}
            dimKey={key}
            state={dimStates[key]}
            onToggle={toggleExpand}
            onRetry={retryDim}
            canRetry={!running}
          />
        ))}
      </div>

      {/* Done summary — weighted total + fastest-lift callout */}
      {done && !fatalError && (() => {
        const scored = DIM_KEYS
          .map((k) => ({
            key: k,
            score: dimStates[k].score,
            weight: DIMS[k].weight,
            label: DIMS[k].label,
          }))
          .filter((d): d is { key: string; score: number; weight: number; label: string } =>
            d.score !== null,
          );
        if (scored.length === 0) return null;
        const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
        const weightedTotal = scored.reduce(
          (acc, d) => acc + (d.score * d.weight) / totalWeight,
          0,
        );
        const totalSvi = Math.round(weightedTotal);
        const totalBand: "strong" | "developing" | "early" =
          totalSvi >= 70 ? "strong" : totalSvi >= 40 ? "developing" : "early";
        // "Fastest lift" = the two scored-lowest dimensions weighted by
        // impact so improving them moves the total SVI the most.
        const weakest = [...scored]
          .sort((a, b) => (a.score - b.score) || (b.weight - a.weight))
          .slice(0, 2);
        return (
          <div className="rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-800 px-5 py-4 space-y-3 animate-in fade-in duration-300">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300 font-semibold">
                Current SVI
              </span>
              <span
                className={cn(
                  "text-3xl font-bold tabular-nums",
                  totalBand === "strong" && "text-emerald-700 dark:text-emerald-300",
                  totalBand === "developing" && "text-amber-700 dark:text-amber-300",
                  totalBand === "early" && "text-red-700 dark:text-red-300",
                )}
                aria-label={`Weighted SVI total ${totalSvi} out of 100`}
              >
                {totalSvi}
                <span className="text-lg text-ink-500 dark:text-ink-400 font-normal">/100</span>
              </span>
              <span className="text-xs text-ink-500 dark:text-ink-400">
                weighted from {scored.length} of {DIM_KEYS.length} dimensions
              </span>
            </div>
            {/* Band legend — spells out what colour means so a founder isn't
                left guessing what "amber" or "green" implies about fundability. */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]" aria-label="Score band legend">
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 border transition-all",
                totalBand === "early"
                  ? "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/40 dark:border-red-500 dark:text-red-200 font-semibold"
                  : "bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500",
              )}>
                0–39 · Early
              </span>
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 border transition-all",
                totalBand === "developing"
                  ? "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:border-amber-500 dark:text-amber-200 font-semibold"
                  : "bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500",
              )}>
                40–69 · Developing
              </span>
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 border transition-all",
                totalBand === "strong"
                  ? "bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-500 dark:text-emerald-200 font-semibold"
                  : "bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500",
              )}>
                70–100 · Investor-ready
              </span>
            </div>
            {weakest.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-600 dark:text-ink-400 font-semibold">
                  Fastest way to lift your score
                </p>
                <ul className="space-y-1">
                  {weakest.map((w) => (
                    <li
                      key={w.key}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-ink-700 dark:text-ink-300">
                        <span className="font-medium">{w.label}</span>{" "}
                        <span className="text-ink-500 dark:text-ink-400 tabular-nums">
                          ({w.score}/100 · {w.weight}% weight)
                        </span>
                      </span>
                      <a
                        href={`/workspace/svi-evidence?dim=${w.key}`}
                        className="inline-flex items-center justify-center min-h-[36px] rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-50 dark:focus-visible:ring-offset-brand-950 transition-colors"
                      >
                        Add evidence
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SectorCohortWidget userTotal={totalSvi} industry={industry} />
          </div>
        );
      })()}
    </div>
  );
}
