// Chapter 0 — Cover: startup, date, SVI ring, 8-dim radar vs stage p50, the
// three questions strip and the dimension table (spec §A.1 row 0).

import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import { DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { VisualFigure } from "@/lib/report-visuals/react";
import { coverEvidenceLine } from "@/lib/report-v2/evidence-view";
import { coverLedgerCells, pendingDimsLine } from "@/lib/report-v2/ledger-rows";
import { DIM_ORDER, type ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { AbnBadge } from "@/components/verification/abn-badge";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection, bandLabel, bandText, phaseLabel, type TbrUiLocale } from "./shared";

/** G19-S41 — the cover ledger strip "base 100 → dims → stage → penalties → total" + "N of 8 dimensions pending". */
export function TbrCoverLedger({ report, locale = "en" }: { report: ReportV2; locale?: TbrUiLocale }) {
  const rowLocale: "en" | "vi" = locale === "vi" ? "vi" : "en";
  const cells = coverLedgerCells(report.cover, rowLocale);
  const pending = pendingDimsLine(report.cover, rowLocale);
  // G19-S43: "Evidence: mostly self-declared (×0.50)" beside the ledger strip.
  const evidence = coverEvidenceLine(report.cover, rowLocale);
  if (cells.length === 0 && !pending && !evidence) return null;
  const t = getTbrStrings(locale).ledger;
  return (
    <div data-tbr-cover-ledger className="space-y-1">
      {(cells.length > 0 || evidence) && (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {cells.length > 0 && <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{t.coverTitle}</span>}
          {cells.map((cell, i) => (
            <span key={cell.label} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-ink-300 dark:text-ink-600">→</span>}
              <span className={cn("rounded-md border px-1.5 py-0.5 tabular-nums", i === cells.length - 1 ? "border-brand-300 bg-brand-50 font-semibold text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "border-ink-200 text-ink-700 dark:border-ink-700 dark:text-ink-200")}>
                <span className="text-ink-500 dark:text-ink-400">{cell.label}</span> {cell.value}
              </span>
            </span>
          ))}
          {evidence && (
            <span data-tbr-cover-evidence className="ml-1 rounded-md border border-ink-200 px-1.5 py-0.5 text-ink-600 dark:border-ink-700 dark:text-ink-300">
              {evidence}
            </span>
          )}
        </div>
      )}
      {pending && (
        <p data-tbr-pending-dims className="text-[11px] text-ink-500 dark:text-ink-400">
          {pending}
        </p>
      )}
    </div>
  );
}

export function TbrCover({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const c = report.cover;
  const t = getTbrStrings(locale).v2.cover;
  const ring = c.visuals.find((v) => v.kind === "score_ring");
  const radar = c.visuals.find((v) => v.kind === "radar");
  const strip = c.visuals.find((v) => v.kind === "three_questions_strip");
  const date = new Date(report.generatedAt).toLocaleDateString(locale === "vi" ? "vi-VN" : locale === "es" ? "es-ES" : locale === "ja" ? "ja-JP" : "en-AU", { day: "numeric", month: "long", year: "numeric" });
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.cover} kicker="0" title={title}>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          {ring && <VisualFigure spec={ring} caption={null} className="w-[140px]" />}
          <p className={cn("text-sm font-semibold", bandText(c.svi.band))}>{bandLabel(c.svi.band, locale)}</p>
          {c.svi.deltaVsLast !== null && <p className="text-xs text-ink-500 dark:text-ink-400">{t.deltaVsLast(`${c.svi.deltaVsLast >= 0 ? "+" : ""}${c.svi.deltaVsLast}`)}</p>}
        </div>
        <div className="space-y-3">
          <div>
            <p className="flex flex-wrap items-center gap-2 text-xl font-bold text-ink-900 dark:text-ink-100">
              {c.startupName}
              {/* S36: business verification at generation time (absent on pre-S36 stored documents). */}
              {c.verification && <AbnBadge level={c.verification.level} />}
            </p>
            <p className="text-sm text-ink-600 dark:text-ink-400">
              {c.sector} · {c.stageLabel} · {t.phase}: {phaseLabel(c.phaseId, locale)} · {date}
              {report.source !== "pipeline" && (
                <span className="ml-2 rounded-full border border-ink-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400">
                  {report.source === "fixture" ? t.demoData : t.builtFromSnapshot}
                </span>
              )}
            </p>
          </div>
          {strip && <VisualFigure spec={strip} caption={null} />}
          <TbrCoverLedger report={report} locale={locale} />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400">
                  <th className="py-1 pr-2">{t.thDimension}</th>
                  <th className="py-1 pr-2">{t.thOwner}</th>
                  <th className="py-1 pr-2 text-right">{t.thWeight}</th>
                  <th className="py-1 pr-2 text-right">{t.thScore}</th>
                  <th className="py-1 pr-2 text-right">{t.thP50}</th>
                  <th className="py-1 text-right">{t.thPctl}</th>
                </tr>
              </thead>
              <tbody>
                {DIM_ORDER.map((d) => {
                  const row = c.dims[d];
                  return (
                    <tr key={d} className="border-b border-ink-100 dark:border-ink-800/60">
                      <td className="py-1 pr-2">
                        <a href={`#${TBR_V2_SECTION_IDS.dim(d)}`} className="font-medium text-ink-700 hover:text-brand-600 dark:text-ink-200">
                          <span className="font-mono text-[10px] text-ink-400">{d.toUpperCase()}</span> {locale === "vi" ? DIMENSION_OWNERS[d].titleVi : DIMENSION_OWNERS[d].title}
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
