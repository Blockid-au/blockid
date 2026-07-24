// /showcase/atlassian/valuation — Step 7 of the Atlassian walkthrough.
//
// Renders the 16 ATLASSIAN_DEMO.valuations snapshots as an inline SVG
// grouped bar chart (4 timestamps × 4 methods, log-scale Y). A companion
// table lists every snapshot with method, AUD, FX, narrative, source.
//
// Plain server component — no libraries, no I/O.

import type { Metadata } from "next";
import Link from "next/link";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import {
  ATLASSIAN_DEMO,
  type ValuationSnapshot,
} from "@/lib/showcase/atlassian/fixture";

export const metadata: Metadata = {
  title: "Valuation methods side-by-side — Atlassian demo — Step 7 — BlockID",
  description:
    "DCF, Berkus, Scorecard and Comparables valuations for Atlassian at four points in its journey — log-scale chart plus a citation table.",
};

const TIMESTAMPS: ReadonlyArray<string> = [
  "2005",
  "2010-Accel",
  "2015-IPO",
  "2026-current",
];

const METHODS: ReadonlyArray<ValuationSnapshot["method"]> = [
  "DCF",
  "Berkus",
  "Scorecard",
  "Comparables",
];

// Colour-blind-friendly quartet — deliberately distinct in hue AND luminance
// so the chart still reads in greyscale.
const METHOD_COLOUR: Record<ValuationSnapshot["method"], string> = {
  DCF: "#60a5fa", // sky-400
  Berkus: "#f59e0b", // amber-500
  Scorecard: "#34d399", // emerald-400
  Comparables: "#f472b6", // pink-400
};

