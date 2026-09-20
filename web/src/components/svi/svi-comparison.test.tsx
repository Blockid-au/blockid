// G21 P1 review: the "How You Compare" card publishes a rank / median only
// through lib/benchmarks/publication-rules.ts — never the static AU-market
// table. renderToStaticMarkup (no effects run) pins the first paint: the
// stored cohort result decides, the live pool only adds to it.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { computeSVI, extractSignals, type SVIAnalysis } from "@/lib/svi-analysis";
import { publishPercentile } from "@/lib/benchmarks/publication-rules";
import { SVIComparison, comparisonPercentile } from "./svi-comparison";

const base = computeSVI(extractSignals({ rawText: "A B2B SaaS with 40 paying customers and A$20k MRR, two co-founders, ABN registered." }));

function withCohort(cohort: SVIAnalysis["cohortPercentile"]): SVIAnalysis {
  return { ...base, cohortPercentile: cohort };
}

describe("comparisonPercentile", () => {
  it("stored published rank wins; the static fallback yields nothing even when the API had a number", () => {
    const pub = publishPercentile({ percentile: 77, n: 47, segment: "AU cohort" })!;
    expect(comparisonPercentile(withCohort({ percentile: 77, source: "real_cohort", cohortSize: 47, stageMatched: 2, band: "benchmark", label: pub.label, published: pub }), null)).toBe(pub);
    expect(comparisonPercentile(withCohort({ percentile: 55, source: "benchmark_fallback", cohortSize: 3, stageMatched: 2, band: "none", label: "not enough comparable companies (n = 3)", published: null }), null)).toBeNull();
    expect(comparisonPercentile(withCohort(undefined), { source: "static", sampleSize: 0, percentile: 60, stageLabel: "Seed" })).toBeNull();
  });

  it("the live pool publishes only with its n (indicative at 10-29, nothing below 10)", () => {
    expect(comparisonPercentile(withCohort(undefined), { source: "live", sampleSize: 14, percentile: 60, stageLabel: "Seed" })).toMatchObject({ percentile: 60, n: 14, band: "indicative" });
    expect(comparisonPercentile(withCohort(undefined), { source: "live", sampleSize: 9, percentile: 60, stageLabel: "Seed" })).toBeNull();
  });
});

describe("<SVIComparison>", () => {
  it("prints Top N% with the n-label from a published cohort result", () => {
    const pub = publishPercentile({ percentile: 77, n: 47, segment: "AU cohort" })!;
    const html = renderToStaticMarkup(<SVIComparison analysis={withCohort({ percentile: 77, source: "real_cohort", cohortSize: 47, stageMatched: 2, band: "benchmark", label: pub.label, published: pub })} />);
    expect(html).toContain('data-svi-comparison-percentile="published"');
    expect(html).toContain("Top 23%");
    expect(html).toContain("benchmark (n = 47)");
  });

  it("prints the not-enough sentence (with n) — no percentile, no median — below the floor or without a cohort", () => {
    const html = renderToStaticMarkup(<SVIComparison analysis={withCohort({ percentile: 55, source: "benchmark_fallback", cohortSize: 3, stageMatched: 2, band: "none", label: "not enough comparable companies (n = 3)", published: null })} />);
    expect(html).toContain('data-svi-comparison-percentile="none"');
    expect(html).not.toMatch(/Top \d+%/);
    expect(html).toContain("Not enough comparable companies");
    expect(html).toContain("(n = 3)");
    expect(html).not.toContain("Stage Median");
    expect(html).toContain("no cohort average yet");
    const none = renderToStaticMarkup(<SVIComparison analysis={withCohort(undefined)} />);
    expect(none).not.toMatch(/Top \d+%/);
    expect(none).toContain("(n = 0)");
  });
});
