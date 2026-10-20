#!/usr/bin/env node
// W1 (2026-10-20, docs/pricing-v5-plan.md § 5) — static internal route scan.
//
// Finds literal internal hrefs in web/src (JSX `href`, `router.push/replace`,
// `redirect()` / `permanentRedirect()`, `NextResponse.redirect(new URL(…))`
// and `href|path|url|link|ctaHref|backHref` object fields) and asserts each
// resolves to something the app serves:
//
//   - a page / route handler / metadata route under web/src/app (route groups
//     `(x)` and parallel slots `@x` are transparent, `_private` folders are
//     not routable, `[x]` / `[...x]` / `[[...x]]` are dynamic);
//   - a file under web/public;
//   - a redirect source (src/lib/nav/legacy-redirects.ts LEGACY_REDIRECTS +
//     the literal rows in next.config.ts `redirects()`).
//
// Template literals keep their static parts: `/reports/${ticker}` is checked
// as `/reports/:dyn`, which any single segment satisfies. Query strings and
// fragments are dropped. The proxy's rewrites (subdomains, `?state=` grants,
// demo bands) only rewrite paths that already exist, so they need no table.
//
// Why: a weekly e-mail CTA (`/workspace/legal`), three tour CTAs
// (`/innovator/theses|pipeline|reports`), an API 402 body (`/credits`) and an
// API 403 body (`/wholesale/verify`) pointed at routes that never existed —
// the crawler cannot see them (e-mail, client-only state, JSON bodies).
//
// Pure helpers are exported for scripts/route-scan.test.mjs, which also runs
// the scan over the real tree and fails on any unresolved href.
//
//   node scripts/route-scan.mjs          # print unresolved hrefs, exit 1 if any
//   node scripts/route-scan.mjs --json

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Placeholder for an interpolated template segment. */
export const DYN = ":dyn";

const PAGE_FILE = /^(page|route)\.(tsx|ts|jsx|js|mdx)$/;
/** Metadata route files → the URL segment they serve. */
const METADATA_FILE = /^(sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(tsx|ts|jsx|js|xml|txt|webmanifest|json|png|jpe?g|gif|ico|svg)$/;
const METADATA_DYNAMIC_EXT = { sitemap: ".xml", robots: ".txt", manifest: ".webmanifest" };

/**
 * One metadata file name → the URL segments it answers. `sitemap.ts` →
 * `sitemap.xml`; `opengraph-image.tsx` → `opengraph-image`; a static
 * `icon.png` → `icon.png` and `icon`.
 */
export function metadataSegments(fileName) {
  const m = METADATA_FILE.exec(fileName);
  if (!m) return [];
  const [, base, ext] = m;
  if (/^(tsx|ts|jsx|js)$/.test(ext)) return [`${base}${METADATA_DYNAMIC_EXT[base] ?? ""}`];
  return [`${base}.${ext}`, base];
}

/** Walk web/src/app → route patterns (arrays of segments). */
export async function collectRoutes(appDir) {
  const routes = [];
  const walk = async (dir, segs) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries) {
      if (d.isDirectory()) {
        if (d.name.startsWith("_") || d.name === "node_modules") continue; // private folder
        if (d.name.startsWith("(.")) continue; // intercepting route — no URL of its own
        const transparent = /^\(.*\)$/.test(d.name) || d.name.startsWith("@");
        await walk(path.join(dir, d.name), transparent ? segs : [...segs, d.name]);
      } else if (PAGE_FILE.test(d.name)) {
        routes.push(segs);
      } else {
        for (const seg of metadataSegments(d.name)) routes.push([...segs, seg]);
      }
    }
  };
  await walk(appDir, []);
  return routes;
}

/** Every file under web/public as a URL path. */
export async function collectPublic(publicDir) {
  const out = new Set();
  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(dir, e.name), `${prefix}/${e.name}`);
      else out.add(`${prefix}/${e.name}`);
    }
  };
  await walk(publicDir, "");
  return out;
}

const isDynamic = (s) => /^\[[^\].]+\]$/.test(s);
const isCatchAll = (s) => /^\[\.\.\.[^\]]+\]$/.test(s);
const isOptionalCatchAll = (s) => /^\[\[\.\.\.[^\]]+\]\]$/.test(s);

