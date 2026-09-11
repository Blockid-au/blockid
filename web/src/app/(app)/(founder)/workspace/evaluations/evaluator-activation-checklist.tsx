"use client";

// EvaluatorActivationChecklist — the 4-step "get set up" card rendered
// directly under the S7-C TrialReportBanner on /workspace/evaluations
// (G12 S13-A, trial → Scout conversion).
//
//   Get the most from your trial in 4 steps           2 of 4 done · 5 days left   [×]
//   ▓▓▓▓▓▓▓▓░░░░░░░░
//   ✓ 1  Add the first startup you're evaluating
//   ✓ 2  Run your included Trust BizReport
//   ○ 3  Set your thesis so matching founders can find you   [Set my thesis]
//   ○ 4  Add a startup to your watchlist / cohort             [Add another startup]
//
// State comes from lib/evaluations/activation-checklist.ts (pure); the copy
// from lib/evaluations/copy.ts. The CTAs reuse the page's existing dialogs
// (add / report) via callbacks and the thesis step links to
// /workspace/investor/preferences. Never rendered for founder personas —
// the page only passes `input` for evaluators. Hidden once all 4 are done
// or after the evaluator dismisses it (localStorage, try/catch — SSR and
// blocked storage read as "not dismissed"). Days-left reuses the banner's
// trial data so the two never disagree; the banner itself is not repeated.
//
// GA4: `evaluator_checklist_viewed { completed }` once per mount while
// visible; `evaluator_checklist_step { step }` on every CTA click.

import * as React from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import {
  ACTIVATION_THESIS_HREF,
  deriveActivationChecklist,
  readChecklistDismissed,
  writeChecklistDismissed,
  type ActivationInputs,
  type ActivationStep,
  type ActivationStepNumber,
} from "@/lib/evaluations/activation-checklist";
import { EVALUATIONS_COPY, evaluationsCopy, trialDaysLeftLine } from "@/lib/evaluations/copy";

export interface EvaluatorActivationChecklistProps {
  input: ActivationInputs;
  /** Days left from the S7-C trial data; null / 0 when not trialing (chip omitted). */
  trialDaysLeft?: number | null;
  /** Opens the existing "Add a startup" dialog (steps 1 + 4). */
  onAddStartup: () => void;
  /** Opens the report dialog on the first evaluation (step 2). */
  onRunReport: () => void;
  /** False at the tracked-startup cap — the add CTAs become the upgrade link. */
  canAdd?: boolean;
}

const STEP_COPY: Record<ActivationStepNumber, { title: string; body: string; cta: string }> = {
  1: { title: EVALUATIONS_COPY["checklist.step1.title"], body: EVALUATIONS_COPY["checklist.step1.body"], cta: EVALUATIONS_COPY["checklist.step1.cta"] },
  2: { title: EVALUATIONS_COPY["checklist.step2.title"], body: EVALUATIONS_COPY["checklist.step2.body"], cta: EVALUATIONS_COPY["checklist.step2.cta"] },
  3: { title: EVALUATIONS_COPY["checklist.step3.title"], body: EVALUATIONS_COPY["checklist.step3.body"], cta: EVALUATIONS_COPY["checklist.step3.cta"] },
  4: { title: EVALUATIONS_COPY["checklist.step4.title"], body: EVALUATIONS_COPY["checklist.step4.body"], cta: EVALUATIONS_COPY["checklist.step4.cta"] },
};

const CTA_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2";
const CTA_SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2";

