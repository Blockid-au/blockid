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
import { AgentBadge, AuditStampLine, TBR_V2_SECTION_IDS, TbrSection, stateLabel, valuationLocale, type TbrUiLocale } from "./shared";

const CHIP_CLASS: Record<ValuationSourceChip, string> = {
  connector: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  document: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  founder_stated: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  assumed: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  none: "border-ink-200 bg-ink-50 text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400",
  benchmark: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  model: "border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300",
};

function SourceChip({ chip, label }: { chip: ValuationSourceChip; label: string }) {
  return (
    <span data-tbr-source={chip} className={cn("inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none", CHIP_CLASS[chip])}>
      {label}
    </span>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{children}</p>;
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
      <TbrSection id={TBR_V2_SECTION_IDS.valuation} kicker="10" title={title}>
        <div className="flex items-center gap-2">
          <AgentBadge role="cfo" />
        </div>
        <p className="rounded-xl border border-dashed border-ink-300 p-4 text-sm text-ink-600 dark:border-ink-700 dark:text-ink-400" data-valuation-pending>
          {s.pending}
        </p>
      </TbrSection>
    );
  }
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.valuation} kicker="10" title={title}>
      <div className="flex items-center gap-2">
        <AgentBadge role="cfo" />
        <span className="text-[11px] text-ink-500">{s.confidence(view.confidencePct)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["lowAud", "midAud", "highAud"] as const).map((k) => (
          <div key={k} className={cn("rounded-xl border p-4", k === "midAud" ? "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30" : "border-ink-200 dark:border-ink-800")}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-400">{k === "lowAud" ? s.low : k === "midAud" ? s.consensus : s.high}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900 dark:text-ink-100">{aud(v.consensus[k])}</p>
          </div>
        ))}
      </div>
      {rangeBars && <VisualFigure spec={rangeBars} caption={`${rangeBars.title} · ${stateLabel(rangeBars.dataState, locale)}`} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800" />}
      {!free && (
        <>
          {view.inputRows.length > 0 && (
            <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-800" data-tbr-valuation-inputs>
              <SubTitle>{s.inputsTitle}</SubTitle>
              <table className="mt-1 w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-700">
                    <th className="py-1 pr-2">{s.thInput}</th>
                    <th className="py-1 pr-2">{s.thValue}</th>
                    <th className="py-1">{s.thSource}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.inputRows.map((r) => (
                    <tr key={r.key} className="border-b border-ink-100 dark:border-ink-800/60">
                      <td className="py-1 pr-2 font-medium text-ink-700 dark:text-ink-200">{r.label}</td>
                      <td className="py-1 pr-2 tabular-nums text-ink-700 dark:text-ink-200">{r.value}</td>
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
            <p className="rounded-lg border border-dashed border-ink-300 p-3 text-xs text-ink-600 dark:border-ink-700 dark:text-ink-400" data-tbr-valuation-none>
              {s.noneApplicable}{" "}
              <a href={CONNECTORS_HREF} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">
                {s.connectorsCta}
              </a>
            </p>
          ) : (
            <div data-tbr-valuation-methods>
              <SubTitle>{s.methodsTitle}</SubTitle>
              <table className="mt-1 w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-700">
                    <th className="py-1 pr-2">{s.thMethod}</th>
                    <th className="py-1 pr-2 text-right">{s.low}</th>
                    <th className="py-1 pr-2 text-right">{s.consensus}</th>
                    <th className="py-1 pr-2 text-right">{s.high}</th>
                    <th className="py-1 pr-2 text-right">{s.thWeight}</th>
                    <th className="py-1">{s.thDerivation}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.methodRows.map((m) => (
                    <tr key={m.method} className="border-b border-ink-100 dark:border-ink-800/60" data-tbr-method={m.method}>
                      <td className="py-1 pr-2 font-medium">{m.label}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{aud(m.lowAud)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{aud(m.midAud)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{aud(m.highAud)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{m.weightPct}%</td>
                      <td className="py-1 text-ink-600 dark:text-ink-400">
                        {m.derivation ?? m.rationale}
                        {m.derivation && m.rationale ? <span className="block text-[10px] text-ink-500">{m.rationale}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.needRevenueLine && (
                <p className="mt-1 text-[11px] text-ink-600 dark:text-ink-400" data-tbr-valuation-need-revenue>
                  {view.needRevenueLine}{" "}
                  <a href={CONNECTORS_HREF} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">
                    {s.connectorsCta}
                  </a>
                </p>
              )}
            </div>
          )}
          {view.unitEconomics.length > 0 && (
            <div className="rounded-lg border border-ink-200 p-3 text-xs dark:border-ink-800" data-tbr-valuation-unit-economics>
              <SubTitle>{s.unitEconomicsTitle}</SubTitle>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                {view.unitEconomics.map((r) => (
                  <div key={r.key} className="flex justify-between gap-2 border-b border-ink-100 py-0.5 dark:border-ink-800/60">
                    <dt className="text-ink-500">{r.label}</dt>
                    <dd className="tabular-nums text-ink-700 dark:text-ink-200">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-200 p-3 text-xs dark:border-ink-800">
              <SubTitle>{s.scenarios}</SubTitle>
              <p className="mt-1 tabular-nums text-ink-700 dark:text-ink-200">{view.scenarioLine}</p>
              {view.askLine && (
                <p className="mt-1 text-ink-700 dark:text-ink-200" data-tbr-valuation-ask>
                  {view.askLine}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-ink-200 p-3 text-xs dark:border-ink-800">
              <SubTitle>{view.sectorMultiplesTitle}</SubTitle>
              <p className="mt-1 tabular-nums text-ink-700 dark:text-ink-200">{view.sectorMultiplesLine}</p>
              <p className="mt-1 text-ink-600 dark:text-ink-400">{view.comparablesLine}</p>
            </div>
          </div>
          {view.crossChecks.length > 0 && (
            <div className="rounded-lg border border-ink-200 p-3 text-xs dark:border-ink-800" data-tbr-valuation-cross-checks>
              <SubTitle>{s.crossChecksTitle}</SubTitle>
              <ul className="mt-1 space-y-1">
                {view.crossChecks.map((c, i) => (
                  <li key={i} className="text-ink-700 dark:text-ink-200">
                    <span className="font-medium">{c.label}</span>: <span className="tabular-nums">{c.range}</span>
                    {c.n !== null ? ` (${s.nLabel(c.n)})` : ""}
                    <span className="block text-[10px] text-ink-500">
                      {c.source} · {s.asOf(c.asOf)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.consistency.length > 0 && (
            <div className="rounded-lg border border-orange-200/70 bg-orange-50/50 p-3 text-xs dark:border-orange-900/60 dark:bg-orange-950/20" data-tbr-valuation-consistency>
              <SubTitle>{s.consistencyTitle}</SubTitle>
              <ul className="mt-1 space-y-1 text-ink-700 dark:text-ink-200">
                {view.consistency.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {others.map((x) => (
            <VisualFigure key={x.id} spec={x} caption={`${x.title} · ${stateLabel(x.dataState, locale)}`} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800" />
          ))}
        </>
      )}
      <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-400">{v.narrative}</p>
      <AuditStampLine audit={v.audit} locale={locale} />
    </TbrSection>
  );
}
