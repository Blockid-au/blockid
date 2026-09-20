// Chapter 14 — Appendix: method, evidence register, data principle,
// disclaimer, auditor log, comparables N, sources dated (CDO + auditor).

import { getTbrS43Strings } from "@/lib/i18n/tbr-strings";
import { evidenceRowsView } from "@/lib/report-v2/evidence-view";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { CtaLink } from "./chapter";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection, v2Strings, type TbrUiLocale } from "./shared";

export function TbrAppendix({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const a = report.appendix;
  const t = v2Strings(locale).appendix;
  // G19-S43: the register shows every missing input as a linked CTA row.
  const register = evidenceRowsView(a.evidenceRegister, locale);
  const s43 = getTbrS43Strings(locale);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.appendix} kicker="14" title={title} pageBreak>
      <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
        <AgentBadge role="cdo" />
        <span>
          {t.quality(report.quality.score, Math.round(report.quality.groundedShare * 100))}
          {report.quality.degradedSections.length > 0 ? ` · ${t.degraded(report.quality.degradedSections.join(", "))}` : ""}
        </span>
      </div>
      <div className="space-y-3 text-xs text-ink-600 dark:text-ink-400">
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">{t.method}</p>
          <p>{a.method}</p>
        </div>
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">{t.evidenceRegister}</p>
          {register.length > 0 ? (
            <table className="mt-1 w-full">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-ink-400">
                  <th className="py-1 pr-2 font-medium">Id</th>
                  <th className="py-1 pr-2 font-medium">Label</th>
                  <th className="py-1 pr-2 font-medium">Source</th>
                  <th className="py-1 pr-2 font-medium">Status</th>
                  <th className="py-1 pr-2 font-medium">Dims</th>
                  <th className="py-1 font-medium">{s43.thAddIt}</th>
                </tr>
              </thead>
              <tbody>
                {register.map((e) => (
                  <tr key={e.evidence_id} data-tbr-register-row={e.cta ? "cta" : e.status} className="border-t border-ink-100 dark:border-ink-800/60">
                    <td className="py-1 pr-2 font-mono text-[10px] text-ink-400">{e.evidence_id}</td>
                    <td className="py-1 pr-2">{e.label}</td>
                    <td className="py-1 pr-2">{e.source}</td>
                    <td className="py-1 pr-2">{e.statusLabel}</td>
                    <td className="py-1 pr-2">{e.dims.join(", ")}</td>
                    <td className="py-1">{e.cta ? <CtaLink row={e} locale={locale} /> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{t.noEvidence}</p>
          )}
        </div>
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">{t.dataPrinciple}</p>
          <p>{a.dataPrinciple}</p>
        </div>
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">{t.sources}</p>
          <ul className="list-disc pl-4">
            {a.sourcesDated.map((s) => (
              <li key={s.label}>
                {s.label} — {s.date}
              </li>
            ))}
            <li>{t.comparables(a.comparablesN, a.comparablesWithMultiplesN)}</li>
          </ul>
        </div>
        {a.auditLog.length > 0 && (
          <div>
            <p className="font-semibold text-ink-800 dark:text-ink-100">{t.auditorLog}</p>
            <ul className="list-disc pl-4">
              {a.auditLog.map((l) => (
                <li key={l.sectionId}>
                  {l.sectionId}: {l.grounded ? t.grounded : t.uncited(l.uncitedClaims.length)}
                  {l.revised ? `, ${t.revised}` : ""}
                  {l.skipped ? ` (${t.skipped(l.skipped)})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="border-t border-ink-200 pt-2 text-[11px] dark:border-ink-800">{a.disclaimer}</p>
      </div>
    </TbrSection>
  );
}
