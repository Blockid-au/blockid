"use client";

/**
 * AnimatedSearchFrame — reusable rotating conic-gradient border for
 * hero + /analyze SmartIntake input surfaces.
 *
 * Renders a wrapping frame whose ::before pseudo-element paints a
 * slow rotating conic gradient (svi.500 · action · bull) on a white
 * surface. Idle opacity 40%; on focus-within it snaps to full
 * saturation. Respects `prefers-reduced-motion: reduce` by freezing
 * the rotation.
 *
 * Wire order:
 *   <AnimatedSearchFrame>
 *     <YourInput className="w-full ..." />
 *   </AnimatedSearchFrame>
 *
 * The frame owns padding (the visible ring) and radius; the inner
 * surface is transparent so the child controls background + text
 * contrast against the theme (`bg-surface`).
 */

import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Extra classes for the outer wrapper (e.g. `w-full max-w-2xl`). */
  className?: string;
  /** Override the ring corner radius. Defaults to `rounded-xl`. */
  radius?: string;
  /** Ring thickness in px. Defaults to 2. */
  thickness?: number;
}

export function AnimatedSearchFrame({
  children,
  className = "",
  radius = "rounded-xl",
  thickness = 2,
}: Props) {
  const wrapperStyle: CSSProperties = {
    // CSS custom property consumed by the injected <style> block below.
    ["--asf-thickness" as string]: `${thickness}px`,
  };
  return (
    <div
      className={`asf-wrap relative ${radius} ${className}`}
      style={wrapperStyle}
    >
      {/* Rotating conic gradient painted via ::before — kept in one
          scoped <style> tag so the component is fully drop-in with no
          globals.css entry required. */}
      <style>{`
        .asf-wrap { padding: var(--asf-thickness); background: var(--color-surface, #F7F8FA); }
        .asf-wrap::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: var(--asf-thickness);
          background: conic-gradient(from 0deg,
            #FF9F0A 0deg,
            #1D4ED8 120deg,
            #047857 240deg,
            #FF9F0A 360deg);
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          opacity: 0.4;
          animation: asf-spin 12s linear infinite;
          pointer-events: none;
          z-index: 0;
        }
        .asf-wrap:focus-within::before { opacity: 1; }
        .asf-wrap > * { position: relative; z-index: 1; border-radius: inherit; }
        @keyframes asf-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .asf-wrap::before { animation: none; }
        }
      `}</style>
      {children}
    </div>
  );
}
