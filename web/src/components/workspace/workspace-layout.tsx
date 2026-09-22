"use client";

import * as React from "react";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL } from "@/lib/site/legal-entity";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen, ChevronDown, ChevronLeft, ChevronRight, Home, LayoutDashboard, Lock, PlayCircle, Settings2,
} from "lucide-react";
import { useNavCollapse } from "@/lib/nav/nav-collapse-store";
import { useResolvedNavPhase } from "@/components/workspace/founder-nav-context";
import { Logo } from "@/components/brand/logo";
import { CreditBalance } from "@/components/ui/credit-balance";
import { CreditBadge } from "@/components/workspace/credit-badge";
import { ProjectSwitcher } from "@/components/ui/project-switcher";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TrialBanner } from "@/components/workspace/trial-banner";
import { ProductTour } from "@/components/workspace/product-tour";
import { FeatureSpotlight } from "@/components/product-tour/feature-spotlight";
import { ResellerPill } from "@/components/workspace/reseller-pill";
import { HeaderAccountMenu } from "@/components/workspace/header-account-menu";
import { HubTabs } from "@/components/workspace/hub-tabs";
import { SandboxBanner } from "@/components/workspace/sandbox-banner";
import { TrialDayWatcher } from "@/components/upsell/trial-day-watcher";
import { UpgradeModal } from "@/components/upsell/upgrade-modal";
import { UpgradeBanner } from "@/components/upsell/upgrade-banner";
// G13-W1-IA1 (D5) — ONE nav catalogue + ONE persona table. The persona
// decides which group ids render; leaf gates (segments / feature / minPhase /
// minPlan / lockedWithoutFeature) decide what renders inside each group.
// See nav-groups.ts (catalogue) and lib/nav/persona.ts (persona → groups).
import {
  ADMIN_NAV_GROUP,
  RESELLER_NAV_GROUPS,
  navGroupsForIds,
  navText,
  type NavGroup,
  type NavLeaf,
} from "@/components/workspace/nav-groups";
import { PERSONAS, personaFor, type PersonaKey } from "@/lib/nav/persona";
import { chromeFor } from "@/lib/nav/persona-chrome";
import { NAV_PHASE_NAMES } from "@/lib/nav/founder-phase-shared";
import { PaywallProvider } from "@/components/sales/paywall-nudge";
import { TrialCountdownBanner } from "@/components/sales/trial-countdown-banner";
import { useEntitlement } from "@/hooks/useEntitlement";
import { meetsMinPlan, planLabel, type Segment } from "@/lib/segments";
import { useLocale, type Locale } from "@/lib/use-locale";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  user: {
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    role?: string;
  };
  /** Accepted for API compatibility — the topbar ProjectSwitcher renders the active startup. */
  startupName?: string;
  notificationCount?: number;
  /**
   * Current nav phase (0..5 band). Controls which sidebar groups fold under
   * "Later phases" and which leaves are visible. Optional: when omitted the
   * layout reads the founder route-group context (`FounderNavContextProvider`),
   * so a page only needs to pass this when it has a more specific number in
   * hand. Resolve it with `resolveFounderNavPhase()` from `@/lib/nav/founder-phase`.
   */
  currentPhase?: number;
  /**
   * True when the active project has `reseller_sandbox_id` set. Server parents
   * resolve this via `getCurrentProjectIsSandbox()` in `@/lib/projects`. When
   * true, the `SandboxBanner` renders above `TrialBanner` per CLO D4-CLO-06.
   */
  isSandbox?: boolean;
  /**
   * Sidebar preset. `"reseller"` — the reseller console layout supplies the
   * Reseller + Mentor console groups (§A.3 Roles: "reseller layout owns its
   * groups"); the Mentor group renders only with the `reseller.console`
   * entitlement. Default: the resolved persona's groups.
   */
  navPreset?: "persona" | "reseller";
}

