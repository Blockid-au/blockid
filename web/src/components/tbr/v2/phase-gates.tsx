// Chapter 11 — Phase gates (COO, deterministic): 13 criteria × 12 phases
// heat map + route map; free tier shows the current phase row only.

import { VisualFigure } from "@/lib/report-visuals/react";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection, phaseLabel, v2Strings, type TbrUiLocale } from "./shared";

export function TbrPhaseGates({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const g = report.phaseGates;
  const t = v2Strings(locale).phaseGates;
  const free = report.tier === "free";
  const currentRows = g.matrix.filter((m) => m.phase === g.current && m.required);
  const heat = g.visuals.find((v) => v.kind === "heat_map");
  const route = g.visuals.find((v) => v.kind === "route_map");
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.phaseGates} kicker="11" title={title}>
      <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
        <AgentBadge role="coo" />
        <span>{t.currentPhase(phaseLabel(g.current, locale))}</span>
      </div>
      {route && <VisualFigure spec={route} caption={null} />}
      <table className="w-full text-xs">
        <caption className="py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">{t.requiredCriteria(phaseLabel(g.current, locale))}</caption>
        <tbody>
          {currentRows.map((m) => (
            <tr key={m.criterion} className="border-t border-ink-100 dark:border-ink-800/60">
              <td className="py-1 pr-2 font-medium text-ink-700 dark:text-ink-200">{m.criterion}</td>
              <td className="py-1 pr-2 text-ink-500">{m.quality}</td>
              <td className="py-1 text-right">{m.met ? t.met : t.notMet}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {g.blockers.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-700 dark:text-ink-300">
          {g.blockers.slice(0, 6).map((b) => (
            <li key={`${b.code}-${b.subject}`}>▲ {b.detail}</li>
          ))}
        </ul>
      )}
      {!free && heat && <VisualFigure spec={heat} caption={heat.subtitle ?? heat.title} className="overflow-x-auto rounded-xl border border-ink-200 p-3 dark:border-ink-800" />}
    </TbrSection>
  );
}
