// EN / VI copy for the live stage timeline on /analyze (26/09/2026).
//
// Pure: the timeline component, the pending-section placeholders and their
// tests read the same words. Every line is built from the structured stage
// detail the server sends (stage-timeline.ts) — numbers the pipeline really
// produced — never from model prose.

import type { TbrRunState, TbrStageDetail, TbrStageKey, TbrStageView } from "@/lib/analyses/first-analysis/stage-timeline";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";

export type TimelineLocale = "en" | "vi";

export const STAGE_COPY: Record<TimelineLocale, Record<TbrStageKey, { label: string; hint: string }>> = {
  en: {
    received: { label: "Document received", hint: "Your upload is saved to this analysis" },
    read: { label: "Reading the document", hint: "Text extracted slide by slide; scanned pages go through OCR" },
    score: { label: "Company & baseline score", hint: "Company identified and the deterministic SVI baseline computed (no AI)" },
    evidence: { label: "Public evidence & market research", hint: "Registers, benchmarks, market research and computed facts" },
    agents: { label: "C-level analyses", hint: "The CFO, CMO, CTO and the other agents assess your material" },
    dimensions: { label: "Eight dimension chapters", hint: "Each owner agent scores and writes one chapter" },
    valuation: { label: "Valuation", hint: "Methods, the consensus range and what moves it" },
    synthesis: { label: "Investment view", hint: "The CEO agent writes the verdict from everything above" },
    audit: { label: "Grounding check", hint: "Every figure checked against the evidence; uncited claims revised" },
    assemble: { label: "Assembling the report", hint: "Risk matrix, 90-day plan, appendix and the PDF" },
  },
  vi: {
    received: { label: "Đã nhận tài liệu", hint: "Tệp tải lên đã được lưu vào phân tích này" },
    read: { label: "Đọc tài liệu", hint: "Trích xuất văn bản từng slide; trang scan được OCR" },
    score: { label: "Công ty & điểm nền", hint: "Nhận diện công ty và tính điểm SVI nền (không dùng AI)" },
    evidence: { label: "Bằng chứng công khai & nghiên cứu thị trường", hint: "Sổ đăng ký, benchmark, nghiên cứu thị trường và dữ kiện tính toán" },
    agents: { label: "Phân tích của các C-level", hint: "CFO, CMO, CTO và các agent khác đánh giá tài liệu của bạn" },
    dimensions: { label: "8 chương theo chiều đánh giá", hint: "Mỗi agent phụ trách chấm điểm và viết một chương" },
    valuation: { label: "Định giá", hint: "Các phương pháp, khoảng đồng thuận và yếu tố tác động" },
    synthesis: { label: "Góc nhìn đầu tư", hint: "Agent CEO viết kết luận từ toàn bộ dữ liệu trên" },
    audit: { label: "Kiểm tra căn cứ", hint: "Mọi số liệu được đối chiếu với bằng chứng; tuyên bố thiếu nguồn được sửa" },
    assemble: { label: "Hoàn thiện báo cáo", hint: "Ma trận rủi ro, kế hoạch 90 ngày, phụ lục và PDF" },
  },
};

/** Founder-facing names of the eight dimensions (EN mirrors types.ts DIMENSION_LABELS). */
export const DIM_COPY: Record<TimelineLocale, Record<DimKey, string>> = {
  en: {
    ftv: "Founder & Team",
    mpc: "Market & Problem",
    ptd: "Product & Tech",
    tre: "Traction & Revenue",
    cgh: "Cap Table & Governance",
    iri: "Investor Readiness",
    lco: "Legal & Compliance",
    svm: "Strategic Vision & Moat",
  },
  vi: {
    ftv: "Nhà sáng lập & Đội ngũ",
    mpc: "Thị trường & Vấn đề",
    ptd: "Sản phẩm & Công nghệ",
    tre: "Sức kéo & Doanh thu",
    cgh: "Bảng vốn & Quản trị",
    iri: "Sẵn sàng đầu tư",
    lco: "Pháp lý & Tuân thủ",
    svm: "Tầm nhìn & Lợi thế",
  },
};

