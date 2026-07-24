"use client";

// Product Tour v2 — <FeatureSpotlight />
//
// A per-route feature walkthrough. On mount the component matches the current
// pathname against the feature-tour registry; if a tour is registered for the
// route AND the user has not dismissed the current version, it renders a
// bottom-anchored spotlight card the user can step through. Dismissal is
// stored per-tour in localStorage, versioned so an authoring bump re-surfaces
// the tour for returning users.
//
// Ships zero external deps beyond lucide-react and Next.js — the anchor
// behaviour is best-effort (a bounding-box highlight over the anchor element,
// scroll-into-view once) so the component still works cleanly when the target
// selector does not exist on the current page.

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { useLocale } from "@/lib/use-locale";
import {
  dismissKeyFor,
  getFeatureTour,
  pickLocale,
  shouldShowFeatureTour,
  tourForRoute,
  type FeatureTour,
  type FeatureTourSlug,
} from "@/lib/product-tour/feature-tours";
import { TourIcon, TourMedia } from "./tour-media";

interface Props {
  /** Force a specific tour instead of route-detecting — useful for tests. */
  forceSlug?: string;
  /** Override pathname (for storybook / testing). */
  pathnameOverride?: string;
}

const COPY = {
  en: {
    step: "Step",
    of: "of",
    next: "Next",
    back: "Back",
    finish: "Finish tour",
    dismiss: "Dismiss tour",
  },
  vi: {
    step: "Bước",
    of: "trên",
    next: "Tiếp",
    back: "Quay lại",
    finish: "Kết thúc",
    dismiss: "Ẩn hướng dẫn",
  },
} as const;

function readDismissedVersion(slug: FeatureTourSlug): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(dismissKeyFor(slug));
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDismissedVersion(slug: FeatureTourSlug, version: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dismissKeyFor(slug), String(version));
  } catch {
    // Non-fatal — private mode etc.
  }
}

/** Renders the feature spotlight overlay if the current route has a tour. */
export function FeatureSpotlight({
  forceSlug,
  pathnameOverride,
}: Props = {}): React.ReactElement | null {
  const [locale] = useLocale();
  const pathname = usePathname() ?? "";
  const activePath = pathnameOverride ?? pathname;

  const tour: FeatureTour | undefined = React.useMemo(() => {
    if (forceSlug) return getFeatureTour(forceSlug);
    return tourForRoute(activePath);
  }, [forceSlug, activePath]);

  const [hydrated, setHydrated] = React.useState(false);
  const [dismissedVersion, setDismissedVersion] = React.useState<number | null>(
    null,
  );
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    setHydrated(true);
    if (tour) setDismissedVersion(readDismissedVersion(tour.slug));
    setStepIndex(0);
  }, [tour]);

  // Best-effort scroll-into-view for the current anchor.
  React.useEffect(() => {
    if (!hydrated || !tour) return;
    const anchor = tour.steps[stepIndex]?.anchor;
    if (!anchor) return;
    try {
      const el = document.querySelector(anchor);
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    } catch {
      // Bad selector — safe to ignore, spotlight still renders centered.
    }
  }, [hydrated, tour, stepIndex]);

  if (!hydrated || !tour) return null;
  if (!shouldShowFeatureTour({ tour, dismissedVersion })) return null;

  const step = tour.steps[stepIndex];
  if (!step) return null;

  const copy = COPY[locale];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === tour.steps.length - 1;

  function handleDismiss() {
    if (!tour) return;
    writeDismissedVersion(tour.slug, tour.version);
    setDismissedVersion(tour.version);
  }

  function handleNext() {
    if (isLast) {
      handleDismiss();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, tour!.steps.length - 1));
  }

  function handleBack() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={"feature-spotlight-title-" + tour.slug}
      data-testid="feature-spotlight"
      data-tour-slug={tour.slug}
      data-step-index={stepIndex}
      className="fixed z-40 bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] max-w-full pointer-events-auto"
    >
      <div className="rounded-2xl border border-surface-200 bg-white/95 dark:bg-surface-900/95 dark:border-surface-700 shadow-xl backdrop-blur-sm overflow-hidden">
        <header className="flex items-start gap-3 px-4 pt-4">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            <TourIcon icon={tour.icon} className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-500">
              {copy.step} {stepIndex + 1} {copy.of} {tour.steps.length}
            </p>
            <h2
              id={"feature-spotlight-title-" + tour.slug}
              className="mt-0.5 text-sm font-semibold text-ink-800 dark:text-ink-100 truncate"
            >
              {pickLocale(step.title, locale)}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={copy.dismiss}
            className="shrink-0 rounded-md p-1 text-ink-500 hover:bg-surface-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {step.media ? (
          <div className="px-4 mt-3">
            <TourMedia media={step.media} label={pickLocale(step.title, locale)} />
          </div>
        ) : null}

        <div className="px-4 pt-3 pb-2 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
          {pickLocale(step.body, locale)}
        </div>

        <footer className="flex items-center justify-between gap-2 px-3 py-2 border-t border-surface-100 dark:border-surface-800 bg-surface-50/60 dark:bg-surface-900/60">
          <div className="flex items-center gap-1" aria-hidden>
            {tour.steps.map((_, i) => (
              <span
                key={i}
                className={
                  "h-1.5 rounded-full transition-all " +
                  (i === stepIndex
                    ? "w-4 bg-brand-600"
                    : "w-1.5 bg-surface-300 dark:bg-surface-600")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {!isFirst ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-700 dark:text-ink-200 hover:bg-surface-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                {copy.back}
              </button>
            ) : null}
            {isLast && step.cta ? (
              <Link
                href={step.cta.href}
                onClick={handleDismiss}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                {pickLocale(step.cta.label, locale)}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                {isLast ? copy.finish : copy.next}
                {!isLast ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : null}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
