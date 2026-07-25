// Corporate Innovator console layout — top-level, sibling to /reseller.
//
// Minimal shell (matches the reseller pattern) — a dedicated feature-gate
// (`innovator.console`) + branded chrome will land in a follow-up phase once
// the entitlement is registered in `web/src/lib/entitlements.ts`. Until then
// the console is auth-gated only, so preview seats can walk through the tour.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { Compass } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  children: ReactNode;
}

const NAV: Array<{ href: string; label: string }> = [
  { href: "/innovator", label: "Overview" },
  { href: "/innovator/industry-map", label: "Industry Map" },
  { href: "/innovator/watchlist", label: "Watchlist" },
  { href: "/innovator/deal-pipeline", label: "Deal Pipeline" },
];

export default async function InnovatorLayout({ children }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/innovator");
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
            <Compass className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Innovator Console
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">
            Corporate scouting for AU startups
          </h1>
          <nav className="mt-4 flex flex-wrap gap-1" aria-label="Innovator sections">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-100 dark:text-ink-200 dark:hover:bg-surface-800"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
