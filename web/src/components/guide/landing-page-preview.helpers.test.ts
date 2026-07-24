import { describe, expect, it } from "vitest";
import {
  applyCmoDraft,
  canApplyCmoDraft,
  canSubmitPreview,
  makeEmptyCmoDraftFormState,
  makeEmptyLandingPagePreviewFormState,
  parseBullets,
  parseCmoDraftLines,
  reasonCopy,
  toCmoDraftInput,
  toLandingPageInput,
} from "./landing-page-preview.helpers";

describe("landing-page-preview helpers", () => {
  describe("makeEmptyLandingPagePreviewFormState", () => {
    it("returns a fully-blank slate so the founder must supply every field", () => {
      const s = makeEmptyLandingPagePreviewFormState();
      expect(s.headline).toBe("");
      expect(s.subheadline).toBe("");
      expect(s.bulletsText).toBe("");
      expect(s.cta_label).toBe("");
      expect(s.cta_href).toBe("");
      expect(s.ga4_measurement_id).toBe("");
      expect(s.plausible_domain).toBe("");
      expect(s.brand_name).toBe("");
    });
  });

  describe("parseBullets", () => {
    it("splits on newline and semicolon, trims, drops empties", () => {
      expect(parseBullets("  ")).toEqual([]);
      expect(parseBullets("Cut onboarding\nUnlock GST\n")).toEqual([
        "Cut onboarding",
        "Unlock GST",
      ]);
      expect(parseBullets("A; B ;;C")).toEqual(["A", "B", "C"]);
    });

    it("preserves commas inside a single bullet", () => {
      expect(parseBullets("Cut onboarding from 3 weeks to 3 days, without extra sales headcount")).toEqual([
        "Cut onboarding from 3 weeks to 3 days, without extra sales headcount",
      ]);
    });

    it("returns empty on blank / null-ish input", () => {
      expect(parseBullets("")).toEqual([]);
      expect(parseBullets("\n\n\n")).toEqual([]);
    });
  });

  describe("toLandingPageInput", () => {
    it("omits blank optional fields so the route validator sees them as unsupplied", () => {
      const state = makeEmptyLandingPagePreviewFormState();
      state.headline = "  H  ";
      state.subheadline = " S ";
      state.bulletsText = "one\ntwo";
      state.cta_label = "  Try  ";
      state.cta_href = " /demo ";
      const body = toLandingPageInput(state);
      expect(body).toEqual({
        headline: "H",
        subheadline: "S",
        bullets: ["one", "two"],
        cta_label: "Try",
        cta_href: "/demo",
      });
      expect(Object.prototype.hasOwnProperty.call(body, "ga4_measurement_id")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, "plausible_domain")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, "brand_name")).toBe(false);
    });

    it("passes through populated optional fields (analytics + brand)", () => {
      const state = makeEmptyLandingPagePreviewFormState();
      state.headline = "H";
      state.subheadline = "S";
      state.bulletsText = "b";
      state.cta_label = "L";
      state.cta_href = "/x";
      state.ga4_measurement_id = "  G-ABC123  ";
      state.plausible_domain = "  example.com.au ";
      state.brand_name = " ACME ";
      const body = toLandingPageInput(state);
      expect(body.ga4_measurement_id).toBe("G-ABC123");
      expect(body.plausible_domain).toBe("example.com.au");
      expect(body.brand_name).toBe("ACME");
    });
  });

  describe("canSubmitPreview", () => {
    it("stays disabled while headline + subheadline are both blank", () => {
      const s = makeEmptyLandingPagePreviewFormState();
      expect(canSubmitPreview(s)).toBe(false);
      s.headline = "   ";
      s.subheadline = "\n\n";
      expect(canSubmitPreview(s)).toBe(false);
    });

    it("enables submission as soon as either headline or subheadline is non-blank", () => {
      const withHeadline = makeEmptyLandingPagePreviewFormState();
      withHeadline.headline = "H";
      expect(canSubmitPreview(withHeadline)).toBe(true);
      const withSub = makeEmptyLandingPagePreviewFormState();
      withSub.subheadline = "S";
      expect(canSubmitPreview(withSub)).toBe(true);
    });
  });

  describe("reasonCopy", () => {
    it("returns distinct EN + VI strings for every invalid reason", () => {
      const reasons = [
        "headline_empty",
        "headline_too_long",
        "subheadline_empty",
        "subheadline_too_long",
        "bullet_missing",
        "bullet_too_long",
        "bullet_count_too_low",
        "bullet_count_too_high",
        "cta_label_empty",
        "cta_href_empty",
        "cta_href_invalid",
        "ga4_measurement_id_invalid",
        "plausible_domain_invalid",
      ] as const;
      const en = reasons.map((r) => reasonCopy(r, "en"));
      const vi = reasons.map((r) => reasonCopy(r, "vi"));
      for (const c of en) expect(c.length).toBeGreaterThan(0);
      for (const c of vi) expect(c.length).toBeGreaterThan(0);
      expect(new Set(en).size).toBe(reasons.length);
      expect(new Set(vi).size).toBe(reasons.length);
      expect(reasonCopy("cta_href_invalid", "en")).toContain("javascript:");
      expect(reasonCopy("ga4_measurement_id_invalid", "vi")).toContain("G-");
    });
  });

  // -- P4a-cmo-draft-wire ---------------------------------------------------

  describe("makeEmptyCmoDraftFormState", () => {
    it("returns a fully-blank slate so the founder must supply every field", () => {
      const s = makeEmptyCmoDraftFormState();
      expect(s.productName).toBe("");
      expect(s.oneLiner).toBe("");
      expect(s.personaName).toBe("");
      expect(s.personaObjectionsText).toBe("");
      expect(s.benefitsText).toBe("");
    });
  });

  describe("parseCmoDraftLines", () => {
    it("mirrors parseBullets so objections + benefits round-trip identically", () => {
      expect(parseCmoDraftLines("A\nB")).toEqual(["A", "B"]);
      expect(parseCmoDraftLines("A; B ;;C")).toEqual(["A", "B", "C"]);
      expect(parseCmoDraftLines("")).toEqual([]);
      // Commas inside a single line survive.
      expect(parseCmoDraftLines("Cut onboarding, without extra headcount")).toEqual([
        "Cut onboarding, without extra headcount",
      ]);
    });
  });

  describe("toCmoDraftInput", () => {
    it("omits blank optional fields so the pure builder sees them as unsupplied", () => {
      const empty = toCmoDraftInput(makeEmptyCmoDraftFormState());
      expect(empty).toEqual({});
    });

    it("passes through populated fields and trims whitespace", () => {
      const state = makeEmptyCmoDraftFormState();
      state.productName = "  BlockID  ";
      state.oneLiner = " The dataroom that assembles itself ";
      state.personaName = "  Australian pre-seed founder ";
      state.personaObjectionsText = "Data room takes weeks\nInvestor updates die";
      state.benefitsText = "Save 20 hours a week\nGate every raise on evidence";
      expect(toCmoDraftInput(state)).toEqual({
        productName: "BlockID",
        oneLiner: "The dataroom that assembles itself",
        personaName: "Australian pre-seed founder",
        personaObjections: ["Data room takes weeks", "Investor updates die"],
        benefits: ["Save 20 hours a week", "Gate every raise on evidence"],
      });
    });
  });

  describe("canApplyCmoDraft", () => {
    it("stays disabled while every field is blank", () => {
      expect(canApplyCmoDraft(makeEmptyCmoDraftFormState())).toBe(false);
      const wsOnly = makeEmptyCmoDraftFormState();
      wsOnly.productName = "   ";
      wsOnly.oneLiner = "\n\n";
      wsOnly.benefitsText = "\n";
      wsOnly.personaObjectionsText = ";;";
      expect(canApplyCmoDraft(wsOnly)).toBe(false);
    });

    it("enables auto-draft when any of {oneLiner, productName, benefits, objections} is non-blank", () => {
      const oneLinerOnly = makeEmptyCmoDraftFormState();
      oneLinerOnly.oneLiner = "The dataroom that assembles itself";
      expect(canApplyCmoDraft(oneLinerOnly)).toBe(true);

      const productOnly = makeEmptyCmoDraftFormState();
      productOnly.productName = "BlockID";
      expect(canApplyCmoDraft(productOnly)).toBe(true);

      const benefitsOnly = makeEmptyCmoDraftFormState();
      benefitsOnly.benefitsText = "Save 20 hours a week";
      expect(canApplyCmoDraft(benefitsOnly)).toBe(true);

      const objectionsOnly = makeEmptyCmoDraftFormState();
      objectionsOnly.personaObjectionsText = "Data room takes weeks";
      expect(canApplyCmoDraft(objectionsOnly)).toBe(true);
    });
  });

  describe("applyCmoDraft", () => {
    it("fills every empty field on the preview form from the CMO draft", () => {
      const draft = makeEmptyCmoDraftFormState();
      draft.productName = "BlockID";
      draft.oneLiner = "The dataroom that assembles itself";
      draft.personaName = "Australian pre-seed founder";
      draft.personaObjectionsText = "Data room takes weeks";
      draft.benefitsText = "Save 20 hours a week\nGate every raise on evidence";
      const next = applyCmoDraft(makeEmptyLandingPagePreviewFormState(), draft);
      expect(next.headline).toBe("The dataroom that assembles itself");
      expect(next.subheadline).toContain("Built for Australian pre-seed founder");
      expect(next.bulletsText.split("\n").length).toBeGreaterThanOrEqual(2);
      // buildCmoLandingDraft defaults these when caller omits them.
      expect(next.cta_label).toBe("Start free");
      expect(next.cta_href).toBe("/signup");
      // brand_name falls back to productName inside the builder.
      expect(next.brand_name).toBe("BlockID");
      // Analytics IDs remain empty because the CMO seed didn't provide them.
      expect(next.ga4_measurement_id).toBe("");
      expect(next.plausible_domain).toBe("");
    });

    it("is non-destructive — pre-existing non-blank fields survive the merge", () => {
      const existing = makeEmptyLandingPagePreviewFormState();
      existing.headline = "Founder-typed headline";
      existing.cta_label = "Book demo";
      existing.brand_name = "Custom Brand";
      existing.ga4_measurement_id = "G-EXISTING";
      const draft = makeEmptyCmoDraftFormState();
      draft.productName = "BlockID";
      draft.oneLiner = "The dataroom that assembles itself";
      draft.benefitsText = "Save 20 hours a week";
      const next = applyCmoDraft(existing, draft);
      expect(next.headline).toBe("Founder-typed headline");
      expect(next.cta_label).toBe("Book demo");
      expect(next.brand_name).toBe("Custom Brand");
      expect(next.ga4_measurement_id).toBe("G-EXISTING");
      // The empty subheadline / bullets / cta_href still get filled.
      expect(next.subheadline.length).toBeGreaterThan(0);
      expect(next.bulletsText).toContain("Save 20 hours a week");
      expect(next.cta_href).toBe("/signup");
    });

    it("whitespace-only existing values are treated as empty and get overwritten", () => {
      const existing = makeEmptyLandingPagePreviewFormState();
      existing.headline = "   ";
      existing.subheadline = "\n\n";
      const draft = makeEmptyCmoDraftFormState();
      draft.oneLiner = "The dataroom that assembles itself";
      const next = applyCmoDraft(existing, draft);
      expect(next.headline).toBe("The dataroom that assembles itself");
      expect(next.subheadline.length).toBeGreaterThan(0);
    });

    it("blank draft input is a no-op — nothing gets overwritten", () => {
      const existing = makeEmptyLandingPagePreviewFormState();
      existing.headline = "Founder-typed headline";
      const next = applyCmoDraft(existing, makeEmptyCmoDraftFormState());
      expect(next.headline).toBe("Founder-typed headline");
      // buildCmoLandingDraft still returns default cta_label / cta_href, so the
      // blank cta fields on the existing state get filled from those defaults.
      expect(next.cta_label).toBe("Start free");
      expect(next.cta_href).toBe("/signup");
    });
  });
});
