"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown, ChevronLeft, ChevronRight, Home, LayoutDashboard, Lock, PlayCircle, Sparkles, X,
} from "lucide-react";
// PHASE_LABELS backs tooltip copy on dimmed sidebar rows — the user sees
// exactly which canonical phase must be reached before a group unlocks
// (see ux-ia-startup-flow-goal.md §C.5 — P5 progressive-disclosure).
import { PHASE_LABELS } from "@/lib/showcase/gallery";
// Role → menu overlay (hidden groups + injected groups + extra top-nav
// CTAs). Extracted to a helper so other surfaces can reuse the same source
// of truth. See ux-ia-startup-flow-goal.md §C.6 — P6.
import { getMenuOverlayForRole } from "@/lib/nav/role-menu-overlay";
import { Logo } from "@/components/brand/logo";
import { CreditBalance } from "@/components/ui/credit-balance";
import { CreditBadge } from "@/components/workspace/credit-badge";
import { ProjectSwitcher } from "@/components/ui/project-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { FeedbackWidget } from "@/components/ui/feedback-widget";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TrialBanner } from "@/components/workspace/trial-banner";
import { ProductTour } from "@/components/workspace/product-tour";
import { FeatureSpotlight } from "@/components/product-tour/feature-spotlight";
import { ResellerPill } from "@/components/workspace/reseller-pill";
import { SandboxBanner } from "@/components/workspace/sandbox-banner";
import { TrialDayWatcher } from "@/components/upsell/trial-day-watcher";
import { UpgradeModal } from "@/components/upsell/upgrade-modal";
import { UpgradeBanner } from "@/components/upsell/upgrade-banner";
import { NAV_GROUPS, ADMIN_NAV_GROUP, type NavGroup, type NavItem } from "@/components/workspace/nav-groups";
import { useEntitlement } from "@/hooks/useEntitlement";
import { meetsMinPlan, type Segment } from "@/lib/segments";
import { cn } from "@/lib/utils";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  user: {
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    role?: string;
  };
  startupName?: string;
  notificationCount?: number;
  /** Current startup phase (0-5). Controls which sidebar groups are highlighted vs dimmed. */
  currentPhase?: number;
  /**
   * True when the active project has `reseller_sandbox_id` set. Server parents
   * resolve this via `getCurrentProjectIsSandbox()` in `@/lib/projects`. When
   * true, the `SandboxBanner` renders above `TrialBanner` per CLO D4-CLO-06.
   */
  isSandbox?: boolean;
}

/**
 * Feature lifecycle — controls the chip shown beside the nav label.
 *
 *   beta   — actively iterating, may break. Default for anything shipped <2 weeks ago.
 *   live   — running stably for 2+ weeks, no open critical issues.
 *   stable — battle-tested over 30+ days, no chip shown (default state).
 *
 * Nav-item + nav-group types now live in `./nav-groups.ts` so other surfaces
 * (mobile nav, command palette) can import from a single source of truth.
 */
const LIFECYCLE_CHIP: Record<"beta" | "live", string> = {
  beta: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  live: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
};

// Result of running a NavItem through the visibility + gating pipeline.
//   visible=false  → drop entirely (wrong audience, or feature flag missing).
//   locked=true    → render but grayed-out with a lock icon + Upgrade tooltip.
type ResolvedItem = { item: NavItem; locked: boolean };

const UNLOCK_PULSE_KEY = "blockid_unlock_pulse_dismissed";

/**
 * One-time dismissible pulse shown to free-tier workspace users the first time
 * they land here. Persists dismissal in localStorage so it never comes back.
 * Uses `useSyncExternalStore` so SSR and CSR agree on initial state without a
 * useEffect+setState flip.
 */
