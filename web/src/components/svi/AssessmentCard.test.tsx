// G21-P1-B — <AssessmentCard>: fixture render, theme-contract classes, no markdown / A$ / 10 px.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAssessmentCard, type AssessmentCardData } from "@/lib/svi/assessment-card";
import { AssessmentCard } from "./AssessmentCard";

function fixture(over: Partial<AssessmentCardData> = {}): AssessmentCardData {
  return {
    ...buildAssessmentCard(
      { name: "Sample SME Compliance SaaS", sector: "SaaS", stageLabel: "Seed", verificationLevel: 2 },
      {
        total: 74,
        dimensions: [
          { dim: "tre", score: 78, weight: 20, assessed: true, level: "transaction_data" },
          { dim: "ftv", score: 83, weight: 15, assessed: true, level: "document_uploaded" },
          { dim: "lco", score: 35, weight: 8, assessed: true, level: "self_declared", signals: [{ signal: "ABN mentioned", points: 10, source: "self_declared" }] },
        ],
      },
      {},
      { generatedAt: "2026-09-20T00:00:00Z" },
    ),
    ...over,
  };
}

/** Every `dark:` class must be a border or the two AbnBadge tokens (report.test typography guard). */
function assertThemeContract(html: string) {
  expect(html).not.toContain("text-[10px]");
  expect(html).not.toMatch(/bg-(white|sky|orange|amber|brand|emerald|red)-\d+\/\d+/);
  expect(html).not.toMatch(/\bbg-white\b/);
  for (const m of html.matchAll(/\bdark:[\w[\]/-]+/g)) expect(m[0]).toMatch(/^dark:(border-|bg-emerald-950$|text-emerald-200$)/);
  expect(html).toContain("bg-surface");
  expect(html).toContain("text-primary");
  expect(html).not.toContain("**");
  expect(html).not.toContain("<!--");
}

describe("<AssessmentCard>", () => {
  it("renders SVI and Evidence Confidence side by side with equal weight, plus every field", () => {
    const data = fixture();
    const html = renderToStaticMarkup(<AssessmentCard data={data} />);
    expect(html).toContain('data-testid="assessment-card"');
    expect(html).toContain(`data-assessment-svi="74"`);
    expect(html).toContain(`data-assessment-confidence="${data.evidenceConfidence}"`);
    expect(html).toContain(">SVI<");
    expect(html).toContain(">Evidence Confidence<");
    expect(html).toContain(">74<");
    expect(html).toContain("/ 100");
    expect(html).toContain(`>${data.evidenceConfidence}<`);
    // The two tiles share one 2-column grid and the same value size.
    expect(html).toContain("grid-cols-2");
    expect((html.match(/text-3xl font-black/g) ?? []).length).toBe(2);
    expect(html).toContain("BlockID Verified L2");
    expect(html).toContain(">Seed<");
    expect(html).toContain(">SaaS<");
    expect(html).toContain("Top strength");
    expect(html).toContain('data-assessment-top-strength="ftv"');
    expect(html).toContain('data-assessment-top-gap="lco"');
    expect(html).toContain("Unverified material claims");
    expect(html).toContain('data-assessment-unverified="1"');
    expect(html).toContain("Last updated");
    expect(html).toMatch(/date[Tt]ime="2026-09-20T00:00:00Z"/);
    expect(html).toContain("Methodology");
    expect(html).toContain(`SVI v${data.methodologyVersion}`);
    expect(html).toContain('role="meter"');
    // No benchmark prop → no benchmark line at all.
    expect(html).not.toContain("data-assessment-benchmark");
    expect(html).not.toContain(">Benchmark<");
    // No valuation in the fixture → no A$.
    expect(html).not.toContain("A$");
    assertThemeContract(html);
  });

  it("renders the benchmark line verbatim from the prop, with n and the label", () => {
    const html = renderToStaticMarkup(<AssessmentCard data={fixture({ benchmark: { median: 52, n: 34, label: "indicative" } })} />);
    expect(html).toContain('data-assessment-benchmark="indicative"');
    expect(html).toContain("stage median 52 (n = 34) · indicative");
    expect(html).not.toContain("Australian average");
  });

  it("G21 P3-C: the stale-connector hint is one muted line, only when a source is past its proof TTL", () => {
    expect(renderToStaticMarkup(<AssessmentCard data={fixture()} />)).not.toContain("data-assessment-stale-connectors");
    const html = renderToStaticMarkup(<AssessmentCard data={fixture({ staleConnectors: 1 })} />);
    expect(html).toContain("data-assessment-stale-connectors");
    expect(html).toContain("1 connected source past the 90-day refresh window");
    assertThemeContract(html);
  });

  it("pending: no SVI number, pending band, no strength / gap, pending line", () => {
    const html = renderToStaticMarkup(<AssessmentCard data={fixture({ svi: null, sviBand: "pending", topStrength: null, topGap: null, pendingDims: 8, evidenceConfidence: 0 })} />);
    expect(html).toContain('data-assessment-svi="pending"');
    expect(html).toContain(">—<");
    expect(html).toContain(">Pending<");
    expect(html).toContain('data-assessment-top-strength="none"');
    expect(html).toContain("8 of 8 dimensions pending");
    assertThemeContract(html);
  });

  it("links the dimension refs through dimHref and honours the heading level", () => {
    const html = renderToStaticMarkup(<AssessmentCard data={fixture()} headingLevel={2} dimHref={(dim) => `#tbr-dim-${dim}`} />);
    expect(html).toContain('href="#tbr-dim-ftv"');
    expect(html).toContain('href="#tbr-dim-lco"');
    expect(html).toContain("<h2");
  });

  it("VI locale labels carry diacritics; L0 reads as not yet verified", () => {
    const html = renderToStaticMarkup(<AssessmentCard data={fixture({ verification: { level: 0, short: "L0", label: "Not yet BlockID Verified", tier: "Unverified", verified: false } })} locale="vi" />);
    expect(html).toContain("Thẻ đánh giá BlockID");
    expect(html).toContain("Độ tin cậy bằng chứng");
    expect(html).toContain("Not yet BlockID Verified");
    expect(html).not.toContain("Evidence Confidence");
  });
});
