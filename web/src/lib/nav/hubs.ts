// Hub → tab catalogue — G13-W2-IA2 (spec §A.1 "Hub pages and their tabs").
//
// One entry per founder hub under `/workspace/<hub>`. Each hub's
// `layout.tsx` mounts `<HubTabsProvider hub="…">`, and `WorkspaceLayout`
// renders the `<HubTabs>` tablist at the top of <main> from that context,
// so a moved page needs no code of its own to appear as a tab.
//
// Tabs are path segments (`""` = the hub root, `"history"` =
// `/workspace/score/history`). `href` overrides the computed path for the
// two alias tabs that live outside the hub prefix (Settings › Billing →
// `/workspace/billing`, which never moves — D6).
//
// Gates mirror `NavLeaf` (same helpers, same wording — "<Plan> plan unlocks
// this"): `minPlan` and `lockedWithoutFeature` render the tab LOCKED, never
// hidden (§A.1: "Tabs a plan/phase does not unlock render as dimmed with a
// lock … instead of disappearing"). A locked tab links to the billing page
// (or the add-on drawer) with prefetch off.
//
// Dependency-free on purpose: server layouts, the client tablist, tests and
// the docs matrix all import it.

import type { PlanTier } from "@/lib/segments";
import { isHiddenRoute } from "@/lib/features/hidden";

/** EN + VI copy — same shape as `nav-groups.ts` (`LocalisedLabel`). */
export interface HubLabel {
  en: string;
  vi: string;
}

export interface HubTab {
  /** Path segment under the hub root; `""` is the root tab. */
  segment: string;
  label: HubLabel;
  /** Absolute href override for alias tabs outside the hub prefix. */
  href?: string;
  /**
   * Pathname prefix that selects this tab when it differs from `href` — the
   * Guide tab links to the first chapter but owns every `/guide/<slug>`.
   */
  activePrefix?: string;
  /** Required plan tier. Fails ⇒ locked + "<Plan> plan unlocks this". */
  minPlan?: PlanTier;
  /** Entitlement flag; missing ⇒ locked (purchasable capability). */
  lockedWithoutFeature?: string;
  /** Add-on identifier → `/workspace/billing?openAddon=<key>` when locked. */
  addOnKey?: "share_management";
}

export type HubId =
  | "score"
  | "evidence"
  | "plan"
  | "reports"
  | "investors"
  | "valuation"
  | "raise"
  | "accelerators"
  | "finance"
  | "equity"
  | "esop"
  | "team"
  | "strategy"
  | "documents"
  | "exit"
  | "settings"
  | "projects";

export interface HubDef {
  id: HubId;
  /** `/workspace/<hub>` — every tab path is `${root}/${segment}`. */
  root: string;
  label: HubLabel;
  tabs: HubTab[];
}

// G20-F1 (2026-09-20): a tab whose href is in `HIDDEN_FEATURES` is dropped
// from the catalogue here, so the tablist, the docs matrix and every test
// see the same list. Un-hiding = removing the row in lib/features/hidden.ts.
const hub = (id: HubId, label: HubLabel, tabs: HubTab[]): HubDef => {
  const root = `/workspace/${id}`;
  return { id, root, label, tabs: tabs.filter((t) => !isHiddenRoute(t.href ?? (t.segment ? `${root}/${t.segment}` : root))) };
};

