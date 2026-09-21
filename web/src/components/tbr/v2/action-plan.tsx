// Chapter 13 — 90-day action plan: 3 × 30-day columns, owner agent per step
// (COO). Free tier shows 5 steps.

import { getTbrS43Strings } from "@/lib/i18n/tbr-strings";
import { VisualFigure } from "@/lib/report-visuals/react";
import { planEvidenceRows } from "@/lib/report-v2/evidence-view";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { CtaLink } from "./chapter";
import { AgentBadge, Chip, CitedText, DimChip, TBR_V2_SECTION_IDS, TbrSection, v2Strings, type TbrUiLocale } from "./shared";
import type { CitationIndex } from "@/lib/report-v2/citations";

export function TbrActionPlan({ report, title, locale = "en", citations }: { report: ReportV2; title: string; locale?: TbrUiLocale; /** G24-A: footnote numbering (report.tsx). */ citations?: CitationIndex }) {
  const p = report.actionPlan;
  const t = v2Strings(locale).actionPlan;
  const steps = report.tier === "free" ? p.steps.slice(0, 5) : p.steps;
  const cols: Array<30 | 60 | 90> = [30, 60, 90];
  // G19-S43: the engine's P0 / P1 evidence gaps as linked CTA rows + catalogue source labels.
  const evidence = planEvidenceRows(report, locale);
  const s43 = getTbrS43Strings(locale);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.actionPlan} kicker="13" title={title} purpose={v2Strings(locale).s47.purpose.actionPlan}>
      <div className="flex items-center gap-2 text-xs text-secondary">
        <AgentBadge role="coo" />
        <span>{t.steps(steps.length, p.horizonDays)}</span>
      </div>
      {steps.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {cols.map((day) => (
            <div key={day} className="rounded-xl border border-line-subtle p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t.dayRange(day - 30, day)}</p>
              <ul className="mt-2 space-y-2 text-xs">
                {steps
                  .filter((s) => s.day === day)
                  .map((s, i) => (
                    <li key={`${s.dimension}-${i}`} className="space-y-0.5">
                      <p className="font-medium text-primary">
                        <CitedText text={s.title} citations={citations} locale={locale} />
                      </p>
                      <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                        <AgentBadge role={s.ownerAgent} kind="support" />
                        <DimChip dim={s.dimension} locale={locale} />
                        <Chip kind="lift">{t.lift(s.expectedLift)}</Chip>
                        {s.evidenceToAdd ? <Chip kind="source">{s43.source[s.evidenceToAdd] ?? s.evidenceToAdd}</Chip> : null}
                      </p>
                    </li>
                  ))}
                {steps.every((s) => s.day !== day) && <li className="text-muted">—</li>}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-secondary">{t.empty}</p>
      )}
      {evidence.rows.length > 0 && (
        <div data-tbr-plan-evidence className="rounded-xl border border-line-subtle p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{evidence.title}</p>
          <ul className="mt-2 space-y-1 text-xs">
            {evidence.rows.map((r) => (
              <li key={r.evidence_id}>
                <CtaLink row={r} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.visuals.map((v) => (
        <VisualFigure key={v.id} spec={v} caption={v.title} className="rounded-xl border border-line-subtle p-3" />
      ))}
    </TbrSection>
  );
}
