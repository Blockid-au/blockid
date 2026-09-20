// G21 P1 review: the dossier header prints a percentile only when the
// stage cohort published one (score-governance § 7) — with its n — and the
// reason ("No cohort benchmark yet (n = N)") otherwise; never "benchmark
// estimate" beside a static-table number. renderToStaticMarkup; the client
// export button is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeView } from "@/lib/evaluations/ic-reports.fixture";
import { DossierHeader } from "./dossier-header";

vi.mock("./export-ic-button", () => ({ ExportIcButton: () => null }));

describe("<DossierHeader> percentile (G21 P1 review)", () => {
  it("published: pNN + the band label carrying n", () => {
    const html = renderToStaticMarkup(<DossierHeader header={fakeView().header} role="assessor" />);
    expect(html).toContain('data-testid="dossier-percentile"');
    expect(html).toContain("p61");
    expect(html).toContain("stage cohort · segmented benchmark (n = 120)");
    expect(html).not.toContain("benchmark estimate");
  });

  it("unpublished (static fallback / below the floor): no number, the no-benchmark line with n", () => {
    const header = { ...fakeView().header, percentile: { value: null, source: "benchmark_fallback" as const, cohortSize: 3, label: "not enough comparable companies (n = 3)" } };
    const html = renderToStaticMarkup(<DossierHeader header={header} role="assessor" />);
    expect(html).toContain('data-testid="dossier-percentile-none"');
    expect(html).toContain("No cohort benchmark yet (n = 3)");
    expect(html).not.toMatch(/<strong[^>]*>p\d+</);
    expect(html).not.toContain("benchmark estimate");
  });

  it("no score at all: a dash", () => {
    const header = { ...fakeView().header, percentile: null };
    const html = renderToStaticMarkup(<DossierHeader header={header} role="assessor" />);
    expect(html).not.toContain("dossier-percentile");
  });
});
