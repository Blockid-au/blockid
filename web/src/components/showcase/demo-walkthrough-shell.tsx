"use client";

/**
 * DemoWalkthroughShell — sticky top bar + prev/next navigation for the
 * /showcase/atlassian/* guided demo walkthrough.
 *
 * Kept intentionally lightweight — NOT reusing web/src/components/workspace
 * /product-tour.tsx because that component is user/workspace-scoped
 * (Supabase-backed tour state, dismissible per-user). This shell is a pure
 * public-page component with zero auth, zero DB, zero remembered state.
 *
 * Contract:
 *   - `currentStep` is server-provided and authoritative. If the URL's
 *     `?step=` query param disagrees, the server value wins and the URL
 *     query is treated as a hint only (no client-side rewrite).
 *   - Prev/next update the URL via router.push() to the target step's
 *     `path + '?step=' + n` — deep links stay consistent.
 *   - Keyboard: ArrowRight/ArrowLeft navigate, Escape returns to
 *     /showcase/atlassian. All routed through the pure key-to-action
 *     mapper in steps.ts for testability.
 *
 * A11y:
 *   - Sticky bar has role="region" aria-label="Walkthrough navigation".
 *   - Buttons have descriptive aria-labels and disabled state at boundaries.
 *   - Focus ring is visible (uses the default tailwind focus-visible ring).
 */

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ATLASSIAN_WALKTHROUGH_EXIT_PATH,
  ATLASSIAN_WALKTHROUGH_TOTAL,
  buildStepUrl,
  formatStepHeading,
  getNextStep,
  getPrevStep,
  getStepByNumber,
  keyToNavAction,
} from "@/lib/showcase/atlassian/steps";
import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";

export interface DemoWalkthroughShellProps {
  /** 1-indexed step number, authoritative even if the URL disagrees. */
  currentStep: number;
  /** Content of the current step's page. */
  children: React.ReactNode;
  /** Defaults to the walkthrough length; override for shorter demos. */
  totalSteps?: number;
  /** Brand hook for future multi-brand support. */
  brand?: "atlassian";
}

export function DemoWalkthroughShell({
  currentStep,
  children,
  totalSteps = ATLASSIAN_WALKTHROUGH_TOTAL,
  brand: _brand = "atlassian",
}: DemoWalkthroughShellProps) {
  const router = useRouter();
  const step = getStepByNumber(currentStep);
  const prev = getPrevStep(currentStep);
  const next = getNextStep(currentStep);

  const goTo = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      // Ignore key events while a form control is focused so typing in
      // an input inside a mirror page doesn't hijack the walkthrough.
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      const action = keyToNavAction(event.key, currentStep);
      if (!action) return;
      event.preventDefault();
      if (action.kind === "exit") {
        goTo(action.targetPath);
      } else {
        goTo(buildStepUrl(action.target));
      }
    },
    [currentStep, goTo],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (!step) {
    // Out-of-range step — render children with no shell so the page still
    // works if someone deep-links a bad step number.
    return <>{children}</>;
  }

  const heading = formatStepHeading(step, totalSteps);
  const phase = Number(step.phaseSlug);

  return (
    <>
      <div
        role="region"
        aria-label="Walkthrough navigation"
        className="sticky top-0 z-40 border-b border-brand-200 bg-brand-50/95 backdrop-blur"
      >
        <div className="mx-auto max-w-5xl px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-brand-700">
              Atlassian demo
            </span>
            <span className="text-sm font-semibold text-ink-900">{heading}</span>
            {Number.isFinite(phase) && (
              <CanonicalStageBadge phase={phase} className="ml-1" />
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => prev && goTo(buildStepUrl(prev))}
                disabled={!prev}
                aria-label={
                  prev
                    ? `Previous step — ${prev.title}`
                    : "Previous step (disabled — first step)"
                }
                data-testid="walkthrough-prev"
                className="rounded border border-brand-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => next && goTo(buildStepUrl(next))}
                disabled={!next}
                aria-label={
                  next
                    ? `Next step — ${next.title}`
                    : "Next step (disabled — last step)"
                }
                data-testid="walkthrough-next"
                className="rounded border border-brand-500 bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
              <Link
                href={ATLASSIAN_WALKTHROUGH_EXIT_PATH}
                aria-label="Dismiss walkthrough and return to landing"
                data-testid="walkthrough-dismiss"
                className="rounded border border-ink-300 bg-white px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
              >
                Dismiss
              </Link>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-600">{step.guideText}</p>
        </div>
      </div>
      {children}
    </>
  );
}
