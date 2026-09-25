import { buildCriteriaSummary, criteriaSummaryStrings, CRITERIA_SUMMARY_ID } from "@/lib/report-v2/criteria-summary";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { buildCitationIndex } from "@/lib/report-v2/citations";
import { CitedText, TBR_V2_SECTION_IDS } from "./shared";
import { ChevronDown } from "lucide-react";
import { CriterionAnalysis } from "./criterion-analysis";

/** Inventory of stored findings, never a second score calculation. */
export function TbrCriteriaSummary({ report, locale, lockCards }: { report: ReportV2; locale: string; lockCards?: boolean }) {
  const vi = locale === "vi";
  const strings = criteriaSummaryStrings(locale);
  const citations = buildCitationIndex(report);
  return <section id={CRITERIA_SUMMARY_ID} className="space-y-4 scroll-mt-24" aria-labelledby="tbr-criteria-summary-title">
    <h2 id="tbr-criteria-summary-title" className="text-xl font-semibold">{strings.title}</h2>
    <p className="text-sm text-muted-foreground">{vi ? "Kết quả đã lưu theo từng tiêu chí. Tiêu chí chưa được đánh giá được ghi rõ; không tự quy thành điểm 0." : "Saved findings by criterion. Criteria without an assessment are shown explicitly and are not assigned a zero score."}</p>
    <div className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line-subtle bg-surface">
      {buildCriteriaSummary(report, locale, lockCards).map(row => {
        // Resolve detail only after the shared projection has applied access rules.
        const chapter = row.state === "assessed" ? report.dimensions.find(ch => ch.dim === row.dim) : undefined;
        const criterion = chapter?.criteria.find(c => c.key === row.key);
        return <article key={row.key} data-criterion={row.key} data-state={row.state} className="min-w-0 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-base font-semibold text-primary">{row.title}</h3>
            <p className="shrink-0 text-right"><span className="block font-mono text-xl font-semibold tabular-nums text-primary">{row.score ?? "—"}</span><span className="text-xs text-muted">{strings.score}</span></p>
          </div>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-secondary"><CitedText text={row.finding} citations={citations} locale={vi ? "vi" : "en"} /></p>
          <p className="mt-2 text-xs text-muted">{strings.evidence}: {row.evidenceCount ?? "—"}</p>
          {criterion && chapter && <details className="group mt-3 rounded-lg border border-line-subtle" data-criterion-readmore={row.key}>
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm font-medium text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
              {vi ? "Xem thêm · Vì sao có điểm này?" : "Read more · Why this score?"}
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
            </summary>
            <div className="space-y-4 border-t border-line-subtle p-4 text-sm leading-relaxed text-secondary">
              <p>{vi ? "Vai trò phụ trách trong hồ sơ" : "Recorded assessment role"}: <strong className="text-primary">{criterion.agent.toUpperCase()}</strong> · {vi ? "Ngày báo cáo" : "Report date"}: {report.generatedAt.slice(0, 10)}</p>
              <p>{vi ? "Đây là điểm tiêu chí đã lưu. Bảng tính của chiều đánh giá và điểm SVI được trình bày riêng; không suy ra công thức tiêu chí khi hồ sơ không lưu công thức." : "This is the saved criterion score. The dimension and SVI ledgers are separate; a criterion formula is not inferred when the report did not record one."}</p>
              <p>{report.source === "pipeline"
                ? (vi ? "Nhận định từ pipeline AI; vai trò agent không chứng minh chuyên gia con người đã phê duyệt." : "An AI pipeline assessment; an agent role does not establish human professional approval.")
                : (vi ? "Bản mẫu hoặc bản dựng từ snapshot; không xác nhận agent đã chạy cho bản hiển thị này." : "A fixture or snapshot-derived report; this view does not establish that an agent ran for this rendering.")}</p>
              {criterion.strengths.length > 0 && <div><h4 className="font-semibold text-primary">{vi ? "Điểm mạnh đã ghi nhận" : "Recorded strengths"}</h4><ul className="mt-2 list-disc space-y-1 pl-5">{criterion.strengths.map((s, i) => <li key={i}><CitedText text={s} citations={citations} locale={vi ? "vi" : "en"} /></li>)}</ul></div>}
              {criterion.gaps.length > 0 && <div><h4 className="font-semibold text-primary">{vi ? "Khoảng trống cần thẩm định" : "Diligence gaps"}</h4><ul className="mt-2 list-disc space-y-1 pl-5">{criterion.gaps.map((s, i) => <li key={i}><CitedText text={s} citations={citations} locale={vi ? "vi" : "en"} /></li>)}</ul></div>}
              {criterion.nextAction && <p><strong className="text-primary">{vi ? "Bước tiếp theo: " : "Next step: "}</strong><CitedText text={criterion.nextAction} citations={citations} locale={vi ? "vi" : "en"} /></p>}
              <CriterionAnalysis detail={criterion.detailedAnalysis} vi={vi} />
              <div><h4 className="font-semibold text-primary">{vi ? "Trích dẫn đã lưu" : "Saved citations"}</h4>
                {criterion.citations.length ? <ul className="mt-2 space-y-3">{criterion.citations.map((citation, i) => <li key={i} className="border-l-2 border-line-subtle pl-3"><p className="break-words text-xs text-muted">{citation.evidence_id}</p><blockquote className="mt-1 whitespace-pre-wrap">{citation.quote}</blockquote></li>)}</ul> : <p className="mt-2">{vi ? "Chưa có trích dẫn được lưu cho tiêu chí này." : "No citations were saved for this criterion."}</p>}
                <p className="mt-2 text-xs text-muted">{vi ? "Trích dẫn không đồng nghĩa với kiểm chứng độc lập hoặc xác suất thành công." : "Citations are not independent verification or a probability of investment success."}</p>
              </div>
              <a className="inline-flex min-h-11 items-center font-medium text-action underline underline-offset-4" href={`#${TBR_V2_SECTION_IDS.dim(chapter.dim)}`}>{vi ? "Mở phân tích và bảng tính của chiều đánh giá" : "Open dimension analysis and score ledger"}</a>
            </div>
          </details>}
        </article>;
      })}
    </div>
  </section>;
}
