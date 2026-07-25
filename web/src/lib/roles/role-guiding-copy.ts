/**
 * Landing-page copy + "recommended next step" phrases per role.
 *
 * Kept separate from `role-taxonomy.ts` (which is pure structural data used by
 * the workspace shell + tour engine) so downstream consumers can iterate on
 * marketing copy without triggering the taxonomy tests.
 *
 * Consumers:
 *   - <RoleLandingIntro/> renders `landing_hero` on the role's landing page.
 *   - <RoleNextStep/>     renders `next_step_recommender` in the sidebar or
 *                         empty-state slot of role dashboards.
 *
 * Copy is bilingual EN/VI (matches the platform's localisation contract).
 */
import type { Role } from "./role-taxonomy";

export interface LocalisedText { en: string; vi: string }
export interface RoleLandingHero {
  eyebrow: LocalisedText;
  title: LocalisedText;
  subtitle: LocalisedText;
}
export interface RoleNextStep {
  phrase: LocalisedText;
  cta: { href: string; label: LocalisedText };
}
export interface RoleGuidingCopy {
  landing_hero: RoleLandingHero;
  next_step_recommender: RoleNextStep;
}

export const ROLE_GUIDING_COPY: Record<Role, RoleGuidingCopy> = {
  founder: {
    landing_hero: {
      eyebrow: { en: "Founder cockpit", vi: "Buồng lái Founder" },
      title: { en: "Ship a quotable SVI and a DD-ready data room from Day 0.", vi: "Ra mắt SVI có thể trích dẫn và data room sẵn sàng DD từ ngày 0." },
      subtitle: { en: "Score, journey, cap table, investor CRM and data room — one workspace, mentoring built in.", vi: "Điểm, hành trình, cap table, CRM nhà đầu tư và data room — một workspace, có mentoring." },
    },
    next_step_recommender: {
      phrase: { en: "Recommended next step — recompute your SVI so the investor pack shows this week's score.", vi: "Bước tiếp theo — tính lại SVI để bộ pack nhà đầu tư hiển thị điểm tuần này." },
      cta: { href: "/dashboard/svi", label: { en: "Recompute SVI", vi: "Tính lại SVI" } },
    },
  },
  advisor: {
    landing_hero: {
      eyebrow: { en: "Advisor portal", vi: "Cổng Cố vấn" },
      title: { en: "Live portfolio SVI and 30-second engagement notes.", vi: "SVI danh mục theo thời gian thực và ghi chú tương tác 30 giây." },
      subtitle: { en: "Track every client startup's score, stage and readiness — with warm-intro attribution back to you.", vi: "Theo dõi điểm, giai đoạn và mức độ sẵn sàng của mọi startup khách hàng — kèm ghi nhận warm-intro." },
    },
    next_step_recommender: {
      phrase: { en: "Recommended next step — invite your first client so the portfolio SVI chart starts filling in.", vi: "Bước tiếp theo — mời khách hàng đầu tiên để biểu đồ SVI danh mục bắt đầu có dữ liệu." },
      cta: { href: "/workspace/client-roster", label: { en: "Invite a client", vi: "Mời khách hàng" } },
    },
  },
  mentor: {
    landing_hero: {
      eyebrow: { en: "Mentor console", vi: "Console Mentor" },
      title: { en: "Spot cold mentees, log weekly check-ins, roll up your cohort.", vi: "Phát hiện mentee nguội, ghi chú check-in hàng tuần, tổng hợp cohort." },
      subtitle: { en: "Engagement-first view of attributed founders — never billing. Program lead gets one summary link.", vi: "Góc nhìn tương tác của các founder được gán — không hiển thị billing. Trưởng chương trình nhận một link tổng hợp." },
    },
    next_step_recommender: {
      phrase: { en: "Recommended next step — open the cohort roll-up and flag any mentee overdue for a check-in.", vi: "Bước tiếp theo — mở roll-up cohort và gắn cờ mentee quá hạn check-in." },
      cta: { href: "/reseller/mentor/cohort", label: { en: "Open cohort roll-up", vi: "Mở roll-up cohort" } },
    },
  },
  accelerator: {
    landing_hero: {
      eyebrow: { en: "Accelerator workspace", vi: "Workspace Accelerator" },
      title: { en: "One intake link, assigned mentors, a quarterly LP PDF.", vi: "Một link ứng tuyển, gán mentor, PDF LP hàng quý." },
      subtitle: { en: "Cohort SVI, applicant pipeline and Demo Day mode — plus branded reports for your limited partners.", vi: "SVI cohort, pipeline ứng viên và chế độ Demo Day — cùng báo cáo có brand cho LP." },
    },
    next_step_recommender: {
      phrase: { en: "Recommended next step — share your cohort intake link so applicants land straight in the pipeline.", vi: "Bước tiếp theo — chia sẻ link ứng tuyển cohort để ứng viên vào thẳng pipeline." },
      cta: { href: "/workspace/accelerator", label: { en: "Open intake link", vi: "Mở link ứng tuyển" } },
    },
  },
  innovator: {
    landing_hero: {
      eyebrow: { en: "Corporate Innovator", vi: "Innovator Doanh nghiệp" },
      title: { en: "A Bloomberg terminal for AU startup scouting.", vi: "Terminal Bloomberg để scout startup Úc." },
      subtitle: { en: "Set a thesis, watch every sector's SVI leaderboard, run POCs, ship a co-branded board pack every quarter.", vi: "Đặt thesis, xem leaderboard SVI mỗi ngành, chạy POC, xuất board pack mỗi quý." },
    },
    next_step_recommender: {
      phrase: { en: "Recommended next step — pin your 3 strategic sectors on the Industry Map to seed your watchlist.", vi: "Bước tiếp theo — ghim 3 ngành chiến lược trên Industry Map để khởi tạo watchlist." },
      cta: { href: "/innovator/industry-map", label: { en: "Open Industry Map", vi: "Mở Industry Map" } },
    },
  },
  reseller: {
    landing_hero: {
      eyebrow: { en: "Reseller console", vi: "Console Reseller" },
      title: { en: "Mint promo codes, grant sandbox credits, export monthly KPIs.", vi: "Tạo mã ưu đãi, cấp credit sandbox, xuất KPI hàng tháng." },
      subtitle: { en: "Operational view of your attributed customers with k>=5 anonymity guarantees. Workspace content stays with the founder.", vi: "Góc nhìn vận hành của khách hàng được gán, đảm bảo ẩn danh k>=5. Nội dung workspace vẫn thuộc founder." },
    },
    next_step_recommender: {
      phrase: { en: "Recommended next step — create your first promo code so signups get attributed to your organisation.", vi: "Bước tiếp theo — tạo mã ưu đãi đầu tiên để signup được gán về tổ chức của bạn." },
      cta: { href: "/reseller/codes", label: { en: "Create promo code", vi: "Tạo mã ưu đãi" } },
    },
  },
};

export function getRoleGuidingCopy(role: string): RoleGuidingCopy | undefined {
  return (ROLE_GUIDING_COPY as Record<string, RoleGuidingCopy>)[role];
}
