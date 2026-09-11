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

// ─── validateJsonLd (S8-A) ───────────────────────────────────────────────────

export interface JsonLdValidation {
  ok: boolean;
  errors: string[];
}

const SCHEMA_CONTEXT = "https://schema.org";

function walk(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) {
    errors.push(`${path}: undefined (JSON.stringify drops it silently)`);
    return;
  }
  if (value === null) {
    errors.push(`${path}: null`);
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    errors.push(`${path}: non-finite number`);
    return;
  }
  if (typeof value === "string") {
    if (value.trim().length === 0) errors.push(`${path}: empty string`);
    if (/\bundefined\b|\[object Object\]|\bNaN\b/.test(value)) errors.push(`${path}: serialised junk "${value}"`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) errors.push(`${path}: empty array`);
    value.forEach((v, i) => walk(v, `${path}[${i}]`, errors));
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["@type"] !== "string" || !obj["@type"]) errors.push(`${path}: missing @type`);
    for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`, errors);
  }
}

/**
 * Structural check for a schema.org object before it is serialised:
 *   - top level carries `@context` = https://schema.org and a string `@type`;
 *   - every nested object has a `@type`;
 *   - no `undefined` / `null` / empty string / empty array / NaN anywhere
 *     (Google's Rich Results test flags these as invalid or ignores the key);
 *   - `BreadcrumbList` / `ItemList` positions are 1..n in order, and an
 *     `ItemList.numberOfItems` is never smaller than its listed elements;
 *   - `FAQPage.mainEntity` is a non-empty list of `Question`s with
 *     `acceptedAnswer.text`.
 * Pure; takes the same object the page passes to `dangerouslySetInnerHTML`.
 */
export function validateJsonLd(data: unknown): JsonLdValidation {
  const errors: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["root: not an object"] };
  }
  const root = data as Record<string, unknown>;
  if (root["@context"] !== SCHEMA_CONTEXT) errors.push(`root.@context: expected ${SCHEMA_CONTEXT}`);
  const type = root["@type"];
  if (typeof type !== "string" || !type) errors.push("root.@type: missing");
  for (const [k, v] of Object.entries(root)) {
    if (k === "@context") continue;
    walk(v, `root.${k}`, errors);
  }

  const checkPositions = (list: unknown, label: string): number => {
    if (!Array.isArray(list)) {
      errors.push(`${label}: itemListElement must be an array`);
      return 0;
    }
    list.forEach((item, i) => {
      const it = item as Record<string, unknown> | null;
      if (it?.position !== i + 1) errors.push(`${label}[${i}].position: expected ${i + 1}, got ${String(it?.position)}`);
      if (it?.["@type"] !== "ListItem") errors.push(`${label}[${i}]: @type must be ListItem`);
    });
    return list.length;
  };

  if (type === "BreadcrumbList") {
    const n = checkPositions(root.itemListElement, "BreadcrumbList.itemListElement");
    if (n < 2) errors.push("BreadcrumbList: needs at least two crumbs");
    (root.itemListElement as unknown[] | undefined)?.forEach((item, i) => {
      const it = (item as Record<string, unknown> | null)?.item;
      if (typeof it !== "string" || !/^https?:\/\//.test(it)) errors.push(`BreadcrumbList[${i}].item: absolute URL required`);
    });
  }
  if (type === "ItemList") {
    const n = checkPositions(root.itemListElement, "ItemList.itemListElement");
    const declared = root.numberOfItems;
    if (typeof declared !== "number") errors.push("ItemList.numberOfItems: missing");
    else if (declared < n) errors.push(`ItemList.numberOfItems (${declared}) < listed elements (${n})`);
  }
  if (type === "FAQPage") {
    const main = root.mainEntity;
    if (!Array.isArray(main) || main.length === 0) errors.push("FAQPage.mainEntity: non-empty array required");
    else
      main.forEach((q, i) => {
        const qq = q as Record<string, unknown>;
        if (qq["@type"] !== "Question") errors.push(`FAQPage.mainEntity[${i}]: @type must be Question`);
        const ans = qq.acceptedAnswer as Record<string, unknown> | undefined;
        if (!ans || ans["@type"] !== "Answer" || typeof ans.text !== "string") {
          errors.push(`FAQPage.mainEntity[${i}]: acceptedAnswer.text required`);
        }
      });
  }
  if ((type === "Article" || type === "WebPage") && typeof root.url !== "string") errors.push(`${type}.url: missing`);
  if (type === "Article" && typeof root.headline === "string" && root.headline.length > 110) {
    errors.push("Article.headline: > 110 characters (Google truncates)");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Every `<script type="application/ld+json">` payload in a rendered HTML
 * string, parsed — so page tests can run `validateJsonLd` over what the page
 * actually emits. Unparseable blocks come back as `{ "@type": "PARSE_ERROR" }`.
 */
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    try {
      out.push(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      out.push({ "@context": "PARSE_ERROR", "@type": "PARSE_ERROR", raw: m[1].slice(0, 200) });
    }
  }
  return out;
}
