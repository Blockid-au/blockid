import type { CSSProperties, ReactNode } from "react";

/**
 * AnimatedSearchFrame — the rotating colour ring around the hero and /analyze
 * omnibox.
 *
 * The CSS lives in `globals.css` under "Animated search frame", not in an
 * inline <style> here. Rendering the stylesheet inside the component caused a
 * React #418 hydration mismatch on / and /analyze — the only two pages that
 * mount it, and the two that matter most. Only `--asf-thickness` stays inline,
 * because it is a per-instance prop.
 *
 * Radius contract: the ring is the wrapper's own padding band, so the child
 * MUST carry the same corner radius or the band shows a mismatched square
 * shoulder outside a rounded child. `.asf-wrap` deliberately does *not* set
 * `border-radius` in CSS any more — an unlayered rule beat the Tailwind
 * utility and silently pinned every ring to the parent's radius (0), which is
 * why the pill hero used to render a square band. The `radius` prop is now
 * the single source of truth, and children should use `rounded-[inherit]`.
 *
 * This is a server component: it holds no state and no handlers, so it does not
 * need "use client" and does not ship JS.
 */
interface Props {
  children: ReactNode;
  className?: string;
  /** Ring corner radius. Defaults to a full pill. */
  radius?: string;
  /** Ring thickness in px. Defaults to 3. */
  thickness?: number;
}

export function AnimatedSearchFrame({
  children,
  className = "",
  radius = "rounded-full",
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
      {children}
    </div>
  );
}
