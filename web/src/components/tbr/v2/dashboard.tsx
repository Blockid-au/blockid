// Section 1 — Dashboard. G34 BT3 (dashboard v4, spec docs/design/tbr-v4-
// dashboard-spec.md §1): the investor-first page 1 — masthead · 5 tiles
// (valuation largest · SVI uncapped · Investor Score 0–100 · evidence ·
// verification) · meeting label + thesis · key metrics · 8-dimension
// scorecard with lead agent + stage emphasis band · rule-derived red flags ·
// investor-signal status chips · why / stop / ask. On a phone the risks come
// before the strengths. Every figure comes from `buildDashboardV4` (composed
// over `buildDashboardView` / the investment view / the investor screening),
// so the PDF, DOCX and e-mail twins print the same page 1. Free tier
// (D24-b): nothing here is locked; locked chapters show "In full report" on
// their row and no locked detail reaches the lists. Hook-free.

import { AbnBadge } from "@/components/verification/abn-badge";
import { coverEvidenceLine } from "@/lib/report-v2/evidence-view";
import { coverLedgerCells, pendingDimsLine } from "@/lib/report-v2/ledger-rows";
import type { DashboardView } from "@/lib/report-v2/dashboard-view";
import type { DashboardV4, V4Tile } from "@/lib/report-v2/dashboard-v4";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import { cn } from "@/lib/utils";
import { TBR_V2_SECTION_IDS, TbrSection, phaseLabel, v2Strings, type TbrUiLocale } from "./shared";
import { FIGURE_CLASS, v3Strings } from "./shared-v3";
import { TbrNumberNotes } from "./number-notes";
import { TbrInvestorScreening } from "./investor-screening";
import { buildCitationIndex, type CitationIndex } from "@/lib/report-v2/citations";
import { ConfidenceMeter, DimensionScorecard } from "./dimension-scorecard";
import { KeyMetricsStrip } from "./key-metrics-strip";
import { RedFlagPanel, WhyStopAskLists } from "./red-flag-panel";
import { SignalChipStrip } from "./signal-chip-strip";
import { CalibrationLine, PeerStageStrip } from "./peer-stage-strip";

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