// Result of running a NavLeaf through the visibility + gating pipeline.
//   hidden         → dropped (wrong audience, feature flag missing, phase not reached)
//   locked=true    → rendered dimmed with a lock; tooltip names the plan
//   addOn=true     → locked because a purchasable capability is missing
type ResolvedItem = { item: NavLeaf; locked: boolean; addOn: boolean; lockTier: string | null };

interface GateContext {
  planId: string;
  segment: Segment | null;
  currentPhase: number;
  hasFeature: (name: string) => boolean;
  /**
   * True until `/api/me` has answered on the client. While the plan is
   * unknown the sidebar must not lock anything: the server render has no
   * entitlement, and locking every `minPlan` leaf (href → /workspace/billing)
   * for the first paint showed paying founders a fully padlocked menu and
   * pointed crawlers / no-JS agents at billing instead of the real pages.
   */
  planUnknown?: boolean;
}

/**
 * Leaf pipeline — mirrored rule-for-rule by `scripts/docs/unlock-matrix.mts`
 * (`resolveGroup`). If the order changes here, change it there.
 *
 *   1. segments   — wrong audience ⇒ hidden
 *   2. feature    — entitlement missing ⇒ hidden
 *   3. minPhase   — leaf above the band ⇒ hidden (unless the whole group is a
 *                   later-phase preview, where every leaf shows dimmed)
 *   4. minPlan    — under-plan ⇒ locked (dimmed + lock), unless hideWhenLocked
 *   5. lockedWithoutFeature — purchasable capability missing ⇒ locked + add-on pill
 */
export function resolveNavGroup(group: NavGroup, ctx: GateContext, opts: { preview?: boolean } = {}): ResolvedItem[] {
  const resolved: ResolvedItem[] = [];
  for (const item of group.items) {
    if (item.segments && item.segments.length > 0) {
      if (!ctx.segment || !item.segments.includes(ctx.segment)) continue;
    }
    if (item.feature && !ctx.hasFeature(item.feature)) continue;
    if (!opts.preview && item.minPhase != null && item.minPhase > ctx.currentPhase) continue;

    const meetsPlan = item.minPlan ? ctx.planUnknown === true || meetsMinPlan(ctx.planId, item.minPlan) : true;
    if (!meetsPlan && item.hideWhenLocked === true) continue;
    const missingAddOn = Boolean(item.lockedWithoutFeature && ctx.planUnknown !== true && !ctx.hasFeature(item.lockedWithoutFeature));
    const locked = !meetsPlan || missingAddOn;
    resolved.push({
      item,
      locked,
      addOn: locked && Boolean(item.addOnKey),
      lockTier: !meetsPlan && item.minPlan ? planLabel(item.minPlan) : null,
    });
  }
  return resolved;
}

/** Human copy for a group / leaf that unlocks at a later nav band — never a number (§B.5). */
function unlocksAtCopy(minPhase: number, locale: Locale): string {
  const name = NAV_PHASE_NAMES[minPhase] ?? "a later";
  return locale === "vi" ? `Mở khoá ở giai đoạn ${name}` : `Unlocks at the ${name} phase`;
}

function panelId(group: NavGroup): string {
  return `nav-group-panel-${group.id}`;
}

/**
 * Render one NavGroup. Shared by the near-phase list and the "Later phases"
 * expander (`preview` = every row dimmed with a lock and an "unlocks at"
 * tooltip).
 */