export const HUBS: Readonly<Record<HubId, HubDef>> = Object.freeze({
  score: hub("score", { en: "Score", vi: "Điểm SVI" }, [
    { segment: "", label: { en: "Overview", vi: "Tổng quan" } },
    { segment: "history", label: { en: "History", vi: "Lịch sử" } },
    { segment: "trend", label: { en: "Trend", vi: "Xu hướng" } },
    { segment: "benchmark", label: { en: "Benchmark", vi: "So sánh" } },
    { segment: "criteria", label: { en: "Criteria", vi: "Tiêu chí" } },
    { segment: "listing", label: { en: "Public listing", vi: "Niêm yết công khai" } },
  ]),
  evidence: hub("evidence", { en: "Evidence", vi: "Bằng chứng" }, [
    { segment: "", label: { en: "Vault", vi: "Kho" } },
    { segment: "gaps", label: { en: "Gaps", vi: "Thiếu sót" } },
    { segment: "connectors", label: { en: "Connectors", vi: "Kết nối" } },
    { segment: "metrics", label: { en: "Metrics", vi: "Chỉ số" } },
    // S-R5 §C.7: LinkedIn upload / URL → founder_signals (FTV chapter).
    { segment: "founder", label: { en: "Founder", vi: "Nhà sáng lập" } },
    // G21 P1-C: founder correction workflow + "what BlockID holds" panel. Free.
    { segment: "corrections", label: { en: "Corrections", vi: "Đính chính" } },
  ]),
  plan: hub("plan", { en: "Action plan", vi: "Kế hoạch hành động" }, [
    { segment: "", label: { en: "Action plan", vi: "Kế hoạch" } },
    // The guide is 12 chapters under `/guide/[chapter]` with no index page:
    // the tab lands on chapter 1 and owns the whole `/guide/*` subtree.
    { segment: "guide", label: { en: "Guide", vi: "Hướng dẫn" }, href: "/workspace/plan/guide/01-vision", activePrefix: "/workspace/plan/guide" },
    { segment: "journal", label: { en: "Journal", vi: "Nhật ký" } },
  ]),
  reports: hub("reports", { en: "Reports", vi: "Báo cáo" }, [
    { segment: "", label: { en: "All reports", vi: "Tất cả báo cáo" } },
    { segment: "business", label: { en: "Business report", vi: "Báo cáo doanh nghiệp" } },
    { segment: "investor-pack", label: { en: "Investor pack", vi: "Gói nhà đầu tư" } },
    { segment: "weekly", label: { en: "Weekly", vi: "Hàng tuần" } },
    { segment: "c-level", label: { en: "C-level", vi: "Cấp C" } },
  ]),
  investors: hub("investors", { en: "Investors", vi: "Nhà đầu tư" }, [
    { segment: "", label: { en: "Matches", vi: "Phù hợp" } },
    { segment: "pipeline", label: { en: "Pipeline", vi: "Pipeline" } },
    { segment: "access", label: { en: "Access", vi: "Quyền truy cập" } },
  ]),
  valuation: hub("valuation", { en: "Valuation", vi: "Định giá" }, [
    { segment: "", label: { en: "Valuation", vi: "Định giá" } },
    { segment: "cfo", label: { en: "CFO view", vi: "Góc nhìn CFO" } },
    { segment: "forecast", label: { en: "Forecast", vi: "Dự báo" } },
  ]),
  raise: hub("raise", { en: "Raise", vi: "Gọi vốn" }, [
    { segment: "", label: { en: "Readiness", vi: "Mức sẵn sàng" } },
    { segment: "round", label: { en: "Your round", vi: "Vòng của bạn" } },
    { segment: "deck", label: { en: "Deck check", vi: "Kiểm tra deck" } },
    { segment: "term-sheet", label: { en: "Term sheet", vi: "Term sheet" } },
  ]),
  accelerators: hub("accelerators", { en: "Accelerators", vi: "Vườn ươm" }, [
    { segment: "", label: { en: "Tracker", vi: "Theo dõi" } },
    { segment: "criteria", label: { en: "Criteria", vi: "Tiêu chí" } },
  ]),
  finance: hub("finance", { en: "Finance", vi: "Tài chính" }, [
    { segment: "", label: { en: "P&L", vi: "Lãi lỗ" } },
    { segment: "revenue", label: { en: "Revenue", vi: "Doanh thu" } },
    { segment: "expenses", label: { en: "Expenses", vi: "Chi phí" } },
    { segment: "invoices", label: { en: "Invoices", vi: "Hoá đơn" } },
    { segment: "dividends", label: { en: "Dividends", vi: "Cổ tức" } },
  ]),
  equity: hub("equity", { en: "Equity", vi: "Cổ phần" }, [
    { segment: "", label: { en: "Split", vi: "Chia cổ phần" } },
    { segment: "cap-table", label: { en: "Cap table", vi: "Cap table" }, lockedWithoutFeature: "cap_table.write", addOnKey: "share_management" },
    { segment: "shareholders", label: { en: "Shareholders", vi: "Cổ đông" } },
    { segment: "setup", label: { en: "Setup wizard", vi: "Trình thiết lập" } },
    { segment: "secondary", label: { en: "Secondary", vi: "Thứ cấp" } },
    { segment: "on-chain", label: { en: "On-chain", vi: "On-chain" } },
  ]),
  esop: hub("esop", { en: "ESOP", vi: "ESOP" }, [
    { segment: "", label: { en: "Setup", vi: "Thiết lập" } },
    { segment: "grants", label: { en: "Grants", vi: "Cấp quyền" } },
    { segment: "vesting", label: { en: "Vesting", vi: "Vesting" }, lockedWithoutFeature: "vesting.read", addOnKey: "share_management" },
    { segment: "manage", label: { en: "Manage", vi: "Quản lý" }, lockedWithoutFeature: "esop.manage", addOnKey: "share_management" },
    { segment: "offers", label: { en: "Offers", vi: "Đề nghị" } },
  ]),
  team: hub("team", { en: "Team", vi: "Đội ngũ" }, [
    { segment: "", label: { en: "Plan", vi: "Kế hoạch" } },
    { segment: "salaries", label: { en: "Salaries", vi: "Lương" } },
  ]),
  // §A.1 lists an "Overview" root tab that has no page yet; Market (TAM /
  // SAM / SOM) is the root tab until it ships, so the hub root never 404s
  // and nothing is stubbed. Moving Market to `/market` later is one
  // `git mv` + one redirect row.
  strategy: hub("strategy", { en: "Strategy", vi: "Chiến lược" }, [
    { segment: "", label: { en: "Market", vi: "Thị trường" } },
    { segment: "competitors", label: { en: "Competitors", vi: "Đối thủ" } },
    { segment: "tech", label: { en: "Tech scan", vi: "Quét công nghệ" } },
    { segment: "gtm", label: { en: "GTM", vi: "GTM" } },
    { segment: "pricing", label: { en: "Pricing", vi: "Định giá bán" } },
    { segment: "roadmap", label: { en: "Product roadmap", vi: "Lộ trình sản phẩm" } },
  ]),
  documents: hub("documents", { en: "Documents", vi: "Tài liệu" }, [
    { segment: "", label: { en: "Files", vi: "Hồ sơ" } },
    { segment: "data-room", label: { en: "Data room", vi: "Data room" }, lockedWithoutFeature: "data_room.access" },
    { segment: "compliance", label: { en: "Compliance", vi: "Tuân thủ" } },
  ]),
  exit: hub("exit", { en: "Exit", vi: "Thoái vốn" }, [
    { segment: "", label: { en: "Model", vi: "Mô hình" } },
    { segment: "strategy", label: { en: "Strategy", vi: "Chiến lược" } },
    { segment: "benchmark", label: { en: "Benchmark", vi: "So sánh" }, minPlan: "growth" },
    { segment: "listing", label: { en: "Listing readiness", vi: "Sẵn sàng niêm yết" }, minPlan: "growth" },
    { segment: "clean-room", label: { en: "Clean room", vi: "Clean room" }, minPlan: "growth" },
  ]),
  settings: hub("settings", { en: "Settings", vi: "Cài đặt" }, [
    { segment: "", label: { en: "Account", vi: "Tài khoản" } },
    { segment: "profile", label: { en: "Profile", vi: "Hồ sơ" } },
    { segment: "founder", label: { en: "Founder profile", vi: "Hồ sơ founder" } },
    { segment: "project", label: { en: "Project", vi: "Dự án" } },
    { segment: "notifications", label: { en: "Notifications", vi: "Thông báo" } },
    { segment: "billing", label: { en: "Billing", vi: "Thanh toán" }, href: "/workspace/billing" },
    { segment: "referrals", label: { en: "Referrals", vi: "Giới thiệu" } },
    { segment: "feedback", label: { en: "Feedback", vi: "Góp ý" } },
    { segment: "enterprise", label: { en: "Enterprise", vi: "Doanh nghiệp" } },
    { segment: "audit", label: { en: "Audit log", vi: "Nhật ký kiểm toán" } },
  ]),
  projects: hub("projects", { en: "My startups", vi: "Startup của tôi" }, [
    { segment: "", label: { en: "Active", vi: "Đang hoạt động" } },
    { segment: "archived", label: { en: "Archived", vi: "Đã lưu trữ" } },
    { segment: "compare", label: { en: "Compare", vi: "So sánh" } },
  ]),
});

