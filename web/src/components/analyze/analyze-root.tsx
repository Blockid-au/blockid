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

export function AnalyzeRoot({ tier = "free" }: AnalyzeRootProps) {
  const [phase, setPhase] = React.useState<Phase>("intake");
  const [submission, setSubmission] =
    React.useState<SmartIntakeSubmission | null>(null);
  const [running, setRunning] = React.useState(false);

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

  function handleConfirm() {
    setPhase("live");
    setRunning(true);
    // Backend wiring happens in a later block — for now, the LIVE view
    // just shows the correct variant panel with placeholder progress
    // and the AgentLineup queued state. This is enough for the /analyze
    // shell smoke test.
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

      {phase !== "confirm" && submission && (
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
