// S12-A site-wide <title> / description sweep (2026-09-11).
//
// Discovers every public `page.tsx` under src/app (marketing, docs, tools,
// insights, showcase, legal, guides, /vi …), resolves the metadata the way
// Next does — root `title.template = "%s | BlockID.au"`, `{ absolute }`
// bypass, `layout.tsx` fallback for client pages — and asserts on every
// indexable page:
//
//   - the brand appears at most once in the rendered <title>
//   - rendered <title> ≤ 65 chars
//   - description present, 70–165 chars
//   - no two indexable pages share a rendered <title>
//   - canonical is present + absolute wherever `alternates` is set
//
// Dynamic routes take their first `generateStaticParams()` entry, or the
// first seed / manifest row through the builders in PARAMS. Routes that need
// request context or a live DB row are pinned in UNCONSTRUCTABLE so a new
// dynamic route cannot silently drop out of the sweep. Pages that are
// `noindex` (or plain redirects) are imported but not asserted on.

import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Metadata } from "next";
import grantsSeed from "../../../content/data/grants-au.seed.json";
import programsSeed from "../../../content/data/programs-au.seed.json";
import { capitalForCity, mapGrantSeeds, mapProgramSeeds } from "@/lib/funding/seed-map";
import { capitalSlug } from "@/lib/funding/directory";
import { BRAND_SUFFIX, renderedTitle } from "./page-meta";

// ─── Environment shims ───────────────────────────────────────────────────────

const grants = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants).filter((g) => !g.exclude_from_matching);
const programs = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs);

vi.mock("@/lib/funding/data", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/funding/data")>();
  return {
    ...mod,
    listGrants: async () => grants,
    listPrograms: async () => programs,
    getGrant: async (id: string) => grants.find((g) => g.id === id) ?? null,
    getProgram: async (id: string) => programs.find((p) => p.id === id) ?? null,
  };
});

vi.mock("@/lib/listings/listings-db", () => ({
  getListingByTicker: async (ticker: string) =>
    ticker === "SAMPLE"
      ? { ticker, name: "Sample Startup", svi_grade: "B", one_liner: "A representative listing used by the site-wide metadata sweep so the trust-report title and description resolve." }
      : null,
  getPublicListings: async () => [],
}));

vi.mock("@/lib/business-id/public-profile", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/business-id/public-profile")>();
  return {
    ...mod,
    readPublicProfile: async (slug: string) =>
      slug === "sample-co"
        ? {
            slug,
            legalName: "Sample Co Pty Ltd",
            publicUrl: "https://blockid.au/id/sample-co",
            profileKind: "customer",
            verificationLevel: 2,
            trustScore: 72,
          }
        : null,
  };
});

// ─── Discovery ───────────────────────────────────────────────────────────────

const APP_DIR = resolve(__dirname, "../../app");
/** Top-level segments that are app / auth / admin surfaces, never indexable. */
const EXCLUDED_ROOTS = new Set(["(app)", "admin", "api", "auth", "reseller", "workspace", "dashboard"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, out);
    } else if (name === "page.tsx") out.push(p);
  }
  return out;
}

