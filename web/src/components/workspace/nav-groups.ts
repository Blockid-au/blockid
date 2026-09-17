// Workspace sidebar nav catalogue — v4 (G13-W1-IA1, D5).
//
// ONE catalogue for every persona: founder groups (Home · Prove · Money ·
// Company), evaluator groups (Home · Deal flow · Reports), the admin group
// and the reseller / mentor console groups. `lib/nav/persona.ts` decides
// which group ids a persona sees; leaf-level `segments` / `feature` /
// `minPlan` / `minPhase` gates decide what renders inside a group.
//
// Spec: docs/plans/investor-clarity-2026-09-15/11-pm-ia-post-login.md
//   §A.1 founder sidebar · §A.2 evaluator sidebar · §A.3 old → new table
//   · §D.1 label rules (pinned by nav-groups.test.ts) · §D.2 EN/VI labels
//   · §D.3 tooltip copy.
//
// Hrefs vs `v4Href`: S-IA1 shipped the catalogue and redirects with leaves
// pointing at the pre-hub pages and the §A.1 target recorded in `v4Href`.
// S-IA2 (G13-W2) moved the pages into their hub tabs (`lib/nav/hubs.ts`)
// and flipped every founder leaf to its hub root, so no leaf carries a
// `v4Href` today. The field stays on the type for the next rename wave —
// `legacy-redirects.ts` mirrors it: a redirect is only live when its
// destination page exists.
//
// Every leaf carries `aliases` — the labels the row had before v4 — so the
// command palette / search can still find "Investor CRM" (R7).
//
// Gates (evaluated by workspace-layout.tsx and scripts/docs/unlock-matrix.mts
// in the same order):
//   • segments            — audience filter. Wrong audience ⇒ fully hidden.
//   • feature             — entitlement flag; missing ⇒ hidden.
//   • minPhase            — 0..5 nav band (`NavPhase`). Leaf above the
//                           founder's band ⇒ hidden; group above the band
//                           ⇒ folded under "Later phases".
//   • minPlan             — required PlanTier. Failing ⇒ dimmed + lock, tooltip
//                           names the plan ("Starter plan unlocks this").
//   • lockedWithoutFeature — a purchasable capability. Locked, never hidden.

import type { LucideIcon } from "lucide-react";
import {
  Banknote, BarChart3, Briefcase, Building2, ClipboardCheck, ClipboardList, Coins, CreditCard,
  DollarSign, DoorOpen, ExternalLink, Eye, FileBarChart, FileText, FolderOpen, Inbox,
  LayoutDashboard, LayoutGrid, LineChart, Map, MessageSquare, PieChart, Rocket, Send, Settings2,
  Shield, Tag, Target, TrendingUp, Users, Zap,
} from "lucide-react";

import type { PlanTier, Segment } from "@/lib/segments";
import type { NavPhase } from "@/lib/nav/founder-phase-shared";
import type { NavGroupId } from "@/lib/nav/persona";

export type { NavGroupId } from "@/lib/nav/persona";

/** EN + VI copy for one label / tooltip (§D.1 rule 8). */
export interface LocalisedLabel {
  en: string;
  vi: string;
}

export interface NavLeaf {
  href: string;
  label: LocalisedLabel;
  /** Benefit-first tooltip, ≤ 12 words (§D.1 rule 5, copy §D.3). */
  tooltip: LocalisedLabel;
  icon: LucideIcon;
  /** 0..5 nav band the leaf appears at. Omitted ⇒ 0. */
  minPhase?: NavPhase;
  /** Required plan tier. Fails ⇒ dimmed + lock + "<Plan> plan unlocks this". */
  minPlan?: PlanTier;
  /** Audience filter. Fails ⇒ item is fully hidden. */
  segments?: Segment[];
  /** Entitlement flag consulted via useEntitlement().can(). Missing ⇒ hidden. */
  feature?: string;
  /**
   * Entitlement flag that renders the row LOCKED rather than hidden — a
   * capability the viewer can buy (the A$59 Equity add-on). Keeps the row
   * visible with the add-on pill linking to the billing drawer.
   */
  lockedWithoutFeature?: string;
  /** Add-on identifier → `/workspace/billing?openAddon=<key>` when locked. */
  addOnKey?: "share_management";
  /**
   * When the `minPlan` gate fails: `true` drops the row, `false` (default
   * for this catalogue) keeps it dimmed with a lock so the founder can see
   * what the next plan opens. Add-on rows must stay `false`.
   */
  hideWhenLocked?: boolean;
  /** Pre-v4 labels for command-palette search (R7). */
  aliases?: string[];
  /** §A.1 canonical route once the hub ships in S-IA2 (differs from `href` until then). */
  v4Href?: string;
}

