"use client";

import { ArrowUp, ChevronDown } from "lucide-react";

import type {
  BusinessFinding,
  FindingsLocale,
} from "@/lib/report-v2/business-findings";

export function BusinessFindings({
  findings,
  locale = "en",
}: {
  findings: BusinessFinding[];
  locale?: FindingsLocale;
}) {
  const vi = locale === "vi";
  const qualityLabels = vi
    ? { incomplete: "Chưa đầy đủ", basic: "Cơ bản", good: "Tốt", strong: "Vững", exceptional: "Nổi bật" }
    : { incomplete: "Incomplete", basic: "Basic", good: "Good", strong: "Strong", exceptional: "Exceptional" };
  const copy = vi
    ? {
        heading: "Nội dung đã xem xét",
        openDetail: "Xem phân tích và bằng chứng",
        backArea: "Quay lại tổng quan mục này",
        backOverview: "Quay lại nội dung đã xem xét",
        sourceDetail: "Mở nội dung nguồn đã lưu",
        intro:
          "Mở từng mục để xem nhận định, giới hạn và thông tin cần bổ sung. Xem nội dung hiện có không tốn credit.",
        final: "Nội dung báo cáo",
        limited: "Phân tích hạn chế",
        preliminary: "Xem trước — chưa kết luận",
        assessment: "Nhận định và điểm hỗ trợ",
        why: "Ý nghĩa khi thẩm định",
        gaps: "Điều chưa rõ",
        next: "Thông tin cần bổ sung",
        sources: "Nguồn hiện có",
        noSources:
          "Phần này chưa có nguồn được ghi nhận. Không suy ra nội dung đã được kiểm chứng.",
        criteria: "Phân tích từng tiêu chí",
        empty: "Chưa có nhận định được ghi nhận.",
        unsupported: "Cơ sở nhận định chưa được xác nhận đầy đủ.",
        citation: "Trích dẫn trong báo cáo — cần đối chiếu nguồn",
        unresolved: "Chưa có nguồn tương ứng trong mục này",
        quality: "Mức chất lượng ghi nhận",
        guidance: "Ý nghĩa với nhà đầu tư — hướng dẫn thẩm định",
        question: "Câu hỏi kiểm chứng cụ thể",
        limits: "Giới hạn của tiêu chí này",
        research: "Phạm vi nghiên cứu đã ghi nhận",
        businessImplication: "Chưa có nhận định riêng về tác động của tiêu chí này đối với quyết định đầu tư vào doanh nghiệp.",
        comparisonLimit: "Việc đọc nguồn chưa xác nhận tính phù hợp của đối thủ hay hoàn tất so sánh thị trường.",
        sourceRecord: "Nội dung nguồn đã lưu — cần đối chiếu trích dẫn",
        conflict: "Điểm cần lưu ý trước khi kết luận",
      }
    : {
        heading: "What we looked at",
        openDetail: "Explore analysis and evidence",
        backArea: "Back to this area overview",
        backOverview: "Back to what we looked at",
        sourceDetail: "Open stored source content",
        intro:
          "Open an area for its assessment, limitations and next evidence request. Viewing existing detail uses no credits.",
        final: "Report content",
        limited: "Limited assessment",
        preliminary: "Preview — not a conclusion",
        assessment: "Assessment and supporting points",
        why: "Why this matters in diligence",
        gaps: "What remains uncertain",
        next: "What to provide next",
        sources: "Available sources",
        noSources:
          "No sources are recorded for this section. This does not establish that its claims have been verified.",
        criteria: "Individual criteria",
        empty: "No assessment recorded yet.",
        unsupported:
          "Support for this assessment has not been fully confirmed.",
        citation: "Report citation — check against its source",
        unresolved: "No matching source recorded in this section",
        quality: "Recorded quality level",
        guidance: "Investor relevance — diligence guidance",
        question: "Specific diligence question",
        limits: "Limits of this criterion",
        research: "Recorded research coverage",
        businessImplication: "A business-specific implication for the investment decision has not been recorded for this criterion.",
        comparisonLimit: "Reading sources does not establish competitor relevance or a completed market comparison.",
        sourceRecord: "Stored source content — compare with the quote",
        conflict: "Consider before drawing a conclusion",
      };
  return (
    <section
      aria-labelledby="analyze-findings-heading"
      className="rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-6"
      data-testid="analyze-findings"
    >
      <h3
        id="analyze-findings-heading"
        tabIndex={-1}
        className="text-base font-semibold text-primary"
      >
        {copy.heading}{" "}
        <span className="text-sm font-normal text-secondary">
          ({findings.length})
        </span>
      </h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-secondary">
        {copy.intro}
      </p>
      <div className="mt-4 divide-y divide-line-subtle">
        {findings.map((finding) => (
          <div key={finding.id}>
            {(finding.criticalIssues.length > 0 || finding.auditLimit) && (
              <div
                className="my-2 rounded-lg border border-line-subtle bg-surface-sunken p-3 text-sm text-primary"
                role="note"
              >
                <p className="font-semibold">
                  {finding.title}: {copy.conflict}
                </p>
                {finding.criticalIssues.map((issue, i) => (
                  <p className="mt-1" key={i}>
                    {issue}
                  </p>
                ))}
                {finding.auditLimit && (
                  <p className="mt-1">{finding.auditLimit}</p>
                )}
              </div>
            )}
            <details
              key={finding.id}
              id={`finding-${finding.id}`}
              className="group py-2"
              data-finding-state={finding.state}
              data-report-id={finding.reportId}
              data-snapshot-id={finding.snapshotId}
            >
              <summary id={`finding-${finding.id}-summary`} className="min-h-11 cursor-pointer rounded-lg p-2 text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
                <span className="font-semibold">{finding.title}</span>
                <span className="ml-2 inline-block rounded bg-surface-hover px-2 py-1 text-xs text-secondary">
                  {copy[finding.state]}
                </span>
                <span className="mt-2 block max-w-prose text-sm leading-relaxed text-secondary">
                  {finding.summary}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-action">{copy.openDetail}<ChevronDown className="h-4 w-4" aria-hidden="true" /></span>
              </summary>
              <div className="space-y-5 px-2 pb-4 pt-3 text-base leading-relaxed text-secondary [overflow-wrap:anywhere]">
                <FindingList
                  title={copy.assessment}
                  items={finding.assessment}
                />
                <div>
                  <h4 className="font-semibold text-primary">{copy.why}</h4>
                  <p className="mt-1 max-w-prose">{finding.implication}</p>
                </div>
                <FindingList title={copy.gaps} items={finding.uncertainty} />
                <FindingList title={copy.next} items={finding.requests} />
                {finding.criteria.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-primary">
                      {copy.criteria}
                    </h4>
                    {finding.criteria.map((criterion) => (
                      <details
                        key={criterion.id}
                        className="mt-3 rounded-xl border border-line-subtle bg-surface p-4"
                        data-criterion-id={criterion.id}
                      >
                        <summary className="min-h-11 cursor-pointer rounded font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
                          {criterion.title}
                          {criterion.conflicts.length > 0 && <span className="ml-2 text-sm text-warn">{copy.conflict}</span>}
                          <span className="mt-2 block text-sm font-normal leading-relaxed text-secondary" data-criterion-preview>{criterion.verdict || copy.empty}</span>
                          {!criterion.grounded && <span className="mt-2 block text-sm font-normal text-secondary">{copy.unsupported}</span>}
                        </summary>
                        <FindingList title={copy.conflict} items={criterion.conflicts} />
                        {criterion.researchCoverage && <div className="mt-3 rounded-lg bg-surface-sunken p-3 text-sm" data-criterion-research={criterion.researchCoverage.status}>
                          <h5 className="font-semibold text-primary">{copy.research}</h5>
                          <p className="mt-1">{(vi ? {
                            not_recorded: "Chưa có hồ sơ nghiên cứu bên ngoài cho tiêu chí này.",
                            not_run: "Chưa thực hiện đọc nguồn bên ngoài cho tiêu chí này.",
                            blocked: "Việc đọc nguồn bên ngoài bị chặn.",
                            not_found: "Chưa lấy được nguồn bên ngoài từ lần thử đã ghi nhận.",
                            sources_retrieved: `Đã lưu ${criterion.researchCoverage.retrievedSourceIds.length} nguồn được đọc; chưa phải kết luận đã kiểm chứng.`,
                          } : {
                            not_recorded: "No external research record is available for this criterion.",
                            not_run: "External source retrieval has not run for this criterion.",
                            blocked: "External source retrieval was blocked.",
                            not_found: "No external source was retrieved in the recorded attempt.",
                            sources_retrieved: `${criterion.researchCoverage.retrievedSourceIds.length} retrieved source records are available; these are not verified conclusions.`,
                          })[criterion.researchCoverage.status]}</p>
                          {criterion.researchCoverage.question && <p className="mt-2">{copy.question}: {criterion.researchCoverage.question}</p>}
                          {criterion.researchCoverage.status === "sources_retrieved" && <p className="mt-2">{copy.comparisonLimit}</p>}
                          <p className="mt-2">{copy.businessImplication}</p>
                        </div>}
                        <div className="mt-3">
                          <h5 className="font-semibold text-primary">{copy.guidance}</h5>
                          <p className="mt-1 max-w-prose">{criterion.implication}</p>
                        </div>
                        <FindingList title={copy.limits} items={criterion.limitations} />
                        <p className="mt-1 text-sm">
                          {copy.quality}: {qualityLabels[criterion.quality]}
                        </p>
                        {!criterion.grounded && (
                          <p className="mt-1 text-sm">{copy.unsupported}</p>
                        )}
                        {criterion.citations.map((citation, i) => (
                          <div
                            key={`${citation.id}-${i}`}
                            className="mt-2 rounded border border-line-subtle p-2 text-sm"
                          >
                            <p>
                              {copy.citation}: [{citation.id}]
                            </p>
                            <p className="mt-1">{citation.quote}</p>
                            {citation.sourceLabel && <p className="mt-2 font-medium">{citation.sourceLabel}</p>}
                            {citation.observedAt && <p className="mt-1">{citation.observedAt}</p>}
                            {citation.sourceDetail && <details className="mt-2 rounded-lg bg-surface-sunken p-3" data-source-disclosure>
                              <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">{copy.sourceDetail}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></summary>
                              <p className="mt-2 font-medium">{copy.sourceRecord}</p>
                              <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-line-subtle pl-3">{citation.sourceDetail}</blockquote>
                            </details>}
                            {!citation.sourceRecorded && (
                              <p className="mt-1">{copy.unresolved}</p>
                            )}
                          </div>
                        ))}
                        <FindingList
                          title={copy.assessment}
                          items={criterion.strengths}
                        />
                        <FindingList title={copy.gaps} items={criterion.gaps} />
                        <FindingList
                          title={copy.next}
                          items={criterion.request ? [criterion.request] : []}
                        />
                        <FindingList title={copy.question} items={[criterion.diligenceQuestion]} />
                        <a href={`#finding-${finding.id}-summary`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded text-sm font-medium text-action underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"><ArrowUp className="h-4 w-4" aria-hidden="true" />{copy.backArea}</a>
                      </details>
                    ))}
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-primary">{copy.sources}</h4>
                  {finding.sources.length ? (
                    <ul className="mt-2 space-y-3">
                      {finding.sources.map((source, i) => (
                        <li
                          key={`${source.id}-${i}`}
                          className="rounded-lg bg-surface-sunken p-3"
                        >
                          <p className="text-sm font-medium">
                            [{source.id}] {source.label}
                          </p>
                          {source.confidence && (
                            <p className="text-sm">
                              {vi
                                ? "Mức bằng chứng ghi nhận"
                                : "Recorded evidence level"}
                              : {source.confidence.replaceAll("_", " ")}
                            </p>
                          )}
                          {source.observedAt && (
                            <p className="text-sm">{source.observedAt}</p>
                          )}
                          {source.detail && (
                            <details className="mt-2" data-source-disclosure>
                              <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">{copy.sourceDetail}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></summary>
                              <p className="mt-2 whitespace-pre-wrap">{source.detail}</p>
                            </details>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm">{copy.noSources}</p>
                  )}
                </div>
                <a href="#analyze-findings-heading" className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-medium text-action underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"><ArrowUp className="h-4 w-4" aria-hidden="true" />{copy.backOverview}</a>
              </div>
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}

function FindingList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <h4 className="font-semibold text-primary">{title}</h4>
      <ul className="mt-1 list-disc space-y-2 pl-5">
        {items.map((item, i) => (
          <li key={i} className="max-w-prose">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
