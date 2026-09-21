// Appendix block — the phase-gate matrix (COO, deterministic): route map,
// the one floors row ("Dimension floors at <phase>: TRE floor 40 ✓ · …"),
// the current phase's required criteria, blockers, and the 13 × 12 heat
// map on the paid view. G27 moved it out of the chapter sequence into the
// appendix (spec § 2 row 16); the current phase + blocker stays on page 2
// inside the Investment view. Rendered as a titled block, not a section.

import { VisualFigure } from "@/lib/report-visuals/react";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { AgentBadge, Chip, TABLE_CLASS, phaseLabel, v2Strings, zebraRow, type TbrUiLocale } from "./shared";
import { FIGURE_CLASS, v3Strings } from "./shared-v3";

export function TbrPhaseGateMatrix({ report, locale = "en" }: { report: ReportV2; locale?: TbrUiLocale }) {
  const g = report.phaseGates;
  const t = v2Strings(locale).phaseGates;
  const s = v2Strings(locale).s44;
  const t3 = v3Strings(locale);
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
    <div data-tbr-phase-gates className="space-y-3">
      <p className="font-semibold text-primary">{t3.phaseGateMatrix}</p>
      <div className="flex items-center gap-2 text-xs text-secondary">
        <AgentBadge role="coo" />
        <span>{t.currentPhase(phaseLabel(g.current, locale))}</span>
      </div>
      {route && <VisualFigure spec={route} caption={null} />}
      <p data-tbr-floors-row className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary">
        <span className="font-semibold uppercase tracking-wide text-muted">{s.floorsRow(phaseLabel(g.current, locale))}:</span>
        {floors.map((f) => (
          <span key={f.dim} data-tbr-floor={f.dim} className={cn("rounded-md border px-1.5 py-0.5", FIGURE_CLASS, f.met === false ? "border-bear text-primary" : "border-line-subtle")}>
            <span className="font-mono text-xs text-muted">{f.dim.toUpperCase()}</span> {f.label}
          </span>
        ))}
      </p>
      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <caption className="py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{t.requiredCriteria(phaseLabel(g.current, locale))}</caption>
          <tbody>
            {currentRows.map((m, i) => (
              <tr key={m.criterion} className={zebraRow(i)} data-tbr-gate-row={m.criterion}>
                <td className="py-1 pr-2 font-medium text-secondary">{CRITERIA.find((c) => c.key === m.criterion)?.title ?? m.criterion}</td>
                <td className="py-1 pr-2">
                  <Chip kind="band">{(v2Strings(locale).s47.quality as Record<string, string>)[m.quality] ?? m.quality}</Chip>
                </td>
                <td className="py-1 text-right">{m.met ? t.met : t.notMet}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.blockers.length > 0 && (
        <ul className="space-y-1 text-xs text-secondary">
          {g.blockers.slice(0, 6).map((b) => (
            <li key={`${b.code}-${b.subject}`}>▲ {b.detail}</li>
          ))}
        </ul>
      )}
      {!free && heat && <VisualFigure spec={heat} caption={heat.subtitle ?? heat.title} className="overflow-x-auto rounded-xl border border-line-subtle p-3" />}
    </div>
  );
}
