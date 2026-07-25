"use client";

// Startup Package — Guided Interview Wizard (client)
//
// Mirrors the onboarding wizard state-machine pattern:
//   - useReducer({stepIndex, answers, dirty})
//   - Every keystroke writes to localStorage under the STORAGE_KEY
//   - Debounced (800ms) POST to /api/startup-package/save-answer, which
//     upserts the answer + snapshots SVI. The response feeds the live
//     meter so the founder sees SVI motion in-flight.
//
// Design notes:
//   - INTERVIEW_STEPS is the single source of truth for step order, copy,
//     lead agent, and display credit cost. This file renders it — never
//     mutates it — so adding a step is a one-line change in the lib.
//   - "Analyze now" runs POST /analyze which spends credits + dispatches
//     one lead agent. Success shows the executiveSummary inline and
//     surfaces credits remaining.
//   - localStorage key is versioned (_v1) so future schema changes can
//     safely drop stale drafts.

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles, Check } from "lucide-react";
import {
  INTERVIEW_STEPS,
  INTERVIEW_TOTAL_STEPS,
  type InterviewStepKey,
} from "@/lib/startup-package/interview-steps";
import { SviLiveMeter } from "@/components/startup-package/svi-live-meter";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "startup_package_interview_v1";
const AUTOSAVE_DEBOUNCE_MS = 800;

type Answers = Partial<Record<InterviewStepKey, string>>;

interface WizardState {
  stepIndex: number;
  answers: Answers;
  dirty: boolean;
  savingKey: InterviewStepKey | null;
  lastSavedKey: InterviewStepKey | null;
  analyzing: boolean;
  lastReport: { summary: string; remaining: number | null } | null;
  error: string | null;
  projectId: string | null;
}

type WizardAction =
  | { type: "SET_ANSWER"; key: InterviewStepKey; value: string }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GO_TO"; index: number }
  | { type: "SAVE_START"; key: InterviewStepKey }
  | { type: "SAVE_DONE"; key: InterviewStepKey; projectId?: string | null }
  | { type: "ANALYZE_START" }
  | {
      type: "ANALYZE_DONE";
      summary: string;
      remaining: number | null;
    }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_ERROR" };

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_ANSWER":
      return {
        ...state,
        answers: { ...state.answers, [action.key]: action.value },
        dirty: true,
        error: null,
      };
    case "NEXT":
      return {
        ...state,
        stepIndex: Math.min(INTERVIEW_TOTAL_STEPS - 1, state.stepIndex + 1),
      };
    case "BACK":
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) };
    case "GO_TO":
      return {
        ...state,
        stepIndex: Math.max(
          0,
          Math.min(INTERVIEW_TOTAL_STEPS - 1, action.index),
        ),
      };
    case "SAVE_START":
      return { ...state, savingKey: action.key };
    case "SAVE_DONE":
      return {
        ...state,
        savingKey: null,
        lastSavedKey: action.key,
        dirty: false,
        projectId: action.projectId ?? state.projectId,
      };
    case "ANALYZE_START":
      return { ...state, analyzing: true, error: null };
    case "ANALYZE_DONE":
      return {
        ...state,
        analyzing: false,
        lastReport: {
          summary: action.summary,
          remaining: action.remaining,
        },
      };
    case "ERROR":
      return {
        ...state,
        analyzing: false,
        savingKey: null,
        error: action.message,
      };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

function loadInitial(): WizardState {
  const base: WizardState = {
    stepIndex: 0,
    answers: {},
    dirty: false,
    savingKey: null,
    lastSavedKey: null,
    analyzing: false,
    lastReport: null,
    error: null,
    projectId: null,
  };
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return {
      ...base,
      stepIndex:
        typeof parsed.stepIndex === "number" &&
        parsed.stepIndex >= 0 &&
        parsed.stepIndex < INTERVIEW_TOTAL_STEPS
          ? parsed.stepIndex
          : 0,
      answers:
        parsed.answers && typeof parsed.answers === "object"
          ? (parsed.answers as Answers)
          : {},
      projectId:
        typeof parsed.projectId === "string" ? parsed.projectId : null,
    };
  } catch {
    return base;
  }
}

