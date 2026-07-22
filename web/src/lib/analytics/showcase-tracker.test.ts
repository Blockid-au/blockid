import { describe, expect, it } from "vitest";
import { _internal, resolveShowcasePageEvent } from "./showcase-tracker";

describe("resolveShowcasePageEvent", () => {
  it("returns null for unknown page", () => {
    expect(resolveShowcasePageEvent("random-page")).toBeNull();
    expect(resolveShowcasePageEvent("")).toBeNull();
  });

  it("maps showcase-blockid to showcase_public_viewed with normalised referrer", () => {
    const r = resolveShowcasePageEvent("showcase-blockid", {
      referrer: "https://news.ycombinator.com/item?id=42#c",
    });
    expect(r).toEqual({
      name: "showcase_public_viewed",
      params: { referrer: "https://news.ycombinator.com/item" },
    });
  });

  it("maps showcase-blockid with empty referrer to empty string", () => {
    const r = resolveShowcasePageEvent("showcase-blockid", { referrer: "" });
    expect(r).toEqual({
      name: "showcase_public_viewed",
      params: { referrer: "" },
    });
  });

  it("maps showcase-blockid with malformed referrer to safe truncated string", () => {
    const long = "x".repeat(400);
    const r = resolveShowcasePageEvent("showcase-blockid", { referrer: long });
    expect(r?.name).toBe("showcase_public_viewed");
    expect((r?.params as { referrer: string }).referrer.length).toBe(256);
  });

  it("maps guide-reports to showcase_reports_viewed with total_reports + marketing source", () => {
    const r = resolveShowcasePageEvent("guide-reports", { totalReports: 242 });
    expect(r).toEqual({
      name: "showcase_reports_viewed",
      params: { total_reports: 242, source: "marketing" },
    });
  });

  it("defaults total_reports to 0 when missing or non-finite", () => {
    expect(resolveShowcasePageEvent("guide-reports")?.params).toEqual({
      total_reports: 0,
      source: "marketing",
    });
    expect(
      resolveShowcasePageEvent("guide-reports", { totalReports: Number.NaN })?.params,
    ).toEqual({ total_reports: 0, source: "marketing" });
  });

  it("maps guide-chapter with chapter+locale to showcase_guide_viewed(marketing)", () => {
    const r = resolveShowcasePageEvent("guide-chapter", { chapter: 3, locale: "en" });
    expect(r).toEqual({
      name: "showcase_guide_viewed",
      params: { chapter: 3, locale: "en", source: "marketing" },
    });
  });

  it("maps workspace-guide-chapter to showcase_guide_viewed(onboarding) by default", () => {
    const r = resolveShowcasePageEvent("workspace-guide-chapter", {
      chapter: 7,
      locale: "vi",
    });
    expect(r).toEqual({
      name: "showcase_guide_viewed",
      params: { chapter: 7, locale: "vi", source: "onboarding" },
    });
  });

  it("respects explicit source override on guide-chapter pages", () => {
    const r = resolveShowcasePageEvent("guide-chapter", {
      chapter: 1,
      locale: "en",
      source: "onboarding",
    });
    expect((r?.params as { source: string }).source).toBe("onboarding");
  });

  it("returns null for guide-chapter when chapter is out of range or missing", () => {
    expect(resolveShowcasePageEvent("guide-chapter", { locale: "en" })).toBeNull();
    expect(
      resolveShowcasePageEvent("guide-chapter", { chapter: 0, locale: "en" }),
    ).toBeNull();
    expect(
      resolveShowcasePageEvent("guide-chapter", { chapter: 13, locale: "en" }),
    ).toBeNull();
    expect(
      resolveShowcasePageEvent("guide-chapter", { chapter: Number.NaN, locale: "en" }),
    ).toBeNull();
  });

  it("returns null for guide-chapter when locale is missing or invalid", () => {
    expect(resolveShowcasePageEvent("guide-chapter", { chapter: 5 })).toBeNull();
    expect(
      resolveShowcasePageEvent("guide-chapter", {
        chapter: 5,
        locale: "fr" as unknown as "en",
      }),
    ).toBeNull();
  });
});

describe("normaliseReferrer", () => {
  it("returns empty string for undefined or blank", () => {
    expect(_internal.normaliseReferrer(undefined)).toBe("");
    expect(_internal.normaliseReferrer("   ")).toBe("");
  });

  it("strips search + hash from valid URLs", () => {
    expect(
      _internal.normaliseReferrer("https://example.com/path?query=1#top"),
    ).toBe("https://example.com/path");
  });
});
