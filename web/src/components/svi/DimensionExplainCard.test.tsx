// G21-P1-B — <DimensionExplainCard>: full + compact variants, pending band, theme contract.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { dimensionExplainFromChapter, type DimensionExplainData } from "@/lib/svi/dimension-explain";
import { DimensionExplainCard, DimensionExplainGrid } from "./DimensionExplainCard";

function tre(over: Partial<DimensionExplainData> = {}): DimensionExplainData {
  const ch = demoReportV2().dimensions.find((d) => d.dim === "tre")!;
  // The demo verdict quotes a revenue figure (A$); the card must not add any A$ of its own, so the fixture "why" is plain.
  return { ...dimensionExplainFromChapter(ch, { evidence: [{ id: "hub-1", statement: "Bank statement — reviewer-verified", level: "L6", verified: true, sourceName: "BlockID reviewer", code: "revenue_proof" }] }), why: ["Revenue is growing month on month.", "Churn is low for the stage.", "Paying customers are named."], ...over };
}

function assertThemeContract(html: string) {
  expect(html).not.toContain("text-[10px]");
  expect(html).not.toMatch(/bg-(white|sky|orange|amber|brand|emerald|red)-\d+\/\d+/);
  expect(html).not.toMatch(/\bbg-white\b/);
  for (const m of html.matchAll(/\bdark:[\w[\]/-]+/g)) expect(m[0]).toMatch(/^dark:(border-|bg-emerald-950$|text-emerald-200$)/);
  expect(html).toContain("bg-surface-sunken");
  expect(html).not.toContain("**");
  expect(html).not.toContain("<!--");
  expect(html).not.toContain("A$");
}

describe("<DimensionExplainCard>", () => {
  it("full: Score · Confidence · Why · Evidence (L badges + verified tick) · Missing · Next action", () => {
    const data = tre();
    const html = renderToStaticMarkup(<DimensionExplainCard data={data} />);
    expect(html).toContain('data-testid="dimension-explain"');
    expect(html).toContain('data-dim="tre"');
    expect(html).toContain('data-explain-state="assessed"');
    expect(html).toContain(`data-explain-score="${data.score}"`);
    expect(html).toContain(`>${data.confidence}%<`);
    expect(html).toContain(">Why<");
    expect(html).toContain(">Evidence<");
    expect(html).toContain(">Missing<");
    expect(html).toContain(">Next action<");
    expect(html).toContain("weight 20%");
    // The strongest (L6, verified) hub item leads, with the sr-only "verified" tick.
    expect(html.indexOf('data-explain-evidence-level="L6"')).toBeGreaterThan(0);
    expect(html).toContain('class="sr-only">verified<');
    expect((html.match(/data-explain-evidence-level=/g) ?? []).length).toBeLessThanOrEqual(3);
    expect((html.match(/<p[^>]*class="max-w-prose text-xs leading-relaxed text-primary"/g) ?? []).length).toBeLessThanOrEqual(3);
    // Missing items link to a workspace page and carry the lift chip.
    expect(html).toMatch(/href="\/workspace\/[^"]+"/);
    expect(html).toMatch(/\+\d+ SVI/);
    expect(html).toContain("data-explain-next-action");
    expect(html).not.toContain("data-explain-benchmark");
    assertThemeContract(html);
  });

  it("compact: one why sentence, one evidence item, one missing item", () => {
    const html = renderToStaticMarkup(<DimensionExplainCard data={tre()} variant="compact" href="#tbr-dim-tre" />);
    expect(html).toContain('data-explain-variant="compact"');
    expect((html.match(/data-explain-evidence-level=/g) ?? []).length).toBe(1);
    expect((html.match(/<p[^>]*class="max-w-prose text-xs leading-relaxed text-primary"/g) ?? []).length).toBe(1);
    expect(html).toContain('href="#tbr-dim-tre"');
    assertThemeContract(html);
  });

  it("pending: keeps the pending band and shows only Missing + Next action", () => {
    const html = renderToStaticMarkup(<DimensionExplainCard data={tre({ pending: true, score: null, band: "pending", confidence: null, why: [], evidence: [] })} />);
    expect(html).toContain('data-explain-state="pending"');
    expect(html).toContain('data-explain-score="pending"');
    expect(html).toContain("data-explain-pending");
    expect(html).toContain(">—<");
    expect(html).toContain(">Pending<");
    expect(html).not.toContain(">Why<");
    expect(html).not.toContain(">Evidence<");
    expect(html).toContain(">Missing<");
    expect(html).toContain(">Next action<");
    expect(html).not.toContain("data-explain-confidence");
    assertThemeContract(html);
  });

  it("benchmark line only from the prop, with n and the label", () => {
    const html = renderToStaticMarkup(<DimensionExplainCard data={tre({ benchmark: { median: 61, n: 120, label: "segmented" } })} />);
    expect(html).toContain('data-explain-benchmark="segmented"');
    expect(html).toContain("stage median 61 (n = 120) · segmented benchmark");
  });

  it("grid renders one card per item", () => {
    const items = demoReportV2().dimensions.map((ch) => dimensionExplainFromChapter(ch));
    const html = renderToStaticMarkup(<DimensionExplainGrid items={items} hrefFor={(d) => `#tbr-dim-${d}`} />);
    expect((html.match(/data-testid="dimension-explain"/g) ?? []).length).toBe(8);
    expect(html).toContain('data-testid="dimension-explain-grid"');
  });

  it("VI locale: Vietnamese labels", () => {
    const html = renderToStaticMarkup(<DimensionExplainCard data={tre()} locale="vi" />);
    expect(html).toContain(">Vì sao<");
    expect(html).toContain(">Còn thiếu<");
    expect(html).toContain(">Hành động tiếp theo<");
  });
});
