// Table-driven test for the legacy → v4 redirect table (G13-W1-IA1, D6).
//
//   • every live redirect's destination page exists on disk (no 308 → 404)
//   • no live source still has a page (config redirects run before routing,
//     so a page behind a redirect is dead weight — delete it)
//   • no chains: a destination is never itself a source
//   • sources are unique across live + deferred; nothing in NEVER_REDIRECT
//   • deferred rows point at pages that do NOT exist yet — the moment a hub
//     sprint creates one, this fails and the row moves to LEGACY_REDIRECTS
//   • `legacyRedirectRows()` is the exact shape next.config.ts spreads

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFERRED_REDIRECTS,
  LEGACY_REDIRECTS,
  NEVER_REDIRECT,
  legacyRedirectRows,
  resolveLegacyRedirect,
} from "./legacy-redirects";

const APP_DIR = resolve(__dirname, "../../app");

/** Every page.tsx under src/app as a URL path with `(group)` folders stripped. */
function collectRoutes(dir: string, prefix: string, out: Set<string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      collectRoutes(join(dir, entry.name), isGroup ? prefix : prefix + "/" + entry.name, out);
    } else if (entry.name === "page.tsx") {
      out.add(prefix || "/");
    }
  }
}
const ROUTES = new Set<string>();
collectRoutes(APP_DIR, "", ROUTES);

/** Strip `:path*` style params so `/workspace/plan/guide/:path*` checks `/workspace/plan/guide`. */
function staticPart(route: string): string {
  return route.replace(/\/:[^/]+$/, "").split("?")[0];
}

/** A route "exists" when its page or a dynamic segment page covers it. */
function routeExists(route: string): boolean {
  const r = staticPart(route);
  if (ROUTES.has(r)) return true;
  // `/workspace/guide/:path*` → `/workspace/guide/[chapter]`
  for (const known of ROUTES) {
    if (known.includes("[") && known.replace(/\/\[[^\]]+\]/g, "") === r) return true;
  }
  return false;
}

describe("LEGACY_REDIRECTS — live table", () => {
  it("has at least the D10 renames + the deleted alias pages", () => {
    const sources = LEGACY_REDIRECTS.map((r) => r.source);
    for (const s of [
      "/workspace/evaluation",
      "/workspace/investor/preferences",
      "/workspace/investor-preferences",
      "/workspace/deal-flow",
      "/workspace/watchlist",
      "/workspace/portfolio",
      "/workspace/client-roster",
      "/workspace/advisor-notes",
      "/workspace/cohort",
      "/workspace/reports/upgrade",
    ]) {
      expect(sources, s).toContain(s);
    }
    expect(resolveLegacyRedirect("/workspace/evaluation")).toBe("/workspace/score/criteria");
    expect(resolveLegacyRedirect("/workspace/investor/preferences")).toBe("/workspace/investor/mandate");
    expect(resolveLegacyRedirect("/workspace/billing")).toBeNull();
  });

  it("every destination page exists and no source still has a page", () => {
    for (const r of LEGACY_REDIRECTS) {
      expect(routeExists(r.destination), `${r.source} → ${r.destination} (missing page)`).toBe(true);
      expect(routeExists(r.source), `${r.source} still has a page.tsx — delete it (config redirects run first)`).toBe(false);
    }
  });

  it("never chains: a destination is not a source, and sources are rooted + unique", () => {
    const sources = new Set(LEGACY_REDIRECTS.map((r) => r.source));
    expect(sources.size).toBe(LEGACY_REDIRECTS.length);
    for (const r of LEGACY_REDIRECTS) {
      expect(r.source.startsWith("/"), r.source).toBe(true);
      expect(r.destination.startsWith("/"), r.destination).toBe(true);
      expect(r.source, "self-redirect").not.toBe(r.destination);
      expect(sources.has(r.destination), `${r.destination} chains`).toBe(false);
    }
  });

  it("D6 — protected routes never appear as a source (live or deferred)", () => {
    const all = [...LEGACY_REDIRECTS, ...DEFERRED_REDIRECTS];
    for (const r of all) {
      for (const p of NEVER_REDIRECT) {
        if (p.includes("[")) {
          // Dynamic protected route (`/workspace/reports/[id]`): the base and a
          // catch-all over it are forbidden; a literal sibling page that
          // shadowed the param (`/workspace/reports/upgrade`) is not an id.
          const base = p.replace(/\/\[[^\]]+\]$/, "");
          expect(r.source === base || r.source.startsWith(`${base}/:`), `${r.source} touches protected ${p}`).toBe(false);
        } else {
          expect(r.source === p || r.source.startsWith(`${p}/`), `${r.source} touches protected ${p}`).toBe(false);
        }
      }
    }
  });

  it("legacyRedirectRows() is the exact {source, destination, permanent} shape for next.config.ts", () => {
    const rows = legacyRedirectRows();
    expect(rows).toHaveLength(LEGACY_REDIRECTS.length);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["destination", "permanent", "source"]);
      expect(row.permanent).toBe(true);
    }
  });
});

