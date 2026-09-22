import { ChevronDown } from "lucide-react";
import type { CriterionCard } from "@/lib/report-v2/schema";

export function CriterionAnalysis({
  detail,
  vi,
}: {
  detail: CriterionCard["detailedAnalysis"];
  vi: boolean;
}) {
  if (!detail) return null;
  // Never render withheld text, even if a historical or malformed payload
  // still carries it. Saved model analysis is not independent verification.
  const readable = detail.status === "supported"
    && detail.source === "post_audit_criterion"
    && ["model_and_citation", "citation_only"].includes(detail.auditKind)
    && Boolean(detail.narrative.trim());
  return (
    <div className="mt-4 rounded-xl border border-line-subtle bg-surface-raised p-4" data-criterion-analysis={readable ? "supported" : "withheld"}>
      <h5 className="font-semibold text-primary">
        {vi ? "Phân tích chi tiết về doanh nghiệp" : "Detailed business analysis"}
      </h5>
      {readable ? (
        <>
          <p className="mt-2 text-sm text-secondary">
            {vi
              ? "Phân tích AI được lưu sau bước kiểm tra báo cáo. Trích dẫn không tự chứng minh mọi nhận định đã được kiểm chứng độc lập."
              : "Saved AI analysis after report checks. Citations do not establish independent verification of every conclusion."}
          </p>
          <div className="mt-3 max-w-prose whitespace-pre-wrap text-base leading-relaxed text-primary" data-criterion-narrative>
            {detail.narrative}
          </div>
          {detail.citations.length > 0 && (
            <details className="mt-4 rounded-lg bg-surface-sunken p-3" data-analysis-citations>
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
                {vi ? "Xem trích dẫn của phân tích này" : "View citations for this analysis"}
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              </summary>
              <ul className="mt-3 space-y-3 text-sm">
                {detail.citations.map((citation, index) => (
                  <li key={`${citation.evidence_id}-${index}`}>
                    <p className="font-medium">[{citation.evidence_id}]</p>
                    <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-line-subtle pl-3">{citation.quote}</blockquote>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="mt-2 max-w-prose text-sm text-secondary">
          {vi
            ? "Phân tích chi tiết chưa đáp ứng bước kiểm tra của báo cáo nên chưa được hiển thị. Xem nhận định, giới hạn và yêu cầu bổ sung bên dưới."
            : "The detailed analysis did not meet report checks and is not displayed. Review the assessment, limitations and evidence requests below."}
        </p>
      )}
    </div>
  );
}
