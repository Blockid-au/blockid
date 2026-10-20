// SLA state pill for /admin/verified-reviews (G35 P4). Words + colour, never
// colour alone; light template tokens.

import type { SlaState } from "@/lib/verified-review/sla";

const LABEL: Record<SlaState, string> = { overdue: "Overdue", due_soon: "Due soon", on_track: "On track", no_sla: "No SLA" };
const CLASS: Record<SlaState, string> = {
  overdue: "border-red-300 bg-red-50 text-red-800",
  due_soon: "border-amber-300 bg-amber-50 text-amber-900",
  on_track: "border-brand-navy/30 bg-info-soft text-brand-navy",
  no_sla: "border-surface-300 bg-surface-50 text-ink-600",
};

export function SlaPill({ state }: { state: SlaState }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${CLASS[state]}`}>{LABEL[state]}</span>;
}
