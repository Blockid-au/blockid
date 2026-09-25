import { ArrowUpRight, ChevronDown, CircleHelp, ClipboardList, LockKeyhole, ShieldCheck } from "lucide-react";
import { buildInvestorScreening, investorScreeningStrings, type InvestorScreeningPoint } from "@/lib/report-v2/investor-screening";
import type { ReportV2 } from "@/lib/report-v2/schema";
import type { CitationIndex } from "@/lib/report-v2/citations";
import { CitedText } from "./shared";

const LEVEL_LABELS: Record<string, [string, string]> = {
  self_declared: ["Self-declared", "Tự khai"], public_url: ["Public source", "Nguồn công khai"],
  document_uploaded: ["Uploaded document", "Tài liệu tải lên"], connected_source: ["Connected source", "Nguồn kết nối"],
  transaction_data: ["Transaction data", "Dữ liệu giao dịch"], third_party_verified: ["Third-party verified", "Bên thứ ba xác minh"],
};

export function TbrInvestorScreening({ report, locale = "en", lockCards, citations }: {
  report: ReportV2; locale?: string; lockCards?: boolean; citations: CitationIndex;
}) {
  const vi = locale === "vi", strings = investorScreeningStrings(locale);
  const view = buildInvestorScreening(report, locale, lockCards);
  function points(title: string, items: InvestorScreeningPoint[], empty: string) {
    return <div className="min-w-0 rounded-xl border border-line-subtle bg-surface p-4">
      <h4 className="text-sm font-semibold text-primary">{title}</h4>
      {items.length ? <ol className="mt-3 space-y-3 text-sm leading-relaxed text-secondary">{items.map((point, i) => <li key={`${point.signalKey}-${i}`} className="flex gap-2"><span className="font-mono text-xs text-muted" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><span><CitedText text={point.text} citations={citations} locale={vi ? "vi" : "en"} /></span></li>)}</ol> : <p className="mt-3 text-sm leading-relaxed text-muted">{empty}</p>}
    </div>;
  }
  return <div className="space-y-5 border-t border-line-subtle pt-6" data-tbr-investor-screening>
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-action">{vi ? "Góc nhìn nhà đầu tư" : "Investor lens"}</p><h3 className="mt-1 font-display text-xl font-semibold text-primary">{strings.title}</h3></div>
      <ClipboardList aria-hidden="true" className="h-6 w-6 shrink-0 text-action" />
    </div>
    <p className="max-w-prose text-sm leading-relaxed text-secondary">{vi ? "Sáu ưu tiên để bắt đầu thẩm định. Mở từng mục để đối chiếu tiêu chí, bằng chứng và vai trò phụ trách." : "Six priorities for the first diligence conversation. Expand a priority to inspect its criteria, evidence and recorded assessment roles."}</p>
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
      {view.signals.map((signal, i) => <details key={signal.key} className="group min-w-0 rounded-xl border border-line-subtle bg-surface" data-investor-signal={signal.key} data-state={signal.status} data-detail={signal.detailLocked ? "locked" : "open"}>
        <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
          <span className="mt-1 font-mono text-xs text-muted" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-primary">{signal.label}</span><span className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-secondary">{signal.status === "locked" ? <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}{signal.statusLabel}</span><span className="mt-3 block text-xs font-medium text-action">{vi ? "Xem thêm" : "Read more"}</span></span>
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-action group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-4 border-t border-line-subtle p-4 text-sm leading-relaxed text-secondary">
          <p>{signal.summary}</p>
          {signal.detailLocked ? signal.status !== "locked" && <p className="flex items-center gap-2 text-xs text-muted" data-investor-signal-detail="locked"><LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{strings.locked}</p> : <>
            {signal.criteria.length > 0 && <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{vi ? "Tiêu chí đã lưu" : "Saved criteria"}</h4><ul className="mt-2 space-y-3">{signal.criteria.map(criterion => <li key={criterion.key}><p className="font-medium text-primary">{criterion.title} <span className="font-mono tabular-nums">{criterion.score ?? "—"}</span></p><p className="mt-1"><CitedText text={criterion.finding} citations={citations} locale={vi ? "vi" : "en"} /></p><p className="mt-1 text-xs text-muted">{vi ? "Vai trò ghi nhận" : "Recorded role"}: {criterion.ownerRole.toUpperCase()}</p></li>)}</ul></div>}
            <div className="rounded-lg bg-surface-sunken p-3"><p className="flex items-center gap-2 font-medium text-primary"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{vi ? "Chất lượng đầu vào" : "Input quality"}</p><p className="mt-2 text-xs">{signal.confidence.label}</p>{signal.confidence.levels.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs">{signal.confidence.levels.map(level => <li key={level}>{LEVEL_LABELS[level]?.[vi ? 1 : 0] ?? level}</li>)}</ul>}</div>
            {signal.evidence.length > 0 ? <ul className="space-y-3">{signal.evidence.map(evidence => <li key={evidence.id}><a href={evidence.href} className="inline-flex min-h-11 items-center gap-1 font-medium text-action underline underline-offset-4">{evidence.label}<ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a><p className="break-words text-xs text-muted">{vi ? "Ngày quan sát" : "Observed"}: {evidence.observedAt ?? (vi ? "Chưa ghi nhận" : "Not recorded")}</p></li>)}</ul> : <p className="text-xs text-muted">{vi ? "Chưa đối chiếu được trích dẫn với hồ sơ bằng chứng." : "No citations could be matched to evidence records."}</p>}
          </>}
        </div>
      </details>)}
    </div>
    <div className="grid gap-3 lg:grid-cols-3" data-investor-brief>
      {points(vi ? "Cần làm rõ trước" : "Clarify first", view.gaps, vi ? "Chưa có khoảng trống có dẫn chứng được ghi nhận; không có nghĩa là không có rủi ro." : "No cited gaps recorded; this does not establish an absence of risk.")}
      {points(vi ? "Điểm mạnh có dẫn chứng" : "Cited strengths", view.strengths, vi ? "Chưa đủ bằng chứng được liên kết để nêu bật điểm mạnh." : "Insufficient linked evidence to highlight supported strengths.")}
      {points(vi ? "Câu hỏi cho founder" : "Questions for the founder", view.questions, vi ? "Xem các tiêu chí trong báo cáo đầy đủ." : "Review criteria in the full report.")}
    </div>
    <p className="max-w-prose text-xs leading-relaxed text-muted">{view.scopeNote}</p>
  </div>;
}
