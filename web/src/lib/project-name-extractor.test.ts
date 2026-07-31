import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Project Name Extractor — colocated tests for the previously-untested pure
// `src/lib/project-name-extractor.ts` module. This helper auto-names new
// SVI analyses (so a founder doesn't have to type one) by walking a 6-step
// signal ladder scraped-title → og-meta → url-hostname → first-noun →
// filename → fallback. A silent drop of a tagline separator, a rename of
// a source id, a widening of the junk-name guard, or a regression on the
// 60-char cleanName cap would silently break founder-facing auto-naming
// without any type error. These tests pin the ladder ordering + branch
// matrix + cleanName invariants.
// ---------------------------------------------------------------------------

import { extractProjectName } from "./project-name-extractor";

describe("extractProjectName — scraped-title branch", () => {
  it("returns the scraped title stripped of an em-dash tagline", () => {
    expect(
      extractProjectName({
        rawText: "",
        scraped: { title: "Blockid — Best Tool for Australia" },
      }),
    ).toEqual({ name: "Blockid", confidence: "high", source: "scraped-title" });
  });

  it("strips an en-dash tagline separator", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "Blockid – EN dash" } }),
    ).toEqual({ name: "Blockid", confidence: "high", source: "scraped-title" });
  });

  it("strips a pipe tagline separator", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "Blockid | Pipe sep" } }),
    ).toEqual({ name: "Blockid", confidence: "high", source: "scraped-title" });
  });

  it("strips a double-colon tagline separator", () => {
    expect(
      extractProjectName({
        rawText: "",
        scraped: { title: "Blockid :: Double colon" },
      }),
    ).toEqual({ name: "Blockid", confidence: "high", source: "scraped-title" });
  });

  it("strips a hyphen tagline separator", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "Blockid - Hyphen sep" } }),
    ).toEqual({ name: "Blockid", confidence: "high", source: "scraped-title" });
  });

  it("strips a colon tagline separator", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "Blockid: Colon" } }),
    ).toEqual({ name: "Blockid", confidence: "high", source: "scraped-title" });
  });

  it("keeps the full title when the separator is past the first-half+5 heuristic", () => {
    // Title length 40, em-dash at index 30 → 30 < 40/2+5=25 is false → not stripped.
    const title = "Really long product name text — Tagline";
    expect(extractProjectName({ rawText: "", scraped: { title } })).toEqual({
      name: title,
      confidence: "high",
      source: "scraped-title",
    });
  });

  it("strips the tagline when the separator sits inside the first-half+5 window", () => {
    // "AcmeCo - CRM tool" — len 17, sep at 6, 6 < 8.5+5=13.5 → stripped.
    expect(
      extractProjectName({ rawText: "", scraped: { title: "AcmeCo - CRM tool" } }),
    ).toEqual({ name: "AcmeCo", confidence: "high", source: "scraped-title" });
  });

  it("collapses runs of whitespace and trims edges via cleanName", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "  MyBrand   Co  " } }),
    ).toEqual({ name: "MyBrand Co", confidence: "high", source: "scraped-title" });
  });

  it("strips trailing punctuation .,;:!?", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "MyBrand!!!" } }),
    ).toEqual({ name: "MyBrand", confidence: "high", source: "scraped-title" });
  });

  it("caps the returned name at 60 characters via cleanName", () => {
    const long = "a".repeat(80);
    const result = extractProjectName({ rawText: "", scraped: { title: long } });
    expect(result.source).toBe("scraped-title");
    expect(result.name).toHaveLength(60);
    expect(result.name).toBe("a".repeat(60));
  });

  it("falls through when the title is a noise word (Home)", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "Home" } }),
    ).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("falls through on an empty title string (falsy — skipped without cleanName)", () => {
    expect(extractProjectName({ rawText: "", scraped: { title: "" } })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("rejects a pure-digits title as junk (numeric regex guard)", () => {
    expect(
      extractProjectName({ rawText: "", scraped: { title: "12345" } }),
    ).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });
});

describe("extractProjectName — scraped-og branch", () => {
  it("extracts og:site_name from raw HTML when title is absent", () => {
    expect(
      extractProjectName({
        rawText: "",
        scraped: {
          rawHtml: '<meta property="og:site_name" content="MyBrand">',
        },
      }),
    ).toEqual({ name: "MyBrand", confidence: "high", source: "scraped-og" });
  });

  it("falls back to application-name when og:site_name is missing", () => {
    expect(
      extractProjectName({
        rawText: "",
        scraped: {
          rawHtml: '<meta name="application-name" content="AppName">',
        },
      }),
    ).toEqual({ name: "AppName", confidence: "high", source: "scraped-og" });
  });

  it("rejects a junk og:site_name value and falls through", () => {
    expect(
      extractProjectName({
        rawText: "",
        scraped: {
          rawHtml: '<meta property="og:site_name" content="home">',
        },
      }),
    ).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("prefers scraped-title over scraped-og when both are present", () => {
    expect(
      extractProjectName({
        rawText: "",
        scraped: {
          title: "TitleBrand",
          rawHtml: '<meta property="og:site_name" content="OgBrand">',
        },
        url: "https://from-url.com",
      }),
    ).toEqual({
      name: "TitleBrand",
      confidence: "high",
      source: "scraped-title",
    });
  });

  it("prefers og over url-hostname when scraped-title is junk", () => {
    expect(
      extractProjectName({
        rawText: "",
        scraped: {
          title: "Home",
          rawHtml: '<meta property="og:site_name" content="OgBrand">',
        },
        url: "https://from-url.com",
      }),
    ).toEqual({ name: "OgBrand", confidence: "high", source: "scraped-og" });
  });
});

describe("extractProjectName — url-hostname branch", () => {
  it("resolves a full https URL to the brand root (dropping www + TLD parts)", () => {
    expect(
      extractProjectName({ rawText: "", url: "https://www.blockid.au/foo" }),
    ).toEqual({
      name: "Blockid",
      confidence: "medium",
      source: "url-hostname",
    });
  });

  it("PascalCases hyphenated hostnames", () => {
    expect(
      extractProjectName({ rawText: "", url: "https://acme-corp.co" }),
    ).toEqual({
      name: "AcmeCorp",
      confidence: "medium",
      source: "url-hostname",
    });
  });

  it("prepends https:// when the caller supplies a bare hostname", () => {
    expect(extractProjectName({ rawText: "", url: "acme.au" })).toEqual({
      name: "Acme",
      confidence: "medium",
      source: "url-hostname",
    });
  });

  it("returns null-fallback when the resolved root is too short (<2 chars)", () => {
    expect(extractProjectName({ rawText: "", url: "http://a.b" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("returns null-fallback when every hostname part is a known TLD/subdomain", () => {
    expect(extractProjectName({ rawText: "", url: "http://www.io" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("extracts the first URL from rawText when input.url is absent", () => {
    expect(
      extractProjectName({ rawText: "check https://foo-bar.com out" }),
    ).toEqual({
      name: "FooBar",
      confidence: "medium",
      source: "url-hostname",
    });
  });

  it("picks the first URL when rawText contains multiple", () => {
    expect(
      extractProjectName({
        rawText: "visit https://alpha.com and https://beta.com",
      }),
    ).toEqual({
      name: "Alpha",
      confidence: "medium",
      source: "url-hostname",
    });
  });

  it("normalises hostname case (URL API lowercases the host)", () => {
    expect(
      extractProjectName({ rawText: "", url: "https://ACMECORP.com" }),
    ).toEqual({
      name: "Acmecorp",
      confidence: "medium",
      source: "url-hostname",
    });
  });

  it("falls through to first-noun when the URL is malformed", () => {
    expect(
      extractProjectName({ rawText: "Acme Rocks", url: "::not::a::url::" }),
    ).toEqual({ name: "Acme Rocks", confidence: "low", source: "first-noun" });
  });
});

describe("extractProjectName — first-noun branch", () => {
  it("extracts a two-word proper-noun phrase from rawText", () => {
    expect(extractProjectName({ rawText: "Acme Corp is nice" })).toEqual({
      name: "Acme Corp",
      confidence: "low",
      source: "first-noun",
    });
  });

  it("caps the proper-noun run at three words (Alpha Beta Gamma, drops Delta)", () => {
    expect(
      extractProjectName({ rawText: "hello Alpha Beta Gamma Delta" }),
    ).toEqual({
      name: "Alpha Beta Gamma",
      confidence: "low",
      source: "first-noun",
    });
  });

  it("requires a proper noun of at least 2 characters (drops single-letter A)", () => {
    expect(extractProjectName({ rawText: "A here" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("accepts a 2-character proper noun (Ab)", () => {
    expect(extractProjectName({ rawText: "Ab here" })).toEqual({
      name: "Ab",
      confidence: "low",
      source: "first-noun",
    });
  });

  it("returns fallback when rawText has no capitalised proper noun", () => {
    expect(extractProjectName({ rawText: "just plain text" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });
});

describe("extractProjectName — filename branch", () => {
  it("strips the extension and hyphens/underscores + title-cases the base", () => {
    expect(
      extractProjectName({ rawText: "", fileName: "my-startup-plan.md" }),
    ).toEqual({
      name: "My Startup Plan",
      confidence: "low",
      source: "filename",
    });
  });

  it("only strips the last extension (cool_project.v2.pdf → 'Cool Project.v2')", () => {
    expect(
      extractProjectName({ rawText: "", fileName: "cool_project.v2.pdf" }),
    ).toEqual({
      name: "Cool Project.v2",
      confidence: "low",
      source: "filename",
    });
  });

  it("rejects a filename whose base is a noise word (home.txt)", () => {
    expect(extractProjectName({ rawText: "", fileName: "home.txt" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("returns fallback for a dotfile whose base collapses to empty (.hidden)", () => {
    expect(extractProjectName({ rawText: "", fileName: ".hidden" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("returns fallback for an empty filename string", () => {
    expect(extractProjectName({ rawText: "", fileName: "" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });
});

describe("extractProjectName — fallback", () => {
  it("returns the 'Untitled Startup' sentinel when every signal is empty", () => {
    expect(extractProjectName({ rawText: "" })).toEqual({
      name: "Untitled Startup",
      confidence: "low",
      source: "fallback",
    });
  });

  it("prefers a scraped-title-with-junk fallthrough over a URL when the title is junk", () => {
    // title 'Home' → junk → falls through; no og/url → fallback path;
    // proves the junk gate does not accidentally lock in the sentinel.
    expect(
      extractProjectName({
        rawText: "and Acme is here",
        scraped: { title: "Home" },
      }),
    ).toEqual({ name: "Acme", confidence: "low", source: "first-noun" });
  });
});
