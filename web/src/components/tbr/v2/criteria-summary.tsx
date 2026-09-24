import { buildCriteriaSummary, criteriaSummaryStrings, CRITERIA_SUMMARY_ID } from "@/lib/report-v2/criteria-summary";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { buildCitationIndex } from "@/lib/report-v2/citations";
import { CitedText, TBR_V2_SECTION_IDS } from "./shared";

/** Inventory of stored findings, never a second score calculation. */
export function TbrCriteriaSummary({ report, locale, lockCards }: { report: ReportV2; locale: string; lockCards?: boolean }) {
  const vi = locale === "vi";
  const strings = criteriaSummaryStrings(locale);
  const citations = buildCitationIndex(report);
  return <section id={CRITERIA_SUMMARY_ID} className="space-y-4 scroll-mt-24" aria-labelledby="tbr-criteria-summary-title">
    <h2 id="tbr-criteria-summary-title" className="text-xl font-semibold">{strings.title}</h2>
    <p className="text-sm text-muted-foreground">{vi ? "Kết quả đã lưu theo từng tiêu chí. Tiêu chí chưa được đánh giá được ghi rõ; không tự quy thành điểm 0." : "Saved findings by criterion. Criteria without an assessment are shown explicitly and are not assigned a zero score."}</p>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="p-3">{vi ? "Tiêu chí" : "Criterion"}</th><th className="p-3">{strings.score}</th><th className="p-3">{vi ? "Kết quả" : "Finding"}</th><th className="p-3">{vi ? "Bằng chứng liên kết" : "Linked evidence"}</th></tr></thead>
        <tbody>{buildCriteriaSummary(report, locale, lockCards).map(row => <tr key={row.key} data-criterion={row.key} data-state={row.state} className="border-b last:border-0 align-top">
          <th scope="row" className="p-3 font-medium">{row.dim ? <a href={`#${TBR_V2_SECTION_IDS.dim(row.dim)}`} className="underline underline-offset-4">{row.title}</a> : row.title}</th>
          <td className="p-3">{row.score ?? "—"}</td>
          <td className="p-3"><CitedText text={row.finding} citations={citations} locale={vi ? "vi" : "en"} /></td>
          <td className="p-3">{row.evidenceCount ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
