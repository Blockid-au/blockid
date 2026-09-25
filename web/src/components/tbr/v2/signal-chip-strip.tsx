// G34 BT3 (D24-d) — the six investor signals as a STATUS chip row under the
// scorecard (spec §1 "Signal chip row"). No score until per-question scoring
// lands (G31 C12). Each chip links to its expandable signal card in the
// investor-screening overview (summary + linked criteria); `title` carries
// the fixed summary for hover / focus. Free tier (D24-b): status visible,
// detail gated by `buildInvestorScreening`. Hook-free.

import type { DashboardV4, V4SignalChip } from "@/lib/report-v2/dashboard-v4";
import { cn } from "@/lib/utils";

const GLYPH: Record<V4SignalChip["status"], string> = { context_available: "◐", missing: "○", locked: "🔒" };

export function SignalChipStrip({ v4 }: { v4: DashboardV4 }) {
  const s = v4.strings;
  return (
    <div data-tbr-signal-chips className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.signalsTitle}</p>
      <ul className="flex flex-wrap gap-2">
        {v4.signalChips.map((chip) => (
          <li key={chip.key}>
            <a
              href={chip.href}
              title={chip.summary}
              data-tbr-signal-chip={chip.key}
              data-status={chip.status}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs text-primary hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                chip.status === "missing" ? "border-dashed border-line" : "border-line-subtle",
              )}
            >
              <span aria-hidden="true" className={chip.status === "context_available" ? "text-action" : "text-muted"}>
                {GLYPH[chip.status]}
              </span>
              <span className="font-medium">{chip.label}</span>
              <span className="text-muted">· {chip.statusLabel}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{s.signalsNote}</p>
    </div>
  );
}
