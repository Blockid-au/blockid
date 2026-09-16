// Type chip for the All-reports list (S-IA2, spec §A.1). Server-safe: no
// hooks, no client directive.

import { cn } from "@/lib/utils";
import type { ReportKind } from "./load-reports";

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  weekly: "Weekly",
  business: "Business report",
  "investor-pack": "Investor pack",
  "c-level": "C-level",
  lp: "LP",
};

const KIND_STYLES: Record<ReportKind, string> = {
  weekly: "bg-blue-50 text-blue-700 border-blue-200",
  business: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "investor-pack": "bg-amber-50 text-amber-700 border-amber-200",
  "c-level": "bg-purple-50 text-purple-700 border-purple-200",
  lp: "bg-slate-50 text-slate-600 border-slate-200",
};

export function ReportTypeChip({ kind }: { kind: ReportKind }) {
  return (
    <span
      data-report-kind={kind}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
        KIND_STYLES[kind],
      )}
    >
      {REPORT_KIND_LABELS[kind]}
    </span>
  );
}
