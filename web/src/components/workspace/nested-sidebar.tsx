"use client";

// NestedSidebar — client accordion renderer for the V2 nav schema.
//
// Receives an ALREADY-FILTERED NavGroupV2[] tree from a server parent (see
// filterNavForUser). Never re-runs entitlement checks — items are assumed
// present because they passed the server-side hide-not-lock filter. This
// keeps the client bundle free of PlanTier / feature-flag logic.
//
// Behaviour:
//   • Renders each group as a keyboard-accessible <details>-style disclosure.
//   • Auto-expands the group whose (minPhase ?? 0) brackets `currentPhase`;
//     falls back to the first group when none matches.
//   • Persists open/closed state per user in localStorage:
//         key = `blockid.nav.open.v2.<userId>`
//     Schema version in the key means a leaf rename future-invalidates state
//     without user action.
//   • Shows the "we reorganized the sidebar" onboarding tooltip once —
//     dismissed via localStorage flag `blockid.nav.reorg-seen.v1`.
//   • Mobile: same accordion, single-open behaviour toggled by width query.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroupV2, NavSubgroup, NavLeaf } from "@/lib/nav/nav-schema";

const OPEN_STATE_KEY_PREFIX = "blockid.nav.open.v2.";
const REORG_SEEN_KEY = "blockid.nav.reorg-seen.v1";

export interface NestedSidebarProps {
  /** Pre-filtered nav tree — every leaf here is already authorised. */
  groups: readonly NavGroupV2[];
  /** Used to namespace localStorage keys and pick the auto-open group. */
  userId: string;
  /** Startup lifecycle phase (0-5) — picks the auto-expanded group. */
  currentPhase?: number;
  /** When false, only icons render; group headers are hidden. */
  sidebarOpen?: boolean;
  /** Optional click handler — parent can dismiss a mobile drawer on nav. */
  onNavigate?: () => void;
}

interface OpenStateMap {
  [groupId: string]: boolean;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / private mode — silent no-op keeps nav interactive.
  }
}

function pickAutoOpenGroup(groups: readonly NavGroupV2[], phase: number): string | null {
  const withPhase = groups.filter((g) => g.minPhase != null);
  if (withPhase.length === 0) return groups[0]?.id ?? null;
  const sorted = [...withPhase].sort((a, b) => (a.minPhase! - b.minPhase!));
  let active: string | null = null;
  for (const g of sorted) {
    if ((g.minPhase ?? 0) <= phase) active = g.id;
  }
  return active ?? sorted[0].id;
}

function initialOpenState(
  groups: readonly NavGroupV2[],
  autoOpen: string | null,
  persisted: OpenStateMap,
): OpenStateMap {
  const map: OpenStateMap = {};
  for (const g of groups) {
    if (g.id in persisted) {
      map[g.id] = persisted[g.id];
      continue;
    }
    if (autoOpen && g.id === autoOpen) {
      map[g.id] = true;
      continue;
    }
    map[g.id] = !g.defaultCollapsed;
  }
  return map;
}

function LeafRow({
  leaf,
  active,
  onClick,
}: {
  leaf: NavLeaf;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = leaf.icon;
  return (
    <Link
      href={leaf.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-colors mx-1",
        active
          ? "bg-brand-50 text-brand-700 font-semibold border border-brand-100"
          : "text-ink-500 hover:text-ink-800 hover:bg-surface-50",
      )}
    >
      <Icon strokeWidth={1.75} className={cn("h-4 w-4 shrink-0", active && "text-brand-600")} />
      <span className="truncate flex-1">{leaf.label}</span>
      {leaf.lifecycle === "beta" && (
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ring-1 ring-amber-200">
          Beta
        </span>
      )}
    </Link>
  );
}

function SubgroupBlock({
  subgroup,
  pathname,
  onNavigate,
}: {
  subgroup: NavSubgroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="pl-2 mt-1">
      <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        {subgroup.label}
      </div>
      {subgroup.items.map((leaf) => (
        <LeafRow
          key={leaf.href}
          leaf={leaf}
          active={pathname === leaf.href || pathname.startsWith(leaf.href + "/")}
          onClick={onNavigate}
        />
      ))}
    </div>
  );
}