export const HUB_IDS: readonly HubId[] = Object.freeze(Object.keys(HUBS) as HubId[]);

/** Absolute href of a tab. */
export function hubTabHref(hubDef: HubDef, tab: HubTab): string {
  if (tab.href) return tab.href;
  return tab.segment ? `${hubDef.root}/${tab.segment}` : hubDef.root;
}

/**
 * The tab a pathname sits on — longest-prefix match so
 * `/workspace/score/history/abc` selects History and `/workspace/reports/<id>`
 * selects the root ("All reports"). Alias tabs match on their own href.
 * Returns null when the pathname is outside the hub.
 */
export function activeHubTab(hubDef: HubDef, pathname: string): HubTab | null {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  let best: HubTab | null = null;
  let bestLen = -1;
  for (const tab of hubDef.tabs) {
    const href = tab.activePrefix ?? hubTabHref(hubDef, tab);
    const hit = path === href || path.startsWith(`${href}/`);
    if (hit && href.length > bestLen) {
      best = tab;
      bestLen = href.length;
    }
  }
  return best;
}

/** Which hub (if any) a pathname belongs to. */
export function hubForPathname(pathname: string): HubDef | null {
  const path = pathname.split("?")[0];
  for (const id of HUB_IDS) {
    const h = HUBS[id];
    if (path === h.root || path.startsWith(`${h.root}/`)) return h;
  }
  return null;
}
