"use client";

// FloatingStack — ONE bottom-right slot for every floating pill (G29 lane C).
//
// Before: the cookie-prefs pill sat bottom-left (`fixed bottom-3 left-3`), the
// feedback FAB bottom-right (`bottom-5 right-5`), the report Q&A FAB also
// bottom-right (`bottom-4 right-4`, z-40 under the feedback z-50) and the
// workspace shell mounted the feedback FAB a SECOND time on top of the root
// layout's copy. At 375 px the pills covered each other and whatever primary
// CTA sat at the foot of the page.
//
// Now: `FloatingStackHost` renders one `fixed` flex column at the bottom-right
// (safe-area aware: `env(safe-area-inset-bottom/right)`), and each pill portals
// into it through `FloatingSlot`. Slots stack vertically in a fixed order —
// lower `order` sits higher — so nothing overlaps whatever else is mounted.
// A page whose own fixed bar owns the foot of the viewport (the pricing sticky
// CTA) lifts the whole stack with `setFloatingStackLift(px)`.
//
// The host lives in the root layout OUTSIDE <Providers> (like the consent
// banner) so it hydrates independently; a slot rendered before the host has
// mounted (or in a unit test with no host) falls back to rendering its child
// in a fixed bottom-right wrapper, so behaviour never regresses to "missing".

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export const FLOATING_STACK_ID = "floating-stack";

/** Stack order (top → bottom). Keep the primary action (feedback) closest to the thumb. */
export const FLOATING_SLOT = Object.freeze({
  /** Report Q&A FAB on the paid report page — page-specific, sits on top. */
  reportChat: 10,
  /** OAIC APP 6 revocable-consent pill — secondary, above the FAB. */
  cookiePrefs: 20,
  /** Feedback FAB — the one brand-coloured action; bottom of the stack. */
  feedback: 30,
});

const LIFT_VAR = "--floating-stack-lift";

/**
 * Lift the stack above a page-owned fixed bottom bar (px). Pass 0 to clear.
 * Used by `StickyCta` on mobile, where the bar spans the whole viewport foot.
 */
export function setFloatingStackLift(px: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (px > 0) root.style.setProperty(LIFT_VAR, `${Math.round(px)}px`);
  else root.style.removeProperty(LIFT_VAR);
}

/**
 * Lift the stack above a page-owned fixed bottom element while `active` —
 * by the element's live height (ResizeObserver), optionally only below a
 * viewport width (`belowPx`, e.g. 640 for a bar that is full-width under
 * `sm`). Cleared on unmount / deactivation. StickyCta (pricing) and the
 * FeatureSpotlight card (bottom-right tour sheet) use it so the pills never
 * cover their primary button.
 */
export function useFloatingStackLift(ref: React.RefObject<HTMLElement | null>, active: boolean, belowPx?: number): void {
  React.useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const mq = typeof belowPx === "number" ? window.matchMedia(`(max-width: ${belowPx - 1}px)`) : null;
    const apply = () => setFloatingStackLift(mq && !mq.matches ? 0 : el.getBoundingClientRect().height + 12);
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    mq?.addEventListener("change", apply);
    return () => {
      ro?.disconnect();
      mq?.removeEventListener("change", apply);
      setFloatingStackLift(0);
    };
  }, [ref, active, belowPx]);
}

/** Shared positioning for the host and the no-host fallback. */
export const FLOATING_STACK_CLASS =
  "fixed z-[70] flex flex-col items-end gap-3 pointer-events-none print:hidden " +
  "right-[max(1rem,env(safe-area-inset-right))] " +
  "bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--floating-stack-lift,0px))] " +
  "max-w-[calc(100vw-2rem)]";

export function FloatingStackHost(): React.ReactElement {
  return <div id={FLOATING_STACK_ID} data-testid="floating-stack" className={FLOATING_STACK_CLASS} />;
}

function useHost(): HTMLElement | null {
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the host is a sibling subtree; it only exists after hydration
    setHost(document.getElementById(FLOATING_STACK_ID));
  }, []);
  return host;
}

export interface FloatingSlotProps {
  /** `FLOATING_SLOT.*` — lower sits higher in the column. */
  order: number;
  /** Test id on the slot wrapper. */
  testId?: string;
  className?: string;
  children: React.ReactNode;
}

/** One pill's slot in the stack. Renders nothing until mounted (SSR-safe). */
export function FloatingSlot({ order, testId, className, children }: FloatingSlotProps): React.ReactElement | null {
  const host = useHost();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only on the client
    setMounted(true);
  }, []);
  if (!mounted) return null;
  const slot = (
    <div data-testid={testId} data-floating-slot={order} className={cn("pointer-events-auto flex flex-col items-end", className)} style={{ order }}>
      {children}
    </div>
  );
  if (host) return createPortal(slot, host);
  // No host (root layout not mounted, unit test): keep the pill bottom-right on its own.
  return <div className={FLOATING_STACK_CLASS}>{slot}</div>;
}