export function EvaluatorActivationChecklist({
  input,
  trialDaysLeft = null,
  onAddStartup,
  onRunReport,
  canAdd = true,
}: EvaluatorActivationChecklistProps): React.ReactElement | null {
  const state = React.useMemo(() => deriveActivationChecklist(input), [input]);
  const [dismissed, setDismissed] = React.useState(false);
  const viewed = React.useRef(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration read of the localStorage dismiss flag; a lazy initialiser would mismatch the server render
    if (readChecklistDismissed(typeof window === "undefined" ? null : window.localStorage)) setDismissed(true);
  }, []);

  const visible = !dismissed && !state.complete;
  React.useEffect(() => {
    if (!visible || viewed.current) return;
    viewed.current = true;
    trackEvent("evaluator_checklist_viewed", { completed: state.completed });
  }, [visible, state.completed]);

  if (!visible) return null;

  function handleDismiss(): void {
    writeChecklistDismissed(typeof window === "undefined" ? null : window.localStorage);
    setDismissed(true);
  }

  function handleStep(step: ActivationStep): void {
    trackEvent("evaluator_checklist_step", { step: step.step });
    if (step.action === "add_startup") onAddStartup();
    else if (step.action === "run_report") onRunReport();
  }

  const pct = Math.round((state.completed / state.total) * 100);
  const days = typeof trialDaysLeft === "number" && trialDaysLeft > 0 ? trialDaysLeft : null;

  return (
    <section
      aria-labelledby="evaluator-checklist-title"
      data-testid="evaluator-activation-checklist"
      data-completed={state.completed}
      className="rounded-2xl border border-surface-200 bg-white px-5 py-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="evaluator-checklist-title" className="text-base font-semibold text-ink-900">
            {EVALUATIONS_COPY["checklist.title"]}
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">{EVALUATIONS_COPY["checklist.subtitle"]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            data-testid="evaluator-checklist-progress"
            className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 tabular-nums"
          >
            {evaluationsCopy("checklist.progress", { done: state.completed, total: state.total })}
          </span>
          {days != null ? (
            <span
              data-testid="evaluator-checklist-days"
              className="inline-flex items-center rounded-full border border-surface-200 bg-surface-50 px-2.5 py-1 text-xs font-medium text-ink-600 tabular-nums"
            >
              {trialDaysLeftLine(days)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={EVALUATIONS_COPY["checklist.dismiss"]}
            title={EVALUATIONS_COPY["checklist.dismiss"]}
            data-testid="evaluator-checklist-dismiss"
            className="-mr-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-500 hover:bg-surface-100 hover:text-ink-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <X strokeWidth={1.75} className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={state.total}
        aria-valuenow={state.completed}
        aria-label={evaluationsCopy("checklist.progress", { done: state.completed, total: state.total })}
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-100"
      >
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 divide-y divide-surface-100">
        {state.steps.map((step) => {
          const copy = STEP_COPY[step.step];
          const primary = state.next === step.step;
          return (
            <li
              key={step.step}
              data-testid="evaluator-checklist-step"
              data-step={step.step}
              data-done={step.done ? "1" : "0"}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={
                    step.done
                      ? "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                      : primary
                        ? "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-600 text-xs font-bold text-brand-700 tabular-nums"
                        : "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-surface-300 text-xs font-semibold text-ink-500 tabular-nums"
                  }
                >
                  {step.done ? <Check strokeWidth={2.5} className="h-3.5 w-3.5" /> : step.step}
                </span>
                <div className="min-w-0">
                  <p className={step.done ? "text-sm font-medium text-ink-500" : "text-sm font-semibold text-ink-900"}>
                    {copy.title}
                    {step.done ? <span className="sr-only"> — {EVALUATIONS_COPY["checklist.stepDone"]}</span> : null}
                  </p>
                  {!step.done ? <p className="mt-0.5 text-sm text-ink-500">{copy.body}</p> : null}
                </div>
              </div>
              {!step.done ? (
                <div className="shrink-0 sm:pl-4">
                  {step.blocked ? (
                    <span className="text-xs font-medium text-ink-400">{EVALUATIONS_COPY["checklist.stepBlocked"]}</span>
                  ) : step.action === "set_thesis" ? (
                    <Link
                      href={ACTIVATION_THESIS_HREF}
                      onClick={() => trackEvent("evaluator_checklist_step", { step: step.step })}
                      data-testid={`evaluator-checklist-cta-${step.step}`}
                      className={primary ? CTA_PRIMARY : CTA_SECONDARY}
                    >
                      {copy.cta}
                    </Link>
                  ) : step.action === "add_startup" && !canAdd ? (
                    <Link
                      href="/pricing?segment=evaluator"
                      data-testid={`evaluator-checklist-cta-${step.step}`}
                      className={CTA_SECONDARY}
                    >
                      Upgrade to track more
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStep(step)}
                      data-testid={`evaluator-checklist-cta-${step.step}`}
                      className={primary ? CTA_PRIMARY : CTA_SECONDARY}
                    >
                      {copy.cta}
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
