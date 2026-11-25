// G36 — the proxy picks the serving route for filtered public URLs; these
// next.config beforeFiles rewrites carry it out in-process. Evaluated here
// with Next's OWN matcher (matchHas / prepareDestination / checkCustomRoutes)
// so a proxy target and the route Next actually serves can never drift.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { matchHas, prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import { checkCustomRoutes, type Rewrite, type RouteHas } from "next/dist/lib/load-custom-routes";
import nextConfig from "../../../next.config";
import { grantsRewriteTarget } from "@/lib/funding/grants-route";
import { AU_STATES } from "@/lib/funding/seed-map";
import { DEMO_BANDS, demoBandRewriteTarget } from "@/lib/report-v2/demo-band-route";
import { INTERNAL_ROUTE_HEADER, internalRouteRewrites, type InternalRouteRewrite } from "./internal-route-rewrites";

type Query = Record<string, string | string[]>;

/** What Next's router does with the beforeFiles list for one request: first match wins. */
function route(
  rules: InternalRouteRewrite[],
  pathname: string,
  query: Query,
  headers: Record<string, string>,
): { pathname: string; query: Query } | null {
  const req = {
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  } as unknown as IncomingMessage;
  for (const rule of rules) {
    if (rule.source !== pathname) continue; // every source here is a literal path
    const params = matchHas(req, query, rule.has as RouteHas[], rule.missing as RouteHas[]);
    if (!params) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: true,
      destination: rule.destination,
      params,
      query,
    });
    return { pathname: parsedDestination.pathname ?? "", query: parsedDestination.query as Query };
  }
  return null;
}

const queryOf = (search: string): Query => {
  const q: Query = {};
  for (const [k, v] of new URLSearchParams(search)) {
    const prev = q[k];
    q[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return q;
};

/** Proxy decision → header → router; returns the path Next would render. */
function served(pathname: string, search: string, extraHeaders: Record<string, string> = {}) {
  const sp = new URLSearchParams(search);
  const target = grantsRewriteTarget(pathname, sp) ?? demoBandRewriteTarget(pathname, sp);
  const headers = { ...extraHeaders, ...(target ? { [INTERNAL_ROUTE_HEADER]: target } : {}) };
  return { target, routed: route(internalRouteRewrites(), pathname, queryOf(search), headers) };
}

describe("internalRouteRewrites()", () => {
  it("every target the proxy can emit lands on exactly that path, query untouched (no params appended)", () => {
    const cases: Array<[string, string]> = [
      ["/funding/grants", "type=grant"],
      ["/funding/grants", "type=tax_deduction&stage=idea"],
      ["/funding/grants", "state=XX"],
      ["/funding/grants", "state=NSW&type=voucher"],
      ...AU_STATES.map((s): [string, string] => ["/funding/grants", `state=${s.toLowerCase()}`]),
      ...DEMO_BANDS.map((b): [string, string] => ["/tbr/demo", `band=${b.toLowerCase()}`]),
    ];
    for (const [path, search] of cases) {
      const { target, routed } = served(path, search);
      expect(target, `${path}?${search}`).not.toBeNull();
      expect(routed?.pathname, `${path}?${search}`).toBe(target);
      expect(routed?.query, `${path}?${search}`).toEqual(queryOf(search));
    }
  });

  it("no proxy decision → no rewrite (bare pages, junk bands, other paths)", () => {
    for (const [path, search] of [
      ["/funding/grants", ""],
      ["/funding/grants", "utm_source=x&_rsc=abc"],
      ["/funding/grants", "type="],
      ["/tbr/demo", ""],
      ["/tbr/demo", "band=E"],
      ["/funding/grants/view", "type=grant"],
    ]) {
      const { target, routed } = served(path, search);
      expect(target, `${path}?${search}`).toBeNull();
      expect(routed, `${path}?${search}`).toBeNull();
    }
  });

  it("rules only fire on the exact proxy-emitted values (no partial / foreign targets)", () => {
    const rules = internalRouteRewrites();
    for (const value of [
      "/funding/grants/state/XX",
      "/funding/grants/state/nsw",
      "/funding/grants/view/extra",
      "/funding/grants/mvp-ventures",
      "/tbr/demo/band/E",
      "/admin",
      "",
    ]) {
      expect(route(rules, "/funding/grants", {}, { [INTERNAL_ROUTE_HEADER]: value }), value).toBeNull();
      expect(route(rules, "/tbr/demo", {}, { [INTERNAL_ROUTE_HEADER]: value }), value).toBeNull();
    }
    // A grants target on the demo path (and vice versa) never crosses over.
    expect(route(rules, "/tbr/demo", {}, { [INTERNAL_ROUTE_HEADER]: "/funding/grants/view" })).toBeNull();
    expect(route(rules, "/funding/grants", {}, { [INTERNAL_ROUTE_HEADER]: "/tbr/demo/band/A" })).toBeNull();
  });

  it("never fires on a prefetch — those skip the proxy (matcher), so the header cannot be the proxy's", () => {
    for (const prefetch of [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }]) {
      expect(served("/funding/grants", "type=grant", prefetch).routed).toBeNull();
      expect(served("/tbr/demo", "band=A", prefetch).routed).toBeNull();
    }
  });

  it("mirrors the proxy matcher's prefetch exclusions exactly", async () => {
    const { config } = await import("@/proxy");
    const matcherMissing = (config.matcher[0] as { missing: unknown[] }).missing;
    for (const rule of internalRouteRewrites()) expect(rule.missing).toEqual(matcherMissing);
  });
});

describe("next.config.ts rewrites()", () => {
  afterEach(() => vi.restoreAllMocks());

  it("registers the internal routes as beforeFiles (right after the proxy, before the filesystem)", async () => {
    const rewrites = await nextConfig.rewrites!();
    expect(Array.isArray(rewrites)).toBe(false);
    const { beforeFiles, afterFiles, fallback } = rewrites as {
      beforeFiles: unknown[];
      afterFiles: unknown[];
      fallback: unknown[];
    };
    expect(beforeFiles).toEqual(internalRouteRewrites());
    expect(afterFiles).toEqual([]);
    expect(fallback).toEqual([]);
  });

  it("passes Next's own custom-route validation (the build would exit otherwise)", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { beforeFiles } = (await nextConfig.rewrites!()) as { beforeFiles: unknown[] };
    expect(() => checkCustomRoutes(beforeFiles as Rewrite[], "rewrite")).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});
