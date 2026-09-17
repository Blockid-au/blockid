// G14-S36 — the one "Verified ABN" / "ABN not verified" badge, shared by the
// TBR cover, the evaluator dossier header and the public index card so the
// wording (and the L2 threshold behind it) cannot drift between surfaces.
// Server-safe (no hooks).

import { cn } from "@/lib/utils";
import { verificationBadgeLabel, normaliseVerificationLevel } from "@/lib/verification/confidence-multiplier";

export interface AbnBadgeProps {
  /** projects.verification_level 0–5; null/undefined reads as L0. */
  level: number | null | undefined;
  /** Compact chip (index cards) vs the default pill. */
  size?: "sm" | "md";
  className?: string;
}

export function AbnBadge({ level, size = "md", className }: AbnBadgeProps) {
  const l = normaliseVerificationLevel(level ?? 0);
  const label = verificationBadgeLabel(l);
  const verified = l >= 2;
  return (
    <span
      data-testid="abn-badge"
      data-level={l}
      title={`Business verification L${l}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        verified
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-ink-200 bg-white text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400",
        className,
      )}
    >
      <span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", verified ? "bg-emerald-500" : "bg-ink-300 dark:bg-ink-600")} />
      {label}
      <span className="sr-only"> (L{l})</span>
    </span>
  );
}
