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

/** Level · source · date are table columns from `sm` up and a stacked meta line under the label below it (375 px stays readable without a sideways scroll; print keeps the columns). */
export const STACKED_COL = "hidden sm:table-cell print:table-cell";

/** The register id is an audit key, not reading matter: a uuid shows its first block (the full id sits in the title); any other id prints whole. */
export function shortId(id: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.slice(0, 8) : id;
}

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
              <th scope="col" className={cn("px-2 py-1 font-medium", STACKED_COL)}>{t.th.level}</th>
              <th scope="col" className={cn("px-2 py-1 font-medium", STACKED_COL)}>{t.th.source}</th>
              <th scope="col" className={cn("px-2 py-1 font-medium", STACKED_COL)}>{t.th.date}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={e.id} id={citationAnchorId(e.n)} data-tbr-footnote={e.n} className={cn(zebraRow(i), "scroll-mt-24 target:bg-surface-sunken")}>
                <td className="px-2 py-1 align-top font-semibold tabular-nums text-action">{e.n}</td>
                <td className="px-2 py-1 align-top text-primary">
                  {e.label}
                  <span className="ml-1 hidden font-mono text-[11px] text-muted sm:inline" title={e.id}>
                    {shortId(e.id)}
                  </span>
                  {/* < sm: the three hidden columns stack under the label so the row reads without a sideways scroll. */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted sm:hidden" data-tbr-footnote-meta>
                    <span>{t.level(e)}</span>
                    <span aria-hidden="true">·</span>
                    <Chip kind="source">{t.source(e)}</Chip>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{t.date(e)}</span>
                  </span>
                </td>
                <td className={cn("px-2 py-1 align-top text-secondary", STACKED_COL)}>{t.level(e)}</td>
                <td className={cn("px-2 py-1 align-top", STACKED_COL)}>
                  <Chip kind="source">{t.source(e)}</Chip>
                </td>
                <td className={cn("px-2 py-1 align-top tabular-nums text-muted", STACKED_COL)}>{t.date(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TbrSection>
  );
}
