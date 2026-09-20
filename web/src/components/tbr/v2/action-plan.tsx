// Chapter 13 — 90-day action plan: 3 × 30-day columns, owner agent per step
// (COO). Free tier shows 5 steps.

import { DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection, v2Strings, type TbrUiLocale } from "./shared";

export function TbrActionPlan({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const p = report.actionPlan;
  const t = v2Strings(locale).actionPlan;
  const steps = report.tier === "free" ? p.steps.slice(0, 5) : p.steps;
  const cols: Array<30 | 60 | 90> = [30, 60, 90];
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.actionPlan} kicker="13" title={title}>
      <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
        <AgentBadge role="coo" />
        <span>{t.steps(steps.length, p.horizonDays)}</span>
      </div>
      {steps.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {cols.map((day) => (
            <div key={day} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{t.dayRange(day - 30, day)}</p>
              <ul className="mt-2 space-y-2 text-xs">
                {steps
                  .filter((s) => s.day === day)
                  .map((s, i) => (
                    <li key={`${s.dimension}-${i}`} className="space-y-0.5">
                      <p className="font-medium text-ink-800 dark:text-ink-100">{s.title}</p>
                      <p className="flex flex-wrap items-center gap-1 text-[10px] text-ink-500">
                        <AgentBadge role={s.ownerAgent} kind="support" /> {DIMENSION_OWNERS[s.dimension].shortLabel} · {t.lift(s.expectedLift)}
                        {s.evidenceToAdd ? ` · ${s.evidenceToAdd}` : ""}
                      </p>
                    </li>
                  ))}
                {steps.every((s) => s.day !== day) && <li className="text-ink-400">—</li>}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-600 dark:text-ink-400">{t.empty}</p>
      )}
      {p.visuals.map((v) => (
        <VisualFigure key={v.id} spec={v} caption={v.title} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800" />
      ))}
    </TbrSection>
  );
}
