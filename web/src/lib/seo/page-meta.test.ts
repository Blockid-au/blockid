import { describe, expect, it } from "vitest";
import {
  BRAND_SUFFIX,
  OG_IMAGE,
  absoluteTitle,
  brandedOrAbsolute,
  fitDescription,
  fitTitle,
  fitTitleKeepTail,
  pageMetadata,
  renderedTitle,
  truncateAtWord,
} from "./page-meta";

describe("fitTitle / truncateAtWord", () => {
  it("leaves a short core alone and clamps a long one at a word boundary with an ellipsis", () => {
    expect(fitTitle("Australian startup grants, open right now")).toBe("Australian startup grants, open right now");
    const long = fitTitle("Accelerators, incubators and startup programs in every Australian capital");
    expect(`${long}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/[,—-]…$/);
  });

  it("brand:false gives the whole budget to the core; absoluteTitle wraps it", () => {
    const s = "x".repeat(70);
    expect(fitTitle(s, { brand: false }).length).toBe(60);
    expect(absoluteTitle(s).absolute.length).toBe(60);
  });

  it("truncateAtWord never returns more than max characters", () => {
    for (const n of [5, 12, 30, 47]) {
      expect(truncateAtWord("Industry Growth Program — Early-Stage Commercialisation", n).length).toBeLessThanOrEqual(n);
    }
  });

  it("fitTitleKeepTail keeps the tail intact and truncates only the name", () => {
    const t = fitTitleKeepTail("Australian Apprenticeships Incentive System (Priority Hiring)", " — Australia wage subsidy");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith(" — Australia wage subsidy")).toBe(true);
    expect(t).toContain("…");
  });
});

describe("brandedOrAbsolute (S12-A)", () => {
  it("keeps the brand while the name fits under 65, drops it when the name alone is worth more, truncates last", () => {
    expect(brandedOrAbsolute("Founders")).toBe("Founders");
    expect(renderedTitle(brandedOrAbsolute("Founders"))).toBe(`Founders${BRAND_SUFFIX}`);
    const long = "Startup Tax Valuation Australia: ATO Compliance Guide"; // 53 + 13 = 66
    expect(brandedOrAbsolute(long)).toEqual({ absolute: long });
    const huge = "A".repeat(40) + " " + "B".repeat(40);
    const abs = brandedOrAbsolute(huge) as { absolute: string };
    expect(abs.absolute.length).toBeLessThanOrEqual(65);
    expect(abs.absolute.endsWith("…")).toBe(true);
    expect(brandedOrAbsolute("  spaced   out ")).toBe("spaced out");
  });
});

describe("fitDescription", () => {
  it("composes fragments into 140–160 characters, terminating each with a full stop", () => {
    const d = fitDescription(["First fragment about a grant", "Second one, with an amount: up to A$50,000", "Open now", "Eligibility gates, evidence needed, how to apply and the official link"]);
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toContain("First fragment about a grant. Second one");
  });

  it("skips a fragment that would overflow when the result is already long enough, and truncates when it is not", () => {
    const base = "a".repeat(150);
    expect(fitDescription([base, "b".repeat(50)])).toBe(`${base}.`);
    const short = fitDescription(["short one", "x".repeat(200)]);
    expect(short.length).toBeLessThanOrEqual(160);
    expect(short.endsWith("…")).toBe(true);
    expect(fitDescription([])).toBe("");
    expect(fitDescription([null, undefined, "  "])).toBe("");
  });
});

describe("pageMetadata", () => {
  it("emits absolute canonical, robots, OG + Twitter with the site image, en_AU locale", () => {
    const md = pageMetadata({ title: "Australian startup grants, open right now", description: "d".repeat(150), path: "/funding/grants" });
    expect(md.alternates?.canonical).toBe("https://blockid.au/funding/grants");
    expect(md.alternates?.languages).toBeUndefined();
    expect(md.robots).toEqual({ index: true, follow: true });
    const og = md.openGraph as Record<string, unknown>;
    expect(og.url).toBe("https://blockid.au/funding/grants");
    expect(og.locale).toBe("en_AU");
    expect(og.images).toEqual([OG_IMAGE]);
    expect(og.title).toBe(`Australian startup grants, open right now${BRAND_SUFFIX}`);
    const tw = md.twitter as Record<string, unknown>;
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images).toEqual(["/opengraph-image"]);
  });

  it("adds the hreflang pair (x-default → EN) when a VI twin exists, from either side", () => {
    const en = pageMetadata({ title: "t", description: "d", path: "/funding", viPath: "/vi/funding" });
    expect(en.alternates?.languages).toEqual({
      en: "https://blockid.au/funding",
      vi: "https://blockid.au/vi/funding",
      "x-default": "https://blockid.au/funding",
    });
    const vi = pageMetadata({ title: "t", description: "d", path: "/vi/funding", viPath: "/vi/funding", lang: "vi" });
    expect(vi.alternates?.canonical).toBe("https://blockid.au/vi/funding");
    expect(vi.alternates?.languages).toEqual({
      en: "https://blockid.au/funding",
      vi: "https://blockid.au/vi/funding",
      "x-default": "https://blockid.au/funding",
    });
    expect((vi.openGraph as Record<string, unknown>).locale).toBe("vi_VN");
  });

  it("index:false → noindex/nofollow; absolute titles bypass the template in OG too", () => {
    const md = pageMetadata({ title: { absolute: "Grant not found" }, description: "d", path: "/x", index: false });
    expect(md.robots).toEqual({ index: false, follow: false });
    expect((md.openGraph as Record<string, unknown>).title).toBe("Grant not found");
    expect(renderedTitle(md.title)).toBe("Grant not found");
    expect(renderedTitle("Pricing")).toBe("Pricing | BlockID.au");
  });
});
