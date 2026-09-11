// Shared `generateMetadata` building blocks (S8-A SEO audit, 2026-09-11).
//
// Why this exists: the root layout applies `title.template = "%s | BlockID.au"`
// to every string title, so a page that appends its own "· BlockID.au" ships
// as "… · BlockID.au | BlockID.au" (confirmed live on /compare, /pricing and
// /funding/grants). And because Next.js replaces — never merges — a page's
// `openGraph` / `twitter` objects, any page that sets them without `images`
// silently loses the site OG card. Every helper here encodes the fix once:
//
//   - `fitTitle`        clamps a title core so core + suffix ≤ 60 characters.
//   - `fitDescription`  composes sentences into a 140–160 character description.
//   - `pageMetadata`    emits canonical + hreflang + OG/Twitter with the image.
//
// Pure — no React, no `next/headers` — so page tests can snapshot the output.

import type { Metadata } from "next";

export const SITE_URL = "https://blockid.au";
/** What the root layout's `title.template` appends to a string title. */
export const BRAND_SUFFIX = " | BlockID.au";
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 140;
export const DESCRIPTION_MAX = 160;

/** The site OG card (`app/opengraph-image.tsx`). */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "BlockID.au" } as const;

const ELLIPSIS = "…";

/** Collapse whitespace and trim. */
function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Cut `s` to at most `max` characters at a word boundary, appending `…` when
 * something was dropped. Trailing punctuation before the cut is removed so
 * "Fund —…" never appears.
 */
export function truncateAtWord(s: string, max: number): string {
  const t = tidy(s);
  if (t.length <= max) return t;
  const budget = Math.max(1, max - ELLIPSIS.length);
  let cut = t.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace >= Math.floor(budget * 0.5)) cut = cut.slice(0, lastSpace);
  cut = cut.replace(/[\s—–\-:;,.(/]+$/u, "");
  return `${cut}${ELLIPSIS}`;
}

export interface FitTitleOptions {
  /** Total budget including the brand suffix. Default 60. */
  max?: number;
  /** Whether the root template will append " | BlockID.au". Default true. */
  brand?: boolean;
}

/**
 * Clamp a title core so the rendered `<title>` is ≤ `max` characters.
 * With `brand: true` (default) the core gets `max - BRAND_SUFFIX.length`
 * characters and the root template supplies the suffix; the return value is
 * the core to pass as `title`. With `brand: false` the whole budget is the
 * core's — pass the result as `{ absolute }` (see `absoluteTitle`).
 */
export function fitTitle(core: string, opts: FitTitleOptions = {}): string {
  const max = opts.max ?? TITLE_MAX;
  const brand = opts.brand ?? true;
  const budget = brand ? max - BRAND_SUFFIX.length : max;
  return truncateAtWord(core, budget);
}

/** `{ absolute }` title — bypasses the root template. Clamped to `TITLE_MAX`. */
export function absoluteTitle(core: string, max = TITLE_MAX): { absolute: string } {
  return { absolute: fitTitle(core, { max, brand: false }) };
}

/**
 * S12-A: the sweep budget for the rendered `<title>` on every other public
 * page (article, template, chapter, profile names). Wider than `TITLE_MAX`
 * because those names are content, not copy we can rewrite.
 */
export const SWEEP_TITLE_MAX = 65;

/**
 * Keep the brand when the name fits under it, drop it (via `{ absolute }`)
 * when the name alone is worth more than the suffix, and only then truncate.
 * `"Startup Tax Valuation Australia: ATO Compliance Guide"` (53) →
 * `{ absolute }` at 65, where the branded form would be 66.
 */
export function brandedOrAbsolute(core: string, max = SWEEP_TITLE_MAX): string | { absolute: string } {
  const c = tidy(core);
  if (c.length + BRAND_SUFFIX.length <= max) return c;
  return { absolute: truncateAtWord(c, max) };
}

/**
 * Length-aware title builder for the 255 funding detail pages: `${name}${tail}`
 * where only the name is truncated, so the state / city / type tail that makes
 * the title unique and keyword-bearing always survives.
 */
export function fitTitleKeepTail(name: string, tail: string, max = TITLE_MAX): string {
  const minName = 12;
  let t = tail.replace(/\s+/g, " ").trimEnd();
  if (t.length > max - minName) t = truncateAtWord(t, max - minName);
  const n = tidy(name);
  if (n.length + t.length <= max) return `${n}${t}`;
  return `${truncateAtWord(n, max - t.length)}${t}`;
}

