// Tests for buildCmoLandingDraft — P4a-cmo-draft.
//
// Asserts:
//   1. Happy path: valid CMO deep-pass input → LandingPageInput that passes
//      validateLandingPageInput().
//   2. Bullet ordering: positive benefits[] first, objections inverted second,
//      capped at LANDING_PAGE_MAX_BULLETS with dedupe.
//   3. Objection inversion: "The X is Y" → "No more X is Y"; "No more X"
//      passes through unchanged (no double-negative).
//   4. Headline / subheadline truncation at the max lengths with ellipsis.
//   5. Persona + primary-objection composition rules for the subheadline.
//   6. Optional fields (brand_name, ga4_measurement_id, plausible_domain,
//      ctaLabel, ctaHref) collapse to defaults / omitted keys.
//   7. Blank productName / oneLiner returns "" so the validator surfaces the
//      gap rather than a manufactured lie.

import { describe, it, expect } from "vitest";
import {
  LANDING_PAGE_MAX_BULLET_LENGTH,
  LANDING_PAGE_MAX_BULLETS,
  LANDING_PAGE_MAX_HEADLINE_LENGTH,
  LANDING_PAGE_MAX_SUBHEADLINE_LENGTH,
  validateLandingPageInput,
} from "./preview";
import {
  buildCmoLandingDraft,
  deriveBullets,
  deriveHeadline,
  deriveSubheadline,
  objectionToBullet,
} from "./cmo-draft";

describe("buildCmoLandingDraft", () => {
  it("happy path: produces a LandingPageInput that passes validateLandingPageInput", () => {
    const input = buildCmoLandingDraft({
      productName: "BlockID",
      oneLiner: "The dataroom that assembles itself",
      personaName: "Australian pre-seed founder",
      personaObjections: [
        "Data room takes weeks to organise",
        "Investors ghost after asking for a data room",
      ],
      benefits: [
        "Ship a Blackbird-standard data room in one afternoon",
        "Track investor views without leaving your dashboard",
      ],
      ctaLabel: "Start free",
      ctaHref: "/signup",
      brandName: "BlockID",
      ga4MeasurementId: "G-ABC12345",
    });

    const validation = validateLandingPageInput(input);
    expect(validation.valid).toBe(true);
    expect(validation.reasons).toEqual([]);
    expect(input.headline).toBe("The dataroom that assembles itself");
    expect(input.subheadline).toContain("Australian pre-seed founder");
    expect(input.subheadline).toContain("without ");
    expect(input.bullets.length).toBeGreaterThanOrEqual(2);
    expect(input.bullets[0]).toContain("Blackbird-standard");
    expect(input.cta_label).toBe("Start free");
    expect(input.cta_href).toBe("/signup");
    expect(input.brand_name).toBe("BlockID");
    expect(input.ga4_measurement_id).toBe("G-ABC12345");
    expect(input.plausible_domain).toBeUndefined();
  });

  it("defaults ctaLabel / ctaHref / brand_name when caller omits them", () => {
    const input = buildCmoLandingDraft({
      productName: "Zeta",
      oneLiner: "One-line pitch",
    });
    expect(input.cta_label).toBe("Start free");
    expect(input.cta_href).toBe("/signup");
    expect(input.brand_name).toBe("Zeta");
    expect(input.ga4_measurement_id).toBeUndefined();
    expect(input.plausible_domain).toBeUndefined();
  });

  it("blank oneLiner surfaces headline_empty + subheadline_empty via the validator", () => {
    const input = buildCmoLandingDraft({ productName: "Zeta", oneLiner: "" });
    const v = validateLandingPageInput(input);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("headline_empty");
    expect(v.reasons).toContain("subheadline_empty");
  });

  it("blank productName + oneLiner still surfaces every required gap", () => {
    const input = buildCmoLandingDraft({});
    const v = validateLandingPageInput(input);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("headline_empty");
    expect(v.reasons).toContain("subheadline_empty");
    expect(v.reasons).toContain("bullet_count_too_low");
    // cta_label + cta_href fall back to defaults, so no cta_* reasons.
    expect(v.reasons).not.toContain("cta_label_empty");
    expect(v.reasons).not.toContain("cta_href_empty");
  });
});

