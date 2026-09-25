import { ChevronDown } from "lucide-react";
import type { ReportV2 } from "@/lib/report-v2/schema";

/** Reading guide: describes the saved document, never reconstructs missing provenance. */
export function TbrNumberNotes({ report, locale = "en" }: { report: ReportV2; locale?: string }) {
  const vi = locale === "vi";
  const notes = vi ? [
    ["Điểm SVI", "Chỉ số theo phương pháp BlockID được lưu trong báo cáo. Không phải số tiền, xác suất thành công hay điểm chuẩn quốc tế. Xem bảng tính và phiên bản phương pháp trước khi so sánh hai báo cáo."],
    ["Độ tin cậy bằng chứng", "Phản ánh chất lượng đầu vào theo phương pháp của báo cáo. Khác với điểm kinh doanh; không phải xác suất nhà đầu tư có lợi nhuận."],
    ["Định giá", "Khoảng giá trị phụ thuộc đầu vào, phương pháp và giả định đã lưu. Mở phần Định giá để xem trọng số và cách tính; không suy ra định giá từ điểm SVI. Khi thiếu đầu vào, giá trị phải được ghi là chưa xác định."],
    ["Đóng góp AI", "Agent phân tích thông tin trong phạm vi vai trò được lưu. Điểm đề xuất, điều chỉnh, trích dẫn và bảng tính được xem trong từng chiều đánh giá. Không gán tên model, bước kiểm chứng hoặc phê duyệt chưa được lưu."],
  ] : [
    ["SVI index", "The saved BlockID methodology index. It is not money, a success probability or an international standard score. Check the ledger and methodology version before comparing reports."],
    ["Evidence confidence", "Describes input quality under the report methodology. It is distinct from business performance and is not the probability of an investor return."],
    ["Valuation", "The range depends on saved inputs, methods and assumptions. Open Valuation for weights and derivations; value is not inferred from SVI. Missing inputs must remain explicitly unavailable."],
    ["AI contribution", "Agents analyse information within their recorded roles. Inspect proposed scores, adjustments, citations and ledgers in each dimension. Model identity, verification and approval are not inferred when they were not saved."],
  ];
  return <details className="group rounded-xl border border-line-subtle bg-surface" data-tbr-number-notes>
    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
      {vi ? "Xem thêm · Các con số này có ý nghĩa gì?" : "Read more · What do these numbers mean?"}
      <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="space-y-4 border-t border-line-subtle p-4 sm:p-5">
      <dl className="grid gap-5 md:grid-cols-2">{notes.map(([title, body]) => <div key={title} className="max-w-prose"><dt className="text-sm font-semibold text-primary">{title}</dt><dd className="mt-1 text-sm leading-relaxed text-secondary">{body}</dd></div>)}</dl>
      <p className="break-words border-t border-line-subtle pt-4 text-xs leading-relaxed text-muted">
        {vi ? "Phiên bản báo cáo" : "Report schema"}: {report.schemaVersion} · Pipeline: {report.pipelineVersion} · {vi ? "Dữ liệu tại thời điểm tạo báo cáo" : "Report snapshot date"}: {report.generatedAt}
      </p>
      <a href="#tbr-appendix" className="inline-flex min-h-11 items-center text-sm font-medium text-action underline underline-offset-4">{vi ? "Xem phương pháp, bằng chứng và nhật ký kiểm tra" : "Review methodology, evidence and audit records"}</a>
    </div>
  </details>;
}
