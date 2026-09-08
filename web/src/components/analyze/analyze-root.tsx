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
import { SavedAnalysisPanel } from "./saved-analysis-panel";
import { SignupGatePanel } from "./signup-gate-panel";
import { ArtefactGatePanel } from "./artefact-gate-panel";
import {
  GuestPaidCheckout,
  type GuestInputType,
} from "./guest-paid-checkout";
import { plannedAgentsFor } from "@/lib/analyze/agent-plan";
import {
  clearPendingIntake,
  clearSignupIntake,
  submissionFromQuery,
  takePendingIntake,
  takeSignupIntake,
} from "@/lib/analyze/pending-intake";
import { claimedMessage, savedAnalysisPath } from "@/lib/analyses/summary";
import { SIGNUP_REQUIRED } from "@/lib/analyses/signup-gate";
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

type Phase = "intake" | "gate" | "confirm" | "live" | "results";

interface AnalyzeRootProps {
  /** ?tier=free|paid — controls whether a paid tier is pre-selected. */
  tier?: "free" | "paid";
  /**
   * Server-resolved session state. When false and `tier === "paid"` the
   * confirm step sells the A$3 guest report instead of spending credits the
   * visitor does not have. Undefined means "unknown" — we then fall back to
   * the 401 signal from /api/svi/report-estimate.
   */
  authenticated?: boolean;
  /**
   * `?q=` from the homepage hero — the text or URL the visitor already typed.
   * When present the analysis runs against it on mount so nobody is asked to
   * type the same thing twice.
   */
  initialQuery?: string;
  /** `?kind=` — which variant the hero classified before navigating. */
  initialKind?: string;
  /**
   * `?resume=signup` — this visitor was shown the account wall, made an
   * account, and has come straight back. The run they were promised is free,
   * so it starts immediately rather than routing through a credit
   * confirmation nobody warned them about.
   */
  resumedFromSignup?: boolean;
  /**
   * `?claimed=` — how many earlier runs the signup actually attached to the
   * new account. A real number from the auth endpoint; 0 means say nothing.
   */
  claimed?: number;
}

/**
 * Should the run start without the confirm modal?
 *
 * The free path costs nothing, so an extra "yes I meant it" click after the
 * visitor already pressed the hero button is pure friction — that is the
 * double-entry this exists to kill. Anything that can spend credits or take
 * money (a signed-in run, or `?tier=paid`) still goes through the confirm
 * step, because price must always be shown before it is charged.
 */
