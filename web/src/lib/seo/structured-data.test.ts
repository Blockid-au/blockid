import { describe, expect, it } from "vitest";
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
