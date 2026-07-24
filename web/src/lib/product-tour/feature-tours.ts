// Product Tour v2 — Feature Tour registry.
//
// Complements the phase-based ProductTour (see ./tour-state.ts) with a
// per-feature spotlight system. A "feature tour" is a short, self-contained
// walkthrough attached to a specific product surface (SVI, Data Room, Reseller,
// etc.). Each tour holds ordered steps that the FeatureSpotlight component
// renders as an accessible popover / bottom sheet, and each tour has a
// per-feature guide page at /guides/features/<slug> that mirrors the same
// content for deep-linking, sharing, and print/PDF.
//
// This module is pure data + pure derivations. No React, no fetch, no browser
// APIs — so it is safe to import from server components, client components,
// and Node-side tests alike.

import type { Locale } from "@/lib/use-locale";

export type FeatureTourSlug =
  | "onboarding"
  | "svi"
  | "dataroom"
  | "reseller"
  | "dashboard-nav"
  | "exit-readiness";

export type FeatureTourIcon =
  | "rocket"
  | "gauge"
  | "folder"
  | "users"
  | "compass"
  | "flag";

export interface LocalisedText {
  en: string;
  vi: string;
}

/**
 * One step inside a feature tour. Renders as one popover / one page section.
 * `anchor` is a CSS selector the spotlight tries to attach to; when the target
 * is not on the current page, the spotlight falls back to a centered modal.
 * `media` names an entry the TourMedia component knows how to render.
 */
export interface FeatureTourStep {
  id: string;
  title: LocalisedText;
  body: LocalisedText;
  /** CSS selector for the DOM element to anchor the spotlight to. */
  anchor?: string;
  /** Media key rendered by <TourMedia />. */
  media?: string;
  /** Optional deep-link the step's primary CTA points at. */
  cta?: {
    label: LocalisedText;
    href: string;
  };
}

/** A registered feature tour surfaced by the FeatureSpotlight overlay. */
export interface FeatureTour {
  slug: FeatureTourSlug;
  /** Route the tour is primarily attached to; used for auto-launch. */
  route: string;
  /** Human-readable name for the tour selector / guide index. */
  name: LocalisedText;
  /** One-sentence blurb for the guide index card + spotlight header. */
  summary: LocalisedText;
  /** Icon key rendered by <TourMedia /> in the header. */
  icon: FeatureTourIcon;
  /** Ordered walkthrough. Must contain at least one step. */
  steps: FeatureTourStep[];
  /** Estimated read/tour time in minutes — surfaced in the guide card. */
  estimatedMinutes: number;
  /** Tour version — bumped when steps change, breaks dismissal keys. */
  version: number;
}

