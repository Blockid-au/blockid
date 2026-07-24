// ExitReadinessTile — RSC that renders the AU comparable-exits panel
// used by /dashboard/exit-readiness (P12b-tile).
//
// Data flows:
//   page.tsx (server) ─▶ buildExitBenchmarkSection({ sector }) ─▶ tile
//
// No client fetch — the pack section is a pure fixture projection so
// hydrating client-side would be wasted. Anchors on the same
// AU_EXIT_DISCLAIMER + AuExitBuyerType typing the CFO valuation pack
// (`cfo-valuation.ts` auExitCheck field) uses, so the messaging stays
// consistent across surfaces.

import type { ExitBenchmarkSection } from "@/lib/investor-pack/exit-benchmark-section";
import {
  BUYER_TYPE_LABEL,
  formatAudCompact,
  formatMultiple,
  orderedBuyerTypeEntries,
} from "./exit-readiness-tile.helpers";

interface ExitReadinessTileProps {
  section: ExitBenchmarkSection;
  projectSector: string | null;
}

export function ExitReadinessTile({ section, projectSector }: ExitReadinessTileProps) {
  const { topExits, summary, disclaimer, usedFallback, sector } = section;
  const shownSector = sector ?? projectSector;
  const buyerTypeEntries = orderedBuyerTypeEntries(summary.byBuyerType);

  return (
    <section
      data-testid="exit-readiness-tile"
      data-used-fallback={usedFallback ? "true" : "false"}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink-800">AU Exit Benchmark</h2>
          <p className="text-sm text-ink-500">
            Publicly-reported Australian tech exits since 2010. Use as an
            anchor when Chapter 12 asks &ldquo;what could this look like at
            exit?&rdquo; — not as a valuation guarantee.
          </p>
        </div>
        {shownSector ? (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 border border-brand-200">
            Sector filter: {shownSector}
            {usedFallback ? " · widened to all sectors" : ""}
          </span>
        ) : (
          <span className="rounded-full bg-ink-50 px-3 py-1 text-xs font-medium text-ink-600 border border-ink-200">
            All sectors
          </span>
        )}
      </header>

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Deals in sample</dt>
          <dd className="mt-1 text-xl font-semibold text-ink-800">
            {summary.count}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Median valuation</dt>
          <dd className="mt-1 text-xl font-semibold text-ink-800">
            {formatAudCompact(summary.medianValuationAud)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Median revenue×</dt>
          <dd className="mt-1 text-xl font-semibold text-ink-800">
            {formatMultiple(summary.medianRevenueMultiple)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Latest deal year</dt>
          <dd className="mt-1 text-xl font-semibold text-ink-800">
            {summary.latestYear ?? "—"}
          </dd>
        </div>
      </dl>

      {buyerTypeEntries.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {buyerTypeEntries.map(([type, count]) => (
            <span
              key={type}
              className="rounded-full border border-border bg-white px-3 py-1 text-xs text-ink-700"
              data-buyer-type={type}
            >
              {BUYER_TYPE_LABEL[type]} · {count}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Buyer</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Valuation (AUD)</th>
              <th className="px-3 py-2">Revenue×</th>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {topExits.map((row) => (
              <tr key={`${row.company}-${row.year}`} className="hover:bg-surface-50">
                <td className="px-3 py-2 font-medium text-ink-800">{row.company}</td>
                <td className="px-3 py-2 text-ink-700">{row.buyer ?? "—"}</td>
                <td className="px-3 py-2 text-ink-700">
                  {BUYER_TYPE_LABEL[row.buyerType]}
                </td>
                <td className="px-3 py-2 text-ink-800">
                  {formatAudCompact(row.valuationAud)}
                </td>
                <td className="px-3 py-2 text-ink-700">
                  {formatMultiple(row.revenueMultiple)}
                </td>
                <td className="px-3 py-2 text-ink-700">{row.year}</td>
                <td className="px-3 py-2">
                  <a
                    className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={row.sourceNote}
                  >
                    link
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink-500">{disclaimer}</p>
    </section>
  );
}
