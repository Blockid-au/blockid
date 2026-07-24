import { describe, expect, it } from "vitest";
import {
  canSubmitPreview,
  makeEmptyLandingPagePreviewFormState,
  parseBullets,
  reasonCopy,
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
});
