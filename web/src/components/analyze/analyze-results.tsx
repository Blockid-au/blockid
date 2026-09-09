"use client";

// AnalyzeResults — composes the final /analyze results page:
//   StageBanner
//     → SviScoreRing
//     → SVIRadarChart
//     → SVIValuation
//     → TopGapsList (new)
//     → PrioritisedActions (new)
//     → AgentFindings accordion (new)
//     → SviReportPdf export link
//
// Downstream heavy-weight components are imported dynamically so the
// /analyze route stays snappy while the stream is still running.

import * as React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { computeSVI, type SVIAnalysis } from "@/lib/svi-analysis";
import type { AgentRole } from "@/lib/report-pipeline/types";
import { sviStageToCanonical, type StageKey } from "@/lib/journey-vocabulary";
import { StageBanner, type StageSignal } from "./stage-banner";
import { SviScoreRing } from "@/components/svi/svi-score-ring";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Target,
  Wrench,
} from "lucide-react";

const SVIRadarChart = dynamic(
  () => import("@/components/svi/svi-radar-chart").then((m) => m.SVIRadarChart),
  { ssr: false, loading: () => null },
);
const SVIValuation = dynamic(
  () => import("@/components/svi/svi-valuation").then((m) => m.SVIValuation),
  { ssr: false, loading: () => null },
);

export interface AgentFinding {
  agent: AgentRole;
  headline: string;
  bullets: string[];
}

export interface GapItem {
  dimension: string;
  label: string;
  severity: "high" | "medium" | "low";
  detail?: string;
}

export interface PrioritisedAction {
  title: string;
  detail: string;
  priority: "P0" | "P1" | "P2";
  effort?: string;
}

export interface RadarDimension {
  label: string;
  key: string;
  value: number;
}

export interface AnalyzeResultsProps {
  stage?: StageKey;
  stageSignals?: StageSignal[];
  score?: number;
  analysis?: SVIAnalysis;
  radar?: RadarDimension[];
  gaps?: GapItem[];
  actions?: PrioritisedAction[];
  findings?: AgentFinding[];
  pdfHref?: string;
  onOverrideStage?: () => void;
  /**
   * When an /api/intake result is available, the panel derives every
   * downstream field (stage, score, radar, gaps, actions) from it via
   * `computeSVI(intake.signals)` — no fake placeholders. Explicit props
   * still win (allows a live SSE feed to overwrite the derived values).
   */
  intake?: IntakeResult;
  className?: string;
}

/**
 * Local dimension metadata mirroring the /api/svi/dimensions/stream metadata
 * so the radar chart can label bars without pulling the server-only module.
 */
const DIM_LABEL: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

// The area of the reader's business each finding came from — not our internal
// role names. A founder reading "CHRO" or "CDO" is being shown our org chart;
// "Team & people" tells them which lens produced the finding, which is the part
// they can act on.
const AGENT_LABEL: Record<AgentRole, string> = {
  ceo: "Strategy",
  cto: "Technology",
  cfo: "Finances & valuation",
  cpo: "Product",
  cmo: "Market & customers",
  cro: "Revenue & growth",
  clo: "Legal & compliance",
  chro: "Team & people",
  ciso: "Security",
  cdo: "Data",
  coo: "Operations",
};

const SEVERITY_STYLE: Record<GapItem["severity"], string> = {
  high: "border-bear bg-bear/10 text-bear",
  medium: "border-warn bg-warn/10 text-warn",
  low: "border-line-subtle bg-surface text-secondary",
};

const PRIORITY_STYLE: Record<PrioritisedAction["priority"], string> = {
  P0: "bg-bear text-white",
  P1: "bg-warn text-white",
  P2: "bg-action text-on-action",
};

