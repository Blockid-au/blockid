// Section 1 — Dashboard (G27, spec § 2 row 1 + § 5, wireframe W1): the
// memo deal header + research front matter on one page. Replaces the cover
// and absorbs the Assessment Card: startup · verification · stage · sector ·
// phase · date; the four stat tiles (SVI index · evidence confidence ·
// verdict band · valuation range); the 8-dimension bar chart against the
// stage median band (no radar); the footer line (top strength · top gap ·
// unverified claims · last updated · methodology) and the general-advice
// sentence. Every number comes from `buildDashboardView` so the PDF, DOCX and
// e-mail twins print the same figures. Hook-free.

import { AbnBadge } from "@/components/verification/abn-badge";
import { coverEvidenceLine } from "@/lib/report-v2/evidence-view";
import { coverLedgerCells, pendingDimsLine } from "@/lib/report-v2/ledger-rows";
import type { DashboardView } from "@/lib/report-v2/dashboard-view";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import { cn } from "@/lib/utils";
import { TBR_V2_SECTION_IDS, TbrSection, phaseLabel, v2Strings, type TbrUiLocale } from "./shared";
import { DimBarChart, FIGURE_CLASS, StatTile, v3Strings } from "./shared-v3";
import { TbrNumberNotes } from "./number-notes";
import { TbrInvestorScreening } from "./investor-screening";
import { buildCitationIndex } from "@/lib/report-v2/citations";

/** G19-S41 — the ledger strip "base 100 → dims → stage → penalties → total" + "N of 8 dimensions pending" (kept from the cover). */
export function TbrCoverLedger({ report, locale = "en" }: { report: ReportV2; locale?: TbrUiLocale }) {
  const rowLocale: "en" | "vi" = locale === "vi" ? "vi" : "en";
  const cells = coverLedgerCells(report.cover, rowLocale);
  const pending = pendingDimsLine(report.cover, rowLocale);
  const evidence = coverEvidenceLine(report.cover, rowLocale);
  if (cells.length === 0 && !pending && !evidence) return null;
  const t = getTbrStrings(locale).ledger;
  return (
    <div data-tbr-cover-ledger className="space-y-1">
      {(cells.length > 0 || evidence) && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {cells.length > 0 && <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted">{t.coverTitle}</span>}
          {cells.map((cell, i) => (
            <span key={cell.label} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-muted">→</span>}
              <span className={cn("rounded-md border px-1.5 py-0.5", FIGURE_CLASS, i === cells.length - 1 ? "border-brand-navy/40 bg-surface-sunken font-semibold text-primary" : "border-line-subtle text-secondary")}>
                <span className="text-muted">{cell.label}</span> {cell.value}
              </span>
            </span>
          ))}
          {evidence && (
            <span data-tbr-cover-evidence className="ml-1 rounded-md border border-line-subtle px-1.5 py-0.5 text-secondary">
              {evidence}
            </span>
          )}
        </div>
      )}
      {pending && (
        <p data-tbr-pending-dims className="text-xs text-muted">
          {pending}
        </p>
      )}
    </div>
  );
}

export function TbrDashboard({ report, view, title, locale = "en", lockCards }: { report: ReportV2; view: DashboardView; title: string; locale?: TbrUiLocale; lockCards?: boolean }) {
  const c = report.cover;
  const t = v3Strings(locale);
  const tc = getTbrStrings(locale).v2.cover;
  const date = new Date(report.generatedAt).toLocaleDateString(locale === "vi" ? "vi-VN" : locale === "es" ? "es-ES" : locale === "ja" ? "ja-JP" : "en-AU", { day: "numeric", month: "long", year: "numeric" });
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.dashboard} kicker="1" title={title} purpose={t.purpose.dashboard} pageBreak>
      <div data-tbr-dashboard-header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight text-primary md:text-3xl">
            {c.startupName}
            {c.verification && <AbnBadge level={c.verification.level} />}
          </p>
          <p className="mt-1 text-sm text-secondary">
            {c.sector} · {c.stageLabel} · {tc.phase}:{" "}
            <span data-tbr-phase-badge className="rounded-full border border-brand-navy/40 bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-primary">
              {phaseLabel(c.phaseId, locale)}
            </span>
          </p>
        </div>
        <p className={cn("text-xs text-muted", FIGURE_CLASS)}>
          {date} · {view.footer.methodology}
          {report.source !== "pipeline" && (
            <span className="ml-2 rounded-full border border-line-subtle px-2 py-0.5 text-xs uppercase tracking-wide text-muted">{report.source === "fixture" ? tc.demoData : tc.builtFromSnapshot}</span>
          )}
        </p>
      </div>

      {/* The four tiles — fixed order SVI · Evidence · Verdict · Valuation; 1-col at 375, 2-col ≥ 640, 4-col ≥ 1024. */}
      <div data-tbr-tiles className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {view.tiles.map((tile) => (
          <StatTile key={tile.id} id={tile.id} label={tile.label} value={tile.value} sub={tile.sub} note={tile.note} band={tile.band} />
        ))}
      </div>

      <TbrNumberNotes report={report} locale={locale} />

      <TbrInvestorScreening report={report} locale={locale} lockCards={lockCards} citations={buildCitationIndex(report)} />

      <DimBarChart chart={view.chart} caption={view.chartCaption} legend={view.legend} showBand={view.showBand} locale={locale} />

      <TbrCoverLedger report={report} locale={locale} />

      <div data-tbr-dashboard-footer className="space-y-1 border-t border-line-subtle pt-3 text-xs text-secondary">
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {view.footer.topStrength ? (
            <span>
              <span className="font-semibold uppercase tracking-wide text-muted">{t.topStrength}</span> <span className={FIGURE_CLASS}>{view.footer.topStrength}</span>
            </span>
          ) : null}
          {view.footer.topGap ? (
            <span>
              <span className="font-semibold uppercase tracking-wide text-muted">{t.topGap}</span> <span className={FIGURE_CLASS}>{view.footer.topGap}</span>
            </span>
          ) : null}
          <span className={FIGURE_CLASS}>{view.footer.unverified}</span>
          <span>{view.footer.lastUpdated}</span>
        </p>
        <p className="text-muted">{v2Strings(locale).adapter.disclaimer}</p>
      </div>
    </TbrSection>
  );
}
