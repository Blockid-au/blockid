"use client";

// Dashboard tile — fetches the founder's nudge from /api/nudge/next-steps
// and renders current phase, single next action, top-3 missing items, and
// a readiness donut. Contract: docs/plans/atlassian-standard-mapping-goal.md §3.6.

import { useEffect, useState } from "react";
import Link from "next/link";

type NextAction = {
  title: string;
  reason: string;
  cta_url: string;
  cta_label: string;
  category: "dataroom" | "svi_evidence" | "phase_advance" | "compliance";
};

type MissingItem = {
  category: string;
  title: string;
  phase_slug: string;
  why_it_matters: string;
  raise_blocker: boolean;
  cta_url: string;
};

type Readiness = {
  overall: number;
  sub_scores: {
    market: number;
    team: number;
    tech: number;
    financial: number;
    compliance: number;
  };
};

type NudgeResult = {
  current_phase: {
    slug: string;
    label: string;
    label_vi: string;
    canonical_stage: string;
    growth_phase_id: string;
    phase_order: number;
  };
  next_action: NextAction;
  missing: MissingItem[];
  readiness_score: Readiness;
  nudge_reason: string;
  next_step_confidence: "high" | "medium" | "low";
};

type ApiResponse = {
  ok: boolean;
  result?: NudgeResult;
  meta?: { afsl_disclaimer?: string };
  error?: string;
};

export function NextStepTile() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "ready"; result: NudgeResult; disclaimer?: string }
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
      if (!body.ok || !body.result) {
        setState({ kind: "error", error: body.error ?? "unknown_error" });
        return;
      }
      setState({
        kind: "ready",
        result: body.result,
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
    // no dependency array intentionally — mount-only fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading") {
    return (
      <div
        data-testid="next-step-tile"
        data-state="loading"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="mb-3 h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mb-2 h-6 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mb-4 h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-24 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-900" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        data-testid="next-step-tile"
        data-state="error"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950/40"
      >
        <p className="mb-2 font-medium text-rose-800 dark:text-rose-200">
          Nudge unavailable
        </p>
        <p className="mb-3 text-rose-700 dark:text-rose-300">{state.error}</p>
        <button
          type="button"
          onClick={load}
          data-testid="next-step-retry"
          className="rounded border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const { result, disclaimer } = state;
  const { current_phase, next_action, missing, readiness_score, nudge_reason } =
    result;
  const top3 = missing.slice(0, 3);

  return (
    <div
      data-testid="next-step-tile"
      data-state="ready"
      data-phase-slug={current_phase.slug}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
    >
      {/* Header — phase pill + readiness donut */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              data-testid="next-step-phase"
              data-phase-slug={current_phase.slug}
              className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200"
            >
              Phase {current_phase.slug} · {current_phase.label}
            </span>
          </div>
          <h3
            data-testid="next-step-action-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {next_action.title}
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {next_action.reason}
          </p>
          <Link
            href={next_action.cta_url}
            data-testid="next-step-action-cta"
            data-category={next_action.category}
            className="mt-3 inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {next_action.cta_label}
          </Link>
        </div>
        <ReadinessDonut score={readiness_score.overall} />
      </div>

      {/* Top-3 missing items */}
      {top3.length > 0 && (
        <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Missing for this phase
          </p>
          <ul data-testid="next-step-missing" className="space-y-1.5">
            {top3.map((item) => (
              <li
                key={`${item.category}::${item.title}`}
                data-raise-blocker={item.raise_blocker ? "true" : "false"}
                data-category={item.category}
                className="text-sm"
              >
                <Link
                  href={item.cta_url}
                  className="flex items-start gap-2 text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                >
                  {item.raise_blocker && (
                    <span
                      title="Raise-blocker"
                      className="mt-0.5 inline-flex h-1.5 w-1.5 flex-none rounded-full bg-rose-500"
                    />
                  )}
                  <span className="flex-1">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reason + AFSL disclaimer */}
      <p className="border-t border-slate-100 pt-3 text-xs italic text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {nudge_reason}
      </p>
      {disclaimer && (
        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
          {disclaimer}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG readiness donut — pure inline SVG so it renders in the CSP.
// ---------------------------------------------------------------------------

function ReadinessDonut({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 26;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const colour =
    clamped >= 75
      ? "#22c55e"
      : clamped >= 50
        ? "#eab308"
        : "#ef4444";

  return (
    <div className="flex flex-col items-center">
      <svg
        width={64}
        height={64}
        viewBox="0 0 64 64"
        className="-rotate-90"
        aria-label={`Readiness ${clamped} of 100`}
      >
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={stroke}
        />
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        data-testid="next-step-readiness-score"
        className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200"
      >
        {clamped}
      </span>
      <span className="text-[10px] text-slate-500 dark:text-slate-400">
        readiness
      </span>
    </div>
  );
}

export default NextStepTile;
