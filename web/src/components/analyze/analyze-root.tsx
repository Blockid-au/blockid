"use client";

// AnalyzeRoot — the /analyze route's client-side state machine.
//
// Phases:
//   1. INTAKE  — user drops a deck / pastes a URL / types an idea.
//   2. CONFIRM — after fast classify, show the AnalyzeCostModal.
//   3. LIVE    — pick the variant panel + tail the SSE event stream
//                (deck reader / site visitor / idea lab).
//   4. RESULTS — StageBanner + SviScoreRing + gaps + actions + findings.
//
// The heavy live-analysis + results components are lazy-loaded so the
// initial /analyze paint stays fast.

import * as React from "react";
import dynamic from "next/dynamic";
import { SmartIntake, type SmartIntakeSubmission } from "./smart-intake";
import { AnalyzeCostModal, type CostRow } from "./analyze-cost-modal";
import type { StageKey } from "@/lib/journey-vocabulary";
import { plannedAgentsFor } from "@/lib/analyze/agent-plan";

const LiveAnalysisStage = dynamic(
  () => import("./live-analysis-stage").then((m) => m.LiveAnalysisStage),
  { ssr: false },
);
const DeckReaderPanel = dynamic(
  () => import("./deck-reader-panel").then((m) => m.DeckReaderPanel),
  { ssr: false },
);
const SiteVisitorPanel = dynamic(
  () => import("./site-visitor-panel").then((m) => m.SiteVisitorPanel),
  { ssr: false },
);
const IdeaLabPanel = dynamic(
  () => import("./idea-lab-panel").then((m) => m.IdeaLabPanel),
  { ssr: false },
);

type Phase = "intake" | "confirm" | "live" | "results";
type Variant = "deck" | "site" | "idea";

interface AnalyzeRootProps {
  /** ?tier=free|paid — controls whether a paid tier is pre-selected. */
  tier?: "free" | "paid";
}

/** Map SmartIntake variant → LiveAnalysisStage variant. */
function submissionToVariant(v: SmartIntakeSubmission["variant"]): Variant {
  if (v === "deck") return "deck";
  if (v === "url") return "site";
  return "idea";
}

/** Rough stage inference used before the server confirms. */
function inferStageFromSubmission(
  s: SmartIntakeSubmission | null,
  tier: "free" | "paid",
): StageKey {
  if (s?.stageGuess?.stageLabel) {
    const label = s.stageGuess.stageLabel.toLowerCase();
    if (label.includes("concept") || label.includes("idea")) return "idea";
    if (label.includes("validated") || label.includes("validation")) return "validation";
    if (label.includes("mvp") || label.includes("prototype")) return "mvp_early_revenue";
    if (label.includes("revenue")) return "seed";
    if (label.includes("growth")) return "series_a";
    if (label.includes("scale")) return "series_b_c";
    if (label.includes("corporation") || label.includes("public")) return "public_exit";
  }
  // Paid tier default assumes the founder has enough traction to justify
  // the spend — bump the assumed stage up so the lineup includes CFO
  // full-valuation.
  return tier === "paid" ? "seed" : "idea";
}

const AGENT_COST: Record<string, number> = {
  ceo: 1.5,
  cfo: 1.5,
  cto: 1.0,
  cpo: 1.0,
  cmo: 1.0,
  cro: 1.0,
  clo: 1.0,
  chro: 0.5,
  ciso: 0.5,
  cdo: 0.5,
  coo: 0.5,
};

interface AnalyzeResult {
  svi: {
    score: number;
    baseline: number;
    delta: number;
    confidence: number;
    stage: string;
    stageLabel: string;
    potentialScore: number;
    percentile?: number;
    stageBenchmark?: { median: number; topDecile: number };
  };
  valuation?: {
    formattedRange?: string;
    low?: number;
    high?: number;
  };
  topActions?: Array<{ title: string; detail?: string; impact?: string }>;
  strengths?: string[];
  gaps?: Array<{ label: string; action?: string; impact?: string }>;
}

