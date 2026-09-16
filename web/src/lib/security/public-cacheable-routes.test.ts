// S31-D — the public-page caching allow-list.
//
// Two things are pinned here:
//   1. the matcher / cache-control shape the proxy relies on, and
//   2. a static guard: every page a listed pattern serves — plus every
//      layout above it — must be renderable WITHOUT a request, i.e. its
//      server import tree (relative + `@/` imports, stopping at "use client"
//      modules) never imports `next/headers`, calls `connection()` /
//      `unstable_noStore()`, reads `searchParams`, or declares
//      `dynamic = "force-dynamic"` / `revalidate = 0`. Any of those makes
//      the route dynamic, which means no prerendered document, which means
//      the proxy silently falls back to the nonce CSP + `private` and the
//      route never reaches the edge cache. Modelled on
//      lib/server-calls-client-export.test.ts.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_CACHE_CONTROL,
  PUBLIC_CACHEABLE_ROUTES,
  publicCacheControl,
  publicCacheableRoute,
  publicHashModeEnabled,
} from "./public-cacheable-routes";

const SRC = resolve(__dirname, "..", "..");
const APP = join(SRC, "app");

describe("publicCacheableRoute()", () => {
  it("matches the documented public surfaces and nothing signed-in", () => {
    for (const p of [
      "/",
      "/pricing",
      "/about",
      "/funding",
      "/funding/grants",
      "/funding/grants/state/NSW",
      "/funding/grants/mvp-ventures",
      "/funding/programs/sydney",
      "/funding/programs/sydney/startmate",
      "/startup-index",
      "/startup-index/listings/BID",
      "/compare",
      "/compare/blockid-vs-carta",
      "/insights",
      "/insights/some-article",
      "/showcase",
      "/showcase/atlassian/agents/cfo",
      "/solutions",
      "/solutions/founder",
      "/docs",
      "/docs/unlocks",
      "/legal",
      "/legal/terms",
    ]) {
      expect(publicCacheableRoute(p), p).not.toBeNull();
    }
    for (const p of [
      "/dashboard",
      "/workspace/settings/audit",
      "/auth/login",
      "/signup",
      "/analyze",
      "/api/status",
      "/funding/grants/view",
      "/funding/grants/state",
      "/funding/programs",
      "/startup-index/listings",
      "/vi/pricing",
      "/pricing/",
      "/pricingx",
      "/showcase/../admin",
    ]) {
      expect(publicCacheableRoute(p), p).toBeNull();
    }
  });

  it("emits public s-maxage + stale-while-revalidate; the private default is the Next one", () => {
    const home = publicCacheableRoute("/")!;
    expect(publicCacheControl(home)).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(PRIVATE_CACHE_CONTROL).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    for (const r of PUBLIC_CACHEABLE_ROUTES) {
      expect(r.sMaxAge, r.label).toBeGreaterThanOrEqual(60);
      expect(r.sMaxAge, r.label).toBeLessThanOrEqual(3600);
      expect(r.staleWhileRevalidate, r.label).toBeGreaterThan(0);
      expect(r.pages.length, r.label).toBeGreaterThan(0);
    }
  });

  it("the flag is off unless CSP_PUBLIC_HASH_MODE=1 exactly", () => {
    expect(publicHashModeEnabled({})).toBe(false);
    expect(publicHashModeEnabled({ CSP_PUBLIC_HASH_MODE: "true" })).toBe(false);
    expect(publicHashModeEnabled({ CSP_PUBLIC_HASH_MODE: "0" })).toBe(false);
    expect(publicHashModeEnabled({ CSP_PUBLIC_HASH_MODE: "1" })).toBe(true);
  });
});

// ── static guard ─────────────────────────────────────────────────────────

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const IMPORT_RE = /import\s+(?:type\s+)?[^'"]*?\s*from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

const ROOT_LAYOUT = join(APP, "layout.tsx");

// Drop line + block comments so prose about `noStore()` never trips the scan.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function dynamicMarkers(file: string, rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const hits: string[] = [];
  // The root layout keeps ONE flag-gated `headers()` call (today's
  // behaviour while CSP_PUBLIC_HASH_MODE is unset) — pinned separately below.
  if (file !== ROOT_LAYOUT && /from\s*["']next\/headers["']/.test(src)) hits.push("imports next/headers");
  if (/\bconnection\s*\(/.test(src) && /from\s*["']next\/server["']/.test(src)) hits.push("calls connection()");
  if (/\bunstable_noStore\b|\bnoStore\s*\(/.test(src)) hits.push("calls noStore()");
  if (/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(src)) hits.push('dynamic = "force-dynamic"');
  if (/export\s+const\s+revalidate\s*=\s*0\b/.test(src)) hits.push("revalidate = 0");
  if (/\/page\.tsx$/.test(file) && /\bsearchParams\b/.test(src)) hits.push("reads searchParams");
  return hits;
}

/** Walk the server import tree of `entry`; returns "file :: marker" offenders. */
function offendersOf(entry: string, seen: Set<string>, out: string[]): void {
  if (seen.has(entry)) return;
  seen.add(entry);
  const src = readFileSync(entry, "utf8");
  if (/^\s*["']use client["']/.test(src)) return; // client modules never run on the server render path
  for (const m of dynamicMarkers(entry, src)) out.push(`${relative(SRC, entry)} :: ${m}`);
  let im: RegExpExecArray | null;
  const re = new RegExp(IMPORT_RE.source, "g");
  while ((im = re.exec(src))) {
    if (im[0].startsWith("import type")) continue;
    const target = resolveImport(entry, im[1] ?? im[2] ?? im[3]!);
    if (target) offendersOf(target, seen, out);
  }
}

function layoutsAbove(pageFile: string): string[] {
  const layouts: string[] = [];
  let dir = dirname(pageFile);
  for (;;) {
    const l = join(dir, "layout.tsx");
    if (existsSync(l)) layouts.push(l);
    if (dir === APP) break;
    dir = dirname(dir);
  }
  return layouts;
}

describe("static guard — every allow-listed page renders without request access", () => {
  it("lists only page files that exist", () => {
    for (const r of PUBLIC_CACHEABLE_ROUTES) {
      for (const p of r.pages) expect(existsSync(join(APP, p)), `${r.label}: ${p}`).toBe(true);
    }
  });

  it("finds no next/headers, connection(), noStore(), searchParams, force-dynamic or revalidate=0 in any listed page's server tree (layouts included)", () => {
    const offenders: string[] = [];
    for (const r of PUBLIC_CACHEABLE_ROUTES) {
      for (const p of r.pages) {
        const page = join(APP, p);
        const seen = new Set<string>();
        const out: string[] = [];
        for (const l of layoutsAbove(page)) offendersOf(l, seen, out);
        offendersOf(page, seen, out);
        for (const o of out) offenders.push(`[${r.label}] ${p} → ${o}`);
      }
    }
    expect(
      offenders,
      "a listed public page (or a layout / module it imports on the server) reads request state — make it static or remove it from PUBLIC_CACHEABLE_ROUTES",
    ).toEqual([]);
  });

  it("the root layout reads request headers only when the flag is off", () => {
    const src = readFileSync(join(APP, "layout.tsx"), "utf8");
    // The one remaining `headers()` call is inside the `!publicHashModeEnabled()` branch.
    const calls = src.match(/await headers\(\)/g) ?? [];
    expect(calls.length).toBe(1);
    expect(src.indexOf("publicHashModeEnabled()")).toBeGreaterThan(-1);
    expect(src.indexOf("publicHashModeEnabled()")).toBeLessThan(src.indexOf("await headers()"));
  });
});
