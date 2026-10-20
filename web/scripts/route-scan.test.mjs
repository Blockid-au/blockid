// W1 (2026-10-20) — static internal route scan (scripts/route-scan.mjs).
// Silent regressions this guards against: a literal internal href in web/src
// (JSX href, router.push, redirect(), an `href:` / `url:` / `link:` field in
// an e-mail template, tour step or API body) that points at a route that does
// not exist — the crawler never sees e-mails, client-only state or JSON
// bodies. The last test runs the scan over the real tree: it must stay at 0.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_UNROUTED,
  DYN,
  collectRoutes,
  extractHrefs,
  legacyRedirectSources,
  makeResolver,
  matchesRoute,
  metadataSegments,
  nextConfigRedirectSources,
  normaliseHref,
  redirectSourceToRegExp,
  scanTree,
} from "./route-scan.mjs";

describe("route-scan helpers", () => {
  it("extractHrefs finds JSX hrefs, navigation calls and target fields; skips comments, //host and /_next", () => {
    const src = [
      `<Link href="/pricing">x</Link>`,
      `<a href={"/workspace/billing#credits"}>`,
      "<Link href={`/reports/${ticker}?tab=1`}>",
      `router.push("/workspace/reports");`,
      "redirect(`/auth/login?next=${next}`);",
      `return NextResponse.redirect(new URL("/dashboard", req.url));`,
      `  lco: { href: "/workspace/legal" },`,
      `cta: { label: { en: "x" }, href: "/innovator/theses" },`,
      `return json({ url: "/credits" });`,
      `link: "/wholesale/verify",`,
      `// href: "/commented"`,
      `<img src="//cdn.example/x.png">`,
      `href="/_next/static/x.js"`,
      "href={`/${slug}`}",
    ].join("\n");
    expect(extractHrefs(src).map((h) => h.href)).toEqual([
      "/pricing",
      "/workspace/billing",
      `/reports/${DYN}`,
      "/workspace/reports",
      "/auth/login",
      "/dashboard",
      "/workspace/legal",
      "/innovator/theses",
      "/credits",
      "/wholesale/verify",
    ]);
    expect(extractHrefs("a\n<Link href=\"/x\">")[0].line).toBe(2);
  });

  it("normaliseHref drops query/fragment/trailing slash and rejects non-route literals", () => {
    expect(normaliseHref("/a/b/?x=1#y")).toBe("/a/b");
    expect(normaliseHref("/")).toBe("/");
    expect(normaliseHref("/vi${p}")).toBe(`/vi${DYN}`);
    expect(normaliseHref("//cdn.example/x")).toBeNull();
    expect(normaliseHref("/${slug}")).toBeNull();
    expect(normaliseHref("/a b")).toBeNull();
  });

  it("matchesRoute: static, [x], [...x] (1+), [[...x]] (0+), interpolated segments", () => {
    expect(matchesRoute(["pricing"], "/pricing")).toBe(true);
    expect(matchesRoute(["pricing"], "/pricing/x")).toBe(false);
    expect(matchesRoute([], "/")).toBe(true);
    expect(matchesRoute(["reports", "[ticker]"], "/reports/ABC")).toBe(true);
    expect(matchesRoute(["reports", "[ticker]"], "/reports")).toBe(false);
    expect(matchesRoute(["docs", "[...slug]"], "/docs/a/b")).toBe(true);
    expect(matchesRoute(["docs", "[...slug]"], "/docs")).toBe(false);
    expect(matchesRoute(["legal", "[[...doc]]"], "/legal")).toBe(true);
    expect(matchesRoute(["legal", "[[...doc]]"], "/legal/a/b")).toBe(true);
    expect(matchesRoute(["workspace", "billing"], `/workspace/${DYN}`)).toBe(true);
    expect(matchesRoute(["vi"], `/vi${DYN}`)).toBe(true);
  });

  it("metadataSegments maps metadata files to their URL segment", () => {
    expect(metadataSegments("sitemap.ts")).toEqual(["sitemap.xml"]);
    expect(metadataSegments("robots.ts")).toEqual(["robots.txt"]);
    expect(metadataSegments("opengraph-image.tsx")).toEqual(["opengraph-image"]);
    expect(metadataSegments("icon.png")).toEqual(["icon.png", "icon"]);
    expect(metadataSegments("layout.tsx")).toEqual([]);
  });

  it("redirect sources: path-to-regexp params, the live legacy table only, next.config literal rows", () => {
    expect(redirectSourceToRegExp("/index/:path*").test("/index")).toBe(true);
    expect(redirectSourceToRegExp("/index/:path*").test("/index/a/b")).toBe(true);
    expect(redirectSourceToRegExp("/for/:who").test("/for/founder")).toBe(true);
    expect(redirectSourceToRegExp("/for/:who").test("/for/a/b")).toBe(false);
    expect(redirectSourceToRegExp("/svi").test("/svi")).toBe(true);
    expect(redirectSourceToRegExp("/svi").test("/svi-x")).toBe(false);
    const legacy = `export const LEGACY_REDIRECTS = [{ source: "/live-row", destination: "/x" }];\nexport const DEFERRED_REDIRECTS = [{ source: "/not-yet", destination: "/y" }];`;
    expect(legacyRedirectSources(legacy)).toEqual(["/live-row"]);
    const cfg = `async redirects() { return [{ source: "/login", destination: "/auth/login" }, { source: "/(.*)", has: [] }]; },\n async headers() { return [{ source: "/:path*.(png)" }]; }`;
    expect(nextConfigRedirectSources(cfg)).toEqual(["/login"]);
  });

  it("collectRoutes honours route groups, parallel slots, private folders and metadata files", async () => {
    const app = mkdtempSync(join(tmpdir(), "route-scan-"));
    const touch = (rel) => {
      const full = join(app, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, "export default 1");
    };
    touch("page.tsx");
    touch("(marketing)/pricing/page.tsx");
    touch("(app)/(founder)/workspace/billing/page.tsx");
    touch("dashboard/@modal/page.tsx");
    touch("_components/page.tsx");
    touch("api/health/route.ts");
    touch("opengraph-image.tsx");
    touch("listings/[slug]/page.tsx");
    const routes = (await collectRoutes(app)).map((r) => `/${r.join("/")}`).sort();
    expect(routes).toEqual(["/", "/api/health", "/dashboard", "/listings/[slug]", "/opengraph-image", "/pricing", "/workspace/billing"]);
  });

  it("makeResolver: route, public file, redirect source, allow-list — else unresolved", () => {
    const resolve = makeResolver({
      routes: [["pricing"], ["reports", "[ticker]"]],
      publicFiles: new Set(["/robots-extra.txt"]),
      redirectSources: ["/old/:path*", "/dashboard/onboarding"],
    });
    expect(resolve("/pricing")).toBe("route");
    expect(resolve(`/reports/${DYN}`)).toBe("route");
    expect(resolve("/robots-extra.txt")).toBe("public");
    expect(resolve("/dashboard/onboarding")).toBe("redirect");
    expect(resolve(`/old/${DYN}`)).toBe("redirect");
    expect(resolve("/cdn-cgi/l/email-protection")).toBe("allowed");
    expect(resolve("/workspace/legal")).toBeNull();
    for (const [, reason] of ALLOWED_UNROUTED) expect(reason.length).toBeGreaterThan(20);
  });
});

describe("route-scan over web/src", () => {
  it("every literal internal href resolves to a route, a public file or a redirect", async () => {
    const r = await scanTree();
    expect(r.routes).toBeGreaterThan(500);
    expect(r.checked).toBeGreaterThan(1000);
    expect(r.unresolved, JSON.stringify(r.unresolved, null, 2)).toEqual([]);
  }, 60_000);
});