/** Alias — older consumers import `NavItem`. Structurally identical. */
export type NavItem = NavLeaf;

export interface NavGroup {
  /** Stable id — persona tables + collapse state key on it. */
  id: NavGroupId;
  /** One word, verb or place (§D.1 rule 2). */
  label: LocalisedLabel;
  tooltip?: LocalisedLabel;
  /**
   * 0..5 nav band the whole group unlocks at. Below it the group folds
   * under the "Later phases" expander (§A.1 G4).
   */
  minPhase?: NavPhase;
  /** Progressive-disclosure default — collapsed on first paint. */
  defaultCollapsed?: boolean;
  items: NavLeaf[];
}

/** Every evaluator persona (T0273) — investor rungs + advisor (Firm) + accelerator (Program). */
export const EVALUATOR_NAV_SEGMENTS: Segment[] = ["investor_angel", "investor_vc", "advisor", "accelerator"];
const INVESTOR_SEGMENTS: Segment[] = ["investor_angel", "investor_vc"];

// ─── Founder (§A.1) ──────────────────────────────────────────────────────────

const HOME: NavGroup = {
  id: "home",
  label: { en: "Home", vi: "Trang chủ" },
  items: [
    {
      href: "/dashboard",
      label: { en: "Dashboard", vi: "Bảng điều khiển" },
      tooltip: { en: "Where you stand and what to do next", vi: "Bạn đang ở đâu và nên làm gì tiếp" },
      icon: LayoutDashboard,
    },
    {
      href: "/workspace/projects",
      label: { en: "My startups", vi: "Startup của tôi" },
      tooltip: { en: "Every startup you own or belong to", vi: "Mọi startup bạn sở hữu hoặc tham gia" },
      icon: Briefcase,
      aliases: ["My Startups", "Archived", "Portfolio", "Compare"],
    },
    {
      href: "/analyze",
      label: { en: "Run analysis", vi: "Chạy phân tích" },
      tooltip: { en: "Score your startup on 8 dimensions in 3 minutes", vi: "Chấm điểm startup trên 8 chiều trong 3 phút" },
      icon: Zap,
      aliases: ["New Analysis"],
    },
    {
      href: "/workspace/reports",
      label: { en: "Reports", vi: "Báo cáo" },
      tooltip: { en: "Everything investors and evaluators read about you", vi: "Mọi thứ nhà đầu tư và người đánh giá đọc về bạn" },
      icon: FileText,
      aliases: ["Weekly Reports", "Business Report (TBR)", "Investor Pack", "C-Level Reports"],
    },
  ],
};

const PROVE: NavGroup = {
  id: "prove",
  label: { en: "Prove", vi: "Chứng minh" },
  tooltip: { en: "Score, evidence and your plan", vi: "Điểm, bằng chứng và kế hoạch của bạn" },
  items: [
    {
      href: "/workspace/score",
      label: { en: "Score", vi: "Điểm SVI" },
      tooltip: { en: "Your SVI, trend and cohort rank", vi: "SVI, xu hướng và thứ hạng trong nhóm của bạn" },
      icon: TrendingUp,
      aliases: ["SVI Score", "Score History", "Your Analyses", "SVI Trend", "Evaluation (13)", "Benchmark"],
    },
    {
      href: "/workspace/evidence",
      label: { en: "Evidence", vi: "Bằng chứng" },
      tooltip: { en: "Add proof — the fastest way to lift your score", vi: "Thêm bằng chứng — cách nhanh nhất để tăng điểm" },
      icon: ClipboardCheck,
      minPlan: "starter",
      aliases: ["Evidence Vault", "Evidence Completeness", "Metrics", "Integrations"],
    },
    {
      href: "/workspace/plan",
      label: { en: "Action plan", vi: "Kế hoạch hành động" },
      tooltip: { en: "Your 12-phase plan, one step at a time", vi: "Kế hoạch 12 giai đoạn, từng bước một" },
      icon: Map,
      aliases: ["Action Plan", "Growth Roadmap", "Growth Journal", "Guide"],
    },
    {
      href: "/startup-package",
      label: { en: "Get investor-ready", vi: "Sẵn sàng gọi vốn" },
      tooltip: { en: "Guided pack: score → data room → cap table (A$149)", vi: "Gói hướng dẫn: điểm → data room → cap table (A$149)" },
      icon: Rocket,
      feature: "startup_package",
      minPlan: "free",
      segments: ["founder"],
      aliases: ["Startup Package", "Get Investor-Ready"],
    },
  ],
};

