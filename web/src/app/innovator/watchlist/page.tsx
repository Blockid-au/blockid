// /innovator/watchlist — corporate innovator watchlist (stub).
//
// TODO: backend not ready. When `innovator_watchlist` (user_id, project_id,
// theme, added_at, owner_teammate) lands (see innovator.md § Implementation
// notes), swap the placeholder rows for a live query via
// `resellerSupabase()`-equivalent helper. Empty state guides the user to
// the Industry Map because that is where bulk-add lives.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";

import { RoleNextStep } from "@/components/role/role-next-step";

export const metadata: Metadata = {
  title: "Watchlist — Innovator Console — BlockID",
  robots: { index: false, follow: false },
};

const PLACEHOLDER_COLUMNS = [
  "Startup",
  "Sector",
  "SVI",
  "Δ (7d)",
  "Owner",
  "Added",
];

export default function InnovatorWatchlistPage() {
  return (
    <div className="space-y-6">
      <header data-tour="innovator-watchlist">
        <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <ListChecks className="h-4 w-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Watchlist
          </span>
        </div>
        <h2 className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
          Startups you are tracking
        </h2>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Weekly digest emails will pick up SVI deltas, funding events, and
          cap-table changes from every row here.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500 dark:bg-surface-800">
            <tr>
              {PLACEHOLDER_COLUMNS.map((c) => (
                <th key={c} className="px-4 py-3">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={PLACEHOLDER_COLUMNS.length}
                className="px-4 py-12 text-center text-sm italic text-ink-500"
              >
                No startups tracked yet — open the Industry Map and use the
                <span className="mx-1 rounded bg-surface-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-700 dark:bg-surface-800 dark:text-ink-200">
                  Add all top-decile
                </span>
                bulk action to seed your first 20.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/innovator/industry-map"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Open Industry Map
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        <p className="text-xs text-ink-500">
          Backend TODO — <code className="rounded bg-surface-100 px-1 py-0.5 text-[11px] dark:bg-surface-800">innovator_watchlist</code>{" "}
          table + <code className="rounded bg-surface-100 px-1 py-0.5 text-[11px] dark:bg-surface-800">POST /api/innovator/watchlist</code>{" "}
          route not yet shipped.
        </p>
      </div>

      <RoleNextStep role="innovator" />
    </div>
  );
}