export interface FitDescriptionOptions {
  min?: number;
  max?: number;
}

/**
 * Join sentence fragments into one description of `min`–`max` characters.
 * Fragments are added in order until the next one would overflow `max`; the
 * first fragment is always kept (truncated if it alone overflows). When the
 * result is still under `min`, the next fragment is added and truncated at a
 * word boundary so the description lands inside the window. Every fragment is
 * terminated with a full stop if it has no terminal punctuation.
 */
export function fitDescription(parts: ReadonlyArray<string | null | undefined>, opts: FitDescriptionOptions = {}): string {
  const min = opts.min ?? DESCRIPTION_MIN;
  const max = opts.max ?? DESCRIPTION_MAX;
  const frags = parts
    .map((p) => tidy(p ?? ""))
    .filter((p) => p.length > 0)
    .map((p) => (/[.!?…]$/u.test(p) ? p : `${p}.`));
  if (frags.length === 0) return "";
  let out = "";
  let firstSkipped: string | null = null;
  for (const f of frags) {
    const candidate = out ? `${out} ${f}` : f;
    if (candidate.length <= max) {
      out = candidate;
      continue;
    }
    // Overflow: keep looking for a later fragment that fits whole; remember
    // the first skipped one in case nothing else lifts us over `min`.
    if (!out) {
      out = truncateAtWord(candidate, max);
      continue;
    }
    if (firstSkipped === null) firstSkipped = f;
  }
  if (out.length < min && firstSkipped !== null) out = truncateAtWord(`${out} ${firstSkipped}`, max);
  return out;
}

export interface PageMetadataInput {
  /** Title core (the root template appends the brand) or an absolute title. */
  title: string | { absolute: string };
  description: string;
  /** Leading-slash path of the canonical URL (e.g. "/funding/grants"). */
  path: string;
  /** Leading-slash path of the Vietnamese twin, when one exists. */
  viPath?: string;
  /** Which of the pair this page is. Default "en". */
  lang?: "en" | "vi";
  ogType?: "website" | "article";
  /** `false` → `robots: { index: false, follow: false }`. Default true. */
  index?: boolean;
  /** Extra OG fields (e.g. `publishedTime`). */
  openGraph?: Metadata["openGraph"];
}

function abs(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The one metadata shape every audited page emits: absolute canonical,
 * hreflang pair when a VI twin exists (`x-default` → EN), OG + Twitter with
 * the site image (so the card survives the page-level `openGraph` override),
 * `en_AU` / `vi_VN` locale, explicit robots.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const lang = input.lang ?? "en";
  const canonical = abs(input.path);
  const titleText = typeof input.title === "string" ? input.title : input.title.absolute;
  const ogTitle = typeof input.title === "string" ? `${input.title}${BRAND_SUFFIX}` : input.title.absolute;
  const languages: Record<string, string> | undefined = input.viPath
    ? lang === "vi"
      ? { en: abs(input.path.replace(/^\/vi(\/|$)/, "/")), vi: canonical, "x-default": abs(input.path.replace(/^\/vi(\/|$)/, "/")) }
      : { en: canonical, vi: abs(input.viPath), "x-default": canonical }
    : undefined;
  const index = input.index ?? true;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical, ...(languages ? { languages } : {}) },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: ogTitle,
      description: input.description,
      url: canonical,
      siteName: "BlockID.au",
      type: input.ogType ?? "website",
      locale: lang === "vi" ? "vi_VN" : "en_AU",
      images: [OG_IMAGE],
      ...(input.openGraph ?? {}),
    },
    twitter: {
      card: "summary_large_image",
      title: titleText,
      description: input.description,
      images: [OG_IMAGE.url],
    },
  };
}

/** Rendered `<title>` text for a page's `title` field, as the root template will print it. */
export function renderedTitle(title: Metadata["title"]): string {
  if (!title) return "";
  if (typeof title === "string") return `${title}${BRAND_SUFFIX}`;
  if (typeof title === "object" && "absolute" in title && title.absolute) return title.absolute;
  if (typeof title === "object" && "default" in title && title.default) return String(title.default);
  return "";
}
