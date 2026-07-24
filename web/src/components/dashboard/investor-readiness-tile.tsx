"use client";

// InvestorReadinessTile — surfaces the 5-dimension readiness score returned
// by GET /api/nudge/next-steps (docs/plans/atlassian-standard-mapping-goal.md
// §3 + §P5_investor_readiness_score). Ships the *investor-readiness* slice
// only — a companion tile to <NextStepTile />, not a replacement.
//
// Renders:
//   - Overall band + numeric score, prominently.
//   - Five inline-SVG bars (market / team / tech / financial / compliance).
//   - A "How to improve" hint keyed off the lowest sub-score.
//
// The chart is a bar chart (not a radar) intentionally — bars beat radar
// for accurate comparison of similar magnitudes (dataviz form heuristic).
//
// Mount inside <WidgetGrid /> at web/src/app/dashboard/svi/page.tsx if a
// slot exists (defer wiring — this file is safe-zone only per Round 6
// task brief; the sibling agent owns the dashboard shell layout).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  bandOf,
  colourFor,
  pickWeakest,
  safeScore,
  SUB_SCORE_LABELS,
  SUB_SCORE_ORDER,
  type ReadinessLike,
  type SubScoreKey,
} from "./investor-readiness-tile.helpers";

type NudgeResult = {
  readiness_score: ReadinessLike;
  current_phase?: { slug: string; label: string };
};

type ApiResponse = {
  ok: boolean;
  result?: NudgeResult;
  meta?: { afsl_disclaimer?: string };
  error?: string;
};

// "How to improve" pointer per sub-score. Copy stays action-oriented and
// non-advisory — no personal-advice-shaped text (Corps Act s766B boundary).
const IMPROVE_HINTS: Record<
  SubScoreKey,
  { title: string; cta: string; href: string }
> = {
  market: {
    title: "Grow the Market evidence pack",
    cta: "Open Market SVI evidence",
    href: "/dashboard/svi#dim-market",
  },
  team: {
    title: "Fill the Team dimension",
    cta: "Open Team dashboard",
    href: "/dashboard/team",
  },
  tech: {
    title: "Ship a Tech signal",
    cta: "Wire GitHub / repo signals",
    href: "/dashboard/integrations",
  },
  financial: {
    title: "Sharpen Financial projections",
    cta: "Open the finance workspace",
    href: "/dashboard/finance",
  },
  compliance: {
    title: "Close a Compliance gap",
    cta: "Open the compliance panel",
    href: "/dashboard/data-room",
  },
};

export function InvestorReadinessTile() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | {
        kind: "ready";
        readiness: ReadinessLike;
        phaseLabel?: string;
        disclaimer?: string;
      }
  >({ kind: "loading" });

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/nudge/next-steps", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setState({ kind: "error", error: `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as ApiResponse;
      if (!body.ok || !body.result?.readiness_score) {
        setState({
          kind: "error",
          error: body.error ?? "no_readiness_payload",
        });
        return;
      }
      setState({
        kind: "ready",
        readiness: body.result.readiness_score,
        phaseLabel: body.result.current_phase?.label,
        disclaimer: body.meta?.afsl_disclaimer,
      });
    } catch (err) {
      setState({
        kind: "error",
        error: err instanceof Error ? err.message : "fetch_failed",
      });
    }
  }

  useEffect(() => {
    load();
    // mount-only fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading") {
    return (
      <div
        data-testid="investor-readiness-tile"
        data-state="loading"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mb-4 h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="space-y-2">
          {SUB_SCORE_ORDER.map((k) => (
            <div
              key={k}
              className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-900"
            />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        data-testid="investor-readiness-tile"
        data-state="error"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950/40"
      >
        <p className="mb-2 font-medium text-rose-800 dark:text-rose-200">
          Readiness unavailable
        </p>
        <p className="mb-3 text-rose-700 dark:text-rose-300">{state.error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const { readiness, phaseLabel, disclaimer } = state;
  const overall = safeScore(readiness.overall);
  const band = bandOf(overall);
  const weakest = pickWeakest(readiness.sub_scores);
  const hint = IMPROVE_HINTS[weakest];

  return (
    <div
      data-testid="investor-readiness-tile"
      data-state="ready"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Investor readiness
          </p>
          {phaseLabel && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {phaseLabel}
            </p>
          )}
        </div>
        <span
          data-testid="investor-readiness-band"
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${band.klass}`}
        >
          {band.label}
        </span>
      </div>

      {/* Overall score */}
      <div className="flex items-baseline gap-2">
        <span
          data-testid="investor-readiness-overall"
          className="text-4xl font-bold text-slate-900 dark:text-slate-100"
        >
          {overall}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          / 100
        </span>
      </div>

      {/* 5-bar chart (inline SVG, no lib) */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Sub-scores
        </p>
        <div
          role="list"
          data-testid="investor-readiness-bars"
          className="space-y-2"
        >
          {SUB_SCORE_ORDER.map((key) => {
            const v = safeScore(readiness.sub_scores[key]);
            return (
              <div
                key={key}
                role="listitem"
                data-key={key}
                data-value={v}
                className="flex items-center gap-3"
              >
                <span className="w-20 text-xs font-medium text-slate-600 dark:text-slate-400">
                  {SUB_SCORE_LABELS[key]}
                </span>
                <svg
                  className="h-3 flex-1"
                  viewBox="0 0 100 6"
                  preserveAspectRatio="none"
                  aria-label={`${SUB_SCORE_LABELS[key]} ${v} of 100`}
                >
                  <rect
                    x={0}
                    y={0}
                    width={100}
                    height={6}
                    fill="currentColor"
                    opacity={0.08}
                    rx={1}
                  />
                  <rect
                    x={0}
                    y={0}
                    width={v}
                    height={6}
                    fill={colourFor(v)}
                    rx={1}
                  />
                </svg>
                <span className="w-8 text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {v}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* How to improve — pointer only, no personal advice */}
      <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          How to improve
        </p>
        <p
          data-testid="investor-readiness-hint"
          className="text-sm text-slate-700 dark:text-slate-300"
        >
          Weakest dimension:{" "}
          <span className="font-semibold">{SUB_SCORE_LABELS[weakest]}</span> —{" "}
          {hint.title}.
        </p>
        <Link
          href={hint.href}
          className="mt-2 inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {hint.cta}
        </Link>
      </div>

      {disclaimer && (
        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
          {disclaimer}
        </p>
      )}
    </div>
  );
}

export default InvestorReadinessTile;
