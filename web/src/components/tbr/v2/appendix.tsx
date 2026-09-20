// Chapter 14 — Appendix: method, evidence register, data principle,
// disclaimer, auditor log, comparables N, sources dated (CDO + auditor).

import { getTbrS43Strings } from "@/lib/i18n/tbr-strings";
import { evidenceRowsView } from "@/lib/report-v2/evidence-view";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { CtaLink } from "./chapter";
import { AgentBadge, Chip, TABLE_CLASS, TABLE_WRAP_CLASS, TBR_V2_SECTION_IDS, THEAD_CLASS, TbrSection, v2Strings, zebraRow, type TbrUiLocale } from "./shared";

export function TbrAppendix({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const a = report.appendix;
  const t = v2Strings(locale).appendix;
  // G19-S43: the register shows every missing input as a linked CTA row.
  const register = evidenceRowsView(a.evidenceRegister, locale);
  const s43 = getTbrS43Strings(locale);
  const s47 = v2Strings(locale).s47;
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.appendix} kicker="14" title={title} purpose={s47.purpose.appendix} pageBreak>
      <div className="flex items-center gap-2 text-xs text-secondary">
        <AgentBadge role="cdo" />
        <span>
          {t.quality(report.quality.score, Math.round(report.quality.groundedShare * 100))}
          {report.quality.degradedSections.length > 0 ? ` · ${t.degraded(report.quality.degradedSections.join(", "))}` : ""}
        </span>
      </div>
      <div className="space-y-3 text-xs text-secondary">
        <div>
          <p className="font-semibold text-primary">{t.method}</p>
          <p className="max-w-prose leading-relaxed">{a.method}</p>
        </div>
        <div>
          <p className="font-semibold text-primary">{t.evidenceRegister}</p>
          {register.length > 0 ? (
            <div className={cn("mt-1", TABLE_WRAP_CLASS)} data-tbr-register>
              <table className={TABLE_CLASS}>
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className="px-2 py-1 font-medium">{s47.th.id}</th>
                    <th className="px-2 py-1 font-medium">{s47.th.label}</th>
                    <th className="px-2 py-1 font-medium">{s47.th.source}</th>
                    <th className="px-2 py-1 font-medium">{s47.th.status}</th>
                    <th className="px-2 py-1 font-medium">{s47.th.dims}</th>
                    <th className="px-2 py-1 font-medium">{s43.thAddIt}</th>
                  </tr>
                </thead>
                <tbody>
                  {register.map((e, i) => (
                    <tr key={e.evidence_id} data-tbr-register-row={e.cta ? "cta" : e.status} className={zebraRow(i)}>
                      <td className="px-2 py-1 font-mono text-xs text-muted">{e.evidence_id}</td>
                      <td className="px-2 py-1">{e.label}</td>
                      <td className="px-2 py-1">
                        <Chip kind="source">{e.source}</Chip>
                      </td>
                      <td className="px-2 py-1">{e.statusLabel}</td>
                      <td className="px-2 py-1 font-mono uppercase">{e.dims.join(", ")}</td>
                      <td className="px-2 py-1">{e.cta ? <CtaLink row={e} locale={locale} /> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{t.noEvidence}</p>
          )}
        </div>
        <div>
          <p className="font-semibold text-primary">{t.dataPrinciple}</p>
          <p>{a.dataPrinciple}</p>
        </div>
        <div>
          <p className="font-semibold text-primary">{t.sources}</p>
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
            <p className="font-semibold text-primary">{t.auditorLog}</p>
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
        <p className="max-w-prose border-t border-line-subtle pt-2 text-xs leading-relaxed">{a.disclaimer}</p>
      </div>
    </TbrSection>
  );
}
