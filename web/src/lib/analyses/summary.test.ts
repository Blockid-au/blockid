// Colocated spec for the saved-analysis presentation helpers.
//
// These functions are the only thing standing between a founder and a row of
// raw enums (`existing_company_text`, `svi_total: 41.2199`). Pinning them here
// keeps the /analyze permalink panel, the workspace list, and /analyze/[id]
// describing the same run with the same words.

import { describe, expect, it } from "vitest";

import {
  claimedMessage,
  describeInput,
  formatRunDate,
  formatRunDateTime,
  formatSviTotal,
  formatValuationMid,
  inputKindLabel,
  savedAnalysisPath,
  savedAnalysisUrl,
  parseClaimedParam,
  stageText,
  tidyUrl,
  withClaimedParam,
} from "./summary";

describe("savedAnalysisPath / savedAnalysisUrl", () => {
  it("nests the run under the tool that produced it", () => {
    expect(savedAnalysisPath("abc")).toBe("/analyze/abc");
  });

  it("joins an origin without doubling the slash", () => {
    expect(savedAnalysisUrl("abc", "https://blockid.au/")).toBe(
      "https://blockid.au/analyze/abc",
    );
    expect(savedAnalysisUrl("abc", "https://blockid.au")).toBe(
      "https://blockid.au/analyze/abc",
    );
  });

  it("degrades to a relative path when there is no origin (SSR)", () => {
    expect(savedAnalysisUrl("abc", "")).toBe("/analyze/abc");
  });
});

describe("inputKindLabel", () => {
  it("never leaks the raw enum", () => {
    expect(inputKindLabel("pitch_deck")).toBe("Pitch deck");
    expect(inputKindLabel("website")).toBe("Website");
    expect(inputKindLabel("idea_text")).toBe("Written idea");
    expect(inputKindLabel("existing_company_text")).toBe("Company description");
  });

  it("falls back for an unknown or missing kind", () => {
    expect(inputKindLabel("something_new")).toBe("Analysis");
    expect(inputKindLabel(null)).toBe("Analysis");
  });
});

describe("tidyUrl", () => {
  it("drops the scheme and trailing slash", () => {
    expect(tidyUrl("https://example.com/")).toBe("example.com");
    expect(tidyUrl("http://example.com/pricing")).toBe("example.com/pricing");
  });
});

describe("describeInput", () => {
  it("prefers the filename", () => {
    expect(
      describeInput({
        input_kind: "pitch_deck",
        input_filename: "seed-deck.pdf",
        input_url: "https://x.io",
      }),
    ).toBe("seed-deck.pdf");
  });

  it("falls back to a tidied url", () => {
    expect(
      describeInput({ input_kind: "website", input_url: "https://x.io/" }),
    ).toBe("x.io");
  });

  it("always returns something describable", () => {
    expect(describeInput({ input_kind: "idea_text" })).toBe("Written idea");
    expect(describeInput({})).toBe("Analysis");
    expect(describeInput({ input_filename: "  ", input_url: "  " })).toBe(
      "Analysis",
    );
  });
});

describe("date formatting", () => {
  it("formats a date in Australian order", () => {
    expect(formatRunDate("2026-09-08T04:00:00.000Z")).toMatch(/2026/);
    expect(formatRunDate("2026-09-08T04:00:00.000Z")).toMatch(/Sep/);
  });

  it("returns an empty string for junk rather than 'Invalid Date'", () => {
    expect(formatRunDate("not-a-date")).toBe("");
    expect(formatRunDate(null)).toBe("");
    expect(formatRunDateTime("not-a-date")).toBe("");
    expect(formatRunDateTime(undefined)).toBe("");
  });

  it("includes a time in the date-time form", () => {
    expect(formatRunDateTime("2026-09-08T04:00:00.000Z")).toMatch(/\d:\d{2}/);
  });
});

describe("formatValuationMid", () => {
  it("formats a real midpoint", () => {
    expect(formatValuationMid(1_500_000)).toBe("A$1.5M");
    expect(formatValuationMid(250_000)).toBe("A$250K");
  });

  it("shows a dash rather than A$0 for a missing valuation", () => {
    expect(formatValuationMid(null)).toBe("—");
    expect(formatValuationMid(0)).toBe("—");
    expect(formatValuationMid(Number.NaN)).toBe("—");
  });
});

describe("formatSviTotal", () => {
  it("rounds to a whole score", () => {
    expect(formatSviTotal(41.2199)).toBe("41");
    expect(formatSviTotal(0)).toBe("0");
  });

  it("shows a dash when the run has no score", () => {
    expect(formatSviTotal(null)).toBe("—");
  });
});

describe("stageText", () => {
  it("prefers the stored label", () => {
    expect(stageText({ stage_label: "Pre-seed", stage: 1 })).toBe("Pre-seed");
  });

  it("falls back to the numeric stage, including stage 0", () => {
    expect(stageText({ stage: 0 })).toBe("Stage 0");
    expect(stageText({ stage_label: "   ", stage: 2 })).toBe("Stage 2");
  });

  it("dashes out a row with neither", () => {
    expect(stageText({})).toBe("—");
  });
});

describe("claimedMessage", () => {
  it("says nothing when nothing was claimed", () => {
    expect(claimedMessage(0)).toBeNull();
    expect(claimedMessage(-1)).toBeNull();
    expect(claimedMessage(Number.NaN)).toBeNull();
  });

  it("uses the singular for one run", () => {
    expect(claimedMessage(1)).toContain("The analysis you ran");
  });

  it("uses the real count, not a vague plural", () => {
    expect(claimedMessage(3)).toBe(
      "3 analyses you ran before signing up are now saved to your account.",
    );
  });
});

describe("withClaimedParam / parseClaimedParam", () => {
  it("appends the count with the right separator", () => {
    expect(withClaimedParam("/analyze/x", 2)).toBe("/analyze/x?claimed=2");
    expect(withClaimedParam("/analyze/x?a=1", 2)).toBe("/analyze/x?a=1&claimed=2");
  });

  it("leaves the target alone when nothing was claimed", () => {
    expect(withClaimedParam("/dashboard", 0)).toBe("/dashboard");
    expect(withClaimedParam("/dashboard", Number.NaN)).toBe("/dashboard");
  });

  it("round-trips, and rejects junk", () => {
    expect(parseClaimedParam("3")).toBe(3);
    expect(parseClaimedParam("0")).toBe(0);
    expect(parseClaimedParam("-2")).toBe(0);
    expect(parseClaimedParam("abc")).toBe(0);
    expect(parseClaimedParam(null)).toBe(0);
  });
});
