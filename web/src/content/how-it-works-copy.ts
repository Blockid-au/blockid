/**
 * how-it-works-copy.ts
 * -----------------------------------------------------------------------------
 * Single source of truth for the "See How It Works" landing section
 * (upgradeV2 branch of `web/src/app/page.tsx`, consumed by
 * `web/src/components/landing/how-it-works.tsx`).
 *
 * Bilingual copy uses the LocalisedText shape already established in
 * `web/src/lib/guide/startup-journey.ts` — { en, vi } on every string field.
 *
 * Editorial rules (see docs/plans/how-it-works-2026-07-25/03-copy-cta.md):
 *   - every step body ≤ 18 words in English
 *   - open with a concrete verb
 *   - explain jargon inline the first time it appears (no bare "SVI",
 *     "MRR", or "cap table")
 *   - no marketing hyperbole
 *
 * Icons are referenced by string name only (lucide-react keys) so this file
 * can be imported by both server components and Remotion compositions
 * without pulling the icon runtime in twice.
 */

export interface LocalisedText {
  readonly en: string;
  readonly vi: string;
}

/** lucide-react icon identifier — resolved at the render site. */
export type HowItWorksIcon =
  | "Search"
  | "ClipboardList"
  | "Gauge"
  | "FolderOpen"
  | "Rocket";

export interface HowItWorksStep {
  readonly id: string;
  readonly icon: HowItWorksIcon;
  readonly title: LocalisedText;
  readonly body: LocalisedText;
}

export interface HowItWorksCta {
  readonly label: LocalisedText;
  readonly href: string;
}

export interface HowItWorksCopy {
  readonly eyebrow: LocalisedText;
  readonly headline: LocalisedText;
  readonly subhead: LocalisedText;
  readonly steps: readonly HowItWorksStep[];
  readonly cta: HowItWorksCta;
  readonly videoTagline: LocalisedText;
}

export const HOW_IT_WORKS_COPY: HowItWorksCopy = {
  eyebrow: {
    en: "How it works",
    vi: "Cách hoạt động",
  },
  headline: {
    en: "See how it works",
    vi: "Xem cách hoạt động",
  },
  subhead: {
    en: "Watch how BlockID helps founders go from idea to investor-ready in minutes.",
    vi: "Xem BlockID giúp nhà sáng lập đi từ ý tưởng đến sẵn sàng gọi vốn chỉ trong vài phút.",
  },
  steps: [
    {
      id: "search",
      icon: "Search",
      title: {
        en: "Search your idea",
        vi: "Tìm kiếm ý tưởng",
      },
      body: {
        en: "Type a company name, URL, or ABN. BlockID pulls public signals and grades the idea in seconds.",
        vi: "Nhập tên công ty, URL hoặc ABN. BlockID lấy dữ liệu công khai và chấm điểm trong vài giây.",
      },
    },
    {
      id: "onboard",
      icon: "ClipboardList",
      title: {
        en: "Set your goal",
        vi: "Đặt mục tiêu",
      },
      body: {
        en: "Answer five short questions. Pick the phase you are in and the outcome you want next.",
        vi: "Trả lời năm câu hỏi ngắn. Chọn giai đoạn hiện tại và kết quả bạn muốn đạt được kế tiếp.",
      },
    },
    {
      id: "score",
      icon: "Gauge",
      title: {
        en: "Score readiness",
        vi: "Chấm điểm mức độ sẵn sàng",
      },
      body: {
        en: "See your Startup Value Index — a rating across 13 investor questions, each linked to source evidence.",
        vi: "Xem Chỉ số Giá trị Khởi nghiệp — đánh giá qua 13 câu hỏi của nhà đầu tư, mỗi câu đều có dẫn chứng.",
      },
    },
    {
      id: "build",
      icon: "FolderOpen",
      title: {
        en: "Build your data room",
        vi: "Dựng phòng dữ liệu",
      },
      body: {
        en: "Ten templates seed your data room, plus a cap table (who owns what) and vesting schedules.",
        vi: "Mười mẫu tài liệu sẵn sàng, kèm bảng cổ phần (ai sở hữu bao nhiêu) và lịch trao quyền cổ phần.",
      },
    },
    {
      id: "raise",
      icon: "Rocket",
      title: {
        en: "Raise with confidence",
        vi: "Tự tin gọi vốn",
      },
      body: {
        en: "Export investor-ready reports, shortlist matched investors, and apply to accelerators without rewriting anything.",
        vi: "Xuất báo cáo cho nhà đầu tư, chọn nhà đầu tư phù hợp và nộp đơn vào vườn ươm.",
      },
    },
  ],
  cta: {
    label: {
      en: "Try it with your idea",
      vi: "Thử ngay với ý tưởng của bạn",
    },
    href: "/",
  },
  videoTagline: {
    en: "From first search to first pitch — in one afternoon.",
    vi: "Từ lần tìm kiếm đầu tiên đến buổi pitch đầu tiên — trong một buổi chiều.",
  },
};

export default HOW_IT_WORKS_COPY;
