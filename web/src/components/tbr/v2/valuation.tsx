// Chapter 10 — Valuation (G19-S42): inputs & assumptions (with source chips),
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
import { AgentBadge, AuditStampLine, Prose, TABLE_CLASS, TBR_V2_SECTION_IDS, THEAD_CLASS, TbrSection, stateLabel, v2Strings, valuationLocale, zebraRow, type TbrUiLocale } from "./shared";

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

export function TbrValuation({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const v = report.valuation;
  const free = report.tier === "free";
  const view = buildValuationView(v, valuationLocale(locale));
  const s = view.strings;
  const rangeBars = v.visuals.find((x) => x.kind === "range_bars");
  const others = v.visuals.filter((x) => x !== rangeBars);
  // No scored dimension yet → the consensus would be the three-case model of
  // SVI 0 (≈ A$0.6–0.9M), which reads as a real valuation. Say so instead.
  if (report.cover.svi.band === "pending") {
    return (
      <TbrSection id={TBR_V2_SECTION_IDS.valuation} kicker="10" title={title} purpose={v2Strings(locale).s47.purpose.valuation} pageBreak>
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
    <TbrSection id={TBR_V2_SECTION_IDS.valuation} kicker="10" title={title} purpose={v2Strings(locale).s47.purpose.valuation} pageBreak>
      <div className="flex items-center gap-2">
        <AgentBadge role="cfo" />
        <span className="text-xs text-muted">{s.confidence(view.confidencePct)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["lowAud", "midAud", "highAud"] as const).map((k) => (
          <div key={k} className={cn("rounded-xl border p-4", k === "midAud" ? "border-brand-300 dark:border-brand-800 bg-surface-sunken" : "border-line-subtle")}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">{k === "lowAud" ? s.low : k === "midAud" ? s.consensus : s.high}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{aud(v.consensus[k])}</p>
          </div>
        ))}
      </div>
      {rangeBars && <VisualFigure spec={rangeBars} caption={`${rangeBars.title} · ${stateLabel(rangeBars.dataState, locale)}`} className="rounded-xl border border-line-subtle p-3" />}
      {!free && (
        <>
          {view.inputRows.length > 0 && (
            <div className="rounded-lg border border-line-subtle p-3" data-tbr-valuation-inputs>
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
          {view.noneApplicable ? (
            <p className="rounded-lg border border-dashed border-line p-3 text-xs text-secondary" data-tbr-valuation-none>
              {s.noneApplicable}{" "}
              <a href={CONNECTORS_HREF} className="font-medium text-action underline underline-offset-2">
                {s.connectorsCta}
              </a>
            </p>
          ) : (
            <div data-tbr-valuation-methods>
              <SubTitle>{s.methodsTitle}</SubTitle>
              <table className={cn("mt-1", TABLE_CLASS)}>
                <thead className={THEAD_CLASS}>
                  <tr className="border-b border-line-subtle">
                    <th className="py-1 pr-2">{s.thMethod}</th>
                    <th className="py-1 pr-2 text-right">{s.low}</th>
                    <th className="py-1 pr-2 text-right">{s.consensus}</th>
                    <th className="py-1 pr-2 text-right">{s.high}</th>
                    <th className="py-1 pr-2 text-right">{s.thWeight}</th>
                    <th className="py-1">{s.thDerivation}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.methodRows.map((m, i) => (
                    <tr key={m.method} className={zebraRow(i)} data-tbr-method={m.method}>
                      <td className="py-1 pr-2 font-medium">{m.label}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{aud(m.lowAud)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{aud(m.midAud)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{aud(m.highAud)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{m.weightPct}%</td>
                      <td className="py-1 text-secondary">
                        {m.derivation ?? m.rationale}
                        {m.derivation && m.rationale ? <span className="block text-xs text-muted">{m.rationale}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.needRevenueLine && (
                <p className="mt-1 text-xs text-secondary" data-tbr-valuation-need-revenue>
                  {view.needRevenueLine}{" "}
                  <a href={CONNECTORS_HREF} className="font-medium text-action underline underline-offset-2">
                    {s.connectorsCta}
                  </a>
                </p>
              )}
            </div>
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
              <p className="mt-1 tabular-nums text-secondary">{view.scenarioLine}</p>
              {view.askLine && (
                <p className="mt-1 text-secondary" data-tbr-valuation-ask>
                  {view.askLine}
                </p>
              )}
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
      <Prose text={v.narrative} size="xs" testId="tbr-valuation-narrative" />
      <AuditStampLine audit={v.audit} locale={locale} />
    </TbrSection>
  );
}
