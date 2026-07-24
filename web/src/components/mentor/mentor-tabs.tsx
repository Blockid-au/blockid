"use client";

// Segmented-control tab bar for the 5-tab Mentor console shell.
// Uses next/navigation for active-state; theme-aware; keyboard-navigable.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  LayoutDashboard,
  FileText,
  NotebookPen,
  CalendarClock,
  Target,
} from "lucide-react";

interface Props {
  founderId: string;
}

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "reports", label: "SVI & Reports", icon: FileText },
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "checkins", label: "Check-ins", icon: CalendarClock },
  { key: "goals", label: "Goals", icon: Target },
] as const;

export function MentorTabs({ founderId }: Props) {
  const pathname = usePathname();
  const activeKey = useMemo(() => {
    for (const t of TABS) {
      if (pathname?.endsWith(`/${t.key}`)) return t.key;
    }
    return "overview";
  }, [pathname]);

  return (
    <nav
      role="tablist"
      aria-label="Mentor console tabs"
      className="sticky top-16 z-10 flex gap-1 overflow-x-auto border-b border-surface-200 bg-white/95 px-2 py-1 backdrop-blur dark:border-surface-700 dark:bg-surface-900/90"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = activeKey === t.key;
        return (
          <Link
            key={t.key}
            href={`/reseller/mentor/${founderId}/${t.key}`}
            role="tab"
            aria-selected={isActive}
            className={[
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              isActive
                ? "bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
                : "text-ink-600 hover:bg-surface-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-surface-800",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default MentorTabs;