describe("DEFERRED_REDIRECTS — spec §A.5 rows waiting on later sprints", () => {
  it("covers every §A.5 hub and is unique against the live table", () => {
    const live = new Set(LEGACY_REDIRECTS.map((r) => r.source));
    const seen = new Set<string>();
    for (const r of DEFERRED_REDIRECTS) {
      expect(live.has(r.source), `${r.source} is both live and deferred`).toBe(false);
      expect(seen.has(r.source), `${r.source} duplicated`).toBe(false);
      seen.add(r.source);
      expect(["S-IA2", "S-IA4", "S-IA5"]).toContain(r.pendingSprint);
    }
    expect(DEFERRED_REDIRECTS.length).toBeGreaterThanOrEqual(80);
    const hubs = new Set(DEFERRED_REDIRECTS.map((r) => r.destination.split("/").slice(0, 3).join("/")));
    for (const hub of [
      "/workspace/score", "/workspace/evidence", "/workspace/plan", "/workspace/reports", "/workspace/investors",
      "/workspace/valuation", "/workspace/raise", "/workspace/accelerators", "/workspace/finance", "/workspace/equity",
      "/workspace/esop", "/workspace/team", "/workspace/strategy", "/workspace/documents", "/workspace/exit",
      "/workspace/projects", "/workspace/settings", "/workspace/investor", "/workspace/accelerator",
    ]) {
      expect(hubs.has(hub), hub).toBe(true);
    }
  });

  it("every deferred destination does NOT exist yet — when it does, move the row to LEGACY_REDIRECTS (held rows excepted)", () => {
    const ripe: string[] = [];
    for (const r of DEFERRED_REDIRECTS) {
      if (r.held) {
        expect(routeExists(r.destination), `${r.source}: held row must point at a real page`).toBe(true);
        expect(r.note, `${r.source}: held row needs a reason`).toBeTruthy();
        continue;
      }
      if (routeExists(r.destination)) ripe.push(`${r.source} → ${r.destination} (${r.pendingSprint})`);
    }
    expect(ripe, "deferred destinations that now exist — promote them").toEqual([]);
    expect(DEFERRED_REDIRECTS.filter((r) => r.held).map((r) => r.source)).toEqual(["/dashboard/reports", "/dashboard/onboarding"]);
  });

  it("every deferred source still has a page today (nothing silently 404s)", () => {
    for (const r of DEFERRED_REDIRECTS) {
      expect(routeExists(r.source), `${r.source} has no page and no live redirect`).toBe(true);
    }
  });

  it("only /dashboard/onboarding is temporary (307)", () => {
    const temp = DEFERRED_REDIRECTS.filter((r) => !r.permanent).map((r) => r.source);
    expect(temp).toEqual(["/dashboard/onboarding"]);
  });
});
