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
 * This is a server component: it holds no state and no handlers, so it does not
 * need "use client" and does not ship JS.
 */
interface Props {
  children: ReactNode;
  className?: string;
  /** Ring corner radius. Defaults to `rounded-xl`. */
  radius?: string;
  /** Ring thickness in px. Defaults to 3. */
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
      {children}
    </div>
  );
}
