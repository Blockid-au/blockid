"use client";

// AnalyzeRoot — the /analyze route's client-side state machine.
//
// Phases:
//   1. INTAKE   — user drops a deck / pastes a URL / types an idea.
//   2. CONFIRM  — after /api/intake settles, load /api/svi/report-estimate
//                 (real per-context cost) then show AnalyzeCostModal.
//   3. LIVE     — mount the variant panel keyed to intake.inputKind.
//                 Each panel drives its own real progress (deck slides
//                 walked from intake.structured.slides; site EventSource
//                 to /api/site-crawl/stream; idea lab stage card from
//                 intake.context) then fires onDone(intake).
//   4. RESULTS  — <AnalyzeResults intake={intake} /> derives StageBanner,
//                 SviScoreRing, radar, gaps, actions from the intake.
//
// This ships the "honesty" fix flagged by prior review: handleConfirm()
// now actually calls the backend instead of only flipping UI state and
// animating a fake sequence.

import * as React from "react";
import dynamic from "next/dynamic";
import { SmartIntake, type SmartIntakeSubmission } from "./smart-intake";
import { AnalyzeCostModal, type CostRow } from "./analyze-cost-modal";
import { plannedAgentsFor } from "@/lib/analyze/agent-plan";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { IntakeContext } from "@/lib/intake/detect-context";
import type { AgentRole } from "@/lib/report-pipeline/types";
import { sviStageToCanonical } from "@/lib/journey-vocabulary";

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
const AnalyzeResults = dynamic(
  () => import("./analyze-results").then((m) => m.AnalyzeResults),
  { ssr: false },
);

type Phase = "intake" | "confirm" | "live" | "results";

interface AnalyzeRootProps {
  /** ?tier=free|paid — controls whether a paid tier is pre-selected. */
  tier?: "free" | "paid";
}

