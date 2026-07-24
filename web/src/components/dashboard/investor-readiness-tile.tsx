"use client";

// InvestorReadinessTile — per-phase readiness surfacing (P5a-tile).
//
// Data source: GET /api/nudge/next-steps → NudgeResult
//   - result.current_phase.slug     → which phase the founder is in
//   - result.readiness_by_phase[k]  → { score, band, missing_top3 } per phase
//   - result.readiness_score        → blended sub-scores fallback (legacy)
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P5a — switch tile to consume readiness_by_phase[currentPhase] instead
//   of the blended sub_scores tuple; a 12-phase mini-chart replaces the
//   five-dimension bars so the founder sees the whole journey plus their
//   current standing at a glance.
//
// Mounted at web/src/app/dashboard/svi/page.tsx alongside <NextStepTile />
// (P5b — shipped 2026-07-24).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ALL_PHASE_SLUGS,
  bandOf,
  buildPhaseSeries,
  colourFor,
  PHASE_BAND_CLASS,
  pickPhaseEntry,
  pickWeakest,
  safeScore,
  SUB_SCORE_LABELS,
  SUB_SCORE_ORDER,
  type PhaseMissingItem,
  type PhaseReadinessLike,
  type PhaseSeriesPoint,
  type ReadinessBand,
  type ReadinessLike,
  type SubScoreKey,
} from "./investor-readiness-tile.helpers";

interface NudgeCurrentPhase {
  slug: string;
  label: string;
}

type NudgeResult = {
  current_phase?: NudgeCurrentPhase;
  readiness_score: ReadinessLike;
  readiness_by_phase?: Record<string, PhaseReadinessLike>;
};

type ApiResponse = {
  ok: boolean;
  result?: NudgeResult;
  meta?: { afsl_disclaimer?: string };
  error?: string;
};

// Per-band label the tile chip renders. "warming up" (with a space) matches
// the legacy blended-view UX; phase-view bands mirror the same wording.
const BAND_LABEL: Record<ReadinessBand, string> = {
  "investor-ready": "investor-ready",
  "warming-up": "warming up",
  "not-ready": "not ready",
};

