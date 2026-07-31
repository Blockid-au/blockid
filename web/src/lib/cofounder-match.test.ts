import { describe, it, expect } from "vitest";
import {
  LOCATIONS,
  ROLE_TAGS,
  TIME_COMMITMENTS,
  STAGES,
  VISIBILITIES,
  cofounderProfileSchema,
  anonymizeName,
  type CofounderProfileInput,
} from "./cofounder-match";

// Colocated vitest for the shared cofounder-match client/server module
// (docs/plans/atlassian-standard-mapping-goal.md P4 walkthrough wiring —
// /tools/cofounder-match is one of the founder-facing surfaces the
// walkthrough drops into, and the schema below is imported from both
// the API route and the client form so a silent enum drift or a widening
// of the trim/lower-case/min-length gates would corrupt either surface).
// Pure module — no fakes needed; every assertion is deterministic.

function baseValidInput(): CofounderProfileInput {
  return {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    location: "Sydney",
    lookingFor: ["Technical cofounder"],
    iAm: ["Commercial cofounder"],
    timeCommitment: "FT-now",
    stage: "Idea",
    visibility: "directory",
  };
}

describe("enum option lists", () => {
  it("LOCATIONS ships the canonical AU-first list with no duplicates", () => {
    expect(LOCATIONS).toEqual([
      "Sydney",
      "Parramatta",
      "Melbourne",
      "Brisbane",
      "Other AU",
      "International",
    ]);
    expect(new Set(LOCATIONS).size).toBe(LOCATIONS.length);
    // Sydney leads — pins the AU-first ordering the /tools/cofounder-match form renders.
    expect(LOCATIONS[0]).toBe("Sydney");
  });

  it("ROLE_TAGS carries exactly the 4 canonical roles with no duplicates", () => {
    expect(ROLE_TAGS).toEqual([
      "Technical cofounder",
      "Commercial cofounder",
      "Designer",
      "Domain expert",
    ]);
    expect(new Set(ROLE_TAGS).size).toBe(ROLE_TAGS.length);
    expect(ROLE_TAGS.length).toBe(4);
  });

  it("TIME_COMMITMENTS covers the 4 canonical availability bands", () => {
    expect(TIME_COMMITMENTS).toEqual(["FT-now", "FT-3mo", "PT-now", "Exploring"]);
    expect(new Set(TIME_COMMITMENTS).size).toBe(4);
  });

  it("STAGES walks Idea → Paying users in order", () => {
    expect(STAGES).toEqual([
      "Idea",
      "Validating",
      "Prototype",
      "MVP",
      "Paying users",
    ]);
    expect(new Set(STAGES).size).toBe(5);
  });

  it("VISIBILITIES exposes only directory | private", () => {
    expect(VISIBILITIES).toEqual(["directory", "private"]);
    expect(new Set(VISIBILITIES).size).toBe(2);
  });

  it("enum lists are non-empty and every value is a trimmed non-empty string", () => {
    for (const list of [LOCATIONS, ROLE_TAGS, TIME_COMMITMENTS, STAGES, VISIBILITIES]) {
      expect(list.length).toBeGreaterThan(0);
      for (const v of list) {
        expect(typeof v).toBe("string");
        expect(v.trim()).toBe(v);
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("cofounderProfileSchema — happy path", () => {
  it("accepts a minimal valid input and stamps the default visibility", () => {
    const input = { ...baseValidInput() } as Record<string, unknown>;
    delete input.visibility;
    const parsed = cofounderProfileSchema.parse(input);
    expect(parsed.visibility).toBe("directory");
    expect(parsed.fullName).toBe("Ada Lovelace");
  });

  it("preserves an explicit visibility=private", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      visibility: "private",
    });
    expect(parsed.visibility).toBe("private");
  });

  it("trims fullName and treats surrounding whitespace as non-signalling", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      fullName: "   Grace Hopper   ",
    });
    expect(parsed.fullName).toBe("Grace Hopper");
  });

  it("normalises email to lowercase and trims surrounding whitespace", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      email: "  ADA@Example.COM  ",
    });
    expect(parsed.email).toBe("ada@example.com");
  });

  it("accepts optional skills up to the 280-char cap after trim", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      skills: "  " + "s".repeat(280) + "  ",
    });
    expect(parsed.skills).toHaveLength(280);
  });

  it("accepts an empty-string skills via the .or(literal('')) branch", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      skills: "",
    });
    expect(parsed.skills).toBe("");
  });

  it("accepts an empty-string ideaPitch via the .or(literal('')) branch", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      ideaPitch: "",
    });
    expect(parsed.ideaPitch).toBe("");
  });

  it("accepts a well-formed https linkedinUrl", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      linkedinUrl: "https://www.linkedin.com/in/ada",
    });
    expect(parsed.linkedinUrl).toBe("https://www.linkedin.com/in/ada");
  });

  it("accepts an empty-string linkedinUrl via the .or(literal('')) branch", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      linkedinUrl: "",
    });
    expect(parsed.linkedinUrl).toBe("");
  });

  it("accepts multi-role selections up to the ROLE_TAGS length cap", () => {
    const parsed = cofounderProfileSchema.parse({
      ...baseValidInput(),
      lookingFor: [...ROLE_TAGS],
      iAm: [...ROLE_TAGS],
    });
    expect(parsed.lookingFor).toHaveLength(ROLE_TAGS.length);
    expect(parsed.iAm).toHaveLength(ROLE_TAGS.length);
  });
});