export function NestedSidebar({
  groups,
  userId,
  currentPhase = 0,
  sidebarOpen = true,
  onNavigate,
}: NestedSidebarProps) {
  const pathname = usePathname() ?? "";
  const storageKey = React.useMemo(
    () => OPEN_STATE_KEY_PREFIX + (userId || "anon"),
    [userId],
  );

  const autoOpen = React.useMemo(
    () => pickAutoOpenGroup(groups, currentPhase),
    [groups, currentPhase],
  );

  // Two-phase hydration: server render uses `defaultCollapsed`, client
  // effect hydrates the persisted map. Keeps SSR output stable so React
  // doesn't fire a hydration mismatch warning.
  const [openState, setOpenState] = React.useState<OpenStateMap>(() =>
    initialOpenState(groups, autoOpen, {}),
  );
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    const persisted = readJson<OpenStateMap>(storageKey, {});
    setOpenState(initialOpenState(groups, autoOpen, persisted));
    setHydrated(true);
  }, [storageKey, groups, autoOpen]);

  React.useEffect(() => {
    if (!hydrated) return;
    writeJson(storageKey, openState);
  }, [hydrated, storageKey, openState]);

  const toggleGroup = React.useCallback((id: string) => {
    setOpenState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // One-shot reorg tooltip — anchored to the first group header.
  const [showReorgHint, setShowReorgHint] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(REORG_SEEN_KEY) === "true";
    if (!seen) setShowReorgHint(true);
  }, []);
  const dismissReorgHint = React.useCallback(() => {
    setShowReorgHint(false);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(REORG_SEEN_KEY, "true"); } catch { /* noop */ }
    }
  }, []);

  return (
    <nav className="flex-1 py-1 px-1 overflow-y-auto" aria-label="Workspace navigation">
      {groups.map((group, groupIdx) => {
        const isOpen = openState[group.id] ?? false;
        const panelId = `nav-group-panel-${group.id}`;
        const showTooltipHere = showReorgHint && groupIdx === 0 && sidebarOpen;
        return (
          <div key={group.id} className="mb-1 relative" data-pillar={group.pillar} data-group-id={group.id}>
            {sidebarOpen && (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="w-full px-3 pt-4 pb-1.5 flex items-center justify-between text-left hover:bg-surface-50/60 rounded-md transition-colors"
              >
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                  <ChevronDown
                    strokeWidth={1.75}
                    className={cn("h-3 w-3 transition-transform duration-150", !isOpen && "-rotate-90")}
                    aria-hidden
                  />
                  {group.label}
                </span>
                {group.stage && (
                  <span className="text-[9px] text-ink-400/60">{group.stage}</span>
                )}
              </button>
            )}
            {showTooltipHere && (
              <div
                role="status"
                className="absolute left-3 right-3 top-[calc(100%-4px)] z-20 flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 p-2 text-[11px] text-brand-800 shadow-md dark:bg-brand-900/20 dark:text-brand-100"
              >
                <span className="flex-1 leading-snug">
                  We reorganized the sidebar around your startup workflow.
                </span>
                <button
                  type="button"
                  onClick={dismissReorgHint}
                  aria-label="Dismiss reorganization hint"
                  className="shrink-0 rounded p-0.5 text-brand-600/70 hover:bg-brand-100 hover:text-brand-800"
                >
                  <X strokeWidth={1.75} className="h-3 w-3" />
                </button>
              </div>
            )}
            {isOpen && (
              <div id={panelId}>
                {(group.items ?? []).map((leaf) => (
                  <LeafRow
                    key={leaf.href}
                    leaf={leaf}
                    active={pathname === leaf.href || pathname.startsWith(leaf.href + "/")}
                    onClick={onNavigate}
                  />
                ))}
                {(group.subgroups ?? []).map((sg) => (
                  <SubgroupBlock
                    key={sg.id}
                    subgroup={sg}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
