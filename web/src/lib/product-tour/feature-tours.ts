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
  | "exit-readiness"
  // Per-role first-run tours (role-based-2026-07-25 consolidation).
  // Each auto-launches on ROLE_SPECS[role].landingHref after signup.
  | "founder-first-run"
  | "advisor-first-run"
  | "mentor-first-run"
  | "accelerator-first-run"
  | "innovator-first-run"
  | "reseller-first-run"
  // Startup Package walkthrough (subgoal 11) — 5-step spotlight covering
  // buy → interview → analyze → dashboard → auto-fill. Auto-launches on
  // /startup-package when the founder has never seen it (see tour-state).
  | "startup-package";

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
  // -------------------------------------------------------------------------
  // Per-role first-run tours (role-based-2026-07-25 consolidation).
  //
  // Kept intentionally short (3–5 steps) — each is the "here's your cockpit"
  // walkthrough that fires once on the role's landing page. Deep-dive tours
  // (svi, dataroom, exit-readiness, dashboard-nav) still surface separately
  // as the founder progresses.
  // -------------------------------------------------------------------------
  {
    slug: "founder-first-run",
    route: "/dashboard",
    icon: "rocket",
    version: 1,
    estimatedMinutes: 2,
    name: { en: "Founder first-run", vi: "Founder — lần đầu" },
    summary: {
      en: "Your SVI score, action plan, evaluation and data room in five stops.",
      vi: "SVI, kế hoạch hành động, đánh giá và data room trong năm điểm dừng.",
    },
    steps: [
      {
        id: "svi",
        title: { en: "Your SVI score lives here", vi: "Điểm SVI của bạn ở đây" },
        body: {
          en: "This is your Startup Valuation Index — an uncapped Nikkei-style score. Every action in BlockID moves it up or down.",
          vi: "Chỉ số định giá startup — không giới hạn kiểu Nikkei. Mọi hành động trên BlockID đều đẩy nó lên hoặc xuống.",
        },
        anchor: "[data-tour=\"svi-score-card\"]",
        cta: { label: { en: "Open SVI", vi: "Mở SVI" }, href: "/dashboard/svi" },
      },
      {
        id: "roadmap",
        title: { en: "The 12-phase Action Plan", vi: "Kế hoạch 12 giai đoạn" },
        body: {
          en: "Your roadmap is auto-generated from your current growth phase. Ship the top 2–3 tasks and your SVI moves this week.",
          vi: "Lộ trình tự sinh theo giai đoạn hiện tại. Hoàn thành 2–3 việc trên cùng và SVI sẽ tăng trong tuần.",
        },
        anchor: "[data-tour=\"roadmap-nav\"]",
        cta: { label: { en: "Open roadmap", vi: "Mở lộ trình" }, href: "/workspace/roadmap" },
      },
      {
        id: "evaluation",
        title: { en: "Score the 13 criteria", vi: "Đánh giá 13 tiêu chí" },
        body: {
          en: "Fill in what you know; we auto-fill the rest from public data. Missing evidence is your fastest SVI lift on day one.",
          vi: "Điền những gì bạn biết; phần còn lại chúng tôi tự điền từ dữ liệu công khai. Bổ sung chứng cứ thiếu là cách tăng SVI nhanh nhất trong ngày đầu.",
        },
        anchor: "a[href=\"/workspace/evaluation\"]",
        cta: { label: { en: "Open evaluation", vi: "Mở đánh giá" }, href: "/workspace/evaluation" },
      },
      {
        id: "dataroom",
        title: { en: "Data room seeded on day zero", vi: "Data room có sẵn từ ngày 0" },
        body: {
          en: "Ten investor-standard templates are already in your data room. Complete them once and share a single link with every investor.",
          vi: "Mười mẫu chuẩn nhà đầu tư đã có sẵn. Hoàn thành một lần và chia sẻ một liên kết cho mọi nhà đầu tư.",
        },
        anchor: "a[href=\"/workspace/data-room\"]",
        cta: { label: { en: "Open data room", vi: "Mở data room" }, href: "/workspace/data-room" },
      },
      {
        id: "investor-pack",
        title: { en: "Share with investors", vi: "Chia sẻ với nhà đầu tư" },
        body: {
          en: "Generate an investor pack and send trackable links. See who opened it, which slides they lingered on, and who is warm.",
          vi: "Tạo bộ tài liệu nhà đầu tư và gửi liên kết có theo dõi. Xem ai đã mở, đọc slide nào lâu, ai là ‘ấm’.",
        },
        anchor: "a[href=\"/workspace/investor-pack\"]",
        cta: { label: { en: "Open investor pack", vi: "Mở bộ tài liệu" }, href: "/workspace/investor-pack" },
      },
    ],
  },
  {
    slug: "advisor-first-run",
    route: "/dashboard/advisor",
    icon: "users",
    version: 1,
    estimatedMinutes: 2,
    name: { en: "Advisor first-run", vi: "Advisor — lần đầu" },
    summary: {
      en: "Portfolio SVI, invites, roster, engagement notes and the Monday digest.",
      vi: "SVI danh mục, mời, roster, ghi chú và bản tin thứ Hai.",
    },
    steps: [
      {
        id: "welcome",
        title: { en: "Your advisor cockpit", vi: "Trạm điều khiển advisor" },
        body: {
          en: "Every startup you advise lives here — SVI trend, stage, last analysis, in one row.",
          vi: "Mọi startup bạn cố vấn ở đây — xu hướng SVI, giai đoạn, phân tích gần nhất, trong một dòng.",
        },
        anchor: "h1",
      },
      {
        id: "invite",
        title: { en: "Invite your first client", vi: "Mời khách hàng đầu tiên" },
        body: {
          en: "Send an invite to a founder. When they accept, their SVI and stage flow into your roster automatically.",
          vi: "Gửi lời mời tới một founder. Khi chấp nhận, SVI + giai đoạn của họ chảy vào roster.",
        },
        anchor: "button:has(svg.lucide-plus)",
      },
      {
        id: "roster",
        title: { en: "Read the roster", vi: "Đọc roster" },
        body: {
          en: "Sortable by SVI, stage, or last analysis. Click any row to open the client's full profile.",
          vi: "Sắp xếp theo SVI, giai đoạn, hoặc phân tích gần nhất. Nhấp một dòng để mở hồ sơ đầy đủ.",
        },
        anchor: "table",
        cta: { label: { en: "Open roster", vi: "Mở roster" }, href: "/workspace/client-roster" },
      },
      {
        id: "notes",
        title: { en: "Log a 30-second note", vi: "Ghi chú 30 giây" },
        body: {
          en: "After every session, drop an engagement note. Quarterly reviews then write themselves.",
          vi: "Sau mỗi phiên, ghi một ghi chú. Đánh giá quý sẽ tự viết ra.",
        },
        anchor: "a[href^=\"/workspace/advisor-notes\"]",
        cta: { label: { en: "Open notes", vi: "Mở ghi chú" }, href: "/workspace/advisor-notes" },
      },
      {
        id: "digest",
        title: { en: "Turn on the Monday digest", vi: "Bật bản tin thứ Hai" },
        body: {
          en: "SVI deltas across your whole roster, delivered 8am AEST every Monday — zero data entry.",
          vi: "Chênh lệch SVI toàn roster, gửi 8h sáng AEST mỗi thứ Hai — không cần nhập liệu.",
        },
        anchor: "a[href=\"/workspace/weekly-digest\"]",
        cta: { label: { en: "Open digest", vi: "Mở bản tin" }, href: "/workspace/weekly-digest" },
      },
    ],
  },
  {
    slug: "mentor-first-run",
    route: "/reseller/mentor",
    icon: "users",
    version: 1,
    estimatedMinutes: 2,
    name: { en: "Mentor first-run", vi: "Mentor — lần đầu" },
    summary: {
      en: "Mentee roster, consent tiers, weekly check-ins and the cohort roll-up.",
      vi: "Roster mentee, mức đồng ý, check-in tuần và tổng hợp cohort.",
    },
    steps: [
      {
        id: "welcome",
        title: { en: "Welcome to the Mentor console", vi: "Chào mừng đến console Mentor" },
        body: {
          en: "An engagement view of founders attributed to you — never a billing view. Reseller admin owns billing.",
          vi: "Chế độ xem gắn kết với founder được gán cho bạn — không phải chế độ xem billing. Admin reseller quản lý billing.",
        },
        anchor: "body",
      },
      {
        id: "roster",
        title: { en: "Your mentee roster", vi: "Roster mentee của bạn" },
        body: {
          en: "Each row is one attributed founder. Heat = last-30-day activity. Click a name to open their console.",
          vi: "Mỗi dòng là một founder được gán. Heat = hoạt động 30 ngày qua. Nhấp tên để mở console.",
        },
        anchor: "[data-tour=\"mentor-roster\"]",
        cta: { label: { en: "Filter overdue", vi: "Lọc quá hạn" }, href: "/reseller/mentor?filter=overdue" },
      },
      {
        id: "consent",
        title: { en: "Consent tiers gate what you see", vi: "Mức đồng ý quyết định bạn thấy gì" },
        body: {
          en: "Request reports_shared to unlock SVI numbers; request full_mentor to leave founder-visible notes.",
          vi: "Yêu cầu reports_shared để thấy điểm SVI; yêu cầu full_mentor để ghi chú founder nhìn thấy.",
        },
        anchor: "[data-tour=\"mentor-consent-badge\"]",
      },
      {
        id: "checkin",
        title: { en: "Log a weekly check-in in 60 seconds", vi: "Ghi check-in tuần trong 60 giây" },
        body: {
          en: "Monday-ISO week bucket, one per founder. Capture wins, blockers, and focus.",
          vi: "Ghép theo tuần ISO bắt đầu thứ Hai, một per founder. Ghi thắng, cản trở và tiêu điểm.",
        },
        anchor: "[data-tour=\"mentor-checkin-form\"]",
      },
      {
        id: "cohort",
        title: { en: "Roll up for your program lead", vi: "Tổng hợp cho lead chương trình" },
        body: {
          en: "Cohort view gives phase distribution and a heat-map snapshot suitable for a weekly digest.",
          vi: "Xem cohort cho phân phối giai đoạn và ảnh chụp heatmap phù hợp bản tin tuần.",
        },
        anchor: "[data-tour=\"mentor-cohort-link\"]",
        cta: { label: { en: "Open cohort", vi: "Mở cohort" }, href: "/reseller/mentor/cohort" },
      },
    ],
  },
  {
    slug: "accelerator-first-run",
    route: "/workspace/accelerator",
    icon: "flag",
    version: 1,
    estimatedMinutes: 3,
    name: { en: "Accelerator first-run", vi: "Accelerator — lần đầu" },
    summary: {
      en: "Cohort SVI, intake code, mentor pool, evaluation rubric and quarterly LP PDF.",
      vi: "SVI cohort, mã intake, pool mentor, rubric đánh giá và PDF LP quý.",
    },
    steps: [
      {
        id: "overview",
        title: { en: "This is your cohort at a glance", vi: "Tổng quan cohort của bạn" },
        body: {
          en: "Batch SVI average, week-over-week trend and applicant funnel — the first three numbers your LPs will ask about.",
          vi: "SVI trung bình batch, xu hướng tuần và phễu ứng viên — ba con số LP luôn hỏi.",
        },
        anchor: "main h1",
      },
      {
        id: "add-founders",
        title: { en: "Add your first founders", vi: "Thêm founder đầu tiên" },
        body: {
          en: "Paste your accepted list or add founders one by one. Every founder gets a scoped startup profile and SVI backfills automatically.",
          vi: "Dán danh sách chấp nhận hoặc thêm từng founder. Mỗi founder có hồ sơ startup và SVI tự nạp.",
        },
        anchor: "a[href=\"/workspace/accelerator/cohort/add\"]",
        cta: { label: { en: "Add founders", vi: "Thêm founder" }, href: "/workspace/accelerator/cohort/add" },
      },
      {
        id: "intake-code",
        title: { en: "One intake link for the whole batch", vi: "Một liên kết intake cho cả batch" },
        body: {
          en: "Founders self-onboard through your reseller code. Credits are pre-loaded from your program wallet.",
          vi: "Founder tự onboard qua mã reseller. Tín dụng nạp sẵn từ ví chương trình.",
        },
        anchor: "a[href=\"/reseller/codes\"]",
        cta: { label: { en: "Open codes", vi: "Mở mã" }, href: "/reseller/codes" },
      },
      {
        id: "mentor-pool",
        title: { en: "Assign mentors to founders", vi: "Gán mentor cho founder" },
        body: {
          en: "Invite mentors, map them to founders, and read every check-in from one place — with founder-approved access.",
          vi: "Mời mentor, gán vào founder, đọc mọi check-in từ một nơi — với quyền do founder duyệt.",
        },
        anchor: "a[href=\"/reseller/mentor/cohort\"]",
        cta: { label: { en: "Open mentor pool", vi: "Mở pool mentor" }, href: "/reseller/mentor/cohort" },
      },
      {
        id: "quarterly",
        title: { en: "Ship a report to your LPs", vi: "Gửi báo cáo cho LP" },
        body: {
          en: "One click generates a branded PDF: cohort size, average SVI, capital raised and top performers.",
          vi: "Một cú nhấp tạo PDF có thương hiệu: số cohort, SVI trung bình, vốn gọi được và top performer.",
        },
        anchor: "a[href=\"/workspace/accelerator/quarterly-report\"]",
        cta: { label: { en: "Open quarterly report", vi: "Mở báo cáo quý" }, href: "/workspace/accelerator/quarterly-report" },
      },
    ],
  },
  {
    slug: "innovator-first-run",
    route: "/innovator",
    icon: "compass",
    version: 1,
    estimatedMinutes: 3,
    name: { en: "Innovator first-run", vi: "Innovator — lần đầu" },
    summary: {
      en: "Thesis, industry map, watchlist, POC pipeline and the board-pack export.",
      vi: "Thesis, bản đồ ngành, watchlist, pipeline POC và xuất board-pack.",
    },
    steps: [
      {
        id: "welcome",
        title: { en: "Welcome to your Innovator console", vi: "Chào mừng đến console Innovator" },
        body: {
          en: "Your corporate scouting terminal — set a thesis, track startups, run POCs, generate board packs.",
          vi: "Terminal scout doanh nghiệp — đặt thesis, theo dõi startup, chạy POC, tạo board pack.",
        },
        anchor: "[data-tour=\"innovator-home\"]",
      },
      {
        id: "thesis",
        title: { en: "Name your innovation themes", vi: "Đặt tên chủ đề đổi mới" },
        body: {
          en: "Add 3 strategic themes. We use these to shortlist matches and label everything downstream.",
          vi: "Thêm 3 chủ đề chiến lược. Dùng để rút gọn danh sách phù hợp và gán nhãn mọi thứ.",
        },
        anchor: "[data-tour=\"innovator-thesis\"]",
        cta: { label: { en: "Open theses", vi: "Mở thesis" }, href: "/innovator/theses" },
      },
      {
        id: "industry-map",
        title: { en: "Pin the sectors that matter", vi: "Ghim các ngành quan trọng" },
        body: {
          en: "The Industry Map ranks every AU startup by SVI within a sector. Pin your 3 sectors and save the layout.",
          vi: "Bản đồ ngành xếp hạng mọi startup AU theo SVI trong ngành. Ghim 3 ngành và lưu layout.",
        },
        anchor: "[data-tour=\"innovator-industry-map\"]",
        cta: { label: { en: "Open industry map", vi: "Mở bản đồ ngành" }, href: "/innovator/industry-map" },
      },
      {
        id: "watchlist",
        title: { en: "Build your watchlist", vi: "Xây watchlist" },
        body: {
          en: "Bulk-add top-decile startups, tag with a theme, assign an owning teammate. Weekly digest lands from here.",
          vi: "Thêm hàng loạt top-decile, gán chủ đề và đồng đội. Bản tin tuần từ đây.",
        },
        anchor: "[data-tour=\"innovator-watchlist\"]",
        cta: { label: { en: "Open watchlist", vi: "Mở watchlist" }, href: "/innovator/watchlist" },
      },
      {
        id: "pipeline",
        title: { en: "Run your POC pipeline", vi: "Chạy pipeline POC" },
        body: {
          en: "Promote watchlist entries into the pipeline board. Lanes: Discovered → Screening → POC Scoped → POC Live → Contract.",
          vi: "Đưa mục watchlist vào bảng pipeline. Lanes: Discovered → Screening → POC Scoped → POC Live → Contract.",
        },
        anchor: "[data-tour=\"innovator-pipeline\"]",
        cta: { label: { en: "Open pipeline", vi: "Mở pipeline" }, href: "/innovator/pipeline" },
      },
      {
        id: "reports",
        title: { en: "Ship the board pack", vi: "Gửi board pack" },
        body: {
          en: "Generate the Ventures Quarterly PDF from live pipeline + watchlist data, co-branded with your logo.",
          vi: "Tạo PDF Ventures Quarterly từ pipeline + watchlist trực tiếp, gắn logo của bạn.",
        },
        anchor: "[data-tour=\"innovator-reports\"]",
        cta: { label: { en: "Open reports", vi: "Mở báo cáo" }, href: "/innovator/reports" },
      },
    ],
  },
  // -------------------------------------------------------------------------
  // Startup Package (subgoal 11) — 5-step walkthrough attached to the
  // /startup-package route. Screenshots are captured manually later; until
  // then the FeatureSpotlight overlay renders each step without media.
  // -------------------------------------------------------------------------
  {
    slug: "startup-package",
    route: "/startup-package",
    icon: "rocket",
    version: 1,
    estimatedMinutes: 2,
    name: {
      en: "Startup Package walkthrough",
      vi: "Hướng dẫn Startup Package",
    },
    summary: {
      en: "5 steps: buy → interview → analyze → dashboard → auto-fill",
      vi: "5 bước: mua → phỏng vấn → phân tích → dashboard → tự động điền",
    },
    steps: [
      {
        id: "buy",
        title: {
          en: "1. Buy the Package",
          vi: "1. Mua gói Package",
        },
        body: {
          en: "One-off A$149 unlock: 25 credits, four agent passes, ten dataroom templates, and your public /startup/[slug] listing spin up on checkout.",
          vi: "Mở khóa một lần A$149: 25 credits, bốn lượt agent, mười template data room, và trang /startup/[slug] công khai sẵn sàng khi thanh toán.",
        },
        anchor: "[data-tour=\"package-buy-cta\"]",
        cta: {
          label: { en: "Start checkout", vi: "Bắt đầu thanh toán" },
          href: "/startup-package#pricing",
        },
      },
      {
        id: "interview",
        title: {
          en: "2. Answer the 8-step interview",
          vi: "2. Trả lời 8 bước phỏng vấn",
        },
        body: {
          en: "Guided prompts capture your vision, customers, and traction. Each answer auto-saves and rebuilds your SVI signal in real time.",
          vi: "Câu hỏi hướng dẫn ghi lại tầm nhìn, khách hàng và đà tiến. Mỗi câu trả lời tự lưu và cập nhật SVI thời gian thực.",
        },
        anchor: "[data-tour=\"package-interview-step\"]",
        cta: {
          label: { en: "Open interview", vi: "Mở phỏng vấn" },
          href: "/startup-package/interview",
        },
      },
      {
        id: "analyze",
        title: {
          en: "3. Run a C-Level analysis",
          vi: "3. Chạy phân tích C-Level",
        },
        body: {
          en: "Each phase spawns its lead agent on your latest answers. Cost + word count show before you spend — nothing is auto-charged.",
          vi: "Mỗi giai đoạn kích hoạt agent dẫn dắt trên câu trả lời mới nhất. Chi phí + số từ hiển thị trước khi chi — không tự động tính phí.",
        },
        anchor: "[data-tour=\"package-analyze-button\"]",
      },
      {
        id: "dashboard",
        title: {
          en: "4. Track the 12-phase dashboard",
          vi: "4. Theo dõi dashboard 12 giai đoạn",
        },
        body: {
          en: "One card per phase shows deliverables, credit prices, SVI trend, and your reserved cap-table allocation — the founder cockpit in one view.",
          vi: "Một thẻ mỗi giai đoạn hiển thị deliverables, giá credit, xu hướng SVI và phần cổ phần đã dành — trạm điều khiển founder trong một view.",
        },
        anchor: "[data-tour=\"package-dashboard-grid\"]",
        cta: {
          label: { en: "Open dashboard", vi: "Mở dashboard" },
          href: "/startup-package",
        },
      },
      {
        id: "autofill",
        title: {
          en: "5. Auto-fill a deliverable",
          vi: "5. Tự động điền một deliverable",
        },
        body: {
          en: "Click any deliverable to spend credits, dispatch the matching PDF generator, and drop the file straight into your dataroom.",
          vi: "Nhấp deliverable bất kỳ để chi credit, gọi generator PDF phù hợp và đẩy file trực tiếp vào data room.",
        },
        anchor: "[data-tour=\"package-autofill-button\"]",
        cta: {
          label: { en: "Open data room", vi: "Mở data room" },
          href: "/workspace/data-room",
        },
      },
    ],
  },
  {
    slug: "reseller-first-run",
    route: "/reseller",
    icon: "users",
    version: 1,
    estimatedMinutes: 2,
    name: { en: "Reseller first-run", vi: "Reseller — lần đầu" },
    summary: {
      en: "KPI header, promo codes, attributed customers, mentor roster and monthly CSV.",
      vi: "Header KPI, mã khuyến mãi, khách hàng gán, roster mentor và CSV tháng.",
    },
    steps: [
      {
        id: "welcome",
        title: { en: "Welcome to the Reseller Console", vi: "Chào mừng Console Reseller" },
        body: {
          en: "This console never shows workspace content. You see attributed customers, coupon usage, and mentor activity — nothing that would breach a founder's data room.",
          vi: "Console này không hiển thị nội dung workspace. Bạn thấy khách hàng gán, sử dụng coupon, hoạt động mentor — không gì vi phạm data room của founder.",
        },
        anchor: "header h1",
      },
      {
        id: "kpis",
        title: { en: "Your KPI header", vi: "Header KPI của bạn" },
        body: {
          en: "Attributed customers, active last 7 days, active promo codes, and your billing model. k≥5 anonymity enforced.",
          vi: "Khách gán, hoạt động 7 ngày qua, mã đang hoạt động, và mô hình billing. Ẩn danh k≥5.",
        },
        anchor: "section:has(> .grid.grid-cols-1)",
      },
      {
        id: "codes",
        title: { en: "Your promo codes", vi: "Mã khuyến mãi của bạn" },
        body: {
          en: "One row per tier you're allowed to sell (0/10/20/30/40). Tier 0 has no Stripe object because 0-value coupons are illegal.",
          vi: "Một dòng cho mỗi tier bạn được bán (0/10/20/30/40). Tier 0 không có đối tượng Stripe vì coupon 0-value không hợp lệ.",
        },
        anchor: "a[href=\"/reseller/codes\"]",
        cta: { label: { en: "Open codes", vi: "Mở mã" }, href: "/reseller/codes" },
      },
      {
        id: "customers",
        title: { en: "Attributed customers", vi: "Khách hàng gán" },
        body: {
          en: "Emails are masked by default. Reveal is one click but audit-logged. Open the drawer for progression + reports.",
          vi: "Email ẩn mặc định. Hiện một cú nhấp nhưng có log. Mở drawer để xem tiến độ + báo cáo.",
        },
        anchor: "a[href=\"/reseller/customers\"]",
        cta: { label: { en: "Open customers", vi: "Mở khách hàng" }, href: "/reseller/customers" },
      },
      {
        id: "mentor",
        title: { en: "Mentor roster", vi: "Roster mentor" },
        body: {
          en: "Engagement-first view of your book. Filter by overdue check-ins and log notes without leaving the row.",
          vi: "Chế độ xem tập trung gắn kết. Lọc theo check-in quá hạn và ghi ghi chú mà không rời khỏi dòng.",
        },
        anchor: "a[href=\"/reseller/mentor\"]",
        cta: { label: { en: "Open mentor roster", vi: "Mở roster mentor" }, href: "/reseller/mentor" },
      },
      {
        id: "credits-and-reports",
        title: { en: "Credits and month-end", vi: "Tín dụng và cuối tháng" },
        body: {
          en: "Grant sandbox credits inside your 20k/mo budget; over-budget triggers an admin request. Download last month's KPI CSV from Reports.",
          vi: "Cấp tín dụng sandbox trong ngân sách 20k/tháng; vượt ngân sách kích hoạt yêu cầu admin. Tải CSV KPI tháng trước từ Reports.",
        },
        anchor: "a[href=\"/reseller/credits\"]",
        cta: { label: { en: "Open credits", vi: "Mở tín dụng" }, href: "/reseller/credits" },
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
