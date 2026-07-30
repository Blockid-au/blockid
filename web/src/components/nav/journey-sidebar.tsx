"use client";

/**
 * JourneySidebar — v3 nav layer C (§16.2, §16.6).
 *
 * Renders the persona-scoped, growth-phase-aware sidebar. Consumes:
 *   • persona:            active workspace context (from PersonaRail)
 *   • items:              the leaves for that persona (parent RSC pre-filters
 *                         by item.persona and by entitlement scope)
 *   • currentGrowthPhase: for the §16.3 auto-open rule
 *   • tier / scopes / flags: passed to the v3 §16.4 hide-when-locked gate
 *
 * Zero-JS baseline: every group is a native `<details>` so the sidebar
 * remains keyboard-accessible and screen-reader-friendly even without
 * hydration. `open` is set based on §16.3 auto-open; user toggles are
 * handled by the browser.
 *
 * TESTING NOTE — see persona-rail.tsx header. Pure grouping / auto-open /
 * hide-when-locked logic lives in journey-sidebar-logic.ts +
 * lib/nav/hide-when-locked.ts, both covered by .test.ts.
 */

import Link from "next/link";
import { Lock as LockIcon } from "lucide-react";

import type { NavLeaf } from "@/components/workspace/nav-groups";
import type { Persona } from "@/components/workspace/nav-groups";
import { tierCovers } from "@/lib/entitlements/tier-ladder";
import { filterHideWhenLocked } from "@/lib/nav/hide-when-locked";
import type { GrowthPhase } from "@/lib/nav/workflow-steps";
import type { PlanTier } from "@/lib/segments";

import {
  groupItemsByJourney,
  shouldAutoOpenSection,
} from "./journey-sidebar-logic";

export interface JourneySidebarProps {
  persona: Persona;
  items: NavLeaf[];
  currentGrowthPhase?: GrowthPhase;
  tier: PlanTier;
  scopes: string[];
  flags: Record<string, boolean>;
}

export function JourneySidebar({
  persona,
  items,
  currentGrowthPhase,
  tier,
  scopes,
  flags,
}: JourneySidebarProps): React.JSX.Element {
  // Apply v3 §16.4 hide-when-locked BEFORE grouping so locked default rows
  // drop out entirely and add-on rows survive with _lockedDim.
  const gated = filterHideWhenLocked(items, (item) => {
    const feature = item.feature ?? item.requiredFeature;
    return {
      scopeOk: item.segments
        ? item.segments.some((s) => scopes.includes(s))
        : true,
      tierOk: tierCovers(tier, item.minTier ?? item.minPlan),
      flagOk: feature ? flags[feature] !== false : true,
    };
  });

  const sections = groupItemsByJourney(gated);

  return (
    <nav
      aria-label={`${persona} journey`}
      data-testid="journey-sidebar"
      data-persona={persona}
      className={[
        "flex w-64 flex-col gap-1 border-r border-neutral-200",
        "bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950",
      ].join(" ")}
    >
      {sections.map((section) => {
        const isOpen = shouldAutoOpenSection(section, currentGrowthPhase);
        return (
          <details
            key={section.key}
            open={isOpen}
            data-journey-group={section.key}
            className="group rounded-md"
          >
            <summary
              className={[
                "flex cursor-pointer list-none items-center justify-between",
                "rounded-md px-2 py-1.5 text-xs font-semibold uppercase",
                "tracking-wide text-neutral-500",
                "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                "dark:focus-visible:ring-offset-neutral-950",
              ].join(" ")}
            >
              <span>{section.label}</span>
              <span aria-hidden="true" className="text-neutral-400">
                {isOpen ? "–" : "+"}
              </span>
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const dimmed = "_lockedDim" in item && item._lockedDim === true;
                return (
                  <li key={`${section.key}:${item.href}`}>
                    <Link
                      href={item.href}
                      data-locked-dim={dimmed ? "true" : undefined}
                      aria-disabled={dimmed || undefined}
                      className={[
                        "flex items-center gap-2 rounded-md px-3 py-1.5",
                        "text-sm focus:outline-none focus-visible:ring-2",
                        "focus-visible:ring-blue-600 focus-visible:ring-offset-2",
                        "focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950",
                        dimmed
                          ? "text-neutral-400 hover:bg-neutral-50 dark:text-neutral-600 dark:hover:bg-neutral-900"
                          : "text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800",
                      ].join(" ")}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {dimmed && (
                        <LockIcon
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}
