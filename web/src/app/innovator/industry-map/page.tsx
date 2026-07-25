// /innovator/industry-map — SVI leaderboard by ANZSIC sector (stub).
//
// Reuses the public dataset aggregates as read-only source until a private
// per-tenant filter lands. The tour anchor `innovator-industry-map` matches
// the `innovator-first-run` FeatureSpotlight step.
//
// TODO: swap `getSectorAggregates()` for a per-thesis pinned view once
// `innovator_theses` is wired.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";

import { RoleNextStep } from "@/components/role/role-next-step";
import {
  getSectorAggregates,
  type SectorRow,
} from "@/lib/svi-index-aggregates";

export const metadata: Metadata = {
  title: "Industry Map — Innovator Console — BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function safeSectors(): Promise<SectorRow[]> {
  return getSectorAggregates().catch(() => [] as SectorRow[]);
}

export default async function InnovatorIndustryMapPage() {
  const sectors = await safeSectors();
  const top = sectors.slice(0, 12);

  return (
    <div className="space-y-6">
      <header data-tour="innovator-industry-map">
        <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <Radar className="h-4 w-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Industry Map
          </span>
        </div>
        <h2 className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
          SVI leaderboard by sector
        </h2>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Pin the 3 sectors that match your thesis and save the view.
          Bulk-add the top-decile of each pinned sector to your watchlist.
        </p>
      </header>

      {top.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-300 bg-white p-8 text-center text-sm italic text-ink-500 dark:border-surface-700 dark:bg-surface-900">
          Sector aggregates are being warmed. Refresh in a minute, or open{" "}
          <Link className="text-brand-700 underline" href="/dataset">
            /dataset
          </Link>{" "}
          for the raw index.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500 dark:bg-surface-800">
              <tr>
                <th className="px-4 py-3">Sector</th>
                <th className="px-4 py-3">n</th>
                <th className="px-4 py-3">P25 SVI</th>
                <th className="px-4 py-3">Median SVI</th>
                <th className="px-4 py-3">P75 SVI</th>
                <th className="px-4 py-3 text-right">Pin</th>
              </tr>
            </thead>
            <tbody>
              {top.map((s) => (
                <tr
                  key={s.sector}
                  className="border-t border-surface-100 dark:border-surface-800"
                >
                  <td className="px-4 py-2 font-medium text-ink-900 dark:text-ink-100">
                    {s.sector}
                  </td>
                  <td className="px-4 py-2 text-ink-500">{s.count}</td>
                  <td className="px-4 py-2 tabular-nums text-ink-700 dark:text-ink-200">
                    {s.p25?.toFixed(1) ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-ink-700 dark:text-ink-200">
                    {s.medianSvi?.toFixed(1) ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-ink-700 dark:text-ink-200">
                    {s.p75?.toFixed(1) ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled
                      title="Pinning arrives with innovator_theses backend"
                      className="rounded-md border border-surface-300 bg-surface-50 px-2 py-1 text-[11px] font-semibold text-ink-400 dark:border-surface-700 dark:bg-surface-800"
                    >
                      Pin (TODO)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/innovator/watchlist"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Open watchlist
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        <p className="text-xs text-ink-500">
          Bulk-add + weekly-digest hooks wired once{" "}
          <code className="rounded bg-surface-100 px-1 py-0.5 text-[11px] dark:bg-surface-800">
            innovator_watchlist
          </code>{" "}
          table ships.
        </p>
      </div>

      <RoleNextStep role="innovator" variant="inline" />
    </div>
  );
}