function renderNavGroup(args: {
  group: NavGroup;
  resolvedItems: ResolvedItem[];
  currentPhase: number;
  sidebarOpen: boolean;
  pathname: string;
  locale: Locale;
  persona: PersonaKey;
  setMobileOpen: (v: boolean) => void;
  collapsed?: boolean;
  onToggle?: (id: string) => void;
  preview?: boolean;
}): React.ReactNode {
  const { group, resolvedItems, currentPhase, sidebarOpen, pathname, locale, persona, setMobileOpen, collapsed, onToggle, preview } = args;
  if (resolvedItems.length === 0) return null;

  const isFuturePhase = preview === true;
  const groupLabel = navText(group.label, locale);
  const groupTitle = isFuturePhase && group.minPhase != null
    ? unlocksAtCopy(group.minPhase, locale)
    : group.tooltip ? navText(group.tooltip, locale) : undefined;

  const isCollapsible = typeof collapsed === "boolean" && typeof onToggle === "function";
  const isCollapsed = isCollapsible && collapsed === true;

  return (
    <div key={group.id} className="mb-1" data-group-id={group.id} data-group-label={group.label.en}>
      {sidebarOpen && (
        isCollapsible ? (
          <button
            type="button"
            onClick={() => onToggle?.(group.id)}
            aria-expanded={!isCollapsed}
            aria-controls={panelId(group)}
            title={groupTitle}
            className="w-full px-3 pt-4 pb-1.5 flex items-center justify-between text-left hover:bg-surface-sunken rounded-md transition-colors"
          >
            <span className={cn(
              "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]",
              isFuturePhase ? "text-tertiary" : "text-muted",
            )}>
              <ChevronDown
                strokeWidth={1.75}
                className={cn("h-3 w-3 transition-transform duration-150", isCollapsed ? "-rotate-90" : "")}
                aria-hidden
              />
              {groupLabel}
            </span>
          </button>
        ) : (
          <div className="px-3 pt-4 pb-1.5 flex items-center justify-between" title={groupTitle}>
            <span className={cn("text-xs font-semibold uppercase tracking-[0.12em]", isFuturePhase ? "text-tertiary" : "text-muted")}>{groupLabel}</span>
            {isFuturePhase && (
              <span className="text-xs px-1.5 py-0.5 rounded font-semibold bg-gold-50 text-warn ring-1 ring-warn/25">
                {locale === "vi" ? "Đã khoá" : "Locked"}
              </span>
            )}
          </div>
        )
      )}
      {isCollapsed ? null : (
        <div id={panelId(group)}>
          {resolvedItems.map(({ item, locked, addOn, lockTier }) => {
            const { href, icon: Icon, addOnKey } = item;
            const label = navText(item.label, locale);
            const active = pathname === href || pathname.startsWith(href + "/");
            const lockedHref = addOnKey ? `/workspace/billing?openAddon=${addOnKey}` : "/workspace/billing";
            const showAddOnPill = locked && addOn && sidebarOpen;
            const leafFuture = isFuturePhase || (item.minPhase != null && item.minPhase > currentPhase);
            // Row tooltip: plan lock (names the plan, §D.1 rule 6) > add-on >
            // future phase > the benefit line.
            const rowTitle = locked
              ? addOn
                ? (locale === "vi" ? "Tiện ích bổ sung — nhấn để mua" : "Add-on — click to purchase")
                : (locale === "vi" ? `Gói ${lockTier ?? ""} mở khoá mục này`.replace("  ", " ") : `${lockTier ?? "A paid"} plan unlocks this`)
              : leafFuture && item.minPhase != null
                ? unlocksAtCopy(item.minPhase, locale)
                : navText(item.tooltip, locale);
            return (
              <Link
                key={href}
                href={locked ? lockedHref : href}
                onClick={() => {
                  setMobileOpen(false);
                  trackEvent("nav_click", { group: group.id, item: item.label.en, href, persona, phase: currentPhase });
                }}
                aria-disabled={locked || undefined}
                aria-description={rowTitle}
                title={rowTitle}
                className={cn(
                  "flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-all duration-150 mx-1",
                  active
                    ? "bg-brand-navy/10 text-brand-navy font-semibold border-l-2 border-brand-navy shadow-sm"
                    : locked || leafFuture
                      ? "text-tertiary hover:text-muted hover:bg-surface-hover"
                      : "text-muted hover:text-primary hover:bg-surface-hover",
                )}
              >
                <Icon strokeWidth={1.75} className={cn("h-4 w-4 shrink-0", active ? "text-brand-navy" : (locked || leafFuture) ? "text-tertiary" : "")} />
                {sidebarOpen && (
                  <>
                    <span className="truncate flex-1">{label}</span>
                    {showAddOnPill && (
                      <span className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                        Add-on
                      </span>
                    )}
                    {locked && !showAddOnPill && (
                      <Lock strokeWidth={1.75} className="h-3 w-3 shrink-0 text-muted" aria-label={rowTitle} />
                    )}
                    {!locked && leafFuture && (
                      <Lock strokeWidth={1.75} className="h-3 w-3 shrink-0 text-muted" aria-hidden />
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkspaceLayout({ children, user, currentPhase: currentPhaseProp, isSandbox = false, navPreset = "persona" }: Omit<WorkspaceLayoutProps, "notificationCount">) {
  const pathname = usePathname();
  // S7-A — one phase for every founder page: explicit prop > the founder
  // route-group context (`(app)/(founder)/layout.tsx` resolves
  // max(SVI band, growth phase) once per request) > 0. Pages outside the
  // founder group (reseller / compliance shells) have no context → 0.
  const currentPhase = useResolvedNavPhase(currentPhaseProp);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [locale] = useLocale();
  const isAdmin = user.role === "admin";

  const entitlement = useEntitlement();
  const planId = entitlement.user?.plan ?? "free";
  const segment = (entitlement.user?.segment as Segment | undefined) ?? null;
  const accountType = (entitlement.user as { accountType?: string } | null | undefined)?.accountType ?? null;

  // Persona → sidebar groups (D5). `navGroupsForIds` keeps the persona's
  // declared order; the reseller preset swaps in the console groups.
  // G29-C: `personaFor` reads the PLAN too — a founder-typed seat on a Scout /
  // Firm / Program / Cohort plan is an evaluator and never gets founder chrome.
  const personaKey = React.useMemo(
    () => personaFor({ role: user.role ?? null, accountType, segment, plan: entitlement.user?.plan ?? null }),
    [user.role, accountType, segment, entitlement.user?.plan],
  );
  const persona = PERSONAS[personaKey];
  const chrome = chromeFor(personaKey);
  const groups = React.useMemo<NavGroup[]>(() => {
    if (navPreset === "reseller") {
      const consoleGroups = RESELLER_NAV_GROUPS.filter((g) => g.id !== "mentor-console" || entitlement.can("reseller.console"));
      return isAdmin ? [...consoleGroups, ADMIN_NAV_GROUP] : consoleGroups;
    }
    return navGroupsForIds(persona.navGroups);
  }, [navPreset, persona, isAdmin, entitlement]);

  const planUnknown = entitlement.isLoading && !entitlement.user;
  const gate = React.useMemo<GateContext>(
    () => ({ planId, segment, currentPhase, hasFeature: entitlement.can, planUnknown }),
    [planId, segment, currentPhase, entitlement, planUnknown],
  );

  // Groups whose band is above the founder's fold under ONE "Later phases"
  // expander (§A.1 G4) so a phase-0 founder never scrolls past greyed-out
  // clusters. Everything else renders in place.
  const nearGroups = groups.filter((g) => g.minPhase == null || g.minPhase <= currentPhase);
  const laterGroups = groups.filter((g) => g.minPhase != null && g.minPhase > currentPhase);
  const [laterOpen, setLaterOpen] = React.useState(false);

  // Collapse state keyed by group id — catalogue `defaultCollapsed` + the
  // user's localStorage. The first group (Home) is never collapsed.
  const initialCollapse = React.useMemo(() => {
    const next: Record<string, boolean> = {};
    groups.forEach((g, i) => { next[g.id] = i === 0 ? false : Boolean(g.defaultCollapsed); });
    return next;
  }, [groups]);
  const [collapseState, toggleCollapse] = useNavCollapse(initialCollapse);

  // Mobile: force every group but the first closed — screens are tighter.
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const effectiveCollapse = React.useMemo(() => {
    if (!isMobile) return collapseState;
    const forced: Record<string, boolean> = {};
    groups.forEach((g, i) => { forced[g.id] = i !== 0; });
    return forced;
  }, [isMobile, collapseState, groups]);

  const consoleLink = persona.console
    ?? (entitlement.can("reseller.console") && navPreset !== "reseller" ? PERSONAS.reseller.console : undefined);

  const trackMenu = React.useCallback(
    (group: string, item: { href: string; label: string }) =>
      trackEvent("nav_click", { group, item: item.label, href: item.href, persona: personaKey, phase: currentPhase }),
    [personaKey, currentPhase],
  );

  return (
    <PaywallProvider>
    <div className="min-h-svh bg-surface-sunken text-primary flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-strong/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col border-r border-line-subtle bg-surface transition-all duration-200",
        "lg:relative lg:flex",
        mobileOpen ? "flex" : "hidden lg:flex",
        sidebarOpen ? "w-56" : "w-14",
      )}>
        {/* Sidebar header */}
        <div className={cn(
          "flex items-center border-b border-line-subtle h-14 px-3 shrink-0",
          sidebarOpen ? "justify-between" : "justify-center",
        )}>
          {sidebarOpen ? <Logo variant="light" /> : null}
          <button
            type="button"
            onClick={() => { setSidebarOpen(v => !v); setMobileOpen(false); }}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
          >
            {sidebarOpen ? <ChevronLeft strokeWidth={1.75} className="h-4 w-4" /> : <ChevronRight strokeWidth={1.75} className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav groups — persona-filtered, phase-folded, plan-locked. */}
        <nav
          className="flex-1 py-1 px-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-line"
          aria-label="Workspace navigation"
          data-persona={personaKey}
          data-chrome={chrome.kind}
          data-nav-phase={currentPhase}
        >
          {nearGroups.map((group) =>
            renderNavGroup({
              group,
              resolvedItems: resolveNavGroup(group, gate),
              currentPhase,
              sidebarOpen,
              pathname,
              locale,
              persona: personaKey,
              setMobileOpen,
              collapsed: effectiveCollapse[group.id] ?? false,
              onToggle: toggleCollapse,
            }),
          )}
          {sidebarOpen && laterGroups.length > 0 && (() => {
            const resolvedLater = laterGroups
              .map((g) => ({ group: g, items: resolveNavGroup(g, gate, { preview: true }) }))
              .filter((r) => r.items.length > 0);
            const itemCount = resolvedLater.reduce((n, r) => n + r.items.length, 0);
            if (resolvedLater.length === 0) return null;
            const phaseHint = resolvedLater
              .map((r) => `${navText(r.group.label, locale)} — ${unlocksAtCopy(r.group.minPhase!, locale)}`)
              .join("\n");
            return (
              <div className="mb-1 mt-3 border-t border-line-subtle pt-2">
                <button
                  type="button"
                  onClick={() => setLaterOpen((v) => !v)}
                  aria-expanded={laterOpen}
                  aria-controls="later-phases-panel"
                  title={phaseHint}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted hover:text-primary hover:bg-surface-hover transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Lock strokeWidth={1.75} className="h-3 w-3 text-muted" aria-hidden />
                    {locale === "vi" ? `Giai đoạn sau (${itemCount})` : `Later phases (${itemCount})`}
                  </span>
                  <ChevronDown
                    strokeWidth={1.75}
                    className={cn("h-3.5 w-3.5 transition-transform duration-200", laterOpen ? "rotate-180" : "")}
                    aria-hidden
                  />
                </button>
                {laterOpen && (
                  <div id="later-phases-panel" className="mt-1">
                    {resolvedLater.map((r) =>
                      renderNavGroup({
                        group: r.group,
                        resolvedItems: r.items,
                        currentPhase,
                        sidebarOpen,
                        pathname,
                        locale,
                        persona: personaKey,
                        setMobileOpen,
                        preview: true,
                      }),
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </nav>

        {/* Bottom: credit badge · Settings (the one account link, §A.1 footer) · Guides · marketing home.
            S-IA5: Guides moved here from the avatar menu (which now shares the marketing header's rows). */}
        <div className="px-2 pb-3 border-t border-line-subtle pt-3 space-y-1" data-testid="sidebar-footer">
          {sidebarOpen && <div className="px-1 pb-1"><CreditBadge /></div>}
          <Link
            href="/workspace/knowledge-base"
            onClick={() => { setMobileOpen(false); trackMenu("footer", { href: "/workspace/knowledge-base", label: "Guides" }); }}
            title={locale === "vi" ? "Hướng dẫn và tài liệu" : "Guides and how-tos"}
            className={cn(
              "flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-colors",
              pathname.startsWith("/workspace/knowledge-base")
                ? "bg-brand-navy/10 text-brand-navy font-semibold"
                : "text-muted hover:text-primary hover:bg-surface-hover",
            )}
          >
            <BookOpen strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>{locale === "vi" ? "Hướng dẫn" : "Guides"}</span>}
          </Link>
          <Link
            href="/workspace/settings"
            onClick={() => { setMobileOpen(false); trackMenu("footer", { href: "/workspace/settings", label: "Settings" }); }}
            title={locale === "vi" ? "Tài khoản, hồ sơ, thông báo, thanh toán" : "Account, profile, notifications, billing"}
            className={cn(
              "flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-colors",
              pathname.startsWith("/workspace/settings")
                ? "bg-brand-navy/10 text-brand-navy font-semibold"
                : "text-muted hover:text-primary hover:bg-surface-hover",
            )}
          >
            <Settings2 strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>{locale === "vi" ? "Cài đặt" : "Settings"}</span>}
          </Link>
          <Link href="/" className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-muted hover:text-primary hover:bg-surface-hover transition-colors">
            <Home strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>{locale === "vi" ? "Về trang chủ" : "Back to Home"}</span>}
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        {/* Live QA lane 1 F4 (2026-09-13): at 390 px the right-hand cluster
            measured 574 px and clipped the theme toggle, the bell and Sign
            out. Below `sm` the cluster is bell + avatar menu (wallet,
            credits, theme live inside `HeaderAccountMenu` there); from `sm`
            up the inline widgets render and the avatar menu carries the
            account rows (D5). `min-w-0` on the left and `shrink-0` on the
            right keep the row inside the viewport. */}
        <header className="h-16 border-b border-line-subtle bg-surface/90 backdrop-blur-sm px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 sticky top-0 z-30" data-testid="workspace-header">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Open navigation"
              className="lg:hidden h-10 w-10 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-hover cursor-pointer"
            >
              <LayoutDashboard strokeWidth={1.75} className="h-4 w-4" />
            </button>
            <ProjectSwitcher />
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0" data-testid="header-actions">
            {/* ux-ia-startup-flow-v1 §C.3 + §C.7 — global Demo entry, always
                visible from every workspace page so a founder can re-watch
                the walkthrough at any point in their journey. */}
            <Link
              href="/showcase/atlassian?step=1"
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-muted hover:text-primary hover:bg-surface-hover transition-colors"
              title="Watch the Atlassian journey walkthrough"
            >
              <PlayCircle strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" />
              <span>Demo</span>
              <span className="hidden md:inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                Live
              </span>
            </Link>

            {/* Persona console bridge — reseller / mentor / innovator / admin
                get a 1-click link back to their console from any page. */}
            {consoleLink && (
              <Link
                href={consoleLink.href}
                aria-label={consoleLink.ariaLabel ?? consoleLink.label}
                onClick={() => trackMenu("console", { href: consoleLink.href, label: consoleLink.label })}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-muted hover:text-primary hover:bg-surface-hover transition-colors"
              >
                <span>{consoleLink.label}</span>
                {consoleLink.badge && (
                  <span className="hidden md:inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    {consoleLink.badge}
                  </span>
                )}
              </Link>
            )}

            {/* Reseller co-branding pill (renders null when no attribution) */}
            <ResellerPill />

            {/* sm+ only: wallet · credits (below sm they sit in the account menu).
                G26: no theme toggle — the workspace is light-only. */}
            <div className="hidden sm:flex items-center gap-2" data-testid="header-actions-desktop">
              <ConnectWalletButton compact />
              <CreditBalance />
            </div>

            {/* Notifications — every width */}
            <NotificationBell />

            {/* Avatar → account menu — the shared rows (lib/nav/user-menu.ts), every width */}
            <HeaderAccountMenu user={user} persona={personaKey} onNavigate={(item) => trackMenu("user-menu", item)} />
          </div>
        </header>

        {/* Reseller sandbox notice — persistent, non-dismissable warning that
            the reseller-admin must not paste real customer PI here (CLO
            D4-CLO-06). Component is a no-op when `isSandbox` is false. */}
        <SandboxBanner isSandbox={isSandbox} />

        {/* Trial-state banner — self-hiding when not in trial */}
        <TrialBanner />

        {/* CRO trigger arm — checks trial-status once on mount and fires the
            matching day5/6/7 trigger via useUpgradePrompt. Renders nothing. */}
        <TrialDayWatcher />

        {/* Trigger-driven CRO surfaces — self-hiding until a trigger fires. */}
        <UpgradeBanner />
        <UpgradeModal />

        {/* Track B B7 — interactive product tour ("You are on Phase X of 12");
            hides after per-phase dismissal. Founder chrome only (G29-C): an
            evaluator seat has no growth phase — it gets the activation
            checklist / cohort progress on its own pages instead. Held back
            while the plan is unknown so a Program seat never flashes it. */}
        {chrome.phaseBanner && !planUnknown && <ProductTour />}

        {/* Product Tour v2 — per-feature spotlight; matched to route via registry. */}
        <FeatureSpotlight />

        {/* Growth upgrade nudge — shown when a free founder is nearly out of
            credits. Founder ladder only (G29-C). */}
        {chrome.founderUpgradeNudge && <UpgradePrompt />}

        {/* CRO trial countdown — self-hides when >3 days remain or user
            dismisses. Rendered immediately above <main> so the paywall
            provider (see wrapper) can trigger contextual nudges below. */}
        <TrialCountdownBanner />

        {/* Page content. HubTabs renders the hub tablist when the page sits
            under a hub layout (`HubTabsProvider`, G13-W2-IA2) and nothing
            otherwise. */}
        <main className="flex-1 overflow-auto">
          {/* Hub tabs are founder IA (§A.1); evaluators / consoles share a few
              routes (settings, projects) but must not see founder tab chrome
              such as "Founder profile · Enterprise" (W2 review). Admins keep
              the founder groups and therefore the tabs. */}
          {chrome.hubTabs && <HubTabs />}
          {children}
        </main>

        {/* Workspace footer — compact legal strip. Keep in sync with
            docs/plans/unlock-next-level-2026-07-31.md §1a G8-P5. */}
        <footer className="shrink-0 border-t border-line-subtle bg-surface-sunken/80 px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>&copy; {new Date().getUTCFullYear()} {LEGAL_ENTITY.copyrightHolder} &middot; {LEGAL_ENTITY_ABN_LABEL}</span>
          <span className="flex items-center gap-4">
            <Link href="/legal" className="hover:text-muted transition-colors">Legal</Link>
            <Link href="/privacy" className="hover:text-muted transition-colors">Privacy</Link>
          </span>
        </footer>
      </div>

      {/* The floating feedback FAB is mounted ONCE by the root layout inside the
          shared FloatingStack (G29-C) — a second copy here rendered two FABs on
          top of each other on every workspace page. */}
    </div>
    </PaywallProvider>
  );
}