const MONEY: NavGroup = {
  id: "money",
  label: { en: "Money", vi: "Tiền" },
  tooltip: { en: "Grants, investors, valuation and your raise", vi: "Tài trợ, nhà đầu tư, định giá và vòng gọi vốn" },
  items: [
    {
      href: "/workspace/funding",
      label: { en: "Grants & programs", vi: "Tài trợ & chương trình" },
      tooltip: { en: "56 grants and 199 programs matched to you", vi: "56 khoản tài trợ và 199 chương trình phù hợp với bạn" },
      icon: Coins,
      minPlan: "free",
      aliases: ["Grant & Program Finder", "Money Finder"],
    },
    {
      href: "/workspace/investors",
      label: { en: "Investors", vi: "Nhà đầu tư" },
      tooltip: { en: "Matched investors, your pipeline and who can see what", vi: "Nhà đầu tư phù hợp, pipeline và ai được xem gì" },
      icon: Users,
      minPlan: "starter",
      aliases: ["Investor CRM", "Investor Links", "Advisor Portal", "Data Room Access", "Mentor Access"],
    },
    {
      href: "/workspace/valuation",
      label: { en: "Valuation", vi: "Định giá" },
      tooltip: { en: "Five methods in AUD, benchmarked on AU comparables", vi: "Năm phương pháp bằng AUD, đối chiếu với các công ty so sánh tại Úc" },
      icon: Target,
      minPhase: 2,
      minPlan: "starter",
      aliases: ["VC Valuation", "CFO Advisor", "Financial Forecast"],
    },
    {
      href: "/workspace/raise",
      label: { en: "Raise", vi: "Gọi vốn" },
      tooltip: { en: "Readiness check, your round, deck and term sheet", vi: "Kiểm tra sẵn sàng, vòng gọi vốn, deck và term sheet" },
      icon: Banknote,
      minPhase: 3,
      minPlan: "starter",
      aliases: ["Fundraise Readiness", "Raise Capital", "Pitch Deck Analyzer", "Term Sheet"],
    },
    {
      href: "/workspace/accelerators",
      label: { en: "Accelerators", vi: "Vườn ươm" },
      tooltip: { en: "Track applications and criteria", vi: "Theo dõi hồ sơ và tiêu chí" },
      icon: Rocket,
      minPhase: 3,
      minPlan: "growth",
      aliases: ["Accelerator Tracker", "Accelerator Criteria"],
    },
    {
      href: "/workspace/finance",
      label: { en: "Finance", vi: "Tài chính" },
      tooltip: { en: "Revenue, costs, invoices, dividends", vi: "Doanh thu, chi phí, hoá đơn, cổ tức" },
      icon: DollarSign,
      minPhase: 4,
      minPlan: "starter",
      aliases: ["Finance P&L", "Revenue", "Expenses", "Tax Invoice Checker", "Dividends"],
    },
  ],
};