/** `src/app/(marketing)/funding/grants/[id]/page.tsx` → `/funding/grants/[id]`. */
function routeOf(file: string): string {
  const rel = relative(APP_DIR, dirname(file));
  const segs = rel.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segs.join("/")}`;
}

function isExcluded(file: string): boolean {
  const first = relative(APP_DIR, file).split("/")[0];
  return EXCLUDED_ROOTS.has(first);
}

const PAGE_FILES = walk(APP_DIR)
  .filter((f) => !isExcluded(f))
  .sort();

// ─── Param builders for dynamic routes without generateStaticParams ─────────

type Params = Record<string, string>;
const firstGrant = grants[0];
const firstProgram = programs[0];

const PARAMS: Record<string, () => Params> = {
  "/funding/grants/[id]": () => ({ id: firstGrant.id }),
  "/funding/programs/[capital]/[id]": () => ({
    capital: capitalSlug(capitalForCity(firstProgram.city, firstProgram.state)),
    id: firstProgram.id,
  }),
  "/reports/[ticker]": () => ({ ticker: "SAMPLE" }),
  "/startup-index/listings/[ticker]": () => ({ ticker: "SAMPLE" }),
  "/id/[slug]": () => ({ slug: "sample-co" }),
  "/vi/id/[slug]": () => ({ slug: "sample-co" }),
};

/**
 * Dynamic routes whose metadata needs request context (`headers()` /
 * `cookies()`) or a live DB row. Every one is `noindex` at the page, so they
 * are outside the indexable set by construction; they are pinned here so a
 * new dynamic route must be classified rather than silently skipped.
 */
const UNCONSTRUCTABLE: Record<string, string> = {
  "/listings/[slug]": "noindex; generateMetadata reads headers() + a live listing row",
  "/s/[slug]": "noindex; share page reads headers() + a live share row",
  "/s/dr/[token]": "noindex; data-room share token, headers() + DB",
  "/s/i/[token]": "noindex; investor share token, headers() + DB",
  "/s/p/[slug]": "noindex; public share page, headers() + DB",
  "/startup/[slug]": "noindex; generateMetadata reads a live startup row",
  "/verify/[proofId]": "noindex; proof lookup against a live row",
  "/verify/valuation/[no]": "noindex; certificate lookup against a live row (S22-A)",
};

// ─── Resolution ──────────────────────────────────────────────────────────────

interface Resolved {
  route: string;
  file: string;
  title: string;
  description: string;
  metadata: Metadata | null;
  /** `redirect` = page body is a bare redirect; `noindex` = robots says so. */
  kind: "indexable" | "noindex" | "redirect" | "skipped";
  reason?: string;
}

type PageModule = {
  metadata?: Metadata;
  generateMetadata?: (props: { params: Promise<Params>; searchParams: Promise<Record<string, string>> }) => Metadata | Promise<Metadata>;
  generateStaticParams?: () => Params[] | Promise<Params[]>;
};

function isNoindex(md: Metadata | null): boolean {
  if (!md?.robots) return false;
  const r = md.robots;
  if (typeof r === "string") return /noindex/i.test(r);
  return r.index === false;
}

function isRedirectPage(file: string): boolean {
  const src = readFileSync(file, "utf8");
  return /\b(permanentRedirect|redirect)\(/.test(src) && !/^export (const|async function|function) (metadata|generateMetadata)/m.test(src);
}

async function paramsFor(route: string, mod: PageModule): Promise<Params | null> {
  if (!/\[/.test(route)) return {};
  if (PARAMS[route]) return PARAMS[route]();
  if (mod.generateStaticParams) {
    const list = await mod.generateStaticParams();
    if (list.length > 0) return list[0];
  }
  return null;
}

async function resolveMetadata(route: string, file: string, mod: PageModule): Promise<{ md: Metadata | null; reason?: string }> {
  if (mod.generateMetadata) {
    const params = await paramsFor(route, mod);
    if (params === null) return { md: null, reason: "no params builder" };
    const md = await mod.generateMetadata({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
    return { md };
  }
  if (mod.metadata) return { md: mod.metadata };
  // Client pages carry their metadata on the sibling layout.
  const layout = join(dirname(file), "layout.tsx");
  try {
    statSync(layout);
    const lmod = (await import(/* @vite-ignore */ layout)) as PageModule;
    if (lmod.metadata) return { md: lmod.metadata };
  } catch {
    /* no layout */
  }
  return { md: null, reason: "no metadata export" };
}

function descriptionOf(md: Metadata | null): string {
  return typeof md?.description === "string" ? md.description : "";
}

async function resolvePage(file: string): Promise<Resolved> {
  const route = routeOf(file);
  if (UNCONSTRUCTABLE[route]) {
    return { route, file, title: "", description: "", metadata: null, kind: "skipped", reason: UNCONSTRUCTABLE[route] };
  }
  if (isRedirectPage(file)) {
    return { route, file, title: "", description: "", metadata: null, kind: "redirect" };
  }
  let mod: PageModule;
  try {
    mod = (await import(/* @vite-ignore */ file)) as PageModule;
  } catch (err) {
    return { route, file, title: "", description: "", metadata: null, kind: "skipped", reason: `import failed: ${(err as Error).message.split("\n")[0]}` };
  }
  let md: Metadata | null;
  let reason: string | undefined;
  try {
    ({ md, reason } = await resolveMetadata(route, file, mod));
  } catch (err) {
    return { route, file, title: "", description: "", metadata: null, kind: "skipped", reason: `generateMetadata threw: ${(err as Error).message.split("\n")[0]}` };
  }
  if (!md) return { route, file, title: "", description: "", metadata: null, kind: "skipped", reason };
  return {
    route,
    file,
    title: renderedTitle(md.title),
    description: descriptionOf(md),
    metadata: md,
    kind: isNoindex(md) ? "noindex" : "indexable",
  };
}

const RESOLVED: Promise<Resolved[]> = Promise.all(PAGE_FILES.map(resolvePage));

const TITLE_MAX_SWEEP = 65;
const DESC_MIN_SWEEP = 70;
const DESC_MAX_SWEEP = 165;

function brandCount(title: string): number {
  return (title.match(/BlockID\.au/gi) ?? []).length;
}

/** "… | BlockID | BlockID.au" / "… — BlockID | BlockID.au": a brand token right before the template suffix. */
const TRAILING_BRAND = /[—–|·-]\s*BlockID(?:\.au)?\s*\| BlockID\.au$/i;

// ─── Assertions ──────────────────────────────────────────────────────────────

describe("site-wide metadata sweep (S12-A)", { timeout: 120_000 }, () => {
  it("discovers the public page tree (marketing, tools, docs, showcase, guides, /vi) and excludes app/admin/api/auth", () => {
    expect(PAGE_FILES.length).toBeGreaterThan(120);
    const routes = PAGE_FILES.map(routeOf);
    for (const r of ["/", "/pricing", "/funding/grants", "/funding/programs", "/tools", "/insights/[slug]", "/vi", "/vi/pricing", "/showcase", "/legal/[doc]"]) {
      expect(routes, r).toContain(r);
    }
    for (const r of routes) expect(r).not.toMatch(/^\/(admin|api|auth|reseller|workspace|dashboard)(\/|$)/);
  });

  it("every dynamic route is either constructed or explicitly pinned as unconstructable", async () => {
    const pages = await RESOLVED;
    const skipped = pages.filter((p) => p.kind === "skipped" && !UNCONSTRUCTABLE[p.route]);
    expect(skipped.map((p) => `${p.route}: ${p.reason}`), "unclassified routes").toEqual([]);
    for (const route of Object.keys(UNCONSTRUCTABLE)) {
      expect(pages.map((p) => p.route), `${route} pinned but no longer exists`).toContain(route);
    }
  });

  it("every indexable page: brand at most once, title ≤ 65, description 70–165, canonical absolute where alternates is set", async () => {
    const pages = (await RESOLVED).filter((p) => p.kind === "indexable");
    expect(pages.length).toBeGreaterThan(100);
    const problems: string[] = [];
    for (const p of pages) {
      const md = p.metadata!;
      if (!p.title) problems.push(`${p.route}: no title`);
      if (brandCount(p.title) > 1) problems.push(`${p.route}: doubled brand "${p.title}"`);
      else if (TRAILING_BRAND.test(p.title)) problems.push(`${p.route}: brand token before the suffix "${p.title}"`);
      if (p.title.length > TITLE_MAX_SWEEP) problems.push(`${p.route}: title ${p.title.length} chars "${p.title}"`);
      if (!p.description) problems.push(`${p.route}: no description`);
      else if (p.description.length < DESC_MIN_SWEEP || p.description.length > DESC_MAX_SWEEP) {
        problems.push(`${p.route}: description ${p.description.length} chars`);
      }
      if (md.alternates) {
        const c = md.alternates.canonical;
        const href = typeof c === "string" ? c : c && typeof c === "object" && "url" in c ? String(c.url) : "";
        if (!href) problems.push(`${p.route}: alternates set but no canonical`);
        else if (!/^https:\/\/blockid\.au(\/|$)/.test(href)) problems.push(`${p.route}: canonical not absolute "${href}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("no two indexable pages share a rendered <title>", async () => {
    const pages = (await RESOLVED).filter((p) => p.kind === "indexable");
    const byTitle = new Map<string, string[]>();
    for (const p of pages) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p.route]);
    const dupes = [...byTitle.entries()].filter(([, routes]) => routes.length > 1).map(([t, routes]) => `"${t}" ← ${routes.join(", ")}`);
    expect(dupes).toEqual([]);
  });

  // Release QA-1 #5 (2026-09-12): 34 pages told Google "the homepage is the
  // canonical" — 24 /startup-index/listings/* pages, /auth/login, /s/* and
  // /showcase/sprocketbay inherited a root-layout `alternates.canonical =
  // SITE_URL`, and /index ↔ /startup-index formed a redirect loop.
  it("no page other than the homepage declares the homepage as its canonical (indexable or not)", async () => {
    const pages = (await RESOLVED).filter((p) => p.metadata && p.route !== "/");
    const offenders: string[] = [];
    for (const p of pages) {
      const c = p.metadata!.alternates?.canonical;
      const href = typeof c === "string" ? c : c && typeof c === "object" && "url" in c ? String(c.url) : "";
      if (href && /^https:\/\/blockid\.au\/?$/.test(href)) offenders.push(`${p.route}: canonical "${href}"`);
    }
    expect(offenders).toEqual([]);
  });

  it("the root layout carries no default canonical (it would be merged into every page)", () => {
    const src = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
    expect(src).not.toMatch(/alternates:\s*\{\s*canonical:\s*SITE_URL/);
  });

  it("/startup-index is the one canonical index URL and /index is a 301, not a page", async () => {
    const pages = await RESOLVED;
    const idx = pages.find((p) => p.route === "/startup-index");
    expect(idx?.kind).toBe("indexable");
    const c = idx!.metadata!.alternates!.canonical;
    expect(typeof c === "string" ? c : String((c as { url: string }).url)).toBe("https://blockid.au/startup-index");
    expect(pages.find((p) => p.route === "/index")).toBeUndefined();
    const listings = pages.filter((p) => p.route.startsWith("/startup-index/listings"));
    expect(listings.length).toBe(2);
    for (const l of listings) {
      const lc = l.metadata!.alternates!.canonical;
      expect(typeof lc === "string" ? lc : String((lc as { url: string }).url), l.route).toMatch(/^https:\/\/blockid\.au\/startup-index\/listings/);
    }
  });

  it("the root template is what the sweep assumes (%s | BlockID.au)", () => {
    // The root layout loads next/font at module scope, so read the source
    // rather than importing it.
    const src = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
    expect(src).toContain(`template: "%s${BRAND_SUFFIX}"`);
  });
});
