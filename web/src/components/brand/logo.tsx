import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "light";
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
      <span
        className={cn(
          "text-lg font-bold tracking-tight",
          variant === "light" ? "text-brand-700" : "text-slate-50",
        )}
      >
        BlockID<span className="text-brand-400">.au</span>
      </span>
    </Link>
  );
}