const SOURCE_NAMES: Record<TimelineLocale, Record<string, string>> = {
  en: {
    research: "research",
    publicResearch: "public research",
    marketResearch: "market research",
    techAudit: "tech audit",
    repoAudit: "code audit",
    connectors: "connected data",
    capTable: "cap table",
    founderSignals: "founder signals",
    founderExecution: "execution record",
    ga4: "GA4",
    grants: "grants",
    externalSignals: "registers",
    evidenceHub: "evidence hub",
    gather: "evidence",
  },
  vi: {
    research: "nghiên cứu",
    publicResearch: "nghiên cứu công khai",
    marketResearch: "nghiên cứu thị trường",
    techAudit: "kiểm tra kỹ thuật",
    repoAudit: "kiểm tra mã nguồn",
    connectors: "dữ liệu kết nối",
    capTable: "bảng vốn",
    founderSignals: "tín hiệu founder",
    founderExecution: "lịch sử thực thi",
    ga4: "GA4",
    grants: "tài trợ",
    externalSignals: "sổ đăng ký",
    evidenceHub: "kho bằng chứng",
    gather: "bằng chứng",
  },
};

export interface TimelineText {
  title: Record<TbrRunState, string>;
  titleRunningCompany: (company: string) => string;
  elapsed: (d: string) => string;
  remaining: (d: string) => string;
  finishing: string;
  overrun: string;
  typical: (d: string, samples: number) => string;
  usually: (d: string) => string;
  status: Record<"waiting" | "running" | "done" | "failed" | "skipped", string>;
  alive: (ago: string) => string;
  slow: (ago: string) => string;
  stale: (ago: string) => string;
  calls: (n: number) => string;
  offline: string;
  leave: (link: boolean) => string;
  emailed: (to: string) => string;
  emailedAccount: string;
  srRunning: (label: string, pct: number) => string;
  srDone: string;
  detailsToggle: string;
  heading: string;
  // chips
  slides: (n: number) => string;
  pages: (n: number) => string;
  words: (n: string) => string;
  truncated: string;
  sectionsFound: (list: string) => string;
  uploading: (pct: number, a: string, b: string) => string;
  uploaded: (b: string) => string;
  readingNow: string;
  queued: string;
  heldForCap: string;
  svi: (n: number) => string;
  evidenceRunning: string;
  evidenceRows: (n: number) => string;
  sourcesChecked: (n: number) => string;
  sourcesMissing: (n: number) => string;
  wave: (n: number) => string;
  dimsProgress: (done: number, total: number) => string;
  writingNow: (list: string) => string;
  degraded: (n: number) => string;
  valuationUnavailable: string;
  mid: (v: string) => string;
  synthesisRunning: string;
  grounded: (pct: number) => string;
  revised: (n: number) => string;
  deadlineHit: string;
  reason: Record<NonNullable<TbrStageDetail["reason"]>, string>;
  // placeholders
  pendingHeading: string;
  pendingNote: string;
  placeholderBadge: string;
  analysingNow: string;
  readyPending: string;
  intakeTitle: string;
  waitingFor: (stage: string) => string;
  sectionInvestment: string;
  sectionValuation: string;
  sectionRisk: string;
  sectionAudit: string;
  lead: (role: string) => string;
}