export interface InterviewWizardProps {
  initialProjectId: string | null;
}

export function InterviewWizard({ initialProjectId }: InterviewWizardProps) {
  const [state, dispatch] = React.useReducer(reducer, undefined, loadInitial);

  // Prefer server-known projectId if we didn't have one locally yet.
  React.useEffect(() => {
    if (initialProjectId && !state.projectId) {
      dispatch({
        type: "SAVE_DONE",
        key: INTERVIEW_STEPS[0].key,
        projectId: initialProjectId,
      });
    }
    // We only sync once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage on every state change (keystroke-level).
  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          stepIndex: state.stepIndex,
          answers: state.answers,
          projectId: state.projectId,
        }),
      );
    } catch {
      // Storage blocked — non-fatal.
    }
  }, [state.stepIndex, state.answers, state.projectId]);

  const currentStep = INTERVIEW_STEPS[state.stepIndex];
  const currentAnswer = state.answers[currentStep.key] ?? "";

  // Debounced server autosave for the currently-edited step.
  const saveTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!state.dirty) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveCurrent();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.answers, state.dirty]);

  async function saveCurrent() {
    const text = state.answers[currentStep.key] ?? "";
    if (text.trim().length === 0) return;
    dispatch({ type: "SAVE_START", key: currentStep.key });
    try {
      const res = await fetch("/api/startup-package/save-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepKey: currentStep.key,
          answerText: text,
          projectId: state.projectId ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        projectId?: string;
        reason?: string;
      };
      if (!data.ok && !("skipped" in data)) {
        dispatch({
          type: "ERROR",
          message: `Save failed: ${data.reason ?? "unknown"}`,
        });
        return;
      }
      dispatch({
        type: "SAVE_DONE",
        key: currentStep.key,
        projectId: data.projectId ?? state.projectId,
      });
      trackEvent("interview_step_completed", {
        step_key: currentStep.key,
        char_count: text.length,
        project_id: data.projectId ?? state.projectId ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network_error";
      dispatch({ type: "ERROR", message: msg });
    }
  }

  async function analyzeCurrent() {
    if (currentAnswer.trim().length < currentStep.minChars) {
      dispatch({
        type: "ERROR",
        message: `Please write at least ${currentStep.minChars} characters before analysing.`,
      });
      return;
    }
    // Flush pending autosave before analysing.
    await saveCurrent();
    dispatch({ type: "ANALYZE_START" });
    try {
      const res = await fetch("/api/startup-package/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepKey: currentStep.key,
          projectId: state.projectId ?? undefined,
          tier: "free",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        executiveSummary?: string;
        creditsRemaining?: number;
        credits_needed?: number;
        reason?: string;
        upgradeSuggestion?: string;
        url?: string;
        sviDelta?: number | null;
      };
      if (res.status === 402) {
        dispatch({
          type: "ERROR",
          message: `Not enough credits (${data.credits_needed ?? currentStep.creditCost} needed). Top up at /credits.`,
        });
        return;
      }
      if (!data.ok) {
        dispatch({
          type: "ERROR",
          message: `Analysis failed: ${data.reason ?? "unknown"}`,
        });
        return;
      }
      dispatch({
        type: "ANALYZE_DONE",
        summary: data.executiveSummary ?? "(no summary returned)",
        remaining:
          typeof data.creditsRemaining === "number"
            ? data.creditsRemaining
            : null,
      });
      trackEvent("agent_analysis_ran", {
        step_key: currentStep.key,
        lead_agent: currentStep.leadAgent,
        credits_spent: currentStep.creditCost,
        svi_delta: data.sviDelta ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network_error";
      dispatch({ type: "ERROR", message: msg });
    }
  }

  const charCount = currentAnswer.length;
  const canAdvance = charCount >= currentStep.minChars;
  const isLast = state.stepIndex === INTERVIEW_TOTAL_STEPS - 1;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-[1fr_320px]">
      {/* ── Left: current step ─────────────────────────────────────── */}
      <section className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 sm:p-8">
        <ProgressRow
          currentIndex={state.stepIndex}
          onJump={(i) => dispatch({ type: "GO_TO", index: i })}
          completedKeys={Object.keys(state.answers).filter(
            (k) => (state.answers[k as InterviewStepKey] ?? "").length > 0,
          ) as InterviewStepKey[]}
        />

        <div className="mt-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
            <span>
              Step {state.stepIndex + 1} of {INTERVIEW_TOTAL_STEPS}
            </span>
            <span aria-hidden="true">•</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
              {currentStep.leadAgent.toUpperCase()}
            </span>
            <span className="ml-auto text-slate-500">
              ~{currentStep.creditCost} cr / analysis
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-100">
            {currentStep.prompt.en}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {currentStep.helpText.en}
          </p>
        </div>

        <label className="mt-6 block">
          <span className="sr-only">Your answer</span>
          <textarea
            value={currentAnswer}
            onChange={(e) =>
              dispatch({
                type: "SET_ANSWER",
                key: currentStep.key,
                value: e.target.value,
              })
            }
            placeholder={currentStep.placeholder.en}
            rows={10}
            maxLength={20000}
            className="w-full resize-y rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            {charCount} / {currentStep.minChars} chars min
          </span>
          <span>·</span>
          <span>target ~{currentStep.targetWords} words</span>
          {state.savingKey === currentStep.key && (
            <span className="text-cyan-400">Saving…</span>
          )}
          {state.lastSavedKey === currentStep.key &&
            state.savingKey !== currentStep.key && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <Check aria-hidden="true" className="h-3 w-3" /> saved
              </span>
            )}
        </div>

        {state.error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200"
          >
            {state.error}
            <button
              type="button"
              onClick={() => dispatch({ type: "CLEAR_ERROR" })}
              className="ml-3 underline"
            >
              dismiss
            </button>
          </div>
        )}

        {state.lastReport && (
          <div className="mt-4 rounded-2xl border border-cyan-800/50 bg-cyan-950/30 p-4 text-sm text-cyan-100">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-cyan-300">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {currentStep.leadAgent.toUpperCase()} analysis
            </div>
            <p className="whitespace-pre-wrap text-slate-100">
              {state.lastReport.summary}
            </p>
            {state.lastReport.remaining !== null && (
              <p className="mt-2 text-xs text-cyan-300">
                Credits remaining: {state.lastReport.remaining.toFixed(2)}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => dispatch({ type: "BACK" })}
            disabled={state.stepIndex === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back
          </button>

          <button
            type="button"
            onClick={analyzeCurrent}
            disabled={!canAdvance || state.analyzing}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-600/70 bg-cyan-600/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-600/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            {state.analyzing ? "Analysing…" : `Analyse (${currentStep.creditCost} cr)`}
          </button>

          {!isLast ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "NEXT" })}
              disabled={!canAdvance}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/dashboard"
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Finish · View dashboard
            </Link>
          )}
        </div>
      </section>

      {/* ── Right: live SVI + progress ─────────────────────────────── */}
      <aside className="space-y-4">
        <SviLiveMeter projectId={state.projectId ?? undefined} isActive />
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
          <p className="mb-1 font-medium text-slate-200">How this works</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Answers autosave every ~1s (localStorage + server).</li>
            <li>SVI recomputes after every save + agent pass.</li>
            <li>Credit charges appear only when you hit "Analyse".</li>
            <li>You can leave and resume — nothing is lost.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function ProgressRow({
  currentIndex,
  onJump,
  completedKeys,
}: {
  currentIndex: number;
  onJump: (i: number) => void;
  completedKeys: InterviewStepKey[];
}) {
  const done = new Set(completedKeys);
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Interview steps">
      {INTERVIEW_STEPS.map((s, i) => {
        const isCurrent = i === currentIndex;
        const isDone = done.has(s.key);
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-current={isCurrent ? "step" : undefined}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                isCurrent
                  ? "bg-cyan-500 text-slate-950"
                  : isDone
                  ? "bg-emerald-900/40 text-emerald-200"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700",
              ].join(" ")}
            >
              {isDone && !isCurrent && (
                <Check aria-hidden="true" className="h-3 w-3" />
              )}
              {i + 1}. {s.key.replace(/_/g, " ")}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default InterviewWizard;
