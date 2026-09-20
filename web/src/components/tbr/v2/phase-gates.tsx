// Chapter 11 — Phase gates (COO, deterministic): 13 criteria × 12 phases
// heat map + route map; free tier shows the current phase row only.
// G19-S44: the 8 per-chapter phase-lens sentences collapse into ONE row here
// ("Dimension floors at <phase>: TRE floor 40 ✓ · MPC no floor · …"); each
// chapter header keeps a one-word floor chip.

import { VisualFigure } from "@/lib/report-visuals/react";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection, phaseLabel, v2Strings, type TbrUiLocale } from "./shared";

export function TbrPhaseGates({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const g = report.phaseGates;
  const t = v2Strings(locale).phaseGates;
  const s = v2Strings(locale).s44;
  const free = report.tier === "free";
  const floors = report.dimensions.map((d) => ({
    dim: d.dim,
    label: typeof d.phaseLens.floor === "number" ? (d.phaseLens.floorMet ? s.floorMet(d.phaseLens.floor) : s.floorNotMet(d.phaseLens.floor)) : s.noFloor,
    met: d.phaseLens.floorMet,
  }));
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
      <p data-tbr-floors-row className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-600 dark:text-ink-300">
        <span className="font-semibold uppercase tracking-wide text-ink-500">{s.floorsRow(phaseLabel(g.current, locale))}:</span>
        {floors.map((f) => (
          <span key={f.dim} data-tbr-floor={f.dim} className={cn("rounded-md border px-1.5 py-0.5 tabular-nums", f.met === false ? "border-orange-200 text-orange-700 dark:border-orange-900 dark:text-orange-300" : "border-ink-200 dark:border-ink-700")}>
            <span className="font-mono text-[10px] text-ink-400">{f.dim.toUpperCase()}</span> {f.label}
          </span>
        ))}
      </p>
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
