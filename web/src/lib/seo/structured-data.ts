// Pure JSON-LD builders for schema.org structured data.
//
// Kept side-effect-free so unit tests can inspect the emitted shape without
// rendering React. The React wrappers in web/src/components/seo/json-ld.tsx
// serialise these objects with dangerouslySetInnerHTML.

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface WebPageJsonLdInput {
  url: string;
  name: string;
  description: string;
  breadcrumbs?: BreadcrumbItem[];
  primaryImage?: string;
  inLanguage?: string;
}

export function buildWebPageJsonLd(input: WebPageJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: input.url,
    name: input.name,
    description: input.description,
    inLanguage: input.inLanguage ?? "en-AU",
    isPartOf: {
      "@type": "WebSite",
      name: "BlockID.au",
      url: "https://blockid.au",
    },
    publisher: {
      "@type": "Organization",
      name: "BlockID.au",
      url: "https://blockid.au",
    },
  };
  if (input.primaryImage) {
    data.primaryImageOfPage = {
      "@type": "ImageObject",
      url: input.primaryImage,
    };
  }
  if (input.breadcrumbs && input.breadcrumbs.length > 0) {
    data.breadcrumb = {
      "@type": "BreadcrumbList",
      itemListElement: input.breadcrumbs.map((crumb, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    };
  }
  return data;
}

export interface ItemListEntry {
  name: string;
  url?: string;
  description?: string;
}

export interface ItemListJsonLdInput {
  url: string;
  name: string;
  description: string;
  items: ItemListEntry[];
  itemLimit?: number;
}

const DEFAULT_ITEM_LIMIT = 100;

export function buildItemListJsonLd(input: ItemListJsonLdInput): Record<string, unknown> {
  const limit = input.itemLimit ?? DEFAULT_ITEM_LIMIT;
  const clamped = input.items.slice(0, Math.max(0, limit));
  const itemListElement = clamped.map((entry, idx) => {
    const listItem: Record<string, unknown> = {
      "@type": "ListItem",
      position: idx + 1,
      name: entry.name,
    };
    if (entry.url) listItem.url = entry.url;
    if (entry.description) listItem.description = entry.description;
    return listItem;
  });
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: input.url,
    name: input.name,
    description: input.description,
    numberOfItems: input.items.length,
    itemListElement,
  };
}
