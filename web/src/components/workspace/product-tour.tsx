"use client";

// Track B B7 — interactive product tour overlay.
//
// Persistent header banner that surfaces "You are on Phase X of 12 — [label]"
// with a link into the matching guide chapter at /workspace/guide/<slug>.
// Dismissal is stored per-phase in localStorage, so the banner comes back on
// the next phase transition rather than only on first visit.

import * as React from "react";
import Link from "next/link";
import { MapPin, X } from "lucide-react";

import { useLocale, type Locale } from "@/lib/use-locale";
import { PHASE_COUNT } from "@/lib/showcase/gallery";
import {
  buildTourState,
  shouldShowTour,
  type TourPhaseInput,
  type TourPhaseStatus,
} from "@/lib/product-tour/tour-state";

const DISMISS_KEY = "blockid_tour_dismissed_phase";

interface PhaseProgressResponse {
  ok?: boolean;
  phases?: Array<{
    order?: number;
    status?: string;
    completionPct?: number;
  }>;
}

const COPY: Record<Locale, {
  prefix: string;
  of: string;
  read: string;
  dismiss: string;
}> = {
  en: {
    prefix: "You are on Phase",
    of: "of",
    read: "Read this chapter →",
    dismiss: "Dismiss product tour",
  },
  vi: {
    prefix: "Bạn đang ở Giai đoạn",
    of: "/",
    read: "Đọc chương này →",
    dismiss: "Ẩn hướng dẫn sản phẩm",
  },
};

function readDismissed(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDismissed(phase: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(phase));
  } catch {
    // localStorage blocked (private mode / SSR) — treat as tab-scoped dismiss.
  }
}

export function ProductTour(): React.ReactElement | null {
  const [locale] = useLocale();
  const [phases, setPhases] = React.useState<TourPhaseInput[] | null>(null);
  const [dismissedPhase, setDismissedPhase] = React.useState<number | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setDismissedPhase(readDismissed());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/svi/phase-progress", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as PhaseProgressResponse;
        if (cancelled) return;
        const rows: TourPhaseInput[] = (json.phases ?? [])
          .filter((p) => typeof p.order === "number")
          .map((p) => ({
            order: p.order as number,
            status: (p.status as TourPhaseStatus | undefined) ?? "not_started",
            completionPct: p.completionPct ?? 0,
          }));
        setPhases(rows);
      } catch {
        // Non-fatal — the banner just stays hidden.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated || loading || phases == null) return null;

  const state = buildTourState(phases);
  if (
    !shouldShowTour({ currentPhase: state.currentPhase, dismissedPhase }) ||
    state.currentPhase == null ||
    state.chapterSlug == null ||
    state.label == null
  ) {
    return null;
  }

  const copy = COPY[locale];
  const phaseLabel = state.label[locale];
  const message =
    copy.prefix +
    " " +
    state.currentPhase +
    " " +
    copy.of +
    " " +
    PHASE_COUNT +
    ": " +
    phaseLabel;

  function handleDismiss(): void {
    if (state.currentPhase == null) return;
    writeDismissed(state.currentPhase);
    setDismissedPhase(state.currentPhase);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="product-tour-banner"
      className="border-b border-brand-300 bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-100 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
    >
      <span className="text-sm font-medium flex-1 flex items-center gap-2">
        <MapPin strokeWidth={1.75} className="h-4 w-4 shrink-0" aria-hidden />
        {message}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={"/workspace/guide/" + state.chapterSlug}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white ring-1 ring-current/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          {copy.read}
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={copy.dismiss}
          className="text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-white/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
