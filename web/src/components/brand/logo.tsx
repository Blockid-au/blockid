import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  variant = "light",
  size = "default",
}: {
  className?: string;
  variant?: "dark" | "light";
  size?: "default" | "large" | "hero";
}) {
  // Use the full official logo image (icon + text + tagline in one image)
  // height fixed per size to keep proportions
  const heightClass =
    size === "hero" ? "h-16 md:h-20"
    : size === "large" ? "h-12 md:h-14"
    : "h-9 md:h-10";

  return (
    <Link
      href="/"
      aria-label="BlockID home"
      className={cn(
        "inline-flex items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo-official.png"
        alt="BlockID.au — Valuation. Ownership. Growth."
        className={cn("w-auto", heightClass)}
      />
    </Link>
  );
}
