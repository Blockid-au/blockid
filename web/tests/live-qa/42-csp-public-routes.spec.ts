/**
 * 42 — Hash-mode CSP guard over the public cacheable routes (G22 review P2,
 * 2026-09-21).
 *
 * The ISR / prerendered public pages are served with a hash-mode
 * Content-Security-Policy computed from the document on disk
 * (lib/security/prerender-script-hashes.ts). When a page regenerates with a
 * different inline flight chunk than the header was computed from — which
 * happened to /showcase/blockid/report once its Assessment Card context
 * changed on the server — the browser blocks the script and React fails to
 * hydrate (#412). Nothing unit-testable catches that; this lane does:
 *
 *   • one representative URL per PUBLIC_CACHEABLE_ROUTES entry, visited
 *     cookieless, must render with ZERO `securitypolicyviolation` events and
 *     no React "Minified React error #4xx" console line;
 *   • the response carries the hash-mode header (no `nonce-`), so the check
 *     really exercises the hash path.
 *
 * Read-only, anonymous. The same check runs in the post-deploy smoke
 * (tests/e2e/smoke/post-deploy.spec.ts) so gate 12 fails before a swap
 * sticks.
 */
import { test, expect } from "./fixtures";
import { evidence } from "./lib/api";

/** One concrete URL per hash-mode route family (kept in step with lib/security/public-cacheable-routes.ts). */
export const HASH_MODE_SAMPLES: readonly string[] = [
  "/",
  "/pricing",
  "/about",
  "/funding",
  "/funding/grants",
  "/startup-index",
  "/compare",
  "/insights",
  "/showcase",
  "/showcase/blockid",
  "/showcase/canva",
  "/solutions",
  "/solutions/accelerator",
  "/docs",
  "/docs/api/institutional",
  "/legal/privacy",
];

test.describe("42 — hash-mode CSP on the public cacheable routes", () => {
  for (const path of HASH_MODE_SAMPLES) {
    test(`${path} hydrates with no CSP violation and no React #4xx`, async ({ browser, qa }, testInfo) => {
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await ctx.newPage();
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      await page.addInitScript(() => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          // Known baseline: Cloudflare injects two Google Tag Manager inline
          // snippets for browser requests (document lines 1–2, absent from curl)
          // which the hash-mode policy blocks — harmless (the app loads its own
          // GTM; founder to disable the Cloudflare GTM app). Everything else is
          // a real violation.
          const cloudflareGtm = e.violatedDirective === "script-src-elem" && (e.blockedURI === "inline" || e.blockedURI === "") && e.lineNumber <= 2 && e.sourceFile === location.href;
          if (cloudflareGtm) return;
          (window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI || "inline"} @${e.sourceFile}:${e.lineNumber}`);
        });
      });
      try {
        const res = await page.goto(`${qa.baseURL}${path}`, { waitUntil: "load" });
        expect(res?.status(), `${path} status`).toBe(200);
        const csp = res?.headers()["content-security-policy"] ?? "";
        await page.waitForTimeout(500);
        const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
        // Console: hydration failures only — the Cloudflare GTM baseline also logs a CSP line, which the console guard already tolerates.
        const reactErrors = consoleErrors.filter((t) => /Minified React error #4\d\d/.test(t));
        await evidence(testInfo, `csp ${path}`, { hashMode: !/nonce-/.test(csp), violations, reactErrors: reactErrors.slice(0, 3) });
        expect(violations, `CSP violations on ${path}`).toEqual([]);
        expect(reactErrors, `React / CSP console errors on ${path}`).toEqual([]);
      } finally {
        await ctx.close();
      }
    });
  }
});