const COMPANY: NavGroup = {
  id: "company",
  label: { en: "Company", vi: "Công ty" },
  tooltip: { en: "Equity, people, strategy, documents and exit", vi: "Cổ phần, con người, chiến lược, tài liệu và thoái vốn" },
  minPhase: 2,
  items: [
    {
      href: "/workspace/equity",
      label: { en: "Equity", vi: "Cổ phần" },
      tooltip: { en: "Split, cap table, shareholders, on-chain", vi: "Chia cổ phần, cap table, cổ đông, on-chain" },
      icon: PieChart,
      minPhase: 2,
      minPlan: "starter",
      aliases: ["Equity Split", "Equity Setup", "Cap Table", "Shareholders", "Wallet", "Blockchain Sync", "Secondary Offer"],
    },
    {
      // The add-on's own surface: locked, never hidden, so a Growth founder
      // discovers the A$59 Equity add-on that unlocks it.
      href: "/workspace/esop",
      label: { en: "ESOP", vi: "ESOP" },
      tooltip: { en: "Plans, grants, vesting, offers", vi: "Kế hoạch, cấp quyền, vesting, đề nghị" },
      icon: Users,
      minPhase: 2,
      minPlan: "starter",
      addOnKey: "share_management",
      lockedWithoutFeature: "esop.manage",
      hideWhenLocked: false,
      aliases: ["ESOP Setup", "ESOP Manage", "ESOP Manager", "Vesting", "Equity Offer"],
    },
    {
      href: "/workspace/team",
      label: { en: "Team", vi: "Đội ngũ" },
      tooltip: { en: "Hiring plan and AU salary benchmarks", vi: "Kế hoạch tuyển dụng và chuẩn lương tại Úc" },
      icon: Users,
      minPhase: 2,
      minPlan: "starter",
      aliases: ["Team Planner", "Team & Salaries"],
    },
    {
      href: "/workspace/strategy",
      label: { en: "Strategy", vi: "Chiến lược" },
      tooltip: { en: "Market, competitors, tech, GTM, pricing, roadmap", vi: "Thị trường, đối thủ, công nghệ, GTM, giá, lộ trình" },
      icon: LineChart,
      minPhase: 1,
      minPlan: "starter",
      aliases: ["Market Size", "Competitors", "Tech Analysis", "Code & Web Analyzer", "GTM Strategy", "Pricing Tiers", "Roadmap"],
    },
    {
      href: "/workspace/documents",
      label: { en: "Documents", vi: "Tài liệu" },
      tooltip: { en: "Files, data room and compliance", vi: "Hồ sơ, data room và tuân thủ" },
      icon: FolderOpen,
      minPhase: 3,
      minPlan: "starter",
      aliases: ["Data Room", "Compliance Panel", "Compliance Calendar", "ESIC Self-Assessment"],
    },
    {
      href: "/workspace/exit",
      label: { en: "Exit", vi: "Thoái vốn" },
      tooltip: { en: "Model, strategy, benchmark, listing readiness", vi: "Mô hình, chiến lược, so sánh, sẵn sàng niêm yết" },
      icon: DoorOpen,
      minPhase: 5,
      minPlan: "growth",
      aliases: ["Exit Modeling", "Exit Strategy Builder", "Exit Benchmark", "Listing Readiness", "Clean-Room Prep"],
    },
  ],
};

// ─── Evaluator (§A.2) ────────────────────────────────────────────────────────
//
// One "Home" group for the four evaluator personas; leaves are segment-gated
// so an angel sees Dashboard · My evaluations · Watchlist and an advisor sees
// Dashboard · Clients · Notes. The Dashboard rows are listed first so each
// persona's Home starts on its own landing.

const EVALUATOR_HOME: NavGroup = {
  id: "evaluator-home",
  label: { en: "Home", vi: "Trang chủ" },
  items: [
    {
      href: "/workspace/investor",
      label: { en: "Dashboard", vi: "Bảng điều khiển" },
      tooltip: { en: "Your evaluations, deal flow and reports", vi: "Đánh giá, cơ hội đầu tư và báo cáo của bạn" },
      icon: LayoutDashboard,
      segments: INVESTOR_SEGMENTS,
    },
    {
      href: "/workspace/advisor",
      label: { en: "Dashboard", vi: "Bảng điều khiển" },
      tooltip: { en: "Your clients, their scores and your notes", vi: "Khách hàng, điểm số và ghi chú của bạn" },
      icon: LayoutDashboard,
      segments: ["advisor"],
    },
    {
      href: "/workspace/accelerator",
      label: { en: "Dashboard", vi: "Bảng điều khiển" },
      tooltip: { en: "Your cohort, applications and program reports", vi: "Khóa ươm, hồ sơ và báo cáo chương trình" },
      icon: LayoutDashboard,
      segments: ["accelerator"],
    },
    {
      // T0270 — the evaluator's own object. Route kept (claim tokens, G12 emails).
      href: "/workspace/evaluations",
      label: { en: "My evaluations", vi: "Đánh giá của tôi" },
      tooltip: { en: "Startups you entered, scored on one rubric", vi: "Startup bạn đã nhập, chấm theo một bộ tiêu chí" },
      icon: ClipboardList,
      segments: INVESTOR_SEGMENTS,
      minPlan: "free",
      aliases: ["Startups I'm evaluating", "Evaluations"],
    },
    {
      href: "/workspace/investor/watchlist",
      label: { en: "Watchlist", vi: "Theo dõi" },
      tooltip: { en: "Startups you follow, with weekly movers", vi: "Startup bạn theo dõi, kèm biến động hàng tuần" },
      icon: Eye,
      segments: INVESTOR_SEGMENTS,
    },
    {
      href: "/workspace/advisor/roster",
      label: { en: "Clients", vi: "Khách hàng" },
      tooltip: { en: "Every client startup, its score and readiness", vi: "Mọi startup khách hàng, điểm và mức sẵn sàng" },
      icon: Users,
      segments: ["advisor"],
      aliases: ["Client Roster"],
    },
    {
      href: "/workspace/advisor/notes",
      label: { en: "Notes", vi: "Ghi chú" },
      tooltip: { en: "30-second engagement notes per client", vi: "Ghi chú tương tác 30 giây cho từng khách hàng" },
      icon: MessageSquare,
      segments: ["advisor"],
    },
    {
      href: "/workspace/accelerator/cohort",
      label: { en: "Cohort", vi: "Khóa ươm" },
      tooltip: { en: "Every startup in your program, scored weekly", vi: "Mọi startup trong chương trình, chấm điểm hàng tuần" },
      icon: Building2,
      segments: ["accelerator"],
    },
  ],
};

