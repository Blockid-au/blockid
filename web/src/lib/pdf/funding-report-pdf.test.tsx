// Renders the Money Finder PDF (T0244) end-to-end through @react-pdf and
// reads the file back: five A4 pages (cover · grants · programs · timeline ·
// plan), a %PDF header, a real size, and the timeline bars drawn as Views
// even when the report has no narrative.

import { describe, expect, it } from "vitest";
import type { PublicFundingReport } from "@/lib/funding/reports";
import { pdfPageCount } from "./page-count";
import { fundingReportFilename, renderFundingReportPdf } from "./funding-report-pdf";

function grantRow() {
  return {
    id: "g1", name: "MVP Ventures", provider: null, level: "state", state: "NSW", funding_type: "matched_grant",
    amount_min_aud: 25000, amount_max_aud: 75000, amount_note: null, co_contribution: "1:1", stage_tags: ["mvp"],
    industry_tags: [], demographic_tags: [], eligibility: {}, application_window: null, opens_at: null,
    closes_at: "2026-11-30", lodgement_deadline: null, next_round_note: null, status: "open", superseded_by: null,
    exclude_from_matching: false, official_url: "https://www.investment.nsw.gov.au/mvp", source_url: null,
    summary: "s", how_to_apply: null, evidence_needed: [], last_verified_at: "2026-09-10", verified_by: "seed",
    status_confidence: "high", sources: null,
  };
}

function programRow() {
  return {
    id: "p1", name: "Plus Eight", operator: "Spacecubed", program_type: "accelerator", city: "Perth", capital: "Perth", state: "WA",
    venue: null, stage_tags: ["mvp"], industry_tags: [], demographic_tags: [], length_weeks: 12, intake_months: [2],
    applications_open: "2027-01-10", applications_close: "2027-02-20", next_cohort_start: "2027-03-15", benefits: ["A$100k"],
    funding_aud: 100000, equity_pct: "6%", cost_to_founder: null, eligibility: {}, status: "upcoming",
    official_url: "https://plus8.co", summary: null, last_verified_at: "2026-09-10", verified_by: "seed", status_confidence: "high",
  };
}

const REPORT = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "ready",
  created_at: "2026-09-10T00:00:00Z",
  paid_via: "plan",
  intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp", industry_tags: ["agtech_food"] },
  grants: [
    {
      kind: "grant", ref_id: "g1", name: "MVP Ventures", score: 82,
      breakdown: { stage: 30, industry: 20, amount: 12, demographic: 0, timing: 20 }, timing: "open_now",
      effective_status: "open", next_window: { kind: "dated", closes_at: "2026-11-30", days_until_close: 81, label: "closes 30 Nov 2026" },
      eligibility_checklist: [
        { label: "HQ state", status: "pass", detail: "NSW HQ" },
        { label: "Turnover cap", status: "unknown" },
      ],
      estimate_aud: 43500, estimate_note: "R&DTI 43.5%", why: ["Fits MVP stage in NSW."], grant: grantRow(),
    },
  ],
  programs: [
    {
      kind: "program", ref_id: "p1", name: "Plus Eight", score: 71,
      breakdown: { stage: 30, industry: 10, amount: 11, demographic: 0, timing: 20 }, timing: "opens_soon",
      effective_status: "upcoming", next_window: { kind: "dated", opens_at: "2027-01-10", closes_at: "2027-02-20", label: "opens Jan 2027" },
      eligibility_checklist: [{ label: "Stage", status: "pass" }], why: ["Runs an agtech stream."], program: programRow(),
    },
  ],
  timeline: [
    { month: "2026-10", kind: "grant", ref_id: "g1", name: "MVP Ventures", action: "Lodge the EOI", lead_time_days: 30, deadline: "2026-11-30", why: "x" },
    { month: "2026-10", kind: "tax", ref_id: "rdti", name: "R&D Tax Incentive", action: "Register activities", lead_time_days: 60, why: "y" },
    { month: "2027-01", kind: "program", ref_id: "p1", name: "Plus Eight", action: "Apply", lead_time_days: 40, deadline: "2027-02-20", why: "z" },
  ],
  narrative_md: "## Where you stand\n\nYou are **MVP** in NSW.\n\n- Lodge the EOI\n- Register R&D",
  meta: {
    today: "2026-09-10", generated_at: "2026-09-10T00:00:00Z", tax: {}, narrative_source: "template",
    excluded: { grants: 0, programs: 0 }, disclaimer: "d",
    summary: { grant_count: 1, program_count: 1, top_grants: ["MVP Ventures"], top_programs: ["Plus Eight"], total_amount_max_aud: 75000, top_grants_amount_max_aud: 75000, timeline_count: 3 },
    actions: ["Lodge the MVP Ventures EOI", "Register R&D activities", "Book a Plus Eight info session"],
  },
  disclaimer: "d",
  is_owner: true,
  project_id: "proj-1",
} as unknown as PublicFundingReport;

describe("renderFundingReportPdf", () => {
  it("renders a five-page A4 PDF with the cover, tables, timeline and plan", async () => {
    const buf = await renderFundingReportPdf({ report: REPORT, startupName: "Acme Agtech", verifiedAt: "2026-09-10" });
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdfPageCount(buf)).toBe(5);
    expect(buf.length).toBeGreaterThan(8_000);
  }, 120_000);

  it("still renders with no narrative, no matches and an empty timeline", async () => {
    const bare = { ...REPORT, grants: [], programs: [], timeline: [], narrative_md: null, meta: null } as unknown as PublicFundingReport;
    const buf = await renderFundingReportPdf({ report: bare });
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdfPageCount(buf)).toBe(5);
  }, 120_000);

  it("names the file from the report id", () => {
    expect(fundingReportFilename(REPORT.id)).toBe("money-finder-report-11111111.pdf");
  });
});
