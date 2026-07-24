// MarketSizeTile — RSC that renders the AU market-size (TAM / SAM / SOM)
// panel for /dashboard/market-size (P3c).
//
// Data flows:
//   page.tsx (server) ─▶ estimateTamSamSom({ keyword | anzsic }) ─▶ tile
//
// No client fetch — the ABS / IBISWorld lookup is a pure fixture
// projection so hydrating client-side would be wasted. Anchors on the
// AU_MARKET_LOOKUP_DISCLAIMER travelling with every result so the tile
// cannot leak the anchor without the ABS-provenance hedge (s766B Corps
// Act guard applied at source in the pure module).

import type {
  AuIndustrySnapshot,
  TamSamSomResult,
} from "@/lib/market/au-market-lookup";
import { ANZSIC_DIVISIONS } from "@/lib/market/au-market-lookup";
import {
  formatAudCompact,
  formatBusinessCount,
  formatCagrPct,
  formatFractionPct,
  pickPrimarySource,
} from "./market-size-tile.helpers";

interface MarketSizeTileProps {
  /** Pure lookup result — null when the founder has no matched industry yet. */
  result: TamSamSomResult | null;
  /** Sibling suggestions to help a founder pivot to a related ANZSIC class. */
  suggestions: AuIndustrySnapshot[];
  /** Raw keyword the caller looked up (for the empty-state message). */
  keyword: string | null;
}

export function MarketSizeTile({
  result,
  suggestions,
  keyword,
}: MarketSizeTileProps) {
  if (!result) {
    return (
      <section
        data-testid="market-size-tile"
        data-empty="true"
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-ink-800">AU Market Size</h2>
          <p className="text-sm text-ink-500">
            No ANZSIC snapshot on file for{" "}
            {keyword ? (
              <span className="font-medium text-ink-700">
                &ldquo;{keyword}&rdquo;
              </span>
            ) : (
              "your project"
            )}
            . Set the industry on your project profile, or search directly at{" "}
            <code className="rounded bg-surface-50 px-1 text-xs">
              /api/abs/lookup?keyword=…
            </code>
            .
          </p>
        </header>
      </section>
    );
  }

  const { industry, tamAud, samAud, somAud, addressablePct, targetSharePct } =
    result;
  const primarySource = pickPrimarySource(industry);

  return (
    <section
      data-testid="market-size-tile"
      data-anzsic={industry.anzsicCode}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink-800">AU Market Size</h2>
          <p className="text-sm text-ink-500">
            Chapter 3 anchor for total addressable, serviceable, and obtainable
            market. Use the numbers as a defensible starting point — refine
            with primary research before quoting to investors.
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 border border-brand-200">
          {industry.anzsicCode} · Division {industry.division}
        </span>
      </header>

      <p className="mb-4 text-sm text-ink-700">
        <span className="font-medium text-ink-800">{industry.label}</span>{" "}
        <span className="text-ink-500">
          — {ANZSIC_DIVISIONS[industry.division]}
        </span>
      </p>

      <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-50 p-3">
          <dt className="text-xs font-medium text-ink-500">
            TAM · Total addressable
          </dt>
          <dd className="mt-1 text-xl font-semibold text-ink-800">
            {formatAudCompact(tamAud)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-50 p-3">
          <dt className="text-xs font-medium text-ink-500">
            SAM · Serviceable ({formatFractionPct(addressablePct)} of TAM)
          </dt>
          <dd className="mt-1 text-xl font-semibold text-ink-800">
            {formatAudCompact(samAud)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-50 p-3">
          <dt className="text-xs font-medium text-ink-500">
            SOM · Obtainable ({formatFractionPct(targetSharePct)} of SAM)
          </dt>
          <dd className="mt-1 text-xl font-semibold text-ink-800">
            {formatAudCompact(somAud)}
          </dd>
        </div>
      </dl>

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-white p-3">
          <dt className="text-xs font-medium text-ink-500">Trailing 5-yr CAGR</dt>
          <dd className="mt-1 text-base font-semibold text-ink-800">
            {formatCagrPct(industry.cagr)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-white p-3">
          <dt className="text-xs font-medium text-ink-500">
            AU businesses (ABS 8165.0)
          </dt>
          <dd className="mt-1 text-base font-semibold text-ink-800">
            {formatBusinessCount(industry.businessCount)}
          </dd>
        </div>
        {primarySource && (
          <div className="rounded-lg border border-border bg-white p-3">
            <dt className="text-xs font-medium text-ink-500">Verify at source</dt>
            <dd className="mt-1 text-sm">
              <a
                className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
                href={primarySource.url}
                target="_blank"
                rel="noopener noreferrer"
                title={primarySource.label}
              >
                Open ↗
              </a>
            </dd>
          </div>
        )}
      </dl>

      {industry.notes && (
        <p className="mb-4 text-xs text-ink-500">
          <span className="font-medium text-ink-600">Note:</span>{" "}
          {industry.notes}
        </p>
      )}

      {suggestions.length > 0 && (
        <div
          data-testid="market-size-suggestions"
          className="mb-4 rounded-lg border border-dashed border-border bg-surface-50 p-3"
        >
          <p className="mb-2 text-xs font-medium text-ink-500">
            Meant a sibling market? Try:
          </p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {suggestions.map((s) => (
              <li
                key={s.anzsicCode}
                data-anzsic={s.anzsicCode}
                className="rounded-full border border-border bg-white px-3 py-1 text-ink-700"
                title={`TAM anchor ${formatAudCompact(s.tamAud)}`}
              >
                {s.label} · {s.anzsicCode}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-xs text-ink-500">{result.disclaimer}</p>
    </section>
  );
}
