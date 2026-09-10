/**
 * DeadlineChip — the coloured deadline pill on report cards (T0244, D-4).
 * Rung + colour come from `deadlineStatus()` (the R&D calendar's RDStatus
 * ladder); copy is never blank. Server component, semantic tokens only.
 */

import { DEADLINE_LABELS, DEADLINE_TONE, deadlineStatus, type DeadlineWindow } from "@/lib/funding/deadline-status";

export interface DeadlineChipProps extends DeadlineWindow {
  today?: Date;
  className?: string;
}

export function DeadlineChip({ today, className, ...win }: DeadlineChipProps) {
  const v = deadlineStatus(win, today);
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className ?? ""}`} data-deadline-status={v.status}>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${DEADLINE_TONE[v.status]}`}>
        {DEADLINE_LABELS[v.status]}
      </span>
      <span className="text-xs text-secondary">{v.label}</span>
    </span>
  );
}

export default DeadlineChip;
