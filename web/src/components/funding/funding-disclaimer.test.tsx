// Colocated tests for FundingDisclaimer + StatusChip + IntakeCalendar (T0241).
// renderToStaticMarkup — this workspace does not install @testing-library/react.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import { buildIntakeCalendar } from "@/lib/funding/directory";
import { FUNDING_DIRECTORY_SURFACE, FundingDisclaimer, fundingDisclaimerText } from "./funding-disclaimer";
import { StatusChip } from "./status-chip";
import { IntakeCalendar } from "./intake-calendar";

const REQUIRED_PHRASES = [
  "General information only",
  "Government grant information is free",
  "official portal",
  "verify every detail on the official site",
  "not an approval",
  "registered tax agent",
  "Australian Financial Services Licence",
  "GST may apply",
  "analysis",
] as const;

describe("FundingDisclaimer — source of truth", () => {
  it("renders the registry surface, not a private copy", () => {
    expect(FUNDING_DIRECTORY_SURFACE).toBe(DISCLAIMER_SURFACES.funding_directory);
  });
  it("plain text carries every §5f phrase and no markdown markers", () => {
    const text = fundingDisclaimerText();
    for (const p of REQUIRED_PHRASES) expect(text, p).toContain(p);
    expect(text).not.toContain("**");
  });
  it("renders attribution and the last-verified date from the page, with a fallback", () => {
    const html = renderToStaticMarkup(<FundingDisclaimer lastVerifiedAt="2026-09-10" />);
    expect(html).toContain('data-surface="funding_directory"');
    expect(html).toContain("Commonwealth-sourced descriptions © Commonwealth of Australia, CC BY 3.0 AU; state sources CC BY 4.0.");
    expect(html).toContain("Last verified 10 Sep 2026.");
    expect(html).toContain('href="/legal/disclaimers"');
    expect(renderToStaticMarkup(<FundingDisclaimer lastVerifiedAt={null} />)).toContain("Verification date not yet recorded.");
  });
});

describe("StatusChip", () => {
  it("labels each status and appends the close date or note", () => {
    expect(renderToStaticMarkup(<StatusChip status="open" closes_at="2026-11-08" />)).toContain("closes 8 Nov 2026");
    expect(renderToStaticMarkup(<StatusChip status="closed" />)).toContain("Closed — do not apply");
    expect(renderToStaticMarkup(<StatusChip status="paused" next_round_note="Back in 2027" />)).toContain("Back in 2027");
    expect(renderToStaticMarkup(<StatusChip status="upcoming" applications_close="2027-03" />)).toContain(
      "applications close Mar 2027",
    );
  });
});

describe("IntakeCalendar", () => {
  it("renders twelve month cells, links each event to the program page, and an empty state", () => {
    const now = new Date(Date.UTC(2026, 8, 1));
    const months = buildIntakeCalendar(
      [
        {
          id: "syd-x",
          name: "X Accelerator",
          operator: null,
          program_type: "accelerator",
          city: "Sydney",
          capital: "Sydney",
          state: "NSW",
          venue: null,
          stage_tags: [],
          industry_tags: [],
          demographic_tags: [],
          length_weeks: null,
          intake_months: [],
          applications_open: null,
          applications_close: "2026-11-08",
          next_cohort_start: null,
          benefits: [],
          funding_aud: null,
          equity_pct: null,
          cost_to_founder: null,
          eligibility: {},
          status: "open",
          official_url: "https://x.example",
          summary: null,
          last_verified_at: null,
          verified_by: "seed",
          status_confidence: "medium",
        },
      ],
      now,
    );
    const html = renderToStaticMarkup(<IntakeCalendar months={months} />);
    expect(html.match(/data-month="/g)).toHaveLength(12);
    expect(html).toContain('data-month="2026-11"');
    expect(html).toContain('href="/funding/programs/sydney/syd-x"');
    expect(html).toContain("Applications close · 8 November");
    expect(renderToStaticMarkup(<IntakeCalendar months={buildIntakeCalendar([], now)} />)).toContain("No dated intakes");
  });
});