/** Does `urlPath` (leading slash, no query) match one route pattern? */
export function matchesRoute(pattern, urlPath) {
  const parts = urlPath.split("/").filter(Boolean);
  const go = (pi, ui) => {
    if (pi === pattern.length) return ui === parts.length;
    const seg = pattern[pi];
    if (isOptionalCatchAll(seg)) return true;
    if (isCatchAll(seg)) return ui < parts.length;
    if (ui >= parts.length) return false;
    const part = parts[ui];
    if (isDynamic(seg)) return go(pi + 1, ui + 1);
    // An interpolated piece (`:dyn`, or `foo-:dyn`) may be any literal segment.
    if (part.includes(DYN)) {
      const re = new RegExp(`^${part.split(DYN).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      return re.test(seg) && go(pi + 1, ui + 1);
    }
    return seg === part && go(pi + 1, ui + 1);
  };
  return go(0, 0);
}

/** Next `redirects()` source (path-to-regexp subset) → RegExp. */
export function redirectSourceToRegExp(source) {
  let re = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === ":") {
      const m = /^:([A-Za-z0-9_]+)(\([^)]*\))?([*+?])?/.exec(source.slice(i));
      if (m) {
        const [whole, , custom, mod] = m;
        const body = custom ? custom.slice(1, -1) : "[^/]+";
        if (mod === "*") re += `(?:${body}(?:/${body})*)?`;
        else if (mod === "+") re += `${body}(?:/${body})*`;
        else if (mod === "?") re += `(?:${body})?`;
        else re += body;
        i += whole.length - 1;
        continue;
      }
    }
    if (ch === "(") {
      const close = source.indexOf(")", i);
      if (close > i) {
        re += `(?:${source.slice(i + 1, close)})`;
        i = close;
        continue;
      }
    }
    re += /[.*+?^${}|[\]\\]/.test(ch) ? `\\${ch}` : ch;
  }
  // `/x/:path*` also matches `/x` (Next drops the empty tail).
  return new RegExp(`^${re.replace(/\/\(\?:/g, "(?:/")}/?$`);
}

/**
 * `source:` values of the LIVE table in src/lib/nav/legacy-redirects.ts —
 * the LEGACY_REDIRECTS block only (DEFERRED_REDIRECTS are not served yet).
 * Read as text: that file is plain data and the CLI runs without a TS loader.
 */
export function legacyRedirectSources(text) {
  const start = text.indexOf("export const LEGACY_REDIRECTS");
  if (start < 0) return [];
  const end = text.indexOf("export const DEFERRED_REDIRECTS", start);
  const block = text.slice(start, end > start ? end : undefined);
  return [...block.matchAll(/source:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Literal `source:` values in next.config.ts redirects() (catch-all host rules excluded). */
export function nextConfigRedirectSources(text) {
  const start = text.indexOf("async redirects()");
  const end = start >= 0 ? text.indexOf("async headers()", start) : -1;
  const block = start >= 0 ? text.slice(start, end > start ? end : undefined) : "";
  return [...block.matchAll(/source:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter((s) => s !== "/(.*)" && s !== "/:path*");
}

const PATTERNS = [
  // JSX attribute string: href="/x"
  /\bhref\s*=\s*"(\/[^"]*)"/g,
  /\bhref\s*=\s*'(\/[^']*)'/g,
  // JSX expression: href={"/x"} / href={`/x/${id}`}
  /\bhref\s*=\s*\{\s*"(\/[^"]*)"\s*\}/g,
  /\bhref\s*=\s*\{\s*`(\/[^`]*)`\s*\}/g,
  // navigation calls
  /\b(?:router\.(?:push|replace|prefetch)|redirect|permanentRedirect)\(\s*"(\/[^"]*)"/g,
  /\b(?:router\.(?:push|replace|prefetch)|redirect|permanentRedirect)\(\s*`(\/[^`]*)`/g,
  /\bNextResponse\.redirect\(\s*new URL\(\s*["'`](\/[^"'`]*)["'`]/g,
  // object fields that carry a navigation target
  /\b(?:href|ctaHref|backHref|link|url|path)\s*:\s*"(\/[^"]*)"/g,
  /\b(?:href|ctaHref|backHref|link|url|path)\s*:\s*`(\/[^`]*)`/g,
];

/**
 * Normalise a captured literal: interpolations → `:dyn`, query/fragment
 * dropped, trailing slash trimmed. Returns null for non-paths
 * (protocol-relative `//`, `/_next/`, an expression-only template).
 */
export function normaliseHref(raw) {
  let s = raw.replace(/\$\{[^}]*\}/g, DYN);
  s = s.split(/[?#]/)[0];
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (s.startsWith("/_next/")) return null;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  if (s === "") s = "/";
  // A fully dynamic path (`/${slug}` → `/:dyn`) or one with whitespace is not a route literal.
  if (/\s/.test(s) || s === `/${DYN}`) return null;
  return s;
}

/** Hrefs in one source file: `[{ line, href }]`. */
export function extractHrefs(text) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // comment lines
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const href = normaliseHref(m[1]);
        if (href) out.push({ line: i + 1, href });
      }
    }
  }
  return out;
}