const DEALFLOW: NavGroup = {
  id: "dealflow",
  label: { en: "Deal flow", vi: "Cơ hội" },
  tooltip: { en: "Startups that fit your mandate", vi: "Startup phù hợp với khẩu vị của bạn" },
  items: [
    {
      href: "/workspace/investor/dealflow",
      label: { en: "Matches", vi: "Phù hợp" },
      tooltip: { en: "Startups matching your mandate, ranked by fit", vi: "Startup phù hợp khẩu vị, xếp theo độ khớp" },
      icon: Target,
      segments: INVESTOR_SEGMENTS,
      aliases: ["Deal Flow"],
    },
    {
      href: "/startup-index",
      label: { en: "Startup Index", vi: "Chỉ số Startup" },
      tooltip: { en: "Every scored startup, ranked Nikkei-style", vi: "Mọi startup đã chấm điểm, xếp hạng kiểu Nikkei" },
      icon: BarChart3,
      segments: EVALUATOR_NAV_SEGMENTS,
    },
    {
      href: "/workspace/investor/mandate",
      label: { en: "Mandate", vi: "Khẩu vị đầu tư" },
      tooltip: { en: "Sectors, stages and cheque size you want to see", vi: "Lĩnh vực, giai đoạn và quy mô vốn bạn muốn xem" },
      icon: Settings2,
      segments: EVALUATOR_NAV_SEGMENTS,
      aliases: ["Preferences", "Investor Preferences", "Coverage", "Program criteria"],
    },
    {
      // G14 S35 — program intake links + the scored inbox. Kept at the
      // accelerator URL so bookmarks survive; every evaluator segment can
      // publish a link (flag intake.manage OR the evaluator persona).
      href: "/workspace/accelerator/applications",
      label: { en: "Intake", vi: "Tiếp nhận hồ sơ" },
      tooltip: { en: "Your application links and every scored applicant", vi: "Link ứng tuyển và mọi hồ sơ đã chấm điểm" },
      icon: ClipboardCheck,
      segments: EVALUATOR_NAV_SEGMENTS,
      aliases: ["Applications", "Intake inbox", "Apply link"],
    },
  ],
};

