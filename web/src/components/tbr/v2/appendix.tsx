// Chapter 14 — Appendix: method, evidence register, data principle,
// disclaimer, auditor log, comparables N, sources dated (CDO + auditor).

import type { ReportV2 } from "@/lib/report-v2/schema";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection } from "./shared";

export function TbrAppendix({ report, title }: { report: ReportV2; title: string }) {
  const a = report.appendix;
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.appendix} kicker="14" title={title}>
      <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
        <AgentBadge role="cdo" />
        <span>
          quality {report.quality.score}/100 · grounded {Math.round(report.quality.groundedShare * 100)}%
          {report.quality.degradedSections.length > 0 ? ` · degraded: ${report.quality.degradedSections.join(", ")}` : ""}
        </span>
      </div>
      <div className="space-y-3 text-xs text-ink-600 dark:text-ink-400">
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">Method</p>
          <p>{a.method}</p>
        </div>
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">Evidence register</p>
          {a.evidenceRegister.length > 0 ? (
            <table className="mt-1 w-full">
              <tbody>
                {a.evidenceRegister.map((e) => (
                  <tr key={e.evidence_id} className="border-t border-ink-100 dark:border-ink-800/60">
                    <td className="py-1 pr-2 font-mono text-[10px] text-ink-400">{e.evidence_id}</td>
                    <td className="py-1 pr-2">{e.label}</td>
                    <td className="py-1 pr-2">{e.source}</td>
                    <td className="py-1 pr-2">{e.status}</td>
                    <td className="py-1">{e.dims.map((d) => d.toUpperCase()).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No evidence rows are attached to this document. Connect Stripe, Xero, GA4 or GitHub, or upload documents, to populate the register.</p>
          )}
        </div>
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">Data principle</p>
          <p>{a.dataPrinciple}</p>
        </div>
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">Sources</p>
          <ul className="list-disc pl-4">
            {a.sourcesDated.map((s) => (
              <li key={s.label}>
                {s.label} — {s.date}
              </li>
            ))}
            <li>
              AU comparables: {a.comparablesN} raises tracked, {a.comparablesWithMultiplesN} with disclosed multiples.
            </li>
          </ul>
        </div>
        {a.auditLog.length > 0 && (
          <div>
            <p className="font-semibold text-ink-800 dark:text-ink-100">Auditor log</p>
            <ul className="list-disc pl-4">
              {a.auditLog.map((l) => (
                <li key={l.sectionId}>
                  {l.sectionId}: {l.grounded ? "grounded" : `${l.uncitedClaims.length} uncited`}
                  {l.revised ? ", revised" : ""}
                  {l.skipped ? ` (skipped: ${l.skipped})` : ""}
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
