import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  variant = "light",
  size = "default",
}: {
  className?: string;
  variant?: "dark" | "light";
  size?: "default" | "large";
}) {
  const iconSize = size === "large" ? "h-12 w-12" : "h-8 w-8";
  const textSize = size === "large" ? "text-2xl" : "text-lg";

  return (
    <Link
      href="/"
      aria-label="BlockID home"
      className={cn(
        "inline-flex items-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/icon-192.png"
        alt=""
        className={iconSize}
      />
      <span
        className={cn(
          "font-bold tracking-tight",
          textSize,
          variant === "light" ? "text-ink-800" : "text-white",
        )}
      >
        BlockID<span className={variant === "light" ? "text-brand-600" : "text-brand-300"}>.au</span>
      </span>
    </Link>
  );
}