describe("deriveHeadline", () => {
  it("returns the oneLiner verbatim when it fits", () => {
    expect(deriveHeadline("Zeta", "Short pitch")).toBe("Short pitch");
  });

  it("truncates with ellipsis when the oneLiner is too long", () => {
    const long = "x".repeat(LANDING_PAGE_MAX_HEADLINE_LENGTH + 40);
    const h = deriveHeadline("Zeta", long);
    expect(h.length).toBeLessThanOrEqual(LANDING_PAGE_MAX_HEADLINE_LENGTH);
    expect(h.endsWith("…")).toBe(true);
  });

  it("returns empty string on blank oneLiner", () => {
    expect(deriveHeadline("Zeta", "")).toBe("");
    expect(deriveHeadline("Zeta", "   ")).toBe("");
  });
});

describe("deriveSubheadline", () => {
  it("composes persona + oneLiner + primary objection when all supplied", () => {
    const s = deriveSubheadline(
      "The dataroom that assembles itself",
      "Australian pre-seed founder",
      ["Data room takes weeks to organise"],
    );
    expect(s).toBe(
      "Built for Australian pre-seed founder. The dataroom that assembles itself — without data room takes weeks to organise.",
    );
  });

  it("skips the persona clause when persona is blank", () => {
    const s = deriveSubheadline("The pitch", "", ["Painful thing"]);
    expect(s).toBe("The pitch — without painful thing.");
  });

  it("falls back to the raw oneLiner when persona + objections are absent", () => {
    expect(deriveSubheadline("The pitch", "", [])).toBe("The pitch");
  });

  it("truncates with ellipsis when the composition exceeds max length", () => {
    const oneLiner = "Long pitch " + "x".repeat(LANDING_PAGE_MAX_SUBHEADLINE_LENGTH);
    const s = deriveSubheadline(oneLiner, "Persona", ["Long objection"]);
    expect(s.length).toBeLessThanOrEqual(LANDING_PAGE_MAX_SUBHEADLINE_LENGTH);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("deriveBullets", () => {
  it("keeps benefits first, then inverts objections, cap at LANDING_PAGE_MAX_BULLETS", () => {
    const bullets = deriveBullets(
      ["Benefit 1", "Benefit 2"],
      ["Objection 1", "Objection 2", "Objection 3", "Objection 4", "Objection 5"],
    );
    expect(bullets.length).toBe(LANDING_PAGE_MAX_BULLETS);
    expect(bullets[0]).toBe("Benefit 1");
    expect(bullets[1]).toBe("Benefit 2");
    expect(bullets[2]).toBe("No more objection 1");
  });

  it("dedupes case-insensitively within benefits + across the inverted-objection layer", () => {
    // Two identical benefits collapse to one; a pre-negated objection that
    // exactly matches an existing benefit collapses too.
    const bullets = deriveBullets(
      ["Ship faster", "SHIP FASTER", "No more waiting"],
      ["No more waiting", "Different pain"],
    );
    expect(bullets).toEqual(["Ship faster", "No more waiting", "No more different pain"]);
  });

  it("truncates long bullets with ellipsis", () => {
    const long = "Cut ".repeat(LANDING_PAGE_MAX_BULLET_LENGTH);
    const bullets = deriveBullets([long], []);
    expect(bullets[0].length).toBeLessThanOrEqual(LANDING_PAGE_MAX_BULLET_LENGTH);
    expect(bullets[0].endsWith("…")).toBe(true);
  });

  it("returns [] on empty input so validator surfaces bullet_count_too_low", () => {
    expect(deriveBullets([], [])).toEqual([]);
  });
});

describe("objectionToBullet", () => {
  it("prefixes plain objections with 'No more ' and lowercases the first letter", () => {
    expect(objectionToBullet("Data room takes weeks")).toBe("No more data room takes weeks");
  });

  it("passes through existing negations unchanged (no double-negative)", () => {
    expect(objectionToBullet("No more manual work")).toBe("No more manual work");
    expect(objectionToBullet("No answer from investors")).toBe("No answer from investors");
    expect(objectionToBullet("Never miss a deadline")).toBe("Never miss a deadline");
  });

  it("strips trailing punctuation before prefixing", () => {
    expect(objectionToBullet("It breaks under load.")).toBe("No more it breaks under load");
    expect(objectionToBullet("Really?!")).toBe("No more really");
  });

  it("returns empty on blank / whitespace input", () => {
    expect(objectionToBullet("")).toBe("");
    expect(objectionToBullet("   ")).toBe("");
  });
});
