// App Router route inventory for the release-QA link tests (2026-09-12).
//
// Walks `src/app/**/page.tsx` once and turns every folder path into a route
// pattern — route groups `(marketing)` are dropped, `[slug]` matches one
// segment, `[...rest]` / `[[...rest]]` match the remainder — so a test can
// ask "does this internal path resolve to a real page?" without booting
// Next. Pure `node:fs`; no React, no Next runtime.
//
// Used by `src/app/sitemap.test.ts` (every static sitemap entry must be a
// page, never a redirect source) and `src/lib/insights/links.test.ts`
// (every internal link in `content/insights/*.md` must resolve).

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface RoutePattern {
  /** Display form, e.g. `/funding/grants/[id]`. */
  route: string;
  /** Anchored regex over the pathname (no query, no hash). */
  re: RegExp;
  file: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, out);
    } else if (name === "page.tsx" || name === "page.ts" || name === "page.mdx") {
      out.push(p);
    }
  }
  return out;
}

/** `src/app/(marketing)/funding/grants/[id]/page.tsx` → `/funding/grants/[id]`. */
export function routeOfPageFile(appDir: string, file: string): string {
  const rel = relative(appDir, dirname(file));
  const segs = rel.split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !/^@/.test(s));
  return `/${segs.join("/")}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn `/a/[b]/[...c]` into an anchored regex. */
export function routeToRegExp(route: string): RegExp {
  const parts = route.split("/").filter(Boolean);
  const out = parts.map((seg) => {
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(seg)) return "(?:/.+)?"; // optional catch-all
    if (/^\[\.\.\.[^\]]+\]$/.test(seg)) return "/.+"; // catch-all
    if (/^\[[^\]]+\]$/.test(seg)) return "/[^/]+"; // dynamic segment
    return `/${escapeRe(seg)}`;
  });
  const body = out.join("") || "/";
  return new RegExp(`^${body}/?$`);
}

/** Every page route under `appDir`, as patterns. */
export function listAppRoutes(appDir: string): RoutePattern[] {
  return walk(appDir)
    .map((file) => {
      const route = routeOfPageFile(appDir, file);
      return { route, re: routeToRegExp(route), file };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

/** Strip origin, query and hash: `https://blockid.au/x?y#z` → `/x`. */
export function pathnameOf(href: string): string {
  let s = href.trim();
  s = s.replace(/^https?:\/\/(www\.)?blockid\.au(?=\/|$)/i, "");
  s = s.split("#")[0]!.split("?")[0]!;
  if (s === "") return "/";
  return s;
}

/** The first route pattern that matches `pathname`, or null. */
export function matchRoute(routes: ReadonlyArray<RoutePattern>, pathname: string): RoutePattern | null {
  // Prefer static routes over dynamic ones so `/tools/esic` reports the
  // real page rather than a sibling `[slug]`.
  const statics = routes.filter((r) => !r.route.includes("["));
  const dynamics = routes.filter((r) => r.route.includes("["));
  for (const list of [statics, dynamics]) {
    for (const r of list) if (r.re.test(pathname)) return r;
  }
  return null;
}
