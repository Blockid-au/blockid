// Section 4 — Valuation (G27 order; G19-S42 content): range low · mid · high
// (+ the ask as a marker when stated) → methods table (method · applicable ·
// weight · low · mid · high · rationale, bold consensus row) → what moves it
// → inputs & assumptions (with source chips),
// ONLY the applicable methods (+ "N methods need revenue" CTA when some are
// hidden, one sentence + CTA when none ran), unit economics, cross-checks
// (backtest quartile + AU stage baseline), consistency notes, ask only when
// the founder stated one. Free tier shows the range only. Every label comes
// from lib/i18n/tbr-strings.ts (EN / VI); the PDF and DOCX twins render the
// same `buildValuationView` rows.

import { aud } from "@/lib/report-visuals";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { buildValuationView, CONNECTORS_HREF, type ValuationSourceChip } from "@/lib/report-v2/valuation-view";
import { cn } from "@/lib/utils";
import { AgentBadge, AuditStampLine, Prose, TABLE_CLASS, TBR_V2_SECTION_IDS, THEAD_CLASS, TbrSection, stateLabel, valuationLocale, zebraRow, type TbrUiLocale } from "./shared";
import { FIGURE_CLASS, STICKY_COL_CLASS, TABLE_MIN_CLASS, TABLE_SCROLL_CLASS, TD_CLASS, TH_CLASS, v3Strings } from "./shared-v3";
import type { CitationIndex } from "@/lib/report-v2/citations";
import type { InvestmentView } from "@/lib/report-v2/schema";

const CHIP_CLASS: Record<ValuationSourceChip, string> = {
  connector: "border-emerald-300 dark:border-emerald-800 bg-surface-sunken text-bull",
  document: "border-sky-300 dark:border-sky-800 bg-surface-sunken text-action",
  founder_stated: "border-amber-300 dark:border-amber-800 bg-surface-sunken text-warn",
  assumed: "border-orange-300 dark:border-orange-800 bg-surface-sunken text-bear",
  none: "border-line-subtle bg-surface-sunken text-muted",
  benchmark: "border-accent-300 dark:border-accent-800 bg-surface-sunken text-accent",
  model: "border-line-subtle bg-surface text-secondary",
};