const REPORTS: NavGroup = {
  id: "reports",
  label: { en: "Reports", vi: "Báo cáo" },
  tooltip: { en: "Trust reports, digests and portfolio views", vi: "Báo cáo tin cậy, bản tin và danh mục" },
  items: [
    {
      href: "/workspace/investor/digest",
      label: { en: "Digest", vi: "Bản tin tuần" },
      tooltip: { en: "Weekly movers across your watchlist", vi: "Biến động hàng tuần trên danh sách theo dõi" },
      icon: Send,
      segments: INVESTOR_SEGMENTS,
      aliases: ["Weekly Digest"],
    },
    {
      href: "/workspace/weekly-digest",
      label: { en: "Digest", vi: "Bản tin tuần" },
      tooltip: { en: "Weekly movers across your clients", vi: "Biến động hàng tuần của khách hàng" },
      icon: Send,
      segments: ["advisor"],
      aliases: ["Weekly Digest"],
    },
    {
      href: "/workspace/investor/portfolio",
      label: { en: "Portfolio", vi: "Danh mục" },
      tooltip: { en: "SVI across every startup you backed", vi: "SVI của mọi startup bạn đã đầu tư" },
      icon: PieChart,
      segments: INVESTOR_SEGMENTS,
      minPlan: "vc_small",
      hideWhenLocked: false,
    },
    {
      href: "/workspace/accelerator/quarterly-report",
      label: { en: "Quarterly", vi: "Báo cáo quý" },
      tooltip: { en: "Program report for your board and partners", vi: "Báo cáo chương trình cho hội đồng và đối tác" },
      icon: FileBarChart,
      segments: ["accelerator"],
    },
    {
      href: "/workspace/lp-report",
      label: { en: "LP report", vi: "Báo cáo LP" },
      tooltip: { en: "Cohort performance for your limited partners", vi: "Hiệu quả khóa ươm cho các LP của bạn" },
      icon: FileBarChart,
      segments: ["accelerator"],
      minPlan: "accel_growth",
      hideWhenLocked: false,
      aliases: ["LP Report"],
    },
  ],
};

// ─── Catalogue ───────────────────────────────────────────────────────────────

/** Founder + evaluator groups. Persona tables pick from these by id. */
export const NAV_GROUPS: NavGroup[] = [HOME, PROVE, MONEY, COMPANY, EVALUATOR_HOME, DEALFLOW, REPORTS];

export const ADMIN_NAV_GROUP: NavGroup = {
  id: "admin",
  label: { en: "Admin", vi: "Quản trị" },
  items: [
    { href: "/admin", label: { en: "Admin panel", vi: "Bảng quản trị" }, tooltip: { en: "Users, plans and system health", vi: "Người dùng, gói và tình trạng hệ thống" }, icon: Shield },
    { href: "/admin/goals", label: { en: "CEO goals", vi: "Mục tiêu CEO" }, tooltip: { en: "Goal loop status and milestones", vi: "Trạng thái vòng lặp mục tiêu và cột mốc" }, icon: Target },
    { href: "/dashboard/admin/content-pillars", label: { en: "Content pillars", vi: "Trụ cột nội dung" }, tooltip: { en: "SEO pillar coverage and queue", vi: "Độ phủ trụ cột SEO và hàng đợi" }, icon: FileText },
    { href: "/dashboard/admin/stripe-sync", label: { en: "Stripe sync", vi: "Đồng bộ Stripe" }, tooltip: { en: "Plan and price parity with Stripe", vi: "Đồng bộ gói và giá với Stripe" }, icon: CreditCard },
    { href: "/dashboard/admin/pricing-test", label: { en: "Pricing A/B", vi: "Thử nghiệm giá" }, tooltip: { en: "Pricing experiment arms and results", vi: "Các nhánh thử nghiệm giá và kết quả" }, icon: BarChart3 },
    { href: "/dashboard/admin/svi-exchange", label: { en: "SVI exchange", vi: "Sàn SVI" }, tooltip: { en: "Index snapshots and listing queue", vi: "Ảnh chụp chỉ số và hàng đợi niêm yết" }, icon: Rocket },
    { href: "/dashboard/admin/sector-multiples", label: { en: "Sector multiples", vi: "Bội số ngành" }, tooltip: { en: "Valuation multiples by sector", vi: "Bội số định giá theo ngành" }, icon: TrendingUp },
    { href: "/admin/listings", label: { en: "Listings", vi: "Niêm yết" }, tooltip: { en: "Public listing approvals", vi: "Phê duyệt niêm yết công khai" }, icon: ExternalLink },
  ],
};

/**
 * Reseller + mentor console groups — rendered only by the reseller layout
 * (`WorkspaceLayout navPreset="reseller"`), never in `NAV_GROUPS` (§A.3
 * Roles: "reseller layout owns its groups").
 *
 * The Mentor block is preserved verbatim from wf2tywpoq (mentor-console):
 * hrefs and labels are snapshot-tested per the release plan — do not
 * rename or re-key.
 */
