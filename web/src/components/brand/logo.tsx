import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * BlockID Logo — icon + text rendered as HTML for pixel-perfect sizing.
 *
 *   variant="light"  → navy text on light backgrounds (navbar, workspace)
 *   variant="dark"   → white text on dark backgrounds (footer)
 *   variant="icon"   → icon-only, no text
 *
 *   size="default"   → navbar / sidebar (icon 28px + text-lg)
 *   size="large"     → page headers (icon 36px + text-2xl)
 *   size="hero"      → homepage center (icon 56px + text-4xl)
 */
export function Logo({
  className,
  variant = "light",
  size = "default",
}: {
  className?: string;
  variant?: "dark" | "light" | "icon";
  size?: "default" | "large" | "hero";
}) {
  const isLight = variant === "light";
  const isDark = variant === "dark";
  const isIcon = variant === "icon";

  // Icon sizes
  const iconClass =
    size === "hero"  ? "h-14 w-14"
    : size === "large" ? "h-9 w-9"
    : "h-7 w-7";

  // Text sizes
  const textClass =
    size === "hero"  ? "text-4xl md:text-5xl"
    : size === "large" ? "text-2xl"
    : "text-lg";

  // Tagline (only on hero)
  const showTagline = size === "hero";
  const taglineClass = "text-sm md:text-base font-medium tracking-wide";

  // Gap between icon and text
  const gapClass =
    size === "hero"  ? "gap-4"
    : size === "large" ? "gap-3"
    : "gap-2.5";

  // Colors
  const textColor = isDark ? "text-white" : "text-ink-900";
  const dotColor = isDark ? "text-brand-300" : "text-brand-500";
  const tagColor = isDark ? "text-slate-400" : "text-ink-500";

  return (
    <Link
      href="/"
      aria-label="BlockID home"
      className={cn(
        "inline-flex items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg",
        gapClass,
        className,
      )}
    >
      {/* Icon — use light version on dark backgrounds */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={isDark ? "/images/logo-icon-light.png" : "/images/logo-icon-transparent.png"}
        alt=""
        className={cn(iconClass, "shrink-0")}
      />

      {/* Text (hidden for icon-only variant) */}
      {!isIcon && (
        <div className="flex flex-col">
          <span className={cn("font-extrabold tracking-tight leading-none", textClass, textColor)}>
            BlockID<span className={dotColor}>.au</span>
          </span>
          {showTagline && (
            <span className={cn(taglineClass, tagColor, "mt-1")}>
              Valuation. Ownership. Execution. Growth.
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