export function shouldAutoRun(opts: {
  tier?: "free" | "paid";
  authenticated?: boolean;
  /**
   * Returning from the signup gate. This exact run was promised free before
   * the account existed, so showing a credit confirmation now would be a
   * bait and switch — and a brand-new account has no credits to satisfy it
   * with, so the CTA would be disabled and the promise simply broken.
   */
  resumedFromSignup?: boolean;
}): boolean {
  if (opts.tier === "paid") return false;
  if (opts.resumedFromSignup) return true;
  return opts.authenticated === false;
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
async function postIntake(
  sub: SmartIntakeSubmission,
  tier: "free" | "paid" = "free",
): Promise<Response> {
  // `tier` rides along so the server-side signup gate can let a guest heading
  // for the A$3 checkout straight through. It only ever widens the gate — it
  // never charges anything and never grants credits.
  if (sub.file) {
    const form = new FormData();
    form.set("file", sub.file);
    if (sub.text) form.set("text", sub.text);
    if (sub.url) form.set("url", sub.url);
    form.set("tier", tier);
    return fetch("/api/intake", { method: "POST", body: form });
  }
  const body: Record<string, string> = { tier };
  if (sub.text) body.text = sub.text;
  if (sub.url) body.url = sub.url;
  return fetch("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Which guest SKU (if any) this submission can be sold as. The guest API
 * (`/api/guest-analysis/create-order`) only accepts `pitch_file` and
 * `website_url` — a typed idea has no A$3 SKU, so it stays on the free /
 * credits path.
 */
export function guestInputTypeFor(
  intake: IntakeResult | null,
  sub: SmartIntakeSubmission | null,
): GuestInputType | null {
  if (!intake) return null;
  if (intake.inputKind === "pitch_deck" && sub?.file) return "pitch_file";
  if (intake.inputKind === "website" && guestUrlFor(intake, sub)) {
    return "website_url";
  }
  return null;
}

/** Best-effort recovery of the site URL the visitor supplied. */
export function guestUrlFor(
  intake: IntakeResult | null,
  sub: SmartIntakeSubmission | null,
): string {
  const candidate = sub?.url ?? sub?.text ?? intake?.rawText ?? "";
  const trimmed = candidate.trim();
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

export function AnalyzeRoot({
  tier = "free",
  authenticated,
  initialQuery,
  initialKind,
  resumedFromSignup = false,
  claimed = 0,
}: AnalyzeRootProps) {
  const [phase, setPhase] = React.useState<Phase>("intake");
  const [submission, setSubmission] =
    React.useState<SmartIntakeSubmission | null>(null);
  const [intake, setIntake] = React.useState<IntakeResult | null>(null);
  // Row id from POST /api/intake. `null` means the save failed — the analysis
  // is still valid, we just have no permalink to offer and say nothing about
  // saving. See SavedAnalysisPanel.
  const [analysisId, setAnalysisId] = React.useState<string | null>(null);
  const [intakeLoading, setIntakeLoading] = React.useState(false);
  const [estimate, setEstimate] = React.useState<EstimateResult | null>(null);
  const [estimateLoading, setEstimateLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [ocrOffered, setOcrOffered] = React.useState(false);
  const [ocrLoading, setOcrLoading] = React.useState(false);
  const [guestCheckoutOpen, setGuestCheckoutOpen] = React.useState(false);
  // Set when /api/intake declines to run because this browser is past its
  // free anonymous run. The numbers come from the API so the prompt states
  // facts rather than invented copy; null means the gate has not fired.
  const [gateInfo, setGateInfo] = React.useState<{
    priorRuns?: number;
    windowDays?: number;
  } | null>(null);

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
  async function handleSubmit(
    sub: SmartIntakeSubmission,
    opts?: { autoRun?: boolean },
  ) {
    setSubmission(sub);
    setErrorMsg(null);
    setIntakeLoading(true);
    try {
      const res = await postIntake(sub, tier);
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
      const data = (await res.json()) as {
        ok?: boolean;
        reason?: string;
        priorRuns?: number;
        windowDays?: number;
        analysisId?: string | null;
      } & IntakeResult;
      // The account wall. A 200 with `ok: false` and this reason means the
      // server deliberately declined to run — nothing was analysed and
      // nothing was spent. It is NOT an error and must never be rendered as
      // one.
      if (data.ok === false && data.reason === SIGNUP_REQUIRED) {
        setGateInfo({
          priorRuns: data.priorRuns,
          windowDays: data.windowDays,
        });
        setPhase("gate");
        setIntakeLoading(false);
        return;
      }
      if (!data.ok) {
        setErrorMsg("Something went wrong. Try again or contact support.");
        setIntakeLoading(false);
        return;
      }
      setGateInfo(null);
      setIntake(data);
      setAnalysisId(
        typeof data.analysisId === "string" ? data.analysisId : null,
      );
      setOcrOffered(
        data.inputKind === "pitch_deck" &&
          Boolean(
            data.warnings?.some((w) => /pdf.*ocr|image-only/i.test(w)),
          ),
      );
      if (opts?.autoRun) {
        // The visitor already committed by pressing the hero button. Nothing
        // is being charged on this path, so go straight to the live panel.
        setPhase("live");
        setRunning(true);
      } else {
        setPhase("confirm");
      }
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
      setAwaitingHandoff(false);
      setIntakeLoading(false);
    }
  }

  // ── Hero handoff ───────────────────────────────────────────────────
  // The homepage hero parks its submission in the pending-intake store and
  // navigates here. Claim it on mount and run — the visitor typed once and
  // should never be asked to type again. If the store is empty (hard reload,
  // shared link) `?q=` rebuilds a text/URL submission. A deck that lost its
  // bytes falls through to the intake box with an explanation.
  const autoRanRef = React.useRef(false);
  const [deckHandoffLost, setDeckHandoffLost] = React.useState(false);
  // Whether a handoff is expected on this render. Derived from the URL only
  // (never from the module store), so the server HTML and the first client
  // render agree — otherwise the visitor sees an empty box flash before the
  // run starts, which is the exact "type it again" moment being removed.
  const [awaitingHandoff, setAwaitingHandoff] = React.useState(
    () => Boolean(initialQuery) || initialKind === "deck" || resumedFromSignup,
  );

  React.useEffect(() => {
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    // Order matters: the in-memory handoff (a hero click, File handle intact)
    // beats the written-down one, which beats rebuilding from `?q=`.
    const parked = takePendingIntake() ?? takeSignupIntake();
    const sub = parked ?? submissionFromQuery({ q: initialQuery, kind: initialKind });
    if (!sub) {
      if (initialKind === "deck") setDeckHandoffLost(true);
      setAwaitingHandoff(false);
      return;
    }
    void handleSubmit(sub, {
      autoRun: shouldAutoRun({ tier, authenticated, resumedFromSignup }),
    });
    // Mount-only: the handoff is single-shot by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Guest A$3 path ─────────────────────────────────────────────────
  // `?tier=paid` on an anonymous visit means "I want the paid report" — the
  // credits flow is useless to someone with no account. Sell them the same
  // A$3 One-Click Report that /one-click-report sells, using the identical
  // upload-pitch → create-order → Stripe contract.
  const isAnonymous =
    authenticated === false ||
    (authenticated === undefined && estimate?.signInRequired === true);
  const guestInputType = guestInputTypeFor(intake, submission);
  const guestSellable = tier === "paid" && isAnonymous && !!guestInputType;

  /** Confirm modal → guest checkout, or advance to the live variant panel. */
  function handleConfirm() {
    if (!intake) return;
    if (guestSellable) {
      setGuestCheckoutOpen(true);
      return;
    }
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
    clearPendingIntake();
    clearSignupIntake();
    setGateInfo(null);
    setDeckHandoffLost(false);
    setAwaitingHandoff(false);
    setPhase("intake");
    setSubmission(null);
    setIntake(null);
    setAnalysisId(null);
    setEstimate(null);
    setErrorMsg(null);
    setOcrOffered(false);
    setGuestCheckoutOpen(false);
  }

  // ── Render ─────────────────────────────────────────────────────────
  // A real claim count from the signup that just ran. `claimedMessage`
  // returns null for 0, so nothing is said when nothing was claimed.
  const claimedNote = claimedMessage(claimed);

  if (phase === "gate") {
    // The server declined to run and spent nothing. This is the account wall,
    // not an error — so it renders in place of the analysis, with the typed
    // input carried through to signup.
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <SignupGatePanel
          priorRuns={gateInfo?.priorRuns}
          windowDays={gateInfo?.windowDays}
          submission={submission}
          onEdit={handleReset}
        />
      </div>
    );
  }

  if (phase === "intake") {
    // A handoff is in flight — show that the run is starting rather than an
    // empty box the visitor might start retyping into.
    if (awaitingHandoff && !errorMsg) {
      return (
        <div
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-line-subtle bg-surface-raised px-6 py-10"
          data-testid="analyze-handoff-starting"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden
            className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-action motion-reduce:animate-none"
          />
          <p className="text-sm font-medium text-primary">
            Starting your analysis…
          </p>
          <p className="text-xs text-muted">
            Using what you already entered — no need to type it again.
          </p>
          {claimedNote && (
            <p className="text-xs text-secondary" data-testid="analyze-claimed-note">
              {claimedNote}
            </p>
          )}
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col items-center gap-3">
        {claimedNote && (
          <div
            role="status"
            className="w-full rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
            data-testid="analyze-claimed-note"
          >
            {claimedNote}
          </div>
        )}
        {deckHandoffLost && (
          <div
            role="status"
            className="w-full rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
            data-testid="analyze-deck-handoff-lost"
          >
            Your deck did not make it through the page refresh — files can’t
            travel in a link. Drop it here once and the analysis starts.
          </div>
        )}
        <SmartIntake onSubmit={(sub) => void handleSubmit(sub)} />
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
          {tier === "paid"
            ? "Paid report · A$3 inc GST · emailed as a PDF"
            : "Free tier · upgrade any time"}
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
        open={phase === "confirm" && !!estimate && !guestCheckoutOpen}
        onClose={handleReset}
        onConfirm={handleConfirm}
        rows={estimate?.rows ?? []}
        totalCredits={estimate?.total}
        fullTeardownCredits={estimate?.fullTeardown}
        // A guest buying the A$3 report is not spending credits, so the
        // balance / affordability gate must not disable the CTA.
        creditBalance={guestSellable ? undefined : estimate?.balance}
        estimateLoading={estimateLoading}
        signInHref={
          !guestSellable && estimate?.signInRequired
            ? "/auth/login?next=/analyze"
            : undefined
        }
        ctaLabel={guestSellable ? "Continue — A$3 report" : "Run analysis"}
        title={guestSellable ? "Your A$3 report" : "Confirm the analysis"}
        subtitle={
          guestSellable
            ? `Detected stage: ${stageLabel} · ${lineupCount} agents run on your input. One-off A$3 inc GST — emailed as a PDF, no account needed.`
            : `Detected stage: ${stageLabel} · ${lineupCount} agents will run.`
        }
      />

      {guestInputType && (
        <GuestPaidCheckout
          open={guestCheckoutOpen}
          onClose={() => setGuestCheckoutOpen(false)}
          inputType={guestInputType}
          file={submission?.file ?? null}
          url={guestUrlFor(intake, submission)}
        />
      )}

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
          <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-4 px-4 text-left">
            {claimedNote && (
              <div
                role="status"
                className="rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
                data-testid="analyze-claimed-note"
              >
                {claimedNote}
              </div>
            )}
            <SavedAnalysisPanel
              analysisId={analysisId}
              authenticated={authenticated}
            />
            <ArtefactGatePanel
              authenticated={authenticated}
              analysisPath={analysisId ? savedAnalysisPath(analysisId) : null}
            />
            <div>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-line-subtle px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-action"
              >
                Analyse another
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AnalyzeRoot;
