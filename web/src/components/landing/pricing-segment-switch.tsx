"use client";

/**
 * PricingSegmentSwitch — the Founder | Evaluator | Programs switch on /pricing.
 *
 * G12 (2026-09-10, T0268) replaced the four retired persona tabs with two
 * self-serve ladders; Pricing v4 (2026-09-16, plan §3.2) adds the third —
 * one tab per ladder a visitor can buy self-serve:
 *
 *   Founder    → founder_free / founder_starter / founder_growth
 *   Evaluator  → investor_angel "Scout" / investor_advisor "Firm" /
 *                investor_vc_small "Program" / investor_fund "Fund"
 *   Programs   → accelerator_intake "Intake link" / accelerator_starter
 *                "Cohort 25" / accelerator_growth "Cohort 100" (annual-first)
 *
 * Both render through <PricingMatrix segment=… /> so the monthly ↔ annual
 * toggle, "Most popular" ribbon and fine print are shared. The contact-sales
 * row on the page sits below the switch and is visible under both tabs.
 *
 * Deep link: `?segment=evaluator` (also `?persona=` from the deck v3 /
 * G14 links, `?tab=`, legacy `?tier=`) is read
 * from `window.location` after mount (`readTabFromUrl` prop, default on)
 * — S31-D made /pricing a static, edge-cached page, so the server can no
 * longer read `searchParams` for it. The document always carries the
 * Founder ladder; a deep link switches within the first paint after
 * hydration. Callers that know the tab (the /vi page) still pass
 * `initialSegment`. Switching also rewrites the query string with
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
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { trackEvent } from "@/lib/analytics";
import { PricingMatrix } from "@/components/landing/pricing-matrix";
import {
  PRICING_TABS,
  TAB_TO_SEGMENT,
  resolvePricingTab,
  type PricingTab,
} from "@/components/landing/pricing-tab";

export { TAB_TO_SEGMENT, resolvePricingTab };
export type { PricingTab };

export interface PricingSegmentSwitchProps {
  /** Tab shown on first paint when the caller already knows it. */
  initialSegment?: PricingTab;
  /**
   * Resolve the deep-link tab from `window.location` after mount
   * (`?segment=` / `?persona=` / `?tab=` / `?tier=`). Default true; the vi page passes
   * `initialSegment` and leaves this on too so its deep links keep working.
   */
  readTabFromUrl?: boolean;
  /** Override the tab labels (the /vi page localises them). */
  labels?: Partial<Record<PricingTab, { label: string; sub: string }>>;
  /** Called after every tab change (analytics wiring for callers). */
  onChange?: (tab: PricingTab) => void;
  /** Plan ids with an annual Stripe Price — forwarded to <PricingMatrix>. */
  annualAvailable?: readonly string[];
  purchasable?: readonly string[];
}

const DEFAULT_LABELS: Record<PricingTab, { label: string; sub: string }> = {
  founder: { label: "Founder", sub: "Build, value and raise" },
  evaluator: { label: "Evaluator", sub: "Angels · firms · VC funds" },
  programs: { label: "Programs", sub: "Accelerators · incubators · universities" },
};

const TAB_ORDER: readonly PricingTab[] = PRICING_TABS;

function subscribeNever(): () => void {
  return () => {};
}
function noTab(): PricingTab | null {
  return null;
}
/**
 * `?segment=` / `?persona=` (deck v3 alias, G14 §2.4) / `?tab=` / legacy
 * `?tier=` → tab, or null when absent (or on the server).
 */
export function tabFromLocation(): PricingTab | null {
  if (typeof window === "undefined") return null;
  try {
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get("segment") ?? sp.get("persona") ?? sp.get("tab") ?? sp.get("tier");
    return raw === null ? null : resolvePricingTab(raw);
  } catch {
    return null; // URL parsing can only fail in exotic embeds — the default tab stands.
  }
}

export function PricingSegmentSwitch({
  initialSegment = "founder",
  readTabFromUrl = true,
  labels,
  onChange,
  annualAvailable,
  purchasable,
}: PricingSegmentSwitchProps) {
  // The URL is an external store: "no tab" while hydrating (matches the
  // server document), the deep-linked tab on the first client render. A
  // click then overrides it for the rest of the visit.
  const urlTab = useSyncExternalStore(subscribeNever, readTabFromUrl ? tabFromLocation : noTab, noTab);
  const [chosen, setTabState] = useState<PricingTab | null>(null);
  const tab: PricingTab = chosen ?? urlTab ?? initialSegment;
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
          if (next === "founder") url.searchParams.delete("segment");
          else url.searchParams.set("segment", next);
          window.history.replaceState(window.history.state, "", url.toString());
        } catch {
          // URL parsing can only fail in exotic embeds — the tab still works.
        }
      }
    },
    [onChange],
  );

  useEffect(() => {
    // Both non-founder ladders are evaluator surfaces for GA4 — the tab
    // param tells the Programs and Evaluator views apart.
    if (tab === "founder") return;
    trackEvent("evaluator_pricing_viewed", { via: viaRef.current, tab: tab === "programs" ? "programs" : "evaluator" });
  }, [tab]);

  // WAI-ARIA tablist keyboard pattern (three tabs, wraps around).
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
                  "flex min-w-[7rem] flex-col items-center rounded-full px-4 py-2 text-center transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-w-[10rem] sm:px-5",
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
        <PricingMatrix segment={TAB_TO_SEGMENT[tab]} annualAvailable={annualAvailable} purchasable={purchasable} />
      </div>
    </div>
  );
}

export default PricingSegmentSwitch;