/**
 * Known, deliberate non-route hrefs: `[href, reason]`. Keep this tiny — a
 * new entry needs a reason a reviewer can check.
 */
export const ALLOWED_UNROUTED = new Map([
  ["/cdn-cgi/l/email-protection", "Cloudflare edge path (Scrape Shield) — served by the CDN, never by Next"],
]);

/** Resolve one href against routes / public files / redirect sources. */
export function makeResolver({ routes, publicFiles, redirectSources }) {
  const redirectRes = redirectSources.map(redirectSourceToRegExp);
  return (href) => {
    if (ALLOWED_UNROUTED.has(href)) return "allowed";
    if (publicFiles.has(href)) return "public";
    if (routes.some((r) => matchesRoute(r, href))) return "route";
    if (!href.includes(DYN) && redirectRes.some((re) => re.test(href))) return "redirect";
    // `/legacy/:dyn` against a `/legacy/:path*` source
    if (href.includes(DYN) && redirectRes.some((re) => re.test(href.split(DYN).join("x")))) return "redirect";
    return null;
  };
}

const SOURCE_FILE = /\.(tsx|ts|jsx|js|mjs)$/;
const SKIP_FILE = /\.(test|spec|stories)\.(tsx|ts|jsx|js|mjs)$/;

/** Scan web/src → `{ checked, unresolved: [{ file, line, href }] }`. */
export async function scanTree(webDir = WEB_DIR) {
  const routes = await collectRoutes(path.join(webDir, "src", "app"));
  const publicFiles = await collectPublic(path.join(webDir, "public"));
  const legacy = await readFile(path.join(webDir, "src", "lib", "nav", "legacy-redirects.ts"), "utf8");
  const nextConfig = await readFile(path.join(webDir, "next.config.ts"), "utf8");
  const redirectSources = [...legacyRedirectSources(legacy), ...nextConfigRedirectSources(nextConfig)];
  const resolve = makeResolver({ routes, publicFiles, redirectSources });
  const unresolved = [];
  let checked = 0;
  const walk = async (dir) => {
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (d.name === "node_modules" || d.name === "__tests__" || d.name === "__mocks__" || d.name === "test") continue;
        await walk(full);
      } else if (SOURCE_FILE.test(d.name) && !SKIP_FILE.test(d.name)) {
        const text = await readFile(full, "utf8");
        for (const { line, href } of extractHrefs(text)) {
          checked += 1;
          if (!resolve(href)) unresolved.push({ file: path.relative(webDir, full), line, href });
        }
      }
    }
  };
  await walk(path.join(webDir, "src"));
  return { routes: routes.length, redirectSources: redirectSources.length, checked, unresolved };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  scanTree().then(
    (r) => {
      if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(r)}\n`);
      else {
        process.stdout.write(`[route-scan] ${r.checked} hrefs · ${r.routes} routes · ${r.redirectSources} redirect sources · ${r.unresolved.length} unresolved\n`);
        for (const u of r.unresolved) process.stdout.write(`  ✗ ${u.file}:${u.line} ${u.href}\n`);
      }
      process.exit(r.unresolved.length ? 1 : 0);
    },
    (err) => {
      process.stderr.write(`[route-scan] crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(2);
    },
  );
}
