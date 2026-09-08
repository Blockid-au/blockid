"use client";

import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  radius?: string;
  thickness?: number;
}

export function AnimatedSearchFrame({
  children,
  className = "",
  radius = "rounded-xl",
  thickness = 3,
}: Props) {
  const wrapperStyle: CSSProperties = {
    ["--asf-thickness" as string]: `${thickness}px`,
  };
  return (
    <div
      className={`asf-wrap relative ${radius} ${className}`}
      style={wrapperStyle}
    >
      <style>{`
        @property --asf-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes asf-spin {
          to { --asf-angle: 360deg; }
        }
        /* The ring is the wrapper's own padding band. The previous build
           used a content-box mask to punch out the centre, but the child
           (SmartIntake's card) is an OPAQUE bg-surface-raised panel at
           inset 0, so it painted straight over the masked border and the
           ring never registered. Padding the wrapper physically insets the
           child by --asf-thickness, so the band cannot be covered. */
        .asf-wrap {
          background: transparent;
          border-radius: inherit;
          padding: var(--asf-thickness);
          isolation: isolate;
        }
        .asf-wrap::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: conic-gradient(
            from var(--asf-angle),
            #FF9F0A 0deg,
            #1D4ED8 120deg,
            #047857 240deg,
            #FF9F0A 360deg
          );
          opacity: 0.6;
          animation: asf-spin 12s linear infinite;
          transition: opacity 200ms ease;
          pointer-events: none;
          z-index: 0;
        }
        .asf-wrap:hover::before {
          opacity: 0.85;
        }
        .asf-wrap:focus-within::before {
          opacity: 1;
        }
        .asf-wrap:focus-within {
          box-shadow: 0 0 0 4px rgba(255, 159, 10, 0.16);
        }
        /* Child sits above the gradient and paints the interior. Its own
           opaque background is what makes the band read as a ring. */
        .asf-wrap > * {
          position: relative;
          z-index: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .asf-wrap::before {
            animation: none;
            opacity: 0.6;
          }
        }
      `}</style>
      {children}
    </div>
  );
}
