// Chapter 15 — "Evidence cited" (G24-A): the footnote list every `[ev:<id>]`
// superscript in the report links to. One row per cited evidence-register
// row, in first-appearance order: n · label · evidence level · source kind ·
// date. Omitted entirely when nothing in the document is cited. Hook-free;
// EN / VI copy from `lib/i18n/messages` via `citation-strings.ts`.

import { citationAnchorId, citationEntries, type CitationIndex } from "@/lib/report-v2/citations";
import { citationStrings } from "@/lib/report-v2/citation-strings";
import { cn } from "@/lib/utils";
import { Chip, TABLE_CLASS, TABLE_WRAP_CLASS, TBR_V2_SECTION_IDS, THEAD_CLASS, TbrSection, zebraRow, type TbrUiLocale } from "./shared";

export const TBR_EVIDENCE_CITED_TESTID = "tbr-evidence-cited";

export function TbrEvidenceCited({ citations, locale = "en", kicker = "15" }: { citations: CitationIndex; locale?: TbrUiLocale; kicker?: string }) {
  const rows = citationEntries(citations);
  if (rows.length === 0) return null;
  const t = citationStrings(locale);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.evidenceCited} kicker={kicker} title={t.appendixTitle} purpose={t.appendixPurpose} pageBreak>
      <div className={cn(TABLE_WRAP_CLASS)} data-testid={TBR_EVIDENCE_CITED_TESTID}>
        <table className={TABLE_CLASS}>
          <thead className={THEAD_CLASS}>
            <tr>
              <th scope="col" className="px-2 py-1 font-medium">{t.th.n}</th>
              <th scope="col" className="px-2 py-1 font-medium">{t.th.label}</th>
              <th scope="col" className="px-2 py-1 font-medium">{t.th.level}</th>
              <th scope="col" className="px-2 py-1 font-medium">{t.th.source}</th>
              <th scope="col" className="px-2 py-1 font-medium">{t.th.date}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={e.id} id={citationAnchorId(e.n)} data-tbr-footnote={e.n} className={cn(zebraRow(i), "scroll-mt-24 target:bg-surface-sunken")}>
                <td className="px-2 py-1 font-semibold tabular-nums text-action">{e.n}</td>
                <td className="px-2 py-1 text-primary">
                  {e.label}
                  <span className="ml-1 font-mono text-[11px] text-muted">{e.id}</span>
                </td>
                <td className="px-2 py-1 text-secondary">{t.level(e)}</td>
                <td className="px-2 py-1">
                  <Chip kind="source">{t.source(e)}</Chip>
                </td>
                <td className="px-2 py-1 tabular-nums text-muted">{t.date(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TbrSection>
  );
}
