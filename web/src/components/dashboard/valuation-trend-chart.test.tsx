// Colocated tests for the S17-B ValuationTrendChart.
//
// Uses renderToStaticMarkup (no @testing-library/react in this workspace —
// see stage-banner.test.tsx). Recharts' ResponsiveContainer measures nothing
// server-side, so the assertions target what the component owns: the band
// panel mounts only when a row carries a valuation, the empty copy, the
// legend, the table twin, the sr-only summary and the method line.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VALUATION_EMPTY_COPY,
  ValuationTrendChart,
  buildValuationTrendData,
  describeValuationTrend,
  type ValuationTrendRow,
} from "./valuation-trend-chart";

const rows: ValuationTrendRow[] = [
  { id: "b", createdAt: "2026-08-01T00:00:00Z", svi: 52, lowAud: 1_200_000, highAud: 2_400_000 },
  { id: "a", createdAt: "2026-07-01T00:00:00Z", svi: 48, lowAud: 900_000, highAud: 1_800_000 },
  {
    id: "c",
    createdAt: "2026-09-01T00:00:00Z",
    svi: 61,
    lowAud: 3_600_000,
    highAud: 4_500_000,
    method: "svi+arr_multiple",
    connectedMrrAud: 50_000,
    connectedMrrProvider: "stripe",
  },
];

const noValuation: ValuationTrendRow[] = [
  { id: "x", createdAt: "2026-07-01T00:00:00Z", svi: 40, lowAud: null, highAud: null },
  { id: "y", createdAt: "2026-08-01T00:00:00Z", svi: 45, lowAud: 0, highAud: null },
];

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("buildValuationTrendData", () => {
  it("sorts chronologically, keeps the band and derives the midpoint", () => {
    const d = buildValuationTrendData(rows);
    expect(d.points.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(d.points[0].range).toEqual([900_000, 1_800_000]);
    expect(d.points[0].midAud).toBe(1_350_000);
    expect(d.hasValuation).toBe(true);
    expect(d.pointOnly).toBe(false);
    expect(d.latestValuation?.id).toBe("c");
  });

  it("treats null / zero valuation as no band", () => {
    const d = buildValuationTrendData(noValuation);
    expect(d.hasValuation).toBe(false);
    expect(d.latestValuation).toBeNull();
    expect(d.points.every((p) => p.range === null)).toBe(true);
  });

  it("swaps an inverted band and mirrors a one-sided one", () => {
    const d = buildValuationTrendData([
      { id: "i", createdAt: "2026-07-01T00:00:00Z", svi: 50, lowAud: 2_000_000, highAud: 1_000_000 },
      { id: "j", createdAt: "2026-08-01T00:00:00Z", svi: 50, lowAud: null, highAud: 500_000 },
    ]);
    expect(d.points[0].range).toEqual([1_000_000, 2_000_000]);
    expect(d.points[1].range).toEqual([500_000, 500_000]);
  });

  it("flags point-only series (low === high everywhere)", () => {
    const d = buildValuationTrendData([
      { id: "i", createdAt: "2026-07-01T00:00:00Z", svi: 50, lowAud: 1_000_000, highAud: 1_000_000 },
      { id: "j", createdAt: "2026-08-01T00:00:00Z", svi: 55, lowAud: 1_500_000, highAud: 1_500_000 },
    ]);
    expect(d.pointOnly).toBe(true);
  });
});

describe("describeValuationTrend", () => {
  it("summarises SVI movement and the latest A$ range", () => {
    const text = describeValuationTrend(buildValuationTrendData(rows), "Acme");
    expect(text).toContain("Acme:");
    expect(text).toContain("SVI moved from 48");
    expect(text).toContain("to 61");
    expect(text).toContain("A$3.6M to A$4.5M");
  });

  it("says so when no valuation exists", () => {
    expect(describeValuationTrend(buildValuationTrendData(noValuation))).toContain("no valuation range recorded yet");
  });
});

describe("ValuationTrendChart", () => {
  it("renders nothing for zero rows", () => {
    expect(html(<ValuationTrendChart rows={[]} />)).toBe("");
  });

  it("mounts the valuation panel + legend only when a row carries a valuation", () => {
    const withBand = html(<ValuationTrendChart rows={rows} startupName="Acme" />);
    expect(withBand).toContain('data-testid="svi-panel"');
    expect(withBand).toContain('data-testid="valuation-panel"');
    expect(withBand).toContain("Valuation range (A$, low–high)");
    expect(withBand).not.toContain(VALUATION_EMPTY_COPY);

    const without = html(<ValuationTrendChart rows={noValuation} />);
    expect(without).toContain('data-testid="svi-panel"');
    expect(without).not.toContain('data-testid="valuation-panel"');
    expect(without).toContain('data-testid="valuation-empty"');
    expect(without).toContain(VALUATION_EMPTY_COPY);
    expect(without).not.toContain("Valuation range (A$, low–high)");
  });

  it("accepts a host-specific empty copy and can hide the SVI panel", () => {
    const out = html(<ValuationTrendChart rows={noValuation} hideSvi emptyCopy="Custom empty copy" />);
    expect(out).toContain("Custom empty copy");
    expect(out).not.toContain('data-testid="svi-panel"');
    expect(out).not.toContain("SVI score (0–100)");
  });

  it("ships a table twin with compact A$ values, and an sr-only summary", () => {
    const out = html(<ValuationTrendChart rows={rows} startupName="Acme" />);
    expect(out).toContain("<table");
    expect(out).toContain("View as table");
    expect(out).toContain("Low (A$)");
    expect(out).toContain("High (A$)");
    expect(out).toContain("A$900K");
    expect(out).toContain("A$1.8M");
    expect(out).toContain("A$4.5M");
    expect(out).toContain("SVI + connected ARR multiple");
    expect(out).toContain('class="sr-only"');
    expect(out).toContain("SVI moved from 48");
  });

  it("shows the connected-revenue method line for the latest bridged valuation", () => {
    const out = html(<ValuationTrendChart rows={rows} />);
    expect(out).toContain('data-testid="valuation-method-line"');
    expect(out).toContain("Includes connected revenue (A$50K MRR from Stripe)");
    const plain = html(<ValuationTrendChart rows={rows.slice(0, 2)} />);
    expect(plain).not.toContain('data-testid="valuation-method-line"');
  });

  it("renders the single-analysis note instead of panels for one row", () => {
    const out = html(<ValuationTrendChart rows={[rows[0]]} />);
    expect(out).toContain("One analysis so far");
    expect(out).toContain("A$1.2M – A$2.4M");
    expect(out).not.toContain('data-testid="svi-panel"');
  });
});
