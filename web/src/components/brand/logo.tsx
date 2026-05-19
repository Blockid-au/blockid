import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  variant = "dark",
  showTagline = false,
}: {
  className?: string;
  variant?: "dark" | "light";
  showTagline?: boolean;
}) {
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
        width={36}
        height={36}
        className="h-9 w-9"
      />
      <span className="flex flex-col">
        <span
          className={cn(
            "text-lg font-bold tracking-tight leading-none",
            variant === "light" ? "text-brand-700" : "text-slate-50",
          )}
        >
          BlockID<span className="text-brand-400">.au</span>
        </span>
        {showTagline && (
          <span
            className={cn(
              "text-[10px] font-medium tracking-wide mt-0.5",
              variant === "light" ? "text-brand-500" : "text-brand-300",
            )}
          >
            Valuation. Ownership. Growth.
          </span>
        )}
      </span>
    </Link>
  );
}