// "How to improve" pointer per legacy sub-score. Retained for the fallback
// view when readiness_by_phase is absent (older API responses / not-started
// projects). Copy stays action-oriented and non-advisory (Corps Act s766B).
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
        result: NudgeResult;
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
          {ALL_PHASE_SLUGS.map((k) => (
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

  const { result, disclaimer } = state;
  const currentPhaseSlug = result.current_phase?.slug;
  const phaseEntry = pickPhaseEntry(result.readiness_by_phase, currentPhaseSlug);

  return (
    <div
      data-testid="investor-readiness-tile"
      data-state="ready"
      data-view={phaseEntry ? "per-phase" : "blended"}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
    >
      {phaseEntry ? (
        <PerPhaseView
          entry={phaseEntry}
          currentPhaseSlug={currentPhaseSlug ?? null}
          phaseLabel={result.current_phase?.label}
          byPhase={result.readiness_by_phase ?? {}}
        />
      ) : (
        <BlendedView
          readiness={result.readiness_score}
          phaseLabel={result.current_phase?.label}
        />
      )}

      {disclaimer && (
        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
          {disclaimer}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-phase view (P5a — primary)
// ---------------------------------------------------------------------------

function PerPhaseView({
  entry,
  currentPhaseSlug,
  phaseLabel,
  byPhase,
}: {
  entry: PhaseReadinessLike;
  currentPhaseSlug: string | null;
  phaseLabel: string | undefined;
  byPhase: Record<string, PhaseReadinessLike>;
}) {
  const score = safeScore(entry.score);
  const bandKlass = PHASE_BAND_CLASS[entry.band];
  const bandLabel = BAND_LABEL[entry.band];
  const series = buildPhaseSeries(byPhase, currentPhaseSlug);
  const missing = entry.missing_top3 ?? [];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Investor readiness
          </p>
          {(phaseLabel || currentPhaseSlug) && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {phaseLabel
                ? `Phase ${currentPhaseSlug ?? ""} · ${phaseLabel}`.trim()
                : `Phase ${currentPhaseSlug}`}
            </p>
          )}
        </div>
        <span
          data-testid="investor-readiness-band"
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bandKlass}`}
        >
          {bandLabel}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          data-testid="investor-readiness-overall"
          className="text-4xl font-bold text-slate-900 dark:text-slate-100"
        >
          {score}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          / 100
        </span>
      </div>

      <PhaseSeriesChart series={series} />

      <MissingList missing={missing} phaseSlug={currentPhaseSlug} />
    </>
  );
}

function PhaseSeriesChart({ series }: { series: PhaseSeriesPoint[] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Readiness across phases
      </p>
      <div
        role="list"
        data-testid="investor-readiness-phase-series"
        className="flex items-end gap-1"
      >
        {series.map((pt) => (
          <div
            key={pt.slug}
            role="listitem"
            data-key={pt.slug}
            data-value={pt.score}
            data-current={pt.isCurrent ? "true" : "false"}
            className="flex flex-1 flex-col items-center gap-1"
            title={`Phase ${pt.slug} · ${pt.score}/100 · ${pt.band}`}
          >
            <svg
              className="h-16 w-full"
              viewBox="0 0 10 100"
              preserveAspectRatio="none"
              aria-label={`Phase ${pt.slug} readiness ${pt.score} of 100`}
            >
              <rect
                x={0}
                y={0}
                width={10}
                height={100}
                fill="currentColor"
                opacity={0.08}
                rx={1}
              />
              <rect
                x={0}
                y={100 - pt.score}
                width={10}
                height={pt.score}
                fill={colourFor(pt.score)}
                rx={1}
              />
              {pt.isCurrent && (
                <rect
                  x={0}
                  y={0}
                  width={10}
                  height={100}
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth={1}
                  rx={1}
                />
              )}
            </svg>
            <span
              className={`text-[10px] tabular-nums ${
                pt.isCurrent
                  ? "font-semibold text-indigo-600 dark:text-indigo-300"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {pt.slug}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissingList({
  missing,
  phaseSlug,
}: {
  missing: readonly PhaseMissingItem[];
  phaseSlug: string | null;
}) {
  if (!missing || missing.length === 0) {
    return (
      <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
        <p
          data-testid="investor-readiness-missing-empty"
          className="text-sm text-slate-600 dark:text-slate-400"
        >
          Nothing missing at this phase — keep the evidence fresh and step
          into the next phase when ready.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Top {missing.length} missing{phaseSlug ? ` for Phase ${phaseSlug}` : ""}
      </p>
      <ul
        role="list"
        data-testid="investor-readiness-missing"
        className="space-y-2"
      >
        {missing.map((item) => (
          <li
            key={`${item.category}::${item.title}`}
            data-raise-blocker={item.raise_blocker ? "true" : "false"}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                {item.raise_blocker && (
                  <span
                    aria-label="raise blocker"
                    className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                  >
                    Blocker
                  </span>
                )}
                <span className="truncate font-medium">{item.title}</span>
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {item.category}
              </p>
            </div>
            <Link
              href={item.cta_url}
              className="shrink-0 rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blended view (fallback for older API responses without readiness_by_phase)
// ---------------------------------------------------------------------------

function BlendedView({
  readiness,
  phaseLabel,
}: {
  readiness: ReadinessLike;
  phaseLabel: string | undefined;
}) {
  const overall = safeScore(readiness.overall);
  const band = bandOf(overall);
  const weakest = pickWeakest(readiness.sub_scores);
  const hint = IMPROVE_HINTS[weakest];

  return (
    <>
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
    </>
  );
}

export default InvestorReadinessTile;