function TopGapsList({ gaps }: { gaps: GapItem[] }) {
  return (
    <section
      aria-labelledby="analyze-gaps-heading"
      className="rounded-2xl border border-line-subtle bg-surface-raised p-4"
      data-testid="analyze-gaps"
    >
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-bear" aria-hidden />
        <h3
          id="analyze-gaps-heading"
          className="text-sm font-semibold text-primary"
        >
          Top gaps
        </h3>
      </div>
      {gaps.length === 0 ? (
        <p className="text-xs italic text-muted">No gaps flagged yet.</p>
      ) : (
        <ul className="space-y-2">
          {gaps.slice(0, 5).map((g, i) => (
            <li
              key={`${g.dimension}-${i}`}
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs",
                SEVERITY_STYLE[g.severity],
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold uppercase tracking-wider">
                  {g.label}
                </span>
                <span className="text-[10px] uppercase tracking-wider">
                  {g.severity}
                </span>
              </div>
              {g.detail && <p className="text-secondary">{g.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PrioritisedActions({ actions }: { actions: PrioritisedAction[] }) {
  return (
    <section
      aria-labelledby="analyze-actions-heading"
      className="rounded-2xl border border-line-subtle bg-surface-raised p-4"
      data-testid="analyze-actions"
    >
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-action" aria-hidden />
        <h3
          id="analyze-actions-heading"
          className="text-sm font-semibold text-primary"
        >
          Prioritised next actions
        </h3>
      </div>
      {actions.length === 0 ? (
        <p className="text-xs italic text-muted">
          Actions will appear once the CEO agent synthesises the findings.
        </p>
      ) : (
        <ol className="space-y-2">
          {actions.map((a, i) => (
            <li
              key={`${a.title}-${i}`}
              className="rounded-lg border border-line-subtle bg-surface p-3 text-xs"
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    PRIORITY_STYLE[a.priority],
                  )}
                >
                  {a.priority}
                </span>
                <span className="font-semibold text-primary">{a.title}</span>
                {a.effort && (
                  <span className="ml-auto text-tertiary">· {a.effort}</span>
                )}
              </div>
              <p className="text-secondary">{a.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AgentFindings({ findings }: { findings: AgentFinding[] }) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  return (
    <section
      aria-labelledby="analyze-findings-heading"
      className="rounded-2xl border border-line-subtle bg-surface-raised p-4"
      data-testid="analyze-findings"
    >
      <h3
        id="analyze-findings-heading"
        className="mb-3 text-sm font-semibold text-primary"
      >
        What we looked at
      </h3>
      {findings.length === 0 ? (
        <p className="text-xs italic text-muted">
          Findings appear as each area is assessed.
        </p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {findings.map((f, i) => {
            const open = openIdx === i;
            return (
              <li key={`${f.agent}-${i}`}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="flex w-full items-center gap-2 py-2 text-left"
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown
                      className="h-3.5 w-3.5 text-tertiary"
                      aria-hidden
                    />
                  ) : (
                    <ChevronRight
                      className="h-3.5 w-3.5 text-tertiary"
                      aria-hidden
                    />
                  )}
                  <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                    {AGENT_LABEL[f.agent]}
                  </span>
                  <span className="text-sm text-primary">{f.headline}</span>
                </button>
                {open && (
                  <div className="pb-3 pl-6 pr-2 text-xs text-secondary">
                    <ul className="space-y-1">
                      {f.bullets.map((b, j) => (
                        <li key={`${b}-${j}`}>· {b}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function AnalyzeResults({
  stage,
  stageSignals,
  score,
  analysis,
  radar,
  gaps,
  actions,
  findings,
  pdfHref,
  onOverrideStage,
  intake,
  className,
}: AnalyzeResultsProps) {
  // ── Derive analysis from intake when no explicit analysis was passed ──
  // computeSVI is a pure function of the extracted signals — safe to run
  // client-side. This gives the founder the real dimension breakdown,
  // strengths and gaps immediately after intake, without waiting for the
  // deep-dive /api/svi/dimensions/stream job.
  const derivedAnalysis: SVIAnalysis | undefined = React.useMemo(() => {
    if (analysis) return analysis;
    if (!intake) return undefined;
    try {
      return computeSVI(intake.signals);
    } catch {
      return undefined;
    }
  }, [analysis, intake]);

  const effectiveStage: StageKey =
    stage ??
    (intake?.context
      ? sviStageToCanonical(intake.context.stage)
      : derivedAnalysis
        ? sviStageToCanonical(derivedAnalysis.stage)
        : "idea");

  const effectiveScore =
    typeof score === "number"
      ? score
      : derivedAnalysis?.totalSVI ?? 100;

  const effectiveRadar: RadarDimension[] =
    radar ??
    (derivedAnalysis?.subs.map((s) => ({
      key: s.key,
      label: DIM_LABEL[s.key] ?? s.label,
      value: Math.round(s.value),
    })) ??
      []);

  const effectiveGaps: GapItem[] =
    gaps ??
    (derivedAnalysis?.evidenceGaps ?? []).slice(0, 5).map((g) => ({
      dimension: g.evidenceType,
      label: g.label,
      severity:
        g.priority === "P0" ? "high" : g.priority === "P1" ? "medium" : "low",
      detail: g.action,
    }));

  const effectiveActions: PrioritisedAction[] =
    actions ??
    (derivedAnalysis?.nextActions ?? []).map((a) => ({
      title: a.title,
      detail: a.detail,
      priority: a.priority,
      effort: a.impact,
    }));

  const effectiveFindings: AgentFinding[] =
    findings ??
    (derivedAnalysis?.subs ?? [])
      .filter((s) => s.evidence.length > 0 || s.gaps.length > 0)
      .slice(0, 4)
      .map<AgentFinding>((s) => ({
        // Heuristic mapping SVI dimension → responsible agent for the
        // findings accordion. Not authoritative — swapped when the real
        // per-agent findings arrive from the deep-dive stream.
        agent:
          s.key === "ftv" || s.key === "cgh"
            ? "chro"
            : s.key === "mpc" || s.key === "svm"
              ? "cmo"
              : s.key === "ptd"
                ? "cto"
                : s.key === "tre"
                  ? "cfo"
                  : s.key === "iri"
                    ? "ceo"
                    : "clo",
        headline: `${DIM_LABEL[s.key] ?? s.label}: ${Math.round(s.value)}/100`,
        bullets: [
          ...s.evidence.slice(0, 3),
          ...s.gaps.slice(0, 2).map((g) => `Gap: ${g}`),
        ],
      }));

  return (
    <div
      className={cn("flex w-full flex-col", className)}
      data-testid="analyze-results"
    >
      <StageBanner
        stage={effectiveStage}
        confidence={derivedAnalysis?.confidenceMultiplier}
        signals={stageSignals}
        onOverride={onOverrideStage}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:grid-cols-[auto_1fr] sm:gap-6">
          <SviScoreRing score={effectiveScore} />
          <div>
            <h1 className="text-xl font-semibold text-primary sm:text-2xl">
              Your Startup Value Index
            </h1>
            <p className="mt-1 text-sm text-muted">
              Score computed from the evidence in your input, benchmarked to
              AU startups at the same stage.
            </p>
            {pdfHref && (
              <a
                href={pdfHref}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action hover:bg-action-hover"
                data-testid="analyze-pdf-link"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download PDF
              </a>
            )}
          </div>
        </div>

        {effectiveRadar.length > 0 && <SVIRadarChart dimensions={effectiveRadar} />}
        {derivedAnalysis && <SVIValuation analysis={derivedAnalysis} />}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopGapsList gaps={effectiveGaps} />
          <PrioritisedActions actions={effectiveActions} />
        </div>

        <AgentFindings findings={effectiveFindings} />
      </div>
    </div>
  );
}

export default AnalyzeResults;
