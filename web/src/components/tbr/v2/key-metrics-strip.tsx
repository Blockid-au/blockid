// G34 BT3 (RQ03) — the key-metrics strip under the tiles (spec §1 "Key
// metrics strip", §6). A captioned <table> laid out as 2 columns at 375 px
// and 6 across from lg: ARR · growth · NRR · gross margin · runway · burn
// multiple. Every cell prints its evidence status as icon + text (+ a 3 px
// border colour); "Not evidenced" is a dashed outline with ○ — never 0 or
// blank. Hook-free; figures come from `buildDashboardV4` (never derived here).

import type { DashboardV4, V4MetricStatus } from "@/lib/report-v2/dashboard-v4";
import { cn } from "@/lib/utils";
import { FIGURE_CLASS } from "./shared-v3";

export const METRIC_GLYPH: Record<V4MetricStatus, string> = { verified: "✓", observed: "✓", company_stated: "◐", stated: "○", assumed: "◌", not_evidenced: "○" };
const METRIC_BORDER: Record<V4MetricStatus, string> = {
  verified: "border-l-action",
  observed: "border-l-action",
  company_stated: "border-l-warn",
  stated: "border-l-warn",
  assumed: "border-l-warn",
  not_evidenced: "border-l-line",
};

export function KeyMetricsStrip({ v4 }: { v4: DashboardV4 }) {
  const s = v4.strings;
  return (
    <div data-tbr-key-metrics className="space-y-2">
      <h3 className="font-display text-base font-semibold text-primary">{s.metricsTitle}</h3>
      <table className="block w-full">
        <caption className="sr-only">{s.metricsCaption}</caption>
        <tbody className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {v4.keyMetrics.map((m) => (
            <tr
              key={m.id}
              data-tbr-metric={m.id}
              data-status={m.status}
              className={cn(
                "flex min-h-11 min-w-0 flex-col gap-0.5 rounded-lg border border-l-[3px] bg-surface p-3",
                METRIC_BORDER[m.status],
                m.status === "not_evidenced" ? "border-dashed border-line" : "border-line-subtle",
              )}
            >
              <th scope="row" className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {m.label}
              </th>
              <td className={cn("text-lg font-bold leading-tight text-primary", FIGURE_CLASS)}>{m.value ?? <span className="text-sm font-medium text-muted">—</span>}</td>
              <td className="text-xs text-secondary">
                <span aria-hidden="true" className={m.status === "verified" || m.status === "observed" ? "text-action" : m.status === "not_evidenced" ? "text-muted" : "text-warn"}>
                  {METRIC_GLYPH[m.status]}
                </span>{" "}
                {m.statusLabel}
                {m.source ? <span className="block text-muted">{m.source}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