export const RESELLER_NAV_GROUPS: NavGroup[] = [
  {
    id: "reseller",
    label: { en: "Reseller", vi: "Đại lý" },
    items: [
      { href: "/reseller", label: { en: "Dashboard", vi: "Bảng điều khiển" }, tooltip: { en: "Customers, credits and requests at a glance", vi: "Khách hàng, tín dụng và yêu cầu trong một màn hình" }, icon: LayoutDashboard, feature: "reseller.console" },
      { href: "/reseller/customers", label: { en: "Customers", vi: "Khách hàng" }, tooltip: { en: "Startups you provisioned and their plans", vi: "Startup bạn cấp và gói của họ" }, icon: Users, feature: "reseller.console" },
      { href: "/reseller/codes", label: { en: "Codes", vi: "Mã" }, tooltip: { en: "Referral and discount codes", vi: "Mã giới thiệu và giảm giá" }, icon: Tag, feature: "reseller.console" },
      { href: "/reseller/credits", label: { en: "Credits", vi: "Tín dụng" }, tooltip: { en: "Credit pool and grants to customers", vi: "Quỹ tín dụng và cấp cho khách hàng" }, icon: Coins, feature: "reseller.console" },
      { href: "/reseller/requests", label: { en: "Requests", vi: "Yêu cầu" }, tooltip: { en: "Customer requests awaiting you", vi: "Yêu cầu khách hàng đang chờ" }, icon: Inbox, feature: "reseller.console" },
      { href: "/reseller/reports", label: { en: "Reports", vi: "Báo cáo" }, tooltip: { en: "Portfolio SVI and revenue share", vi: "SVI danh mục và chia sẻ doanh thu" }, icon: FileText, feature: "reseller.console" },
      { href: "/reseller/settings", label: { en: "Settings", vi: "Cài đặt" }, tooltip: { en: "Branding, payouts and team", vi: "Thương hiệu, thanh toán và đội ngũ" }, icon: Settings2, feature: "reseller.console" },
    ],
  },
  {
    id: "mentor-console",
    label: { en: "Mentor", vi: "Cố vấn" },
    items: [
      { href: "/reseller/mentor", label: { en: "Roster", vi: "Danh sách" }, tooltip: { en: "Founders attributed to you", vi: "Founder được gán cho bạn" }, icon: Users, feature: "reseller.console" },
      { href: "/reseller/mentor?filter=overdue", label: { en: "Check-in Inbox", vi: "Hộp thư check-in" }, tooltip: { en: "Founders overdue for a check-in", vi: "Founder quá hạn check-in" }, icon: Inbox, feature: "reseller.console" },
      { href: "/reseller/mentor?tab=reports", label: { en: "Reports Feed", vi: "Luồng báo cáo" }, tooltip: { en: "Latest reports across your founders", vi: "Báo cáo mới nhất của các founder" }, icon: FileText, feature: "reseller.console" },
      { href: "/reseller/mentor/cohort", label: { en: "Cohort View", vi: "Xem khóa ươm" }, tooltip: { en: "Roll-up of your whole cohort", vi: "Tổng hợp toàn bộ khóa ươm" }, icon: LayoutGrid, feature: "reseller.console" },
    ],
  },
];

/** Every catalogue group by id (founder + evaluator + admin + consoles). */
export const NAV_GROUPS_BY_ID: Readonly<Record<NavGroupId, NavGroup>> = Object.freeze(
  Object.fromEntries(
    [...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS].map((g) => [g.id, g] as const),
  ) as Record<NavGroupId, NavGroup>,
);

/** Resolve an ordered id list (from `PERSONAS[key].navGroups`) to groups. */
export function navGroupsForIds(ids: readonly NavGroupId[]): NavGroup[] {
  return ids.map((id) => NAV_GROUPS_BY_ID[id]).filter((g): g is NavGroup => Boolean(g));
}

/** Every leaf across the founder + evaluator catalogue (flat). */
export function allNavLeaves(groups: readonly NavGroup[] = NAV_GROUPS): NavLeaf[] {
  const out: NavLeaf[] = [];
  for (const g of groups) out.push(...g.items);
  return out;
}

/** Locale-aware label / tooltip read. Falls back to EN when VI is empty. */
export function navText(text: LocalisedLabel, locale: "en" | "vi" = "en"): string {
  return locale === "vi" && text.vi ? text.vi : text.en;
}
