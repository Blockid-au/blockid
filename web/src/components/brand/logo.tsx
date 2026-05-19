import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  variant = "dark",
  size = "default",
}: {
  className?: string;
  variant?: "dark" | "light";
  size?: "default" | "large";
}) {
  const iconSize = size === "large" ? "h-14 w-14" : "h-9 w-9";
  const textSize = size === "large" ? "text-2xl" : "text-lg";

  return (
    <Link
      href="/"
      aria-label="BlockID home"
      className={cn(
        "inline-flex items-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 rounded-md",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={variant === "light" ? "/images/logo.svg" : "/images/logo-dark.svg"}
        alt=""
        className={iconSize}
      />
      <span
        className={cn(
          "font-bold tracking-tight",
          textSize,
          variant === "light" ? "text-[#1B3A6B]" : "text-slate-50",
        )}
      >
        BlockID<span className={variant === "light" ? "text-[#2B6FD4]" : "text-brand-400"}>.au</span>
      </span>
    </Link>
  );
}
