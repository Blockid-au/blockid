/**
 * StatusChip — open / upcoming / paused / closed pill for a grant or program
 * row, with the close date or next-round note as a second line (T0241).
 *
 * Server component. Colours are the semantic ink tokens (bull / warn / bear)
 * so the chip retints with the light and dark palettes.
 */

import type { FundingStatus } from "@/lib/funding/seed-map";
import { STATUS_LABELS, statusDetail } from "@/lib/funding/directory";

const TONE: Record<FundingStatus, string> = {
  open: "border-bull/30 bg-bull/10 text-bull",
  upcoming: "border-action/30 bg-action/10 text-action",
  paused: "border-warn/30 bg-warn/10 text-warn",
  closed: "border-bear/30 bg-bear/10 text-bear",
};

export interface StatusChipProps {
  status: FundingStatus;
  closes_at?: string | null;
  applications_close?: string | null;
  next_round_note?: string | null;
  className?: string;
}

export function StatusChip({ status, closes_at, applications_close, next_round_note, className }: StatusChipProps) {
  const detail = statusDetail({ status, closes_at, applications_close, next_round_note });
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className ?? ""}`}>
      <span
        data-status={status}
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONE[status]}`}
      >
        {STATUS_LABELS[status]}
      </span>
      {detail ? <span className="text-xs text-secondary">{detail}</span> : null}
    </span>
  );
}

export default StatusChip;