function SourceChip({ chip, label }: { chip: ValuationSourceChip; label: string }) {
  return (
    <span data-tbr-source={chip} className={cn("inline-block rounded-full border px-1.5 py-0.5 text-xs font-medium leading-none", CHIP_CLASS[chip])}>
      {label}
    </span>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</p>;
}

export function TbrValuation({ report, title, locale = "en", citations, investment }: { report: ReportV2; title: string; locale?: TbrUiLocale; /** G24-A: footnote numbering (report.tsx). */ citations?: CitationIndex; /** G27: "what moves it" rows. */ investment?: InvestmentView }) {
  const v = report.valuation;
  const free = report.tier === "free";
  const view = buildValuationView(v, valuationLocale(locale));
  const s = view.strings;
  const t3 = v3Strings(locale);
  const rangeBars = v.visuals.find((x) => x.kind === "range_bars");
  const others = v.visuals.filter((x) => x !== rangeBars);
  // No scored dimension yet → the consensus would be the three-case model of
  // SVI 0 (≈ A$0.6–0.9M), which reads as a real valuation. Say so instead.
  if (report.cover.svi.band === "pending") {
    return (
      <TbrSection id={TBR_V2_SECTION_IDS.valuation} kicker="4" title={title} pageBreak>
        <div className="flex items-center gap-2">
          <AgentBadge role="cfo" />
        </div>
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-secondary" data-valuation-pending>
          {s.pending}
        </p>
      </TbrSection>
    );
  }
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.valuation} kicker="4" title={title} pageBreak>
      <div className="flex items-center gap-2">
        <AgentBadge role="cfo" />
        <span className="text-xs text-muted">{s.confidence(view.confidencePct)}</span>
      </div>
      {/* Range: low · mid · high tiles + the ask when stated. */}
      <div data-tbr-valuation-range className="grid gap-3 sm:grid-cols-3">
        {(["lowAud", "midAud", "highAud"] as const).map((k) => (
          <div key={k} data-tbr-tile={`valuation-${k}`} className={cn("rounded-xl border p-4", k === "midAud" ? "border-brand-navy/40 bg-surface-sunken" : "border-line-subtle")}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">{k === "lowAud" ? s.low : k === "midAud" ? s.consensus : s.high}</p>
            <p className={cn("mt-1 text-2xl font-bold text-primary", FIGURE_CLASS)}>{aud(v.consensus[k])}</p>
          </div>
        ))}
      </div>
      {view.askLine && (
        <p className="text-xs text-secondary" data-tbr-valuation-ask>
          {view.askLine}
        </p>
      )}
      {rangeBars && <VisualFigure spec={rangeBars} caption={`${rangeBars.title} · ${stateLabel(rangeBars.dataState, locale)}`} className="rounded-xl border border-line-subtle p-3" />}
      {/* Methods: every method row (applicable or not), weights, the bold consensus row; the free tier reads names + weights only. */}
      {!view.noneApplicable && (
        <div data-tbr-valuation-methods className={TABLE_SCROLL_CLASS}>
          <table className={TABLE_MIN_CLASS}>
            <caption className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{s.methodsTitle}</caption>
            <thead>
              <tr className="bg-surface">
                <th scope="col" className={cn(TH_CLASS, STICKY_COL_CLASS, "min-w-[180px]")}>{s.thMethod}</th>
                <th scope="col" className={cn(TH_CLASS, "text-center")}>{t3.thApplicable}</th>
                <th scope="col" className={cn(TH_CLASS, "text-right")}>{s.thWeight}</th>
                {!free && <th scope="col" className={cn(TH_CLASS, "text-right")}>{s.low}</th>}
                {!free && <th scope="col" className={cn(TH_CLASS, "text-right")}>{s.consensus}</th>}
                {!free && <th scope="col" className={cn(TH_CLASS, "text-right")}>{s.high}</th>}
                {!free && <th scope="col" className={cn(TH_CLASS, "min-w-[240px]")}>{s.thDerivation}</th>}
              </tr>
            </thead>
            <tbody>
              {v.methods.map((m, i) => {
                const row = view.methodRows.find((r) => r.method === m.method);
                return (
                  <tr key={m.method} className={cn(zebraRow(i), !m.applicable && "text-muted")} data-tbr-method={m.method} data-tbr-method-applicable={m.applicable ? "yes" : "no"}>
                    <td className={cn(TD_CLASS, STICKY_COL_CLASS, "font-medium", i % 2 === 1 && "bg-surface-sunken", !m.applicable && "text-muted")}>{s.method[m.method]}</td>
                    <td className={cn(TD_CLASS, "text-center")} aria-label={m.applicable ? "applicable" : "not applicable"}>{m.applicable ? t3.yes : t3.no}</td>
                    <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>{Math.round(m.weight * 100)}%</td>
                    {!free && <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>{m.applicable ? aud(m.lowAud) : "—"}</td>}
                    {!free && <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>{m.applicable ? aud(m.midAud) : "—"}</td>}
                    {!free && <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>{m.applicable ? aud(m.highAud) : "—"}</td>}
                    {!free && (
                      <td className={cn(TD_CLASS, "text-secondary")}>
                        {row?.derivation ?? m.rationale}
                        {row?.derivation && m.rationale ? <span className="block text-xs text-muted">{m.rationale}</span> : null}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr data-tbr-consensus-row className="border-t-2 border-line bg-surface-sunken font-semibold">
                <td className={cn(TD_CLASS, STICKY_COL_CLASS, "bg-surface-sunken")}>{t3.consensusRow}</td>
                <td className={TD_CLASS} />
                <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>100%</td>
                {!free && <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>{aud(v.consensus.lowAud)}</td>}
                {!free && <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>{aud(v.consensus.midAud)}</td>}
                {!free && <td className={cn(TD_CLASS, "text-right", FIGURE_CLASS)}>{aud(v.consensus.highAud)}</td>}
                {!free && <td className={cn(TD_CLASS, "text-xs font-normal text-muted")}>{s.confidence(view.confidencePct)}</td>}
              </tr>
            </tbody>
          </table>
          {view.needRevenueLine && (
            <p className="px-3 py-2 text-xs text-secondary" data-tbr-valuation-need-revenue>
              {view.needRevenueLine}{" "}
              <a href={CONNECTORS_HREF} className="font-medium text-action underline underline-offset-2">
                {s.connectorsCta}
              </a>
            </p>
          )}
        </div>
      )}
      {investment && investment.whatMovesIt.length > 0 && (
        <div data-tbr-what-moves-it className="rounded-r-lg border-l-4 border-warn bg-surface-sunken px-3 py-3 print:break-inside-avoid">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
            <span aria-hidden="true">▸</span>
            {t3.whatMovesIt}
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-primary">
            {investment.whatMovesIt.map((m, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true" className="text-warn">▸</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!free && (
        <>
          {view.inputRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line-subtle p-3" data-tbr-valuation-inputs>
              <SubTitle>{s.inputsTitle}</SubTitle>
              <table className={cn("mt-1", TABLE_CLASS)}>
                <thead className={THEAD_CLASS}>
                  <tr className="border-b border-line-subtle">
                    <th className="py-1 pr-2">{s.thInput}</th>
                    <th className="py-1 pr-2">{s.thValue}</th>
                    <th className="py-1">{s.thSource}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.inputRows.map((r, i) => (
                    <tr key={r.key} className={zebraRow(i)}>
                      <td className="py-1 pr-2 font-medium text-secondary">{r.label}</td>
                      <td className="py-1 pr-2 tabular-nums text-secondary">{r.value}</td>
                      <td className="py-1">
                        <SourceChip chip={r.source} label={s.source[r.source]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view.noneApplicable && (
            <p className="rounded-lg border border-dashed border-line p-3 text-xs text-secondary" data-tbr-valuation-none>
              {s.noneApplicable}{" "}
              <a href={CONNECTORS_HREF} className="font-medium text-action underline underline-offset-2">
                {s.connectorsCta}
              </a>
            </p>
          )}
          {view.unitEconomics.length > 0 && (
            <div className="rounded-lg border border-line-subtle p-3 text-xs" data-tbr-valuation-unit-economics>
              <SubTitle>{s.unitEconomicsTitle}</SubTitle>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                {view.unitEconomics.map((r) => (
                  <div key={r.key} className="flex justify-between gap-2 border-b border-line-subtle py-0.5">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className="tabular-nums text-secondary">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line-subtle p-3 text-xs">
              <SubTitle>{s.scenarios}</SubTitle>
              <p className={cn("mt-1 text-secondary", FIGURE_CLASS)}>{view.scenarioLine}</p>
            </div>
            <div className="rounded-lg border border-line-subtle p-3 text-xs">
              <SubTitle>{view.sectorMultiplesTitle}</SubTitle>
              <p className="mt-1 tabular-nums text-secondary">{view.sectorMultiplesLine}</p>
              <p className="mt-1 text-secondary">{view.comparablesLine}</p>
            </div>
          </div>
          {view.crossChecks.length > 0 && (
            <div className="rounded-lg border border-line-subtle p-3 text-xs" data-tbr-valuation-cross-checks>
              <SubTitle>{s.crossChecksTitle}</SubTitle>
              <ul className="mt-1 space-y-1">
                {view.crossChecks.map((c, i) => (
                  <li key={i} className="text-secondary">
                    <span className="font-medium">{c.label}</span>: <span className="tabular-nums">{c.range}</span>
                    {c.n !== null ? ` (${s.nLabel(c.n)})` : ""}
                    <span className="block text-xs text-muted">
                      {c.source} · {s.asOf(c.asOf)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.consistency.length > 0 && (
            <div className="rounded-lg border border-orange-300 dark:border-orange-800 bg-surface-sunken p-3 text-xs" data-tbr-valuation-consistency>
              <SubTitle>{s.consistencyTitle}</SubTitle>
              <ul className="mt-1 space-y-1 text-secondary">
                {view.consistency.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {others.map((x) => (
            <VisualFigure key={x.id} spec={x} caption={`${x.title} · ${stateLabel(x.dataState, locale)}`} className="rounded-xl border border-line-subtle p-3" />
          ))}
        </>
      )}
      <Prose text={v.narrative} size="xs" testId="tbr-valuation-narrative" citations={citations} locale={locale} />
      <AuditStampLine audit={v.audit} locale={locale} />
    </TbrSection>
  );
}