function UnlockPulseCard({ planId }: { planId: string }) {
  const dismissed = React.useSyncExternalStore(
    () => () => {},
    () => (typeof window !== "undefined" ? localStorage.getItem(UNLOCK_PULSE_KEY) === "true" : true),
    () => true,
  );
  const [hidden, setHidden] = React.useState(false);
  if (planId !== "free" && planId !== "founder_free") return null;
  if (dismissed || hidden) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(UNLOCK_PULSE_KEY, "true");
    }
    setHidden(true);
  };

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800 dark:bg-brand-900/20 dark:text-brand-100">
      <Sparkles strokeWidth={1.75} className="h-4 w-4 shrink-0 text-brand-600" />
      <p className="flex-1 leading-snug">
        You are on the Free plan. Upgrade to Founder to unlock 6 more tools —
        Cap Table, ESOP Setup, Data Room, Fundraise Readiness, and more.
      </p>
      <Link
        href="/pricing"
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        See plans
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss unlock pulse"
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-brand-600/70 hover:bg-brand-100 hover:text-brand-800 transition-colors cursor-pointer"
      >
        <X strokeWidth={1.75} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function resolveGroup(
  group: NavGroup,
  ctx: {
    planId: string;
    segment: Segment | null;
    hasFeature: (name: string) => boolean;
  },
): ResolvedItem[] {
  // Group-level segment filter — hide the whole group for wrong audiences.
  if (group.segments && group.segments.length > 0) {
    if (!ctx.segment || !group.segments.includes(ctx.segment)) return [];
  }

  const resolved: ResolvedItem[] = [];
  for (const item of group.items) {
    // (c) segments — wrong-audience items are FULLY hidden.
    if (item.segments && item.segments.length > 0) {
      if (!ctx.segment || !item.segments.includes(ctx.segment)) continue;
    }
    // (d) feature flag — treat as hidden when the entitlement is missing.
    if (item.feature && !ctx.hasFeature(item.feature)) continue;

    // (b) minPlan — under-plan renders locked (upgrade opportunity).
    const meetsPlan = item.minPlan ? meetsMinPlan(ctx.planId, item.minPlan) : true;
    resolved.push({ item, locked: !meetsPlan });
  }
  return resolved;
}

/**
 * Render a single NAV_GROUPS entry. Extracted so both the near-phase list
 * and the "Later phases" expander can render groups identically. When a
 * group is a future-phase, every item shows a lock glyph and its `title`
 * attribute tells the user which canonical phase unlocks it (§C.5 P5).
 */