function TileShell({ id, label, className, children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div data-tbr-tile={id} className={cn("flex min-w-0 flex-col gap-1 rounded-xl border border-line-subtle bg-surface p-4 print:break-inside-avoid", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

function TileValue({ value, large }: { value: string; large?: boolean }) {
  return (
    <p className={cn("break-words font-bold leading-none text-primary", FIGURE_CLASS, large ? "text-3xl md:text-4xl" : value.length > 6 ? "text-2xl" : "text-3xl")} title={value}>
      {value}
    </p>
  );
}

const TILE_DOT: Record<string, string> = { strong: "bg-action", developing: "bg-warn", early: "bg-bear", pending: "bg-line" };

function TileLines({ tile }: { tile: V4Tile }) {
  return (
    <>
      {tile.sub ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-secondary">
          {tile.band ? <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", TILE_DOT[tile.band])} /> : null}
          <span>{tile.sub}</span>
        </p>
      ) : null}
      {tile.note ? <p className={cn("text-xs text-muted", FIGURE_CLASS)}>{tile.note}</p> : null}
    </>
  );
}

/** Low → high track with the weighted-estimate marker; the figures stay printed as text in the tile. */
function RangeBar({ range, label }: { range: { lowAud: number; midAud: number; highAud: number }; label: string }) {
  const span = range.highAud - range.lowAud;
  const mid = span > 0 ? Math.max(0, Math.min(100, ((range.midAud - range.lowAud) / span) * 100)) : 50;
  return (
    <span role="img" aria-label={label} className="relative mt-2 block h-2 w-full rounded-sm bg-surface-sunken">
      <span aria-hidden="true" className="absolute inset-y-0 left-[8%] right-[8%] rounded-sm bg-brand-navy/30" />
      <span aria-hidden="true" className="absolute -top-1 h-4 w-0.5 bg-action" style={{ left: `calc(8% + ${(mid * 0.84).toFixed(1)}%)` }} />
    </span>
  );
}

/** The five tiles (spec §1: valuation largest; SVI never "/100"). 2-up at 375 with valuation full width; 12-col spans 4·2·2·2·2 from lg. */
function V4Tiles({ v4 }: { v4: DashboardV4 }) {
  const [valuation, svi, investor, evidence, verification] = v4.tiles;
  return (
    <div data-tbr-tiles className="grid grid-cols-2 gap-3 lg:grid-cols-12">
      <TileShell id="valuation" label={valuation.label} className="col-span-2 lg:col-span-4">
        {valuation.state === "unavailable" ? (
          <div data-tbr-valuation-unavailable className="space-y-1">
            <p className="font-display text-lg font-semibold leading-snug text-primary">{valuation.value}</p>
            {valuation.unlockHint ? <p className="text-sm text-secondary">{valuation.unlockHint}</p> : null}
          </div>
        ) : (
          <>
            <TileValue value={valuation.value} large />
            {valuation.range ? <RangeBar range={valuation.range} label={valuation.value} /> : null}
            <TileLines tile={valuation} />
          </>
        )}
      </TileShell>
      {[svi, investor].map((tile) => (
        <TileShell key={tile.id} id={tile.id} label={tile.label} className="lg:col-span-2">
          <TileValue value={tile.value} />
          <TileLines tile={tile} />
        </TileShell>
      ))}
      <TileShell id="evidence" label={evidence.label} className="lg:col-span-2">
        <TileValue value={evidence.value} />
        <ConfidenceMeter segments={evidence.segments} label={v4.strings.meterAria(evidence.pct)} className="mt-1" />
        <TileLines tile={evidence} />
      </TileShell>
      <TileShell id="verification" label={verification.label} className="lg:col-span-2">
        <TileValue value={verification.value} />
        <TileLines tile={verification} />
      </TileShell>
    </div>
  );
}

const MEETING_GLYPH: Record<string, string> = { A: "●", B: "◐", C: "▲", D: "○" };

/** G31 neutral meeting label (band A–D) + the one-line thesis + the rule and the advice line. */
function MeetingLabel({ v4 }: { v4: DashboardV4 }) {
  const m = v4.meeting;
  return (
    <div data-tbr-meeting-label={m.band} className="rounded-r-lg border-l-4 border-brand-navy bg-surface-sunken px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide text-primary">
          <span aria-hidden="true">{MEETING_GLYPH[m.band]}</span>
          {m.label}
        </span>
        <span className={cn("text-xs text-muted", FIGURE_CLASS)}>{m.rule}</span>
      </p>
      {m.thesis ? <p className="mt-1 text-sm font-medium text-primary">{m.thesis}</p> : null}
      <p className="mt-1 text-sm text-secondary">{m.wording}</p>
      <p className="mt-1 text-xs text-muted">{m.subline}</p>
    </div>
  );
}

export function TbrDashboard({ report, view, v4, title, locale = "en", lockCards, citations }: { report: ReportV2; view: DashboardView; v4: DashboardV4; title: string; locale?: TbrUiLocale; lockCards?: boolean; citations?: CitationIndex }) {
  const c = report.cover;
  const t = v3Strings(locale);
  const tc = getTbrStrings(locale).v2.cover;
  const cites = citations ?? buildCitationIndex(report);
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

      {v4.degraded ? (
        <p role="status" data-tbr-degraded-banner className="flex gap-2 rounded-lg border border-l-[3px] border-line-subtle border-l-warn bg-warn-soft px-4 py-3 text-sm text-primary">
          <span aria-hidden="true">◌</span>
          <span>{v4.degraded.banner}</span>
        </p>
      ) : null}

      <V4Tiles v4={v4} />

      <MeetingLabel v4={v4} />

      {/* Desktop: metrics → scorecard ∥ red flags → lists. 375 px: red flags and the stop list before strengths (spec §1 mobile). */}
      <div data-tbr-dashboard-v4 className="grid gap-6 lg:grid-cols-12">
        <div className="order-3 min-w-0 lg:order-1 lg:col-span-12">
          <KeyMetricsStrip v4={v4} />
        </div>
        <div className="order-4 min-w-0 lg:order-2 lg:col-span-7">
          <DimensionScorecard
            v4={v4}
            locale={locale}
            footer={
              <>
                <SignalChipStrip v4={v4} />
                <PeerStageStrip v4={v4} />
              </>
            }
          />
        </div>
        <div className="order-1 min-w-0 lg:order-3 lg:col-span-5">
          <RedFlagPanel v4={v4} />
        </div>
        <div className="order-2 min-w-0 lg:order-4 lg:col-span-12">
          <WhyStopAskLists v4={v4} citations={cites} locale={locale} />
        </div>
      </div>

      <CalibrationLine v4={v4} />

      <TbrNumberNotes report={report} locale={locale} />

      <TbrInvestorScreening report={report} locale={locale} lockCards={lockCards} citations={cites} brief={false} />

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
