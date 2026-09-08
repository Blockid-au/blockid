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
  thickness = 2,
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
        .asf-wrap {
          background: var(--color-surface, #F7F8FA);
          border-radius: inherit;
          isolation: isolate;
        }
        .asf-wrap::before {
          content: "";
          position: absolute;
          inset: 0;
          padding: var(--asf-thickness);
          border-radius: inherit;
          background: conic-gradient(
            from var(--asf-angle),
            #FF9F0A 0deg,
            #1D4ED8 120deg,
            #047857 240deg,
            #FF9F0A 360deg
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0.42;
          animation: asf-spin 12s linear infinite;
          transition: opacity 200ms ease;
          pointer-events: none;
          z-index: 0;
        }
        .asf-wrap:hover::before {
          opacity: 0.7;
        }
        .asf-wrap:focus-within::before {
          opacity: 1;
        }
        .asf-wrap:focus-within {
          box-shadow: 0 0 0 4px rgba(255, 159, 10, 0.16);
        }
        .asf-wrap > * {
          position: relative;
          z-index: 1;
          border-radius: inherit;
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