function renderNavGroup(args: {
  group: NavGroup;
  currentPhase: number;
  sidebarOpen: boolean;
  planId: string;
  segment: Segment | null;
  entitlement: ReturnType<typeof useEntitlement>;
  pathname: string;
  setMobileOpen: (v: boolean) => void;
}): React.ReactNode {
  const { group, currentPhase, sidebarOpen, planId, segment, entitlement, pathname, setMobileOpen } = args;
  const isFuturePhase = group.minPhase != null && group.minPhase > currentPhase;
  const resolvedItems = resolveGroup(group, { planId, segment, hasFeature: entitlement.can });
  if (resolvedItems.length === 0) return null;

  // Human-readable "unlocks at" copy for tooltips on dimmed rows. When
  // `minPhase` maps into PHASE_LABELS (1..12) we pull the canonical name,
  // otherwise we fall back to the group's own stage/label.
  const unlockPhase = group.minPhase ?? null;
  const unlockLabel = unlockPhase != null && PHASE_LABELS[unlockPhase]
    ? PHASE_LABELS[unlockPhase].en
    : (group.stage ?? group.label);
  const futureTitle = isFuturePhase && unlockPhase != null
    ? `Unlocks after Phase ${unlockPhase}: ${unlockLabel}`
    : undefined;

  return (
    <div key={group.label} className="mb-1">
      {/* Group header */}
      {sidebarOpen && (
        <div
          className="px-3 pt-4 pb-1.5 flex items-center justify-between"
          title={futureTitle}
        >
          <span className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", isFuturePhase ? "text-ink-300" : "text-ink-400")}>{group.label}</span>
          {group.stage && (
            <span className={cn(
              "text-[9px]",
              isFuturePhase
                ? "px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-700 ring-1 ring-amber-200"
                : "text-ink-400/60",
            )}>
              {isFuturePhase ? "Locked" : group.stage}
            </span>
          )}
        </div>
      )}
      {/* Group items */}
      {resolvedItems.map(({ item, locked }) => {
        const { href, label, icon: Icon, lifecycle, addOnKey } = item;
        const active = pathname === href || pathname.startsWith(href + "/");
        const chipKind = lifecycle === "stable" ? undefined : lifecycle;
        const lockedHref = addOnKey
          ? `/workspace/billing?openAddon=${addOnKey}`
          : "/workspace/billing";
        const showAddOnPill = locked && Boolean(addOnKey) && sidebarOpen;
        // Row-level tooltip: locked (plan) > future-phase > add-on.
        const rowTitle = locked
          ? (addOnKey ? "Add-on — click to purchase" : "Upgrade required — click to view plans")
          : futureTitle;
        return (
          <Link
            key={href}
            href={locked ? lockedHref : href}
            onClick={() => setMobileOpen(false)}
            aria-disabled={locked || undefined}
            title={rowTitle}
            className={cn(
              "flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-all duration-150 mx-1",
              active
                ? "bg-brand-50 text-brand-700 font-semibold shadow-sm border border-brand-100"
                : locked
                  ? "text-ink-300 hover:text-ink-500 hover:bg-surface-50/50 opacity-70"
                  : isFuturePhase
                    ? "text-ink-300 hover:text-ink-500 hover:bg-surface-50/50 opacity-60"
                    : "text-ink-500 hover:text-ink-800 hover:bg-surface-50",
            )}
          >
            <Icon strokeWidth={1.75} className={cn("h-4 w-4 shrink-0", active ? "text-brand-600" : (locked || isFuturePhase) ? "text-ink-300" : "")} />
            {sidebarOpen && (
              <>
                <span className="truncate flex-1">{label}</span>
                {showAddOnPill && (
                  <span className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                    Add-on
                  </span>
                )}
                {locked && !showAddOnPill && (
                  <Lock strokeWidth={1.75} className="h-3 w-3 shrink-0 text-ink-400" aria-label="Upgrade required" />
                )}
                {/* Future-phase lock glyph — visually mirrors the plan-lock
                    icon so users learn one iconography for "not available
                    yet". Kept aria-hidden because the row's `title` already
                    announces "Unlocks after Phase N …" to AT users. */}
                {!locked && isFuturePhase && (
                  <Lock strokeWidth={1.75} className="h-3 w-3 shrink-0 text-ink-300" aria-hidden />
                )}
                {chipKind && (
                  <span className={cn(
                    "text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                    LIFECYCLE_CHIP[chipKind],
                  )}>
                    {chipKind}
                  </span>
                )}
              </>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function WorkspaceLayout({ children, user, startupName, currentPhase = 0, isSandbox = false }: Omit<WorkspaceLayoutProps, "notificationCount">) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isAdmin = user.role === "admin";

  const entitlement = useEntitlement();
  const planId = entitlement.user?.plan ?? "free";
  const segment = (entitlement.user?.segment as Segment | undefined) ?? null;

  // Base catalogue (+ admin group when the account is admin), then apply
  // the role overlay so hidden groups drop and ordering respects the role's
  // priority list. Segment gating inside `resolveGroup()` still runs.
  const baseGroups = isAdmin ? [...NAV_GROUPS, ADMIN_NAV_GROUP] : NAV_GROUPS;
  const overlay = getMenuOverlayForRole({
    role: user.role ?? null,
    segment: segment ?? null,
    accountType: (entitlement.user as { accountType?: string } | null | undefined)?.accountType ?? null,
  });
  const orderedGroups = React.useMemo(() => {
    const hidden = new Set(overlay.hiddenGroups);
    const kept = baseGroups.filter((g) => !hidden.has(g.label));
    if (overlay.sidebarOrder.length === 0) return kept;
    const rank = new Map<string, number>();
    overlay.sidebarOrder.forEach((label, i) => rank.set(label, i));
    return [...kept].sort((a, b) => {
      const ra = rank.has(a.label) ? rank.get(a.label)! : Number.POSITIVE_INFINITY;
      const rb = rank.has(b.label) ? rank.get(b.label)! : Number.POSITIVE_INFINITY;
      return ra - rb;
    });
  }, [baseGroups, overlay]);
  // Split "way-in-the-future" groups (minPhase > currentPhase + 3) out of
  // the main render pass — the sidebar collapses them under a single
  // "Later phases" expander so a phase-0 founder doesn't scroll past 4
  // greyed-out clusters. See §C.5 P5.
  const laterPhaseThreshold = currentPhase + 3;
  const nearGroups = orderedGroups.filter(
    (g) => g.minPhase == null || g.minPhase <= laterPhaseThreshold,
  );
  const laterGroups = orderedGroups.filter(
    (g) => g.minPhase != null && g.minPhase > laterPhaseThreshold,
  );
  const [laterOpen, setLaterOpen] = React.useState(false);

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800 dark:bg-surface-50 dark:text-ink-800 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col border-r border-surface-200/80 bg-white dark:bg-surface-100 transition-all duration-200",
        "lg:relative lg:flex",
        mobileOpen ? "flex" : "hidden lg:flex",
        sidebarOpen ? "w-56" : "w-14",
      )}>
        {/* Sidebar header */}
        <div className={cn(
          "flex items-center border-b border-surface-200 h-14 px-3 shrink-0",
          sidebarOpen ? "justify-between" : "justify-center",
        )}>
          {sidebarOpen ? <Logo variant="light" /> : null}
          <button
            type="button"
            onClick={() => { setSidebarOpen(v => !v); setMobileOpen(false); }}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer shrink-0"
          >
            {sidebarOpen ? <ChevronLeft strokeWidth={1.75} className="h-4 w-4" /> : <ChevronRight strokeWidth={1.75} className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-1 px-1 overflow-y-auto" aria-label="Workspace navigation">
          {nearGroups.map((group) =>
            renderNavGroup({
              group,
              currentPhase,
              sidebarOpen,
              planId,
              segment,
              entitlement,
              pathname,
              setMobileOpen,
            }),
          )}
          {sidebarOpen && laterGroups.length > 0 && (() => {
            // Count *visible* items after resolve() so the count reflects
            // what the user would actually see — hidden segment items
            // shouldn't inflate the "unlocks 12 more" copy.
            const resolvedLater = laterGroups.map((g) => ({
              group: g,
              items: resolveGroup(g, { planId, segment, hasFeature: entitlement.can }),
            })).filter((r) => r.items.length > 0);
            const itemCount = resolvedLater.reduce((n, r) => n + r.items.length, 0);
            if (resolvedLater.length === 0) return null;
            // Build a tooltip listing which phases collapse under the
            // expander, so the user can preview what unlocks without
            // needing to open it (hover-only hint).
            const phaseHint = resolvedLater
              .map((r) => {
                const p = r.group.minPhase!;
                const label = PHASE_LABELS[p];
                return `Phase ${p}: ${label?.en ?? r.group.label}`;
              })
              .join("\n");
            return (
              <div className="mb-1 mt-3 border-t border-surface-100 pt-2">
                <button
                  type="button"
                  onClick={() => setLaterOpen((v) => !v)}
                  aria-expanded={laterOpen}
                  aria-controls="later-phases-panel"
                  title={`Unlocks after your current phase:\n${phaseHint}`}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400 hover:text-ink-600 hover:bg-surface-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Lock strokeWidth={1.75} className="h-3 w-3 text-ink-300" aria-hidden />
                    Later phases ({itemCount})
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
                        currentPhase,
                        sidebarOpen,
                        planId,
                        segment,
                        entitlement,
                        pathname,
                        setMobileOpen,
                      }),
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </nav>

        {/* Bottom: credit badge + home link */}
        <div className="px-2 pb-3 border-t border-surface-200 pt-3 space-y-2">
          {sidebarOpen && <div className="px-1"><CreditBadge /></div>}
          <Link href="/" className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors">
            <Home strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>Back to Home</span>}
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-surface-200/60 bg-white/90 dark:bg-surface-100/90 backdrop-blur-sm px-4 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(v => !v)}
              className="lg:hidden h-10 w-10 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
            >
              <LayoutDashboard strokeWidth={1.75} className="h-4 w-4" />
            </button>
            <ProjectSwitcher />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* ux-ia-startup-flow-v1 §C.3 + §C.7 — global Demo entry, always
                visible from every workspace page so a founder can re-watch
                the walkthrough at any point in their journey. */}
            <Link
              href="/showcase/atlassian?step=1"
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-ink-600 hover:text-ink-900 hover:bg-surface-100 transition-colors"
              title="Watch the Atlassian journey walkthrough"
            >
              <PlayCircle strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" />
              <span>Demo</span>
              <span className="hidden md:inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                Live
              </span>
            </Link>

            {/* Role-scoped extras — surfaces the console / admin link for
                reseller + admin without duplicating the sidebar Reseller
                group. See role-menu-overlay.ts. */}
            {overlay.topNavExtras.map((extra) => (
              <Link
                key={extra.href}
                href={extra.href}
                aria-label={extra.ariaLabel ?? extra.label}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-ink-600 hover:text-ink-900 hover:bg-surface-100 transition-colors"
              >
                <span>{extra.label}</span>
                {extra.badge && (
                  <span className="hidden md:inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    {extra.badge}
                  </span>
                )}
              </Link>
            ))}

            {/* Reseller co-branding pill (renders null when no attribution) */}
            <ResellerPill />

            {/* Wallet connect (auto-adds/switches to the BlockID chain) */}
            <ConnectWalletButton compact />

            {/* Credit balance */}
            <CreditBalance />

            {/* Dark mode toggle */}
            <ThemeToggle />

            {/* Notifications */}
            <NotificationBell />

            {/* Avatar */}
            <div className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-100 transition-colors cursor-pointer">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full ring-2 ring-brand-100" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-brand-100">
                  {(user.displayName ?? user.email)[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-ink-700 hidden sm:block max-w-[140px] truncate">{user.displayName ?? user.email}</span>
            </div>

            {/* Sign out */}
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="h-8 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer">
                <span className="hidden sm:inline">Sign out</span>
                <span className="sm:hidden">Out</span>
              </button>
            </form>
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

        {/* Track B B7 — interactive product tour; hides after per-phase dismissal. */}
        <ProductTour />

        {/* Product Tour v2 — per-feature spotlight; matched to route via registry. */}
        <FeatureSpotlight />

        {/* Founding 50 upgrade nudge — shown when user has 1 free credit left */}
        <UpgradePrompt />

        {/* First-visit unlock pulse for free-tier users. Dismissible + persistent. */}
        <UnlockPulseCard planId={planId} />

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Floating feedback FAB */}
      <FeedbackWidget page={pathname} />
    </div>
  );
}
