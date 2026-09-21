// DemoCohortChip — the "Demo data — fictional" label every demo company
// card / row / cohort header carries (G24-C; ACL s18 — invented companies
// must never read as real ones). Server-safe: no hooks, no client code, so
// the cohort table, the journey cards, the Cohorts lists and the report
// HTML twin can all mount it. Colour is never the only signal: the icon +
// the words + a title carry the meaning.

import { FlaskConical } from "lucide-react";
import { DEMO_COHORT_LABELS_EN } from "@/lib/evaluations/demo-cohort-shared";

export interface DemoCohortChipProps {
  /** Catalogue copy (EN default). */
  label?: string;
  title?: string;
  /** `sm` for table rows, `md` for cards / headers. */
  size?: "sm" | "md";
  className?: string;
}

export function DemoCohortChip({ label = DEMO_COHORT_LABELS_EN.chip, title = DEMO_COHORT_LABELS_EN.chipTitle, size = "sm", className = "" }: DemoCohortChipProps) {
  const sizing = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-warn/50 bg-warn/10 font-semibold text-warn ${sizing} ${className}`}
      title={title}
      data-testid="demo-chip"
    >
      <FlaskConical className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} aria-hidden="true" />
      {label}
    </span>
  );
}
