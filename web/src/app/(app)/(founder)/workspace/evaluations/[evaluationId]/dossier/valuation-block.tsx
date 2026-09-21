// Investor Dossier — block 2 · Valuation (BA spec §A.3 block 2, S-R4).
//
// Server component reading `DossierValuationBlock` (built from
// ReportV2.valuation — the CFO 5-method chapter the pipeline persisted, or
// the adapter's three-case lift, labelled as such). The range bars are the
// report's own `range_bars` VisualSpecV2 rendered inline (same SVG as the
// TBR / PDF), with the assessor's "my valuation view" overlaid as an extra
// row when block 4 carries one. Nothing is recomputed here.

import { aud } from "@/lib/report-visuals";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { DossierValuationBlock } from "@/lib/evaluations/dossier";
import { DossierBlock } from "./block";

export function ValuationBlock({ block, fullReportHref }: { block: DossierValuationBlock; fullReportHref: string | null }) {
  if (!block.available) {
    return (
      <DossierBlock n={2} title="Valuation" testId="dossier-block-2">
        <p data-testid="valuation-empty">Run the Trusted Business Report to get a valuation range — five methods, a consensus band and the founder&apos;s ask.</p>
      </DossierBlock>
    );
  }
  if (block.pending || !block.consensus) {
    return (
      <DossierBlock n={2} title="Valuation" testId="dossier-block-2">
        <p data-testid="valuation-pending">No dimension is scored yet, so the range is withheld — it would be the model&apos;s SVI-0 floor, not a valuation.</p>
      </DossierBlock>
    );
  }
  const c = block.consensus;
  return (
    <DossierBlock n={2} title="Valuation" testId="dossier-block-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span className="rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 font-mono uppercase">CFO</span>
        <span>consensus confidence {Math.round(c.confidence * 100)}%</span>
        <span data-testid="valuation-source">· {block.source === "pipeline" ? "5-method run persisted at snapshot time" : "lifted from the stored snapshot (three-case model)"}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3" data-testid="valuation-consensus">
        {(["lowAud", "midAud", "highAud"] as const).map((k) => (
          <div key={k} className="rounded-lg bg-surface-50 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-ink-500">{k === "lowAud" ? "Low" : k === "midAud" ? "Mid" : "High"}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink-900">{aud(c[k])}</dd>
          </div>
        ))}
      </dl>
      {block.rangeBars ? (
        <div className="mt-3 rounded-xl border border-surface-200 p-3" data-testid="valuation-range-bars">
          <VisualFigure spec={block.rangeBars} caption={block.rangeBars.subtitle ?? block.rangeBars.title} />
        </div>
      ) : null}
      {block.methods.length > 0 ? (
        <table className="mt-3 w-full text-xs" data-testid="valuation-methods">
          <thead>
            <tr className="border-b border-surface-200 text-left text-[10px] uppercase tracking-wide text-ink-500">
              <th className="py-1 pr-2">Method</th>
              <th className="py-1 pr-2 text-right">Weight</th>
              <th className="py-1 pr-2 text-right">Low</th>
              <th className="py-1 pr-2 text-right">Mid</th>
              <th className="py-1 text-right">High</th>
            </tr>
          </thead>
          <tbody>
            {block.methods.map((m) => (
              <tr key={m.method} className={m.applicable ? "border-b border-surface-100" : "border-b border-surface-100 text-ink-400"} title={m.rationale}>
                <td className="py-1 pr-2">{m.label}{m.applicable ? "" : " (n/a)"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{Math.round(m.weight * 100)}%</td>
                <td className="py-1 pr-2 text-right tabular-nums">{aud(m.lowAud)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{aud(m.midAud)}</td>
                <td className="py-1 text-right tabular-nums">{aud(m.highAud)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="mt-3 space-y-1 text-xs text-ink-600">
        {block.ask ? (
          <p data-testid="valuation-ask">
            Founder ask: {aud(block.ask.preMoneyAud)} pre-money, raising {aud(block.ask.raiseAud)} — {block.ask.verdict.replace(/_/g, " ")} ({block.ask.gapPct > 0 ? "+" : ""}
            {block.ask.gapPct}%)
          </p>
        ) : (
          <p data-testid="valuation-ask">No founder ask on file.</p>
        )}
        {block.scenarios ? (
          <p>
            Scenarios: bear {aud(block.scenarios.bear)} · base {aud(block.scenarios.base)} · bull {aud(block.scenarios.bull)}
          </p>
        ) : null}
        {block.sectorMultiples ? (
          <p>
            Sector multiples ({block.sectorMultiples.sector}): {block.sectorMultiples.low}× / {block.sectorMultiples.median}× / {block.sectorMultiples.high}× ARR — {block.sectorMultiples.sourceLabel} ({block.sectorMultiples.sourceDate})
          </p>
        ) : null}
        <p data-testid="valuation-comparables">
          AU comparables: {block.comparables.n} raises tracked, {block.comparables.withMultiplesN} with disclosed multiples.
        </p>
        {block.myView ? (
          <p data-testid="valuation-my-view" className="text-ink-800">
            My view: {block.myView.lowAud !== null ? aud(block.myView.lowAud) : "—"} – {block.myView.highAud !== null ? aud(block.myView.highAud) : "—"}
            {block.myView.note ? ` · ${block.myView.note}` : ""}
          </p>
        ) : null}
      </div>
      {fullReportHref ? (
        <p className="mt-3 text-xs">
          <a href={fullReportHref} target="_blank" rel="noopener noreferrer" className="text-action hover:underline">
            Open the valuation chapter in the full Trusted Business Report →
          </a>
        </p>
      ) : null}
    </DossierBlock>
  );
}
