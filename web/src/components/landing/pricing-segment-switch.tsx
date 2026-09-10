"use client";

/**
 * PricingSegmentSwitch — the two-way Founder | Evaluator switch on /pricing.
 *
 * G12 (2026-09-10, T0268). The four persona tabs (Founder / Investor /
 * Advisor / Accelerator) were retired on 2026-09-07; this is deliberately
 * NOT their return. There are exactly two ladders a visitor can buy
 * self-serve, so there are exactly two tabs:
 *
 *   Founder    → founder_free / founder_starter / founder_growth
 *   Evaluator  → investor_angel "Scout" / investor_advisor "Firm" /
 *                investor_vc_small "Program"
 *
 * Both render through <PricingMatrix segment=… /> so the monthly ↔ annual
 * toggle, "Most popular" ribbon and fine print are shared. The contact-sales
 * row on the page sits below the switch and is visible under both tabs.
 *
 * Deep link: the server page reads `?segment=evaluator` and passes
 * `initialSegment`; switching also rewrites the query string with
 * `history.replaceState` so a copied URL lands on the same tab. The
 * `evaluator_pricing_viewed` analytics event fires every time the Evaluator
 * ladder becomes visible (`via: "deep_link"` on first paint, `"tab"` after a
 * click).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { trackEvent } from "@/lib/analytics";
import { PricingMatrix } from "@/components/landing/pricing-matrix";
import type { Segment } from "@/lib/plans-v2";

export type PricingTab = "founder" | "evaluator";

/** Map the two public tabs onto the plans-v2 catalogue segments. */
export const TAB_TO_SEGMENT: Record<PricingTab, Segment> = {
  founder: "founder",
  evaluator: "investor",
};

/**
 * Resolve a `?segment=` / `?tab=` / legacy `?tier=` query value to a tab.
 * Anything evaluator-shaped (investor, advisor, accelerator, evaluator)
 * lands on Evaluator; everything else — including nothing — is Founder.
 */
export function resolvePricingTab(
  raw: string | string[] | null | undefined,
): PricingTab {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase().trim();
  switch (v) {
    case "evaluator":
    case "evaluators":
    case "investor":
    case "investors":
    case "advisor":
    case "advisors":
    case "accelerator":
    case "accelerators":
    case "program":
      return "evaluator";
    default:
      return "founder";
  }
}

export interface PricingSegmentSwitchProps {
  /** Tab shown on first paint (server reads `?segment=` and passes it). */
  initialSegment?: PricingTab;
  /** Override the tab labels (the /vi page localises them). */
  labels?: Partial<Record<PricingTab, { label: string; sub: string }>>;
  /** Called after every tab change (analytics wiring for callers). */
  onChange?: (tab: PricingTab) => void;
}

const DEFAULT_LABELS: Record<PricingTab, { label: string; sub: string }> = {
  founder: { label: "Founder", sub: "Build, value and raise" },
  evaluator: { label: "Evaluator", sub: "Investors · advisors · programs" },
};

const TAB_ORDER: readonly PricingTab[] = ["founder", "evaluator"];

export function PricingSegmentSwitch({
  initialSegment = "founder",
  labels,
  onChange,
}: PricingSegmentSwitchProps) {
  const [tab, setTabState] = useState<PricingTab>(initialSegment);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // "deep_link" for the very first Evaluator paint, "tab" afterwards.
  const viaRef = useRef<"deep_link" | "tab">("deep_link");

  const setTab = useCallback(
    (next: PricingTab) => {
      viaRef.current = "tab";
      setTabState(next);
      onChange?.(next);
      if (typeof window !== "undefined" && window.history?.replaceState) {
        try {
          const url = new URL(window.location.href);
          if (next === "evaluator") url.searchParams.set("segment", "evaluator");
          else url.searchParams.delete("segment");
          window.history.replaceState(window.history.state, "", url.toString());
        } catch {
          // URL parsing can only fail in exotic embeds — the tab still works.
        }
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (tab !== "evaluator") return;
    trackEvent("evaluator_pricing_viewed", { via: viaRef.current });
  }, [tab]);

  // WAI-ARIA tablist keyboard pattern (two tabs, wraps around).
  const onTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (index + 1) % TAB_ORDER.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = TAB_ORDER.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const next = TAB_ORDER[nextIndex]!;
      setTab(next);
      tabRefs.current[nextIndex]?.focus();
    },
    [setTab],
  );

  return (
    <div data-testid="pricing-segment-switch" data-active-tab={tab}>
      <div className="flex justify-center px-4">
        <div
          role="tablist"
          aria-label="Who are you buying for?"
          className="inline-flex items-stretch rounded-full border border-line-subtle bg-surface-sunken p-1"
        >
          {TAB_ORDER.map((id, index) => {
            const active = id === tab;
            const copy = labels?.[id] ?? DEFAULT_LABELS[id];
            return (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`pricing-tab-${id}`}
                aria-selected={active}
                aria-controls={`pricing-panel-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                className={[
                  "flex min-w-[9rem] flex-col items-center rounded-full px-5 py-2 text-center transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-w-[11rem]",
                  active
                    ? "bg-action text-on-action shadow-sm"
                    : "text-secondary hover:text-primary",
                ].join(" ")}
              >
                <span className="text-sm font-semibold uppercase tracking-wide">
                  {copy.label}
                </span>
                <span
                  className={
                    active ? "text-[11px] text-on-action/85" : "text-[11px] text-tertiary"
                  }
                >
                  {copy.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`pricing-panel-${tab}`}
        aria-labelledby={`pricing-tab-${tab}`}
      >
        <PricingMatrix segment={TAB_TO_SEGMENT[tab]} />
      </div>
    </div>
  );
}

export default PricingSegmentSwitch;
