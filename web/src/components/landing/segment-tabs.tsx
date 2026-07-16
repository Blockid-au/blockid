"use client";

/**
 * SegmentTabs — 4-way tab switcher (Founder / Investor / Advisor / Accelerator)
 * for the Homepage v2 pricing + value-prop sections.
 *
 * Provides the active segment to descendants via context. Consumers such as
 * <PricingMatrix /> read it with `useSegment()`. Optional `onSegmentChange`
 * callback also fires for analytics wiring (CRO tracks tab clicks).
 *
 * Sticks under the navbar when scrolled past the hero (top-16 = h-16 navbar).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Segment } from "@/lib/plans-v2";

interface SegmentTabsProps {
  children: ReactNode;
  defaultSegment?: Segment;
  onSegmentChange?: (segment: Segment) => void;
  /** When true, the tab strip sticks below the 64px navbar on scroll. */
  sticky?: boolean;
}

interface SegmentContextValue {
  segment: Segment;
  setSegment: (s: Segment) => void;
}

const SegmentContext = createContext<SegmentContextValue | null>(null);

/** Hook for descendants to read + update the active segment. */
export function useSegment(): SegmentContextValue {
  const ctx = useContext(SegmentContext);
  if (!ctx) {
    throw new Error("useSegment must be used inside <SegmentTabs>");
  }
  return ctx;
}

const TABS: { id: Segment; label: string; sub: string }[] = [
  { id: "founder", label: "Founder", sub: "Build & raise" },
  { id: "investor", label: "Investor", sub: "Screen & track" },
  { id: "advisor", label: "Advisor", sub: "Guide & earn equity" },
  { id: "accelerator", label: "Accelerator", sub: "Run cohorts" },
];

export function SegmentTabs({
  children,
  defaultSegment = "founder",
  onSegmentChange,
  sticky = true,
}: SegmentTabsProps) {
  const [segment, setSegmentState] = useState<Segment>(defaultSegment);

  const setSegment = useCallback(
    (next: Segment) => {
      setSegmentState(next);
      onSegmentChange?.(next);
    },
    [onSegmentChange],
  );

  const ctx = useMemo(() => ({ segment, setSegment }), [segment, setSegment]);

  return (
    <SegmentContext.Provider value={ctx}>
      <div
        className={
          sticky
            ? "sticky top-16 z-30 -mx-4 border-y border-brand-gold/10 bg-brand-navy/85 px-4 backdrop-blur"
            : "border-y border-brand-gold/10"
        }
        role="tablist"
        aria-label="Choose your role"
      >
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto py-3 sm:gap-2">
          {TABS.map((t) => {
            const active = t.id === segment;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`segment-panel-${t.id}`}
                id={`segment-tab-${t.id}`}
                onClick={() => setSegment(t.id)}
                className={[
                  "group relative flex min-w-[8rem] flex-1 flex-col items-start rounded-lg px-4 py-2.5 text-left transition-all duration-200 ease-out sm:min-w-[10rem]",
                  active
                    ? "bg-brand-gold text-brand-navy shadow-[0_0_24px_-8px_rgba(201,169,97,0.55)]"
                    : "border-b-2 border-transparent text-brand-ink-muted hover:-translate-y-[1px] hover:border-brand-cyan hover:text-brand-ink",
                ].join(" ")}
              >
                <span
                  className={
                    active
                      ? "text-sm font-semibold uppercase tracking-wide"
                      : "text-sm font-medium uppercase tracking-wide"
                  }
                >
                  {t.label}
                </span>
                <span
                  className={
                    active
                      ? "text-xs text-brand-navy/75"
                      : "text-xs text-brand-ink-muted/70"
                  }
                >
                  {t.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`segment-panel-${segment}`}
        aria-labelledby={`segment-tab-${segment}`}
      >
        {children}
      </div>
    </SegmentContext.Provider>
  );
}

export default SegmentTabs;
