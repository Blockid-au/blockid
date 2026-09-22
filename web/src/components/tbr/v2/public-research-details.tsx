import type { PublicResearchResult, PublicSourceRecord } from "@/lib/research/public-source-contract";
import { TBR_V2_SECTION_IDS, type TbrUiLocale } from "./shared";

const copy = {
  en: {
    title: "Public sources checked", read: "Pages read", pending: "Relevance not yet checked",
    scope: "Market and alternatives", question: "Who offers a similar solution?", empty: "No public pages were read for this assessment.",
    limit: "These pages have not yet been matched to specific claims. They do not establish verified competitors or independently confirm the business’s statements.",
    discovery: "A wider web search has not been run. This is not a complete competitor review.",
    excerpt: "Excerpt from the page", observed: "Checked", unknownDate: "Date unavailable", published: "Publication date unknown",
    open: "Open source", newTab: "opens in a new tab", back: "Back to report overview", source: "Supplied source", business: "Business website", alternative: "Market or possible alternative",
    noExcerpt: "No readable excerpt is available.", notCitable: "Not yet supporting a report conclusion", omitted: "Additional supplied links were outside this run’s source limit.",
    statuses: { found: "Page read", blocked: "Could not read", not_found: "Page or readable text not found", not_run: "Not checked" },
  },
  vi: {
    title: "Nguồn công khai đã kiểm tra", read: "Trang đã đọc", pending: "Chưa đối chiếu mức độ liên quan",
    scope: "Thị trường và giải pháp thay thế", question: "Ai đang cung cấp giải pháp tương tự?", empty: "Chưa đọc được trang công khai nào cho đánh giá này.",
    limit: "Các trang này chưa được đối chiếu với từng nhận định. Chúng chưa xác minh đối thủ hoặc xác nhận độc lập những thông tin doanh nghiệp cung cấp.",
    discovery: "Chưa tìm kiếm rộng hơn trên web. Đây chưa phải đánh giá đầy đủ về đối thủ.",
    excerpt: "Trích đoạn từ trang nguồn", observed: "Đã kiểm tra", unknownDate: "Chưa có ngày kiểm tra", published: "Chưa rõ ngày xuất bản",
    open: "Mở nguồn", newTab: "mở trong tab mới", back: "Về tổng quan báo cáo", source: "Nguồn được cung cấp", business: "Website doanh nghiệp", alternative: "Thị trường hoặc giải pháp có thể thay thế",
    noExcerpt: "Chưa có trích đoạn đọc được.", notCitable: "Chưa dùng làm bằng chứng cho kết luận", omitted: "Một số liên kết được cung cấp nằm ngoài giới hạn nguồn của lần chạy này.",
    statuses: { found: "Đã đọc trang", blocked: "Không đọc được", not_found: "Không tìm thấy trang hoặc nội dung đọc được", not_run: "Chưa kiểm tra" },
  },
};

function safeSourceHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return;
    return url.toString();
  } catch { return; }
}

function unavailableReason(source: PublicSourceRecord, vi: boolean): string {
  const reasons: Record<string, [string, string]> = {
    public_url_required: ["This link could contain private access details and was not opened.", "Liên kết có thể chứa quyền truy cập riêng tư nên chưa được mở."],
    unsafe_network_destination: ["This destination could not be accessed as a public website.", "Không thể truy cập địa chỉ này như một website công khai."],
    source_exceeds_read_limit: ["The page exceeded this run’s reading limit.", "Nội dung vượt giới hạn đọc của lần chạy này."],
    redirect_not_allowed: ["The page redirects elsewhere; its content was not read.", "Trang chuyển đến địa chỉ khác nên chưa đọc được nội dung."],
    no_readable_page_text: ["No readable page text was available.", "Không có nội dung trang đọc được."],
    request_failed: ["The request did not complete. This does not mean the business or source does not exist.", "Không hoàn tất yêu cầu truy cập. Điều này không có nghĩa doanh nghiệp hoặc nguồn không tồn tại."],
    http_403: ["The website refused automated access.", "Website từ chối truy cập tự động."],
    http_429: ["The website temporarily limited requests.", "Website tạm giới hạn số lần truy cập."],
    http_404: ["The supplied page was not found.", "Không tìm thấy trang được cung cấp."],
    http_410: ["The supplied page is no longer available.", "Trang được cung cấp không còn khả dụng."],
  };
  if (/^http_30[12378]$/.test(source.reason)) return vi ? "Trang chuyển hướng nên chưa đọc được nội dung." : "The page redirected and was not read.";
  const reason = reasons[source.reason];
  return reason ? reason[vi ? 1 : 0] : vi ? "Chưa đọc được nguồn này trong lần chạy này." : "This source could not be read during this run.";
}

/** Already-collected research is readable on every tier; opening details never starts a job or charges credits. */
export function PublicResearchDetails({ research, locale = "en" }: { research?: PublicResearchResult; locale?: TbrUiLocale }) {
  if (!research) return null;
  const vi = locale === "vi";
  const t = vi ? copy.vi : copy.en;
  const readCount = research.sources.filter(source => source.status === "found").length;
  return (
    <details className="rounded-xl border border-line-subtle bg-surface text-primary" data-tbr-public-research>
      <summary className="min-h-11 cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
        {t.title} <span className="font-normal text-secondary">— {t.read}: {readCount} · {t.pending}</span>
      </summary>
      <div className="space-y-4 border-t border-line-subtle p-4 text-sm leading-relaxed">
        <div className="space-y-1">
          <p className="font-semibold">{research.task.businessScope.name} · {t.scope}</p>
          <p>{t.question}</p>
          <p className="text-secondary">{t.limit}</p>
          <p className="text-secondary">{t.discovery}</p>
        </div>
        {readCount === 0 && <p>{t.empty}</p>}
        <ul className="space-y-3">
          {research.sources.map((source, index) => {
            const href = source.reason === "unsafe_network_destination" || source.reason === "public_url_required" ? undefined : safeSourceHref(source.url);
            const checked = source.fetchedAt && Number.isFinite(Date.parse(source.fetchedAt)) ? new Date(source.fetchedAt).toISOString() : null;
            return (
              <li key={`${source.id}-${index}`} className="rounded-lg border border-line-subtle bg-surface-sunken p-3">
                <p className="break-words font-semibold">{source.title || `${t.source} ${index + 1}`}</p>
                <p className="text-secondary">{t.statuses[source.status]} · {source.role === "business" ? t.business : t.alternative}</p>
                <p className="text-secondary">{checked ? <>{t.observed}: <time dateTime={checked}>{checked.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time></> : t.unknownDate} · {t.published}</p>
                {source.status === "found" ? <>
                  <p className="mt-2 font-medium">{t.notCitable}</p>
                  <details className="mt-2">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2">{t.excerpt}</summary>
                    <blockquote className="break-words border-l-2 border-line-subtle pl-3 text-secondary">{source.excerpt || t.noExcerpt}</blockquote>
                  </details>
                </> : <p className="mt-2">{unavailableReason(source, vi)}</p>}
                {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block min-h-11 break-all py-3 font-medium text-action underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{t.open}: {href}<span className="sr-only"> ({t.newTab})</span></a>}
              </li>
            );
          })}
        </ul>
        {research.limits.requested > research.sources.length && <p className="text-secondary">{t.omitted}</p>}
        <a href={`#${TBR_V2_SECTION_IDS.cover}`} className="inline-block min-h-11 py-3 font-medium text-action underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{t.back}</a>
      </div>
    </details>
  );
}
