// Compact index rows (S10-A): one detail link, type + stage chips, the
// deadline-ladder chip, one conversion link, no SVG, no summary text.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuGrantRow, AuProgramRow } from "@/lib/funding/seed-map";
import { GrantRow, INDEX_ROWS_CLASS, ProgramRow, equityTerm } from "./index-rows";

const TODAY = new Date("2026-09-10T00:00:00Z");

const program: AuProgramRow = {
  id: "syd-startmate",
  name: "Startmate Accelerator",
  operator: "Startmate",
  program_type: "accelerator",
  city: "Sydney",
  capital: "Sydney",
  state: "NSW",
  venue: null,
  stage_tags: ["mvp", "early_revenue"],
  industry_tags: [],
  demographic_tags: [],
  length_weeks: 12,
  intake_months: [1, 7],
  applications_open: null,
  applications_close: "2026-11-08",
  next_cohort_start: "2027-01-25",
  benefits: [],
  funding_aud: 120000,
  equity_pct: "≤8%",
  cost_to_founder: "free",
  eligibility: {},
  status: "open",
  official_url: "https://example.com/apply",
  summary: "Short summary.",
  last_verified_at: "2026-09-10",
  verified_by: "seed",
  status_confidence: "high",
};

const grant: AuGrantRow = {
  id: "mvp-ventures",
  name: "MVP Ventures",
  provider: "Investment NSW",
  level: "state",
  state: "NSW",
  funding_type: "matched_grant",
  amount_min_aud: 25000,
  amount_max_aud: 200000,
  amount_note: null,
  co_contribution: null,
  stage_tags: ["mvp"],
  industry_tags: [],
  demographic_tags: [],
  eligibility: {},
  application_window: "rolling",
  opens_at: null,
  closes_at: null,
  lodgement_deadline: null,
  next_round_note: null,
  status: "open",
  superseded_by: null,
  exclude_from_matching: false,
  official_url: "https://business.gov.au/example",
  source_url: null,
  summary: "A summary line.",
  how_to_apply: null,
  evidence_needed: [],
  last_verified_at: "2026-09-10",
  verified_by: "seed",
  status_confidence: "high",
  sources: null,
};

describe("ProgramRow", () => {
  it("links the detail page once, chips type + stages, ladders the deadline, and keeps the plan CTA off closed rows", () => {
    const html = renderToStaticMarkup(
      <ul className={INDEX_ROWS_CLASS}>
        <ProgramRow program={program} today={TODAY} />
        <ProgramRow program={{ ...program, id: "syd-closed", status: "closed", equity_pct: "none" }} showCity={false} today={TODAY} />
      </ul>,
    );
    expect(html).toContain('<li data-program-id="syd-startmate" data-status="open">');
    expect(html.split('href="/funding/programs/sydney/syd-startmate"')).toHaveLength(2);
    expect(html).toContain("<h3><a");
    expect(html).toContain("<p>Startmate · Sydney · A$120,000 · ≤8% equity</p>");
    expect(html).toContain('<ul aria-label="Type and stages"><li>Accelerator</li><li>MVP</li>');
    expect(html).toContain('data-deadline-status="closing_soon"');
    expect(html).toContain("Closes in 59 days — 8 Nov 2026");
    expect(html).toContain('href="/funding?program=syd-startmate"');
    // Closed row: overdue rung, no CTA, city hidden, "none" reads as "no equity".
    expect(html).toContain('data-program-id="syd-closed" data-status="closed"');
    expect(html).toContain('data-deadline-status="overdue"');
    expect(html).not.toContain('href="/funding?program=syd-closed"');
    expect(html).toContain("<p>Startmate · A$120,000 · no equity</p>");
    // Lean: no SVG, no summary, no official link, classes live on the <ul>.
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("Short summary.");
    expect(html).not.toContain("example.com/apply");
    expect(html).toContain("[&amp;&gt;li]:flex");
  });
});

describe("GrantRow", () => {
  it("links the detail page once, shows provider + A$ range, chips type + stages, rolling chip and the eligibility door", () => {
    const html = renderToStaticMarkup(
      <ul className={INDEX_ROWS_CLASS}>
        <GrantRow grant={grant} today={TODAY} />
      </ul>,
    );
    expect(html).toContain('<li data-grant-id="mvp-ventures" data-status="open">');
    expect(html.split('href="/funding/grants/mvp-ventures"')).toHaveLength(2);
    expect(html).toContain("<p>Investment NSW · A$25,000 – A$200,000</p>");
    expect(html).toContain("<li>Matched grant</li><li>MVP</li>");
    expect(html).toContain("Rolling — apply any time");
    expect(html).toContain('href="/funding?grant=mvp-ventures"');
    expect(html).toContain("Am I eligible?");
    expect(html).not.toContain("business.gov.au");
    expect(html).not.toContain("<svg");
  });
});

describe("equityTerm", () => {
  it("renders percentages with the noun, instrument notes as-is, 'none' as no equity, and drops unknowns", () => {
    expect(equityTerm("12%")).toBe("12% equity");
    expect(equityTerm("≤8%")).toBe("≤8% equity");
    expect(equityTerm("none")).toBe("no equity");
    expect(equityTerm("SAFE 15% discount, no cap")).toBe("SAFE 15% discount, no cap");
    expect(equityTerm("FI warrant (verify)")).toBe("FI warrant (verify)");
    expect(equityTerm("≤8% (A$1.5M post-money cap if unraised)")).toBe("≤8% (A$1.5M post-money cap if unraised)");
    for (const v of ["n/a", "varies", "seed", "angel round", "", null, undefined]) expect(equityTerm(v), String(v)).toBeNull();
  });
});
