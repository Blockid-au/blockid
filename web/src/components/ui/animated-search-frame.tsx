"use client";

/**
 * AnimatedSearchFrame — static color-transition border for hero + /analyze
 * SmartIntake input surfaces.
 *
 * Sep 2026 (user feedback: "khung thay đổi quay vòng" = spinning frame):
 * the previous version painted a rotating conic-gradient via `asf-spin`
 * (360° every 12s). Users read that as noisy/unprofessional rather than
 * as delightful focus affordance. Replaced with a plain color-transition
 * border — idle muted, hover brand cyan, focus-within solid brand cyan
 * with a subtle glow ring — matching the calm focus pattern used
 * everywhere else in the design system.
 *
 * Contract unchanged so every call site keeps working with no edit:
 *   <AnimatedSearchFrame> <YourInput /> </AnimatedSearchFrame>
 *
 * `thickness` still controls border width. `radius` still controls corner
 * radius. `className` still passes through.
 */

import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Extra classes for the outer wrapper (e.g. `w-full max-w-2xl`). */
  className?: string;
  /** Override the ring corner radius. Defaults to `rounded-xl`. */
  radius?: string;
  /** Border thickness in px. Defaults to 2. */
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
        .asf-wrap {
          border: var(--asf-thickness) solid #cbd5e1;
          background: var(--color-surface, #F7F8FA);
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }
        .dark .asf-wrap {
          border-color: rgba(148, 163, 184, 0.32);
        }
        .asf-wrap:hover {
          border-color: #06b6d4;
        }
        .dark .asf-wrap:hover {
          border-color: #22d3ee;
        }
        .asf-wrap:focus-within {
          border-color: #06b6d4;
          box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.16);
        }
        .dark .asf-wrap:focus-within {
          border-color: #22d3ee;
          box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.22);
        }
        .asf-wrap > * { border-radius: inherit; }
      `}</style>
      {children}
    </div>
  );
}
