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
  // Official logo is 1672×941 (≈1.78:1 ratio)
  const heightClass =
    size === "hero" ? "h-[152px]"       // h-38 equivalent
    : size === "large" ? "h-[88px]"     // h-22 equivalent
    : "h-16";                           // h-16 = 64px

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
