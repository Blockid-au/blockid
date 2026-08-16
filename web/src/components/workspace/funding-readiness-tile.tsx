"use client";

// FundingReadinessTile — displays gate progress and milestone checklist.
//
// Props: fundingReadiness: FundingReadiness (from @/lib/svi-analysis)
//
// Gate colors:
//   pre-seed → gray
//   seed     → amber
//   series-a → blue
//   series-b → green

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { FundingReadiness } from "@/lib/svi-analysis";

// ── Gate metadata ──────────────────────────────────────────────────────────

const GATE_CONFIG = {
  "pre-seed": {
    label: "Pre-Seed",
    badgeClass: "border-surface-300 bg-surface-100 text-ink-600",
    barClass: "bg-surface-400",
    nextLabel: "Seed",
  },
  seed: {
    label: "Seed",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    barClass: "bg-amber-500",
    nextLabel: "Series A",
  },
  "series-a": {
    label: "Series A",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    barClass: "bg-sky-500",
    nextLabel: "Series B",
  },
  "series-b": {
    label: "Series B",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    barClass: "bg-emerald-500",
    nextLabel: "Series B+",
  },
} as const satisfies Record<
  FundingReadiness["currentGate"],
  { label: string; badgeClass: string; barClass: string; nextLabel: string }
>;

const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Gov.",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "SVM",
};

// Group milestones by their gate field
function groupByGate(
  milestones: FundingReadiness["milestones"],
): Map<string, FundingReadiness["milestones"]> {
  const map = new Map<string, FundingReadiness["milestones"]>();
  for (const m of milestones) {
    const list = map.get(m.gate) ?? [];
    list.push(m);
    map.set(m.gate, list);
  }
  return map;
}

const GATE_ORDER = ["seed", "series-a", "series-b"] as const;

const GATE_SECTION_LABEL: Record<string, string> = {
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
};

// ── Component ──────────────────────────────────────────────────────────────

export function FundingReadinessTile({
  fundingReadiness,
}: {
  fundingReadiness: FundingReadiness;
}) {
  const { currentGate, gateScore, milestones } = fundingReadiness;
  const config = GATE_CONFIG[currentGate];
  const grouped = groupByGate(milestones);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            {/* Funding icon */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              className="h-4 w-4 text-brand-600 shrink-0"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Funding Readiness
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your progress toward the next funding gate
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold rounded-lg",
            config.badgeClass,
          )}
        >
          {config.label}
        </span>
      </div>

      {/* ── Progress bar ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {gateScore}% toward{" "}
            <span className="font-semibold text-foreground">
              {config.nextLabel}
            </span>
          </span>
          <span className="tabular-nums font-semibold">{gateScore}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              config.barClass,
            )}
            style={{ width: `${Math.min(100, Math.max(0, gateScore))}%` }}
          />
        </div>
      </div>

      {/* ── Milestones grouped by gate ── */}
      <div className="space-y-4">
        {GATE_ORDER.map((gate) => {
          const items = grouped.get(gate);
          if (!items || items.length === 0) return null;
          const allMet = items.every((m) => m.met);
          return (
            <div key={gate}>
              {/* Gate section header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {GATE_SECTION_LABEL[gate] ?? gate}
                </span>
                {allMet && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                    Complete
                  </span>
                )}
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Milestone rows */}
              <ul className="space-y-2">
                {items.map((m, idx) => (
                  <li
                    key={idx}
                    className={cn(
                      "rounded-xl border p-3 space-y-1.5",
                      m.met
                        ? "border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-900/40"
                        : "border-border bg-muted/20",
                    )}
                  >
                    {/* Label row */}
                    <div className="flex items-start gap-2">
                      {/* Checkbox */}
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 text-base leading-none",
                          m.met
                            ? "text-emerald-600"
                            : "text-muted-foreground",
                        )}
                        aria-label={m.met ? "Met" : "Not yet met"}
                      >
                        {m.met ? "✅" : "⬜"}
                      </span>

                      {/* Label + dimension badge */}
                      <div className="flex-1 min-w-0 flex items-start justify-between gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-sm font-medium leading-tight",
                            m.met ? "text-emerald-800 dark:text-emerald-300" : "text-foreground",
                          )}
                        >
                          {m.label}
                        </span>
                        <span className="shrink-0 inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold rounded bg-surface-100 border-surface-200 text-ink-600 uppercase tracking-wide">
                          {m.dimension.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Current vs target + action hint */}
                    {!m.met && (
                      <div className="pl-6 space-y-1">
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {DIMENSION_LABELS[m.dimension] ?? m.dimension}:{" "}
                          <span className="font-semibold text-foreground">
                            {m.currentValue}
                          </span>{" "}
                          &rarr; needs{" "}
                          <span className="font-semibold text-foreground">
                            {m.targetValue}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground italic leading-snug">
                          {m.action}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Gates are based on your SVI dimension scores. Re-run your analysis after
        adding evidence to update this readiness view.
      </p>
    </div>
  );
}