describe("cofounderProfileSchema — validation failures", () => {
  it("rejects fullName under 2 chars with the friendly copy", () => {
    const res = cofounderProfileSchema.safeParse({ ...baseValidInput(), fullName: "A" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "Please enter your full name")).toBe(true);
    }
  });

  it("rejects fullName over 120 chars", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      fullName: "x".repeat(121),
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "Name is too long")).toBe(true);
    }
  });

  it("rejects a malformed email with the friendly copy", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      email: "not-an-email",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "Enter a valid email")).toBe(true);
    }
  });

  it("rejects an unknown location", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      location: "Perth",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an empty lookingFor with the min(1) copy", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      lookingFor: [],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message === "Pick at least one role you're looking for"),
      ).toBe(true);
    }
  });

  it("rejects an empty iAm with the min(1) copy", () => {
    const res = cofounderProfileSchema.safeParse({ ...baseValidInput(), iAm: [] });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "Pick at least one role you bring")).toBe(true);
    }
  });

  it("rejects an unknown role tag in lookingFor", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      lookingFor: ["CFO"],
    });
    expect(res.success).toBe(false);
  });

  it("rejects skills over the 280-char cap after trim", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      skills: "s".repeat(281),
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message === "Keep skills under 280 characters"),
      ).toBe(true);
    }
  });

  it("rejects an ideaPitch over 500 chars after trim", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      ideaPitch: "p".repeat(501),
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.message === "Keep your pitch under 500 characters"),
      ).toBe(true);
    }
  });

  it("rejects a non-URL linkedinUrl", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      linkedinUrl: "linkedin.com/in/ada",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "Enter a valid URL")).toBe(true);
    }
  });

  it("rejects an unknown timeCommitment", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      timeCommitment: "Weekends",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown stage", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      stage: "Series-A",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown visibility", () => {
    const res = cofounderProfileSchema.safeParse({
      ...baseValidInput(),
      visibility: "public",
    });
    expect(res.success).toBe(false);
  });
});

describe("anonymizeName", () => {
  it("returns 'Anonymous' on an empty string", () => {
    expect(anonymizeName("")).toBe("Anonymous");
  });

  it("returns 'Anonymous' on whitespace-only input", () => {
    expect(anonymizeName("   \t  ")).toBe("Anonymous");
  });

  it("returns just the first name when there is no last name", () => {
    expect(anonymizeName("Ada")).toBe("Ada");
  });

  it("renders 'First L.' for a two-word name", () => {
    expect(anonymizeName("Ada Lovelace")).toBe("Ada L.");
  });

  it("uppercases the last initial even when the last name is lowercase", () => {
    expect(anonymizeName("ada lovelace")).toBe("ada L.");
  });

  it("takes the LAST word for the initial across a 3-part name", () => {
    // Pins the "last name = last space-separated token" rule (not middle name).
    expect(anonymizeName("Ada Byron Lovelace")).toBe("Ada L.");
  });

  it("collapses multiple internal spaces before splitting", () => {
    expect(anonymizeName("Ada    Lovelace")).toBe("Ada L.");
  });

  it("trims surrounding whitespace before splitting", () => {
    expect(anonymizeName("  Ada Lovelace  ")).toBe("Ada L.");
  });

  it("handles a single-character last name", () => {
    expect(anonymizeName("Ada X")).toBe("Ada X.");
  });

  it("handles a hyphenated last name — takes the first char verbatim (no split on '-')", () => {
    expect(anonymizeName("Ada Lovelace-Byron")).toBe("Ada L.");
  });
});