export function AnalyzeRoot({ tier = "free" }: AnalyzeRootProps) {
  const [phase, setPhase] = React.useState<Phase>("intake");
  const [submission, setSubmission] =
    React.useState<SmartIntakeSubmission | null>(null);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<AnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const variant = submission ? submissionToVariant(submission.variant) : "idea";
  const stage = React.useMemo(
    () => inferStageFromSubmission(submission, tier),
    [submission, tier],
  );

  const lineup = React.useMemo(() => plannedAgentsFor(stage), [stage]);
  const costRows: CostRow[] = React.useMemo(
    () =>
      lineup.map((p) => ({
        planned: p,
        credits: AGENT_COST[p.agent] ?? 0.75,
      })),
    [lineup],
  );
  const total = costRows.reduce((sum, r) => sum + r.credits, 0);
  const fullTeardown = Object.values(AGENT_COST).reduce((a, b) => a + b, 0);

  function handleSubmit(s: SmartIntakeSubmission) {
    setSubmission(s);
    setPhase("confirm");
  }

  async function handleConfirm() {
    setPhase("live");
    setRunning(true);
    setErrorMsg(null);

    // Sep 2026 fix — user reported "khi nhập vào và nhấn nút analysis thì
    // cho phép bắt đầu phân tích theo dúng ngữ cảnh đã được user input vào".
    // Previous version only flipped the UI state and rendered an empty
    // variant panel — no backend call, no real analysis. Now we POST the
    // user's actual text/url to /api/hero/analyze (deterministic, anonymous,
    // 20 req/min), then swap to the results view with real SVI + valuation
    // + top actions + strengths + gaps.
    const inputText = (submission?.text ?? submission?.url ?? "").trim();
    if (inputText.length < 20) {
      setErrorMsg("Please add at least 20 characters describing your startup so we can analyse it.");
      setRunning(false);
      return;
    }
    try {
      const res = await fetch("/api/hero/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string } & AnalyzeResult;
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Analysis failed. Please try again in a moment.");
        setRunning(false);
        return;
      }
      setResult(data);
      setPhase("results");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error — please retry.");
    } finally {
      setRunning(false);
    }
  }

  if (phase === "intake") {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <SmartIntake onSubmit={handleSubmit} />
        <p className="text-[11px] uppercase tracking-wider text-tertiary">
          {tier === "paid" ? "Paid tier pre-selected" : "Free tier · upgrade any time"}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AnalyzeCostModal
        open={phase === "confirm"}
        onClose={() => setPhase("intake")}
        onConfirm={handleConfirm}
        rows={costRows}
        totalCredits={total}
        fullTeardownCredits={fullTeardown}
        title="Confirm the analysis"
        subtitle={`Detected stage: ${stage.replace(/_/g, " ")} · ${lineup.length} agents will run.`}
      />

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-primary"
        >
          {errorMsg}
        </div>
      )}

      {phase === "results" && result && (
        <div className="w-full rounded-2xl border border-line-subtle bg-surface-raised p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-tertiary">
                {result.svi.stageLabel}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-primary">
                Startup Value Index — {result.svi.score}
              </h2>
              {result.valuation?.formattedRange && (
                <p className="mt-1 text-sm text-secondary">
                  Estimated valuation:{" "}
                  <span className="font-semibold text-primary">
                    {result.valuation.formattedRange}
                  </span>{" "}
                  · confidence {result.svi.confidence}%
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-tertiary">
                Potential score
              </p>
              <p className="text-3xl font-bold text-action tabular-nums">
                {result.svi.potentialScore}
              </p>
            </div>
          </div>

          {result.strengths && result.strengths.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-wider text-tertiary mb-2">
                Strengths detected in your input
              </p>
              <ul className="space-y-1 text-sm text-secondary">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-bull">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.topActions && result.topActions.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-wider text-tertiary mb-2">
                Top actions to improve your SVI
              </p>
              <ol className="space-y-2 text-sm text-primary">
                {result.topActions.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 rounded-full bg-action/10 border border-action/30 h-6 w-6 flex items-center justify-center text-[11px] font-semibold text-action">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{a.title}</p>
                      {a.detail && (
                        <p className="text-secondary text-xs mt-0.5">{a.detail}</p>
                      )}
                      {a.impact && (
                        <p className="text-tertiary text-[11px] mt-0.5">Impact: {a.impact}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result.gaps && result.gaps.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-wider text-tertiary mb-2">
                Evidence gaps to close
              </p>
              <ul className="space-y-1 text-sm text-secondary">
                {result.gaps.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-warn">•</span>
                    <span>{g.label}{g.action ? ` — ${g.action}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setPhase("intake");
                setSubmission(null);
                setResult(null);
              }}
              className="rounded-lg border border-line-subtle px-4 py-2 text-sm font-medium text-primary hover:border-action transition-colors"
            >
              Analyse another
            </button>
          </div>
        </div>
      )}

      {phase !== "confirm" && phase !== "results" && submission && (
        <LiveAnalysisStage
          variant={variant}
          stage={stage}
          running={running}
          events={[]}
          coverage={{}}
          selected={new Set()}
          onToggleDim={() => {}}
          speculativeCostPerDim={{}}
          variantPanel={
            variant === "deck" ? (
              <DeckReaderPanel
                slides={[]}
                detectedSections={new Set()}
              />
            ) : variant === "site" ? (
              <SiteVisitorPanel
                seedUrl={submission.url ?? submission.text ?? ""}
                pages={[]}
                techStack={[]}
              />
            ) : (
              <IdeaLabPanel
                ideaText={submission.text ?? ""}
                phase={submission.stageGuess ? "classified" : "classifying"}
                classification={
                  submission.stageGuess
                    ? {
                        stage,
                        confidence: submission.stageGuess.confidence,
                        reasons: submission.stageGuess.reasons,
                      }
                    : null
                }
              />
            )
          }
        />
      )}
    </div>
  );
}

export default AnalyzeRoot;
