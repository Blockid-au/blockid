"use client";

/**
 * PersonaRail — v3 nav layer B (§16.2).
 *
 * Vertical rail that switches the whole workspace context between the
 * personas a user carries in their auth claims. Rendered to the LEFT of
 * the JourneySidebar. Auto-hides for single-persona users so the shell
 * collapses cleanly to the legacy one-sidebar layout when there's no
 * choice to make.
 *
 * Accessibility invariants (pinned by persona-rail.test.ts alongside):
 *   • aria-current="page" on the active persona
 *   • roving tabindex (arrow keys navigate, only active item is tabbable)
 *   • Enter/Space activate; ArrowUp/ArrowDown move focus
 *   • Escape collapses (when expanded), Enter/Space expand (when collapsed)
 *   • Focus ring 2px + 2px offset with ≥ 3:1 contrast (Tailwind ring-*)
 *   • Honors prefers-reduced-motion — no transitions when the user opts out
 *
 * TESTING NOTE — the workspace codebase does not ship
 * @testing-library/react (see vitest.config.ts: only .test.ts is picked
 * up; no jsdom / happy-dom in devDependencies). Instead, the pure
 * ordering / hidden / aria helpers are exported and covered by
 * `persona-rail.test.ts`. This mirrors how filterHideWhenLocked is
 * tested — pure logic in a lib helper, no DOM render.
 */

import {
  Rocket,
  TrendingUp,
  GraduationCap,
  Tag,
  Building2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Persona } from "@/components/workspace/nav-groups";

import {
  PERSONA_ICON_KEYS,
  PERSONA_LABELS,
  computeNextPersonaIndex,
  shouldRenderPersonaRail,
} from "./persona-rail-logic";

/** Static lucide-icon lookup — keeps the pure logic file free of React deps. */
const PERSONA_ICONS: Record<Persona, LucideIcon> = {
  founder: Rocket,
  investor: TrendingUp,
  accelerator: GraduationCap,
  reseller: Tag,
  enterprise: Building2,
  admin: ShieldCheck,
};

// Sanity guard — icon map must cover every logic key.
PERSONA_ICON_KEYS.forEach((k) => {
  if (!PERSONA_ICONS[k]) throw new Error(`PERSONA_ICONS missing entry for ${k}`);
});

export interface PersonaRailProps {
  availablePersonas: Persona[];
  activePersona: Persona;
  onSelect(p: Persona): void;
  collapsed?: boolean;
}

export function PersonaRail({
  availablePersonas,
  activePersona,
  onSelect,
  collapsed: collapsedProp,
}: PersonaRailProps): React.JSX.Element | null {
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(
    collapsedProp ?? true,
  );
  const collapsed = collapsedProp ?? internalCollapsed;
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep the external prop in sync when it changes.
  useEffect(() => {
    if (collapsedProp !== undefined) setInternalCollapsed(collapsedProp);
  }, [collapsedProp]);

  const activeIndex = availablePersonas.indexOf(activePersona);

  const handleKeyDown = useCallback(
    (
      event: React.KeyboardEvent<HTMLButtonElement>,
      persona: Persona,
      index: number,
    ) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = computeNextPersonaIndex(
          index,
          availablePersonas.length,
          event.key === "ArrowDown" ? "next" : "prev",
        );
        itemRefs.current[next]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setInternalCollapsed(true);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(persona);
        setInternalCollapsed((c) => !c);
      }
    },
    [availablePersonas, onSelect],
  );

  // Auto-hide when there's nothing to switch between.
  if (!shouldRenderPersonaRail(availablePersonas.length)) return null;

  return (
    <nav
      aria-label="Workspace persona"
      data-testid="persona-rail"
      data-collapsed={collapsed ? "true" : "false"}
      className={[
        "flex flex-col border-r border-neutral-200 bg-neutral-50",
        "dark:border-neutral-800 dark:bg-neutral-950",
        "motion-safe:transition-[width] motion-safe:duration-150",
        collapsed ? "w-14" : "w-[220px]",
      ].join(" ")}
      style={{ width: collapsed ? 56 : 220 }}
    >
      <ul className="flex flex-col gap-1 p-2" role="menu">
        {availablePersonas.map((persona, i) => {
          const Icon = PERSONA_ICONS[persona];
          const isActive = persona === activePersona;
          return (
            <li key={persona} role="none">
              <button
                type="button"
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitemradio"
                aria-checked={isActive}
                aria-current={isActive ? "page" : undefined}
                aria-label={PERSONA_LABELS[persona]}
                tabIndex={i === (activeIndex >= 0 ? activeIndex : 0) ? 0 : -1}
                onClick={() => onSelect(persona)}
                onKeyDown={(e) => handleKeyDown(e, persona, i)}
                className={[
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "focus-visible:ring-blue-600 focus-visible:ring-offset-neutral-50",
                  "dark:focus-visible:ring-offset-neutral-950",
                  isActive
                    ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"
                    : "text-neutral-700 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800",
                ].join(" ")}
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium">
                    {PERSONA_LABELS[persona]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
