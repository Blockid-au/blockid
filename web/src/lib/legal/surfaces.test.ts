import { describe, it, expect } from "vitest";
import {
  DISCLAIMER_SURFACES,
  getSurface,
  getSurfaceIds,
  surfaceAppliesTo,
  type DisclaimerSurface,
} from "./surfaces";
import { DISCLAIMER_VERSIONS, isKnownDisclaimerKind } from "./versions";

// Canonical surface IDs shipped by the registry. If a surface is added or
// removed, this list is the single point of drift — CI catches the mismatch
// before a stale DisclaimerBlock re-consent flow ships.
const CANONICAL_SURFACE_IDS = [
  "svi_report",
  "valuation_output",
  "equity_offer_page",
  "tokenised_share_view",
  "general_all",
] as const;

describe("DISCLAIMER_SURFACES registry integrity", () => {
  it("ships every canonical surface id and no orphans", () => {
    const ids = Object.keys(DISCLAIMER_SURFACES).sort();
    const expected = [...CANONICAL_SURFACE_IDS].sort();
    expect(ids).toEqual(expected);
  });

  it("every surface.kind resolves in DISCLAIMER_VERSIONS", () => {
    for (const [id, surface] of Object.entries(DISCLAIMER_SURFACES)) {
      expect(
        isKnownDisclaimerKind(surface.kind),
        `surface '${id}' points at unknown disclaimer kind '${surface.kind}'`,
      ).toBe(true);
      expect(DISCLAIMER_VERSIONS[surface.kind]).toMatch(/^v\d+\.\d+-\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every surface has non-empty label and body_md", () => {
    for (const [id, surface] of Object.entries(DISCLAIMER_SURFACES)) {
      expect(surface.label.length, `${id} label`).toBeGreaterThan(0);
      expect(surface.body_md.length, `${id} body_md`).toBeGreaterThan(50);
    }
  });

  it("every surface has a Vietnamese placeholder marked [TODO-VI] (translation not shippable without counsel review)", () => {
    for (const [id, surface] of Object.entries(DISCLAIMER_SURFACES)) {
      expect(surface.body_md_vi, `${id} body_md_vi`).toBeDefined();
      expect(surface.body_md_vi, `${id} VI copy`).toMatch(/\[TODO-VI\]/);
    }
  });

  it("jurisdictions field is either ['*'] or upper-case ISO 3166-1 alpha-2 codes", () => {
    const ISO_ALPHA2 = /^[A-Z]{2}$/;
    for (const [id, surface] of Object.entries(DISCLAIMER_SURFACES)) {
      expect(surface.jurisdictions.length, `${id} jurisdictions`).toBeGreaterThan(0);
      for (const j of surface.jurisdictions) {
        expect(j === "*" || ISO_ALPHA2.test(j), `${id} jurisdiction '${j}'`).toBe(true);
      }
    }
  });
});

describe("svi_report surface", () => {
  const surface = DISCLAIMER_SURFACES.svi_report;

  it("is a global (jurisdictions=['*']) not_financial_advice surface", () => {
    expect(surface.kind).toBe("not_financial_advice");
    expect(surface.jurisdictions).toEqual(["*"]);
  });

  it("cites the Auschain entity identifiers verbatim (per business_entity memory)", () => {
    expect(surface.body_md).toContain("Auschain PTY LTD");
    expect(surface.body_md).toContain("ACN 659 615 111");
    expect(surface.body_md).toContain("ABN 79 659 615 111");
  });

  it("carries the Corporations Act 2001 (Cth) anchor + AFSL non-advice line", () => {
    expect(surface.body_md).toContain("Corporations Act 2001 (Cth)");
    expect(surface.body_md).toMatch(/AFSL/);
    expect(surface.body_md).toMatch(/not.*financial.*advice/i);
  });
});

describe("valuation_output surface — General Advice Warning", () => {
  const surface = DISCLAIMER_SURFACES.valuation_output;

  it("is an AU-scoped general_advice_warning surface", () => {
    expect(surface.kind).toBe("general_advice_warning");
    expect(surface.jurisdictions).toEqual(["AU"]);
  });

  it("cites s949A Corporations Act (the statutory anchor for General Advice Warning)", () => {
    expect(surface.body_md).toContain("s949A");
  });

  it("states BlockID.au does not hold an AFSL and disclaims personal advice", () => {
    expect(surface.body_md).toMatch(/does not hold an AFSL/);
    expect(surface.body_md).toMatch(/personal financial product advice/);
  });
});

describe("equity_offer_page surface", () => {
  const surface = DISCLAIMER_SURFACES.equity_offer_page;

  it("is an AU-scoped equity_offer_disclaimer surface", () => {
    expect(surface.kind).toBe("equity_offer_disclaimer");
    expect(surface.jurisdictions).toEqual(["AU"]);
  });

  it("declares no securities are being offered (Corporations Act s708 / s708(8) / s708(11) anchors)", () => {
    expect(surface.body_md).toMatch(/not an offer/i);
    expect(surface.body_md).toContain("s708");
    // The 8 and 11 sub-paragraphs are the sophisticated/professional carve-outs.
    expect(surface.body_md).toMatch(/s708\(8\)\/\(11\)|s708\(8\)|s708\(11\)/);
  });

  it("requires internal legal review passed before any issuance (matches gates.assertLegalReviewPassed)", () => {
    expect(surface.body_md).toMatch(/internal legal review/i);
  });
});

describe("tokenised_share_view surface", () => {
  const surface = DISCLAIMER_SURFACES.tokenised_share_view;

  it("is an AU-scoped equity_offer_disclaimer surface (shares the kind with equity_offer_page)", () => {
    expect(surface.kind).toBe("equity_offer_disclaimer");
    expect(surface.jurisdictions).toEqual(["AU"]);
  });

  it("pins the display-only / not-tradable posture — legal title stays off-chain", () => {
    expect(surface.body_md).toMatch(/display-only/i);
    expect(surface.body_md).toMatch(/read-only/i);
    expect(surface.body_md).toMatch(/not.*security token/i);
    expect(surface.body_md).toMatch(/Legal title.*share register/i);
  });
});

describe("general_all surface", () => {
  const surface = DISCLAIMER_SURFACES.general_all;

  it("is a global not_financial_advice footer", () => {
    expect(surface.kind).toBe("not_financial_advice");
    expect(surface.jurisdictions).toEqual(["*"]);
  });

  it("interpolates the current DISCLAIMER_VERSIONS.tos and DISCLAIMER_VERSIONS.privacy values verbatim", () => {
    // The template literal is resolved at module-load, so bumping either version
    // in versions.ts should surface here without a manual edit to surfaces.ts.
    expect(surface.body_md).toContain(`(${DISCLAIMER_VERSIONS.tos})`);
    expect(surface.body_md).toContain(`(${DISCLAIMER_VERSIONS.privacy})`);
    // Also assert the literal is fully substituted (no un-resolved `${...}`).
    expect(surface.body_md).not.toMatch(/\$\{/);
  });

  it("cites the Sydney NSW registered address per business_entity memory", () => {
    expect(surface.body_md).toContain("Sydney NSW");
  });
});

describe("getSurface()", () => {
  it("returns the DisclaimerSurface for every canonical id", () => {
    for (const id of CANONICAL_SURFACE_IDS) {
      const s = getSurface(id);
      expect(s, `getSurface('${id}')`).not.toBeNull();
      expect(s?.kind).toBe(DISCLAIMER_SURFACES[id].kind);
    }
  });

  it("returns null (not throw) on an unknown id — callers can render a graceful fallback", () => {
    expect(getSurface("does_not_exist")).toBeNull();
    expect(getSurface("")).toBeNull();
    expect(getSurface("nope-nope-nope")).toBeNull();
  });
});

describe("getSurfaceIds()", () => {
  it("returns every canonical id (order-agnostic)", () => {
    const ids = getSurfaceIds().sort();
    const expected = [...CANONICAL_SURFACE_IDS].sort();
    expect(ids).toEqual(expected);
  });

  it("returns the same length as Object.keys(DISCLAIMER_SURFACES)", () => {
    expect(getSurfaceIds().length).toBe(Object.keys(DISCLAIMER_SURFACES).length);
  });
});

describe("surfaceAppliesTo()", () => {
  const globalSurface: DisclaimerSurface = DISCLAIMER_SURFACES.svi_report; // ['*']
  const auSurface: DisclaimerSurface = DISCLAIMER_SURFACES.valuation_output; // ['AU']

  it("a ['*'] surface applies to every jurisdiction", () => {
    expect(surfaceAppliesTo(globalSurface, "AU")).toBe(true);
    expect(surfaceAppliesTo(globalSurface, "US")).toBe(true);
    expect(surfaceAppliesTo(globalSurface, "VN")).toBe(true);
    // Even case-mismatched wildcards — the '*' branch short-circuits.
    expect(surfaceAppliesTo(globalSurface, "us")).toBe(true);
  });

  it("an ['AU'] surface applies only to AU — matched case-insensitively via toUpperCase", () => {
    expect(surfaceAppliesTo(auSurface, "AU")).toBe(true);
    expect(surfaceAppliesTo(auSurface, "au")).toBe(true);
    expect(surfaceAppliesTo(auSurface, "Au")).toBe(true);
  });

  it("an ['AU'] surface does NOT apply to US / VN / other jurisdictions", () => {
    expect(surfaceAppliesTo(auSurface, "US")).toBe(false);
    expect(surfaceAppliesTo(auSurface, "VN")).toBe(false);
    expect(surfaceAppliesTo(auSurface, "GB")).toBe(false);
  });

  it("empty jurisdiction string does not accidentally match ['AU'] (guards a caller passing '' when the header is missing)", () => {
    expect(surfaceAppliesTo(auSurface, "")).toBe(false);
  });

  it("respects multi-jurisdiction arrays when a surface adds one in the future", () => {
    const multi: DisclaimerSurface = {
      kind: "equity_offer_disclaimer",
      jurisdictions: ["AU", "NZ"],
      label: "test",
      body_md: "test",
    };
    expect(surfaceAppliesTo(multi, "AU")).toBe(true);
    expect(surfaceAppliesTo(multi, "nz")).toBe(true);
    expect(surfaceAppliesTo(multi, "US")).toBe(false);
  });
});
