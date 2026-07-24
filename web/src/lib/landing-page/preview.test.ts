import { describe, expect, it } from "vitest";

import {
  LANDING_PAGE_MAX_BULLETS,
  LANDING_PAGE_MAX_HEADLINE_LENGTH,
  renderLandingPageHtml,
  renderLandingPageMarkdown,
  validateLandingPageInput,
  type LandingPageInput,
} from "./preview";

function goodInput(over: Partial<LandingPageInput> = {}): LandingPageInput {
  return {
    headline: "Ship your MVP in a week",
    subheadline: "AU-flavoured founder tooling — from Day-0 idea to Series-A dataroom.",
    bullets: [
      "GA4 stamped landing pages in one click",
      "AU-standard data room seeded from Chapter 1",
      "SVI-calibrated valuation with AFSL disclaimer",
    ],
    cta_label: "Start free",
    cta_href: "https://blockid.au/svi",
    ga4_measurement_id: "G-ABCD1234",
    plausible_domain: "blockid.au",
    brand_name: "BlockID.au",
    ...over,
  };
}

describe("validateLandingPageInput", () => {
  it("accepts a well-formed input", () => {
    const result = validateLandingPageInput(goodInput());
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("flags empty headline / subheadline / cta_label / cta_href", () => {
    const result = validateLandingPageInput(
      goodInput({ headline: "  ", subheadline: "", cta_label: "", cta_href: "" }),
    );
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("headline_empty");
    expect(result.reasons).toContain("subheadline_empty");
    expect(result.reasons).toContain("cta_label_empty");
    expect(result.reasons).toContain("cta_href_empty");
  });

  it("flags overlong headline", () => {
    const result = validateLandingPageInput(
      goodInput({ headline: "x".repeat(LANDING_PAGE_MAX_HEADLINE_LENGTH + 1) }),
    );
    expect(result.reasons).toContain("headline_too_long");
  });

  it("flags too-few and too-many bullets", () => {
    const empty = validateLandingPageInput(goodInput({ bullets: [] }));
    expect(empty.reasons).toContain("bullet_count_too_low");

    const overflow = validateLandingPageInput(
      goodInput({ bullets: new Array(LANDING_PAGE_MAX_BULLETS + 1).fill("bullet") }),
    );
    expect(overflow.reasons).toContain("bullet_count_too_high");
  });

  it("flags blank bullets in an otherwise valid list", () => {
    const result = validateLandingPageInput(goodInput({ bullets: ["real bullet", "  "] }));
    expect(result.reasons).toContain("bullet_missing");
  });

  it("rejects javascript: cta_href but allows https, /, #, mailto:, tel:", () => {
    expect(
      validateLandingPageInput(goodInput({ cta_href: "javascript:alert(1)" })).reasons,
    ).toContain("cta_href_invalid");
    expect(validateLandingPageInput(goodInput({ cta_href: "/signup" })).valid).toBe(true);
    expect(validateLandingPageInput(goodInput({ cta_href: "#anchor" })).valid).toBe(true);
    expect(validateLandingPageInput(goodInput({ cta_href: "mailto:hi@blockid.au" })).valid).toBe(true);
    expect(validateLandingPageInput(goodInput({ cta_href: "tel:+61400123456" })).valid).toBe(true);
    expect(validateLandingPageInput(goodInput({ cta_href: "not a url" })).reasons).toContain(
      "cta_href_invalid",
    );
  });

  it("rejects malformed GA4 measurement ID and plausible domain", () => {
    expect(
      validateLandingPageInput(goodInput({ ga4_measurement_id: "UA-12345-1" })).reasons,
    ).toContain("ga4_measurement_id_invalid");
    expect(
      validateLandingPageInput(goodInput({ plausible_domain: "http://example.com" })).reasons,
    ).toContain("plausible_domain_invalid");
  });

  it("allows omitted analytics", () => {
    const result = validateLandingPageInput(
      goodInput({ ga4_measurement_id: undefined, plausible_domain: undefined }),
    );
    expect(result.valid).toBe(true);
  });
});

describe("renderLandingPageMarkdown", () => {
  it("renders headline, subheadline, bullets, and CTA", () => {
    const md = renderLandingPageMarkdown(goodInput());
    expect(md).toContain("# Ship your MVP in a week");
    expect(md).toContain("AU-flavoured founder tooling");
    expect(md).toContain("- GA4 stamped landing pages in one click");
    expect(md).toContain("[Start free](https://blockid.au/svi)");
    expect(md).toContain("Chapter 4 landing-page CTA");
  });

  it("surfaces missing-field placeholders instead of throwing", () => {
    const md = renderLandingPageMarkdown({
      headline: "",
      subheadline: "",
      bullets: [],
      cta_label: "",
      cta_href: "",
    });
    expect(md).toContain("(headline missing)");
    expect(md).toContain("(sub-headline missing)");
    expect(md).toContain("(add at least one benefit bullet)");
    expect(md).toContain("(CTA label + href required)");
  });
});

describe("renderLandingPageHtml", () => {
  it("renders a self-contained HTML document with headline + bullets + CTA", () => {
    const html = renderLandingPageHtml(goodInput());
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>Ship your MVP in a week</title>");
    expect(html).toContain("<h1>Ship your MVP in a week</h1>");
    expect(html).toContain("<li>GA4 stamped landing pages in one click</li>");
    expect(html).toContain('<a class="cta" href="https://blockid.au/svi">Start free</a>');
    expect(html).toContain("&copy;");
  });

  it("escapes HTML in user-supplied fields to prevent injection", () => {
    const html = renderLandingPageHtml(
      goodInput({
        headline: "<script>alert(1)</script>",
        bullets: ["safe & sound", "<b>bold</b>"],
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("safe &amp; sound");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("neutralises javascript: hrefs by rendering href=#", () => {
    const html = renderLandingPageHtml(goodInput({ cta_href: "javascript:alert(1)" }));
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("stamps GA4 snippet when ga4_measurement_id is present", () => {
    const html = renderLandingPageHtml(goodInput());
    expect(html).toContain("googletagmanager.com/gtag/js?id=G-ABCD1234");
    expect(html).toContain("gtag('config','G-ABCD1234')");
  });

  it("stamps Plausible snippet when plausible_domain is present", () => {
    const html = renderLandingPageHtml(goodInput());
    expect(html).toContain('data-domain="blockid.au"');
    expect(html).toContain("plausible.io/js/script.js");
  });

  it("stamps both analytics snippets when both are present, GA4 first", () => {
    const html = renderLandingPageHtml(goodInput());
    const ga4Index = html.indexOf("googletagmanager.com");
    const plausibleIndex = html.indexOf("plausible.io");
    expect(ga4Index).toBeGreaterThan(-1);
    expect(plausibleIndex).toBeGreaterThan(-1);
    expect(ga4Index).toBeLessThan(plausibleIndex);
  });

  it("emits a comment placeholder when no analytics are supplied", () => {
    const html = renderLandingPageHtml(
      goodInput({ ga4_measurement_id: undefined, plausible_domain: undefined }),
    );
    expect(html).toContain("<!-- Analytics: no GA4 or Plausible ID supplied");
    expect(html).not.toContain("googletagmanager.com");
    expect(html).not.toContain("plausible.io");
  });

  it("skips malformed GA4 / plausible values silently", () => {
    const html = renderLandingPageHtml(
      goodInput({ ga4_measurement_id: "UA-1-1", plausible_domain: "not a domain" }),
    );
    expect(html).not.toContain("googletagmanager.com");
    expect(html).not.toContain("plausible.io");
    expect(html).toContain("<!-- Analytics: no GA4 or Plausible ID supplied");
  });

  it("falls back to headline when brand_name is missing in the footer", () => {
    const html = renderLandingPageHtml(goodInput({ brand_name: undefined }));
    expect(html).toContain("Ship your MVP in a week</footer>");
  });
});
