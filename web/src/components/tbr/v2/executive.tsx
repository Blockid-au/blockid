// Chapter 1 — Executive summary: thesis, top-3 strengths / gaps, phase now →
// next gate with blockers, verdict + confidence, mini route map.

import { topBlockers } from "@/lib/growth/phase-gate";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { AgentBadge, AuditStampLine, Bullets, TBR_V2_SECTION_IDS, TbrSection, phaseLabel, v2Strings, type TbrUiLocale } from "./shared";

export function TbrExecutive({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const e = report.executive;
  const p = e.phaseNow;
  const blockers = topBlockers(p, 3);
  const t = v2Strings(locale).executive;
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.executive} kicker="1" title={title}>
      <div className="flex items-center gap-2">
        <AgentBadge role="ceo" />
        <span className="text-[11px] text-ink-500">{t.confidence(Math.round(e.confidence * 100))}</span>
      </div>
      <p className="text-sm leading-relaxed text-ink-800 dark:text-ink-200">{e.thesis}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Bullets title={t.topStrengths} tone="good" items={e.strengths} />
        <Bullets title={t.topGaps} tone="bad" items={e.gaps} />
      </div>
      <div className="rounded-xl border border-ink-200 p-4 dark:border-ink-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300">
          {t.phaseLine(phaseLabel(p.currentPhase, locale), p.nextPhase ? phaseLabel(p.nextPhase, locale) : t.finalPhase, p.completionPct)}
        </p>
        {blockers.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-ink-700 dark:text-ink-300">
            {blockers.map((b) => (
              <li key={`${b.code}-${b.subject}`}>▲ {b.detail}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-ink-600 dark:text-ink-400">{t.noBlockers}</p>
        )}
        {e.visuals.map((v) => (
          <VisualFigure key={v.id} spec={v} caption={null} className="mt-3" />
        ))}
      </div>
      <AuditStampLine audit={e.audit} locale={locale} />
    </TbrSection>
  );
}
