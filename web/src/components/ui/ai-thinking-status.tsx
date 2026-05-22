"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * AIThinkingStatus — Reusable ChatGPT-style thinking/processing indicator.
 *
 * Shows step-by-step progress when AI is working, so users never see
 * just a spinner. Each operation defines its own steps; the component
 * renders them with animations as they complete.
 *
 * Usage:
 *   <AIThinkingStatus
 *     steps={steps}
 *     isActive={isAnalyzing}
 *     title="Analyzing your evidence"
 *   />
 *
 * Where steps is:
 *   [{ id: "parse", label: "Parsing document", status: "done" },
 *    { id: "extract", label: "Extracting signals", status: "active" },
 *    { id: "score", label: "Computing score", status: "pending" }]
 */

export interface ThinkingStep {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "active" | "done" | "error";
}

interface AIThinkingStatusProps {
  steps: ThinkingStep[];
  isActive: boolean;
  title?: string;
  compact?: boolean; // Inline mode (for buttons/modals)
  className?: string;
}

/* ── Animated thinking globe ───────────────────────────────────────────── */
function ThinkingGlobe({ size = 20 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" className="animate-spin" style={{ width: size, height: size, animationDuration: "2.5s" }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="18 38" className="text-brand-400" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0 text-brand-600" style={{ width: size, height: size }}>
        <circle cx="11" cy="11" r="5" />
        <line x1="16.5" y1="16.5" x2="20" y2="20" />
      </svg>
    </div>
  );
}

/* ── Bouncing dots ─────────────────────────────────────────────────────── */
function BouncingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

/* ── Step status icons ─────────────────────────────────────────────────── */
function StepIcon({ status }: { status: ThinkingStep["status"] }) {
  switch (status) {
    case "done":
      return (
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 text-emerald-500 shrink-0">
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "active":
      return (
        <span className="relative flex h-4 w-4 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-50" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-brand-500" />
        </span>
      );
    case "error":
      return (
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 text-red-500 shrink-0">
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
          <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default: // pending
      return (
        <span className="h-4 w-4 rounded-full border-2 border-surface-300 shrink-0" />
      );
  }
}

/* ── Compact mode (inline, for button/modal use) ───────────────────────── */
function CompactStatus({ steps, title }: { steps: ThinkingStep[]; title: string }) {
  const activeStep = steps.find((s) => s.status === "active");
  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="flex items-center gap-2.5">
      <ThinkingGlobe size={16} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-brand-700">{title}</span>
          <BouncingDots />
        </div>
        {activeStep && (
          <p className="text-[11px] text-brand-600/80 truncate mt-0.5">
            {activeStep.label}
            {activeStep.detail ? ` — ${activeStep.detail}` : ""}
          </p>
        )}
      </div>
      <span className="text-[10px] text-ink-400 tabular-nums shrink-0">
        {doneCount}/{steps.length}
      </span>
    </div>
  );
}

/* ── Full mode (card, for main analysis view) ──────────────────────────── */
function FullStatus({ steps, title }: { steps: ThinkingStep[]; title: string }) {
  const [expanded, setExpanded] = React.useState(true);
  const activeStep = steps.find((s) => s.status === "active");
  const doneSteps = steps.filter((s) => s.status === "done");

  return (
    <div className="rounded-2xl border border-brand-200/70 bg-gradient-to-b from-brand-50/80 to-white overflow-hidden shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/50 transition-colors cursor-pointer"
      >
        <ThinkingGlobe />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-brand-700">{title}</span>
            <BouncingDots />
          </div>
          {activeStep && (
            <p className="text-xs text-brand-600/80 mt-0.5 truncate">
              {activeStep.label}
              {activeStep.detail ? ` — ${activeStep.detail}` : ""}
            </p>
          )}
        </div>
        <span className="text-xs text-ink-400 tabular-nums shrink-0">
          {doneSteps.length}/{steps.length}
        </span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={cn(
            "h-3.5 w-3.5 text-brand-400 transition-transform duration-200 shrink-0",
            expanded ? "rotate-180" : "",
          )}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Step list */}
      {expanded && (
        <div className="border-t border-brand-100/60 px-4 py-2.5 space-y-2 bg-white/60">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-2.5",
                step.status === "done" && "animate-in fade-in slide-in-from-left-2 duration-200",
                step.status === "active" && "animate-in fade-in duration-300",
              )}
              style={step.status === "done" ? { animationDelay: `${i * 30}ms` } : undefined}
            >
              <div className="mt-0.5">
                <StepIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "text-xs font-medium",
                    step.status === "done" && "text-ink-600",
                    step.status === "active" && "text-brand-700 font-semibold",
                    step.status === "pending" && "text-ink-400",
                    step.status === "error" && "text-red-600",
                  )}
                >
                  {step.label}
                </span>
                {step.detail && step.status !== "pending" && (
                  <p className={cn(
                    "text-[11px] leading-snug mt-0.5",
                    step.status === "active" ? "text-brand-600" : "text-ink-500",
                  )}>
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main export ───────────────────────────────────────────────────────── */
export function AIThinkingStatus({
  steps,
  isActive,
  title = "BlockID AI is analyzing",
  compact = false,
  className,
}: AIThinkingStatusProps) {
  if (!isActive || steps.length === 0) return null;

  return (
    <div className={cn("animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
      {compact ? (
        <CompactStatus steps={steps} title={title} />
      ) : (
        <FullStatus steps={steps} title={title} />
      )}
    </div>
  );
}

/* ── Hook: useAIThinking — manages step state for any AI operation ───── */

export function useAIThinking(stepDefs: Array<{ id: string; label: string }>) {
  const [steps, setSteps] = React.useState<ThinkingStep[]>(() =>
    stepDefs.map((s) => ({ ...s, status: "pending" as const })),
  );
  const [isActive, setIsActive] = React.useState(false);

  const start = React.useCallback(() => {
    setSteps(stepDefs.map((s) => ({ ...s, status: "pending" as const })));
    setIsActive(true);
    // Auto-activate first step
    setSteps((prev) => prev.map((s, i) => (i === 0 ? { ...s, status: "active" as const } : s)));
  }, [stepDefs]);

  const advance = React.useCallback((stepId: string, detail?: string) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      return prev.map((s, i) => {
        if (i < idx) return { ...s, status: "done" as const };
        if (i === idx) return { ...s, status: "active" as const, detail };
        return s;
      });
    });
  }, []);

  const complete = React.useCallback((stepId: string, detail?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status: "done" as const, detail } : s)),
    );
  }, []);

  const completeAll = React.useCallback(() => {
    setSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
    setTimeout(() => setIsActive(false), 1500);
  }, []);

  const fail = React.useCallback((stepId: string, detail?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status: "error" as const, detail } : s)),
    );
  }, []);

  const reset = React.useCallback(() => {
    setSteps(stepDefs.map((s) => ({ ...s, status: "pending" as const })));
    setIsActive(false);
  }, [stepDefs]);

  return { steps, isActive, start, advance, complete, completeAll, fail, reset };
}

