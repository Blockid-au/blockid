// G21-P1-B — the founder-facing status chip on every evidence item:
// Claimed · Evidence-backed · Verified · Unverified · Conflicting. Pure
// presentation over `statusChip()` (lib/svi/status-chip.ts); hook-free so it
// renders inside server and client lists alike.

import { statusChip, type StatusChipInput } from "@/lib/svi/status-chip";
import { cn } from "@/lib/utils";

export function EvidenceStatusChip({ item, className }: { item: StatusChipInput; className?: string }) {
  const chip = statusChip(item);
  return (
    <span
      data-testid="evidence-status-chip"
      data-evidence-status={chip.status}
      title={chip.hint}
      className={cn("inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-xs font-medium tracking-wide", chip.border, chip.tone, className)}
    >
      {chip.status === "verified" ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 fill-current">
          <path d="M6.4 11.6 2.8 8l1.1-1.1 2.5 2.5 5.7-5.7L13.2 4.8z" />
        </svg>
      ) : null}
      {chip.label}
    </span>
  );
}
