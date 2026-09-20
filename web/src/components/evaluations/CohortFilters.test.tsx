// CohortFilters — static render + pure URL-codec tests (G21 P2-B). The
// component is fully controlled (parent owns `filters`), so a static render
// with a given `filters` prop is a faithful snapshot of what the URL would
// have produced — no jsdom / interaction needed to pin the markup contract.
// The "filters change the URL" half of the contract is pinned directly
// through the codec the component and the table share
// (cohortFiltersToParams / parseCohortFilters).

import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CohortFilters } from "./CohortFilters";
import { cohortFiltersToParams, parseCohortFilters } from "@/lib/evaluations/cohort-rows";

const SECTORS = ["Agtech", "DeepTech", "SaaS"];
const STAGES = [2, 3, 5];

describe("CohortFilters — chip state", () => {
  it("reflects active stage / risk / decision filters as aria-pressed=true", () => {
    const out = renderToStaticMarkup(
      <CohortFilters filters={{ stage: [3], risk: true, decision: ["proceed", "none"] }} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={2} total={5} />,
    );
    expect(out).toMatch(/data-testid="filter-stage-3"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="filter-stage-3"/);
    expect(out).toMatch(/data-testid="filter-risk"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="filter-risk"/);
    expect(out).toMatch(/data-testid="filter-decision-proceed"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="filter-decision-proceed"/);
    expect(out).toMatch(/data-testid="filter-decision-none"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="filter-decision-none"/);
    // A stage that is not active stays aria-pressed=false.
    expect(out).toMatch(/data-testid="filter-stage-2"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-testid="filter-stage-2"/);
  });

  it("lists the given sectors in the sector <select>", () => {
    const out = renderToStaticMarkup(<CohortFilters filters={{}} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={5} total={5} />);
    for (const s of SECTORS) expect(out).toContain(`<option value="${s}">${s}</option>`);
  });
});

describe("CohortFilters — range fields", () => {
  it("default to 0–100 with no filter set", () => {
    const out = renderToStaticMarkup(<CohortFilters filters={{}} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={5} total={5} />);
    expect(out).toMatch(/id="svi-lo"[^>]*value="0"/);
    expect(out).toMatch(/id="svi-hi"[^>]*value="100"/);
  });

  it("reflect a set range (svi: [40, 80])", () => {
    const out = renderToStaticMarkup(<CohortFilters filters={{ svi: [40, 80] }} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={5} total={5} />);
    expect(out).toMatch(/id="svi-lo"[^>]*value="40"/);
    expect(out).toMatch(/id="svi-hi"[^>]*value="80"/);
  });
});

describe("CohortFilters — summary + clear", () => {
  it("filter-summary reports shown of total", () => {
    const out = renderToStaticMarkup(<CohortFilters filters={{}} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={2} total={5} />);
    expect(out).toContain('data-testid="filter-summary"');
    expect(out).toContain("2 of 5 startups");
  });

  it("filter-clear shows the active-filter count and is absent when there are none", () => {
    const withFilters = renderToStaticMarkup(
      <CohortFilters filters={{ stage: [3], risk: true, decision: ["proceed", "none"] }} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={2} total={5} />,
    );
    expect(withFilters).toContain('data-testid="filter-clear"');
    expect(withFilters).toContain("Clear (3)");

    const noFilters = renderToStaticMarkup(<CohortFilters filters={{}} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={5} total={5} />);
    expect(noFilters).not.toContain('data-testid="filter-clear"');
  });
});

describe("CohortFilters — every control is labelled", () => {
  it("the search box, sector select, and verification select each carry a label", () => {
    const out = renderToStaticMarkup(<CohortFilters filters={{}} onChange={() => {}} sectors={SECTORS} stages={STAGES} shown={5} total={5} />);
    // Search box: visually-hidden <span> label via a wrapping <label>.
    expect(out).toMatch(/<label[^>]*><span class="sr-only">Search company or sector<\/span>/);
    // Sector + verification: visible <label> text before each <select>.
    expect(out).toMatch(/<label[^>]*><span[^>]*>Sector<\/span><select[^>]*data-testid="filter-sector"/);
    expect(out).toMatch(/<label[^>]*><span[^>]*>Verified ≥<\/span><select[^>]*data-testid="filter-ver"/);
    // Range fields: sr-only <legend> + per-input sr-only <label>.
    expect((out.match(/<legend class="sr-only">/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(out).toContain('for="svi-lo"');
    expect(out).toContain('for="svi-hi"');
  });
});

describe("cohort filter URL codec (shared with the table)", () => {
  it("cohortFiltersToParams / parseCohortFilters round-trip through the querystring", () => {
    const qs = cohortFiltersToParams({ stage: [3], risk: true }).toString();
    expect(qs).toBe("stage=3&risk=1");
    expect(parseCohortFilters(qs)).toEqual({ stage: [3], risk: true });
  });
});
