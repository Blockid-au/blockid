"use client";

// HubTabs — the per-hub tablist (G13-W2-IA2, spec §A.1 "Implementation shape").
//
// Every founder hub (`/workspace/score`, `/workspace/reports`, …) has a
// `layout.tsx` that wraps its subtree in `<HubTabsProvider hub="…">`.
// `WorkspaceLayout` mounts `<HubTabs />` at the top of <main>; it reads the
// provider and renders nothing outside a hub, so the ~90 workspace pages
// that mount the shell themselves need no change to gain tabs.
//
// Accessibility contract (pinned by hub-tabs.test.tsx):
//   • <nav aria-label="<Hub> tabs"> › <div role="tablist"> › <a role="tab">
//   • the active tab (longest-prefix match on the pathname) carries
//     aria-selected="true" + aria-current="page"; only it is in the tab
//     order (roving tabindex), the rest are tabindex=-1
//   • ArrowLeft / ArrowRight / Home / End move focus AND navigate (tabs are
//     links, so the URL is the state — crawlable, bookmarkable)
//   • locked tabs (plan / add-on gate, same helpers as the sidebar) keep
//     their label, add a lock, aria-disabled, title "<Plan> plan unlocks
//     this", link to the billing page with prefetch off

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { useEntitlement } from "@/hooks/useEntitlement";
import { VISIBILITY, type FeatureSlug } from "@/lib/entitlements/tier-visibility";
import { HUBS, activeHubTab, hubTabHref, type HubDef, type HubId, type HubTab as HubTabDef } from "@/lib/nav/hubs";
import { meetsMinPlan, planLabel, type PlanTier } from "@/lib/segments";
import { useLocale, type Locale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

const HubContext = React.createContext<HubDef | null>(null);

/** Mounted by each hub's `layout.tsx`. Server-safe: only wraps children. */
export function HubTabsProvider({ hub, children }: { hub: HubId; children: React.ReactNode }) {
  return <HubContext.Provider value={HUBS[hub]}>{children}</HubContext.Provider>;
}

/** The hub the current subtree belongs to (null outside a hub). */
export function useHub(): HubDef | null {
  return React.useContext(HubContext);
}

export interface ResolvedHubTab {
  tab: HubTabDef;
  href: string;
  /** Plan / add-on gate failed — rendered dimmed with a lock. */
  locked: boolean;
  /** Plan name for "<Plan> plan unlocks this" (null when unlockable only via add-on). */
  lockTier: string | null;
  /** Where a locked tab links: billing page or the add-on drawer. */
  lockedHref: string;
}

interface GateContext {
  planId: string;
  hasFeature: (name: string) => boolean;
}

/**
 * Same gate order as the sidebar (`resolveNavGroup`): minPlan, then
 * lockedWithoutFeature. A missing feature names the plan that grants it via
 * `VISIBILITY[feature].minTier` so the copy always says which plan.
 */
export function resolveHubTabs(hubDef: HubDef, ctx: GateContext): ResolvedHubTab[] {
  return hubDef.tabs.map((tab) => {
    const meetsPlan = tab.minPlan ? meetsMinPlan(ctx.planId, tab.minPlan) : true;
    const missingFeature = Boolean(tab.lockedWithoutFeature && !ctx.hasFeature(tab.lockedWithoutFeature));
    const locked = !meetsPlan || missingFeature;
    let lockTier: string | null = null;
    if (!meetsPlan && tab.minPlan) lockTier = planLabel(tab.minPlan);
    else if (missingFeature) {
      const row = VISIBILITY[tab.lockedWithoutFeature as FeatureSlug];
      lockTier = row ? planLabel(row.minTier as PlanTier) : null;
    }
    const addOnKey = tab.addOnKey ?? (missingFeature ? VISIBILITY[tab.lockedWithoutFeature as FeatureSlug]?.addOnKey : undefined);
    return {
      tab,
      href: hubTabHref(hubDef, tab),
      locked,
      lockTier,
      lockedHref: addOnKey ? `/workspace/billing?openAddon=${addOnKey}` : "/workspace/billing",
    };
  });
}

/** "<Plan> plan unlocks this" — identical wording to the sidebar row tooltip. */
export function lockCopy(lockTier: string | null, locale: Locale): string {
  if (locale === "vi") return lockTier ? `Gói ${lockTier} mở khoá mục này` : "Tiện ích bổ sung mở khoá mục này";
  return lockTier ? `${lockTier} plan unlocks this` : "An add-on unlocks this";
}

/** Roving-focus target for a tablist key press; null for any other key. */
export function nextTabIndex(key: string, from: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (from + 1) % count;
    case "ArrowLeft":
      return (from - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

function tabText(tab: HubTabDef, locale: Locale): string {
  return locale === "vi" && tab.label.vi ? tab.label.vi : tab.label.en;
}

export interface HubTabsProps {
  /** Explicit hub — defaults to the nearest `HubTabsProvider`. */
  hub?: HubId;
  className?: string;
}

export function HubTabs({ hub, className }: HubTabsProps) {
  const fromContext = useHub();
  const hubDef = hub ? HUBS[hub] : fromContext;
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [locale] = useLocale();
  const entitlement = useEntitlement();
  const planId = entitlement.user?.plan ?? "free";
  const can = entitlement.can;
  const listRef = React.useRef<HTMLDivElement>(null);

  const resolved = React.useMemo(
    () => (hubDef ? resolveHubTabs(hubDef, { planId, hasFeature: can }) : []),
    [hubDef, planId, can],
  );

  if (!hubDef) return null;

  const active = activeHubTab(hubDef, pathname);
  // Roving tabindex: the selected tab is focusable; with no match (e.g. a
  // detail route no tab claims) the first tab takes the slot.
  const focusIndex = Math.max(0, resolved.findIndex((r) => r.tab === active));

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('[role="tab"]') ?? []);
    const current = tabs.findIndex((t) => t === document.activeElement);
    const next = nextTabIndex(e.key, current >= 0 ? current : focusIndex, tabs.length);
    if (next === null) return;
    e.preventDefault();
    const target = tabs[next];
    target.focus();
    // Automatic activation (WAI-ARIA tabs pattern): moving focus selects
    // the tab. Tabs are links, so selection = navigation.
    const href = target.getAttribute("href");
    if (href && !target.getAttribute("aria-disabled")) router.push(href);
  };

  const hubLabel = locale === "vi" && hubDef.label.vi ? hubDef.label.vi : hubDef.label.en;

  return (
    <nav aria-label={`${hubLabel} tabs`} data-hub={hubDef.id} className={cn("border-b border-line-subtle bg-surface px-6", className)}>
      <div ref={listRef} role="tablist" aria-orientation="horizontal" onKeyDown={onKeyDown} className="-mb-px flex gap-1 overflow-x-auto">
        {resolved.map((r, i) => {
          const selected = r.tab === active;
          const label = tabText(r.tab, locale);
          const title = r.locked ? lockCopy(r.lockTier, locale) : undefined;
          return (
            <Link
              key={r.href}
              role="tab"
              id={`hub-tab-${hubDef.id}-${r.tab.segment || "root"}`}
              href={r.locked ? r.lockedHref : r.href}
              prefetch={r.locked ? false : undefined}
              aria-selected={selected}
              aria-current={selected ? "page" : undefined}
              aria-disabled={r.locked || undefined}
              tabIndex={i === focusIndex ? 0 : -1}
              title={title}
              data-locked={r.locked ? "1" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action/40",
                selected
                  ? "border-action text-action"
                  : r.locked
                    ? "border-transparent text-tertiary hover:text-secondary"
                    : "border-transparent text-secondary hover:border-line hover:text-primary",
              )}
            >
              {label}
              {r.locked ? <Lock aria-hidden className="h-3 w-3" /> : null}
              {r.locked ? <span className="sr-only">{title}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