export const TIMELINE_TEXT: Record<TimelineLocale, TimelineText> = {
  en: {
    title: {
      queued: "Queued — your report starts in a moment",
      held: "Queued for today's free-report slot",
      running: "Writing your Trusted Business Report",
      done: "Report ready",
      retrying: "This attempt stopped — retrying automatically",
      failed: "The report could not be written",
    },
    titleRunningCompany: (c) => `Analysing ${c}`,
    elapsed: (d) => `${d} elapsed`,
    remaining: (d) => `~${d} left`,
    finishing: "finishing — any moment now",
    overrun: "this step is slower than usual — still running",
    typical: (d, n) => (n > 0 ? `A typical run takes ~${d} (median of the last ${n} runs)` : `A run usually takes ~${d}`),
    usually: (d) => `usually ~${d}`,
    status: { waiting: "waiting", running: "running", done: "done", failed: "stopped", skipped: "skipped" },
    alive: (ago) => `Server working · last update ${ago} ago`,
    slow: (ago) => `Last update ${ago} ago — a long AI step is running`,
    stale: (ago) => `No update for ${ago}. If the worker stopped, the run is restarted automatically — you can leave this page.`,
    calls: (n) => `${n} AI call${n === 1 ? "" : "s"} answered`,
    offline: "Cannot reach the server just now — retrying. Your run keeps going on the server.",
    leave: (link) => (link ? "You can leave this page — the report stays at this link." : "You can leave this page — the report is kept in your analysis."),
    emailed: (to) => ` It is also e-mailed to ${to} when it lands.`,
    emailedAccount: " It is also e-mailed to your account address when it lands.",
    srRunning: (label, pct) => `${label} — ${pct}% complete`,
    srDone: "Your report is ready.",
    detailsToggle: "Show every stage",
    heading: "Analysis progress",
    slides: (n) => `${n} slide${n === 1 ? "" : "s"}`,
    pages: (n) => `${n} page${n === 1 ? "" : "s"}`,
    words: (n) => `${n} words`,
    truncated: "long input — the first 65,000 characters were used",
    sectionsFound: (l) => `found: ${l}`,
    uploading: (p, a, b) => `Uploading ${p}% · ${a} of ${b}`,
    uploaded: (b) => `${b} received`,
    readingNow: "The server is extracting the text now",
    queued: "Waiting for a report worker — starts in a moment",
    heldForCap: "Today's free reports are all taken — yours is queued and starts automatically",
    svi: (n) => `SVI ${n}`,
    evidenceRunning: "Checking registers, benchmarks and market research…",
    evidenceRows: (n) => `${n} evidence row${n === 1 ? "" : "s"}`,
    sourcesChecked: (n) => `${n} source${n === 1 ? "" : "s"} checked`,
    sourcesMissing: (n) => `${n} not available for this run`,
    wave: (n) => `wave ${n} of up to 3`,
    dimsProgress: (d, t) => `${d} of ${t} written`,
    writingNow: (l) => `writing now: ${l}`,
    degraded: (n) => `${n} fell back to the scored card`,
    valuationUnavailable: "not calculable from this input — add revenue figures to get a range",
    mid: (v) => `mid ${v}`,
    synthesisRunning: "writing the verdict…",
    grounded: (p) => `${p}% of sections grounded`,
    revised: (n) => `${n} revised`,
    deadlineHit: "time budget reached — unfinished sections use the scored card",
    reason: {
      deadline: "stopped at the run's time limit",
      degraded: "the AI providers returned no usable sections",
      error: "this step failed",
      retrying: "retried automatically in a few minutes",
      not_run: "not needed for this run",
    },
    pendingHeading: "Sections still being written",
    pendingNote: "Placeholders below are NOT report content — each one fills in when its stage finishes.",
    placeholderBadge: "Placeholder",
    analysingNow: "Being analysed now…",
    readyPending: "Done — appears when the report is assembled",
    intakeTitle: "Uploading and reading your document",
    waitingFor: (s) => `Waiting — fills in when “${s}” finishes`,
    sectionInvestment: "Dashboard & investment view",
    sectionValuation: "Valuation — methods, consensus and what moves it",
    sectionRisk: "Risk matrix, 90-day plan, money on the table, appendix",
    sectionAudit: "Citation & grounding check",
    lead: (r) => `Lead · ${r}`,
  },
  vi: {
    title: {
      queued: "Đang xếp hàng — báo cáo sắp bắt đầu",
      held: "Đang chờ suất báo cáo miễn phí hôm nay",
      running: "Đang viết Báo cáo Kinh doanh Tin cậy",
      done: "Báo cáo đã sẵn sàng",
      retrying: "Lần chạy này dừng — hệ thống tự thử lại",
      failed: "Không thể hoàn thành báo cáo",
    },
    titleRunningCompany: (c) => `Đang phân tích ${c}`,
    elapsed: (d) => `đã chạy ${d}`,
    remaining: (d) => `còn ~${d}`,
    finishing: "sắp xong",
    overrun: "bước này chậm hơn thường lệ — vẫn đang chạy",
    typical: (d, n) => (n > 0 ? `Thường mất ~${d} (trung vị ${n} lần chạy gần nhất)` : `Thường mất ~${d}`),
    usually: (d) => `thường ~${d}`,
    status: { waiting: "chờ", running: "đang chạy", done: "xong", failed: "dừng", skipped: "bỏ qua" },
    alive: (ago) => `Máy chủ đang làm việc · cập nhật ${ago} trước`,
    slow: (ago) => `Cập nhật ${ago} trước — đang chạy một bước AI dài`,
    stale: (ago) => `Chưa có cập nhật trong ${ago}. Nếu tiến trình dừng, hệ thống tự khởi động lại — bạn có thể rời trang.`,
    calls: (n) => `${n} lượt gọi AI đã phản hồi`,
    offline: "Tạm thời không kết nối được máy chủ — đang thử lại. Phân tích vẫn tiếp tục trên máy chủ.",
    leave: (link) => (link ? "Bạn có thể rời trang — báo cáo luôn ở đường dẫn này." : "Bạn có thể rời trang — báo cáo được lưu trong phân tích của bạn."),
    emailed: (to) => ` Báo cáo cũng được gửi email tới ${to} khi hoàn tất.`,
    emailedAccount: " Báo cáo cũng được gửi tới email tài khoản của bạn khi hoàn tất.",
    srRunning: (label, pct) => `${label} — hoàn thành ${pct}%`,
    srDone: "Báo cáo của bạn đã sẵn sàng.",
    detailsToggle: "Xem mọi giai đoạn",
    heading: "Tiến độ phân tích",
    slides: (n) => `${n} slide`,
    pages: (n) => `${n} trang`,
    words: (n) => `${n} từ`,
    truncated: "văn bản dài — dùng 65.000 ký tự đầu",
    sectionsFound: (l) => `nhận diện: ${l}`,
    uploading: (p, a, b) => `Đang tải lên ${p}% · ${a}/${b}`,
    uploaded: (b) => `đã nhận ${b}`,
    readingNow: "Máy chủ đang trích xuất văn bản",
    queued: "Đang chờ máy phân tích — sẽ bắt đầu ngay",
    heldForCap: "Suất báo cáo miễn phí hôm nay đã hết — báo cáo của bạn đang xếp hàng và tự bắt đầu",
    svi: (n) => `SVI ${n}`,
    evidenceRunning: "Đang kiểm tra sổ đăng ký, benchmark và nghiên cứu thị trường…",
    evidenceRows: (n) => `${n} dòng bằng chứng`,
    sourcesChecked: (n) => `đã kiểm tra ${n} nguồn`,
    sourcesMissing: (n) => `${n} nguồn không có cho lần chạy này`,
    wave: (n) => `đợt ${n} (tối đa 3)`,
    dimsProgress: (d, t) => `đã viết ${d}/${t}`,
    writingNow: (l) => `đang viết: ${l}`,
    degraded: (n) => `${n} chương dùng thẻ điểm thay thế`,
    valuationUnavailable: "chưa tính được từ dữ liệu này — thêm số liệu doanh thu để có khoảng định giá",
    mid: (v) => `trung vị ${v}`,
    synthesisRunning: "đang viết kết luận…",
    grounded: (p) => `${p}% phần có căn cứ`,
    revised: (n) => `${n} phần được sửa`,
    deadlineHit: "hết thời gian cho phép — phần chưa xong dùng thẻ điểm",
    reason: {
      deadline: "dừng ở giới hạn thời gian",
      degraded: "các nhà cung cấp AI không trả về nội dung dùng được",
      error: "bước này gặp lỗi",
      retrying: "tự động thử lại sau vài phút",
      not_run: "không cần cho lần chạy này",
    },
    pendingHeading: "Các phần đang được viết",
    pendingNote: "Các ô bên dưới CHỈ là chỗ giữ chỗ, chưa phải nội dung báo cáo — mỗi ô sẽ được điền khi giai đoạn của nó hoàn tất.",
    placeholderBadge: "Chỗ giữ chỗ",
    analysingNow: "Đang phân tích…",
    readyPending: "Đã xong — hiển thị khi báo cáo được hoàn thiện",
    intakeTitle: "Đang tải lên và đọc tài liệu",
    waitingFor: (s) => `Đang chờ — sẽ điền khi “${s}” hoàn tất`,
    sectionInvestment: "Bảng tổng quan & góc nhìn đầu tư",
    sectionValuation: "Định giá — phương pháp, đồng thuận và yếu tố tác động",
    sectionRisk: "Ma trận rủi ro, kế hoạch 90 ngày, cơ hội tài trợ, phụ lục",
    sectionAudit: "Kiểm tra trích dẫn & căn cứ",
    lead: (r) => `Phụ trách · ${r}`,
  },
};