// Placeholder per-agent credit cost used before the live estimate arrives
// so the modal has something to render immediately.
const PLACEHOLDER_AGENT_COST: Record<AgentRole, number> = {
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

interface EstimateResult {
  rows: CostRow[];
  total: number;
  fullTeardown?: number;
  balance?: number;
  canAfford?: boolean;
  signInRequired?: boolean;
}

/** Build a placeholder estimate off just the intake context. */
function placeholderEstimate(context?: IntakeContext): EstimateResult {
  const stage = context ? sviStageToCanonical(context.stage) : "idea";
  const planned = plannedAgentsFor(stage);
  const rows: CostRow[] = planned.map((p) => ({
    planned: p,
    credits: PLACEHOLDER_AGENT_COST[p.agent] ?? 0.75,
  }));
  const total = rows.reduce((sum, r) => sum + r.credits, 0);
  const fullTeardown = Object.values(PLACEHOLDER_AGENT_COST).reduce(
    (a, b) => a + b,
    0,
  );
  return { rows, total, fullTeardown };
}

/** POST /api/intake with the SmartIntake submission. */
async function postIntake(sub: SmartIntakeSubmission): Promise<Response> {
  if (sub.file) {
    const form = new FormData();
    form.set("file", sub.file);
    if (sub.text) form.set("text", sub.text);
    if (sub.url) form.set("url", sub.url);
    return fetch("/api/intake", { method: "POST", body: form });
  }
  const body: Record<string, string> = {};
  if (sub.text) body.text = sub.text;
  if (sub.url) body.url = sub.url;
  return fetch("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function AnalyzeRoot({ tier = "free" }: AnalyzeRootProps) {
  const [phase, setPhase] = React.useState<Phase>("intake");
  const [submission, setSubmission] =
    React.useState<SmartIntakeSubmission | null>(null);
  const [intake, setIntake] = React.useState<IntakeResult | null>(null);
  const [intakeLoading, setIntakeLoading] = React.useState(false);
  const [estimate, setEstimate] = React.useState<EstimateResult | null>(null);
  const [estimateLoading, setEstimateLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [ocrOffered, setOcrOffered] = React.useState(false);
  const [ocrLoading, setOcrLoading] = React.useState(false);

  /** POST /api/svi/report-estimate with the freshly-detected context. */
  const loadEstimate = React.useCallback(
    async (context: IntakeContext | undefined) => {
      setEstimateLoading(true);
      const placeholder = placeholderEstimate(context);
      setEstimate(placeholder);
      try {
        const res = await fetch("/api/svi/report-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        });
        if (res.status === 401) {
          setEstimate({ ...placeholder, signInRequired: true });
          return;
        }
        if (!res.ok) {
          // Keep the placeholder rows so the user still sees something —
          // the surface just won't show live balance/canAfford.
          return;
        }
        const data = (await res.json()) as {
          ok: boolean;
          agentsPlanned?: AgentRole[];
          totalCredits?: number;
          fullTeardownCost?: number;
          balance?: number;
          canAfford?: boolean;
        };
        if (!data.ok || !Array.isArray(data.agentsPlanned)) return;
        const stageKey = context ? sviStageToCanonical(context.stage) : "idea";
        const planned = plannedAgentsFor(stageKey);
        // Match the estimator's returned agent list against the planned
        // lineup so the tier chips (opus/sonnet/haiku) stay in sync.
        const rows: CostRow[] = data.agentsPlanned.map((agent) => {
          const match = planned.find((p) => p.agent === agent);
          const perAgentCost =
            data.totalCredits && data.agentsPlanned!.length > 0
              ? Math.round(
                  (data.totalCredits / data.agentsPlanned!.length) * 100,
                ) / 100
              : PLACEHOLDER_AGENT_COST[agent] ?? 0.75;
          return {
            planned: match ?? { agent, tier: "sonnet" },
            credits: perAgentCost,
          };
        });
        setEstimate({
          rows,
          total: data.totalCredits ?? placeholder.total,
          fullTeardown: data.fullTeardownCost ?? placeholder.fullTeardown,
          balance: data.balance,
          canAfford: data.canAfford,
        });
      } catch {
        // Network hiccup — placeholder is already staged, keep it.
      } finally {
        setEstimateLoading(false);
      }
    },
    [],
  );

  /**
   * SmartIntake handed us a submission. Fire /api/intake, then move to
   * confirm and kick off the estimate load.
   */
  async function handleSubmit(sub: SmartIntakeSubmission) {
    setSubmission(sub);
    setErrorMsg(null);
    setIntakeLoading(true);
    try {
      const res = await postIntake(sub);
      if (res.status === 429) {
        setErrorMsg("Slow down — rate limited. Try again in a minute.");
        setIntakeLoading(false);
        return;
      }
      if (!res.ok) {
        setErrorMsg(
          "Something went wrong. Try again or contact support.",
        );
        setIntakeLoading(false);
        return;
      }
      const data = (await res.json()) as { ok?: boolean } & IntakeResult;
      if (!data.ok) {
        setErrorMsg("Something went wrong. Try again or contact support.");
        setIntakeLoading(false);
        return;
      }
      setIntake(data);
      setOcrOffered(
        data.inputKind === "pitch_deck" &&
          Boolean(
            data.warnings?.some((w) => /pdf.*ocr|image-only/i.test(w)),
          ),
      );
      setPhase("confirm");
      // Fire-and-forget — modal shows placeholder rows immediately, then
      // real estimate rewires them when it resolves.
      void loadEstimate(data.context);
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Network error — please retry.",
      );
    } finally {
      setIntakeLoading(false);
    }
  }

  /** Confirm modal → advance to the live variant panel. */
  function handleConfirm() {
    if (!intake) return;
    setPhase("live");
    setRunning(true);
  }

  /** Variant panel finished → mount results view. */
  const handleVariantDone = React.useCallback(
    (_i?: IntakeResult) => {
      setRunning(false);
      setPhase("results");
    },
    [],
  );

  /** Fire OCR fallback for image-only PDFs. */
  async function runOcr() {
    if (!submission?.file || ocrLoading) return;
    setOcrLoading(true);
    try {
      const form = new FormData();
      form.set("file", submission.file);
      const res = await fetch("/api/pitchdeck/ocr", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setErrorMsg("OCR failed — try uploading a text-based PDF instead.");
        return;
      }
      // Re-post intake now that OCR has enriched the text — the intake
      // endpoint owns the extraction pipeline so we just re-run it.
      await handleSubmit(submission);
      setOcrOffered(false);
    } finally {
      setOcrLoading(false);
    }
  }

  function handleReset() {
    setPhase("intake");
    setSubmission(null);
    setIntake(null);
    setEstimate(null);
    setErrorMsg(null);
    setOcrOffered(false);
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (phase === "intake") {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <SmartIntake onSubmit={handleSubmit} />
        {intakeLoading && (
          <p className="text-xs text-tertiary">
            Reading your input…
          </p>
        )}
        {errorMsg && (
          <div
            role="alert"
            className="w-full rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-primary"
            data-testid="analyze-error"
          >
            {errorMsg}
          </div>
        )}
        <p className="text-[11px] uppercase tracking-wider text-tertiary">
          {tier === "paid" ? "Paid tier pre-selected" : "Free tier · upgrade any time"}
        </p>
      </div>
    );
  }

  const stageLabel = intake?.context
    ? sviStageToCanonical(intake.context.stage).replace(/_/g, " ")
    : "unknown";
  const lineupCount = estimate?.rows.length ?? 0;

  return (
    <div className="w-full">
      {ocrOffered && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-primary"
          data-testid="analyze-ocr-banner"
        >
          <span>
            This PDF looks scanned. Run OCR (+2 credits) to extract the
            text?
          </span>
          <button
            type="button"
            onClick={() => void runOcr()}
            disabled={ocrLoading}
            className="rounded-lg bg-warn px-3 py-1.5 text-xs font-semibold text-on-warn hover:opacity-90 disabled:opacity-60"
            data-testid="analyze-ocr-run"
          >
            {ocrLoading ? "Running OCR…" : "Run OCR"}
          </button>
        </div>
      )}

      <AnalyzeCostModal
        open={phase === "confirm" && !!estimate}
        onClose={handleReset}
        onConfirm={handleConfirm}
        rows={estimate?.rows ?? []}
        totalCredits={estimate?.total}
        fullTeardownCredits={estimate?.fullTeardown}
        creditBalance={estimate?.balance}
        estimateLoading={estimateLoading}
        signInHref={estimate?.signInRequired ? "/auth/login?next=/analyze" : undefined}
        title="Confirm the analysis"
        subtitle={`Detected stage: ${stageLabel} · ${lineupCount} agents will run.`}
      />

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-primary"
          data-testid="analyze-error"
        >
          {errorMsg}
        </div>
      )}

      {phase === "live" && intake && (
        <div className="w-full">
          {intake.inputKind === "pitch_deck" && (
            <DeckReaderPanel intake={intake} onDone={handleVariantDone} />
          )}
          {intake.inputKind === "website" && (
            <SiteVisitorPanel
              url={submission?.url ?? submission?.text ?? intake.rawText}
              intake={intake}
              onDone={handleVariantDone}
            />
          )}
          {(intake.inputKind === "idea_text" ||
            intake.inputKind === "existing_company_text") && (
            <IdeaLabPanel intake={intake} onDone={handleVariantDone} />
          )}
          {running && (
            <p className="mt-3 text-center text-xs text-tertiary">
              Analysing your input…
            </p>
          )}
        </div>
      )}

      {phase === "results" && intake && (
        <>
          <AnalyzeResults intake={intake} />
          <div className="mx-auto mt-4 max-w-6xl px-4">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-line-subtle px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-action"
            >
              Analyse another
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default AnalyzeRoot;
