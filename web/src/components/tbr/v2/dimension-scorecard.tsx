// G34 BT3 (RQ04) — the 8-dimension scorecard on page 1 (spec §1 "Scorecard",
// §4, §6). One <table> with a caption, rows in chapter order: dimension link
// (the whole ≥ 56 px row is the click target via a pseudo-element) + "Lead ·
// CRO" as an <abbr>, the stage emphasis BAND (never a weight, D24-f), a solid
// navy score bar + number, the band chip (icon + text), a 6-segment cyan
// confidence meter, the trend (only for a same-method revision) and the
// chevron — or 🔒 "In full report" on a locked free chapter (D24-b: the
// score and band stay visible). Pending = "—" in a dashed chip, never 0.
// Hook-free; every figure comes from `buildDashboardV4`.

import { ChevronRight, LockKeyhole } from "lucide-react";
import type { DashboardV4, V4ScoreRow } from "@/lib/report-v2/dashboard-v4";
import { cn } from "@/lib/utils";
import { BandChip, FIGURE_CLASS, TH_CLASS } from "./shared-v3";
import type { TbrUiLocale } from "./shared";

/** Six cyan-muted segments (a different shape from the solid score bar, spec §6). */
export function ConfidenceMeter({ segments, label, className }: { segments: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} data-tbr-confidence-meter={segments} className={cn("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} aria-hidden="true" className={cn("h-2.5 w-2 rounded-[1px] border", i < segments ? "border-action bg-action" : "border-line bg-surface")} />
      ))}
    </span>
  );
}

function ScoreCell({ row, strings }: { row: V4ScoreRow; strings: DashboardV4["strings"] }) {
  if (row.score === null) {
    return (
      <span data-tbr-score-pending className="inline-flex min-h-6 items-center gap-1 rounded-full border border-dashed border-line px-2 text-xs text-muted">
        <span aria-hidden="true">◌</span>
        <span className={FIGURE_CLASS}>—</span>
        <span>{strings.pending}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span role="img" aria-label={row.ariaLabel} className="relative hidden h-2 w-20 overflow-hidden rounded-sm bg-surface-sunken sm:inline-block">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-action" style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} />
      </span>
      <span className={cn("text-sm font-semibold text-primary", FIGURE_CLASS)}>{row.score}</span>
    </span>
  );
}

export function DimensionScorecard({ v4, locale = "en", footer }: { v4: DashboardV4; locale?: TbrUiLocale; footer?: React.ReactNode }) {
  const s = v4.strings;
  return (
    <div data-tbr-scorecard className="min-w-0 space-y-2">
      <h3 className="font-display text-base font-semibold text-primary">{s.scorecardTitle}</h3>
      <div className="overflow-x-auto rounded-xl border border-line-subtle print:overflow-visible">
        <table className="w-full text-sm">
          <caption className="sr-only">{s.scorecardCaption}</caption>
          <thead className="bg-surface-sunken">
            <tr>
              <th scope="col" className={TH_CLASS}>{s.thDimension}</th>
              <th scope="col" className={cn(TH_CLASS, "hidden sm:table-cell")}>{s.thEmphasis}</th>
              <th scope="col" className={TH_CLASS}>{s.thScore}</th>
              <th scope="col" className={cn(TH_CLASS, "hidden md:table-cell")}>{s.thBand}</th>
              <th scope="col" className={cn(TH_CLASS, "hidden md:table-cell")}>{s.thEvidence}</th>
              <th scope="col" className={cn(TH_CLASS, "hidden lg:table-cell")}>{s.thTrend}</th>
              <th scope="col" className={TH_CLASS}><span className="sr-only">{s.thOpen}</span></th>
            </tr>
          </thead>
          <tbody>
            {v4.scorecard.map((row) => (
              <tr key={row.dim} data-tbr-scorecard-row={row.dim} data-state={row.pending ? "pending" : row.band} data-locked={row.locked ? "true" : undefined} className="relative border-t border-line-subtle hover:bg-surface-sunken focus-within:bg-surface-sunken">
                <th scope="row" className="px-3 py-2.5 text-left align-middle font-normal">
                  <a href={row.href} className="font-medium text-primary underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-navy">
                    {row.title}
                  </a>
                  <span className="mt-0.5 block text-xs text-muted">
                    <abbr title={s.leadTitle(row.leadCode)} className="no-underline">{s.leadLine(row.leadCode)}</abbr>
                    <span className="sm:hidden"> · {row.emphasisLabel}</span>
                  </span>
                  {row.degraded ? (
                    <span data-tbr-row-degraded className="mt-1 inline-flex items-center gap-1 text-xs text-secondary">
                      <span aria-hidden="true">◌</span>
                      {s.writtenUnavailable}
                    </span>
                  ) : null}
                </th>
                <td className="hidden px-3 py-2.5 align-middle sm:table-cell">
                  <span data-tbr-emphasis={row.emphasis} className="inline-flex items-center rounded-full border border-line-subtle px-2 py-0.5 text-xs text-primary">
                    {row.emphasisLabel}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <ScoreCell row={row} strings={s} />
                  <span className="mt-1 block md:hidden">{row.pending ? null : <BandChip band={row.band} locale={locale} />}</span>
                </td>
                <td className="hidden px-3 py-2.5 align-middle md:table-cell">
                  {row.pending ? <span className="text-xs text-muted">{s.pendingNoEvidence}</span> : <BandChip band={row.band} locale={locale} />}
                </td>
                <td className="hidden px-3 py-2.5 align-middle md:table-cell">
                  {row.evidencePct === null ? (
                    <span className={cn("text-xs text-muted", FIGURE_CLASS)}>—</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ConfidenceMeter segments={row.segments} label={s.meterAria(row.evidencePct)} />
                      <span className={cn("text-xs text-secondary", FIGURE_CLASS)}>{row.evidencePct} %</span>
                    </span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 align-middle lg:table-cell">
                  {row.trend ? (
                    <span className={cn("text-xs text-secondary", FIGURE_CLASS)}>{row.trend.label}</span>
                  ) : (
                    <span className={cn("text-xs text-muted", FIGURE_CLASS)} title={s.trendUnavailable}>
                      {s.trendNone}
                      <span className="sr-only"> {s.trendUnavailable}</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right align-middle">
                  {row.locked ? (
                    <span data-tbr-row-locked className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted">
                      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                      {s.inFullReport}
                    </span>
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4 text-action" aria-hidden="true" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{s.leadFootnote} {s.emphasisNote(v4.stageName)}</p>
      {footer}
    </div>
  );
}
