// Unit tests — public /startup/[slug] listing pure helpers (subgoal 9).
//
// Coverage:
//   - extractOneLinePitch: interview → description → generated fallback.
//   - extractCards: only surface the 3 slots that have answers.
//   - bandForSvi / labelForBand: bucket cutoffs match plan §Ship1.
//   - displayPct: enforce the 10% platform floor.
//   - tickerFor: falls back through reserved → project → derived.
//   - reportExcerpt: strips markdown, truncates to 240 chars with ellipsis.
//   - buildContactCta: mailto when opted-in, form otherwise.

import { describe, expect, it } from "vitest";
import {
  bandForSvi,
  buildContactCta,
  displayPct,
  extractCards,
  extractOneLinePitch,
  labelForBand,
  reportExcerpt,
  tickerFor,
  type AssembledReportRow,
  type FounderContactRow,
  type InterviewAnswerRow,
  type ProjectPublicRow,
  type ReservedAllocationRow,
} from "./public-listing";

const project = (over: Partial<ProjectPublicRow> = {}): ProjectPublicRow => ({
  id: "proj-1",
  user_id: "user-1",
  slug: "acme",
  name: "Acme Robotics",
  description: null,
  industry: null,
  package_purchased_at: "2026-07-01T00:00:00Z",
  package_ticker: null,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

const answer = (
  step_key: string,
  answer_text: string,
): InterviewAnswerRow => ({
  step_key,
  answer_text,
  char_count: answer_text.length,
});

describe("extractOneLinePitch", () => {
  it("returns the interview one_line_pitch when present", () => {
    expect(
      extractOneLinePitch(
        [answer("one_line_pitch", "  Robots that fold laundry.  ")],
        project(),
      ),
    ).toBe("Robots that fold laundry.");
  });
  it("falls back to project.description", () => {
    expect(
      extractOneLinePitch(
        [],
        project({ description: "  Autonomous fulfilment for SMBs " }),
      ),
    ).toBe("Autonomous fulfilment for SMBs");
  });
  it("generates a tagline from name + industry when nothing is set", () => {
    expect(
      extractOneLinePitch([], project({ name: "Acme", industry: "robotics" })),
    ).toBe("Acme — building in robotics");
  });
});

describe("extractCards", () => {
  it("returns only the 3 slots with populated answers", () => {
    const cards = extractCards([
      answer("problem", "Warehouses can't hire."),
      answer("solution", "Autonomous pickers."),
      answer("unrelated", "ignored"),
    ]);
    expect(cards.map((c) => c.slot)).toEqual(["problem", "solution"]);
    expect(cards[0].title).toBe("The problem");
    expect(cards[1].body).toBe("Autonomous pickers.");
  });
  it("returns an empty list when no interview answers exist", () => {
    expect(extractCards([])).toEqual([]);
  });
});

describe("bandForSvi + labelForBand", () => {
  it.each([
    [null, "seed"],
    [0, "seed"],
    [399, "seed"],
    [400, "growth"],
    [599, "growth"],
    [600, "scale"],
    [799, "scale"],
    [800, "unicorn"],
    [1200, "unicorn"],
  ] as const)("SVI %s → band %s", (raw, expected) => {
    expect(bandForSvi(raw as number | null)).toBe(expected);
  });
  it("labels are human-readable", () => {
    expect(labelForBand("seed")).toBe("Seed / early");
    expect(labelForBand("unicorn")).toBe("Unicorn candidate");
  });
});

describe("displayPct", () => {
  it("clamps below the 10% floor", () => {
    expect(displayPct(5)).toBe(10);
    expect(displayPct(0)).toBe(10);
  });
  it("clamps at 100", () => {
    expect(displayPct(150)).toBe(100);
  });
  it("rounds to a whole percent", () => {
    expect(displayPct(12.4)).toBe(12);
    expect(displayPct(12.6)).toBe(13);
  });
  it("defaults to the floor when the value is nonsense", () => {
    expect(displayPct(undefined)).toBe(10);
    expect(displayPct(null)).toBe(10);
    expect(displayPct(Number.NaN)).toBe(10);
  });
});

describe("tickerFor", () => {
  it("prefers the reserved.ticker_hint when set", () => {
    expect(
      tickerFor(
        { ticker_hint: "acme" } as ReservedAllocationRow,
        project({ name: "ignored" }),
      ),
    ).toBe("ACME");
  });
  it("falls back to project.package_ticker", () => {
    expect(
      tickerFor(null, project({ package_ticker: "roBoT", name: "ignored" })),
    ).toBe("ROBOT");
  });
  it("derives from the project name when no ticker is set", () => {
    expect(tickerFor(null, project({ name: "Acme Robotics" }))).toBe("ACME");
  });
  it("guards against empty derived tickers", () => {
    expect(tickerFor(null, project({ name: "!!!" }))).toBe("COMPANY");
  });
});

describe("reportExcerpt", () => {
  it("prefers executive_summary and strips markdown", () => {
    const row: AssembledReportRow = {
      id: "r1",
      title: "T",
      executive_summary: "## Heading\n\n- [link](https://x) with **bold**",
      full_markdown: "ignored",
      report_type: "package_step_vision",
      public: true,
      created_at: "2026-07-10T00:00:00Z",
    };
    expect(reportExcerpt(row)).toBe("Heading link with bold");
  });
  it("truncates to 240 chars with an ellipsis", () => {
    const long = "a".repeat(500);
    const row: AssembledReportRow = {
      id: "r1",
      title: "T",
      executive_summary: long,
      full_markdown: null,
      report_type: "package_step_vision",
      public: true,
      created_at: "2026-07-10T00:00:00Z",
    };
    const out = reportExcerpt(row);
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildContactCta", () => {
  it("returns a mailto link when the founder opted in", () => {
    const contact: FounderContactRow = {
      email: "founder@example.com",
      display_name: "Sam",
      public_contact_opt_in: true,
    };
    const cta = buildContactCta(contact, "acme");
    expect(cta.kind).toBe("mailto");
    expect(cta.href).toMatch(/^mailto:founder@example.com/);
    expect(cta.href).toContain("acme");
    expect(cta.displayName).toBe("Sam");
  });
  it("falls back to the form endpoint when the founder did not opt in", () => {
    const contact: FounderContactRow = {
      email: "founder@example.com",
      display_name: "Sam",
      public_contact_opt_in: false,
    };
    const cta = buildContactCta(contact, "acme");
    expect(cta.kind).toBe("form");
    expect(cta.href).toBe("/api/startup/acme/contact");
  });
  it("falls back to the form endpoint when the founder row is missing", () => {
    const cta = buildContactCta(null, "acme");
    expect(cta.kind).toBe("form");
    expect(cta.displayName).toBeNull();
  });
});