// AUD money formatter with `A$` prefix + comma grouping. Chosen instead of
// Intl currency because we want the exact "A$" prefix and no cents.
function formatAUD(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

function formatAUDCompact(n: number): string {
  if (n >= 1_000_000_000) return `A$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `A$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `A$${(n / 1_000).toFixed(1)}K`;
  return `A$${n}`;
}

// Grouped bar chart geometry — plain constants, sized for a max-w-6xl page
// with an overflow-x-auto wrapper so it still reads on narrow viewports.
const CHART_WIDTH = 900;
const CHART_HEIGHT = 420;
const MARGIN = { top: 30, right: 24, bottom: 60, left: 72 };
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

export default function AtlassianValuationPage() {
  const valuations = ATLASSIAN_DEMO.valuations;

  const values = valuations.map((v) => v.valueAUD).filter((v) => v > 0);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Snap the log-scale domain to round decades so the axis reads cleanly.
  const minVal = Math.pow(10, Math.floor(Math.log10(rawMin)));
  const maxVal = Math.pow(10, Math.ceil(Math.log10(rawMax)));
  const logMin = Math.log10(minVal);
  const logMax = Math.log10(maxVal);

  const scaleLog = (v: number): number => {
    if (v <= 0) return 0;
    return (Math.log10(v) - logMin) / (logMax - logMin);
  };

  const groupWidth = PLOT_W / TIMESTAMPS.length;
  const innerGroupPad = 12;
  const barWidth = (groupWidth - innerGroupPad * 2) / METHODS.length;

  // Decade grid lines from minVal (10^N) to maxVal (10^M).
  const decades: number[] = [];
  for (let p = logMin; p <= logMax; p++) {
    decades.push(Math.pow(10, p));
  }

  return (
    <AtlassianWalkthroughProvider stepNumber={7}>
      <div className="min-h-screen bg-surface-50">
        <div className="container mx-auto max-w-6xl p-6">
          <nav className="mb-4 text-sm">
            <Link href="/showcase/atlassian" className="text-brand-700 hover:underline">
              ← Atlassian landing
            </Link>
          </nav>

          <header className="mb-6">
            <h1 className="text-3xl font-semibold text-ink-900">
              Valuation methods side-by-side
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-700">
              Every method converges within ~20% at IPO but disagrees wildly
              pre-revenue — that's the point of running all four. DCF,
              Berkus, Scorecard and Comparables at four snapshots of
              Atlassian's history, all values in AUD (converted from USD at
              the spot FX for each period).
            </p>
          </header>

          <section
            aria-label="Valuation grouped bar chart"
            className="mb-6 rounded-lg border border-white/10 bg-black/40 p-5"
          >
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-200">
              {METHODS.map((m) => (
                <span key={m} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: METHOD_COLOUR[m] }}
                  />
                  {m}
                </span>
              ))}
              <span className="ml-auto text-[11px] italic text-ink-400">
                Y-axis: log10 scale (AUD)
              </span>
            </div>

            <div className="overflow-x-auto">
              <svg
                role="img"
                aria-label="Grouped bar chart of Atlassian valuations by method across four timestamps"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                width="100%"
                className="min-w-[720px]"
              >
                {/* Plot background */}
                <rect
                  x={MARGIN.left}
                  y={MARGIN.top}
                  width={PLOT_W}
                  height={PLOT_H}
                  fill="rgba(255,255,255,0.02)"
                />

                {/* Decade grid + Y labels */}
                {decades.map((d) => {
                  const yFrac = 1 - scaleLog(d);
                  const y = MARGIN.top + yFrac * PLOT_H;
                  return (
                    <g key={`grid-${d}`}>
                      <line
                        x1={MARGIN.left}
                        x2={MARGIN.left + PLOT_W}
                        y1={y}
                        y2={y}
                        stroke="rgba(255,255,255,0.08)"
                        strokeDasharray="2 3"
                      />
                      <text
                        x={MARGIN.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="rgba(230,232,240,0.75)"
                      >
                        {formatAUDCompact(d)}
                      </text>
                    </g>
                  );
                })}

                {/* Axis lines */}
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left}
                  y1={MARGIN.top}
                  y2={MARGIN.top + PLOT_H}
                  stroke="rgba(255,255,255,0.3)"
                />
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + PLOT_W}
                  y1={MARGIN.top + PLOT_H}
                  y2={MARGIN.top + PLOT_H}
                  stroke="rgba(255,255,255,0.3)"
                />

                {/* Grouped bars */}
                {TIMESTAMPS.map((ts, tsIdx) => {
                  const groupX = MARGIN.left + tsIdx * groupWidth;
                  return (
                    <g key={`grp-${ts}`}>
                      {METHODS.map((method, mIdx) => {
                        const snap = valuations.find(
                          (v) => v.timestamp === ts && v.method === method,
                        );
                        if (!snap || snap.valueAUD <= 0) return null;
                        const barX =
                          groupX + innerGroupPad + mIdx * barWidth;
                        const yFrac = 1 - scaleLog(snap.valueAUD);
                        const y = MARGIN.top + yFrac * PLOT_H;
                        const h = MARGIN.top + PLOT_H - y;
                        return (
                          <g key={`bar-${ts}-${method}`}>
                            <rect
                              x={barX}
                              y={y}
                              width={Math.max(barWidth - 2, 2)}
                              height={Math.max(h, 1)}
                              fill={METHOD_COLOUR[method]}
                              rx={2}
                            >
                              <title>
                                {method} · {ts} · {formatAUD(snap.valueAUD)}
                              </title>
                            </rect>
                            <text
                              x={barX + barWidth / 2 - 1}
                              y={y - 4}
                              textAnchor="middle"
                              fontSize="9.5"
                              fill="rgba(230,232,240,0.9)"
                            >
                              {formatAUDCompact(snap.valueAUD)}
                            </text>
                          </g>
                        );
                      })}
                      {/* X-axis label */}
                      <text
                        x={groupX + groupWidth / 2}
                        y={MARGIN.top + PLOT_H + 24}
                        textAnchor="middle"
                        fontSize="12"
                        fill="rgba(230,232,240,0.9)"
                      >
                        {ts}
                      </text>
                    </g>
                  );
                })}

                {/* Y-axis title */}
                <text
                  transform={`rotate(-90 16 ${MARGIN.top + PLOT_H / 2})`}
                  x={16}
                  y={MARGIN.top + PLOT_H / 2}
                  fontSize="11"
                  textAnchor="middle"
                  fill="rgba(230,232,240,0.75)"
                >
                  Valuation (AUD, log scale)
                </text>
              </svg>
            </div>
          </section>

          <section
            aria-label="Valuation snapshots table"
            className="mb-8 rounded-lg border border-white/10 bg-black/40 p-5"
          >
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-100">
              All 16 snapshots
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/20 text-xs uppercase tracking-wide text-ink-300">
                    <th className="px-3 py-2 font-semibold">Timestamp</th>
                    <th className="px-3 py-2 font-semibold">Method</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Value (AUD)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">FX (USD→AUD)</th>
                    <th className="px-3 py-2 font-semibold">Narrative</th>
                    <th className="px-3 py-2 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {valuations.map((v, i) => (
                    <tr key={i} className="border-b border-white/5 align-top">
                      <td className="px-3 py-2 font-mono text-xs text-ink-100">
                        {v.timestamp}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex items-center gap-1.5 text-ink-100"
                        >
                          <span
                            aria-hidden
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: METHOD_COLOUR[v.method] }}
                          />
                          {v.method}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-ink-50">
                        {formatAUD(v.valueAUD)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-ink-200">
                        {v.fxRate.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-ink-200">{v.narrative}</td>
                      <td className="px-3 py-2">
                        <a
                          href={v.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-300 hover:text-brand-200 hover:underline"
                        >
                          source →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="rounded-lg border border-brand-200 bg-brand-50 p-5 text-sm text-brand-900">
            <p className="font-medium">
              In BlockID{" "}
              <Link href="/dashboard/valuation" className="underline">
                /dashboard/valuation
              </Link>{" "}
              runs all four methods live for your startup based on your
              uploads — cap table, financials, market comparables.
            </p>
            <p className="mt-1">
              You'll see the same disagreement pre-revenue and the same
              convergence at scale — which is exactly the signal a term-sheet
              conversation needs.
            </p>
          </aside>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}