const TOURS: FeatureTour[] = [
  {
    slug: "onboarding",
    route: "/onboarding",
    icon: "rocket",
    version: 1,
    estimatedMinutes: 3,
    name: {
      en: "First-time onboarding",
      vi: "Hướng dẫn lần đầu",
    },
    summary: {
      en: "The 5-step wizard that turns your first idea into a scored startup profile.",
      vi: "Trình hướng dẫn 5 bước biến ý tưởng đầu tiên thành hồ sơ startup có điểm.",
    },
    steps: [
      {
        id: "welcome",
        title: {
          en: "Welcome to BlockID",
          vi: "Chào mừng đến với BlockID",
        },
        body: {
          en: "We build your startup profile in five short steps. Nothing is saved until you finish, and every field is editable later.",
          vi: "Chúng tôi xây hồ sơ startup của bạn trong 5 bước ngắn. Không có gì lưu cho đến khi bạn hoàn thành, và mọi trường đều chỉnh sửa được sau này.",
        },
        anchor: "[data-tour=onboarding-welcome]",
        media: "welcome",
      },
      {
        id: "segment",
        title: { en: "Pick your segment", vi: "Chọn phân khúc" },
        body: {
          en: "Founder, investor, adviser or reseller — this switches your default dashboard and the credits you receive on trial.",
          vi: "Nhà sáng lập, nhà đầu tư, cố vấn hay đại lý — việc này chuyển bảng điều khiển mặc định và số tín dụng bạn nhận trong bản dùng thử.",
        },
        anchor: "[data-tour=onboarding-segment]",
      },
      {
        id: "first-startup",
        title: { en: "Name your first startup", vi: "Đặt tên startup đầu tiên" },
        body: {
          en: "One-line pitch and a rough stage is enough — the auto-fill engine will populate SVI fields from public signal.",
          vi: "Một dòng giới thiệu và giai đoạn tương đối là đủ — engine tự điền sẽ hoàn thiện các trường SVI từ tín hiệu công khai.",
        },
        anchor: "[data-tour=onboarding-first-startup]",
      },
      {
        id: "goal",
        title: { en: "Set a 90-day goal", vi: "Đặt mục tiêu 90 ngày" },
        body: {
          en: "Your goal drives the tile order on the workspace dashboard and unlocks the matching guide chapter.",
          vi: "Mục tiêu định thứ tự tile trên bảng điều khiển và mở khoá chương hướng dẫn tương ứng.",
        },
        anchor: "[data-tour=onboarding-goal]",
      },
      {
        id: "trial",
        title: { en: "Claim your trial credits", vi: "Nhận tín dụng dùng thử" },
        body: {
          en: "Credits are used by C-Level agents. You always see the cost + word count before spending — nothing is auto-charged.",
          vi: "Tín dụng được C-Level agent sử dụng. Bạn luôn thấy chi phí + số từ trước khi chi — không có gì tự động tính phí.",
        },
        anchor: "[data-tour=onboarding-trial]",
        cta: {
          label: { en: "Enter my workspace", vi: "Vào workspace của tôi" },
          href: "/workspace",
        },
      },
    ],
  },
  {
    slug: "svi",
    route: "/dashboard/svi",
    icon: "gauge",
    version: 1,
    estimatedMinutes: 4,
    name: { en: "SVI — Startup Valuation Index", vi: "SVI — Chỉ số định giá startup" },
    summary: {
      en: "How the 13-criteria SVI score is computed, what moves it, and how to read the trend.",
      vi: "Cách tính điểm SVI 13 tiêu chí, yếu tố thay đổi và cách đọc xu hướng.",
    },
    steps: [
      {
        id: "score",
        title: { en: "Your headline score", vi: "Điểm chính" },
        body: {
          en: "SVI runs from 0 to unlimited (Nikkei-style). The headline is a weighted blend of the 13 criteria — click it to expand each pillar.",
          vi: "SVI từ 0 đến không giới hạn (kiểu Nikkei). Điểm tổng là trung bình có trọng số của 13 tiêu chí — nhấp để mở từng trụ cột.",
        },
        anchor: "[data-tour=svi-score]",
        media: "svi-score",
      },
      {
        id: "pillars",
        title: { en: "13 criteria", vi: "13 tiêu chí" },
        body: {
          en: "Team, Product, Market, Traction, Moat, GTM, Financials, Legal, Risk, Compliance, Impact, Momentum, Story. Each has an editable evidence panel.",
          vi: "Đội ngũ, Sản phẩm, Thị trường, Đà, Rào cản, GTM, Tài chính, Pháp lý, Rủi ro, Tuân thủ, Tác động, Đà tăng, Câu chuyện. Mỗi tiêu chí có bảng chứng cứ chỉnh sửa được.",
        },
        anchor: "[data-tour=svi-pillars]",
      },
      {
        id: "trend",
        title: { en: "Trend chart", vi: "Biểu đồ xu hướng" },
        body: {
          en: "Every SVI snapshot is timestamped and cached. The trend chart shows how the score moves as you edit evidence or spend credits on agent research.",
          vi: "Mỗi bản chụp SVI được đánh dấu thời gian và lưu cache. Biểu đồ xu hướng cho thấy điểm thay đổi khi bạn chỉnh chứng cứ hoặc chi tín dụng cho agent nghiên cứu.",
        },
        anchor: "[data-tour=svi-trend]",
      },
      {
        id: "actions",
        title: { en: "Move the needle", vi: "Cải thiện điểm số" },
        body: {
          en: "The Recommended Actions panel lists the three lowest-weighted-return moves for your stage. Each action links to the relevant workspace tool.",
          vi: "Bảng Hành động đề xuất liệt kê ba hành động có tỉ suất lợi nhuận cao nhất cho giai đoạn của bạn. Mỗi hành động dẫn đến công cụ workspace liên quan.",
        },
        anchor: "[data-tour=svi-actions]",
        cta: {
          label: { en: "Open the SVI dashboard", vi: "Mở bảng SVI" },
          href: "/dashboard/svi",
        },
      },
    ],
  },
  {
    slug: "dataroom",
    route: "/workspace/data-room",
    icon: "folder",
    version: 1,
    estimatedMinutes: 4,
    name: { en: "Data Room", vi: "Data Room" },
    summary: {
      en: "Invite-only document sharing with watermarking, activity log and access expiry.",
      vi: "Chia sẻ tài liệu chỉ dành cho người được mời, có watermark, nhật ký hoạt động và hạn truy cập.",
    },
    steps: [
      {
        id: "folders",
        title: { en: "Standard folders", vi: "Thư mục chuẩn" },
        body: {
          en: "We pre-create the AU-market-standard folder tree: Corporate, Financials, Product, IP, Team, Legal, Fundraise. You can nest and rename freely.",
          vi: "Chúng tôi tạo sẵn cây thư mục chuẩn cho thị trường AU: Doanh nghiệp, Tài chính, Sản phẩm, IP, Đội ngũ, Pháp lý, Gọi vốn. Bạn có thể lồng và đổi tên tự do.",
        },
        anchor: "[data-tour=dataroom-folders]",
      },
      {
        id: "upload",
        title: { en: "Upload & watermark", vi: "Tải lên & watermark" },
        body: {
          en: "Every PDF is watermarked per-viewer at download time — the viewer's email + timestamp is embedded so leaks are traceable.",
          vi: "Mỗi PDF được watermark theo người xem lúc tải xuống — email + dấu thời gian được nhúng để rò rỉ có thể truy nguồn.",
        },
        anchor: "[data-tour=dataroom-upload]",
      },
      {
        id: "invite",
        title: { en: "Invite investors", vi: "Mời nhà đầu tư" },
        body: {
          en: "Send a magic link with per-invite expiry (default 14 days) and per-folder permissions. Revoke any time from the activity log.",
          vi: "Gửi liên kết ma thuật với hạn theo lượt mời (mặc định 14 ngày) và quyền theo thư mục. Thu hồi bất kỳ lúc nào từ nhật ký hoạt động.",
        },
        anchor: "[data-tour=dataroom-invite]",
      },
      {
        id: "activity",
        title: { en: "Activity log", vi: "Nhật ký hoạt động" },
        body: {
          en: "See who viewed what and for how long. Signals are ranked so you know which investor is closest to a decision.",
          vi: "Xem ai đã xem gì và trong bao lâu. Tín hiệu được xếp hạng để bạn biết nhà đầu tư nào gần quyết định nhất.",
        },
        anchor: "[data-tour=dataroom-activity]",
        cta: {
          label: { en: "Open Data Room", vi: "Mở Data Room" },
          href: "/workspace/data-room",
        },
      },
    ],
  },
  {
    slug: "reseller",
    route: "/reseller",
    icon: "users",
    version: 1,
    estimatedMinutes: 3,
    name: { en: "Reseller portal", vi: "Cổng đại lý" },
    summary: {
      en: "Onboard your founder cohort, share credits and track pipeline health from one screen.",
      vi: "Onboard cohort founder, chia sẻ tín dụng và theo dõi sức khoẻ pipeline trên một màn hình.",
    },
    steps: [
      {
        id: "codes",
        title: { en: "Reseller codes", vi: "Mã đại lý" },
        body: {
          en: "Generate a unique code per founder or per cohort. New signups that enter the code are attributed to you for pipeline reporting and revenue share.",
          vi: "Tạo mã riêng cho từng founder hoặc cohort. Đăng ký mới nhập mã sẽ được gán cho bạn để báo cáo pipeline và chia doanh thu.",
        },
        anchor: "[data-tour=reseller-codes]",
      },
      {
        id: "customers",
        title: { en: "Customer roster", vi: "Danh sách khách hàng" },
        body: {
          en: "Each founder appears with their SVI score, latest activity and credit balance — so you can prioritise which relationships need attention this week.",
          vi: "Mỗi founder xuất hiện với điểm SVI, hoạt động mới nhất và số dư tín dụng — để bạn ưu tiên mối quan hệ nào cần quan tâm tuần này.",
        },
        anchor: "[data-tour=reseller-customers]",
      },
      {
        id: "goals",
        title: { en: "Cohort goals", vi: "Mục tiêu cohort" },
        body: {
          en: "Set a monthly cohort goal (activations, SVI uplift, funded startups). The Monitor tab tracks progress and pings you if the goal is slipping.",
          vi: "Đặt mục tiêu cohort hàng tháng (kích hoạt, tăng SVI, startup được đầu tư). Tab Monitor theo dõi tiến độ và cảnh báo nếu mục tiêu chậm.",
        },
        anchor: "[data-tour=reseller-goals]",
        cta: {
          label: { en: "Open reseller portal", vi: "Mở cổng đại lý" },
          href: "/reseller",
        },
      },
    ],
  },
  {
    slug: "dashboard-nav",
    route: "/dashboard",
    icon: "compass",
    version: 1,
    estimatedMinutes: 2,
    name: { en: "Dashboard navigation", vi: "Điều hướng dashboard" },
    summary: {
      en: "How the Startup Navigation System (SCN) maps 5 quadrants of your day.",
      vi: "Cách hệ thống điều hướng startup (SCN) sắp xếp 5 quadrant trong ngày của bạn.",
    },
    steps: [
      {
        id: "quadrants",
        title: { en: "Five quadrants", vi: "Năm quadrant" },
        body: {
          en: "Validation, Position, Value, Direction, Capital. Each quadrant collects the workspace pages you use for that intent — so you never hunt through a menu.",
          vi: "Xác thực, Vị thế, Giá trị, Hướng đi, Vốn. Mỗi quadrant gom các trang workspace bạn dùng cho ý định đó — không phải tìm trong menu.",
        },
        anchor: "[data-tour=dashboard-quadrants]",
      },
      {
        id: "spotlight",
        title: { en: "Today's spotlight", vi: "Spotlight hôm nay" },
        body: {
          en: "The top tile shows the highest-leverage next action for your current phase — computed from your SVI, goals and recent agent output.",
          vi: "Tile trên cùng hiển thị hành động đòn bẩy cao nhất cho giai đoạn hiện tại — tính từ SVI, mục tiêu và đầu ra agent gần đây.",
        },
        anchor: "[data-tour=dashboard-spotlight]",
      },
      {
        id: "goal",
        title: { en: "Goal ribbon", vi: "Dải mục tiêu" },
        body: {
          en: "The header ribbon tracks your 90-day goal. Click through to edit the goal or open the matching guide chapter.",
          vi: "Dải header theo dõi mục tiêu 90 ngày. Nhấp qua để chỉnh mục tiêu hoặc mở chương hướng dẫn tương ứng.",
        },
        anchor: "[data-tour=dashboard-goal]",
        cta: {
          label: { en: "Go to my dashboard", vi: "Đến dashboard" },
          href: "/dashboard",
        },
      },
    ],
  },
  {
    slug: "exit-readiness",
    route: "/dashboard/exit-readiness",
    icon: "flag",
    version: 1,
    estimatedMinutes: 3,
    name: { en: "Exit Readiness", vi: "Sẵn sàng thoái vốn" },
    summary: {
      en: "The 6-lens exit-readiness score, sourced from the same evidence that powers your SVI.",
      vi: "Điểm sẵn sàng thoái vốn 6 lăng kính, dùng cùng bộ chứng cứ với SVI.",
    },
    steps: [
      {
        id: "lenses",
        title: { en: "Six lenses", vi: "Sáu lăng kính" },
        body: {
          en: "Financial, Operational, Legal, Customer, Team and Story. Each lens has a red/amber/green traffic light and a shortest-path checklist.",
          vi: "Tài chính, Vận hành, Pháp lý, Khách hàng, Đội ngũ và Câu chuyện. Mỗi lăng kính có đèn giao thông đỏ/vàng/xanh và danh sách đường ngắn nhất.",
        },
        anchor: "[data-tour=exit-lenses]",
      },
      {
        id: "founder-tile",
        title: { en: "Founder tile", vi: "Tile founder" },
        body: {
          en: "The tile in the top-left is your at-a-glance number. Click it to expand a per-lens breakdown with source evidence links.",
          vi: "Tile ở góc trên bên trái là con số nhanh. Nhấp để mở chi tiết theo lăng kính với liên kết chứng cứ.",
        },
        anchor: "[data-tour=exit-founder-tile]",
      },
      {
        id: "history",
        title: { en: "Historical trend", vi: "Xu hướng lịch sử" },
        body: {
          en: "Snapshots are kept for 24 months so you can show acquirers a track record of tightening operations, not just today's score.",
          vi: "Ảnh chụp được lưu 24 tháng để bạn cho bên mua thấy hồ sơ vận hành cải thiện, không chỉ điểm hôm nay.",
        },
        anchor: "[data-tour=exit-history]",
        cta: {
          label: { en: "Open Exit Readiness", vi: "Mở Exit Readiness" },
          href: "/dashboard/exit-readiness",
        },
      },
    ],
  },
];

