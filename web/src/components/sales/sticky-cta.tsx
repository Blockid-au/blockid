"use client";

/**
 * StickyCta — persistent conversion pill mounted on marketing surfaces.
 *
 * Layout:
 *   - Bottom-right pill (desktop) with label + subtext.
 *   - Full-width bar (< sm breakpoint) so it never overlaps footer links.
 *
 * Behaviour:
 *   - Copy + href pulled from `getCtaVariant(phase, surface)` unless the
 *     caller overrides them.
 *   - Dismiss button hides the CTA for 7 days via localStorage under
 *     `bid_sticky_cta_dismissed_v1` (per-variant key so a different
 *     surface still gets a shot).
 *   - Fires `cta_view` once when the pill first mounts, `cta_click`
 *     when the label is clicked. Uses window.gtag if defined (GTM
 *     dataLayer as a fallback), matching the analytics guard already
 *     used by `@/lib/analytics`.
 *   - Respects `prefers-reduced-motion` (no slide-up animation).
 */

import * as React from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import {
  getCtaVariant,
  type CtaSurface,
  type SviPhase,
} from "@/lib/sales/cta-variants";

interface StickyCtaProps {
  variant: CtaSurface;
  /** Phase override; defaults to "validation" (the safest evergreen copy). */
  phase?: SviPhase;
  hrefOverride?: string;
  labelOverride?: string;
  /** Free-form analytics tag so we can distinguish placements. */
  location?: string;
}

const DISMISS_KEY_PREFIX = "bid_sticky_cta_dismissed_v1";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function fireGa(event: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
  };
  try {
    w.gtag?.("event", event, params);
  } catch {
    /* ignore */
  }
  try {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ...params });
  } catch {
    /* ignore */
  }
}

function readDismiss(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function writeDismiss(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
}

const TONE_CLASS: Record<string, string> = {
  accent:
    "bg-[var(--fintech-accent,#22d3ee)] text-[var(--fintech-bg-primary,#0b1120)] hover:bg-[var(--fintech-accent-hover,#67e8f9)]",
  amber:
    "bg-amber-500 text-white hover:bg-amber-600",
  emerald:
    "bg-emerald-600 text-white hover:bg-emerald-700",
};

export function StickyCta({
  variant,
  phase = "validation",
  hrefOverride,
  labelOverride,
  location,
}: StickyCtaProps): React.ReactElement | null {
  const cta = getCtaVariant(phase, variant);
  const href = hrefOverride ?? cta.href;
  const label = labelOverride ?? cta.label;
  const dismissKey = `${DISMISS_KEY_PREFIX}:${variant}`;

  const [mounted, setMounted] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true);
  const viewFired = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
    setDismissed(readDismiss(dismissKey));
  }, [dismissKey]);

  React.useEffect(() => {
    if (!mounted || dismissed || viewFired.current) return;
    viewFired.current = true;
    fireGa("cta_view", {
      location: location ?? variant,
      variant,
      phase,
      plan_hint: href,
    });
  }, [mounted, dismissed, location, variant, phase, href]);

  if (!mounted || dismissed) return null;

  const handleClick = () => {
    fireGa("cta_click", {
      location: location ?? variant,
      variant,
      phase,
      plan_hint: href,
    });
  };

  const handleDismiss = () => {
    writeDismiss(dismissKey);
    setDismissed(true);
    fireGa("cta_dismiss", { location: location ?? variant, variant });
  };

  const toneClass = TONE_CLASS[cta.tone] ?? TONE_CLASS.accent;

  return (
    <div
      role="complementary"
      aria-label="Conversion call to action"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <div className="pointer-events-auto flex items-stretch gap-2 border-t border-white/10 bg-[var(--fintech-bg-elevated,#111827)]/95 p-3 shadow-2xl backdrop-blur sm:rounded-2xl sm:border sm:border-white/10 sm:p-2 sm:pr-3">
        <Link
          href={href}
          onClick={handleClick}
          data-testid="sticky-cta-link"
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors sm:flex-none ${toneClass}`}
        >
          <span className="flex flex-col items-start text-left sm:items-center sm:text-center">
            <span>{label}</span>
            {cta.subtext ? (
              <span className="hidden text-[10px] font-medium opacity-80 sm:block">
                {cta.subtext}
              </span>
            ) : null}
          </span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss call to action"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent,#22d3ee)]"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default StickyCta;
