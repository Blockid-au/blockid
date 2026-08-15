"use client";

import { useEffect, type ReactNode } from "react";

function fireGtag(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void })
    .gtag;
  if (typeof gtag !== "function") return;
  gtag("event", event, params);
}

/** Fires `home_view` once on mount. */
export function HomeViewTracker() {
  useEffect(() => {
    fireGtag("home_view", {
      page_location:
        typeof window === "undefined" ? undefined : window.location.href,
    });
  }, []);
  return null;
}

/**
 * Anchor that fires the provided cta_* event through window.gtag on click.
 * Two visual variants: `primary` (solid white) and `ghost` (border only).
 */
export function HomeCtaTracker({
  event,
  href,
  variant,
  children,
}: {
  event: `cta_${string}`;
  href: string;
  variant: "primary" | "ghost";
  children: ReactNode;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold transition-colors";
  const styles =
    variant === "primary"
      ? "bg-white text-[#0A0F1E] hover:bg-white/90"
      : "border border-white/20 text-white hover:bg-white/[0.06]";
  return (
    <a
      href={href}
      className={`${base} ${styles}`}
      onClick={() => fireGtag(event, { href })}
    >
      {children}
    </a>
  );
}
