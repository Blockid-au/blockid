import { describe, it, expect } from "vitest";
import { resellerFooterHtml, resellerFooterText } from "./email-footer";

describe("resellerFooterHtml", () => {
  it("returns empty string when displayName is nullish or blank", () => {
    expect(resellerFooterHtml(null)).toBe("");
    expect(resellerFooterHtml(undefined)).toBe("");
    expect(resellerFooterHtml("")).toBe("");
    expect(resellerFooterHtml("   ")).toBe("");
  });

  it("renders the English label + display name", () => {
    const html = resellerFooterHtml("InfoVision", "en");
    expect(html).toContain("Brought to you by");
    expect(html).toContain("<strong");
    expect(html).toContain("InfoVision</strong>");
  });

  it("renders the Vietnamese label when locale=vi", () => {
    const html = resellerFooterHtml("InfoVision", "vi");
    expect(html).toContain("Duoc mang den boi");
    expect(html).not.toContain("Brought to you by");
  });

  it("defaults to English when locale omitted", () => {
    expect(resellerFooterHtml("Acme")).toContain("Brought to you by");
  });

  it("escapes HTML in the display name", () => {
    const html = resellerFooterHtml('<script>x</script>&"', "en");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("trims leading/trailing whitespace from displayName", () => {
    const html = resellerFooterHtml("  Acme Co  ", "en");
    expect(html).toContain(">Acme Co</strong>");
  });
});

describe("resellerFooterText", () => {
  it("returns empty string when displayName is nullish or blank", () => {
    expect(resellerFooterText(null)).toBe("");
    expect(resellerFooterText("")).toBe("");
    expect(resellerFooterText("   ")).toBe("");
  });

  it("renders the English form by default", () => {
    expect(resellerFooterText("Acme")).toBe("\n\nBrought to you by Acme.");
  });

  it("renders the Vietnamese form when locale=vi", () => {
    expect(resellerFooterText("Acme", "vi")).toBe("\n\nDuoc mang den boi Acme.");
  });
});
