import { Hexagon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="BlockID home"
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 rounded-md",
        className,
      )}
    >
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30">
        <Hexagon strokeWidth={1.75} className="h-5 w-5" />
        <span
          aria-hidden
          className="absolute inset-0 rounded-lg bg-teal-500/10 blur-md"
        />
      </span>
      <span className="text-base font-semibold tracking-tight text-slate-50">
        BlockID
      </span>
    </Link>
  );
}
