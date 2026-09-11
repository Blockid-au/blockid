import { describe, expect, it } from "vitest";
import { extractJsonLd, validateJsonLd } from "./structured-data";
import {
  buildItemListJsonLd,
  buildWebPageJsonLd,
} from "./structured-data";

describe("buildWebPageJsonLd", () => {
  it("emits the minimal WebPage shape", () => {
    const data = buildWebPageJsonLd({
      url: "https://blockid.au/showcase/blockid",
      name: "Showcase",
      description: "Live mirror",
    });
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("WebPage");
    expect(data.url).toBe("https://blockid.au/showcase/blockid");
    expect(data.name).toBe("Showcase");
    expect(data.description).toBe("Live mirror");
    expect(data.inLanguage).toBe("en-AU");
    expect(data.isPartOf).toMatchObject({ "@type": "WebSite", url: "https://blockid.au" });
    expect(data.publisher).toMatchObject({ "@type": "Organization", name: "BlockID.au" });
    expect(data.breadcrumb).toBeUndefined();
    expect(data.primaryImageOfPage).toBeUndefined();
  });

  it("emits breadcrumbs when provided", () => {
    const data = buildWebPageJsonLd({
      url: "https://blockid.au/showcase/blockid",
      name: "Showcase",
      description: "Live mirror",
      breadcrumbs: [
        { name: "Home", url: "https://blockid.au" },
        { name: "Showcase", url: "https://blockid.au/showcase/blockid" },
      ],
    });
    const crumb = data.breadcrumb as { itemListElement: unknown[] };
    expect(crumb.itemListElement).toHaveLength(2);
    expect(crumb.itemListElement[0]).toMatchObject({ position: 1, name: "Home" });
    expect(crumb.itemListElement[1]).toMatchObject({ position: 2, name: "Showcase" });
  });

  it("honours primaryImage + inLanguage overrides", () => {
    const data = buildWebPageJsonLd({
      url: "https://blockid.au/vi/showcase",
      name: "VN",
      description: "vi",
      primaryImage: "https://blockid.au/og.png",
      inLanguage: "vi-VN",
    });
    expect(data.inLanguage).toBe("vi-VN");
    expect(data.primaryImageOfPage).toMatchObject({ url: "https://blockid.au/og.png" });
  });
});

describe("buildItemListJsonLd", () => {
  it("emits an ItemList with 1-indexed positions", () => {
    const data = buildItemListJsonLd({
      url: "https://blockid.au/guide/reports",
      name: "Reports",
      description: "Library",
      items: [
        { name: "First" },
        { name: "Second", url: "https://blockid.au/guide/reports#second" },
      ],
    });
    expect(data["@type"]).toBe("ItemList");
    expect(data.numberOfItems).toBe(2);
    const els = data.itemListElement as Array<Record<string, unknown>>;
    expect(els).toHaveLength(2);
    expect(els[0].position).toBe(1);
    expect(els[0].name).toBe("First");
    expect(els[0].url).toBeUndefined();
    expect(els[1].position).toBe(2);
    expect(els[1].url).toBe("https://blockid.au/guide/reports#second");
  });

  it("clamps to itemLimit but keeps numberOfItems as the full count", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ name: `Report ${i + 1}` }));
    const data = buildItemListJsonLd({
      url: "https://blockid.au/guide/reports",
      name: "Reports",
      description: "Library",
      items,
      itemLimit: 5,
    });
    expect(data.numberOfItems).toBe(12);
    expect((data.itemListElement as unknown[]).length).toBe(5);
    const last = (data.itemListElement as Array<Record<string, unknown>>)[4];
    expect(last.name).toBe("Report 5");
  });

  it("emits an empty itemListElement for zero items", () => {
    const data = buildItemListJsonLd({
      url: "https://blockid.au/guide/reports",
      name: "Reports",
      description: "Library",
      items: [],
    });
    expect(data.numberOfItems).toBe(0);
    expect((data.itemListElement as unknown[]).length).toBe(0);
  });

  it("carries description through when provided", () => {
    const data = buildItemListJsonLd({
      url: "https://blockid.au/guide/reports",
      name: "Reports",
      description: "Library",
      items: [{ name: "R", description: "Rich" }],
    });
    const el = (data.itemListElement as Array<Record<string, unknown>>)[0];
    expect(el.description).toBe("Rich");
  });
});

describe("validateJsonLd", () => {
  it("accepts a well-formed BreadcrumbList, ItemList, FAQPage and Article", () => {
    const crumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://blockid.au/" },
        { "@type": "ListItem", position: 2, name: "Funding", item: "https://blockid.au/funding" },
      ],
    };
    expect(validateJsonLd(crumbs)).toEqual({ ok: true, errors: [] });
    const list = buildItemListJsonLd({ url: "https://blockid.au/x", name: "n", description: "d", items: [{ name: "a", url: "https://blockid.au/a" }] });
    expect(validateJsonLd(list).ok).toBe(true);
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "q", acceptedAnswer: { "@type": "Answer", text: "a" } }],
    };
    expect(validateJsonLd(faq).ok).toBe(true);
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "Article", headline: "h", url: "https://blockid.au/a" }).ok).toBe(true);
  });

  it("rejects missing @context/@type, undefined / null / empty values, nested objects without @type, and bad positions", () => {
    const r = validateJsonLd({
      "@type": "GovernmentService",
      name: "",
      description: undefined,
      provider: { name: "x" },
      offers: null,
      tags: [],
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        "root.@context: expected https://schema.org",
        "root.name: empty string",
        "root.description: undefined (JSON.stringify drops it silently)",
        "root.provider: missing @type",
        "root.offers: null",
        "root.tags: empty array",
      ]),
    );
    const crumbs = validateJsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [{ "@type": "ListItem", position: 2, name: "Home", item: "/" }],
    });
    expect(crumbs.errors).toEqual(
      expect.arrayContaining([
        "BreadcrumbList.itemListElement[0].position: expected 1, got 2",
        "BreadcrumbList: needs at least two crumbs",
        "BreadcrumbList[0].item: absolute URL required",
      ]),
    );
    const list = validateJsonLd({
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: 0,
      itemListElement: [{ "@type": "ListItem", position: 1, name: "a" }],
    });
    expect(list.errors).toContain("ItemList.numberOfItems (0) < listed elements (1)");
    expect(validateJsonLd(null).ok).toBe(false);
    expect(validateJsonLd([]).ok).toBe(false);
  });

  it("extractJsonLd pulls every ld+json block out of rendered HTML", () => {
    const html =
      '<html><script type="application/ld+json" nonce="n">{"@context":"https://schema.org","@type":"WebPage","url":"https://blockid.au/x"}</script>' +
      '<p>x</p><script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>' +
      '<script type="application/ld+json">not json</script></html>';
    const blocks = extractJsonLd(html);
    expect(blocks.map((b) => b["@type"])).toEqual(["WebPage", "BreadcrumbList", "PARSE_ERROR"]);
    expect(validateJsonLd(blocks[0]).ok).toBe(true);
    expect(validateJsonLd(blocks[1]).ok).toBe(false);
  });
});