/* ── Predefined step sets for common operations ────────────────────────── */

export const EVIDENCE_ANALYSIS_STEPS = [
  { id: "parse", label: "Parsing your document" },
  { id: "extract", label: "Extracting startup signals" },
  { id: "map", label: "Mapping to SVI dimensions" },
  { id: "score", label: "Computing impact score" },
  { id: "recommend", label: "Generating recommendations" },
];

export const FULL_REPORT_STEPS = [
  { id: "gather", label: "Gathering all evidence data" },
  { id: "dimensions", label: "Analyzing 8 SVI dimensions" },
  { id: "narrative", label: "Writing narrative analysis" },
  { id: "benchmarks", label: "Computing benchmarks" },
  { id: "actions", label: "Building action plan" },
  { id: "format", label: "Formatting final report" },
];

export const DIMENSION_ANALYSIS_STEPS = [
  { id: "context", label: "Loading dimension context" },
  { id: "analyze", label: "Deep-diving into data" },
  { id: "compare", label: "Benchmarking against peers" },
  { id: "recommend", label: "Crafting recommendations" },
];

export const PITCH_DECK_STEPS = [
  { id: "data", label: "Collecting SVI & evidence data" },
  { id: "structure", label: "Structuring 12-slide deck" },
  { id: "content", label: "Writing slide content" },
  { id: "format", label: "Generating document" },
];

export const EVIDENCE_CONNECT_STEPS = [
  { id: "verify", label: "Verifying URL is reachable" },
  { id: "scan", label: "Scanning for signals" },
  { id: "save", label: "Saving to Evidence Vault" },
  { id: "rescore", label: "Updating your SVI score" },
];

export const SECTION_ANALYSIS_STEPS = [
  { id: "input", label: "Processing your input" },
  { id: "scrape", label: "Scanning website & tech stack" },
  { id: "svi", label: "Computing SVI score" },
  { id: "generate", label: "Generating selected sections" },
  { id: "save", label: "Saving results" },
];
