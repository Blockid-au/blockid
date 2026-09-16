// Chapter 0 — Cover: startup, date, SVI ring, 8-dim radar vs stage p50, the
// three questions strip and the dimension table (spec §A.1 row 0).

import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { VisualFigure } from "@/lib/report-visuals/react";
import { DIM_ORDER, type ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection, bandLabel, bandText } from "./shared";

export function TbrCover({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: "en" | "vi" }) {
  const c = report.cover;
  const ring = c.visuals.find((v) => v.kind === "score_ring");
  const radar = c.visuals.find((v) => v.kind === "radar");
  const strip = c.visuals.find((v) => v.kind === "three_questions_strip");
  const date = new Date(report.generatedAt).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "long", year: "numeric" });
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.cover} kicker="0" title={title}>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          {ring && <VisualFigure spec={ring} caption={null} className="w-[140px]" />}
          <p className={cn("text-sm font-semibold", bandText(c.svi.band))}>{bandLabel(c.svi.band)}</p>
          {c.svi.deltaVsLast !== null && (
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {c.svi.deltaVsLast >= 0 ? "+" : ""}
              {c.svi.deltaVsLast} vs last snapshot
            </p>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xl font-bold text-ink-900 dark:text-ink-100">{c.startupName}</p>
            <p className="text-sm text-ink-600 dark:text-ink-400">
              {c.sector} · {c.stageLabel} · Phase: {GROWTH_PHASE_LABELS[c.phaseId][locale]} · {date}
              {report.source !== "pipeline" && (
                <span className="ml-2 rounded-full border border-ink-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400">
                  {report.source === "fixture" ? "demo data" : "built from stored snapshot"}
                </span>
              )}
            </p>
          </div>
          {strip && <VisualFigure spec={strip} caption={null} />}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400">
                  <th className="py-1 pr-2">Dimension</th>
                  <th className="py-1 pr-2">Owner</th>
                  <th className="py-1 pr-2 text-right">W</th>
                  <th className="py-1 pr-2 text-right">Score</th>
                  <th className="py-1 pr-2 text-right">p50</th>
                  <th className="py-1 text-right">Pctl</th>
                </tr>
              </thead>
              <tbody>
                {DIM_ORDER.map((d) => {
                  const row = c.dims[d];
                  return (
                    <tr key={d} className="border-b border-ink-100 dark:border-ink-800/60">
                      <td className="py-1 pr-2">
                        <a href={`#${TBR_V2_SECTION_IDS.dim(d)}`} className="font-medium text-ink-700 hover:text-brand-600 dark:text-ink-200">
                          <span className="font-mono text-[10px] text-ink-400">{d.toUpperCase()}</span> {DIMENSION_OWNERS[d].title}
                        </a>
                      </td>
                      <td className="py-1 pr-2">
                        <AgentBadge role={DIMENSION_OWNERS[d].primary} />
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums text-ink-500">{row.weight}</td>
                      <td className={cn("py-1 pr-2 text-right font-bold tabular-nums", bandText(row.band))}>{row.band === "pending" ? "—" : row.score}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-ink-500">{row.p50}</td>
                      <td className="py-1 text-right tabular-nums text-ink-500">{row.percentile ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {radar && <VisualFigure spec={radar} caption={radar.subtitle ?? null} />}
          </div>
        </div>
      </div>
    </TbrSection>
  );
}
