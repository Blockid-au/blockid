// Chapter 10 — Valuation: methods, consensus band, ask, sector multiples
// (source + date), AU comparables N. Free tier shows the range only.

import { aud } from "@/lib/report-visuals";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { AgentBadge, AuditStampLine, TBR_V2_SECTION_IDS, TbrSection, stateLabel } from "./shared";

const METHOD_LABEL: Record<string, string> = {
  revenue_multiple: "Revenue multiple",
  berkus: "Berkus",
  dcf_proxy: "DCF proxy",
  comparables: "AU comparables",
  risk_factor_summation: "Risk-factor summation",
  scorecard: "Scorecard (reference)",
};

export function TbrValuation({ report, title }: { report: ReportV2; title: string }) {
  const v = report.valuation;
  const free = report.tier === "free";
  const rangeBars = v.visuals.find((x) => x.kind === "range_bars");
  const others = v.visuals.filter((x) => x !== rangeBars);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.valuation} kicker="10" title={title}>
      <div className="flex items-center gap-2">
        <AgentBadge role="cfo" />
        <span className="text-[11px] text-ink-500">consensus confidence {Math.round(v.consensus.confidence * 100)}%</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["lowAud", "midAud", "highAud"] as const).map((k) => (
          <div key={k} className={cn("rounded-xl border p-4", k === "midAud" ? "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30" : "border-ink-200 dark:border-ink-800")}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-400">{k === "lowAud" ? "Low" : k === "midAud" ? "Consensus" : "High"}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900 dark:text-ink-100">{aud(v.consensus[k])}</p>
          </div>
        ))}
      </div>
      {rangeBars && <VisualFigure spec={rangeBars} caption={`${rangeBars.title} · ${stateLabel(rangeBars.dataState)}`} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800" />}
      {!free && (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-700">
                <th className="py-1 pr-2">Method</th>
                <th className="py-1 pr-2 text-right">Low</th>
                <th className="py-1 pr-2 text-right">Mid</th>
                <th className="py-1 pr-2 text-right">High</th>
                <th className="py-1 pr-2 text-right">Weight</th>
                <th className="py-1">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {v.methods.map((m) => (
                <tr key={m.method} className={cn("border-b border-ink-100 dark:border-ink-800/60", !m.applicable && "text-ink-400")}>
                  <td className="py-1 pr-2 font-medium">{METHOD_LABEL[m.method] ?? m.method}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m.applicable ? aud(m.lowAud) : "n/a"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m.applicable ? aud(m.midAud) : "n/a"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m.applicable ? aud(m.highAud) : "n/a"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{Math.round(m.weight * 100)}%</td>
                  <td className="py-1 text-ink-600 dark:text-ink-400">{m.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-200 p-3 text-xs dark:border-ink-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Scenarios</p>
              <p className="mt-1 tabular-nums text-ink-700 dark:text-ink-200">
                Bear {aud(v.scenarios.bear)} · Base {aud(v.scenarios.base)} · Bull {aud(v.scenarios.bull)}
              </p>
              {v.ask && (
                <p className="mt-1 text-ink-700 dark:text-ink-200">
                  Ask: {aud(v.ask.preMoneyAud)} pre-money, raising {aud(v.ask.raiseAud)} — {v.ask.verdict.replace(/_/g, " ")} ({v.ask.gapPct > 0 ? "+" : ""}
                  {v.ask.gapPct}%)
                </p>
              )}
            </div>
            <div className="rounded-lg border border-ink-200 p-3 text-xs dark:border-ink-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Sector multiples · {v.sectorMultiples.sector}</p>
              <p className="mt-1 tabular-nums text-ink-700 dark:text-ink-200">
                {v.sectorMultiples.low}× / {v.sectorMultiples.median}× / {v.sectorMultiples.high}× ARR — {v.sectorMultiples.sourceLabel} ({v.sectorMultiples.sourceDate})
              </p>
              <p className="mt-1 text-ink-600 dark:text-ink-400">
                AU comparables: {v.comparables.n} raises tracked, {v.comparables.withMultiplesN} with disclosed multiples (sources dated {v.sectorMultiples.sourceDate}).
              </p>
            </div>
          </div>
          {others.map((x) => (
            <VisualFigure key={x.id} spec={x} caption={`${x.title} · ${stateLabel(x.dataState)}`} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800" />
          ))}
        </>
      )}
      <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-400">{v.narrative}</p>
      <AuditStampLine audit={v.audit} />
    </TbrSection>
  );
}
