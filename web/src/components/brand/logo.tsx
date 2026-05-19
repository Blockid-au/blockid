import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo component with multiple variants for different contexts:
 *
 *   variant="light"  → dark text logo on light backgrounds (navbar, workspace, pages)
 *   variant="dark"   → icon + white text on dark backgrounds (footer)
 *   variant="icon"   → icon-only, no text (compact spaces, mobile)
 *
 *   size="default"   → 48px height (navbar, sidebar)
 *   size="large"     → 88px height (page headers)
 *   size="hero"      → 152px height (homepage center)
 *
 * All images use transparent PNGs — no white background artifacts.
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
  if (variant === "icon") {
    const iconSize =
      size === "hero" ? "h-20 w-20"
      : size === "large" ? "h-12 w-12"
      : "h-9 w-9";

    return (
      <Link
        href="/"
        aria-label="BlockID home"
        className={cn(
          "inline-flex items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo-icon-transparent.png"
          alt="BlockID.au"
          className={iconSize}
        />
      </Link>
    );
  }

  // Full logo (icon + text + tagline)
  const heightClass =
    size === "hero" ? "h-[152px]"
    : size === "large" ? "h-[88px]"
    : "h-12 md:h-14";

  // Light variant: dark navy text — for light backgrounds
  // Dark variant: icon + white text rendered as HTML — for dark backgrounds
  if (variant === "dark") {
    const iconH =
      size === "hero" ? "h-14 w-14"
      : size === "large" ? "h-10 w-10"
      : "h-8 w-8";
    const textSize =
      size === "hero" ? "text-3xl"
      : size === "large" ? "text-xl"
      : "text-lg";

    return (
      <Link
        href="/"
        aria-label="BlockID home"
        className={cn(
          "inline-flex items-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo-icon-transparent.png"
          alt=""
          className={iconH}
        />
        <span className={cn("font-bold tracking-tight text-white", textSize)}>
          BlockID<span className="text-brand-400">.au</span>
        </span>
      </Link>
    );
  }

  // Light variant: use the full transparent logo image
  return (
    <Link
      href="/"
      aria-label="BlockID home"
      className={cn(
        "inline-flex items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo-transparent.png"
        alt="BlockID.au — Valuation. Ownership. Growth."
        className={cn("w-auto", heightClass)}
      />
    </Link>
  );
}