// ── Formatting ──────────────────────────────────────────────────────────────

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtAud(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `A$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `A$${Math.round(n / 1_000)}K`;
  return `A$${Math.round(n)}`;
}

export function fmtCount(n: number, locale: TimelineLocale): string {
  return n.toLocaleString(locale === "vi" ? "vi-VN" : "en-AU");
}

/** The lead agent for a dimension (dimension-owners.ts DIMENSION_OWNERS[dim].primary). */
export function ownerRoleFor(dim: string): string {
  const owner = (DIMENSION_OWNERS as Partial<Record<string, { primary: string }>>)[dim];
  return (owner?.primary ?? dim).toUpperCase();
}

export function dimLabel(dim: string, locale: TimelineLocale): string {
  return DIM_COPY[locale][dim as DimKey] ?? dim.toUpperCase();
}

/**
 * The one-line results of a stage, as short chips — "what is happening"
 * while it runs, "what came back" once it is done. Exported for the suite.
 */
export function stageChips(stage: Pick<TbrStageView, "key" | "status" | "detail">, locale: TimelineLocale): string[] {
  const t = TIMELINE_TEXT[locale];
  const d: TbrStageDetail = stage.detail ?? {};
  const out: Array<string | null | undefined> = [];
  if ((stage.status === "failed" || stage.status === "skipped") && d.reason) out.push(t.reason[d.reason]);
  switch (stage.key) {
    case "received":
      if (stage.status === "running" && typeof d.bytesTotal === "number" && d.bytesTotal > 0) {
        const loaded = Math.min(d.bytesLoaded ?? 0, d.bytesTotal);
        out.push(t.uploading(Math.min(99, Math.round((loaded / d.bytesTotal) * 100)), fmtBytes(loaded), fmtBytes(d.bytesTotal)));
      } else if (stage.status === "done" && typeof d.bytesTotal === "number" && d.bytesTotal > 0) out.push(t.uploaded(fmtBytes(d.bytesTotal)));
      out.push(d.filename);
      break;
    case "read":
      if (stage.status === "running") out.push(t.readingNow);
      if (d.units) out.push(d.unitLabel === "pages" ? t.pages(d.units) : t.slides(d.units));
      if (d.words) out.push(t.words(fmtCount(d.words, locale)));
      if (d.sections?.length) out.push(t.sectionsFound(d.sections.join(", ")));
      if (d.truncated) out.push(t.truncated);
      break;
    case "score":
      if (d.heldForCap) out.push(t.heldForCap);
      else if (d.queued && stage.status === "running") out.push(t.queued);
      out.push(d.company);
      if (typeof d.baselineSvi === "number") out.push(t.svi(d.baselineSvi));
      out.push(d.stageLabel);
      break;
    case "evidence": {
      if (stage.status === "running") out.push(t.evidenceRunning);
      if (typeof d.evidenceRows === "number" && stage.status === "done") out.push(t.evidenceRows(d.evidenceRows));
      const sources = d.sources ?? [];
      const ok = sources.filter((s) => s.status === "ok" || s.status === "cached");
      if (ok.length > 0) {
        out.push(t.sourcesChecked(ok.length));
        out.push(ok.map((s) => SOURCE_NAMES[locale][s.name] ?? s.name).slice(0, 6).join(", "));
      }
      const missing = sources.length - ok.length;
      if (missing > 0 && stage.status === "done") out.push(t.sourcesMissing(missing));
      break;
    }
    case "agents":
      if (stage.status === "running" && d.wave) out.push(t.wave(d.wave));
      break;
    case "dimensions": {
      const total = d.total ?? 8;
      if (stage.status === "running" || (stage.status === "done" && typeof d.done === "number")) out.push(t.dimsProgress(d.done ?? 0, total));
      if (stage.status === "running" && d.writing?.length) {
        out.push(t.writingNow(d.writing.slice(0, 4).map((dim) => `${ownerRoleFor(dim)} (${dimLabel(dim, locale)})`).join(", ") + (d.writing.length > 4 ? "…" : "")));
      }
      if (d.degraded) out.push(t.degraded(d.degraded));
      break;
    }
    case "valuation":
      if (stage.status === "done") {
        if (d.unavailable) out.push(t.valuationUnavailable);
        else if (typeof d.midAud === "number") {
          if (typeof d.lowAud === "number" && typeof d.highAud === "number") out.push(`${fmtAud(d.lowAud)} – ${fmtAud(d.highAud)}`);
          out.push(t.mid(fmtAud(d.midAud)));
        }
      }
      break;
    case "synthesis":
      if (stage.status === "running") out.push(t.synthesisRunning);
      break;
    case "audit":
      if (typeof d.groundedPct === "number") out.push(t.grounded(d.groundedPct));
      if (d.revised) out.push(t.revised(d.revised));
      break;
    case "assemble":
      if (d.deadlineHit) out.push(t.deadlineHit);
      break;
  }
  return out.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