/** Freeze at module scope so consumers cannot mutate the registry. */
Object.freeze(TOURS);
TOURS.forEach((t) => {
  Object.freeze(t);
  Object.freeze(t.steps);
});

/**
 * Named export the tour-capture driver (scripts/tour-capture.mjs) imports
 * to discover which tours to shoot. Keep the identifier stable.
 */
export const FEATURE_TOURS: readonly FeatureTour[] = TOURS;

/** Return every registered feature tour, in registration order. */
export function listFeatureTours(): readonly FeatureTour[] {
  return TOURS;
}

/** Look up a tour by slug; returns undefined if not registered. */
export function getFeatureTour(slug: string): FeatureTour | undefined {
  return TOURS.find((t) => t.slug === slug);
}

/** Slugs — used by generateStaticParams for the /guides/features/[feature] page. */
export function featureTourSlugs(): FeatureTourSlug[] {
  return TOURS.map((t) => t.slug);
}

/** Best-effort match: the first tour whose `route` prefixes the current pathname. */
export function tourForRoute(pathname: string): FeatureTour | undefined {
  if (typeof pathname !== "string" || pathname.length === 0) return undefined;
  // Prefer the longest matching route so /dashboard/svi wins over /dashboard.
  return [...TOURS]
    .sort((a, b) => b.route.length - a.route.length)
    .find((t) => pathname === t.route || pathname.startsWith(t.route + "/"));
}

/** Resolve a localised string with EN fallback — safe for any Locale value. */
export function pickLocale(text: LocalisedText, locale: Locale): string {
  return text[locale] ?? text.en;
}

/** Storage key for "this tour was dismissed at version V" state. */
export function dismissKeyFor(slug: FeatureTourSlug): string {
  return "blockid_feature_tour_dismissed_" + slug;
}

/**
 * Pure predicate used by the FeatureSpotlight overlay to decide whether to
 * render. The tour re-surfaces when the stored dismissed-version is lower
 * than the tour's current version (so authoring a new step brings the tour
 * back for returning users).
 */
export function shouldShowFeatureTour(args: {
  tour: FeatureTour;
  dismissedVersion: number | null;
}): boolean {
  if (args.dismissedVersion == null) return true;
  return args.dismissedVersion < args.tour.version;
}
